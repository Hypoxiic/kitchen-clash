import type { DishScore, Ingredient, Item, ScoreRow, StoreId } from './types';

// Every ingredient and recipe here is halal: beef and steak are halal meat,
// and there's no pork, ham, bacon or alcohol anywhere in the game.

/** Doneness at which food is ruined. 1.0 is perfect. */
export const BURNT_AT = 1.45;
/** Seconds on the grill to reach a perfect medium. */
export const SECONDS_TO_MEDIUM = 12;
/** Seconds in the pot until a dish is perfectly cooked. */
export const SECONDS_IN_POT = 16;

export interface IngredientInfo {
  name: string;
  emoji: string;
  /** Number of cuts in the chopping mini-game; 0 means it can't be chopped. */
  cuts: number;
  grill: boolean;
  /** Can be melted with the blowtorch (once sliced). */
  torch: boolean;
  /** Can go in a pot (once chopped). */
  pot: boolean;
  /** Walk-in room it's kept in (pot dishes aren't stored). */
  store: StoreId | null;
}

export const INGREDIENTS: Record<Ingredient, IngredientInfo> = {
  bun: { name: 'Bun', emoji: '🍞', cuts: 0, grill: false, torch: false, pot: false, store: 'pantry' },
  potato: { name: 'Potato', emoji: '🥔', cuts: 3, grill: false, torch: false, pot: true, store: 'pantry' },
  onion: { name: 'Onion', emoji: '🧅', cuts: 3, grill: false, torch: false, pot: true, store: 'pantry' },
  carrot: { name: 'Carrot', emoji: '🥕', cuts: 4, grill: false, torch: false, pot: true, store: 'pantry' },
  patty: { name: 'Beef patty', emoji: '🥩', cuts: 0, grill: true, torch: false, pot: false, store: 'fridge' },
  vegpatty: { name: 'Veggie patty', emoji: '🌱', cuts: 0, grill: true, torch: false, pot: false, store: 'fridge' },
  steak: { name: 'Steak', emoji: '🍖', cuts: 0, grill: true, torch: false, pot: false, store: 'fridge' },
  cheese: { name: 'Cheese', emoji: '🧀', cuts: 2, grill: false, torch: true, pot: false, store: 'fridge' },
  lettuce: { name: 'Lettuce', emoji: '🥬', cuts: 4, grill: false, torch: false, pot: false, store: 'fridge' },
  tomato: { name: 'Tomato', emoji: '🍅', cuts: 3, grill: false, torch: false, pot: false, store: 'fridge' },
  mash: { name: 'Mashed potato', emoji: '🥣', cuts: 0, grill: false, torch: false, pot: false, store: null },
  stew: { name: 'Veg stew', emoji: '🍲', cuts: 0, grill: false, torch: false, pot: false, store: null },
};

export const STORE_ORDER: Record<StoreId, Ingredient[]> = {
  pantry: ['bun', 'potato', 'onion', 'carrot'],
  fridge: ['patty', 'vegpatty', 'steak', 'cheese', 'lettuce', 'tomato'],
};

/** One part of a dish, and what has to be done to it. */
export interface Component {
  kind: Ingredient;
  slice?: boolean;
  grill?: boolean;
  melt?: boolean;
  /** Cooked in a pot from these (chopped) ingredients. */
  contents?: Ingredient[];
}

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  /** Seconds on the clock. */
  time: number;
  /** How the dish is built: stacked (burgers), arranged on a plate, or a bowl. */
  plating: 'stack' | 'plate' | 'bowl';
  /** Burgers get their top bun when served. */
  topBun: boolean;
  /** In plating order, bottom to top. */
  components: Component[];
  steps: string[];
  stock: Partial<Record<Ingredient, number>>;
}

const BASE_STOCK: Partial<Record<Ingredient, number>> = {
  bun: 3, potato: 3, onion: 3, carrot: 3, patty: 3, vegpatty: 3, steak: 3, cheese: 3, lettuce: 3, tomato: 3,
};

