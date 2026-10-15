# Kitchen Clash

A head-to-head 3D cooking game for two players on two phones. Join the same room
with a code, share one cozy kitchen, and cook the same recipe. The judge decides
whose dish is better.

Design notes: [DESIGN.md](DESIGN.md).

## How to play (Recipe Duel)

Today's dish is a **Classic Cheeseburger**. You both have 2:30.

- **Tap** anywhere to walk, or tap a station to walk there and use it.
- **🧺 Pantry**: one chef at a time, limited stock. Take one ingredient.
- **🔪 Boards**: swipe through the dashed lines to slice. Accuracy counts.
- **🔥 Stove**: put the patty on and come back when the gauge is in the green.
  Leave it too long and it burns.
- **Your plate** is on the centre island, on your colour mat. Items stack in the
  order you add them. With empty hands, tap it to take the top item back.
- **🗑️ Bin**: throw away whatever you're holding.
- **🛎️ Pass**: serve your dish. Once both of you have served (or time runs out),
  the judge scores the dishes out of 100: ingredients, prep, cooking, assembly and speed.
- **📜 Recipe**: peek at the recipe any time, but your chef stands still while you read.

**Host a game** on one phone shows a 4-letter code. The other phone enters it and taps **Join**.
**Practice solo** plays alone. Each device keeps your chef name, colour and win/loss record.

## Running it

```bash
npm install
npm run dev
```

`npm run dev` also serves the game on your local network. Open the printed
`Network:` URL on both phones (same Wi-Fi).

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(enable Pages with source "GitHub Actions" in the repo settings first).

## 3D models

The kitchen and chefs use free CC0 packs by **Kay Lousberg**
([Restaurant Bits](https://kaylousberg.itch.io/restaurant-bits),
[Adventurers](https://kaylousberg.itch.io/kaykit-adventurers)). Thank you, Kay!
The originals are in `assets-src/`. `npm run assets` rebuilds the optimized
`public/models/*.glb` files the game loads.

## Code map

| File | What it does |
|---|---|
| `src/main.ts` | Menus, game loop, tap input, HUD and overlays, wiring host/guest |
| `src/sim.ts` | Authoritative game rules; runs only on the host |
| `src/recipes.ts` | Ingredients, the recipe, and the judge's scoring |
| `src/layout.ts` | Kitchen layout: stations, props, walkable floor |
| `src/path.ts` | A* pathfinding around the island |
| `src/scene.ts` | Three.js kitchen, lighting, station visuals, camera |
| `src/chef.ts` | Animated chef: hat, apron, blended animations, held food |
| `src/fx.ts` | Particles: steam, smoke, sparkles, confetti |
| `src/chop.ts` | Chopping-board swipe mini-game |
| `src/sfx.ts` | Synthesized sound effects |
| `src/net.ts` | PeerJS room codes (host/join) |
| `src/storage.ts` | Local profile and match history |
