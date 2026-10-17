export type UInt8 = number & { __uint8: true };
export type DataArray = [
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
  UInt8, UInt8, UInt8
];

export const DATA_ARRAY_LENGTH = 51;

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
  PlayerSettings = 0x10,
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

export abstract class Command {
  abstract readonly type: CommandType;

  abstract serialize(): Uint8Array<ArrayBuffer>;

  /**
   * Create a command the server sent, the args are the plain object received from the server.
   * @param type
   * @param args
   * @returns The command, or undefined if the server can't send this type.
   */
  static fromServer(type: CommandType, args: any): Command | undefined {
    switch (type) {
      case CommandType.PlayerSettings:
        return new PlayerSettingsCommand(args.playerCount, args.playerIndex);
      case CommandType.StartHandshake:
        return new StartHandshakeCommand();
      case CommandType.ConnectLink:
        return new ConnectLinkCommand();
      default:
        return undefined;
    }
  }
}

export class CancelCommand extends Command {
  readonly type = CommandType.Cancel;

  serialize(): Uint8Array<ArrayBuffer> {
    return Uint8Array.of(this.type);
  }
}

export class SetModeCommand extends Command {
  readonly type = CommandType.SetMode;

  constructor(public readonly mode: LinkMode, public readonly variant?: number) {
    super();
  }

  serialize(): Uint8Array<ArrayBuffer> {
    if (this.variant === undefined) return Uint8Array.of(this.type, this.mode);
    return Uint8Array.of(this.type, this.mode, this.variant);
  }
}

export class GetFirmwareInfoCommand extends Command {
  readonly type = CommandType.GetFirmwareInfo;

  serialize(): Uint8Array<ArrayBuffer> {
    return Uint8Array.of(this.type);
  }
}

export class PlayerSettingsCommand extends Command {
  readonly type = CommandType.PlayerSettings;

  /**
   * @param playerCount - Number of players in the session.
   * @param playerIndex - Number of players that sent AwaitMode before this player, so it knows its place.
   */
  constructor(public readonly playerCount: number, public readonly playerIndex: number) {
    super();
  }

  serialize(): Uint8Array<ArrayBuffer> {
    return Uint8Array.of(this.type, this.playerCount, this.playerIndex);
  }
}

export class StartHandshakeCommand extends Command {
  readonly type = CommandType.StartHandshake;

  serialize(): Uint8Array<ArrayBuffer> {
    return Uint8Array.of(this.type);
  }
}

export class ConnectLinkCommand extends Command {
  readonly type = CommandType.ConnectLink;

  serialize(): Uint8Array<ArrayBuffer> {
    return Uint8Array.of(this.type);
  }
}

export interface CommandPacket {
  uuid: string;
  command: Command;
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
      out += "0x" + (this.data[i] & 0xff).toString(16).padStart(2, "0").toUpperCase();
    }
    return out;
  }

  toString(): string {
    return "Sequence = " + this.sequence + this.dataToString();
  }
}
