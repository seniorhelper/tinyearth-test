# Tiny Earth (working title) — rev 1.3

A living Earth that sits on your real table in mixed reality, played entirely with your hands (no controllers).
Built fresh for the Meta VR Start Developer Competition 2026 (New Experience division, Gaming track).

## How to play (Quest 3 / 3S browser)
- Open the page, press **Play in your room**. The board appears in front of you; pinch its wooden edge to slide it onto your table.
- **Dino:** walk two fingers on the land. Collect 5 crystals. Hop the stepping stones across the lava to the flag.
- **Sea Turtle:** paddle two fingers in the ocean. Collect 5 pearls.
- **Jet:** pinch the air above the island and steer it through 5 golden sky rings.
- **Pinch** a character to pick it up and carry it. **Poke** the boulder (chain reaction) or the volcano (eruption + earthquake).
- **≡ Menu** button on the front rim: switch characters, Easy mode, sound, reset, how-to-play, quit.
- 6 stars to earn; progress is saved on the device.

## Desktop preview
Drag to orbit, hold the mouse on the land to walk, click boulder/volcano, keys 1/2/3 switch characters, M opens the menu.

## Tech
Plain WebXR + three.js r170 (MIT, vendored in /vendor/three). No build step, no external requests. All sounds synthesized with Web Audio.
