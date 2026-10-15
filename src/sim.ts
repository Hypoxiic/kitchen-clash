import { makeStations, SPAWN, WALK } from './layout';
import type { Chef, GameState, Intent, PlayerId, Profile, Station } from './types';

const SPEED = 3.2;
const CHEF_RADIUS = 0.35;
/** How close to a station's standing spot counts as "arrived". */
const REACH = 0.15;
const BLOCKED_REACH = 0.85;
const COUNTDOWN = 3;
const GOAL = 3;

type EventFn = (who: PlayerId, text: string) => void;

/**
 * The authoritative game simulation. Only the host runs this; the guest
 * sends intents over the network and renders whatever state comes back.
 */
export class Sim {
  state: GameState;

  constructor(private onEvent: EventFn) {
    this.state = {
      phase: 'countdown',
      countdown: COUNTDOWN,
      goal: GOAL,
      chefs: {},
      stations: makeStations(),
      winner: null,
    };
  }

  addChef(id: PlayerId, profile: Profile) {
    const spawn = SPAWN[id];
    this.state.chefs[id] = {
      id,
      name: profile.name,
      color: profile.color,
      x: spawn.x,
      z: spawn.z,
      dir: Math.PI,
      tx: spawn.x,
      tz: spawn.z,
      target: null,
      moving: false,
      carrying: null,
      choppingAt: null,
      score: 0,
    };
  }

  removeChef(id: PlayerId) {
    const chef = this.state.chefs[id];
    if (chef) this.releaseBoard(chef);
    delete this.state.chefs[id];
  }

  /** Starts a fresh round with the same chefs. */
  restart() {
    const s = this.state;
    s.phase = 'countdown';
    s.countdown = COUNTDOWN;
    s.winner = null;
    s.stations = makeStations();
    for (const chef of this.chefList()) {
      const spawn = SPAWN[chef.id];
      Object.assign(chef, {
        x: spawn.x, z: spawn.z, tx: spawn.x, tz: spawn.z, dir: Math.PI,
        target: null, moving: false, carrying: null, choppingAt: null, score: 0,
      });
    }
  }

  applyIntent(id: PlayerId, intent: Intent) {
    const chef = this.state.chefs[id];
    if (!chef || this.state.phase !== 'playing') return;

    switch (intent.t) {
      case 'move': {
        this.releaseBoard(chef);
        const st = intent.station ? this.station(intent.station) : undefined;
        chef.tx = clamp(st ? st.ax : intent.x, WALK.minX, WALK.maxX);
        chef.tz = clamp(st ? st.az : intent.z, WALK.minZ, WALK.maxZ);
        chef.target = st?.id ?? null;
        break;
      }
      case 'chopDone': {
        if (!chef.choppingAt) return;
        this.releaseBoard(chef);
        chef.carrying = 'chopped';
        const q = intent.quality;
        this.onEvent(id, q >= 0.85 ? 'Perfect chop! 🔪✨' : q >= 0.6 ? 'Nice chop!' : 'Rough chop…');
        break;
      }
      case 'chopCancel':
        this.releaseBoard(chef);
        break;
    }
  }

  step(dt: number) {
    const s = this.state;
    if (s.phase === 'countdown') {
      s.countdown -= dt;
      if (s.countdown <= 0) s.phase = 'playing';
      return;
    }
    if (s.phase !== 'playing') return;

    const chefs = this.chefList();
    for (const chef of chefs) {
      const dx = chef.tx - chef.x;
      const dz = chef.tz - chef.z;
      const dist = Math.hypot(dx, dz);
      const stepLen = SPEED * dt;
      chef.moving = dist > 0.02;
      if (chef.moving) {
        const k = Math.min(1, stepLen / dist);
        chef.x += dx * k;
        chef.z += dz * k;
        chef.dir = Math.atan2(dx, dz);
      }
    }

    // Chefs bump into each other: push both apart equally.
    if (chefs.length === 2) {
      const [a, b] = chefs;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz) || 0.0001;
      const overlap = CHEF_RADIUS * 2 - d;
      if (overlap > 0) {
        const px = (dx / d) * overlap * 0.5;
        const pz = (dz / d) * overlap * 0.5;
        a.x -= px; a.z -= pz;
        b.x += px; b.z += pz;
      }
    }

    for (const chef of chefs) {
      chef.x = clamp(chef.x, WALK.minX, WALK.maxX);
      chef.z = clamp(chef.z, WALK.minZ, WALK.maxZ);
      if (chef.target && this.reached(chef, chefs)) {
        const st = this.station(chef.target)!;
        chef.target = null;
        chef.tx = chef.x;
        chef.tz = chef.z;
        chef.moving = false;
        // Face the counter.
        chef.dir = Math.atan2(st.x - chef.x, st.z - chef.z);
        this.arrive(chef, st);
      }
    }
  }

  /** At the standing spot, or as close as possible while the other chef blocks it. */
  private reached(chef: Chef, chefs: Chef[]) {
    const dist = Math.hypot(chef.tx - chef.x, chef.tz - chef.z);
    if (dist < REACH) return true;
    const other = chefs.find((c) => c !== chef);
    return !!other && dist < BLOCKED_REACH && Math.hypot(chef.tx - other.x, chef.tz - other.z) < BLOCKED_REACH;
  }

  private arrive(chef: Chef, st: Station) {
    const say = (text: string) => this.onEvent(chef.id, text);
    switch (st.kind) {
      case 'crate':
        if (chef.carrying) say('Your hands are full!');
        else chef.carrying = 'carrot';
        break;
      case 'board':
        if (chef.carrying === 'chopped') say('Already chopped — serve it at the 🛎️');
        else if (chef.carrying !== 'carrot') say('Grab a carrot first 🥕');
        else if (st.occupant && st.occupant !== chef.id) say('Board taken! 😤');
        else {
          st.occupant = chef.id;
          chef.choppingAt = st.id;
        }
        break;
      case 'hatch':
        if (chef.carrying !== 'chopped') {
          say(chef.carrying === 'carrot' ? 'Chop it first! 🔪' : 'Nothing to serve');
          break;
        }
        chef.carrying = null;
        chef.score++;
        say(`Served! ${chef.score}/${this.state.goal}`);
        if (chef.score >= this.state.goal) {
          this.state.phase = 'done';
          this.state.winner = chef.id;
          for (const c of this.chefList()) this.releaseBoard(c);
        }
        break;
    }
  }

  private releaseBoard(chef: Chef) {
    if (!chef.choppingAt) return;
    const st = this.station(chef.choppingAt);
    if (st && st.occupant === chef.id) st.occupant = null;
    chef.choppingAt = null;
  }

  private station(id: string) {
    return this.state.stations.find((s) => s.id === id);
  }

  private chefList(): Chef[] {
    return Object.values(this.state.chefs).filter((c): c is Chef => !!c);
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
