# Porting conventions: one_current (React DOM) → one-current-app (React Native + RN Web)

Source app: `/home/nicky/one_current` (Vite + React DOM + CSS). Target: this repo,
Expo SDK 57, React Native 0.86 + react-native-web, TypeScript strict.

## Ground rules

- **No DOM APIs** (`document`, `window`, `localStorage`, `HTMLElement`, CSS classes).
  Web-only niceties may be gated behind `Platform.OS === "web"`.
- **Animations use `react-native-reanimated` only** (v4 is installed). No CSS
  keyframes, no `requestAnimationFrame` loops. Replicate the exact timing/easing
  of the original CSS keyframes (see `src/styles/global.css` in the source repo).
  Respect `reducedMotion` from the app store: when true, no animation.
- **SVG uses `react-native-svg`** (`Svg, G, Path, Circle, Rect, Text as SvgText, Ellipse, Line`).
  `className` does not exist — all presentation attributes must be explicit props.
  For animated SVG props use `Animated.createAnimatedComponent(Path)` + `useAnimatedProps`.
- The path alias `@/*` → `src/*` works exactly as in the source.
- Everything already ported and shared:
  - `@/stores/app-store` — identical API to the source store.
  - `@/stores/layout-store` — tray size coordination (replaces DOM measuring).
  - `@/domain/**`, `@/visualization/**`, `@/i18n/**` — verbatim; `useT()` works the same.
  - `@/db/repository` — same repo API on AsyncStorage.
  - `@/ui/theme` — `useTheme()` returns `ThemeTokens` (all CSS custom properties
    as plain values; see mapping below).
  - `@/ui/color` — `mix(a, b, pctOfA)` = CSS `color-mix(in srgb, a pct%, b)`;
    `alpha(color, opacity)` = mix with transparent.
  - `@/ui/primitives` — `H1 H2 H3 P Hint Prompt T` (text), `Button` (variants
    default/primary/quiet/danger, `large`, `selected` = aria-pressed look),
    `Card` (`sunken`), `Tag` (`quality`, `onRemove`, `pressed`), `Chip`,
    `Field`, `AppTextInput` (`multiline` for textarea), `Choice` (choice-grid cell),
    `Panel` (`wide`, `inTray`), `CalmNote`, `rowStyles` (tagRow/stack/stageNav/filterRow),
    `shadow(t)`, `InTrayContext`/`useInTray()`.
  - `@/ui/confirm` — `confirmAsync(title, msg?)`, `notify(title, msg?)` replace
    `window.confirm` / `window.alert`.

## CSS token → theme token

`var(--bg)`→`t.bg`, `--bg-raised`→`t.bgRaised`, `--bg-sunken`→`t.bgSunken`,
`--ink`→`t.ink`, `--ink-soft`→`t.inkSoft`, `--ink-faint`→`t.inkFaint`,
`--line-main`→`t.lineMain`, `--line-axis`→`t.lineAxis`, `--accent`→`t.accent`,
`--accent-ink`→`t.accentInk`, `--accent-soft`→`t.accentSoft`, `--danger`→`t.danger`,
`--focus`→`t.focus`, `--radius`→`t.radius`, `--radius-lg`→`t.radiusLg`,
`--btn-radius`→`t.btnRadius`, `--line-soft`→`alpha(t.lineAxis, 0.55)`,
`--surface-soft`→`mix(t.bgSunken, t.bg, 55)`, fonts→`t.fontBody`/`t.fontDisplay`
(may be `undefined` on native — pass straight to `fontFamily`),
flow animation speeds→`t.flowDuration`/`t.flowDash`/`t.mainFlowDuration`/`t.mainFlowDash` (ms + arrays).

## Sizing

- `1rem` = 16px. Sub-rem values: multiply (e.g. `0.35rem` → 5.6 — rounding to
  0.5px is fine). `--touch` = 44.
- Layout: flexbox only (no CSS grid — emulate 2-col grids with
  `flexDirection:"row", flexWrap:"wrap"` and `width:"48%"`-style children or
  explicit rows). Media queries → `useWindowDimensions()`.

## Interaction patterns

- `<button>` → `Button` primitive, or `Pressable` for custom looks.
- Hover: `Pressable` style-callback state `(s as {hovered?: boolean}).hovered`
  (web only; safe cast — never rely on hover for functionality).
- `<details>/<summary>` → local `useState` toggle with a chevron.
- `<select>` → row of `Chip`s or `Choice`s.
- `<input type=range>` (loudness slider) → custom Pressable track (see BranchView notes).
- Text inputs: `AppTextInput` with `onSubmitEditing` for Enter, `blurOnSubmit={false}`
  where the web app kept focus.
- Scrolling containers → `ScrollView`.
- Keyboard shortcuts: web-only; skip unless trivial via `Platform.OS === "web"`.

## Store notes

Identical to source, plus: settings (theme/language/reducedMotion) load during
`init()` via AsyncStorage. `useAppStore`, `filterBranches`, `matchesStatusFilter`,
`operationDepth` all exist with identical signatures.

## Checks

Run `npx tsc --noEmit` in this repo and fix errors in your files before finishing.
