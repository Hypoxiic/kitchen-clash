import './style.css';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { loadAssets } from './assets';
import { ChopGame } from './chop';
import { hostRoom, joinRoom } from './net';
import { INGREDIENTS, itemLabel, PANTRY_ORDER, RECIPES } from './recipes';
import { KitchenView } from './scene';
import { sfx } from './sfx';
import { Sim } from './sim';
import { COLORS, loadHistory, loadProfile, recordMatch, saveProfile } from './storage';
import type { GameState, Intent, NetMsg, PlayerId } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const STATE_SEND_MS = 50;
const TAP_SLOP_PX = 14;

const view = new KitchenView($<HTMLCanvasElement>('scene'));
const chop = new ChopGame();

let profile = loadProfile();
let me: PlayerId = 'host';
/** Only set on the host (or in solo practice). */
let sim: Sim | null = null;
let peer: Peer | null = null;
let conn: DataConnection | null = null;
let state: GameState | null = null;
let stateAt = 0;
let prev: GameState | null = null;
/** Board we just finished/left locally; don't reopen it while the host catches up. */
let chopLock: string | null = null;
let pantryLock = false;
let serveDismissed = false;
let judgeShown = false;

const them = () => (me === 'host' ? 'guest' : 'host') as PlayerId;

// ---------- Menu ----------

function renderMenu() {
  $<HTMLInputElement>('name').value = profile.name;
  const swatches = $('colors');
  swatches.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === profile.color ? ' selected' : '');
    b.style.background = c;
    b.ariaLabel = `Colour ${c}`;
    b.onclick = () => {
      profile = { ...profile, color: c };
      saveProfile(profile);
      renderMenu();
    };
    swatches.append(b);
  }
  const history = loadHistory();
  const wins = history.filter((m) => m.won).length;
  $('record').textContent = history.length ? `Record: ${wins}W – ${history.length - wins}L` : '';
}

$<HTMLInputElement>('name').addEventListener('input', (e) => {
  profile = { ...profile, name: (e.target as HTMLInputElement).value.trim() || 'Chef' };
  saveProfile(profile);
});
$<HTMLInputElement>('join-code').addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '');
});
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

type Screen = 'loading' | 'menu' | 'lobby' | null;
function showScreen(id: Screen) {
  for (const s of ['loading', 'menu', 'lobby']) $(s).hidden = s !== id;
  $('hud').hidden = id !== null;
}

function menuError(msg: string) {
  $('menu-error').textContent = msg;
}

// ---------- Starting a game ----------

$('btn-solo').onclick = () => {
  me = 'host';
  sim = new Sim(onSimEvent);
  sim.addChef('host', profile);
  beginMatch();
};

$('btn-host').onclick = async () => {
  menuError('');
  me = 'host';
  $('room-code').textContent = '····';
  showScreen('lobby');
  try {
    const room = await hostRoom();
    peer = room.peer;
    $('room-code').textContent = room.code;
    peer.on('connection', (c) => {
      if (conn) {
        c.on('open', () => c.close()); // Room is full.
        return;
      }
      conn = c;
      c.on('data', (d) => onHostData(d as NetMsg));
      c.on('close', () => leave('Your opponent left.'));
    });
    peer.on('disconnected', () => peer?.reconnect());
  } catch (err) {
    leave((err as Error).message || 'Could not create a room.');
  }
};

$('btn-join').onclick = async () => {
  const code = $<HTMLInputElement>('join-code').value;
  if (code.length !== 4) return menuError('Enter the 4-letter room code.');
  menuError('Connecting…');
  try {
    const room = await joinRoom(code);
    me = 'guest';
    peer = room.peer;
    conn = room.conn;
    conn.on('data', (d) => onGuestData(d as NetMsg));
    conn.on('close', () => leave('The host left.'));
    conn.send({ t: 'hello', profile } satisfies NetMsg);
    menuError('Joined! Starting…');
  } catch (err) {
    menuError((err as Error).message);
  }
};

$('btn-cancel').onclick = () => leave();
$('btn-leave').onclick = () => leave();
$('btn-rematch').onclick = () => {
  sim?.restart();
  judgeShown = false;
  $('judge').hidden = true;
};

function onHostData(msg: NetMsg) {
  if (msg.t === 'hello') {
    sim = new Sim(onSimEvent);
    sim.addChef('host', profile);
    sim.addChef('guest', msg.profile);
    beginMatch();
  } else if (msg.t === 'intent') {
    sim?.applyIntent('guest', msg.i);
  }
}

