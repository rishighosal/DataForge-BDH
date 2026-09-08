/**
 * Every number quoted in the write-up comes out of this file.
 *
 *   node scripts/experiments.js            print tables
 *   node scripts/experiments.js --save     also write results/*.json
 *
 * Nothing here is sampled once. Each cell is a mean over SEEDS independent runs,
 * because a single run of a random-vector memory is noisy enough to tell you
 * whatever story you were hoping for.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runTrial,
  theoreticalCosine,
  FastWeightMemory,
  randomUnitVector,
  randomSparseNonNegative,
  mulberry32,
  cosine,
} from '../src/memory.js';
import { buildRoster, storeRoster, evaluateRoster, ROSTER } from '../src/roster.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEEDS = 40;
const SAVE = process.argv.includes('--save');

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f3 = (x) => x.toFixed(3);
const pad = (s, w) => String(s).padStart(w);

function heading(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

/* ================================================================ *
 * 1. Capacity curve per write rule
 * ================================================================ */

function capacityCurve({ d, ns, rule, params = {}, keyMode = 'dense', sparseActive = null }) {
  return ns.map((n) => {
    const runs = [];
    for (let s = 0; s < SEEDS; s++) {
      const trial = runTrial({ d, n, seed: 5000 + s, rule, params, keyMode, sparseActive });
      runs.push(trial.series.at(-1).cosineAll);
    }
    return { n, cosine: mean(runs) };
  });
}

function experimentCapacity() {
  const d = 32;
  const ns = [4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256];

  const rules = [
    { key: 'hebbian', rule: 'hebbian', params: {} },
    { key: 'delta', rule: 'delta', params: { beta: 1 } },
    { key: 'decay0.9', rule: 'decay', params: { lambda: 0.9 } },
  ];

  const table = {};
  for (const spec of rules) table[spec.key] = capacityCurve({ d, ns, ...spec });
  const theory = ns.map((n) => ({ n, cosine: theoreticalCosine(n, d) }));

  heading(`1. Mean recall cosine vs. load (d=${d}, dense keys, ${SEEDS} seeds per cell)`);
  console.log(
    `${pad('n', 5)} ${pad('n/d', 6)} ${pad('hebbian', 9)} ${pad('delta', 9)} ${pad('decay .9', 9)} ${pad('theory', 9)}`,
  );
  ns.forEach((n, i) => {
    console.log(
      `${pad(n, 5)} ${pad((n / d).toFixed(2), 6)} ${pad(f3(table.hebbian[i].cosine), 9)} ` +
        `${pad(f3(table.delta[i].cosine), 9)} ${pad(f3(table['decay0.9'][i].cosine), 9)} ` +
        `${pad(f3(theory[i].cosine), 9)}`,
    );
  });

  return { d, ns, seeds: SEEDS, curves: table, theory };
}

/* ================================================================ *
 * 2. Where the delta rule actually earns its keep
 * ================================================================ */

function experimentDeltaAdvantage() {
  const d = 32;
  const ns = [8, 16, 24, 32, 48, 64, 96, 128, 192, 256];

  heading(`2. Delta minus Hebbian, same seeds and data (d=${d})`);
  console.log(`${pad('n', 5)} ${pad('hebbian', 9)} ${pad('delta', 9)} ${pad('gain', 8)}`);

  const rows = ns.map((n) => {
    const h = [];
    const dl = [];
    for (let s = 0; s < SEEDS; s++) {
      h.push(runTrial({ d, n, seed: 6000 + s, rule: 'hebbian' }).series.at(-1).cosineAll);
      dl.push(
        runTrial({ d, n, seed: 6000 + s, rule: 'delta', params: { beta: 1 } }).series.at(-1)
          .cosineAll,
      );
    }
    const row = { n, hebbian: mean(h), delta: mean(dl) };
    row.gain = row.delta - row.hebbian;
    console.log(
      `${pad(n, 5)} ${pad(f3(row.hebbian), 9)} ${pad(f3(row.delta), 9)} ${pad(f3(row.gain), 8)}`,
    );
    return row;
  });

  return { d, seeds: SEEDS, rows };
}

