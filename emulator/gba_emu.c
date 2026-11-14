/* Game Boy Advance emulator for the Celio client: mGBA's GBA core, run by cycle
 * count from JavaScript so it keeps pace with real time.
 *
 * The link port stands in for a GB-Link adapter in GBA online mode, which keeps
 * the game in a multiplayer (MULTI) link with the other players. As in the
 * adapter, the game is either the parent (seat 0, it clocks every transfer and
 * the link fills in the other players' words) or a child (the link clocks the
 * transfers as the parent and the game sends in its own slot). Every finished
 * transfer is handed to JavaScript (Module.onLinkTransfer), which stages the
 * words of the next one and, for a child, when it starts. */
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>

#include <mgba/core/blip_buf.h>
#include <mgba/core/core.h>
#include <mgba/core/log.h>
#include <mgba/core/timing.h>
#include <mgba/gba/core.h>
#include <mgba/internal/arm/arm.h>
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/io.h>
#include <mgba/internal/gba/sio.h>
#include <mgba-util/vfs.h>

#define VIDEO_WIDTH 240
#define VIDEO_HEIGHT 160
#define AUDIO_BUFFER_SAMPLES 4096
#define MAX_PLAYERS 4
#define BAUD_115200 3
/* The adapter waits 1 ms for a child that does not answer, then reads the idle line */
#define NO_REPLY_CYCLES 16777
/* After a reset the link clocks again this much later */
#define RESET_CLOCK_CYCLES 16777

enum LinkRole {
	LINK_NONE = 0,   /* no link: the game sees SD low (not every player is ready) and nobody clocks */
	LINK_PARENT = 1, /* the game is the parent and clocks; the link answers in the other slots */
	LINK_CHILD = 2,  /* the game is a child; the link clocks as the parent */
};

enum LinkPhase {
	PHASE_IDLE = 0,
	PHASE_START,  /* LINK_CHILD: a transfer starts when the event fires */
	PHASE_FINISH, /* a transfer finishes when the event fires */
};

static struct mCore* core = NULL;
static void* romData = NULL;
static size_t romLength = 0;
/* What the core draws into, and the last finished frame as shown */
static color_t videoBuffer[VIDEO_WIDTH * VIDEO_HEIGHT];
static color_t displayBuffer[VIDEO_WIDTH * VIDEO_HEIGHT];
static int framesDone = 0;
static int16_t audioOut[AUDIO_BUFFER_SAMPLES * 2];
static int audioRate = 48000;
static void* saveCopy = NULL;
static size_t saveCopySize = 0;

static struct {
	struct GBASIODriver d;
	struct mTimingEvent event;
	int role;
	int seat;      /* the game's slot */
	int players;
	int phase;
	int baud;      /* of the transfer under way */
	bool answered; /* the game took part in the transfer under way */
	uint16_t rx;   /* the game's word in it */
	int id;        /* multiplayer id the game reads, set by its first transfer */
	uint16_t next[MAX_PLAYERS]; /* the other players' words for the next transfer, by slot */
	int transfers;
} port;

EM_JS(void, js_link_transfer, (int rx), {
	if (Module.onLinkTransfer) Module.onLinkTransfer(rx);
});

static void _noLog(struct mLogger* logger, int category, enum mLogLevel level, const char* format, va_list args) {
	(void) logger; (void) category; (void) level; (void) format; (void) args;
}
static struct mLogger quietLogger = { .log = _noLog };

static struct GBA* _gba(void) {
	return core ? (struct GBA*) core->board : NULL;
}

static void _frameEnded(void* context) {
	(void) context;
	for (int i = 0; i < VIDEO_WIDTH * VIDEO_HEIGHT; ++i) {
		displayBuffer[i] = videoBuffer[i] | 0xFF000000;
	}
	++framesDone;
}

// ==================== Link ====================

static bool _linkActive(struct GBA* gba) {
	return gba->sio.mode == SIO_MULTI && gba->sio.activeDriver == &port.d;
}

/* SIOCNT bits 2-7 as the game reads them in MULTI mode: SI, SD, id, error, busy. */
static uint16_t _linkStatusBits(void) {
	uint16_t bits = 0;
	/* SD high: every player ready. Without a link it stays low, so a game that picks its role once
	 * (Advance Wars, when its link screen opens) waits until the link gives it one. */
	if (port.role != LINK_NONE) {
		bits |= 0x0008;
	}
	if (port.role != LINK_PARENT) {
		bits |= 0x0004; /* SI high: a child */
	}
	bits |= (port.id & 3) << 4;
	if (port.phase == PHASE_FINISH && port.answered) {
		bits |= 0x0080;
	}
	return bits;
}

