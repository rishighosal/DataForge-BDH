import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mulberry32,
  randomUnitVector,
  randomSparseNonNegative,
  emptyState,
  readState,
  cosine,
  norm,
  dot,
  decode,
  theoreticalCosine,
  runTrial,
  RULES,
  FastWeightMemory,
  KVCache,
} from '../src/memory.js';

const close = (a, b, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `expected ${a} to be within ${tol} of ${b}`);

/* ---------------------------------------------------------------- *
 * Random numbers
 * ---------------------------------------------------------------- */

test('rng is deterministic for a given seed and differs across seeds', () => {
  const a = Array.from({ length: 8 }, mulberry32(42));
  const b = Array.from({ length: 8 }, mulberry32(42));
  const c = Array.from({ length: 8 }, mulberry32(43));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const x of a) assert.ok(x >= 0 && x < 1, `${x} outside [0,1)`);
});

test('dense keys are unit vectors', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 20; i++) close(norm(randomUnitVector(32, rng)), 1, 1e-12);
});

test('sparse keys are non-negative, unit norm, and have the requested support size', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 20; i++) {
    const v = randomSparseNonNegative(64, 3, rng);
    close(norm(v), 1, 1e-12);
    assert.equal(v.filter((x) => x !== 0).length, 3);
    assert.ok(v.every((x) => x >= 0), 'sparse activations must be non-negative');
  }
});

test('sparse support size is clamped into [1, d] rather than silently rounding to zero', () => {
  const rng = mulberry32(3);
  assert.equal(randomSparseNonNegative(16, 0.4, rng).filter((x) => x !== 0).length, 1);
  assert.equal(randomSparseNonNegative(16, 999, rng).filter((x) => x !== 0).length, 16);
});

/* ---------------------------------------------------------------- *
 * The read/write convention, checked by hand
 * ---------------------------------------------------------------- */

test('outer-product write and readout follow the documented convention', () => {
  // Hand-worked 2-D case. k picks out row 0, so S row 0 should become v exactly.
  const d = 2;
  const S = emptyState(d);
  const k = Float64Array.from([1, 0]);
  const v = Float64Array.from([0.6, 0.8]);

  RULES.hebbian.write(S, d, k, v);

  assert.deepEqual(Array.from(S), [0.6, 0.8, 0, 0]);
  assert.deepEqual(Array.from(readState(S, d, k)), [0.6, 0.8]);
  // An orthogonal key reads nothing back out. This is why near-orthogonal keys
  // are the whole trick, and why collisions are the whole failure mode.
  assert.deepEqual(Array.from(readState(S, d, Float64Array.from([0, 1]))), [0, 0]);
});

test('a single stored association is recovered exactly', () => {
  const d = 32;
  const rng = mulberry32(5);
  const memory = new FastWeightMemory(d, 'hebbian');
  const k = randomUnitVector(d, rng);
  const v = randomUnitVector(d, rng);
  memory.write(k, v);
  close(cosine(memory.read(k), v), 1, 1e-12);
});

/* ---------------------------------------------------------------- *
 * What makes each write rule the rule it is
 * ---------------------------------------------------------------- */

test('delta rule at beta=1 makes the key read back the new value exactly', () => {
  // This is the defining property: subtract the current read, then write. After
  // writing v2 over v1 at the same key, the key must return v2, not v1 + v2.
  const d = 24;
  const rng = mulberry32(9);
  const k = randomUnitVector(d, rng);
  const v1 = randomUnitVector(d, rng);
  const v2 = randomUnitVector(d, rng);

  const delta = new FastWeightMemory(d, 'delta', { beta: 1 });
  delta.write(k, v1);
  delta.write(k, v2);
  close(cosine(delta.read(k), v2), 1, 1e-9);

  const hebbian = new FastWeightMemory(d, 'hebbian');
  hebbian.write(k, v1);
  hebbian.write(k, v2);
  // Hebbian just piles them up, so it lands between the two.
  const blended = cosine(hebbian.read(k), v2);
  assert.ok(blended < 0.99, `expected a blend, got cosine ${blended}`);
  close(cosine(hebbian.read(k), v1), cosine(hebbian.read(k), v2), 0.5);
});

test('delta rule is identical to hebbian on an empty state', () => {
  const d = 16;
  const rng = mulberry32(11);
  const k = randomUnitVector(d, rng);
  const v = randomUnitVector(d, rng);

  const a = new FastWeightMemory(d, 'hebbian');
  const b = new FastWeightMemory(d, 'delta', { beta: 1 });
  a.write(k, v);
  b.write(k, v);
  for (let i = 0; i < a.S.length; i++) close(a.S[i], b.S[i], 1e-12);
});