/* ================================================================ *
 * 3. Repeated / colliding keys: the case the delta rule was built for
 * ================================================================ */

function experimentCollision() {
  const d = 32;
  const overlaps = [0, 0.25, 0.5, 0.75, 0.9, 0.99];

  heading(`3. One colliding key pair (d=${d}, 16 other associations stored)`);
  console.log('   recall of the OLD value v1 after a near-duplicate key writes v2,');
  console.log('   and in brackets, recall of the NEW value v2 at the same key.');
  console.log(
    `${pad('cos(k1,k2)', 11)} ${pad('hebbian', 16)} ${pad('delta', 16)} ${pad('decay .9', 16)}`,
  );

  const rows = overlaps.map((overlap) => {
    const scores = { hebbian: [], delta: [], decay: [] };
    const scoresNew = { hebbian: [], delta: [], decay: [] };

    for (let s = 0; s < SEEDS; s++) {
      const rng = mulberry32(7000 + s);
      const base = randomUnitVector(d, rng);
      const perturb = randomUnitVector(d, rng);

      // Build k2 at a controlled angle from k1 by mixing in an orthogonal
      // component, then renormalising. overlap=1 would be an exact duplicate.
      const orth = new Float64Array(d);
      let proj = 0;
      for (let i = 0; i < d; i++) proj += perturb[i] * base[i];
      for (let i = 0; i < d; i++) orth[i] = perturb[i] - proj * base[i];
      let on = 0;
      for (let i = 0; i < d; i++) on += orth[i] * orth[i];
      on = Math.sqrt(on);
      const k2 = new Float64Array(d);
      const tangent = Math.sqrt(Math.max(0, 1 - overlap * overlap));
      for (let i = 0; i < d; i++) k2[i] = overlap * base[i] + tangent * (orth[i] / on);

      const v1 = randomUnitVector(d, rng);
      const v2 = randomUnitVector(d, rng);
      const filler = Array.from({ length: 16 }, () => [
        randomUnitVector(d, rng),
        randomUnitVector(d, rng),
      ]);

      for (const [id, params] of [
        ['hebbian', {}],
        ['delta', { beta: 1 }],
        ['decay', { lambda: 0.9 }],
      ]) {
        const memory = new FastWeightMemory(d, id, params);
        memory.write(base, v1);
        for (const [k, v] of filler) memory.write(k, v);
        memory.write(k2, v2); // the collision arrives last
        scores[id].push(cosine(memory.read(base), v1));
        scoresNew[id].push(cosine(memory.read(k2), v2));
      }
    }

    const row = {
      overlap,
      hebbian: mean(scores.hebbian),
      delta: mean(scores.delta),
      decay: mean(scores.decay),
      hebbianNew: mean(scoresNew.hebbian),
      deltaNew: mean(scoresNew.delta),
      decayNew: mean(scoresNew.decay),
    };
    const cell = (a, b) => pad(`${f3(a)} [${f3(b)}]`, 16);
    console.log(
      `${pad(overlap.toFixed(2), 11)} ${cell(row.hebbian, row.hebbianNew)} ` +
        `${cell(row.delta, row.deltaNew)} ${cell(row.decay, row.decayNew)}`,
    );
    return row;
  });

  return { d, seeds: SEEDS, rows };
}

/* ================================================================ *
 * 4. Dense Gaussian keys vs. BDH-shaped sparse non-negative keys
 * ================================================================ */

