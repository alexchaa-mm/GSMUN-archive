import { DK_MOVES } from "./dkMoves";
import { MARIO_MOVES } from "./marioMoves";
import { KIRBY_MOVES } from "./moves";
import type { MoveId, MoveSet } from "./moves";
import { SAMUS_MOVES } from "./samusMoves";

// The playable roster. A character owns its model, its moveset and how it is
// animated. Physics (weight, jumps, gravity, hurtbox) are deliberately shared
// in Fighter.ts — characters differ in reach, timing and special behaviour, not
// in how they fall, so recovery and the CPU's edge-guarding stay predictable.

export type CharacterId = "kirby" | "samus" | "dk" | "mario";

/**
 * Everything the animator can be asked to play. Locomotion and damage states
 * plus one entry per attack; anything a character leaves unmapped falls back to
 * its `idle` clip.
 */
export type AnimRole =
  | "idle"
  | "walk"
  | "run"
  | "air"
  | "hitstun"
  | "dead"
  | "charge"
  | MoveId;

export interface SkeletalAnimation {
  /** Registry key holding the rigged GLB and the distilled clips.json. */
  assetKey: string;
  /** Role -> Mint clip id, resolved against clips.json at load. */
  clips: Partial<Record<AnimRole, string>>;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  blurb: string;
  /** Mint key for a static model; ignored when `animation` is present. */
  modelKey: string;
  /** Present only for skeletally animated characters. */
  animation?: SkeletalAnimation;
  moves: MoveSet;
  /** Menu accent + player-tint colour. */
  accent: string;
  /**
   * Yaw applied to the model so its authored forward axis points along +x,
   * which is what `facing` means. A ball needs none; a humanoid modelled
   * facing the camera needs a quarter turn.
   */
  modelYaw?: number;
  /**
   * Purely cosmetic size multiplier. Hurtboxes and hitbox offsets come from
   * shared constants in Fighter.ts, so this changes how big a character looks
   * without giving them a bigger target or more reach.
   */
  visualScale?: number;
}

// Mint clip ids for the huntress rig. Several attacks intentionally share a
// clip — a 15-clip set cannot give 17 attacks unique motion, and reusing a
// strike reads far better than leaving a move unanimated.
const SAMUS_CLIPS: Partial<Record<AnimRole, string>> = {
  idle: "w97end1kc1yn15jzfdvt853kjh8b7nwq",
  // Punchier locomotion: a combat-ready fight-walk and a committed fast run,
  // replacing the earlier casual amble that read as gliding.
  walk: "w97b9pr5en2asyta134j168nn58b7ebr", // Walk Fight Forward
  run: "w9741a01pcr2cr4368vrygb4td8b6y2r", // Run Fast
  air: "w97625wqnq56fecc07v6q1v3rs8b6xx9",
  hitstun: "w973tvtth8vayh5bjq4d0zfhg58b7crm",
  dead: "w974pmembp6bmtjf1w54fjy48s8b6d6z",
  charge: "w978k7ank6b9xyr71g549aa95n8b7xn8", // braced aim, held while charging

  // Distinct boxing strikes chosen so each move category reads differently:
  // straights forward, hooks for smashes, uppercut up, kick down.
  jab: "w97cf99mgd9xjnkjfzg4nde34h8b73v9", // Left_Jab_from_Guard — a real guard jab
  ftilt: "w9736dqjwa395r283znvspkw2d8b7qw3", // left hook
  utilt: "w9701fyb2spx37cnvhthj0sk098b7see", // rising uppercut
  dtilt: "w973xhgc09pda30qx95thnengh8b7d3n", // straight kick, reads low
  dashAttack: "w973m47aqq42feg5h0knqtz2ch8b63cp", // lunging kung-fu punch
  fsmash: "w9736dqjwa395r283znvspkw2d8b7qw3", // committed hook
  usmash: "w9701fyb2spx37cnvhthj0sk098b7see", // uppercut
  dsmash: "w973xhgc09pda30qx95thnengh8b7d3n", // low kick
  nair: "w97bwftrymj5srp97nxkdzvw0h8b65a0", // both fists out
  fair: "w970v3jds1fyevftb1t8y9we5h8b7k0q", // double combo
  bair: "w97bwftrymj5srp97nxkdzvw0h8b65a0", // both fists
  uair: "w9701fyb2spx37cnvhthj0sk098b7see", // uppercut
  dair: "w973xhgc09pda30qx95thnengh8b7d3n", // kick down

  neutralB: "w973bc8zsbp7k0m6f3yb69sk1n8b7zd1", // fire the charged shot
  sideB: "w972apy4jayt7skgnbpn8ept7x8b7zfz", // missile
  upB: "w97ad5ebtzc7r5axqjf02dccj18b70hh", // rising spin
  downB: "w973ctnszpys4swjfya9s6mz318b7mde", // crouch and lay a bomb
};

