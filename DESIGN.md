# Kitchen Clash — Design

A two-player, head-to-head 3D cooking game for the browser, built mobile-first.
Two players share one kitchen and compete over a multi-round tournament.

## Decisions so far

| Area | Decision |
|---|---|
| Players | 2, each on their own device (phone first; tablet/desktop should also work) |
| Connection | Peer-to-peer over WebRTC (PeerJS). Host shows a 4-letter room code, guest types it in. No game server. |
| Camera | 3D, angled from above (Overcooked-style) |
| Kitchen | **One shared kitchen** — both chefs in the same space, competing for stations and ingredients |
| Controls | Touch: tap a spot/station to walk there; each station is a gesture mini-game |
| Format | Multi-round tournament (e.g. best of 5), each round a different recipe or challenge |
| Persistence | Browser storage on each device (see below) |
| Hosting | Static site on GitHub Pages |

## Game mode: Recipe Duel (current focus)

Both chefs cook **the same recipe** in one shared kitchen. Whoever makes the
dish closest to the recipe wins, as decided by a judge's scorecard.

- **Walk-in pantry and walk-in fridge** behind the kitchen. Both chefs can be inside at
  once (and bump into each other), but stock is limited and shared. Each room also has
  ingredients the recipe doesn't use, so grabbing the wrong one costs points.
- **Recipe peek costs time.** The recipe card isn't always on screen. Tapping
  📜 opens it, but your chef stands still while you read and the clock keeps running.
- **Carry one thing at a time** (Overcooked style).
- **Stations:** walk-in pantry and fridge, 2 chopping boards, a grill with 2 burners,
  a blowtorch, 2 stew pots, one plate per chef on the centre island, the pass, a bin.
  Each has a floating sign and a floor spot, and the one you need next glows.
- **The stove cooks in real time.** Put the patty on and go do something else, but
  come back in time: raw, then medium (green zone), then burnt.
- **Chopping** is the swipe mini-game; cut quality is kept with the ingredient.
- **Plating** stacks items in the order you add them. With empty hands, tapping your
  plate takes the top item back off.
- **Serving** at the pass locks your dish. When both are served, or the 2:30
  timer runs out, the judge scores both plates side by side.

### Scorecard (100 points)

| Category | Points | How |
|---|---|---|
| Ingredients | 30 | Each required ingredient present; extras and wrong ones lose points |
| Prep | 20 | Required ingredients sliced, scored by cut accuracy |
| Cooking | 25 | Patty doneness against the perfect "medium" |
| Assembly | 15 | Stack order compared to the recipe |
| Speed | 10 | Time left when you served |

Recipes (all halal, no pork or alcohol): **Classic Cheeseburger**, **Garden Veggie
Burger**, **Steak & Mash** (potato boiled to mash in a pot) and **Garden Veg Stew**
(stirred in a pot). Burgers need the cheese melted with the blowtorch. For the stew,
"Assembly" is replaced by "Stirring".

Kitchen themes: **Cozy Cottage**, **Retro Diner**, **Night Bistro**, **Spice Market**.
Each changes the floor, wall paint, counter colours, lighting and decor.

### Look and feel

Cozy low-poly kitchen built from free CC0 model packs by Kay Lousberg
([Restaurant Bits](https://kaylousberg.itch.io/restaurant-bits),
[Adventurers](https://kaylousberg.itch.io/kaykit-adventurers)). Chefs are
the rigged adventurer characters with chef hats and aprons, and smooth
blended animations (idle, walk, run, pick up, chop, cheer). Warm lighting,
soft shadows, and steam/smoke/sparkle effects.

The original "carrot race" prototype is a possible future mode (see the
`prototype/shared-kitchen` branch).

## Gesture stations (first pass)

- **Chopping board** — swipe across the ingredient, rhythm/accuracy matters
- **Pot** — draw circles to stir; too fast spills, too slow burns
- **Pan / grill** — hold to cook, release in the "perfect" window to flip
- **Pantry / fridge** — tap the right ingredient (the opponent may grab the last one first)
- **Plating** — drag components onto the plate in recipe order

## Networking model

- The **host** device is authoritative: it owns the game state (who's at which
  station, ingredient stock, round timer, scores).
- The **guest** sends intents ("walk to stove", "chop result: 87%") and the host
  confirms them and broadcasts the state.
- Tap-to-walk keeps traffic small: we sync destinations, not every frame of movement.
- Contention (both reaching the last tomato) is resolved by the host in arrival order.

## Persistence (per device, browser storage)

- **Win/loss record** — head-to-head totals, best times, match history
- **Unlockable recipes** — start with easy dishes, more unlock as you play and win
- **Custom recipes** — add your own dishes; the host's custom recipes are sent to
  the guest when a match starts so both play the same thing
- **Chef customization** — name, color, hat, outfit (sent to the opponent on connect)

## Planned tech stack

- Vite + TypeScript
- Three.js for the 3D kitchen
- PeerJS for WebRTC rooms
- IndexedDB/localStorage for saves
- Deployed to GitHub Pages via GitHub Actions

## Open questions

- Art style: low-poly primitives, or free CC0 models (e.g. Kenney / Quaternius food & kitchen packs)?
- Sabotage: allowed in a shared kitchen (bumping, stealing ingredients), or just competing for space?
- Round list: which recipes/challenges make up the first tournament?
- Sound and music?