function experimentSparsity() {
  const d = 64;
  const ns = [8, 16, 32, 64, 128];
  const configs = [
    { label: 'dense', keyMode: 'dense', sparseActive: null },
    { label: 'sparse 3/64 (~5%)', keyMode: 'sparse', sparseActive: 3 },
    { label: 'sparse 6/64 (~10%)', keyMode: 'sparse', sparseActive: 6 },
    { label: 'sparse 16/64 (25%)', keyMode: 'sparse', sparseActive: 16 },
  ];

  heading(`4. Key geometry: dense vs. sparse non-negative (d=${d}, hebbian, ${SEEDS} seeds)`);
  console.log(`${pad('n', 5)} ` + configs.map((c) => pad(c.label, 19)).join(' '));

  const rows = ns.map((n) => {
    const cells = configs.map((c) => {
      const runs = [];
      for (let s = 0; s < SEEDS; s++) {
        runs.push(
          runTrial({
            d,
            n,
            seed: 8000 + s,
            rule: 'hebbian',
            keyMode: c.keyMode,
            sparseActive: c.sparseActive,
          }).series.at(-1).cosineAll,
        );
      }
      return mean(runs);
    });
    console.log(`${pad(n, 5)} ` + cells.map((x) => pad(f3(x), 19)).join(' '));
    return { n, values: Object.fromEntries(configs.map((c, i) => [c.label, cells[i]])) };
  });

  // How often do two sparse keys share any active coordinate at all? That is the
  // number that explains the table above.
  heading('4b. Chance two keys overlap at all, and mean dot product when they do');
  console.log(`${pad('support', 9)} ${pad('P(overlap)', 11)} ${pad('mean dot', 10)}`);
  const geometry = [];
  for (const active of [3, 6, 16]) {
    const rng = mulberry32(999);
    let overlapping = 0;
    let dotSum = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      const a = randomSparseNonNegative(d, active, rng);
      const b = randomSparseNonNegative(d, active, rng);
      let dp = 0;
      for (let j = 0; j < d; j++) dp += a[j] * b[j];
      if (dp > 0) overlapping++;
      dotSum += dp;
    }
    const row = { active, pOverlap: overlapping / trials, meanDot: dotSum / trials };
    geometry.push(row);
    console.log(
      `${pad(`${active}/${d}`, 9)} ${pad(f3(row.pOverlap), 11)} ${pad(f3(row.meanDot), 10)}`,
    );
  }

  // Dense keys for contrast: signed dot products that average to zero.
  const rng = mulberry32(1234);
  let denseAbs = 0;
  let denseSigned = 0;
  for (let i = 0; i < 4000; i++) {
    const a = randomUnitVector(d, rng);
    const b = randomUnitVector(d, rng);
    let dp = 0;
    for (let j = 0; j < d; j++) dp += a[j] * b[j];
    denseAbs += Math.abs(dp);
    denseSigned += dp;
  }
  console.log(
    `${pad('dense', 9)} ${pad('1.000', 11)} ${pad(f3(denseSigned / 4000), 10)}  (mean |dot| = ${f3(denseAbs / 4000)}, signs cancel)`,
  );

  return { d, ns, seeds: SEEDS, rows, geometry };
}

/* ================================================================ *
 * 5. The roster task the artifact actually shows
 * ================================================================ */

function experimentRoster() {
  const counts = [4, 8, 12, 16, 20];
  const ds = [16, 32, 64];

  heading(`5. Hall-allotment recall accuracy (correct rooms / names taught, ${SEEDS} seeds)`);
  console.log(
    `${pad('d', 4)} ${pad('names', 6)} ${pad('hebbian', 9)} ${pad('delta', 9)} ${pad('decay .9', 9)}`,
  );

  const rows = [];
  for (const d of ds) {
    for (const count of counts) {
      const acc = { hebbian: [], delta: [], decay: [] };
      for (let s = 0; s < SEEDS; s++) {
        const roster = buildRoster({ d, seed: 300 + s });
        for (const [id, params] of [
          ['hebbian', {}],
          ['delta', { beta: 1 }],
          ['decay', { lambda: 0.9 }],
        ]) {
          const memory = new FastWeightMemory(d, id, params);
          storeRoster(memory, roster, count);
          acc[id].push(evaluateRoster(memory, roster, count).accuracy);
        }
      }
      const row = {
        d,
        count,
        hebbian: mean(acc.hebbian),
        delta: mean(acc.delta),
        decay: mean(acc.decay),
      };
      rows.push(row);
      console.log(
        `${pad(d, 4)} ${pad(count, 6)} ${pad(f3(row.hebbian), 9)} ${pad(f3(row.delta), 9)} ${pad(f3(row.decay), 9)}`,
      );
    }
  }

  return { ds, counts, seeds: SEEDS, rosterSize: ROSTER.length, rows };
}

