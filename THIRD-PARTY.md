# THIRD-PARTY NOTICES (code and data only; NO art, models, textures or sounds come from any download)
Checked Nov 15, 2026 against each package's package.json and LICENSE in node_modules, and against the shipped build (deploy/assets).
Licence texts are in the `licenses/` folder next to this file.

## Ships in the game (bundled into the build)
| Package | Version | Licence | Used for | Notice file |
|---|---|---|---|---|
| @iwsdk/core, @iwsdk/locomotor, @iwsdk/xr-input, @iwsdk/scene-composition (Meta) | 1.1.0 | MIT | Immersive Web SDK: world, XR session, hand-tracking and plane-detection requests, render loop | licenses/iwsdk.LICENSE |
| three (npm alias super-three) | 0.185.0 | MIT | 3D engine | licenses/three.LICENSE |
| elics | 3.4.2 | MIT | Entity/system engine used by IWSDK | licenses/elics.LICENSE |
| three-mesh-bvh | 0.9.18 | MIT | Ray/geometry acceleration used by IWSDK | licenses/three-mesh-bvh.LICENSE |
| @preact/signals-core | 1.14.5 | MIT | Reactive signals used by IWSDK and uikit | licenses/preact-signals-core.LICENSE |
| @pmndrs/uikit | 1.0.78 | MIT | SDK spatial-UI toolkit (unused by this game: spatialUI is off) | licenses/pmndrs-uikit.LICENSE |
| @pmndrs/uikit-horizon | 1.0.78 | MIT | uikit component set, bundled by IWSDK | licenses/pmndrs-uikit-horizon.LICENSE |
| @pmndrs/uikit-lucide | 1.0.78 | MIT | uikit icon wrapper; bundles the Lucide icon SVGs | licenses/pmndrs-uikit-lucide.LICENSE |
| Lucide icons (inside uikit-lucide) | n/a | ISC (parts MIT, from Feather) | Icon SVG set inside the uikit chunk; the game shows no Lucide icon | licenses/lucide.NOTICE |
| @pmndrs/uikit-pub-sub | 1.0.78 | MIT | uikit internals | licenses/pmndrs-uikit-pub-sub.LICENSE |
| @pmndrs/handle | 6.6.32 | MIT | Handle/grab interactions in IWSDK | licenses/pmndrs-handle.LICENSE |
| @pmndrs/pointer-events | 6.6.32 | MIT | Pointer events for IWSDK and uikit | licenses/pmndrs-pointer-events.LICENSE |
| @pmndrs/msdfonts | 1.0.78 | Code MIT-style; fonts SIL OFL 1.1 (16 fonts) and Apache-2.0 (Roboto) | Pre-made font atlas chunks (Roboto, Inter, Open Sans, Lato, Poppins, Montserrat, Nunito, Raleway, Work Sans, Playfair Display, Merriweather, Libre Baskerville, Crimson Text, Fira Code, Source Code Pro, Inconsolata, Space Mono). The game draws its own canvas text and never loads them. | licenses/pmndrs-msdfonts.LICENSE |
| @zappar/msdf-generator (bundles msdfgen MIT, stb_truetype public domain, Skia PathOps BSD-3-Clause) | 1.2.4 | MIT | Runtime font-atlas generator in the msdf worker chunk (unused by the game) | licenses/zappar-msdf-generator.LICENSE |
| @drawcall/uikitml | 0.1.8 | NONE STATED (no licence field, no LICENSE file) | uikit markup parser used by the SDK (unused by the game) | none available |
| yoga-layout (Meta) | 3.2.1 | MIT (package.json only) | Flexbox layout engine (WASM) for uikit | licenses/yoga-layout.LICENSE |
| comlink | 4.4.2 | Apache-2.0 | Worker messaging for the font and physics workers | licenses/comlink.LICENSE |
| fflate | 0.8.3 | MIT | Decompression used by three.js loaders | licenses/fflate.LICENSE |
| zod | 4.6.7 | MIT | Schema validation used by IWSDK | licenses/zod.LICENSE |
| meshoptimizer (MeshoptDecoder) | 1.1.1 | MIT | Mesh decompression for glTF loading (unused: game loads no glTF) | licenses/meshoptimizer.LICENSE |
| Draco decoder (Google; shipped inside three.js examples) | n/a | Apache-2.0 | Draco mesh decompression for glTF (unused) | licenses/draco.LICENSE |
| Basis Universal transcoder (Binomial; shipped inside three.js examples) | n/a | Apache-2.0 | KTX2/Basis texture decompression (unused) | licenses/basis-universal.LICENSE |
| @babylonjs/havok | 1.3.14 | MIT (package LICENSE and package.json) | Havok physics WASM used by IWSDK physics (switched OFF in this game; present as an unused lazy chunk) | licenses/babylonjs-havok.LICENSE |

## Dev/test only (NOT shipped)
vite (MIT), iwer (MIT, desktop Quest emulator), playwright-core (Apache-2.0, headless tests). Also not shipped: @sentry/*, @opentelemetry/*, nearley and related build-tooling packages.

## Runtime downloads blocked on purpose
IWSDK normally fetches controller and hand models from a CDN. `src/game.js` refuses every remote model, so the game loads nothing from any other site.

## Our own code and art
Everything else (terrain, characters, UI, sounds) is code written in the contest window; sounds are synthesized with Web Audio. See COPYRIGHT.txt.
