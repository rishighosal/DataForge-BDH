/**
 * Associative memory core.
 *
 * One d x d matrix S holds every association. Convention used everywhere in this
 * file (and it matters, because half the papers write it the other way round):
 *
 *     write:  S[i*d + j] += k[i] * v[j]        (outer product, k indexes rows)
 *     read:   vhat[j]     = sum_i k[i] * S[i*d + j]
 *
 * So S is stored flat, row-major, and the readout is a left-multiply by the key.
 * With unit-norm keys, writing (k, v) into an empty S and reading back at k
 * returns exactly v. Everything past that point is interference.
 *
 * The three write rules below are toy versions of three published mechanisms.
 * They are deliberately small enough to check by hand; see docs/derivation.md
 * for the algebra and docs/experiments.md for what they actually do.
 */

/* ------------------------------------------------------------------ *
 * Random numbers
 * ------------------------------------------------------------------ */

/**
 * mulberry32. Small, fast, and good enough that the low bits are not garbage —
 * which is why we are not using the textbook LCG we started with (see
 * docs/build-log.md, 2026-09-06).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard normal via Box-Muller. We throw away the second value; d is small. */
export function gaussian(rng) {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/* ------------------------------------------------------------------ *
 * Vectors
 * ------------------------------------------------------------------ */

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a) {
  return Math.sqrt(dot(a, a));
}

export function cosine(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot(a, b) / (na * nb);
}

/** Uniform on the unit sphere in R^d. The "dense" key regime. */
export function randomUnitVector(d, rng) {
  const v = new Float64Array(d);
  for (let i = 0; i < d; i++) v[i] = gaussian(rng);
  const n = norm(v);
  for (let i = 0; i < d; i++) v[i] /= n;
  return v;
}

/**
 * Sparse, non-negative, unit-norm. This is the BDH-shaped regime: the Dragon
 * Hatchling paper reports roughly 5% of neurons active at a time, and those
 * activations are non-negative (they come out of a ReLU), so two keys can never
 * cancel each other the way two Gaussian vectors can.
 *
 * `active` is the number of non-zero coordinates, not a fraction — the caller
 * decides how to round, because at d = 16 a literal 5% is 0.8 neurons and
 * silently rounding that to zero would be a very quiet bug.
 */
export function randomSparseNonNegative(d, active, rng) {
  const k = Math.max(1, Math.min(d, Math.round(active)));
  const v = new Float64Array(d);
  // Partial Fisher-Yates over an index pool: picks k distinct coordinates
  // without the retry loop that gets slow as k approaches d.
  const pool = new Int32Array(d);
  for (let i = 0; i < d; i++) pool[i] = i;
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (d - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
    v[pool[i]] = 0.25 + rng(); // strictly positive magnitude
  }
  const n = norm(v);
  for (let i = 0; i < d; i++) v[i] /= n;
  return v;
}

/**
 * Key/value generator for a given regime.
 * mode: 'dense'  -> Gaussian unit vectors (signs cancel, classic linear-attention analysis)
 *       'sparse' -> sparse non-negative unit vectors (BDH-shaped activations)
 */
export function makeVectorSource(mode, d, activeCount) {
  if (mode === 'sparse') return (rng) => randomSparseNonNegative(d, activeCount, rng);
  return (rng) => randomUnitVector(d, rng);
}

/* ------------------------------------------------------------------ *
 * The state and its read/write rules
 * ------------------------------------------------------------------ */

export function emptyState(d) {
  return new Float64Array(d * d);
}

/** vhat = k^T S. This is the only way anything is ever read out of S. */
export function readState(S, d, k) {
  const out = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    const ki = k[i];
    if (ki === 0) continue; // sparse keys skip most rows, which is the whole point
    const base = i * d;
    for (let j = 0; j < d; j++) out[j] += ki * S[base + j];
  }
  return out;
}

