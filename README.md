# IES Profile Studio

A single-page browser app for drawing IES (LM-63-2002, Type C) light profiles.
Shape the light with curves and control points, stack layers with blend modes and modifiers
(transform, mirror, barn doors, cut, noise, rays, rings, gobo image, shape array, blur, contrast) and adjustment layers, check it on
floor, wall and 3D previews, and export a `.ies` file. Existing `.ies` files can be imported as layers,
and the whole session can be saved and reopened as an `.iesproj` project file.

## Photometric type

The app works only with **Type C** photometry (the standard for downlights, spots and most luminaires;
also what renderers expect).

- **Export** always writes LM-63-2002, Type C, with `TILT=NONE`. The horizontal range follows the profile's
  symmetry: Round (0° only), Oval (0–90°), One-sided (0–180°) or Free-form (0–360°).
- **Import** reads LM-63 files of photometric type C only. Type A and Type B files (floodlights, automotive)
  are rejected with a message; convert them to Type C first.

## Use it

Open `dist/ies-profile-studio.html` in a browser. It is one self-contained file with no server and no dependencies.

Load the `.ies` into your renderer or 3D app as a light's IES profile.
Straight down (0°) in the app is the light's forward axis.

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

## License

Copyright © 2026 Jan (Orel741)

This program is free software: you can redistribute it and/or modify it under the terms of the
[GNU General Public License](LICENSE) as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version. It is distributed WITHOUT ANY WARRANTY.
Modified versions you distribute must stay open source under the same license.
