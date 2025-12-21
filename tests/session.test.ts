import { test, expect } from "vitest";
import { PlayerSessionService, ErrorType } from "../src/services/playersession.service.js";
import { WebSocketService } from "../src/services/websocket.service.js";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test("Create Session", async () => {

  const websocketService = new WebSocketService();
  const playerSessionService = new PlayerSessionService(websocketService);

  websocketService.connect();

  let sessionInfo = await playerSessionService.createSession()

  expect(sessionInfo.full).toEqual(false);
});

test("Join Session", async () => {

  const websocketService = new WebSocketService();
  const playerSessionService = new PlayerSessionService(websocketService);
  websocketService.connect();
  let sessionInfo = await playerSessionService.createSession();

  expect(sessionInfo.full).toEqual(false);

  const websocketServiceJoin = new WebSocketService();
  const playerSessionServiceJoin = new PlayerSessionService(websocketServiceJoin);
  websocketServiceJoin.connect();
  sessionInfo = await playerSessionServiceJoin.joinSession(sessionInfo.id);

  expect(sessionInfo.full).toEqual(true);
});

test("Partner Join Event", () => new Promise<void>(async done => {

  const events: boolean[] = [];

  const websocketService = new WebSocketService();
  const playerSessionService = new PlayerSessionService(websocketService);
  websocketService.connect();
  let sessionInfo = await playerSessionService.createSession();

  playerSessionService.partnerEvents$.subscribe(partnerConnected => {
    events.push(partnerConnected);
    if (events.length == 1) {
      expect(events).toEqual([true]);
      done();
    }
  })

  expect(sessionInfo.full).toEqual(false);

  const websocketServiceJoin = new WebSocketService();
  const playerSessionServiceJoin = new PlayerSessionService(websocketServiceJoin);
  websocketServiceJoin.connect();
  sessionInfo = await playerSessionServiceJoin.joinSession(sessionInfo.id);

  expect(sessionInfo.full).toEqual(true);
}));

test("Partner Leave Event", () => new Promise<void>(async done => {

  const events: boolean[] = [];

  const websocketService = new WebSocketService();
  const playerSessionService = new PlayerSessionService(websocketService);
  websocketService.connect();
  let sessionInfo = await playerSessionService.createSession();

  playerSessionService.partnerEvents$.subscribe(partnerConnected => {
    events.push(partnerConnected);
    if (events.length == 2) {
      expect(events).toEqual([true, false]);
      done();
    }
  })

  expect(sessionInfo.full).toEqual(false);

  const websocketServiceJoin = new WebSocketService();
  const playerSessionServiceJoin = new PlayerSessionService(websocketServiceJoin);
  websocketServiceJoin.connect();
  sessionInfo = await playerSessionServiceJoin.joinSession(sessionInfo.id);

  playerSessionServiceJoin.leaveSession();

  expect(sessionInfo.full).toEqual(true);
}));

test("Partner Rejoin Session", () => new Promise<void>(async done => {

  const events: boolean[] = [];

  const websocketService = new WebSocketService();
  const playerSessionService = new PlayerSessionService(websocketService);
  websocketService.connect();
  let sessionInfo = await playerSessionService.createSession();

  const websocketServiceJoin = new WebSocketService();
  const playerSessionServiceJoin = new PlayerSessionService(websocketServiceJoin);
  websocketServiceJoin.connect();

  playerSessionService.partnerEvents$.subscribe(partnerConnected => {
    events.push(partnerConnected);

    if (events.length === 3) {   // when we received everything we expected
      expect(events).toEqual([true, false, true]);
      done();
    }
  })

  expect(sessionInfo.full).toEqual(false);

  setTimeout(() => {
    playerSessionServiceJoin.joinSession(sessionInfo.id).then(sessionInfo => {
      expect(sessionInfo.full).toEqual(true);
    });
  }, 200)

  setTimeout(() => {
    playerSessionServiceJoin.leaveSession();
  }, 400)

  setTimeout(() => {
    playerSessionServiceJoin.joinSession(sessionInfo.id).then(sessionInfo => {
      expect(sessionInfo.full).toEqual(true);
    });
  }, 600)
}));

test("Both Parties Leave", () => new Promise<void>(async done => {

  const events: boolean[] = [];

  const websocketService = new WebSocketService();
  const playerSessionService = new PlayerSessionService(websocketService);
  websocketService.connect();
  let sessionInfo = await playerSessionService.createSession();

  const websocketServiceJoin = new WebSocketService();
  const playerSessionServiceJoin = new PlayerSessionService(websocketServiceJoin);
  websocketServiceJoin.connect();

  playerSessionService.partnerEvents$.subscribe(partnerConnected => {
    events.push(partnerConnected);

    if (events.length === 2) {
      expect(events).toEqual([true, false]);
    }
  })

  setTimeout(() => {
    playerSessionServiceJoin.joinSession(sessionInfo.id).then(sessionInfo => {
      expect(sessionInfo.full).toEqual(true);
    });
  }, 200)

  setTimeout(() => {
    playerSessionServiceJoin.leaveSession();
  }, 400)

  setTimeout(() => {
    playerSessionService.leaveSession();
  }, 600)

  setTimeout(() => {
    playerSessionServiceJoin.joinSession(sessionInfo.id).then(sessionInfo => {
    },(error: ErrorType) => {
      expect(error).toEqual(ErrorType.NotFound)
      done();
    });
  }, 800)
}));
