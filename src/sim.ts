import { CHEF_RADIUS, makeStations, SPAWN } from './layout';
import { findPath, resolve } from './path';
import {
  BURNT_AT, INGREDIENTS, itemLabel, newItem, potResult, RECIPE_IDS, RECIPES, scoreDish, SECONDS_IN_POT, SECONDS_TO_MEDIUM,
  type Recipe,
} from './recipes';
import { COLORS } from './storage';
import { THEME_IDS } from './themes';
import type { Chef, GameState, Intent, PlayerId, Profile, RoundSettings, Station } from './types';

const MAX_SPEED = 4.2;
const ACCEL = 22;
const DECEL = 14;
const INTRO = 4;
/** When the other chef is standing on the spot, this close counts as arrived. */
const BLOCKED_REACH = 1.0;
const POT_CAPACITY = 4;

type EventFn = (who: PlayerId, text: string) => void;

/**
 * The authoritative game simulation. Only the host runs this; the guest
 * sends intents over the network and renders whatever state comes back.
 */
export class Sim {
  state!: GameState;
  private recipe!: Recipe;
  private theme = 'cottage';
  private profiles: Partial<Record<PlayerId, Profile>> = {};

  constructor(private onEvent: EventFn, private settings: RoundSettings) {
    this.pickRound();
    this.state = this.freshState();
  }

  addChef(id: PlayerId, profile: Profile) {
    // Two chefs in the same apron would be confusing; the joiner gets another colour.
    const taken = Object.values(this.profiles).map((p) => p!.color);
    if (taken.includes(profile.color)) profile = { ...profile, color: COLORS.find((c) => !taken.includes(c))! };
    this.profiles[id] = profile;
    this.state.chefs[id] = this.freshChef(id, profile);
  }

  /** Starts a fresh round with the same chefs (re-rolling anything set to random). */
  restart() {
    this.pickRound();
    this.state = this.freshState();
    for (const [id, profile] of Object.entries(this.profiles) as [PlayerId, Profile][]) {
      this.state.chefs[id] = this.freshChef(id, profile);
    }
  }

  private pickRound() {
    const pick = (choice: string, all: string[], current?: string) => {
      if (choice !== 'random') return choice;
      const options = all.filter((id) => id !== current);
      return options[Math.floor(Math.random() * options.length)];
    };
    this.recipe = RECIPES[pick(this.settings.recipe, RECIPE_IDS, this.recipe?.id)];
    this.theme = pick(this.settings.theme, THEME_IDS, this.theme);
  }

