import { test, expect, vi } from "vitest";
import { firstValueFrom, timeout } from 'rxjs';
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkExchangeSession } from '../src/shared/linkExchange/linkExchangeSession';
import { CommandEmitterSocketIO } from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';
import { StatusEmitterLinkDevice } from '../src/shared/linkExchange/statusEmitter/statusEmitter.linkDevice';
import { CommandType, DataArray, LinkDeviceServiceMock } from "./mocks/service/linkdevice.service.mock";
import { CelioDeviceMock } from './mocks/celioDeviceMock';

const PLAYER_COUNT = 4;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectPlayer() {
  const websocketService = new WebSocketService();
  const playerSessionService = new PlayerSessionService(websocketService);
  await websocketService.connect();
  return { websocketService, playerSessionService };
}

/**
 * Connect a player for each device, fill a session with them and connect the devices.
 * Data a device receives is handed to its own mock, the receive callback gets it.
 */
async function startLinkedSession(celioDevices: CelioDeviceMock[]) {
  const players = [];
  for (const celioDevice of celioDevices) {
    const player = await connectPlayer();
    const linkDeviceServiceMock = new LinkDeviceServiceMock(celioDevice, celioDevice);
    new LinkExchangeSession(new CommandEmitterSocketIO(player.websocketService), new StatusEmitterLinkDevice(linkDeviceServiceMock as any));
    players.push({ ...player, linkDeviceServiceMock });
  }

  const sessionInfo = await players[0].playerSessionService.createSession(celioDevices.length);
  for (let i = 1; i < players.length; i++) {
    await players[i].playerSessionService.enterSession(sessionInfo.id);
  }

  for (const player of players) await player.linkDeviceServiceMock.connectDevice();
  return players;
}

test("Four players fill a session", async () => {
  const players = [];
  for (let i = 0; i < PLAYER_COUNT; i++) players.push(await connectPlayer());

  // Every player gets partyReady once the session is full
  const partyReady = players.map(player =>
    firstValueFrom(player.playerSessionService.partnerEvents$.pipe(timeout(4000))));

  const sessionInfo = await players[0].playerSessionService.createSession(PLAYER_COUNT);
  expect(sessionInfo.full).toEqual(false);

  for (let i = 1; i < PLAYER_COUNT; i++) {
    const joinInfo = await players[i].playerSessionService.enterSession(sessionInfo.id);
    expect(joinInfo.full).toEqual(i === PLAYER_COUNT - 1);
  }

  expect(await Promise.all(partyReady)).toEqual(new Array(PLAYER_COUNT).fill(true));

  const fifthPlayer = await connectPlayer();
  await expect(fifthPlayer.playerSessionService.enterSession(sessionInfo.id)).rejects.toEqual("Session is full");
});

test("Four players get player settings and connect the link", async () => {
  // No data is emitted, this test only covers the commands
  const celioDevices = Array.from({ length: PLAYER_COUNT }, () => new CelioDeviceMock(() => {}, 0));

  const players = await startLinkedSession(celioDevices);

  // Only the player that reports LinkConnected first doesn't need ConnectLink
  const connectLinkCount = () => players
    .filter(player => player.linkDeviceServiceMock.receivedCommands.includes(CommandType.ConnectLink)).length;
  await vi.waitFor(() => expect(connectLinkCount()).toEqual(PLAYER_COUNT - 1), { timeout: 15000, interval: 200 });

  // Give the server time to send commands that should not come
  await delay(1500);

  const receivedCommands = players.map(player => player.linkDeviceServiceMock.receivedCommands);
  const withoutConnectLink = receivedCommands.filter(commands => !commands.includes(CommandType.ConnectLink));
  const withConnectLink = receivedCommands.filter(commands => commands.includes(CommandType.ConnectLink));
  expect(withoutConnectLink).toEqual([[CommandType.PlayerSettings, CommandType.StartHandshake]]);
  withConnectLink.forEach(commands =>
    expect(commands).toEqual([CommandType.PlayerSettings, CommandType.StartHandshake, CommandType.ConnectLink]));
  celioDevices.forEach(celioDevice => expect(celioDevice.playerCount).toEqual(PLAYER_COUNT));
  const playerIndices = celioDevices.map(celioDevice => celioDevice.playerIndex).sort();
  expect(playerIndices).toEqual([0, 1, 2, 3]);
}, 30000);

test("Four players exchange data", async () => {
  const numberOfEmits = 10;

  // Data each device received, the all-zero sentinels are already dropped by the mock
  const receivedData: DataArray[][] = Array.from({ length: PLAYER_COUNT }, () => []);
  const celioDevices = Array.from({ length: PLAYER_COUNT }, (_, device) =>
    new CelioDeviceMock((received: DataArray) => receivedData[device].push(received), numberOfEmits));

  await startLinkedSession(celioDevices);

  // Every device gets the data of all other devices
  const expectedCount = (PLAYER_COUNT - 1) * numberOfEmits;
  await vi.waitFor(() => {
    receivedData.forEach(received => expect(received.length).toEqual(expectedCount));
  }, { timeout: 30000, interval: 200 });

  // Give the server time to send data that should not come
  await delay(1500);

  // Data without the sentinel, by sender
  const sentData = celioDevices.map(celioDevice => celioDevice.data.slice(0, -1));
  const senderOf = new Map<string, number>();
  sentData.forEach((data, sender) => data.forEach(dataArray => senderOf.set(JSON.stringify(dataArray), sender)));

  receivedData.forEach((received, receiver) => {
    for (let sender = 0; sender < PLAYER_COUNT; sender++) {
      const fromSender = received.filter(dataArray => senderOf.get(JSON.stringify(dataArray)) === sender);
      // All data of every other device, in the order it was sent. Nothing comes back to the sender.
      expect(fromSender).toEqual(sender === receiver ? [] : sentData[sender]);
    }
  });
}, 60000);