static void _linkSyncRegisters(void) {
	struct GBA* gba = _gba();
	if (!gba || !_linkActive(gba)) {
		return;
	}
	gba->sio.siocnt = (gba->sio.siocnt & ~0x00FC) | _linkStatusBits();
	if (port.role == LINK_PARENT) {
		gba->sio.rcnt &= ~4;
	} else {
		gba->sio.rcnt |= 4;
	}
}

static int _transferCycles(int baud) {
	return GBASIOCyclesPerTransfer[baud & 3][port.players - 1];
}

/* The game's own transfer as the parent, or the link's as the parent of a child game. */
static void _linkBegin(struct GBA* gba, int baud) {
	port.answered = _linkActive(gba);
	port.baud = baud;
	port.rx = 0xFFFF;
	if (port.answered) {
		port.rx = gba->memory.io[REG_SIOMLT_SEND >> 1];
		for (int i = 0; i < MAX_PLAYERS; ++i) {
			gba->memory.io[(REG_SIOMULTI0 >> 1) + i] = 0xFFFF;
		}
		gba->sio.rcnt &= ~1;
	}
	port.phase = PHASE_FINISH;
	_linkSyncRegisters();
	mTimingDeschedule(&gba->timing, &port.event);
	mTimingSchedule(&gba->timing, &port.event, _transferCycles(baud) + (port.answered ? 0 : NO_REPLY_CYCLES));
}

static void _linkFinish(struct GBA* gba, uint32_t cyclesLate) {
	bool deliver = port.answered && _linkActive(gba);
	/* A child sends in its own slot, later than the parent, so its serial interrupt for the last
	 * transfer may still set the word after this one started. */
	if (deliver && port.role == LINK_CHILD) {
		port.rx = gba->memory.io[REG_SIOMLT_SEND >> 1];
	}
	uint16_t rx = port.answered ? port.rx : 0xFFFF;
	port.phase = PHASE_IDLE;
	++port.transfers;
	if (deliver) {
		for (int i = 0; i < MAX_PLAYERS; ++i) {
			uint16_t word = i < port.players ? port.next[i] : 0xFFFF;
			gba->memory.io[(REG_SIOMULTI0 >> 1) + i] = i == port.seat ? rx : word;
		}
		port.id = port.seat;
		gba->sio.rcnt |= 1;
		_linkSyncRegisters();
		if (GBASIOMultiplayerIsIrq(gba->sio.siocnt)) {
			GBARaiseIRQ(gba, GBA_IRQ_SIO, cyclesLate);
		}
	}
	for (int i = 0; i < MAX_PLAYERS; ++i) {
		port.next[i] = 0xFFFF;
	}
	js_link_transfer(rx);
}

static void _linkEvent(struct mTiming* timing, void* context, uint32_t cyclesLate) {
	(void) timing;
	(void) context;
	struct GBA* gba = _gba();
	if (!gba) {
		return;
	}
	if (port.phase == PHASE_START) {
		_linkBegin(gba, BAUD_115200);
	} else if (port.phase == PHASE_FINISH) {
		_linkFinish(gba, cyclesLate);
	}
}

static bool _linkLoad(struct GBASIODriver* driver) {
	(void) driver;
	_linkSyncRegisters();
	return true;
}

static uint16_t _linkWriteRegister(struct GBASIODriver* driver, uint32_t address, uint16_t value) {
	(void) driver;
	struct GBA* gba = _gba();
	if (address != REG_SIOCNT || !gba) {
		return value;
	}
	if (port.role == LINK_PARENT && (value & 0x0080) && port.phase == PHASE_IDLE) {
		_linkBegin(gba, GBASIOMultiplayerGetBaud(value));
	}
	return (value & 0xFF03) | _linkStatusBits();
}

static void _linkStop(void) {
	struct GBA* gba = _gba();
	if (gba) {
		mTimingDeschedule(&gba->timing, &port.event);
	}
	port.phase = PHASE_IDLE;
	port.answered = false;
}

static void _linkInstall(void) {
	memset(&port.d, 0, sizeof(port.d));
	port.d.load = _linkLoad;
	port.d.writeRegister = _linkWriteRegister;
	port.event.context = NULL;
	port.event.name = "Celio link";
	port.event.callback = _linkEvent;
	port.event.priority = 0x80;
	GBASIOSetDriver(&_gba()->sio, &port.d, SIO_MULTI);
}

