# Kitchen Clash

A head-to-head 3D cooking game for two players on two phones. Join the same room
with a code, share one cozy kitchen, and cook the same recipe. The judge decides
whose dish is better.

Design notes: [DESIGN.md](DESIGN.md).

## How to play (Recipe Duel)

Pick a **dish** and a **kitchen** on the menu (or let it surprise you). You both
cook the same recipe against the clock, then the judge scores both dishes.

**Dishes** (all halal: no pork, no alcohol): Classic Cheeseburger, Garden Veggie
Burger, Steak & Mash, Garden Veg Stew.

**Kitchens:** Cozy Cottage, Retro Diner, Night Bistro, Spice Market.

- **Tap** anywhere to walk, or tap a station to walk there and use it. The
  station you need next glows.
- **🧺 Walk-in pantry** (buns, potatoes, onions, carrots) and **❄️ walk-in fridge**
  (patties, steak, cheese, lettuce, tomatoes): walk in and take one thing. You can
  both be inside at once, but stock is limited and shared.
- **🔪 Chop**: swipe through the dashed lines. Accuracy counts.
- **🔥 Torch**: sweep the blowtorch over sliced cheese to melt it. Don't scorch it!
- **🍳 Grill**: put food on and come back when the gauge is green.
- **🍲 Pots**: add chopped veg, tap with empty hands to stir, and tap again when
  it's green to scoop it out.
- **Your plate** is on the centre island. Items go on in the order you add them;
  use **↩ Take back** if you make a mistake.
- **🛎️ Serve** at the pass, then the judge scores ingredients, prep, cooking,
  assembly (or stirring) and speed.
- **📜 Recipe**: peek any time, but your chef stands still while you read.

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
| `src/recipes.ts` | Ingredients, recipes, and the judge's scoring |
| `src/layout.ts` | Kitchen layout: stations, props, walkable floor |
| `src/path.ts` | A* pathfinding through the kitchen and walk-in rooms |
| `src/themes.ts` | Kitchen themes: colours, floors, lighting |
| `src/decor.ts` | Procedural props (blowtorch, fridge curtain, lamps…) and theme decor |
| `src/scene.ts` | Three.js kitchen, lighting, station visuals, camera |
| `src/chef.ts` | Animated chef: hat, apron, blended animations, held food |
| `src/fx.ts` | Particles: steam, smoke, sparkles, confetti |
| `src/minigames.ts` | Chop, blowtorch and stir mini-games |
| `src/sfx.ts` | Synthesized sound effects |
| `src/net.ts` | PeerJS room codes (host/join) |
| `src/storage.ts` | Local profile and match history |