export const RECIPES: Record<string, Recipe> = {
  cheeseburger: {
    id: 'cheeseburger',
    name: 'Classic Cheeseburger',
    emoji: '🍔',
    time: 180,
    plating: 'stack',
    topBun: true,
    components: [
      { kind: 'bun' },
      { kind: 'patty', grill: true },
      { kind: 'cheese', slice: true, melt: true },
      { kind: 'lettuce', slice: true },
      { kind: 'tomato', slice: true },
    ],
    steps: [
      'Put a bun on your plate (the bottom half goes down first).',
      'Grill a beef patty to medium, then add it.',
      'Slice the cheese, melt it with the blowtorch, and add it.',
      'Shred the lettuce and add it.',
      'Slice the tomato and add it last.',
      'Serve at the pass. The top bun goes on automatically.',
    ],
    stock: { ...BASE_STOCK, patty: 3, tomato: 2 },
  },
  vegburger: {
    id: 'vegburger',
    name: 'Garden Veggie Burger',
    emoji: '🌱',
    time: 190,
    plating: 'stack',
    topBun: true,
    components: [
      { kind: 'bun' },
      { kind: 'vegpatty', grill: true },
      { kind: 'cheese', slice: true, melt: true },
      { kind: 'onion', slice: true },
      { kind: 'lettuce', slice: true },
      { kind: 'tomato', slice: true },
    ],
    steps: [
      'Put a bun on your plate.',
      'Grill a veggie patty until it’s nicely browned, then add it.',
      'Slice the cheese, melt it with the blowtorch, and add it.',
      'Slice an onion into rings and add them.',
      'Shred the lettuce, then slice the tomato. Add them in that order.',
      'Serve at the pass. The top bun goes on automatically.',
    ],
    stock: { ...BASE_STOCK, vegpatty: 3, onion: 2 },
  },
  steakmash: {
    id: 'steakmash',
    name: 'Steak & Mash',
    emoji: '🥩',
    time: 180,
    plating: 'plate',
    topBun: false,
    components: [
      { kind: 'mash', contents: ['potato'] },
      { kind: 'steak', grill: true },
      { kind: 'carrot', slice: true },
    ],
    steps: [
      'Chop a potato and put it in a pot. Stir it now and then.',
      'While it boils, grill a steak to medium.',
      'Slice a carrot.',
      'Scoop the mash out when its gauge is green and put it on your plate first.',
      'Add the steak on top, then the carrots.',
      'Serve at the pass.',
    ],
    stock: { ...BASE_STOCK, steak: 2, potato: 3 },
  },
  stew: {
    id: 'stew',
    name: 'Garden Veg Stew',
    emoji: '🍲',
    time: 170,
    plating: 'bowl',
    topBun: false,
    components: [{ kind: 'stew', contents: ['carrot', 'potato', 'onion'] }],
    steps: [
      'Chop a carrot, a potato and an onion.',
      'Put all three in the same pot.',
      'Stir it a few times while it cooks (tap the pot with empty hands).',
      'When the gauge is green, scoop it into a bowl (tap the pot again).',
      'Put the bowl on your plate and serve at the pass.',
    ],
    // Only two of each, so wasting one really hurts.
    stock: { ...BASE_STOCK, carrot: 2, potato: 2, onion: 2 },
  },
};

export const RECIPE_IDS = Object.keys(RECIPES);

export function newItem(kind: Ingredient): Item {
  return { kind, sliced: false, cut: 0, doneness: 0, melt: -1, stir: 0, contents: [] };
}

export function doneness(d: number): { label: string; score: number } {
  if (d >= BURNT_AT) return { label: 'Burnt', score: 0 };
  const score = Math.max(0, 1 - Math.abs(d - 1) / 0.4);
  if (d < 0.5) return { label: 'Raw', score };
  if (d < 0.85) return { label: 'Underdone', score };
  if (d <= 1.15) return { label: 'Perfect', score };
  return { label: 'Overdone', score };
}

export function itemLabel(item: Item): string {
  const info = INGREDIENTS[item.kind];
  const lower = info.name.toLowerCase();
  if (info.grill || item.kind === 'mash' || item.kind === 'stew') {
    if (item.doneness >= BURNT_AT) return `Burnt ${lower}`;
    if (info.grill) {
      if (item.doneness >= 0.6) return `Cooked ${lower}`;
      if (item.doneness > 0.05) return `Rare ${lower}`;
      return `Raw ${lower}`;
    }
    return info.name;
  }
  if (item.melt >= 0) return `Melted ${lower}`;
  return item.sliced ? `Sliced ${lower}` : info.name;
}

/** What a pot makes from its contents. */
export function potResult(contents: Ingredient[]): Ingredient {
  return contents.every((k) => k === 'potato') ? 'mash' : 'stew';
}

