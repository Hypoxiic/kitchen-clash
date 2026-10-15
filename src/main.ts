import './style.css';
import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { ChopGame } from './chop';
import { makeStations } from './layout';
import { hostRoom, joinRoom } from './net';
import { KitchenView } from './scene';
import { Sim } from './sim';
import { COLORS, loadHistory, loadProfile, recordMatch, saveProfile } from './storage';
import type { GameState, Intent, NetMsg, PlayerId } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const STATE_SEND_MS = 50;
const TAP_SLOP_PX = 14;

const view = new KitchenView($<HTMLCanvasElement>('scene'));
view.setStations(makeStations());
const chop = new ChopGame();

let profile = loadProfile();
let me: PlayerId = 'host';
/** Only set on the host (or in solo practice). */
let sim: Sim | null = null;
let peer: Peer | null = null;
let conn: DataConnection | null = null;
let state: GameState | null = null;
/** Board we just finished/left locally; don't reopen it while the host catches up. */
let chopLock: string | null = null;
let resultShown = false;
let roundStart = 0;
let roundTime = 0;

const idleState: GameState = {
  phase: 'countdown', countdown: 0, goal: 0, chefs: {}, stations: makeStations(), winner: null,
};

// ---------- Menu ----------

function renderMenu() {
  const nameInput = $<HTMLInputElement>('name');
  nameInput.value = profile.name;
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

function showScreen(id: 'menu' | 'lobby' | 'result' | null) {
  for (const s of ['menu', 'lobby', 'result']) $(s).hidden = s !== id;
  $('hud').hidden = id === 'menu' || id === 'lobby';
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
  resultShown = false;
  showScreen(null);
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
  resultShown = false;
  menuError('');
  showScreen(null);
}

function leave(reason = '') {
  chop.close();
  conn?.close();
  peer?.destroy();
  conn = null;
  peer = null;
  sim = null;
  state = null;
  view.reset();
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
  if (!down || !state || state.phase !== 'playing') return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  down = null;
  if (moved > TAP_SLOP_PX) return;
  const hit = view.pick(e.clientX, e.clientY);
  if (!hit) return;
  const st = hit.station ? state.stations.find((s) => s.id === hit.station) : undefined;
  view.showMarker(st ? st.ax : hit.x, st ? st.az : hit.z);
  sendIntent({ t: 'move', x: hit.x, z: hit.z, station: hit.station });
});

// ---------- HUD ----------

function updateHud(s: GameState) {
  const scores = $('hud').querySelector('.scores')!;
  scores.innerHTML = '';
  for (const id of ['host', 'guest'] as PlayerId[]) {
    const chef = s.chefs[id];
    if (!chef) continue;
    const el = document.createElement('div');
    el.className = 'score' + (id === me ? ' me' : '');
    el.innerHTML = `<i style="background:${chef.color}"></i><span></span><b>${chef.score}/${s.goal}</b>`;
    el.querySelector('span')!.textContent = chef.name;
    scores.append(el);
  }
  const mine = s.chefs[me];
  const hint = $('hud').querySelector('.hint')!;
  hint.textContent =
    s.phase !== 'playing' || !mine
      ? ''
      : mine.carrying === 'carrot'
        ? 'Tap a 🔪 board to chop'
        : mine.carrying === 'chopped'
          ? 'Tap the 🛎️ pass to serve'
          : 'Tap the 🥕 crate';

  const cd = $('countdown');
  cd.hidden = s.phase !== 'countdown';
  if (!cd.hidden) cd.textContent = String(Math.max(1, Math.ceil(s.countdown)));
}

function syncChop(s: GameState) {
  const at = s.chefs[me]?.choppingAt ?? null;
  if (!at) chopLock = null;
  if (at && !chop.isOpen && at !== chopLock) {
    chop.open(
      (quality) => {
        chopLock = at;
        sendIntent({ t: 'chopDone', quality });
      },
      () => {
        chopLock = at;
        sendIntent({ t: 'chopCancel' });
      },
    );
  } else if (!at && chop.isOpen) {
    chop.close();
  }
}

function syncResult(s: GameState, now: number) {
  if (s.phase === 'countdown') roundStart = now;
  if (s.phase === 'playing') roundTime = (now - roundStart) / 1000;

  if (s.phase !== 'done') {
    if (resultShown) {
      resultShown = false;
      showScreen(null);
    }
    return;
  }
  if (resultShown) return;
  resultShown = true;
  chop.close();

  const opponent = s.chefs[me === 'host' ? 'guest' : 'host'];
  const won = s.winner === me;
  const winner = s.winner ? s.chefs[s.winner] : undefined;
  $('result-title').textContent = !opponent ? 'Service complete! 🍽️' : won ? 'You win! 🏆' : `${winner?.name ?? 'They'} wins!`;
  $('result-sub').textContent = `${s.goal} dishes served in ${roundTime.toFixed(1)}s`;
  $('btn-rematch').hidden = me !== 'host';
  $('btn-rematch').textContent = opponent ? 'Rematch' : 'Play again';
  if (me === 'guest') $('result-sub').textContent += ' · waiting for the host to start a rematch';
  if (opponent) recordMatch({ opponent: opponent.name, won, at: Date.now() });
  showScreen('result');
}

// ---------- Toasts ----------

function toast(text: string) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').append(el);
  setTimeout(() => el.remove(), 1800);
}

// ---------- Main loop ----------

let last = performance.now();
let lastSend = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (sim) {
    sim.step(dt);
    state = sim.state;
    if (conn?.open && now - lastSend > STATE_SEND_MS) {
      conn.send({ t: 'state', s: state } satisfies NetMsg);
      lastSend = now;
    }
  }

  if (state) {
    updateHud(state);
    syncChop(state);
    syncResult(state, now);
  }
  view.update(state ?? idleState, me, dt);
  requestAnimationFrame(frame);
}

renderMenu();
showScreen('menu');
requestAnimationFrame(frame);
