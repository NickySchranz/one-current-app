/**
 * Pixel-art frames for "Pip" — your timeline buddy.
 *
 * Grid: 12 wide × 16 tall (rows 0-15). PX = 2.2 → ~26×35px.
 * Row 0  = hat/crown/feature accessory
 * Rows 1-8  = head (rounder, 2×2 eyes, proper brows, big cheeks)
 * Rows 9-12 = torso + belt
 * Rows 13-14 = legs + boots
 * Row 15 = shadow
 *
 * ColorKey:
 *   D    dark outline  (#1a1a1a)
 *   A    accent        (theme)
 *   Ad   accent dark
 *   Ah   accent highlight
 *   S    skin          (#f5c38c)
 *   Sd   skin shadow   (#c4864e)
 *   Ss   skin shine    (#fde6be)
 *   W    white
 *   P    pupil         (#1a1a1a)
 *   R    rosy cheek    (#e8836a)
 *   G    gold          (#f0c040)
 *   Gd   gold dark     (#b88620)
 *   Bl   boot          (#3a6ad4)
 *   Bd   boot dark     (#1a3fa0)
 *   Bh   boot highlight(#6e96f5)
 *   Sh2  shadow        (rgba 0,0,0,0.20)
 */

export type ColorKey =
  | 'D' | 'A' | 'Ad' | 'Ah'
  | 'S' | 'Sd' | 'Ss'
  | 'W' | 'P' | 'R'
  | 'G' | 'Gd'
  | 'Bl' | 'Bd' | 'Bh'
  | 'Sh2';

export type Pixel      = { c: number; r: number; k: ColorKey };
export type MascotType = 'chronicler' | 'wisp' | 'wanderer';
export type FrameName  =
  | 'IDLE_A' | 'IDLE_B'
  | 'RUN_A'  | 'RUN_B'
  | 'CLIMB_A' | 'CLIMB_B'
  | 'LAND_A'
  | 'INSPECT_A' | 'INSPECT_B'
  | 'TALK_A'    | 'TALK_B'
  | 'REACT';

export const PX = 2.2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dy = (px: Pixel[], d: number): Pixel[] =>
  d === 0 ? px : px.map(p => ({ ...p, r: p.r + d }));

const clip = (px: Pixel[]): Pixel[] => px.filter(p => p.r >= 0 && p.r <= 15);

/** Later entries in layer list win on same cell (for overrides). */
function merge(...layers: Pixel[][]): Pixel[] {
  const map = new Map<string, Pixel>();
  for (const layer of layers)
    for (const p of layer)
      map.set(`${p.c},${p.r}`, p);
  return [...map.values()];
}

// ─── BASE HEAD ────────────────────────────────────────────────────────────────
// 12-wide grid. Head spans cols 1-10 (10 wide), widest at rows 3-6.
// 2×2 eyes with pupils + highlight dots. Expressive brows. Big rosy cheeks.

// Three brow variants that slot into row 2 (above eyes at rows 3-4)
const BROW_NEUTRAL: Pixel[] = [
  {c:3,r:2,k:'D'},{c:4,r:2,k:'D'},         // left brow
  {c:7,r:2,k:'D'},{c:8,r:2,k:'D'},         // right brow
];
const BROW_RAISED: Pixel[] = [             // surprised / happy
  {c:2,r:1,k:'D'},{c:3,r:1,k:'D'},
  {c:8,r:1,k:'D'},{c:9,r:1,k:'D'},
];
const BROW_FURROW: Pixel[] = [            // focused
  {c:4,r:2,k:'D'},{c:5,r:2,k:'D'},        // inner brows angled in
  {c:6,r:2,k:'D'},{c:7,r:2,k:'D'},
];

// 2×2 eyes at cols 3-4 (left) and 7-8 (right), rows 3-4
// Each eye: top-right pixel = W highlight; bottom-left = P pupil; rest = W sclera
const EYES: Pixel[] = [
  // left eye
  {c:3,r:3,k:'W'}, {c:4,r:3,k:'W'},
  {c:3,r:4,k:'P'}, {c:4,r:4,k:'Ss'},  // pupil + highlight
  // right eye
  {c:7,r:3,k:'W'}, {c:8,r:3,k:'W'},
  {c:7,r:4,k:'P'}, {c:8,r:4,k:'Ss'},
];