/**
 * Write rules. Each mutates S in place.
 *
 * hebbian  S <- S + k v^T
 *          BDH's synaptic update: "co-presence of Y(i) followed by X(j) increases
 *          sigma(i,j) by Y(i)X(j)" (Dragon Hatchling, arXiv:2509.26507 §1.2).
 *          Pure accumulation, no forgetting, order-independent.
 *
 * delta    S <- S + beta * k (v - k^T S)^T
 *          Subtract what the key already reads out, then write the difference.
 *          Gated DeltaNet-2 (arXiv:2605.22791) states the family plainly:
 *          "Delta-rule models subtract the current read before writing a new
 *          value." It is also exactly one gradient step on Titans' memory loss
 *          ||M(k) - v||^2 (arXiv:2501.00663 §3.1, eq. 11-12).
 *          At beta = 1 with a unit key, the key reads back v exactly.
 *
 * decay    S <- lambda * S + k v^T
 *          Titans' forgetting gate, eq. 13: M_t = (1 - alpha_t) M_{t-1} + S_t,
 *          with our lambda = 1 - alpha held fixed instead of learned per step.
 *          lambda = 1 is exactly hebbian, which is why the slider goes to 1.
 */
export const RULES = {
  hebbian: {
    id: 'hebbian',
    label: 'Hebbian',
    subtitle: 'S += k vᵀ',
    attribution: 'BDH synaptic update',
    write(S, d, k, v) {
      for (let i = 0; i < d; i++) {
        const ki = k[i];
        if (ki === 0) continue;
        const base = i * d;
        for (let j = 0; j < d; j++) S[base + j] += ki * v[j];
      }
    },
  },

  delta: {
    id: 'delta',
    label: 'Delta rule',
    subtitle: 'S += β k (v − kᵀS)ᵀ',
    attribution: 'DeltaNet / Titans objective',
    write(S, d, k, v, params = {}) {
      const beta = params.beta ?? 1;
      const current = readState(S, d, k);
      for (let i = 0; i < d; i++) {
        const ki = k[i];
        if (ki === 0) continue;
        const base = i * d;
        for (let j = 0; j < d; j++) S[base + j] += beta * ki * (v[j] - current[j]);
      }
    },
  },

  decay: {
    id: 'decay',
    label: 'Decay gate',
    subtitle: 'S = λS + k vᵀ',
    attribution: 'Titans forgetting gate',
    write(S, d, k, v, params = {}) {
      const lambda = params.lambda ?? 0.9;
      if (lambda !== 1) {
        for (let i = 0; i < S.length; i++) S[i] *= lambda;
      }
      for (let i = 0; i < d; i++) {
        const ki = k[i];
        if (ki === 0) continue;
        const base = i * d;
        for (let j = 0; j < d; j++) S[base + j] += ki * v[j];
      }
    },
  },
};

export const RULE_IDS = Object.keys(RULES);

/* ------------------------------------------------------------------ *
 * The two competing memories
 * ------------------------------------------------------------------ */

/** Fixed-size state. Costs d*d float64s no matter how much you write into it. */
export class FastWeightMemory {
  constructor(d, ruleId = 'hebbian', params = {}) {
    this.d = d;
    this.rule = RULES[ruleId] ?? RULES.hebbian;
    this.params = params;
    this.S = emptyState(d);
    this.writes = 0;
  }

  write(k, v) {
    this.rule.write(this.S, this.d, k, v, this.params);
    this.writes++;
  }

  read(k) {
    return readState(this.S, this.d, k);
  }

  /** Float64Array => 8 bytes per cell. Constant in the number of writes. */
  bytes() {
    return this.d * this.d * 8;
  }
}

/**
 * The Transformer side: keep everything, forget nothing. Retrieval here is an
 * exact lookup rather than a softmax over keys — we are isolating "does the
 * memory grow?" from "how does attention weight its keys?", which is a
 * different lesson. Noted in the README under Known simplifications.
 */
export class KVCache {
  constructor(d) {
    this.d = d;
    this.keys = [];
    this.values = [];
  }

