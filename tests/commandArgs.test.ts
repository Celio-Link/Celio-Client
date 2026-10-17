import { test, expect } from "vitest";
import { Command, CommandType, PlayerSettingsCommand, StartHandshakeCommand } from '../src/shared/linkExchange/common';

test("Serializes PlayerSettings as type, player count and index", () => {
  const bytes = new PlayerSettingsCommand(4, 2).serialize();
  expect(Array.from(bytes)).toEqual([CommandType.PlayerSettings, 4, 2]);
});

test("Serializes commands without payload as only the type", () => {
  const bytes = new StartHandshakeCommand().serialize();
  expect(Array.from(bytes)).toEqual([CommandType.StartHandshake]);
});

test("Creates PlayerSettings from server args", () => {
  const command = Command.fromServer(CommandType.PlayerSettings, { playerCount: 2, playerIndex: 1 });
  expect(command).toBeInstanceOf(PlayerSettingsCommand);
  expect(Array.from(command!.serialize())).toEqual([CommandType.PlayerSettings, 2, 1]);
});

test("Rejects commands the server can't send", () => {
  expect(Command.fromServer(CommandType.Cancel, undefined)).toBeUndefined();
});