// Big rosy cheeks flanking the eyes
const CHEEKS: Pixel[] = [
  {c:1,r:4,k:'R'},{c:2,r:4,k:'R'},        // left cheek
  {c:9,r:4,k:'R'},{c:10,r:4,k:'R'},       // right cheek
];

// Mouth variants (live at rows 6-7)
const MOUTH_SMILE: Pixel[] = [             // content closed smile
  {c:4,r:6,k:'P'},{c:7,r:6,k:'P'},        // corner dimples
  {c:5,r:7,k:'P'},{c:6,r:7,k:'P'},        // bottom arc
];
const MOUTH_OPEN: Pixel[] = [              // talking
  {c:4,r:6,k:'D'},{c:5,r:6,k:'W'},{c:6,r:6,k:'W'},{c:7,r:6,k:'D'},
  {c:5,r:7,k:'D'},{c:6,r:7,k:'D'},
];
const MOUTH_BIG: Pixel[] = [               // excited / react
  {c:3,r:6,k:'P'},{c:4,r:6,k:'W'},{c:5,r:6,k:'W'},{c:6,r:6,k:'W'},{c:7,r:6,k:'W'},{c:8,r:6,k:'P'},
  {c:4,r:7,k:'D'},{c:5,r:7,k:'W'},{c:6,r:7,k:'W'},{c:7,r:7,k:'D'},
];

// Head shell (outline + skin fill) — no brows, eyes, mouth (added as layers)
const HEAD_SHELL: Pixel[] = [
  // Row 1: top narrow (6 wide, cols 3-8)
  {c:3,r:1,k:'D'},{c:4,r:1,k:'A'},{c:5,r:1,k:'Ah'},{c:6,r:1,k:'A'},{c:7,r:1,k:'A'},{c:8,r:1,k:'D'},
  // Row 2: forehead (8 wide, cols 2-9)
  {c:2,r:2,k:'D'},{c:3,r:2,k:'Ss'},{c:4,r:2,k:'S'},{c:5,r:2,k:'S'},{c:6,r:2,k:'S'},{c:7,r:2,k:'S'},{c:8,r:2,k:'S'},{c:9,r:2,k:'D'},
  // Row 3: eye level (10 wide, cols 1-10)
  {c:1,r:3,k:'D'},{c:2,r:3,k:'S'},{c:3,r:3,k:'S'},{c:4,r:3,k:'S'},{c:5,r:3,k:'S'},{c:6,r:3,k:'S'},{c:7,r:3,k:'S'},{c:8,r:3,k:'S'},{c:9,r:3,k:'S'},{c:10,r:3,k:'D'},
  // Row 4: cheek level (10 wide)
  {c:1,r:4,k:'D'},{c:2,r:4,k:'S'},{c:3,r:4,k:'S'},{c:4,r:4,k:'S'},{c:5,r:4,k:'S'},{c:6,r:4,k:'S'},{c:7,r:4,k:'S'},{c:8,r:4,k:'S'},{c:9,r:4,k:'S'},{c:10,r:4,k:'D'},
  // Row 5: nose bridge (8 wide, cols 2-9)
  {c:2,r:5,k:'D'},{c:3,r:5,k:'S'},{c:4,r:5,k:'S'},{c:5,r:5,k:'Sd'},{c:6,r:5,k:'Sd'},{c:7,r:5,k:'S'},{c:8,r:5,k:'S'},{c:9,r:5,k:'D'},
  // Row 6: mouth level (8 wide)
  {c:2,r:6,k:'D'},{c:3,r:6,k:'S'},{c:4,r:6,k:'S'},{c:5,r:6,k:'S'},{c:6,r:6,k:'S'},{c:7,r:6,k:'S'},{c:8,r:6,k:'S'},{c:9,r:6,k:'D'},
  // Row 7: chin (8 wide)
  {c:2,r:7,k:'D'},{c:3,r:7,k:'Sd'},{c:4,r:7,k:'Sd'},{c:5,r:7,k:'Sd'},{c:6,r:7,k:'Sd'},{c:7,r:7,k:'Sd'},{c:8,r:7,k:'Sd'},{c:9,r:7,k:'D'},
  // Row 8: neck (6 wide)
  {c:3,r:8,k:'D'},{c:4,r:8,k:'Sd'},{c:5,r:8,k:'Sd'},{c:6,r:8,k:'Sd'},{c:7,r:8,k:'Sd'},{c:8,r:8,k:'D'},
];