const KIRBY: CharacterDef = {
  id: "kirby",
  name: "Kirby",
  blurb: "Floaty, five midair jumps, close-range",
  modelKey: "kirby",
  moves: KIRBY_MOVES,
  accent: "#ff7bbf",
};

const SAMUS: CharacterDef = {
  id: "samus",
  name: "Samus",
  blurb: "Long reach, zones with the arm cannon",
  modelKey: "samus",
  animation: { assetKey: "samus", clips: SAMUS_CLIPS },
  moves: SAMUS_MOVES,
  accent: "#f2b134",
  modelYaw: Math.PI / 2, // the rig is authored facing the camera
  // A human silhouette next to a sphere of the same height reads as smaller,
  // so she is drawn taller than her hurtbox to look like a match for Kirby.
  visualScale: 1.45,
};

// Mint clip ids for the gorilla rig. As with Samus, several attacks share a
// clip — a 16-clip set cannot give 17 attacks unique motion — but the mapping
// is chosen so each move category still reads distinctly: straights forward,
// hooks and overhead smashes for the heavy hits, kicks low.
const DK_CLIPS: Partial<Record<AnimRole, string>> = {
  idle: "w976yxga3srsp3071x5qctz2qn8b8egx",
  walk: "w977g7zesrah1wmshm162hz0zs8b8k2b",
  run: "w971cyt3z2ygp26wsms30attxd8b8jw4",
  air: "w976vcekw6tw94gb97kvaqac0x8b9cbr",
  hitstun: "w97fra59kw2gscefjfdz86829n8b9yvs",
  dead: "w972hswmnbnrb2m1a0q4jjfy8n8b8kvx",
  charge: "w97fjg69qp1e7a3hfp8a3h9qhn8b9a59", // wound-up punch, held while charging

  jab: "w97aka9z218c8tbp9ktzh4dwj18b9qq3", // Punch_Combo — forward strike, reads as a quick jab
  ftilt: "w972z758x2bjg3sz4sksb7n6z58b9ys3", // wide hook = open-hand swat
  utilt: "w9780ztvgfq7rjkkbfr717nz9h8b9771", // rising uppercut
  dtilt: "w971sv88m92ht10zz6md58n5px8b9qcw", // low kick reads as a ground swat
  dashAttack: "w97b7j4kxbnkwcvh2rdg8024en8b9syk", // lunging charge
  fsmash: "w973nhd79ppvc74vctf6bre9gs8b9pgg", // both fists = the clap
  usmash: "w9780ztvgfq7rjkkbfr717nz9h8b9771", // uppercut = overhead clap
  dsmash: "w971sv88m92ht10zz6md58n5px8b9qcw",
  nair: "w97d857a82tncryrsj1nqvwvs98b92ge", // spinning double-arm
  fair: "w973nhd79ppvc74vctf6bre9gs8b9pgg", // two-fisted axe handle
  bair: "w971sv88m92ht10zz6md58n5px8b9qcw", // back kick
  uair: "w9780ztvgfq7rjkkbfr717nz9h8b9771",
  dair: "w973nhd79ppvc74vctf6bre9gs8b9pgg",

  neutralB: "w97b7j4kxbnkwcvh2rdg8024en8b9syk", // Giant Punch: lunging haymaker
  sideB: "w97fjg69qp1e7a3hfp8a3h9qhn8b9a59", // Headbutt
  upB: "w97d857a82tncryrsj1nqvwvs98b92ge", // Spinning Kong: whirling arms
  downB: "w973nhd79ppvc74vctf6bre9gs8b9pgg", // Hand Slap: both fists down
};

