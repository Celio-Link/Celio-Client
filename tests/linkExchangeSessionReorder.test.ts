import { test, expect } from "vitest";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { CommandEmitterAbstract } from '../src/shared/linkExchange/commandEmitter/commandEmitter.abstract';
import { StatusEmitterAbstract } from '../src/shared/linkExchange/statusEmitter/statusEmitter.abstract';
import { CommandType, DataArray, DataPacket, StatusPacket, UInt16 } from '../src/shared/linkExchange/common';

class FakeCommandEmitter extends CommandEmitterAbstract {
  deliver(sequence: number) {
    this.dataSubject.next(new DataPacket(sequence, new Array(32).fill(sequence) as DataArray));
  }
  receiveData(data: DataPacket): void {}
  receiveStatus(status: StatusPacket): void {}
  destroy(): void {}
}

class FakeStatusEmitter extends StatusEmitterAbstract {
  public deviceData: number[] = [];
  receiveData(data: DataArray): Promise<boolean> {
    this.deviceData.push(data[0] as UInt16);
    return Promise.resolve(true);
  }
  receiveCommand(command: CommandType, args: Uint8Array): Promise<boolean> {
    return Promise.resolve(true);
  }
  destroy(): void {}
}

function deliverToDevice(sequences: number[]): number[] {
  const commandEmitter = new FakeCommandEmitter();
  const statusEmitter = new FakeStatusEmitter();
  new LinkExchangeSession(commandEmitter, statusEmitter);
  sequences.forEach(sequence => commandEmitter.deliver(sequence));
  return statusEmitter.deviceData;
}

test("Delivers packets in order", () => {
  expect(deliverToDevice([0, 1, 2, 3])).toEqual([0, 1, 2, 3]);
});

test("Delivers buffered packets once the missing packet arrives", () => {
  expect(deliverToDevice([0, 2, 3, 1])).toEqual([0, 1, 2, 3]);
});

test("Delivers packets that arrive in reverse order", () => {
  expect(deliverToDevice([3, 2, 1, 0])).toEqual([0, 1, 2, 3]);
});

test("Waits for a missing packet", () => {
  expect(deliverToDevice([0, 2, 3])).toEqual([0]);
});

test("Discards duplicates, also of buffered packets", () => {
  expect(deliverToDevice([0, 0, 2, 2, 1, 1, 3])).toEqual([0, 1, 2, 3]);
});