function buildHead(brows: Pixel[], mouth: Pixel[], dY = 0): Pixel[] {
  return dy(merge(HEAD_SHELL, brows, EYES, CHEEKS, mouth), dY);
}

const H_NORMAL  = (dY = 0) => buildHead(BROW_NEUTRAL, MOUTH_SMILE, dY);
const H_FOCUSED = (dY = 0) => buildHead(BROW_FURROW,  MOUTH_SMILE, dY);
const H_HAPPY   = (dY = 0) => buildHead(BROW_RAISED,  MOUTH_BIG,   dY);
const H_TALK    = (dY = 0) => buildHead(BROW_NEUTRAL,  MOUTH_OPEN,  dY);

// ─── BODY ─────────────────────────────────────────────────────────────────────
// Rows 9-12. 10-wide torso with visible chest folds, gold belt, accent shading.

const BODY: Pixel[] = [
  // Row 9: shoulders (10 wide, cols 1-10) — collar notch at 5,6; shoulder highlights at 3,8
  {c:1,r:9,k:'D'},{c:2,r:9,k:'A'},{c:3,r:9,k:'Ah'},{c:4,r:9,k:'A'},{c:5,r:9,k:'Sd'},{c:6,r:9,k:'Sd'},{c:7,r:9,k:'A'},{c:8,r:9,k:'Ah'},{c:9,r:9,k:'A'},{c:10,r:9,k:'D'},
  // Row 10: chest (10 wide) — center fold shadow at 5,6; light source highlight at 2
  {c:1,r:10,k:'D'},{c:2,r:10,k:'Ah'},{c:3,r:10,k:'A'},{c:4,r:10,k:'A'},{c:5,r:10,k:'Ad'},{c:6,r:10,k:'Ad'},{c:7,r:10,k:'A'},{c:8,r:10,k:'A'},{c:9,r:10,k:'Ad'},{c:10,r:10,k:'D'},
  // Row 11: belt — prominent gold buckle at 4-7; buckle sides Gd at 3,8
  {c:2,r:11,k:'D'},{c:3,r:11,k:'Gd'},{c:4,r:11,k:'G'},{c:5,r:11,k:'G'},{c:6,r:11,k:'G'},{c:7,r:11,k:'G'},{c:8,r:11,k:'Gd'},{c:9,r:11,k:'D'},
  // Row 12: hips — hip fold shadow at 4,7; center accent at 5,6
  {c:2,r:12,k:'D'},{c:3,r:12,k:'Ad'},{c:4,r:12,k:'Ad'},{c:5,r:12,k:'A'},{c:6,r:12,k:'A'},{c:7,r:12,k:'Ad'},{c:8,r:12,k:'Ad'},{c:9,r:12,k:'D'},
];

// ─── ARMS ─────────────────────────────────────────────────────────────────────

const ARM_IDLE: Pixel[] = [
  {c:0,r:9,k:'D'},{c:0,r:10,k:'A'},{c:0,r:11,k:'D'},       // left
  {c:11,r:9,k:'D'},{c:11,r:10,k:'A'},{c:11,r:11,k:'D'},     // right
];

// Swinging run arms (opposite to legs for natural gait)
const ARM_RUN_A: Pixel[] = [   // left forward-high, right back-low
  {c:0,r:8,k:'A'},{c:1,r:8,k:'D'},          // left arm forward
  {c:10,r:10,k:'D'},{c:11,r:11,k:'A'},      // right arm back
];
const ARM_RUN_B: Pixel[] = [   // right forward-high, left back-low
  {c:0,r:10,k:'D'},{c:1,r:11,k:'A'},        // left arm back
  {c:10,r:8,k:'A'},{c:11,r:8,k:'D'},        // right arm forward
];

const ARM_UP: Pixel[] = [      // both raised — celebrate
  {c:0,r:7,k:'A'},{c:0,r:8,k:'Ah'},{c:1,r:7,k:'D'},
  {c:11,r:7,k:'A'},{c:11,r:8,k:'Ah'},{c:10,r:7,k:'D'},
  // sparkle dots
  {c:0,r:5,k:'Ah'},{c:11,r:5,k:'Ah'},{c:0,r:3,k:'G'},{c:11,r:3,k:'G'},
];