const DK: CharacterDef = {
  id: "dk",
  name: "Donkey Kong",
  blurb: "Heavyweight brawler, huge reach and power",
  modelKey: "dk",
  animation: { assetKey: "dk", clips: DK_CLIPS },
  moves: DK_MOVES,
  accent: "#8b3a1e",
  modelYaw: Math.PI / 2, // the rig is authored facing the camera
  // Reads as the big one on screen without a bigger hurtbox than anyone else.
  visualScale: 1.75,
};

// Mint clip ids for the Red Cap Plumber rig. As with Samus and DK, a 15-clip
// set cannot give 17 attacks unique motion, so strikes are reused across move
// categories — punches for the committed hits, the kick for sweeps/aerials, the
// elbow (the only rising strike) for everything that goes up.
const MARIO_CLIPS: Partial<Record<AnimRole, string>> = {
  idle: "w9779qptqqw18bbychr57y7ap98bb44j",
  walk: "w977z0bpxbvn6v28j41reb4fh18bbwcr", // Casual Walk
  run: "w97419vppnfpqch1rj9g4zaz898bapz3", // run fast 3
  air: "w97bp1fjwgp0qwhkx1z97j56158bb5xs", // Regular Jump
  hitstun: "w978v789enw6z7v38ywk48vk1d8bb6fy", // Hit Reaction
  dead: "w977gxkwhtdnxs1mnr0depym258ba0wx", // Knock Down
  charge: "w97fwq8yzymyp0h6c0he3ata9h8ba3aq", // Block1, braced while charging

  jab: "w970f6j4gsvzzp5qynh62n97718ba4am", // Left Jab from Guard
  ftilt: "w977qc35v56dq4gjee65b4bygs8bamga", // Roundhouse Kick
  utilt: "w97f45r4tbcfvbat2dgfa4yfwd8ba7f7", // Elbow Strike, rises
  dtilt: "w977qc35v56dq4gjee65b4bygs8bamga", // low kick
  dashAttack: "w97c3h5ehhp6v59e6tsk0z5acx8badp0", // lunging Punch Combo
  fsmash: "w97c3h5ehhp6v59e6tsk0z5acx8badp0", // committed Punch Combo
  usmash: "w97f45r4tbcfvbat2dgfa4yfwd8ba7f7", // Elbow, upward
  dsmash: "w977qc35v56dq4gjee65b4bygs8bamga", // spinning kick
  nair: "w977qc35v56dq4gjee65b4bygs8bamga", // kick out
  fair: "w97c3h5ehhp6v59e6tsk0z5acx8badp0", // overhead punch
  bair: "w977qc35v56dq4gjee65b4bygs8bamga", // back kick
  uair: "w97f45r4tbcfvbat2dgfa4yfwd8ba7f7", // Elbow, up
  dair: "w977qc35v56dq4gjee65b4bygs8bamga", // twisting kick down

  neutralB: "w97c3h5ehhp6v59e6tsk0z5acx8badp0", // Fireball throw
  sideB: "w97c3h5ehhp6v59e6tsk0z5acx8badp0", // Cape swipe
  upB: "w97f45r4tbcfvbat2dgfa4yfwd8ba7f7", // Super Jump Punch, rising uppercut
  downB: "w97fwq8yzymyp0h6c0he3ata9h8ba3aq", // F.L.U.D.D., braced spray
};

const MARIO: CharacterDef = {
  id: "mario",
  name: "Mario",
  blurb: "Balanced all-rounder, fast combos, fireballs",
  modelKey: "mario",
  animation: { assetKey: "mario", clips: MARIO_CLIPS },
  moves: MARIO_MOVES,
  accent: "#e52521",
  modelYaw: Math.PI / 2, // rig authored facing the camera, like Samus/DK
  visualScale: 1.35,
};

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  kirby: KIRBY,
  samus: SAMUS,
  dk: DK,
  mario: MARIO,
};

/** Menu order. */
export const CHARACTER_LIST: CharacterDef[] = [KIRBY, SAMUS, DK, MARIO];

export const DEFAULT_CHARACTER_ID: CharacterId = "kirby";