/* ================================================================ *
 * 6. Recall by age of the association
 *
 * Experiment 2 says the delta rule loses to plain Hebbian on the *unweighted
 * average over everything ever stored*. That metric is a choice, and on its own
 * it is unfair to the delta rule, which was designed to keep the current state
 * correct rather than to preserve a uniform archive. Splitting recall by how
 * long ago something was written shows what each rule is actually optimising.
 * ================================================================ */

function experimentRecency() {
  const d = 32;
  const n = 128;
  const buckets = 8;
  const perBucket = n / buckets;

  heading(`6. Recall cosine by age of association (d=${d}, n=${n}, ${SEEDS} seeds)`);
  console.log(
    `${pad('written at', 12)} ${pad('hebbian', 9)} ${pad('delta', 9)} ${pad('decay .9', 9)}`,
  );

  const acc = { hebbian: [], delta: [], decay: [] };
  for (const id of Object.keys(acc)) acc[id] = Array.from({ length: buckets }, () => []);

  for (let s = 0; s < SEEDS; s++) {
    for (const [id, params] of [
      ['hebbian', {}],
      ['delta', { beta: 1 }],
      ['decay', { lambda: 0.9 }],
    ]) {
      const trial = runTrial({ d, n, seed: 9000 + s, rule: id, params });
      for (let i = 0; i < n; i++) {
        const score = cosine(trial.memory.read(trial.keys[i]), trial.values[i]);
        acc[id][Math.floor(i / perBucket)].push(score);
      }
    }
  }

  const rows = [];
  for (let b = 0; b < buckets; b++) {
    const row = {
      from: b * perBucket + 1,
      to: (b + 1) * perBucket,
      hebbian: mean(acc.hebbian[b]),
      delta: mean(acc.delta[b]),
      decay: mean(acc.decay[b]),
    };
    rows.push(row);
    console.log(
      `${pad(`${row.from}-${row.to}`, 12)} ${pad(f3(row.hebbian), 9)} ${pad(f3(row.delta), 9)} ${pad(f3(row.decay), 9)}`,
    );
  }

  return { d, n, buckets, seeds: SEEDS, rows };
}

/* ================================================================ *
 * 7. How big does the state get?
 *
 * Variational Linear Attention (arXiv:2605.11196) points at the Frobenius norm
 * of the linear-attention state growing as O(T). Our retrieval metric is cosine,
 * which is scale-invariant and therefore blind to that growth on purpose — so we
 * measure the norm directly rather than pretending the cosine numbers speak to it.
 * ================================================================ */

function experimentStateNorm() {
  const d = 32;
  const ns = [8, 32, 128, 512];

  heading(`7. Frobenius norm of the state (d=${d}, ${SEEDS} seeds)`);
  console.log(
    `${pad('n', 6)} ${pad('hebbian', 9)} ${pad('sqrt(n)', 9)} ${pad('delta', 9)} ${pad('decay .9', 9)}`,
  );

  const rows = ns.map((n) => {
    const norms = { hebbian: [], delta: [], decay: [] };
    for (let s = 0; s < SEEDS; s++) {
      for (const [id, params] of [
        ['hebbian', {}],
        ['delta', { beta: 1 }],
        ['decay', { lambda: 0.9 }],
      ]) {
        const trial = runTrial({ d, n, seed: 11000 + s, rule: id, params });
        let sq = 0;
        for (let i = 0; i < trial.memory.S.length; i++) sq += trial.memory.S[i] ** 2;
        norms[id].push(Math.sqrt(sq));
      }
    }
    const row = {
      n,
      hebbian: mean(norms.hebbian),
      sqrtN: Math.sqrt(n),
      delta: mean(norms.delta),
      decay: mean(norms.decay),
    };
    console.log(
      `${pad(n, 6)} ${pad(f3(row.hebbian), 9)} ${pad(f3(row.sqrtN), 9)} ${pad(f3(row.delta), 9)} ${pad(f3(row.decay), 9)}`,
    );
    return row;
  });

  return { d, seeds: SEEDS, rows };
}

/* ================================================================ *
 * 8. Accumulation as evidence, not just as damage
 *
 * Everything above treats superposition as the thing that goes wrong. It is also
 * the thing that makes in-context learning work: BDH-CQ's contextual state
 * accumulates additively as each demonstration arrives, so consistent evidence
 * adds coherently while the noise on it does not. Worth measuring, because it is
 * the same mechanism pointed at a different job.
 * ================================================================ */