const ARM_POINT: Pixel[] = [   // left idle, right pointing with wand/quill
  {c:0,r:9,k:'D'},{c:0,r:10,k:'A'},{c:0,r:11,k:'D'},        // left idle
  {c:11,r:8,k:'A'},{c:11,r:7,k:'D'},{c:11,r:6,k:'Ah'},       // right pointing
];

// Climbing arms (summit): one arm reaches overhead for the next hold while
// the other hangs low on the rope — alternating, like the run gait.
const ARM_CLIMB_A: Pixel[] = [ // left overhead, right low
  {c:0,r:6,k:'Ah'},{c:0,r:7,k:'A'},{c:1,r:6,k:'D'},          // left reaching up
  {c:11,r:10,k:'D'},{c:11,r:11,k:'A'},                       // right gripping low
];
const ARM_CLIMB_B: Pixel[] = [ // right overhead, left low
  {c:10,r:6,k:'D'},{c:11,r:6,k:'Ah'},{c:11,r:7,k:'A'},       // right reaching up
  {c:0,r:10,k:'D'},{c:0,r:11,k:'A'},                         // left gripping low
];

// ─── FEET ─────────────────────────────────────────────────────────────────────

const FEET_STAND: Pixel[] = [
  // Row 13: legs — gap at col 6; left leg cols 3-5 (D,Bl,Bl); right leg cols 7-9 (Bl,Bl,D)
  {c:3,r:13,k:'D'},{c:4,r:13,k:'Bl'},{c:5,r:13,k:'Bl'},{c:6,r:13,k:'D'},{c:7,r:13,k:'Bl'},{c:8,r:13,k:'Bl'},{c:9,r:13,k:'D'},
  // Row 14: boots — wider; left: cols 1-5 (D,Bh,Bh,Bl,Bd); right: cols 7-11 (Bl,Bd,Bh,Bh,D)
  {c:1,r:14,k:'D'},{c:2,r:14,k:'Bh'},{c:3,r:14,k:'Bh'},{c:4,r:14,k:'Bl'},{c:5,r:14,k:'Bd'},
  {c:6,r:14,k:'D'},
  {c:7,r:14,k:'Bl'},{c:8,r:14,k:'Bd'},{c:9,r:14,k:'Bh'},{c:10,r:14,k:'Bh'},{c:11,r:14,k:'D'},
];

const FEET_BOB: Pixel[] = [
  // Row 13: legs — gap at col 6; left leg cols 3-5; right leg cols 7-9
  {c:3,r:13,k:'D'},{c:4,r:13,k:'Bl'},{c:5,r:13,k:'Bl'},{c:6,r:13,k:'D'},{c:7,r:13,k:'Bl'},{c:8,r:13,k:'Bl'},{c:9,r:13,k:'D'},
  // Row 14: boots — wider, bob variant (slightly raised toes for bounce)
  {c:1,r:14,k:'D'},{c:2,r:14,k:'Bh'},{c:3,r:14,k:'Bh'},{c:4,r:14,k:'Bh'},{c:5,r:14,k:'Bd'},
  {c:6,r:14,k:'D'},
  {c:7,r:14,k:'Bd'},{c:8,r:14,k:'Bl'},{c:9,r:14,k:'Bh'},{c:10,r:14,k:'Bh'},{c:11,r:14,k:'D'},
];

const FEET_RUN_A: Pixel[] = [   // left leg forward
  {c:2,r:12,k:'D'},{c:3,r:12,k:'Bl'},{c:4,r:12,k:'Bl'},{c:5,r:12,k:'D'},   // left thigh fwd
  {c:7,r:13,k:'D'},{c:8,r:13,k:'Bl'},                                        // right thigh back
  {c:1,r:13,k:'D'},{c:2,r:13,k:'Bh'},{c:3,r:13,k:'Bd'},                     // left foot extended
  {c:7,r:14,k:'Bd'},{c:8,r:14,k:'D'},                                         // right foot pulling
];

const FEET_RUN_B: Pixel[] = [   // right leg forward (mirror)
  {c:7,r:12,k:'D'},{c:8,r:12,k:'Bl'},{c:9,r:12,k:'Bl'},{c:10,r:12,k:'D'},
  {c:3,r:13,k:'Bl'},{c:4,r:13,k:'D'},
  {c:8,r:13,k:'D'},{c:9,r:13,k:'Bh'},{c:10,r:13,k:'Bd'},
  {c:3,r:14,k:'D'},{c:4,r:14,k:'Bd'},
];