function onGuestData(msg: NetMsg) {
  if (msg.t === 'state') {
    const first = !state;
    state = msg.s;
    stateAt = performance.now();
    if (first) beginMatch();
  } else if (msg.t === 'event' && msg.who === me) {
    toast(msg.text);
  }
}

function onSimEvent(who: PlayerId, text: string) {
  if (who === me) toast(text);
  else conn?.send({ t: 'event', who, text } satisfies NetMsg);
}

function beginMatch() {
  view.reset();
  chopLock = null;
  judgeShown = false;
  prev = null;
  menuError('');
  showScreen(null);
}

function leave(reason = '') {
  chop.close();
  for (const id of ['pantry', 'recipe', 'serve', 'judge', 'intro']) $(id).hidden = true;
  conn?.close();
  peer?.destroy();
  conn = null;
  peer = null;
  sim = null;
  state = null;
  view.reset();
  sfx.sizzle(0);
  renderMenu();
  showScreen('menu');
  menuError(reason);
}

function sendIntent(i: Intent) {
  if (sim) sim.applyIntent(me, i);
  else conn?.send({ t: 'intent', i } satisfies NetMsg);
}

// ---------- Input: tap to walk ----------

const canvas = $<HTMLCanvasElement>('scene');
let down: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  if (!down || !state || state.phase !== 'cooking') return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > TAP_SLOP_PX) return;
  const hit = view.pick(e.clientX, e.clientY);
  if (!hit) return;
  const st = hit.station ? state.stations.find((s) => s.id === hit.station) : undefined;
  view.showMarker(st ? st.ax : hit.x, st ? st.az : hit.z);
  sfx.tap();
  serveDismissed = false;
  sendIntent({ t: 'move', x: hit.x, z: hit.z, station: hit.station });
});

// ---------- Recipe card ----------

$('btn-recipe').onclick = () => {
  if (state?.phase !== 'cooking') return;
  sendIntent({ t: 'read', on: true });
  openRecipe();
};
$('recipe-close').onclick = () => {
  $('recipe').hidden = true;
  sendIntent({ t: 'read', on: false });
};

function openRecipe() {
  const recipe = RECIPES[state?.recipe ?? 'cheeseburger'];
  $('recipe-name').textContent = `${recipe.emoji} ${recipe.name}`;
  $('recipe-steps').innerHTML = recipe.steps.map((s) => `<li>${s}</li>`).join('');
  $('recipe').hidden = false;
}

// ---------- Pantry ----------

$('pantry-close').onclick = () => {
  pantryLock = true;
  $('pantry').hidden = true;
  sendIntent({ t: 'closePantry' });
};

function renderPantry(s: GameState) {
  const grid = $('pantry-grid');
  if (!grid.children.length) {
    for (const kind of PANTRY_ORDER) {
      const b = document.createElement('button');
      b.className = 'pantry-item';
      b.dataset.kind = kind;
      b.innerHTML = `<span class="emoji">${INGREDIENTS[kind].emoji}</span><span class="label">${INGREDIENTS[kind].name}</span><span class="stock"></span>`;
      b.onclick = () => {
        pantryLock = true;
        $('pantry').hidden = true;
        sendIntent({ t: 'take', kind });
      };
      grid.append(b);
    }
  }
  for (const b of grid.children as HTMLCollectionOf<HTMLButtonElement>) {
    const n = s.stock[b.dataset.kind as keyof typeof s.stock];
    b.disabled = n <= 0;
    b.querySelector('.stock')!.textContent = n <= 0 ? 'Gone' : `×${n}`;
    b.classList.toggle('last', n === 1);
  }
}

// ---------- Serve ----------

$('serve-yes').onclick = () => {
  $('serve').hidden = true;
  sendIntent({ t: 'serve' });
};
$('serve-no').onclick = () => {
  serveDismissed = true;
  $('serve').hidden = true;
};

// ---------- Per-frame UI sync ----------

function syncHud(s: GameState) {
  const mine = s.chefs[me];
  const theirs = s.chefs[them()];
  const chip = (el: HTMLElement, chef: typeof mine) => {
    if (!chef) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.setProperty('--c', chef.color);
    el.textContent = `${chef.name}${chef.served ? ' ✓' : ''}`;
  };
  chip($('chip-me'), mine);
  chip($('chip-them'), theirs);

  const t = Math.ceil(s.phase === 'intro' ? s.roundTime : s.timeLeft);
  const timer = $('timer');
  timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  timer.classList.toggle('low', s.phase === 'cooking' && t <= 20);
  timer.hidden = s.phase === 'judging';

  const held = $('held');
  held.hidden = !mine?.held;
  if (mine?.held) held.textContent = `${INGREDIENTS[mine.held.kind].emoji} ${itemLabel(mine.held)}`;

  $('hint').textContent = hintFor(s);
  $('btn-recipe').hidden = s.phase !== 'cooking' || !!mine?.served;
}

