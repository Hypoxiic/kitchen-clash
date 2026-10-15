# Kitchen Clash

A head-to-head 3D cooking game for two players on two phones. Join the same room
with a code, share one kitchen, and battle through a multi-round recipe tournament.

Design notes: [DESIGN.md](DESIGN.md).

## Prototype: what's playable

One round in a shared kitchen. First chef to serve 3 chopped carrots wins.

1. Tap the 🥕 crate to grab a carrot.
2. Tap a 🔪 board, then swipe down through each dashed line to chop.
   Only one chef can use a board at a time.
3. Tap the 🛎️ pass to serve.

**Host a game** on one phone shows a 4-letter code. On the other phone, enter the code and tap **Join**.
**Practice solo** plays alone. Each device keeps your chef name, colour and win/loss record.

## Running it

```bash
npm install
npm run dev
```

`npm run dev` also serves the game on your local network. Open the printed
`Network:` URL on both phones (same Wi-Fi) to play before it's deployed.

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(enable Pages with source "GitHub Actions" in the repo settings first).

## Code map

| File | What it does |
|---|---|
| `src/main.ts` | Menus, game loop, tap input, HUD, wiring host/guest |
| `src/sim.ts` | Authoritative game rules; runs only on the host |
| `src/net.ts` | PeerJS room codes (host/join) |
| `src/scene.ts` | Three.js kitchen, chefs, stations, tap picking |
| `src/chop.ts` | Chopping-board swipe mini-game |
| `src/layout.ts` | Kitchen dimensions and station positions |
| `src/storage.ts` | Local profile and match history |
