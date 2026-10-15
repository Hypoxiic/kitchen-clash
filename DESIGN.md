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