function hintFor(s: GameState): string {
  const mine = s.chefs[me];
  if (!mine || s.phase !== 'cooking' || mine.busy) return '';
  if (mine.served) return 'Served! Waiting for the judge…';
  const plate = s.plates[me];
  if (!plate.length && !mine.held) return 'Head to the 🧺 pantry to start';
  if (mine.held) {
    const info = INGREDIENTS[mine.held.kind];
    if (info.grill && mine.held.doneness < 0.6) return 'Grill it on the 🔥 stove';
    if (info.cuts && !mine.held.sliced && RECIPES[s.recipe].slice.includes(mine.held.kind)) return 'Slice it on a 🔪 board';
    return 'Add it to your plate (centre island)';
  }
  if (plate.length >= RECIPES[s.recipe].stack.length) return 'Looking good! Serve it at the 🛎️ pass';
  return '';
}

function syncIntro(s: GameState) {
  const intro = $('intro');
  intro.hidden = s.phase !== 'intro';
  if (intro.hidden) return;
  const recipe = RECIPES[s.recipe];
  $('intro-emoji').textContent = recipe.emoji;
  $('intro-name').textContent = recipe.name;
  const n = Math.max(1, Math.ceil(s.countdown));
  const el = $('intro-count');
  if (el.textContent !== String(n)) {
    el.textContent = String(n);
    if (n <= 3) sfx.tick();
  }
}

function syncOverlays(s: GameState) {
  const mine = s.chefs[me];
  if (!mine) return;

  // Pantry sheet follows the host's state (one chef at a time).
  if (mine.busy !== 'pantry') pantryLock = false;
  const pantryOpen = mine.busy === 'pantry' && !pantryLock;
  $('pantry').hidden = !pantryOpen;
  if (pantryOpen) renderPantry(s);

  // Chopping.
  const at = mine.busy === 'chopping' ? mine.busyAt : null;
  if (!at) chopLock = null;
  if (at && mine.held && !chop.isOpen && at !== chopLock) {
    chop.open(
      mine.held.kind,
      (quality) => {
        chopLock = at;
        sendIntent({ t: 'chopDone', quality });
      },
      () => {
        chopLock = at;
        sendIntent({ t: 'chopCancel' });
      },
    );
  } else if (!at && chop.isOpen) chop.close();

  // Recipe card closes if the round ends.
  if (s.phase !== 'cooking') $('recipe').hidden = true;

  // Serve prompt.
  if (!mine.atPass) serveDismissed = false;
  const serveOpen = mine.atPass && !mine.served && !serveDismissed && s.phase === 'cooking';
  if (serveOpen && $('serve').hidden) {
    $('serve-summary').textContent = s.plates[me].map((i) => itemLabel(i)).join(' · ') || 'Nothing on your plate';
  }
  $('serve').hidden = !serveOpen;
}

/** Sounds for things that changed since the last frame. */
function syncSounds(s: GameState) {
  const mine = s.chefs[me];
  const old = prev?.chefs[me];
  if (prev && mine && old) {
    if (mine.emote.seq !== old.emote.seq) {
      if (mine.emote.name === 'PickUp') sfx.pickup();
      else if (mine.emote.name === 'Interact') sfx.place();
    }
    if (mine.served && !old.served) sfx.ding();
  }
  if (prev?.phase === 'intro' && s.phase === 'cooking') sfx.go();
  const cooking = s.phase === 'cooking' ? s.stations.filter((st) => st.kind === 'stove' && st.item).length : 0;
  sfx.sizzle(cooking);
}

// ---------- Judging ----------

const ROW_DELAY = 900;

