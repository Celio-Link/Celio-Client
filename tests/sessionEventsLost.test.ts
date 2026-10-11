import { test, expect } from "vitest";
import { PlayerSessionService } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";
import { LinkStatus } from '../src/shared/linkExchange/common';
import { firstValueFrom, timeout } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Loses the first event with the given name, like an event emitted into a dead connection.
 */
class EventLosingWebSocketService extends WebSocketService {

  constructor(lostEvent: string) {
    super();
    const socket: any = this.socket;
    const onevent = socket.onevent.bind(socket);
    let eventLost = false;
    socket.onevent = (packet: any) => {
      if (!eventLost && packet.data[0] === lostEvent) {
        eventLost = true;
        console.warn("Losing event: " + lostEvent);
        return;
      }
      onevent(packet);
    };
  }
}

test("Lost partnerJoined is delivered again", async () => {
  const websocketService = new EventLosingWebSocketService("partnerJoined");
  const playerSessionService = new PlayerSessionService(websocketService);
  await websocketService.connect();
  const sessionInfo = await playerSessionService.enterSession();
  const partnerJoined = firstValueFrom(playerSessionService.partnerEvents$.pipe(timeout(4000)));

  const websocketServiceJoin = new WebSocketService();
  const playerSessionServiceJoin = new PlayerSessionService(websocketServiceJoin);
  await websocketServiceJoin.connect();
  await playerSessionServiceJoin.enterSession(sessionInfo.id);

  expect(await partnerJoined).toEqual(true);
});

test("Lost sessionClose is delivered again", async () => {
  const websocketService = new EventLosingWebSocketService("sessionClose");
  const playerSessionService = new PlayerSessionService(websocketService);
  await websocketService.connect();
  const sessionInfo = await playerSessionService.enterSession();
  const sessionClosed = firstValueFrom(playerSessionService.sessionClose$.pipe(timeout(4000)));

  const websocketServiceJoin = new WebSocketService();
  const playerSessionServiceJoin = new PlayerSessionService(websocketServiceJoin);
  await websocketServiceJoin.connect();
  await playerSessionServiceJoin.enterSession(sessionInfo.id);

  // A status starts the session, so leaving now closes it for both
  await websocketServiceJoin.emitWithRetry('deviceStatus', {uuid: uuidv4(), linkStatus: LinkStatus.AwaitMode});
  playerSessionServiceJoin.leaveSession();

  await sessionClosed;
});