test('decay rule with lambda=1 is exactly hebbian', () => {
  const d = 16;
  const rng = mulberry32(13);
  const pairs = Array.from({ length: 6 }, () => [
    randomUnitVector(d, rng),
    randomUnitVector(d, rng),
  ]);

  const a = new FastWeightMemory(d, 'hebbian');
  const b = new FastWeightMemory(d, 'decay', { lambda: 1 });
  for (const [k, v] of pairs) {
    a.write(k, v);
    b.write(k, v);
  }
  for (let i = 0; i < a.S.length; i++) close(a.S[i], b.S[i], 1e-12);
});

test('decay rule forgets: the oldest association degrades more than the newest', () => {
  const d = 32;
  const rng = mulberry32(17);
  const pairs = Array.from({ length: 30 }, () => [
    randomUnitVector(d, rng),
    randomUnitVector(d, rng),
  ]);

  const memory = new FastWeightMemory(d, 'decay', { lambda: 0.85 });
  for (const [k, v] of pairs) memory.write(k, v);

  const oldest = cosine(memory.read(pairs[0][0]), pairs[0][1]);
  const newest = cosine(memory.read(pairs.at(-1)[0]), pairs.at(-1)[1]);
  assert.ok(
    newest > oldest + 0.3,
    `decay should favour recency: newest ${newest.toFixed(3)} vs oldest ${oldest.toFixed(3)}`,
  );
});

test('hebbian writes are order-independent; decay writes are not', () => {
  const d = 16;
  const rng = mulberry32(19);
  const pairs = Array.from({ length: 5 }, () => [
    randomUnitVector(d, rng),
    randomUnitVector(d, rng),
  ]);
  const reversed = [...pairs].reverse();

  const forward = new FastWeightMemory(d, 'hebbian');
  const backward = new FastWeightMemory(d, 'hebbian');
  for (const [k, v] of pairs) forward.write(k, v);
  for (const [k, v] of reversed) backward.write(k, v);
  for (let i = 0; i < forward.S.length; i++) close(forward.S[i], backward.S[i], 1e-9);

  const decayForward = new FastWeightMemory(d, 'decay', { lambda: 0.8 });
  const decayBackward = new FastWeightMemory(d, 'decay', { lambda: 0.8 });
  for (const [k, v] of pairs) decayForward.write(k, v);
  for (const [k, v] of reversed) decayBackward.write(k, v);
  const identical = decayForward.S.every((x, i) => Math.abs(x - decayBackward.S[i]) < 1e-9);
  assert.ok(!identical, 'a forgetting gate must make write order matter');
});

/* ---------------------------------------------------------------- *
 * The memory-growth claim the whole page rests on
 * ---------------------------------------------------------------- */

test('state size is constant in n while the cache grows linearly', () => {
  const d = 16;
  const memory = new FastWeightMemory(d, 'hebbian');
  const cache = new KVCache(d);
  const rng = mulberry32(23);

  const stateSizes = new Set();
  const cacheSizes = [];
  for (let t = 1; t <= 50; t++) {
    const k = randomUnitVector(d, rng);
    const v = randomUnitVector(d, rng);
    memory.write(k, v);
    cache.write(k, v);
    stateSizes.add(memory.bytes());
    cacheSizes.push(cache.bytes());
  }

  assert.equal(stateSizes.size, 1, 'fast-weight state must never grow');
  assert.equal(memory.bytes(), 16 * 16 * 8);
  for (let i = 1; i < cacheSizes.length; i++) {
    assert.equal(cacheSizes[i] - cacheSizes[i - 1], d * 2 * 8, 'cache must grow by one entry');
  }
});

test('the cache is exact no matter how much is stored', () => {
  const d = 8;
  const cache = new KVCache(d);
  const rng = mulberry32(29);
  const values = [];
  for (let t = 0; t < 200; t++) {
    const v = randomUnitVector(d, rng);
    values.push(v);
    cache.write(randomUnitVector(d, rng), v);
  }
  for (let i = 0; i < values.length; i++) close(cosine(cache.read(i), values[i]), 1, 1e-12);
});

/* ---------------------------------------------------------------- *
 * Claims the artifact makes out loud, pinned so they cannot rot
 * ---------------------------------------------------------------- */