  applyIntent(id: PlayerId, intent: Intent) {
    const s = this.state;
    const chef = s.chefs[id];
    if (!chef || s.phase !== 'cooking') return;

    switch (intent.t) {
      case 'move': {
        if (chef.busy === 'reading') return;
        this.release(chef);
        let st = intent.station ? this.station(intent.station) : undefined;
        // Tapping the island (or the other plate) always means your own plate.
        if (st?.kind === 'plate' && st.owner !== id) st = this.station(`plate-${id}`);
        const tx = st ? st.ax : intent.x;
        const tz = st ? st.az : intent.z;
        chef.path = findPath(chef.x, chef.z, tx, tz);
        chef.target = st?.id ?? null;
        chef.atPass = false;
        chef.atPlate = false;
        break;
      }
      case 'take': {
        if (chef.busy !== 'store' || chef.held) return;
        const room = this.station(chef.busyAt!)?.store;
        if (INGREDIENTS[intent.kind].store !== room) return;
        if ((s.stock[intent.kind] ?? 0) <= 0) return this.say(id, `No ${INGREDIENTS[intent.kind].name.toLowerCase()} left!`);
        s.stock[intent.kind]!--;
        chef.held = newItem(intent.kind);
        this.release(chef);
        this.emote(chef, 'PickUp');
        break;
      }
      case 'closeStore':
        if (chef.busy === 'store') this.release(chef);
        break;
      case 'gameDone': {
        const q = Math.max(0, Math.min(1, intent.quality));
        const at = chef.busyAt ? this.station(chef.busyAt) : undefined;
        if (chef.busy === 'chopping' && chef.held) {
          chef.held.sliced = true;
          chef.held.cut = q;
          this.say(id, q >= 0.85 ? 'Perfect slices! 🔪✨' : q >= 0.6 ? 'Nice knife work' : 'A bit rough…');
        } else if (chef.busy === 'torching' && chef.held) {
          chef.held.melt = q;
          this.say(id, q >= 0.85 ? 'Gloriously melty! 🧀✨' : q >= 0.5 ? 'Nicely melted' : 'Patchy melt…');
        } else if (chef.busy === 'stirring' && at) {
          at.stir = Math.min(1, at.stir + q * 0.5);
          this.say(id, at.stir >= 1 ? 'Perfectly stirred' : 'Stirred! Give it another go later');
        } else return;
        this.release(chef);
        break;
      }
      case 'gameCancel':
        if (chef.busy === 'chopping' || chef.busy === 'torching' || chef.busy === 'stirring') this.release(chef);
        break;
      case 'read':
        if (intent.on && !chef.busy) {
          chef.busy = 'reading';
          chef.path = [];
          chef.target = null;
        } else if (!intent.on && chef.busy === 'reading') {
          chef.busy = null;
        }
        break;
      case 'takeBack': {
        const plate = s.plates[id];
        if (!chef.atPlate || chef.held || chef.served || !plate.length) return;
        chef.held = plate.pop()!;
        this.emote(chef, 'PickUp');
        break;
      }
      case 'serve': {
        if (!chef.atPass || chef.served || !s.plates[id].length) return;
        chef.served = true;
        chef.servedTimeLeft = s.timeLeft;
        chef.atPass = false;
        this.emote(chef, 'Interact');
        this.say(id, 'Order up! 🛎️');
        const other = this.other(id);
        if (other) this.say(other, `${chef.name} has served!`);
        if (this.chefList().every((c) => c.served)) this.endRound();
        break;
      }
    }
  }

