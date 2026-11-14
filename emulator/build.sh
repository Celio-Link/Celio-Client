#!/bin/bash
# Builds public/emulator/mgba-gba.js + mgba-gba.wasm: mGBA's Game Boy Advance core
# (single-threaded, no optional libraries) and gba_emu.c. Needs podman; the mGBA
# source and the build tree live in $CACHE (default ~/.cache/gblink-emu).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(cd "$HERE/../public/emulator" && pwd)
CACHE=${CACHE:-$HOME/.cache/gblink-emu}
MGBA_TAG=0.10.5
MGBA_COMMIT=26b7884bc25a5933960f3cdcd98bac1ae14d42e2
EMSDK_IMAGE=docker.io/emscripten/emsdk:6.0.12

mkdir -p "$CACHE"
SRC="$CACHE/mgba-$MGBA_TAG"
[ -d "$SRC" ] || git clone --depth 1 --branch "$MGBA_TAG" https://github.com/mgba-emu/mgba.git "$SRC"
[ "$(git -C "$SRC" rev-parse HEAD)" = "$MGBA_COMMIT" ] || { echo "unexpected mGBA commit in $SRC" >&2; exit 1; }

podman run --rm --userns=keep-id -v "$CACHE:/work:Z" -v "$HERE:/src:Z" -v "$OUT:/out:Z" "$EMSDK_IMAGE" bash -euc "
cd /work && mkdir -p build-gba-$MGBA_TAG && cd build-gba-$MGBA_TAG
if [ ! -f Makefile ]; then
    emcmake cmake ../mgba-$MGBA_TAG -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS=-D_GNU_SOURCE \
        -DLIBMGBA_ONLY=ON -DBUILD_STATIC=ON -DBUILD_SHARED=OFF -DM_CORE_GB=OFF -DM_CORE_GBA=ON \
        -DHAVE_PTHREAD_H=OFF -DUSE_ZLIB=OFF -DUSE_PNG=OFF -DUSE_LIBZIP=OFF -DUSE_MINIZIP=OFF \
        -DUSE_SQLITE3=OFF -DUSE_ELF=OFF -DUSE_LZMA=OFF -DUSE_FFMPEG=OFF -DUSE_EPOXY=OFF -DUSE_LUA=OFF \
        -DENABLE_SCRIPTING=OFF -DUSE_DEBUGGERS=OFF -DUSE_GDB_STUB=OFF -DUSE_DISCORD_RPC=OFF \
        -DUSE_EDITLINE=OFF -DBUILD_GL=OFF -DBUILD_GLES2=OFF -DBUILD_GLES3=OFF > cmake.log
fi
make -j\$(nproc) mgba > make.log
DEFS=\$(sed -n 's/^C_DEFINES = //p' CMakeFiles/mgba.dir/flags.make)
emcc -O3 -D_GNU_SOURCE \$DEFS -I../mgba-$MGBA_TAG/include -Iinclude /src/gba_emu.c libmgba.a \
    -o /out/mgba-gba.js \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createGbaEmu -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP16,HEAPU16,HEAPU32
"
cp "$HERE/LICENSE-mGBA.txt" "$OUT/LICENSE-mGBA.txt"
ls -l "$OUT/mgba-gba.js" "$OUT/mgba-gba.wasm"