  write(k, v) {
    this.keys.push(k);
    this.values.push(v);
  }

  read(index) {
    return this.values[index];
  }

  bytes() {
    return this.keys.length * this.d * 2 * 8; // one key + one value per entry
  }
}

/* ------------------------------------------------------------------ *
 * Metrics
 * ------------------------------------------------------------------ */

/**
 * Expected cosine between the readout and the true value for the Hebbian rule
 * with dense random unit keys: sqrt(d / (d + n - 1)).
 *
 * First-order estimate only. Derived in docs/derivation.md; it assumes the n-1
 * cross terms behave like independent isotropic noise, which is a good
 * approximation for dense Gaussian keys and a bad one for sparse non-negative
 * keys — see docs/experiments.md, where we measure exactly how bad.
 */
export function theoreticalCosine(n, d) {
  return Math.sqrt(d / (d + Math.max(n - 1, 0)));
}

/**
 * Decode a readout against a fixed vocabulary of candidate value vectors.
 * Returns the best match, the runner-up, and the margin between them — the
 * margin is what tells you whether a correct answer was confident or lucky.
 */
export function decode(vhat, vocabulary) {
  let best = -Infinity;
  let bestIndex = -1;
  let second = -Infinity;
  for (let i = 0; i < vocabulary.length; i++) {
    const score = cosine(vhat, vocabulary[i]);
    if (score > best) {
      second = best;
      best = score;
      bestIndex = i;
    } else if (score > second) {
      second = score;
    }
  }
  return {
    index: bestIndex,
    score: best,
    margin: second === -Infinity ? best : best - second,
  };
}

/* ------------------------------------------------------------------ *
 * Trial driver
 * ------------------------------------------------------------------ */

/**
 * Write n random (key, value) pairs into a fast-weight memory and a cache,
 * recording the state of the world after every single write.
 *
 * The per-step record is what the charts draw, so this function is the single
 * source of truth for every number the page shows. `cosineAll` is the average
 * over *every* stored pair, not one sampled query — a single query is one draw
 * from a noisy distribution and it made the guided walkthrough non-monotonic
 * the first time we built this (docs/build-log.md, 2026-09-07).
 */
export function runTrial({
  d,
  n,
  seed = 1,
  rule = 'hebbian',
  params = {},
  keyMode = 'dense',
  sparseActive = null,
  // Scoring every stored pair after every write is O(n^2 d^2), which is fine for
  // a test and too slow for a slider at n = 300. Charts pass evalEvery so they
  // score ~40 points across the run instead. The final step is always scored.
  evalEvery = 1,
}) {
  const active = sparseActive ?? Math.max(1, Math.round(d * 0.05));
  const source = makeVectorSource(keyMode, d, active);
  const rng = mulberry32(seed);

  const memory = new FastWeightMemory(d, rule, params);
  const cache = new KVCache(d);
  const keys = [];
  const values = [];
  const series = [];

  for (let t = 1; t <= n; t++) {
    const k = source(rng);
    const v = source(rng);
    memory.write(k, v);
    cache.write(k, v);
    keys.push(k);
    values.push(v);

    if (t % evalEvery !== 0 && t !== n) continue;

    let sum = 0;
    for (let i = 0; i < t; i++) sum += cosine(memory.read(keys[i]), values[i]);

    series.push({
      n: t,
      cosineAll: sum / t,
      cosineLatest: cosine(memory.read(k), v),
      theory: theoreticalCosine(t, d),
      stateBytes: memory.bytes(),
      cacheBytes: cache.bytes(),
    });
  }

  return { d, n, seed, rule, params, keyMode, active, memory, cache, keys, values, series };
}

/** Average cosine across every stored pair for a finished trial. */
export function averageCosine(trial) {
  if (!trial.keys.length) return 1;
  let sum = 0;
  for (let i = 0; i < trial.keys.length; i++) {
    sum += cosine(trial.memory.read(trial.keys[i]), trial.values[i]);
  }
  return sum / trial.keys.length;
}