function noisyCopy(v, d, sigma, rng) {
  const out = new Float64Array(d);
  const perturb = randomUnitVector(d, rng);
  let sq = 0;
  for (let i = 0; i < d; i++) {
    out[i] = v[i] + sigma * perturb[i] * Math.sqrt(d);
    sq += out[i] * out[i];
  }
  const n = Math.sqrt(sq);
  for (let i = 0; i < d; i++) out[i] /= n;
  return out;
}

function experimentDemonstrations() {
  const d = 32;
  const distractors = 24;
  const counts = [1, 2, 4, 8, 16];

  heading(`8. Repeated demonstrations of one rule, amid ${distractors} distractors (d=${d})`);
  console.log(`${pad('demos', 6)} ${pad('clean', 9)} ${pad('noisy σ=0.5', 12)}`);

  const rows = counts.map((m) => {
    const clean = [];
    const noised = [];
    for (let s = 0; s < SEEDS; s++) {
      for (const [sigma, bucket] of [[0, clean], [0.5, noised]]) {
        const rng = mulberry32(4200 + s);
        const memory = new FastWeightMemory(d, 'hebbian');
        const k = randomUnitVector(d, rng);
        const v = randomUnitVector(d, rng);
        for (let i = 0; i < m; i++) memory.write(k, sigma === 0 ? v : noisyCopy(v, d, sigma, rng));
        for (let i = 0; i < distractors; i++) {
          memory.write(randomUnitVector(d, rng), randomUnitVector(d, rng));
        }
        bucket.push(cosine(memory.read(k), v));
      }
    }
    const row = { demos: m, clean: mean(clean), noisy: mean(noised) };
    console.log(`${pad(m, 6)} ${pad(f3(row.clean), 9)} ${pad(f3(row.noisy), 12)}`);
    return row;
  });

  heading('8b. Conflicting demonstrations at one key: the state returns a vote');
  console.log(`${pad('A:B', 7)} ${pad('recall A', 9)} ${pad('recall B', 9)} ${pad('predicted A', 12)}`);

  const conflicts = [[8, 0], [6, 2], [4, 4], [2, 6]].map(([a, b]) => {
    const ra = [];
    const rb = [];
    for (let s = 0; s < SEEDS; s++) {
      const rng = mulberry32(5200 + s);
      const memory = new FastWeightMemory(d, 'hebbian');
      const k = randomUnitVector(d, rng);
      const vA = randomUnitVector(d, rng);
      const vB = randomUnitVector(d, rng);
      for (let i = 0; i < a; i++) memory.write(k, vA);
      for (let i = 0; i < b; i++) memory.write(k, vB);
      const out = memory.read(k);
      ra.push(cosine(out, vA));
      rb.push(cosine(out, vB));
    }
    // For orthogonal vA, vB the readout is a*vA + b*vB, so cos to vA is
    // a / sqrt(a^2 + b^2). Printing it keeps the measurement honest.
    const predicted = a / Math.sqrt(a * a + b * b);
    const row = { a, b, recallA: mean(ra), recallB: mean(rb), predictedA: predicted };
    console.log(
      `${pad(`${a}:${b}`, 7)} ${pad(f3(row.recallA), 9)} ${pad(f3(row.recallB), 9)} ${pad(f3(predicted), 12)}`,
    );
    return row;
  });

  return { d, distractors, seeds: SEEDS, rows, conflicts };
}

/* ================================================================ */

const results = {
  generatedAt: new Date().toISOString(),
  seedsPerCell: SEEDS,
  capacity: experimentCapacity(),
  deltaAdvantage: experimentDeltaAdvantage(),
  collision: experimentCollision(),
  sparsity: experimentSparsity(),
  roster: experimentRoster(),
  recency: experimentRecency(),
  stateNorm: experimentStateNorm(),
  demonstrations: experimentDemonstrations(),
};

if (SAVE) {
  mkdirSync(join(ROOT, 'results'), { recursive: true });
  const out = join(ROOT, 'results', 'experiments.json');
  writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nSaved ${out}`);
}