const FEET_SQUAT: Pixel[] = [   // landing squash — wide flat
  {c:1,r:13,k:'D'},{c:2,r:13,k:'Bl'},{c:3,r:13,k:'Bl'},{c:4,r:13,k:'Bl'},{c:5,r:13,k:'Bl'},
  {c:6,r:13,k:'Bl'},{c:7,r:13,k:'Bl'},{c:8,r:13,k:'Bl'},{c:9,r:13,k:'Bl'},{c:10,r:13,k:'D'},
  // Row 14: wide flat boots — outer outlines at 1,11; toe highlights each side
  {c:1,r:14,k:'D'},{c:2,r:14,k:'Bh'},{c:3,r:14,k:'Bh'},{c:4,r:14,k:'Bl'},{c:5,r:14,k:'Bd'},
  {c:6,r:14,k:'D'},
  {c:7,r:14,k:'Bd'},{c:8,r:14,k:'Bl'},{c:9,r:14,k:'Bh'},{c:10,r:14,k:'Bh'},{c:11,r:14,k:'D'},
];

const SHADOW: Pixel[] = [
  {c:4,r:15,k:'Sh2'},{c:5,r:15,k:'Sh2'},{c:6,r:15,k:'Sh2'},{c:7,r:15,k:'Sh2'},
];

// ─── Frame builder ────────────────────────────────────────────────────────────

function frame(
  head: Pixel[], arms: Pixel[], feet: Pixel[],
  extras: Pixel[] = [], feetDy = 0,
): Pixel[] {
  return clip(merge(head, BODY, arms, dy(feet, feetDy), SHADOW, ...extras.map(p => [p])));
}

/** A climbing frame casts no ground shadow — he's on the face, not the floor. */
function climbFrame(head: Pixel[], arms: Pixel[], feet: Pixel[], extras: Pixel[] = []): Pixel[] {
  return clip(merge(head, BODY, arms, feet, ...extras.map(p => [p])));
}

// ─── CHARACTER 1: CHRONICLER ──────────────────────────────────────────────────
// Scroll quill at top. Round spectacles (small Ad circles over pupils).
// Gold scroll hanging off right side.

const CHR_QUILL_FEATURE: Pixel[] = [
  {c:5,r:0,k:'D'},{c:6,r:0,k:'G'},{c:7,r:0,k:'D'}, // quill tip at top
];
// Round spectacles: Ad pixels just outside eyes
const CHR_SPECS: Pixel[] = [
  {c:2,r:3,k:'Ad'},{c:2,r:4,k:'Ad'},   // left lens outer ring
  {c:5,r:3,k:'Ad'},{c:5,r:4,k:'Ad'},   // left lens inner ring
  {c:6,r:3,k:'Ad'},{c:6,r:4,k:'Ad'},   // right lens inner ring
  {c:9,r:3,k:'Ad'},{c:9,r:4,k:'Ad'},   // right lens outer ring
];
const CHR_SCROLL: Pixel[] = [
  {c:11,r:11,k:'G'},{c:11,r:12,k:'G'},{c:11,r:13,k:'Gd'},
];

function chrHead(makeH: (dY?: number) => Pixel[], dY = 0): Pixel[] {
  return dy(merge(makeH(), CHR_SPECS, CHR_QUILL_FEATURE), dY);
}

const CHRONICLER_FRAMES: Record<FrameName, Pixel[]> = {
  IDLE_A:    frame(chrHead(H_NORMAL),    ARM_IDLE,  FEET_STAND, CHR_SCROLL),
  IDLE_B:    frame(chrHead(H_NORMAL,-1), ARM_IDLE,  FEET_BOB,   CHR_SCROLL),
  RUN_A:     frame(chrHead(H_NORMAL),    ARM_RUN_A, FEET_RUN_A, CHR_SCROLL),
  RUN_B:     frame(chrHead(H_NORMAL),    ARM_RUN_B, FEET_RUN_B, CHR_SCROLL),
  CLIMB_A:   climbFrame(chrHead(H_FOCUSED), ARM_CLIMB_A, FEET_RUN_A, CHR_SCROLL),
  CLIMB_B:   climbFrame(chrHead(H_FOCUSED), ARM_CLIMB_B, FEET_RUN_B, CHR_SCROLL),
  LAND_A:    frame(chrHead(H_NORMAL,+1), ARM_IDLE,  FEET_SQUAT, CHR_SCROLL),
  INSPECT_A: frame(chrHead(H_FOCUSED),   ARM_POINT, FEET_STAND, CHR_SCROLL),
  INSPECT_B: frame(chrHead(H_FOCUSED),   [...ARM_POINT, {c:11,r:5,k:'Ah' as const}], FEET_STAND, CHR_SCROLL),
  TALK_A:    frame(chrHead(H_NORMAL),    ARM_POINT, FEET_STAND, CHR_SCROLL),
  TALK_B:    frame(chrHead(H_TALK),      ARM_POINT, FEET_STAND, CHR_SCROLL),
  REACT:     frame(chrHead(H_HAPPY,-1),  ARM_UP,    FEET_STAND,
    [...CHR_SCROLL, {c:0,r:0,k:'Ah' as const},{c:11,r:0,k:'Ah' as const}]),
};

