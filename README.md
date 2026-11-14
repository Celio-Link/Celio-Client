# Celio-Client

## TL;DR

This project enables Pokémon Generation 3 games on real Game Boy Advance hardware to **Trade, Battle, and Record Mix online**.

### Supported Games

- Pokémon Ruby  
- Pokémon Sapphire  
- Pokémon FireRed  
- Pokémon LeafGreen  
- Pokémon Emerald  

### Requirements

To use this system, you need:

- A **Celio-Device** (hardware dongle)
- A **Game Boy Advance link cable**
- A browser with WebUSB (Chromium-based — Chrome/Edge) or WebSerial (Firefox 151+)

The web client is available at:  
https://celi0.link  

> ℹ Chromium browsers use WebUSB. Firefox 151+ is supported via WebSerial (the
> connect button falls back to "Connect Serial" automatically when WebUSB is unavailable).

---

## Overview

This repository contains the **web client** for the Celio-Device.

The client acts as a frontend that communicates with the Celio-Device via WebUSB and allows it to operate in one of two mutually exclusive modes:

- **Online Link Mode**
- **Trade Emulation Mode**

The device can only operate in **one mode at a time**.

A mode is activated when the user presses either:

- **"Start"** (Online Link Mode)
- **"Upload Pokémon"** (Trade Emulation Mode)

---

## Firmware

If you want to build your own Celio-Device, see the firmware project:

https://github.com/Celio-Link/Celio-Firmware

---

# Online Link Mode

Online Link Mode allows users to create or join an online session via the Celio-Server.

## How it works

1. A user creates a session.
2. The creator automatically joins the session.
3. The generated Session ID can be shared with another player.
4. Once both players are connected, press **"Start"**.
5. Celio-Link now behaves like a physical GBA link cable.

From this point on, players can:

- Enter the Pokémon Center communication room
- Battle
- Trade
- Record Mix

When both players leave the in-game communication room, the session is automatically deleted.

## Play in Browser

You can also play without a Celio-Device. On the Online Emulator Link page, choose
**"Play in Browser"** as the emulator and then your game's ROM, with its save file if you have
one. The game runs in the page and links like a Game Boy Advance on a Celio-Device, so players
in the browser and players on real hardware can share a session.

- It takes clean dumps of your own Ruby, Sapphire, Emerald, FireRed and LeafGreen cartridges.
- The browser keeps your game and its progress, so you can play again without choosing the
  files. **"Download save"** saves your progress as a file; a dot on the button shows that the
  game has saved since your last download.
- The arrow keys move. X is A, Z is B, A and S are L and R, Enter is Start and Space is
  Select. Game controllers work too, and phones and tablets show buttons on the screen.
- You can create or join a session while you choose your game; **"Start"** waits until the
  game is running.
- While the link is on, the game can't be changed, reset, given another save or closed.
  **"Close"** goes back to choosing the emulator.
- The game in the browser can trade on the Trade Simulation page too, and stays loaded
  when you switch between the pages.
- On the Local Emulator Link page, choose **"Play in Browser"** as the emulator to link the
  game in the browser with the Game Boy Advance on your Celio-Device, without a server.

---

# Trade Emulation Mode

Trade Emulation Mode allows users to simulate a trade with Pokémon of their choosing.

## How it works

1. Connect the Celio-Device, or press **"Play in Browser"** and choose your game.
2. Upload up to **6 Pokémon files**.
   - Supported formats:
     - `.pk3`
     - `.ek3`
   - Files can be created using tools like PKHeX or downloaded.
3. Press **"Upload Pokémon"**.
4. In-game, talk to the Pokémon Center clerk to start a trade.
5. Trade your in-game Pokémon with the uploaded Pokémon.

When all trades are complete, simply leave the trade room.  
The connection will close automatically.

---

# Development

This project was generated using Angular CLI v20.1.6.

## Development Server

To start a local development server:

```bash
ng serve
```

## Staging

`ng build --configuration staging` (or `ng serve --configuration staging`) builds the client
for the staging server.

## Browser emulator

The emulator in `public/emulator/` is mGBA's Game Boy Advance core built for the web, together
with `emulator/gba_emu.c`. `emulator/build.sh` rebuilds it; it needs podman. mGBA is under the
Mozilla Public License 2.0 (`public/emulator/LICENSE-mGBA.txt`).
