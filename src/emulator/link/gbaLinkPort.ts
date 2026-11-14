/** What the GBA online link drives an emulated GBA's link port with (see emulator/gba_emu.c). */

export enum LinkRole {
  /** No link: the game sees that not every player is ready, and nobody clocks. */
  None = 0,
  /** The game is the parent (seat 0) and clocks; the link answers in the other slots. */
  Parent = 1,
  /** The game is a child; the link clocks every transfer as the parent. */
  Child = 2,
}

/** The GBA's clock, which link timings are counted in. */
export const GBA_CYCLES_PER_SECOND = 16777216;
/** GBA cycles a transfer of 1-4 players takes at 115200 bps, as the emulator times it. */
export const TRANSFER_CYCLES = [0, 3194, 6075, 8973, 11863];

export interface GbaLinkPort {
  /** seat: the game's slot as a child (1-3). Stops a transfer under way. */
  configure(role: LinkRole, seat: number, players: number): void;
  /** The other players' words for the next transfer, by slot (4 entries; the game's own slot is ignored). */
  stage(slots: readonly number[]): void;
  /** LinkRole.Child: the next transfer starts this many GBA cycles from now. */
  clock(cycles: number): void;
  /** Called after every finished transfer with the game's word (0xFFFF when it did not answer). */
  setTransferHandler(handler: ((rx: number) => void) | null): void;
}
