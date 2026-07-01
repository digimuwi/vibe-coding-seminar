// Tiny seeded PRNG (Mulberry32) + string hashing (FNV-1a).
// Everything generator-side draws from this so a seed reproduces a song.

export type Rng = {
  next: () => number;
  int: (min: number, maxExclusive: number) => number;
  range: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  weighted: <T>(items: ReadonlyArray<readonly [T, number]>) => T;
  bool: (p?: number) => boolean;
  shuffle: <T>(arr: readonly T[]) => T[];
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int: (min, maxExclusive) => Math.floor(next() * (maxExclusive - min)) + min,
    range: (min, max) => next() * (max - min) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    weighted: <T,>(items: ReadonlyArray<readonly [T, number]>): T => {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let v = next() * total;
      for (const [item, w] of items) {
        v -= w;
        if (v <= 0) return item;
      }
      return items[items.length - 1][0];
    },
    bool: (p = 0.5) => next() < p,
    shuffle: <T,>(arr: readonly T[]): T[] => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