  step(dt: number) {
    const s = this.state;
    if (s.phase === 'intro') {
      s.countdown -= dt;
      if (s.countdown <= 0) s.phase = 'cooking';
      return;
    }
    if (s.phase !== 'cooking') return;

    s.timeLeft = Math.max(0, s.timeLeft - dt);
    if (s.timeLeft === 0) return this.endRound();

    for (const st of s.stations) {
      if (st.kind === 'stove' && st.item) {
        const before = st.item.doneness;
        st.item.doneness = Math.min(2, before + dt / SECONDS_TO_MEDIUM);
        this.cookWarnings(st, before, st.item.doneness, INGREDIENTS[st.item.kind].name.toLowerCase());
      } else if (st.kind === 'pot' && st.pot.length) {
        const before = st.cook;
        st.cook = Math.min(2, before + dt / SECONDS_IN_POT);
        this.cookWarnings(st, before, st.cook, INGREDIENTS[potResult(st.pot.map((i) => i.kind))].name.toLowerCase());
      }
    }

    const chefs = this.chefList();
    for (const chef of chefs) this.walk(chef, dt);

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
      [chef.x, chef.z] = resolve(chef.x, chef.z);
      if (chef.target && this.reached(chef, chefs)) {
        const st = this.station(chef.target)!;
        chef.path = [];
        chef.target = null;
        chef.dir = st.face;
        this.arrive(chef, st);
      }
    }
  }

  private cookWarnings(st: Station, before: number, after: number, what: string) {
    if (!st.by) return;
    if (before < 0.85 && after >= 0.85) this.say(st.by, `Your ${what} is nearly ready! 🔥`);
    if (before < BURNT_AT && after >= BURNT_AT) this.say(st.by, `Your ${what} burnt! 💨`);
  }

  private walk(chef: Chef, dt: number) {
    const wp = chef.path[0];
    if (!wp) {
      chef.speed = Math.max(0, chef.speed - ACCEL * dt);
      return;
    }
    // Distance left along the whole path, to ease out at the end.
    let remaining = Math.hypot(wp[0] - chef.x, wp[1] - chef.z);
    for (let i = 1; i < chef.path.length; i++)
      remaining += Math.hypot(chef.path[i][0] - chef.path[i - 1][0], chef.path[i][1] - chef.path[i - 1][1]);
    const want = Math.min(MAX_SPEED, Math.sqrt(2 * DECEL * remaining) + 0.6);
    chef.speed = chef.speed < want ? Math.min(want, chef.speed + ACCEL * dt) : want;

    let step = chef.speed * dt;
    while (step > 0 && chef.path.length) {
      const [tx, tz] = chef.path[0];
      const dx = tx - chef.x;
      const dz = tz - chef.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.001) chef.dir = Math.atan2(dx, dz);
      if (d <= step) {
        chef.x = tx;
        chef.z = tz;
        chef.path.shift();
        step -= d;
      } else {
        chef.x += (dx / d) * step;
        chef.z += (dz / d) * step;
        step = 0;
      }
    }
  }

  /** At the spot, or as close as possible while the other chef blocks it. */
  private reached(chef: Chef, chefs: Chef[]) {
    if (!chef.path.length) return true;
    const st = this.station(chef.target!)!;
    const dist = Math.hypot(st.ax - chef.x, st.az - chef.z);
    const other = chefs.find((c) => c !== chef);
    return !!other && dist < BLOCKED_REACH && Math.hypot(st.ax - other.x, st.az - other.z) < CHEF_RADIUS * 2;
  }

  private arrive(chef: Chef, st: Station) {
    const s = this.state;
    const id = chef.id;
    const say = (text: string) => this.say(id, text);
    const held = chef.held;
    if (chef.served && st.kind !== 'pass') return say('You already served your dish');
    const info = held ? INGREDIENTS[held.kind] : null;
    const name = info?.name.toLowerCase() ?? '';

    switch (st.kind) {
      case 'store':
        // Both chefs can be in a walk-in at once; they just bump into each other.
        if (held) return say('Hands full! Put that down first');
        chef.busy = 'store';
        chef.busyAt = st.id;
        this.emote(chef, 'Interact');
        break;

      case 'board':
        if (!held) return say('Bring something to chop');
        if (!info!.cuts) return say(`No need to chop the ${name}`);
        if (held.sliced) return say('Already chopped');
        if (st.occupant && st.occupant !== id) return say('Board taken! 😤');
        this.occupy(chef, st, 'chopping');
        break;

      case 'torch':
        if (!held) return say('Bring sliced cheese to melt');
        if (!info!.torch) return say('Only cheese goes under the torch');
        if (!held.sliced) return say('Slice the cheese first');
        if (held.melt >= 0) return say('Already melted');
        if (st.occupant && st.occupant !== id) return say('Torch in use! 🔥');
        this.occupy(chef, st, 'torching');
        break;

      case 'stove':
        if (st.item) {
          if (held) return say("This burner's busy");
          if (st.by && st.by !== id) say(`You took ${this.nameOf(st.by)}'s food 😈`);
          chef.held = st.item;
          st.item = null;
          st.by = null;
          this.emote(chef, 'PickUp');
          say(itemLabel(chef.held));
        } else if (held) {
          if (!info!.grill) return say("That doesn't go on the grill");
          if (held.doneness >= BURNT_AT) return say("It's already burnt…");
          st.item = held;
          st.by = id;
          chef.held = null;
          this.emote(chef, 'Interact');
          say('Sizzle! Come back when the gauge is green');
        } else say('Bring something to grill');
        break;

      case 'pot':
        if (held) {
          if (!info!.pot) return say("That doesn't go in the pot");
          if (!held.sliced) return say(`Chop the ${name} first`);
          if (st.pot.length >= POT_CAPACITY) return say("The pot's full");
          st.pot.push(held);
          st.by = id;
          chef.held = null;
          this.emote(chef, 'Interact');
          say(`Into the pot! Tap it with empty hands to stir`);
        } else if (!st.pot.length) {
          say('Bring chopped veg for the pot');
        } else if (st.cook >= 0.8) {
          // Scoop it out.
          const contents = st.pot.map((i) => i.kind);
          const dish = newItem(potResult(contents));
          dish.sliced = true;
          dish.contents = contents;
          dish.doneness = st.cook;
          dish.stir = st.stir;
          dish.cut = st.pot.reduce((a, i) => a + i.cut, 0) / st.pot.length;
          if (st.by && st.by !== id) say(`You scooped ${this.nameOf(st.by)}'s pot 😈`);
          st.pot = [];
          st.cook = 0;
          st.stir = 0;
          st.by = null;
          chef.held = dish;
          this.emote(chef, 'PickUp');
          say(`Scooped up the ${itemLabel(dish).toLowerCase()}`);
        } else {
          if (st.occupant && st.occupant !== id) return say('Someone is stirring that pot');
          this.occupy(chef, st, 'stirring');
        }
        break;

      case 'plate': {
        const plate = s.plates[id];
        chef.atPlate = true;
        if (held) {
          plate.push(held);
          chef.held = null;
          this.emote(chef, 'Interact');
        } else if (!plate.length) say('Your plate is empty');
        break;
      }

      case 'pass':
        if (chef.served) return say('Already served. Waiting for the judge');
        if (!s.plates[id].length) return say('Your plate is empty');
        chef.atPass = true;
        break;

      case 'bin':
        if (!held) return;
        say(`Binned the ${itemLabel(held).toLowerCase()}`);
        chef.held = null;
        this.emote(chef, 'Interact');
        break;
    }
  }

  private occupy(chef: Chef, st: Station, busy: Chef['busy']) {
    st.occupant = chef.id;
    chef.busy = busy;
    chef.busyAt = st.id;
  }

  private endRound() {
    const s = this.state;
    s.phase = 'judging';
    for (const chef of this.chefList()) {
      this.release(chef);
      chef.path = [];
      chef.target = null;
      chef.atPass = false;
      chef.atPlate = false;
      s.scores[chef.id] = scoreDish(this.recipe, s.plates[chef.id], chef.served, chef.servedTimeLeft);
    }
    const h = s.scores.host?.total ?? -1;
    const g = s.scores.guest?.total ?? -1;
    s.winner = !s.chefs.guest ? 'host' : h === g ? 'tie' : h > g ? 'host' : 'guest';
  }

  /** Frees whatever station the chef is busy at. */
  private release(chef: Chef) {
    if (chef.busyAt) {
      const st = this.station(chef.busyAt);
      if (st && st.occupant === chef.id) st.occupant = null;
    }
    chef.busy = null;
    chef.busyAt = null;
  }

  private emote(chef: Chef, name: string) {
    chef.emote = { name, seq: chef.emote.seq + 1 };
  }

  private say(who: PlayerId, text: string) {
    this.onEvent(who, text);
  }

  private nameOf(id: PlayerId) {
    return this.state.chefs[id]?.name ?? 'the other chef';
  }

  private other(id: PlayerId): PlayerId | null {
    const o: PlayerId = id === 'host' ? 'guest' : 'host';
    return this.state.chefs[o] ? o : null;
  }

  private station(id: string) {
    return this.state.stations.find((s) => s.id === id);
  }

  private chefList(): Chef[] {
    return Object.values(this.state.chefs).filter((c): c is Chef => !!c);
  }

  private freshState(): GameState {
    return {
      phase: 'intro',
      countdown: INTRO,
      timeLeft: this.recipe.time,
      roundTime: this.recipe.time,
      recipe: this.recipe.id,
      theme: this.theme,
      chefs: {},
      stations: makeStations(),
      plates: { host: [], guest: [] },
      stock: { ...this.recipe.stock },
      scores: {},
      winner: null,
    };
  }

  private freshChef(id: PlayerId, profile: Profile): Chef {
    const spawn = SPAWN[id];
    return {
      id,
      name: profile.name,
      color: profile.color,
      x: spawn.x,
      z: spawn.z,
      dir: Math.PI,
      speed: 0,
      path: [],
      target: null,
      held: null,
      busy: null,
      busyAt: null,
      atPass: false,
      atPlate: false,
      served: false,
      servedTimeLeft: 0,
      emote: { name: '', seq: 0 },
    };
  }
}
