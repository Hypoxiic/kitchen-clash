import type { DishScore, Ingredient, Item, ScoreRow } from './types';

/** Doneness at which a patty is ruined. 1.0 is the perfect medium. */
export const BURNT_AT = 1.45;
/** Seconds on the stove to reach a perfect medium. */
export const SECONDS_TO_MEDIUM = 12;

export interface IngredientInfo {
  name: string;
  emoji: string;
  /** Number of cuts in the chopping mini-game; 0 means it can't be chopped. */
  cuts: number;
  grill: boolean;
}

export const INGREDIENTS: Record<Ingredient, IngredientInfo> = {
  bun: { name: 'Bun', emoji: '🍞', cuts: 0, grill: false },
  patty: { name: 'Beef patty', emoji: '🥩', cuts: 0, grill: true },
  cheese: { name: 'Cheese', emoji: '🧀', cuts: 2, grill: false },
  lettuce: { name: 'Lettuce', emoji: '🥬', cuts: 4, grill: false },
  tomato: { name: 'Tomato', emoji: '🍅', cuts: 3, grill: false },
  onion: { name: 'Onion', emoji: '🧅', cuts: 3, grill: false },
  ham: { name: 'Ham', emoji: '🍖', cuts: 3, grill: false },
  carrot: { name: 'Carrot', emoji: '🥕', cuts: 4, grill: false },
};

export const PANTRY_ORDER: Ingredient[] = ['bun', 'patty', 'cheese', 'lettuce', 'tomato', 'onion', 'ham', 'carrot'];

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  /** Seconds on the clock. */
  time: number;
  /** Plate order, bottom to top (the top bun is added when served). */
  stack: Ingredient[];
  /** Ingredients that must be sliced. */
  slice: Ingredient[];
  /** Ingredients that must be grilled to medium. */
  grill: Ingredient[];
  steps: string[];
  stock: Record<Ingredient, number>;
}

export const RECIPES: Record<string, Recipe> = {
  cheeseburger: {
    id: 'cheeseburger',
    name: 'Classic Cheeseburger',
    emoji: '🍔',
    time: 150,
    stack: ['bun', 'patty', 'cheese', 'lettuce', 'tomato'],
    slice: ['cheese', 'lettuce', 'tomato'],
    grill: ['patty'],
    steps: [
      'Put a bun on your plate (the bottom half goes down first).',
      'Grill a beef patty to medium, then add it to the plate.',
      'Slice the cheese and add it on top of the patty.',
      'Shred the lettuce and add it.',
      'Slice the tomato and add it last.',
      'Serve at the pass. The top bun goes on automatically.',
    ],
    // Limited on purpose: if someone burns a patty, there's only one spare.
    stock: { bun: 3, patty: 3, cheese: 3, lettuce: 3, tomato: 2, onion: 3, ham: 2, carrot: 3 },
  },
};

export function newItem(kind: Ingredient): Item {
  return { kind, sliced: false, cut: 0, doneness: 0 };
}

export function itemLabel(item: Item): string {
  const info = INGREDIENTS[item.kind];
  if (info.grill) {
    if (item.doneness >= BURNT_AT) return `Burnt ${info.name.toLowerCase()}`;
    if (item.doneness >= 0.6) return `Cooked ${info.name.toLowerCase()}`;
    if (item.doneness > 0.05) return `Rare ${info.name.toLowerCase()}`;
    return `Raw ${info.name.toLowerCase()}`;
  }
  return item.sliced ? `Sliced ${info.name.toLowerCase()}` : info.name;
}

export function doneness(d: number): { label: string; score: number } {
  if (d >= BURNT_AT) return { label: 'Burnt', score: 0 };
  const score = Math.max(0, 1 - Math.abs(d - 1) / 0.4);
  if (d < 0.5) return { label: 'Raw', score };
  if (d < 0.85) return { label: 'Rare', score };
  if (d <= 1.15) return { label: 'Medium', score };
  return { label: 'Well done', score };
}

/** Judges a plate against the recipe. */
export function scoreDish(recipe: Recipe, plate: Item[], served: boolean, timeLeft: number): DishScore {
  const rows: ScoreRow[] = [];
  const kinds = plate.map((i) => i.kind);

  // Ingredients: one of each required, nothing extra.
  const remaining = [...plate];
  let found = 0;
  const missing: string[] = [];
  for (const need of recipe.stack) {
    const idx = remaining.findIndex((i) => i.kind === need);
    if (idx >= 0) {
      found++;
      remaining.splice(idx, 1);
    } else missing.push(INGREDIENTS[need].name.toLowerCase());
  }
  const per = 30 / recipe.stack.length;
  const extras = remaining.length;
  const ingScore = Math.max(0, found * per - extras * 4);
  rows.push({
    label: 'Ingredients',
    score: ingScore,
    max: 30,
    note: plate.length === 0
      ? 'An empty plate…'
      : missing.length
        ? `Missing ${missing.join(', ')}`
        : extras
          ? `${extras} thing${extras > 1 ? 's' : ''} that don't belong`
          : 'Everything is there',
  });

  // Prep: required slicing, scored by cut accuracy.
  const sliceWorth = 20 / recipe.slice.length;
  let prep = 0;
  const unsliced: string[] = [];
  for (const kind of recipe.slice) {
    const item = plate.find((i) => i.kind === kind);
    if (!item) continue;
    if (item.sliced) prep += sliceWorth * (0.35 + 0.65 * item.cut);
    else unsliced.push(INGREDIENTS[kind].name.toLowerCase());
  }
  const prepPct = prep / 20;
  rows.push({
    label: 'Prep',
    score: prep,
    max: 20,
    note: unsliced.length ? `Whole ${unsliced.join(', ')}?!` : prepPct > 0.85 ? 'Beautiful knife work' : prepPct > 0.5 ? 'Neat enough' : 'Rough chopping',
  });

  // Cooking.
  let cook = 0;
  let cookNote = 'Nothing was cooked';
  for (const kind of recipe.grill) {
    const item = plate.find((i) => i.kind === kind);
    if (!item) continue;
    const d = doneness(item.doneness);
    cook += (25 / recipe.grill.length) * d.score;
    cookNote = d.label === 'Medium' ? (d.score > 0.9 ? 'Perfectly medium' : 'Nicely medium') : `${d.label} patty`;
  }
  rows.push({ label: 'Cooking', score: cook, max: 25, note: cookNote });

  // Assembly: how much of the recipe order survives (longest common subsequence).
  const lcs = longestCommonSubsequence(kinds, recipe.stack);
  const assembly = (15 * lcs) / recipe.stack.length;
  rows.push({
    label: 'Assembly',
    score: assembly,
    max: 15,
    note: lcs === recipe.stack.length ? 'Stacked by the book' : lcs >= recipe.stack.length - 1 ? 'Slightly out of order' : 'A creative stack',
  });

  const speed = served ? (10 * timeLeft) / recipe.time : 0;
  rows.push({
    label: 'Speed',
    score: speed,
    max: 10,
    note: served ? `Served with ${Math.round(timeLeft)}s to spare` : 'Not served in time',
  });

  for (const r of rows) r.score = Math.round(r.score);
  return { total: rows.reduce((a, r) => a + r.score, 0), rows };
}

function longestCommonSubsequence<T>(a: T[], b: T[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}