/** Judges a plate against the recipe. */
export function scoreDish(recipe: Recipe, plate: Item[], served: boolean, timeLeft: number): DishScore {
  const rows: ScoreRow[] = [];

  // Match each component to an item on the plate.
  const remaining = [...plate];
  const matched = recipe.components.map((c) => {
    const idx = remaining.findIndex((i) => i.kind === c.kind);
    return idx >= 0 ? remaining.splice(idx, 1)[0] : null;
  });

  // Ingredients: every required ingredient (including what's inside pot dishes), nothing extra.
  let units = 0;
  let found = 0;
  let extras = remaining.length;
  const missing: string[] = [];
  recipe.components.forEach((c, i) => {
    const item = matched[i];
    const parts = c.contents ?? [c.kind];
    units += parts.length;
    if (!item) {
      missing.push(INGREDIENTS[c.kind].name.toLowerCase());
      return;
    }
    if (!c.contents) {
      found++;
      return;
    }
    const inPot = [...item.contents];
    for (const p of parts) {
      const at = inPot.indexOf(p);
      if (at >= 0) {
        found++;
        inPot.splice(at, 1);
      } else missing.push(INGREDIENTS[p].name.toLowerCase());
    }
    extras += inPot.length;
  });
  const ingScore = Math.max(0, (30 * found) / units - extras * 4);
  rows.push({
    label: 'Ingredients',
    score: ingScore,
    max: 30,
    note: !plate.length
      ? 'An empty plate…'
      : missing.length
        ? `Missing ${missing.join(', ')}`
        : extras
          ? `${extras} thing${extras > 1 ? 's' : ''} that don't belong`
          : 'Everything is there',
  });

  // Prep: knife work and blowtorch.
  const prepTasks: number[] = [];
  const prepNotes: string[] = [];
  recipe.components.forEach((c, i) => {
    const item = matched[i];
    const name = INGREDIENTS[c.kind].name.toLowerCase();
    if (c.slice) {
      if (item && item.sliced) prepTasks.push(0.35 + 0.65 * item.cut);
      else {
        prepTasks.push(0);
        if (item) prepNotes.push(`Whole ${name}?!`);
      }
    }
    if (c.melt) {
      if (item && item.melt >= 0) prepTasks.push(item.melt);
      else {
        prepTasks.push(0);
        if (item) prepNotes.push(`The ${name} wasn't melted`);
      }
    }
    if (c.contents) prepTasks.push(item ? 0.35 + 0.65 * item.cut : 0);
  });
  const prepPct = prepTasks.length ? prepTasks.reduce((a, b) => a + b, 0) / prepTasks.length : 0;
  rows.push({
    label: 'Prep',
    score: 20 * prepPct,
    max: 20,
    note: prepNotes[0] ?? (prepPct > 0.85 ? 'Beautiful knife work' : prepPct > 0.55 ? 'Neat enough' : 'Rough prep'),
  });

  // Cooking: grill and pot doneness.
  const cooked = recipe.components.filter((c) => c.grill || c.contents);
  let cook = 0;
  const cookNotes: string[] = [];
  recipe.components.forEach((c, i) => {
    if (!(c.grill || c.contents)) return;
    const item = matched[i];
    if (!item) return;
    const d = doneness(item.doneness);
    cook += d.score / cooked.length;
    cookNotes.push(`${d.label === 'Perfect' && d.score < 0.9 ? 'Nicely done' : d.label} ${INGREDIENTS[c.kind].name.toLowerCase()}`);
  });
  rows.push({ label: 'Cooking', score: 25 * cook, max: 25, note: cookNotes.join(', ') || 'Nothing was cooked' });

  // Assembly: stacking order, or stirring for bowls.
  if (recipe.plating === 'bowl') {
    const stir = matched[0]?.stir ?? 0;
    rows.push({
      label: 'Stirring',
      score: 15 * stir,
      max: 15,
      note: stir > 0.85 ? 'Silky smooth' : stir > 0.4 ? 'Stirred a little' : 'Stuck to the pot',
    });
  } else {
    const want = recipe.components.map((c) => c.kind);
    const lcs = longestCommonSubsequence(plate.map((i) => i.kind), want);
    rows.push({
      label: 'Assembly',
      score: (15 * lcs) / want.length,
      max: 15,
      note: lcs === want.length ? 'Plated by the book' : lcs >= want.length - 1 ? 'Slightly out of order' : 'A creative arrangement',
    });
  }

  const speed = served ? Math.min(10, (10 * timeLeft) / (recipe.time * 0.6)) : 0;
  rows.push({
    label: 'Speed',
    score: speed,
    max: 10,
    note: served ? `Served with ${Math.round(timeLeft)}s to spare` : 'Not served in time',
  });

  for (const r of rows) r.score = Math.max(0, Math.round(r.score));
  return { total: rows.reduce((a, r) => a + r.score, 0), rows };
}

function longestCommonSubsequence<T>(a: T[], b: T[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}