test('hebbian recall degrades as n grows relative to d', () => {
  const d = 32;
  const at = (n) => runTrial({ d, n, seed: 3, rule: 'hebbian' }).series.at(-1).cosineAll;
  const few = at(4);
  const some = at(32);
  const many = at(128);
  assert.ok(few > some, `n=4 (${few.toFixed(3)}) should beat n=32 (${some.toFixed(3)})`);
  assert.ok(some > many, `n=32 (${some.toFixed(3)}) should beat n=128 (${many.toFixed(3)})`);
});

test('raising d at fixed n improves hebbian recall', () => {
  const at = (d) => runTrial({ d, n: 48, seed: 4, rule: 'hebbian' }).series.at(-1).cosineAll;
  assert.ok(at(64) > at(16), 'more dimensions must mean less crosstalk');
});

test('the theoretical curve tracks measured hebbian recall across seeds', () => {
  // Averaged over 40 seeds so this is a statement about the model, not one draw.
  const d = 32;
  for (const n of [16, 32, 64, 128]) {
    let sum = 0;
    const seeds = 40;
    for (let s = 0; s < seeds; s++) {
      sum += runTrial({ d, n, seed: 1000 + s, rule: 'hebbian' }).series.at(-1).cosineAll;
    }
    const measured = sum / seeds;
    const predicted = theoreticalCosine(n, d);
    assert.ok(
      Math.abs(measured - predicted) < 0.06,
      `n=${n}: measured ${measured.toFixed(3)} vs predicted ${predicted.toFixed(3)}`,
    );
  }
});

/*
 * The next three tests pin down the result that surprised us most, and that the
 * artifact now leads with. We expected the delta rule to beat plain Hebbian
 * everywhere, because that is what you would guess from reading abstracts. On an
 * unweighted average over everything ever stored it does not: it wins slightly
 * when the memory is nearly empty and loses badly once the memory is overloaded.
 * The reason is in the recency test below. Numbers: docs/experiments.md.
 */

const meanOver = (seeds, fn) => {
  let sum = 0;
  for (let s = 0; s < seeds; s++) sum += fn(s);
  return sum / seeds;
};

test('delta rule edges out hebbian while the memory is nearly empty', () => {
  const d = 32;
  const n = 8;
  const hebbian = meanOver(20, (s) => runTrial({ d, n, seed: 6000 + s, rule: 'hebbian' }).series.at(-1).cosineAll);
  const delta = meanOver(20, (s) =>
    runTrial({ d, n, seed: 6000 + s, rule: 'delta', params: { beta: 1 } }).series.at(-1).cosineAll,
  );
  assert.ok(delta > hebbian, `delta ${delta.toFixed(3)} should edge hebbian ${hebbian.toFixed(3)}`);
});

test('hebbian beats delta on uniform recall once the memory is overloaded', () => {
  const d = 32;
  const n = 128;
  const hebbian = meanOver(20, (s) => runTrial({ d, n, seed: 6000 + s, rule: 'hebbian' }).series.at(-1).cosineAll);
  const delta = meanOver(20, (s) =>
    runTrial({ d, n, seed: 6000 + s, rule: 'delta', params: { beta: 1 } }).series.at(-1).cosineAll,
  );
  assert.ok(
    hebbian > delta + 0.15,
    `at n=4d hebbian ${hebbian.toFixed(3)} should clearly beat delta ${delta.toFixed(3)}`,
  );
});

test('hebbian recall is flat across age; delta and decay are strongly recency-biased', () => {
  const d = 32;
  const n = 128;
  const seeds = 20;
  const ageProfile = (rule, params) => {
    let oldest = 0;
    let newest = 0;
    for (let s = 0; s < seeds; s++) {
      const trial = runTrial({ d, n, seed: 9000 + s, rule, params });
      for (let i = 0; i < 16; i++) {
        oldest += cosine(trial.memory.read(trial.keys[i]), trial.values[i]);
        const j = n - 16 + i;
        newest += cosine(trial.memory.read(trial.keys[j]), trial.values[j]);
      }
    }
    return { oldest: oldest / (seeds * 16), newest: newest / (seeds * 16) };
  };

  const hebbian = ageProfile('hebbian', {});
  assert.ok(
    Math.abs(hebbian.newest - hebbian.oldest) < 0.05,
    `hebbian must be order-independent: oldest ${hebbian.oldest.toFixed(3)} vs newest ${hebbian.newest.toFixed(3)}`,
  );

  for (const [rule, params] of [
    ['delta', { beta: 1 }],
    ['decay', { lambda: 0.9 }],
  ]) {
    const profile = ageProfile(rule, params);
    assert.ok(
      profile.newest > profile.oldest + 0.4,
      `${rule} must favour recent writes: oldest ${profile.oldest.toFixed(3)} vs newest ${profile.newest.toFixed(3)}`,
    );
  }
});

