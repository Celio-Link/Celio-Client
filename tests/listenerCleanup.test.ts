import { test, expect } from "vitest";
import { WebSocketService } from "../src/services/websocket.service.js";
import { CommandEmitterSocketIO } from '../src/shared/linkExchange/commandEmitter/commandEmitter.socketIO';

class InspectableWebSocketService extends WebSocketService {
  listenerCount(event: string): number {
    return this.socket.listeners(event).length;
  }
}

test("Destroyed link sessions leave no listeners on the socket", () => {
  const websocketService = new InspectableWebSocketService();

  for (let i = 0; i < 3; i++) {
    new CommandEmitterSocketIO(websocketService).destroy();
  }

  expect(websocketService.listenerCount('deviceData')).toEqual(0);
  expect(websocketService.listenerCount('deviceCommand')).toEqual(0);
  expect(websocketService.listenerCount('sessionClose')).toEqual(0);
});