/* role: enum LinkRole. seat: the game's slot as a child (1-3). players: 2-4.
 * Stops a transfer under way; the words for the next one start out as 0xFFFF. */
EMSCRIPTEN_KEEPALIVE void emu_link_config(int role, int seat, int players) {
	_linkStop();
	port.role = role == LINK_PARENT || role == LINK_CHILD ? role : LINK_NONE;
	port.players = players < 2 ? 2 : players > MAX_PLAYERS ? MAX_PLAYERS : players;
	port.seat = port.role == LINK_CHILD && seat > 0 && seat < port.players ? seat : 0;
	port.id = 0;
	for (int i = 0; i < MAX_PLAYERS; ++i) {
		port.next[i] = 0xFFFF;
	}
	_linkSyncRegisters();
}

/* The other players' words for the next transfer, by slot; the game's own slot is ignored. */
EMSCRIPTEN_KEEPALIVE void emu_link_stage(int slot0, int slot1, int slot2, int slot3) {
	port.next[0] = (uint16_t) slot0;
	port.next[1] = (uint16_t) slot1;
	port.next[2] = (uint16_t) slot2;
	port.next[3] = (uint16_t) slot3;
}

/* LINK_CHILD: the next transfer starts this many cycles from now. */
EMSCRIPTEN_KEEPALIVE void emu_link_clock(int cycles) {
	struct GBA* gba = _gba();
	if (!gba || port.role != LINK_CHILD || port.phase == PHASE_FINISH) {
		return;
	}
	port.phase = PHASE_START;
	mTimingDeschedule(&gba->timing, &port.event);
	mTimingSchedule(&gba->timing, &port.event, cycles > 0 ? cycles : 0);
}

/* Transfers finished since the game was loaded. */
EMSCRIPTEN_KEEPALIVE int emu_link_transfers(void) {
	return port.transfers;
}

// ==================== Game ====================

EMSCRIPTEN_KEEPALIVE void emu_set_sample_rate(int rate) {
	audioRate = rate > 0 ? rate : 48000;
	if (core) {
		blip_set_rates(core->getAudioChannel(core, 0), core->frequency(core), audioRate);
		blip_set_rates(core->getAudioChannel(core, 1), core->frequency(core), audioRate);
	}
}

EMSCRIPTEN_KEEPALIVE void emu_unload(void) {
	if (!core) {
		return;
	}
	_linkStop();
	core->unloadROM(core);
	mCoreConfigDeinit(&core->config);
	core->deinit(core);
	core = NULL;
	free(romData);
	romData = NULL;
	romLength = 0;
}

EMSCRIPTEN_KEEPALIVE void* emu_alloc(size_t size) {
	return malloc(size);
}

EMSCRIPTEN_KEEPALIVE void emu_free(void* ptr) {
	free(ptr);
}

/* Takes ownership of rom (from emu_alloc); save may be NULL. The save buffer is
 * copied. Returns 0 on success. The link starts out with no role. */
EMSCRIPTEN_KEEPALIVE int emu_load(void* rom, size_t romSize, const void* save, size_t saveSize) {
	emu_unload();
	mLogSetDefaultLogger(&quietLogger);
	romData = rom;
	romLength = romSize;
	struct VFile* vf = VFileFromMemory(romData, romSize);
	if (!vf) {
		free(romData);
		romData = NULL;
		return 1;
	}
	core = GBACoreCreate();
	if (!core || !core->isROM(vf)) {
		vf->close(vf);
		free(core);
		core = NULL;
		free(romData);
		romData = NULL;
		return 2;
	}
	mCoreInitConfig(core, NULL);
	core->init(core);
	mCoreConfigSetDefaultValue(&core->config, "idleOptimization", "ignore");
	mCoreConfigSetDefaultIntValue(&core->config, "useBios", 0);
	mCoreConfigSetDefaultIntValue(&core->config, "volume", 0x100);
	mCoreLoadConfig(core);
	core->setVideoBuffer(core, videoBuffer, VIDEO_WIDTH);
	core->setAudioBufferSize(core, AUDIO_BUFFER_SAMPLES);
	if (!core->loadROM(core, vf)) {
		mCoreConfigDeinit(&core->config);
		core->deinit(core);
		core = NULL;
		free(romData);
		romData = NULL;
		return 3;
	}
	struct VFile* sv = VFileMemChunk(save, save ? saveSize : 0);
	core->loadSave(core, sv);
	emu_set_sample_rate(audioRate);
	core->addCoreCallbacks(core, &(struct mCoreCallbacks) { .videoFrameEnded = _frameEnded });

	memset(&port, 0, sizeof(port));
	_linkInstall();
	emu_link_config(LINK_NONE, 0, 2);

	core->reset(core);
	framesDone = 0;
	memset(displayBuffer, 0, sizeof(displayBuffer));
	return 0;
}

