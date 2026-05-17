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
- A Chromium-based browser (WebUSB required)

The web client is available at:  
https://celi0.link  

> ⚠ Firefox is not supported because it does not support the WebUSB API.

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

---

# Trade Emulation Mode

Trade Emulation Mode allows users to simulate a trade with Pokémon of their choosing.

## How it works

1. Connect the Celio-Device.
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