// ─── CHARACTER 2: WISP ────────────────────────────────────────────────────────
// Ethereal glowing crown of Ah pixels. Glowing body shimmers. Trail instead of boots.
// Star sparkles float around it.

const WISP_CROWN: Pixel[] = [
  // row 0: crown glow arch
  {c:3,r:0,k:'Ah'},{c:4,r:0,k:'Ah'},{c:5,r:0,k:'Ah'},{c:6,r:0,k:'Ah'},{c:7,r:0,k:'Ah'},{c:8,r:0,k:'Ah'},
  // Crown fringe into row 1
  {c:2,r:1,k:'Ah'},{c:9,r:1,k:'Ah'},
];
const WISP_BODY_GLOW: Pixel[] = [
  // Extra glow pixels on body
  {c:2,r:10,k:'Ah'},{c:9,r:10,k:'Ah'},    // shoulder glow
  {c:3,r:11,k:'Ah'},{c:8,r:11,k:'Ah'},    // belt glow (overrides G)
];
const WISP_TRAIL: Pixel[] = [              // ethereal tail (no boots)
  {c:5,r:13,k:'Ah'},{c:6,r:13,k:'Ah'},
  {c:5,r:14,k:'A' },{c:6,r:14,k:'A' },
  {c:5,r:15,k:'Ad'},{c:6,r:15,k:'Ad'},
];
const WISP_STARS_A: Pixel[] = [
  {c:0,r:3,k:'Ah'},{c:11,r:3,k:'Ah'},{c:1,r:1,k:'A'},{c:10,r:1,k:'A'},
];
const WISP_STARS_B: Pixel[] = [
  {c:0,r:4,k:'Ah'},{c:11,r:4,k:'Ah'},{c:0,r:2,k:'A'},{c:11,r:2,k:'A'},
];

function wispFrame(
  makeH: (dY?: number) => Pixel[], stars: Pixel[], arms: Pixel[], hDy = 0,
): Pixel[] {
  return clip(merge(
    stars,
    dy(merge(makeH(), WISP_CROWN), hDy),
    BODY,
    WISP_BODY_GLOW,
    arms,
    WISP_TRAIL,
    SHADOW,
  ));
}

const WISPS_FRAMES: Record<FrameName, Pixel[]> = {
  IDLE_A:    wispFrame(H_NORMAL,  WISP_STARS_A, ARM_IDLE),
  IDLE_B:    wispFrame(H_NORMAL,  WISP_STARS_B, ARM_IDLE, -1),
  RUN_A:     wispFrame(H_NORMAL,  WISP_STARS_A, ARM_RUN_A),
  RUN_B:     wispFrame(H_NORMAL,  WISP_STARS_B, ARM_RUN_B),
  CLIMB_A:   clip(merge(WISP_STARS_A, merge(H_FOCUSED(), WISP_CROWN), BODY, WISP_BODY_GLOW, ARM_CLIMB_A, WISP_TRAIL)),
  CLIMB_B:   clip(merge(WISP_STARS_B, merge(H_FOCUSED(), WISP_CROWN), BODY, WISP_BODY_GLOW, ARM_CLIMB_B, WISP_TRAIL)),
  LAND_A:    wispFrame(H_NORMAL,  WISP_STARS_A, ARM_IDLE,  1),
  INSPECT_A: wispFrame(H_FOCUSED, WISP_STARS_A, ARM_POINT),
  INSPECT_B: wispFrame(H_FOCUSED, WISP_STARS_B, [...ARM_POINT, {c:11,r:5,k:'Ah' as const}]),
  TALK_A:    wispFrame(H_NORMAL,  WISP_STARS_A, ARM_POINT),
  TALK_B:    wispFrame(H_TALK,    WISP_STARS_B, ARM_POINT),
  REACT:     clip(merge(
    WISP_STARS_A, WISP_STARS_B,
    dy(merge(H_HAPPY(), WISP_CROWN), -1),
    BODY, WISP_BODY_GLOW, ARM_UP, WISP_TRAIL, SHADOW,
    [{c:0,r:13,k:'Ah' as const},{c:11,r:13,k:'Ah' as const}],
  )),
};