/* Power-cycles the game; the battery save and the link role are kept. */
EMSCRIPTEN_KEEPALIVE void emu_reset(void) {
	if (!core) {
		return;
	}
	core->reset(core);
	port.phase = PHASE_IDLE;
	port.answered = false;
	port.id = 0;
	if (port.role == LINK_CHILD) {
		emu_link_clock(RESET_CLOCK_CYCLES);
	}
}

/* GBA keys: A 1, B 2, Select 4, Start 8, Right 16, Left 32, Up 64, Down 128, R 256, L 512. */
EMSCRIPTEN_KEEPALIVE void emu_set_keys(int keys) {
	if (core) {
		core->setKeys(core, (uint32_t) keys);
	}
}

/* Runs the game for at least the given number of cycles (16777216 a second);
 * returns how many it ran. */
EMSCRIPTEN_KEEPALIVE int emu_run(int cycles) {
	struct GBA* gba = _gba();
	if (!gba || cycles <= 0) {
		return 0;
	}
	uint32_t start = (uint32_t) mTimingCurrentTime(&gba->timing);
	uint32_t ran = 0;
	while (ran < (uint32_t) cycles) {
		core->runLoop(core);
		ran = (uint32_t) mTimingCurrentTime(&gba->timing) - start;
	}
	return (int) ran;
}

/* Frames finished since the game was loaded. */
EMSCRIPTEN_KEEPALIVE int emu_frames(void) {
	return framesDone;
}

/* The last finished frame, 240x160 RGBA. */
EMSCRIPTEN_KEEPALIVE color_t* emu_video(void) {
	return displayBuffer;
}

/* Interleaved stereo samples; returns the number of sample frames written. */
EMSCRIPTEN_KEEPALIVE int emu_audio(void) {
	if (!core) {
		return 0;
	}
	blip_t* left = core->getAudioChannel(core, 0);
	blip_t* right = core->getAudioChannel(core, 1);
	int avail = blip_samples_avail(left);
	if (avail > AUDIO_BUFFER_SAMPLES) {
		avail = AUDIO_BUFFER_SAMPLES;
	}
	int produced = blip_read_samples(left, audioOut, avail, true);
	blip_read_samples(right, audioOut + 1, avail, true);
	return produced;
}

EMSCRIPTEN_KEEPALIVE int16_t* emu_audio_buffer(void) {
	return audioOut;
}

/* Copies the battery save (the cartridge's flash, without the clock); read it
 * from emu_save_data(). */
EMSCRIPTEN_KEEPALIVE int emu_save_size(void) {
	free(saveCopy);
	saveCopy = NULL;
	saveCopySize = 0;
	if (!core) {
		return 0;
	}
	saveCopySize = core->savedataClone(core, &saveCopy);
	return (int) saveCopySize;
}

EMSCRIPTEN_KEEPALIVE void* emu_save_data(void) {
	return saveCopy;
}

/* Memory as the game sees it, without side effects; -1 with no game. */
EMSCRIPTEN_KEEPALIVE int emu_read8(int address) {
	return core ? (int) core->rawRead8(core, (uint32_t) address, -1) : -1;
}

EMSCRIPTEN_KEEPALIVE int emu_read16(int address) {
	return core ? (int) core->rawRead16(core, (uint32_t) address, -1) : -1;
}

EMSCRIPTEN_KEEPALIVE int emu_read32(int address) {
	return core ? (int) core->rawRead32(core, (uint32_t) address, -1) : 0;
}

EMSCRIPTEN_KEEPALIVE void emu_write8(int address, int value) {
	if (core) {
		core->rawWrite8(core, (uint32_t) address, -1, (uint8_t) value);
	}
}

EMSCRIPTEN_KEEPALIVE void emu_write16(int address, int value) {
	if (core) {
		core->rawWrite16(core, (uint32_t) address, -1, (uint16_t) value);
	}
}

EMSCRIPTEN_KEEPALIVE void emu_write32(int address, int value) {
	if (core) {
		core->rawWrite32(core, (uint32_t) address, -1, (uint32_t) value);
	}
}

EMSCRIPTEN_KEEPALIVE int emu_cpu_pc(void) {
	return core ? ((struct ARMCore*) core->cpu)->gprs[ARM_PC] : -1;
}
