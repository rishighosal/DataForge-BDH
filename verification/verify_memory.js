// Verification script: outer-product fast-weight memory vs exact KV cache.
// Goal: confirm the interference/capacity behavior is real (emerges from random
// vector geometry), and pick default d/n ranges that produce a clean, honest
// "collapse near n≈d" curve for the interactive artifact.

function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randUnitVec(d, rng) {
  const v = new Array(d);
  let norm = 0;
  for (let i = 0; i < d; i++) {
    // Box-Muller for Gaussian components -> uniform on sphere after normalizing
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    v[i] = z;
    norm += z * z;
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < d; i++) v[i] /= norm;
  return v;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function cosineSim(a, b) {
  const na = Math.sqrt(dot(a, a));
  const nb = Math.sqrt(dot(b, b));
  if (na < 1e-9 || nb < 1e-9) return 0;
  return dot(a, b) / (na * nb);
}

// Fast-weight memory: S is d x d, S += outer(k, v). Retrieval: Sk = S @ k.
function makeFastWeightMemory(d) {
  const S = Array.from({ length: d }, () => new Array(d).fill(0));
  return {
    write(k, v) {
      for (let i = 0; i < d; i++) {
        const ki = k[i];
        if (ki === 0) continue;
        const row = S[i];
        for (let j = 0; j < d; j++) row[j] += ki * v[j];
      }
    },
    read(k) {
      // v_hat = S^T k  (since S[i][j] += k_i * v_j, readout is sum_i k_i * S[i])
      const out = new Array(d).fill(0);
      for (let i = 0; i < d; i++) {
        const ki = k[i];
        if (ki === 0) continue;
        const row = S[i];
        for (let j = 0; j < d; j++) out[j] += ki * row[j];
      }
      return out;
    },
    bytes: () => d * d * 4,
  };
}

function makeCacheMemory(d) {
  const keys = [];
  const values = [];
  return {
    write(k, v) {
      keys.push(k);
      values.push(v);
    },
    read(k) {
      // exact match retrieval (query is always one of the stored keys in our demo)
      for (let i = 0; i < keys.length; i++) {
        if (dot(keys[i], k) > 0.999999) return values[i];
      }
      return new Array(d).fill(0);
    },
    bytes: () => keys.length * d * 2 * 4,
  };
}

function runTrial(d, nMax, seed) {
  const rng = seededRng(seed);
  const fw = makeFastWeightMemory(d);
  const cache = makeCacheMemory(d);
  const storedKeys = [];
  const storedVals = [];
  const results = [];

  for (let n = 1; n <= nMax; n++) {
    const k = randUnitVec(d, rng);
    const v = randUnitVec(d, rng);
    fw.write(k, v);
    cache.write(k, v);
    storedKeys.push(k);
    storedVals.push(v);

    // Query a RANDOM previously-stored item (not always the most recent) to
    // measure average retrieval quality across all associations so far.
    const qIdx = Math.floor(rng() * n);
    const qKey = storedKeys[qIdx];
    const qTrueVal = storedVals[qIdx];

    const fwEst = fw.read(qKey);
    const cacheEst = cache.read(qKey);

    results.push({
      n,
      fwSim: cosineSim(fwEst, qTrueVal),
      cacheSim: cosineSim(cacheEst, qTrueVal),
      fwBytes: fw.bytes(),
      cacheBytes: cache.bytes(),
    });
  }
  return results;
}

function summarize(d, nMax, seed) {
  const results = runTrial(d, nMax, seed);
  console.log(`\n=== d=${d}, nMax=${nMax}, seed=${seed} ===`);
  const checkpoints = [1, Math.round(d * 0.25), Math.round(d * 0.5), Math.round(d * 0.75), d, Math.round(d * 1.5), d * 2, d * 3, Math.min(d * 5, nMax)];
  for (const n of checkpoints) {
    if (n < 1 || n > nMax) continue;
    const r = results[n - 1];
    console.log(`n=${String(n).padStart(4)}  fastWeightSim=${r.fwSim.toFixed(3)}  cacheSim=${r.cacheSim.toFixed(3)}  fwBytes=${r.fwBytes}  cacheBytes=${r.cacheBytes}`);
  }
}

// Try a few (d, seed) combos to find stable, clean default parameters.
for (const d of [8, 16, 32]) {
  for (const seed of [1, 42]) {
    summarize(d, d * 6, seed);
  }
}

// Average over multiple seeds at d=16 to get a smooth curve for the artifact default.
function averagedCurve(d, nMax, seeds) {
  const acc = new Array(nMax).fill(0);
  for (const seed of seeds) {
    const r = runTrial(d, nMax, seed);
    for (let i = 0; i < nMax; i++) acc[i] += r[i].fwSim;
  }
  for (let i = 0; i < nMax; i++) acc[i] /= seeds.length;
  return acc;
}

console.log("\n=== Averaged fast-weight retrieval similarity, d=16, over 30 seeds ===");
const seeds = Array.from({ length: 30 }, (_, i) => i + 100);
const avgCurve = averagedCurve(16, 96, seeds);
for (const n of [1, 4, 8, 12, 16, 20, 24, 32, 48, 64, 96]) {
  console.log(`n=${String(n).padStart(3)}  avgSim=${avgCurve[n - 1].toFixed(3)}`);
}

// --- Headline metric actually shown in the artifact: average similarity across ALL
// stored items at a given n (not one noisy single-item query). This is what makes the
// locked guided-walkthrough steps (d=16, seed=7) show a clean, honest, monotonic story
// instead of one noisy draw. Reproduces exactly what the browser's `averageSim()` computes.
//
// IMPORTANT: index.html's computeRun() draws a query-index random number (qIdx) on every
// step even when the caller only wants the final matrix -- because the same function also
// feeds the per-step chart series. To keep this Node port's RNG stream bit-identical to the
// browser for the same seed, we must consume rng() in the exact same order, including that
// otherwise-unused qIdx draw.
function averageSimAcrossAllItems(d, n, seed) {
  const rng = seededRng(seed);
  const fw = makeFastWeightMemory(d);
  const keys = [], vals = [];
  for (let t = 1; t <= n; t++) {
    const k = randUnitVec(d, rng), v = randUnitVec(d, rng);
    fw.write(k, v);
    keys.push(k); vals.push(v);
    rng(); // consume the qIdx draw the browser's computeRun() also makes at every step
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += cosineSim(fw.read(keys[i]), vals[i]);
  return sum / n;
}

console.log("\n=== Guided-walkthrough preset check: d=16, seed=7 (must match index.html) ===");
for (const n of [4, 16, 64]) {
  const avg = averageSimAcrossAllItems(16, n, 7);
  const theory = Math.sqrt(16 / (16 + Math.max(n - 1, 0)));
  const tier = avg > 0.85 ? "reliable" : avg > 0.5 ? "degraded" : "~noise";
  console.log(`n=${String(n).padStart(2)}  avgSimAllItems=${avg.toFixed(3)}  theory=${theory.toFixed(3)}  tier=${tier}`);
}
