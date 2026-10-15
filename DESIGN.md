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

- **One shared pantry with limited stock.** Only one chef can be in the pantry at
  a time, and there are only a few of each ingredient (e.g. 2 tomatoes, 3 patties).
  It also has ingredients the recipe doesn't use, so grabbing the wrong one costs points.
- **Recipe peek costs time.** The recipe card isn't always on screen. Tapping
  📜 opens it, but your chef stands still while you read and the clock keeps running.
- **Carry one thing at a time** (Overcooked style).
- **Stations:** pantry (shared), 2 chopping boards (shared), stove with 2
  burners (shared), one plate per chef on the centre island, the pass (serve), a bin.
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

First recipe: **Classic Cheeseburger**. Bottom bun, medium patty, sliced cheese,
shredded lettuce, sliced tomato, top bun.

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
