# IES Profile Studio

A single-page browser app for drawing IES (LM-63-2002, Type C) light profiles for Unreal Engine 5.
Shape the light with curves and control points, stack layers with blend modes and modifiers
(noise, rays, rings, blur, cut, contrast, tilt, barn doors, gobo image, shape array), check it on
floor, wall and 3D previews, and export a `.ies` file.

## Use it

Open `dist/ies-profile-studio.html` in a browser. It is one self-contained file with no server and no dependencies.

In Unreal, drag the `.ies` into the Content Browser and assign it to a light's IES Texture.
Straight down (0°) in the app is the light's forward direction in UE.

## Develop

```
npm install          # Playwright, only needed for the UI tests
npm run build        # src/ → dist/ies-profile-studio.html
npm test             # build + unit tests (plain Node)
npm run test:ui -- test/ui/dragtest.js   # build + headless browser run, screenshots in test/shots/
```

| Path | What it is |
| --- | --- |
| `src/core.js` | Photometry, no DOM: curves, splines, the full-sphere field, modifiers, layer compositing, IES writer and parser, zip |
| `src/ui.js` | The whole interface: state, editor, previews, 3D view (WebGL2), layers panel, persistence |
| `src/template.html` | Markup and CSS; the build inlines the two scripts into it |
| `build.js` | Produces `dist/ies-profile-studio.html` |
| `test/unit.js` | Node unit tests for `core.js` |
| `test/ui/` | Playwright runner (`run.js`) and interaction scripts |