function syncJudging(s: GameState) {
  const judge = $('judge');
  if (s.phase !== 'judging') {
    if (judgeShown) {
      judgeShown = false;
      judge.hidden = true;
    }
    return;
  }
  if (judgeShown) return;
  judgeShown = true;
  chop.close();
  for (const id of ['pantry', 'recipe', 'serve']) $(id).hidden = true;

  const mine = s.chefs[me]!;
  const theirs = s.chefs[them()];
  const sMe = s.scores[me]!;
  const sThem = theirs ? s.scores[them()] : undefined;

  judge.classList.toggle('solo', !theirs);
  $('judge-me').textContent = mine.name;
  $('judge-me').style.color = mine.color;
  $('judge-them').textContent = theirs?.name ?? '';
  $('judge-them').style.color = theirs?.color ?? '';
  $('total-me').textContent = '–';
  $('total-them').textContent = theirs ? '–' : '';
  $('judge-result').textContent = '';
  $('judge-buttons').hidden = true;
  $('btn-rematch').hidden = me !== 'host';

  const rows = $('judge-rows');
  rows.innerHTML = '';
  sMe.rows.forEach((row, i) => {
    const other = sThem?.rows[i];
    const el = document.createElement('div');
    el.className = 'score-row';
    el.innerHTML = `
      <span class="label">${row.label}<small>${row.note}${other ? ` · ${other.note}` : ''}</small></span>
      <b class="me"><i style="--w:${(row.score / row.max) * 100}%;--c:${mine.color}"></i>${row.score}<small>/${row.max}</small></b>
      <b class="them">${other ? `<i style="--w:${(other.score / other.max) * 100}%;--c:${theirs!.color}"></i>${other.score}<small>/${other.max}</small>` : ''}</b>`;
    rows.append(el);
  });

  judge.hidden = false;
  const items = [...rows.children] as HTMLElement[];
  const start = 1600; // let the camera arrive first
  items.forEach((el, i) =>
    setTimeout(() => {
      el.classList.add('shown');
      sfx.reveal();
    }, start + i * ROW_DELAY),
  );
  setTimeout(() => {
    $('total-me').textContent = String(sMe.total);
    if (sThem) $('total-them').textContent = String(sThem.total);
    const result = $('judge-result');
    if (!theirs) {
      result.textContent = sMe.total >= 85 ? 'Chef’s kiss! 👨‍🍳' : sMe.total >= 60 ? 'Solid dish!' : 'Back to culinary school…';
      if (sMe.total >= 60) {
        view.celebrate();
        sfx.fanfare();
        view.setResultPose(me, 'Cheer');
      }
    } else if (s.winner === 'tie') {
      result.textContent = "It's a tie! 🤝";
      sfx.fanfare();
    } else {
      const won = s.winner === me;
      const winner = s.chefs[s.winner as PlayerId]!;
      result.textContent = won ? 'You win! 🏆' : `${winner.name} wins! 🏆`;
      view.celebrate();
      if (won) sfx.fanfare();
      else sfx.aww();
      view.setResultPose(s.winner as PlayerId, 'Cheer');
      view.setResultPose(won ? them() : me, 'Sit_Floor_Idle');
      recordMatch({ opponent: theirs.name, won, at: Date.now() });
    }
    $('judge-buttons').hidden = false;
    if (me === 'guest') $('btn-rematch').hidden = true;
  }, start + items.length * ROW_DELAY + 400);
}

// ---------- Toasts ----------

function toast(text: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  const box = $('toasts');
  box.append(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => el.remove(), 2200);
}

// ---------- Main loop ----------

let last = performance.now();
let lastSend = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    tick(now, dt);
  } catch (err) {
    // Keep the game running; one bad frame shouldn't freeze it.
    console.error(err);
  }
}

function tick(now: number, dt: number) {
  if (sim) {
    sim.step(dt);
    state = sim.state;
    stateAt = now;
    if (conn?.open && now - lastSend > STATE_SEND_MS) {
      conn.send({ t: 'state', s: state } satisfies NetMsg);
      lastSend = now;
    }
  }

  if (state) {
    syncHud(state);
    syncIntro(state);
    syncOverlays(state);
    syncSounds(state);
    syncJudging(state);
    prev = structuredClone(state);
  }
  view.update(state ?? idleState, me, dt, (now - stateAt) / 1000);
}

const idleState: GameState = {
  phase: 'intro', countdown: 0, timeLeft: 0, roundTime: 0, recipe: 'cheeseburger', chefs: {}, stations: [],
  plates: { host: [], guest: [] }, stock: RECIPES.cheeseburger.stock, scores: {}, winner: null,
};

// ---------- Boot ----------

showScreen('loading');
requestAnimationFrame(frame);
loadAssets((p) => ($('load-bar').style.width = `${Math.round(p * 100)}%`))
  .then(() => {
    view.build();
    idleState.stations = sim?.state.stations ?? new Sim(() => {}).state.stations;
    renderMenu();
    showScreen('menu');
  })
  .catch((err) => {
    console.error(err);
    $('loading').querySelector('.small')!.textContent = 'Could not load the kitchen. Check your connection and reload.';
  });

// Kept for debugging in the console.
Object.assign(window, { kc: { get state() { return state; }, get sim() { return sim; } } });