test('hebbian state norm grows like sqrt(n) while delta and decay stay bounded', () => {
  const d = 32;
  const frobenius = (trial) => {
    let sq = 0;
    for (let i = 0; i < trial.memory.S.length; i++) sq += trial.memory.S[i] ** 2;
    return Math.sqrt(sq);
  };

  for (const n of [32, 128, 512]) {
    const hebbian = meanOver(10, (s) => frobenius(runTrial({ d, n, seed: 11000 + s, rule: 'hebbian' })));
    assert.ok(
      Math.abs(hebbian - Math.sqrt(n)) / Math.sqrt(n) < 0.05,
      `hebbian norm at n=${n} was ${hebbian.toFixed(2)}, expected about ${Math.sqrt(n).toFixed(2)}`,
    );
  }

  const deltaSmall = meanOver(10, (s) =>
    frobenius(runTrial({ d, n: 128, seed: 11000 + s, rule: 'delta', params: { beta: 1 } })),
  );
  const deltaLarge = meanOver(10, (s) =>
    frobenius(runTrial({ d, n: 512, seed: 11000 + s, rule: 'delta', params: { beta: 1 } })),
  );
  assert.ok(
    Math.abs(deltaLarge - deltaSmall) < 1,
    `delta norm must saturate: ${deltaSmall.toFixed(2)} at n=128 vs ${deltaLarge.toFixed(2)} at n=512`,
  );
});

test('at BDH-reported sparsity the sparse regime matches the dense one', () => {
  // This is the measurement that justifies using dense Gaussian vectors as a
  // stand-in for BDH's sparse non-negative activations. At ~5% active the two
  // regimes agree closely; by 25% active they clearly do not.
  const d = 64;
  const seeds = 20;
  const at = (keyMode, sparseActive, n) =>
    meanOver(seeds, (s) =>
      runTrial({ d, n, seed: 8000 + s, rule: 'hebbian', keyMode, sparseActive }).series.at(-1)
        .cosineAll,
    );

  for (const n of [16, 64]) {
    const dense = at('dense', null, n);
    const sparse5 = at('sparse', 3, n);
    assert.ok(
      Math.abs(dense - sparse5) < 0.03,
      `n=${n}: dense ${dense.toFixed(3)} vs 5%-sparse ${sparse5.toFixed(3)} should agree closely`,
    );
  }

  const dense = at('dense', null, 16);
  const sparse25 = at('sparse', 16, 16);
  assert.ok(
    dense - sparse25 > 0.1,
    `25%-dense sparse keys should be clearly worse: ${sparse25.toFixed(3)} vs ${dense.toFixed(3)}`,
  );
});

/* ---------------------------------------------------------------- *
 * Decoding
 * ---------------------------------------------------------------- */

test('decode picks the nearest vocabulary entry and reports a usable margin', () => {
  const d = 16;
  const rng = mulberry32(31);
  const vocabulary = Array.from({ length: 12 }, () => randomUnitVector(d, rng));
  const target = 5;
  const result = decode(vocabulary[target], vocabulary);
  assert.equal(result.index, target);
  close(result.score, 1, 1e-12);
  assert.ok(result.margin > 0.5, `an exact hit should be unambiguous, got ${result.margin}`);
});

test('runTrial is reproducible and prefix-stable as n grows', () => {
  const a = runTrial({ d: 16, n: 10, seed: 77, rule: 'hebbian' });
  const b = runTrial({ d: 16, n: 10, seed: 77, rule: 'hebbian' });
  const longer = runTrial({ d: 16, n: 25, seed: 77, rule: 'hebbian' });

  assert.deepEqual(
    a.series.map((s) => s.cosineAll),
    b.series.map((s) => s.cosineAll),
  );
  // Dragging the n slider must extend the same run, not resample a different one.
  for (let i = 0; i < 10; i++) close(a.series[i].cosineAll, longer.series[i].cosineAll, 1e-12);
});

test('dot and cosine agree on orthogonal and identical inputs', () => {
  const a = Float64Array.from([3, 0]);
  const b = Float64Array.from([0, 7]);
  close(dot(a, b), 0);
  close(cosine(a, b), 0);
  close(cosine(a, a), 1);
  close(cosine(a, Float64Array.from([0, 0])), 0, 1e-12);
});