// ─── CHARACTER 3: WANDERER ────────────────────────────────────────────────────
// Wide adventurer hat with feather. Gold staff on right side.

const WAN_HAT: Pixel[] = [
  // row 0: wide brim (10 wide, cols 1-10)
  {c:1,r:0,k:'D'},{c:2,r:0,k:'Ad'},{c:3,r:0,k:'A'},{c:4,r:0,k:'A'},{c:5,r:0,k:'Ah'},
  {c:6,r:0,k:'A'},{c:7,r:0,k:'A'},{c:8,r:0,k:'Ad'},{c:9,r:0,k:'A'},{c:10,r:0,k:'D'},
  // row 1: hat crown (narrower, sits on top of head)
  {c:4,r:1,k:'Ad'},{c:5,r:1,k:'A'},{c:6,r:1,k:'A'},{c:7,r:1,k:'Ad'},
  // feather: G pixels at the side
  {c:11,r:0,k:'G'},{c:11,r:1,k:'G'},
];
const WAN_STAFF: Pixel[] = [  // staff held on right side
  {c:11,r:9,k:'Gd'},{c:11,r:10,k:'G'},{c:11,r:11,k:'G'},
  {c:11,r:12,k:'G'},{c:11,r:13,k:'Gd'},{c:11,r:14,k:'D'},
];

function wanHead(makeH: (dY?: number) => Pixel[], dY = 0): Pixel[] {
  return dy(merge(makeH(), WAN_HAT), dY);
}

const WANDERER_FRAMES: Record<FrameName, Pixel[]> = {
  IDLE_A:    frame(wanHead(H_NORMAL),    ARM_IDLE,  FEET_STAND, WAN_STAFF),
  IDLE_B:    frame(wanHead(H_NORMAL,-1), ARM_IDLE,  FEET_BOB,   WAN_STAFF),
  RUN_A:     frame(wanHead(H_NORMAL),    ARM_RUN_A, FEET_RUN_A, WAN_STAFF),
  RUN_B:     frame(wanHead(H_NORMAL),    ARM_RUN_B, FEET_RUN_B, WAN_STAFF),
  CLIMB_A:   climbFrame(wanHead(H_FOCUSED), ARM_CLIMB_A, FEET_RUN_A, WAN_STAFF),
  CLIMB_B:   climbFrame(wanHead(H_FOCUSED), ARM_CLIMB_B, FEET_RUN_B, WAN_STAFF),
  LAND_A:    frame(wanHead(H_NORMAL,+1), ARM_IDLE,  FEET_SQUAT, WAN_STAFF),
  INSPECT_A: frame(wanHead(H_FOCUSED),   ARM_POINT, FEET_STAND, WAN_STAFF),
  INSPECT_B: frame(wanHead(H_FOCUSED),   [...ARM_POINT, {c:11,r:5,k:'Ah' as const}], FEET_STAND, WAN_STAFF),
  TALK_A:    frame(wanHead(H_NORMAL),    ARM_POINT, FEET_STAND, WAN_STAFF),
  TALK_B:    frame(wanHead(H_TALK),      ARM_POINT, FEET_STAND, WAN_STAFF),
  REACT:     frame(wanHead(H_HAPPY,-1),  ARM_UP,    FEET_STAND,
    [...WAN_STAFF, {c:0,r:0,k:'Ah' as const},{c:0,r:13,k:'Ah' as const}]),
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const CHARACTER_FRAMES: Record<MascotType, Record<FrameName, Pixel[]>> = {
  chronicler: CHRONICLER_FRAMES,
  wisp:       WISPS_FRAMES,
  wanderer:   WANDERER_FRAMES,
};

export const FRAMES = CHARACTER_FRAMES;
