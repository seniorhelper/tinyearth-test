# THIRD-PARTY (code only; NO art, models, textures or sounds come from any download)
Checked Nov 13, 2026 against each package's package.json / LICENSE in node_modules.

## Ships in the game (bundled into the build)
| Package | Version | License | Why |
|---|---|---|---|
| @iwsdk/core (Immersive Web SDK, Meta) | 1.1.0 | MIT | Required web SDK: world, XR session, hand-tracking + plane-detection requests, render loop |
| @iwsdk/xr-input, @iwsdk/locomotor, @iwsdk/scene-composition | 1.1.0 | MIT | IWSDK dependencies |
| three (npm alias `super-three`) | 0.185.0 | MIT | 3D engine pinned by IWSDK |
| elics | 3.4.2 | MIT | IWSDK entity/system engine |
| @pmndrs/uikit, @pmndrs/handle, @pmndrs/pointer-events | 1.0.78 / 6.6.32 | MIT-style (own LICENSE, (c) 2024 Bela Bohlender) | IWSDK dependencies. uikit bundles font data chunks (Inter, Roboto, etc.) that the game never loads (we draw our own canvas text). |
| three-mesh-bvh | 0.9.18 | MIT | IWSDK dependency |
| @babylonjs/havok | 1.3.14 | MIT (npm field) | IWSDK physics. Switched OFF in our config; code sits in an unused chunk. Strip before the frozen contest build if possible. |
| @preact/signals-core, @drawcall/uikitml | 1.14.5 / 0.1.8 | MIT (uikitml has no license field; part of IWSDK) | IWSDK dependencies |

License texts shipped with the site: `licenses/` folder (three.js, IWSDK).

## Dev/test only (NOT shipped)
| Package | License | Use |
|---|---|---|
| vite 6.4 | MIT | build |
| iwer 2.8.0 (Immersive Web Emulation Runtime, Meta) | MIT | desktop Quest-3 emulator for testing (`emu.html`, not in the build) |
| playwright-core 1.65 | Apache-2.0 | headless test scripts in `tests/` |

## Runtime downloads blocked on purpose
IWSDK normally fetches controller and hand models from cdn.jsdelivr.net (@webxr-input-profiles/assets). `src/game.js` refuses every remote model, so the game loads nothing from any other site (verified: 0 external requests on the live link). Hands are drawn by our own code; passthrough shows the real hands.

## Our own code and art
Everything else (terrain, characters, UI, sounds) is code written in the contest window; sounds are synthesized with Web Audio. No Blender assets yet.
