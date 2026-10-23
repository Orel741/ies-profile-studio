# IES Profile Studio — notes for Claude

Single-file HTML app for authoring IES light profiles. The user is a lighting artist:
use artist wording in the UI (Front/Left/Back/Right, never C0/C90 in labels), keep text short,
put explanations in hover tips (`.infopop` + `data-tip`), not inline paragraphs. Don't mention Unreal / UE anywhere in the app.

## Workflow
- Edit `src/`, never `dist/` (it is generated). Run `npm test` after every change; it must print no `FAIL`.
- For UI changes run a Playwright check: `npm run test:ui -- test/ui/<script>.js`. It renders desk light, desk dark
  and a 400 px phone width, reports page errors and horizontal overflow, and saves screenshots to `test/shots/`.
  Look at the screenshots. In a cloud container set `CHROME` to the pre-installed Chromium if Playwright can't find one.
- WebGL in headless Chromium needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.

## Model
- Type C angles: vertical 0..180 (0 = straight down = the light's forward axis), horizontal C0 Front, C90 Left, C180 Back, C270 Right.
- Symmetry modes (`MODES`): rot (Round), bi (Oval), mir (One-sided), asym (Free-form). Curves are `Float32Array(181)` per plane,
  with optional control points (monotone cubic spline, `fitKnots`).
- Full-sphere field: 360 × 181 grid, index `F[c * N + g]`, bilinear `fieldAt`.
- Layers: `curve`, `ies` (imported grid) or `adjust` (no light of its own: its modifiers run over the stack below,
  faded by `amount` shown as Mix; blend and turn are hidden); blends add/lighten/replace/mask/subtract; amount, turn, modifiers.
  A light layer's `amount` is shown as an Exposure offset in EV (`amount = 2^EV`, −8…+4).
  `compositeLayers` makes the exported light; `outModeFor` picks the file's symmetry; `FINE_MODS` force full detail.
- Modifiers live in `MOD_TYPES` (core.js) with UI in `MOD_FIELDS` / `MOD_HELP` / `fxText` (ui.js). Mask-type modifiers
  are cached in `MASKS` keyed by their settings. A field entry with a 7th element renders as a switch (options array; a dropdown
  when more than 4), or a checkbox when it is `'check'`. `MOD_GROUPS` sorts the + Add modifier menu; `makeMenu()` builds the
  Add layer / Add modifier menus (headings, one level of submenus, keyboard support).
- The selected layer aliases `S.mode/S.planes/S.knots` via `bindCur()` / `syncCur()`. History snapshots deep-clone layers;
  bump `L.rev = revSeq++` when a layer's output changes so `fieldCache` refreshes.
- Previews compute relative illuminance from the composite. Heat map or grey 18% surface with Kelvin colour and ACES.
  The 3D view ray-casts floor, wall and ceiling against an R16F texture of the composite and scales itself to stay fast.
- Persistence: localStorage key `ies-profile-studio-v1`, format `v: 2`. Validate everything read back.
- Project files (`.iesproj`): JSON `{ format: 'ies-profile-studio-project', version: 1, saved, state }`, where `state` is the same
  object as localStorage (`stateObj()` / `applyState()`). Keep both in step when adding settings; opening a project is undoable.
- Downloads go through `claude.use('downloads')` when the page runs as a claude.ai artifact, with a plain link fallback.
