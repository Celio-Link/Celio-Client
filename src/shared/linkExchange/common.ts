export type UInt16 = number & { __uint16: true };
export type DataArray = [
  UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16,
  UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16,
  UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16,
  UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16, UInt16
];

export enum LinkStatus {
  AwaitModeEmulator = 0xFF01,
  AwaitMode = 0xFF02,
  HandshakeReceived = 0xFF03,
  HandshakeFinished = 0xFF04,
  LinkConnected = 0xFF05,
  LinkReconnecting = 0xFF06,
  LinkClosed = 0xFF07,

  DeviceReady = 0xFF08,
  EmuTradeSessionFinished = 0xFF09,
  EmuSessionStarted = 0xFF0A,

  StatusDebug = 0xFFFF
}

export enum CommandType {
  SetMode = 0x00,
  Cancel = 0x01,
  GetFirmwareInfo = 0x0F,
  SetModeMaster = 0x10,
  SetModeSlave = 0x11,
  StartHandshake= 0x12,
  ConnectLink = 0x13,

  EmuSessionStart = 0xFF0A
}

export interface FirmwareVersion {
  major: number;
  minor: number;
  patch: number;
}

export enum LinkMode {
  tradeEmu = 0x00,
  onlineLink = 0x01,
  advanceWars = 0x04
}

export interface CommandPacket {
  uuid: string;
  command: CommandType;
}

export interface StatusPacket {
  uuid: string;
  linkStatus: LinkStatus;
}

export class DataPacket {
  public sequence: number;
  public data: DataArray;

  constructor(sequence: number, data: DataArray) {
    this.sequence = sequence;
    this.data = data;
  }

  private dataToString(): string {
    let out = "";
    for (let i = 0; i < this.data.length; i++) {
      if (i) out += " ";
      if (i % 8 == 0) out += "\n";
      out += "0x" + (this.data[i] & 0xffff).toString(16).padStart(4, "0").toUpperCase();
    }
    return out;
  }

  toString(): string {
    return "Sequence = " + this.sequence + this.dataToString();
  }
}
