import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FastWeightMemory,
  mulberry32,
  randomUnitVector,
  cosine,
} from '../src/memory.js';

/*
 * The BDH-CQ side of the mechanism: additive accumulation as evidence rather than
 * as damage. These pin the two properties the demonstration lab claims.
 */

function noisyCopy(v, d, sigma, rng) {
  const perturb = randomUnitVector(d, rng);
  const out = new Float64Array(d);
  let sq = 0;
  for (let i = 0; i < d; i++) {
    out[i] = v[i] + sigma * perturb[i] * Math.sqrt(d);
    sq += out[i] * out[i];
  }
  const n = Math.sqrt(sq);
  for (let i = 0; i < d; i++) out[i] /= n;
  return out;
}

function recallAfter(m, sigma, { d = 32, distractors = 24, seeds = 24 } = {}) {
  let total = 0;
  for (let s = 0; s < seeds; s++) {
    const rng = mulberry32(4200 + s);
    const memory = new FastWeightMemory(d, 'hebbian');
    const k = randomUnitVector(d, rng);
    const v = randomUnitVector(d, rng);
    for (let i = 0; i < distractors; i++) {
      memory.write(randomUnitVector(d, rng), randomUnitVector(d, rng));
    }
    for (let i = 0; i < m; i++) memory.write(k, sigma === 0 ? v : noisyCopy(v, d, sigma, rng));
    total += cosine(memory.read(k), v);
  }
  return total / seeds;
}

test('repeated noisy demonstrations of one rule sharpen recall monotonically', () => {
  const sigma = 0.5;
  const curve = [1, 2, 4, 8, 16].map((m) => recallAfter(m, sigma));
  for (let i = 1; i < curve.length; i++) {
    assert.ok(
      curve[i] > curve[i - 1],
      `recall should keep improving with evidence: ${curve.map((x) => x.toFixed(3)).join(' -> ')}`,
    );
  }
  assert.ok(curve[0] < 0.4, `one noisy demonstration should be weak, got ${curve[0].toFixed(3)}`);
  assert.ok(curve.at(-1) > 0.75, `sixteen should be strong, got ${curve.at(-1).toFixed(3)}`);
});

test('the state size does not change no matter how much evidence arrives', () => {
  const memory = new FastWeightMemory(32, 'hebbian');
  const rng = mulberry32(1);
  const before = memory.bytes();
  const k = randomUnitVector(32, rng);
  const v = randomUnitVector(32, rng);
  for (let i = 0; i < 500; i++) memory.write(k, v);
  assert.equal(memory.bytes(), before);
});

test('conflicting demonstrations return the vote-weighted blend, matching closed form', () => {
  // For orthogonal answers the readout is a*vA + b*vB, so cos to vA is a/sqrt(a^2+b^2).
  // Random unit vectors are only approximately orthogonal, so this is a statement
  // about the mean over seeds, not about any single draw.
  const d = 32;
  const seeds = 48;
  for (const [a, b] of [[8, 0], [6, 2], [4, 4], [2, 6]]) {
    let sumA = 0;
    for (let s = 0; s < seeds; s++) {
      const rng = mulberry32(5200 + s);
      const memory = new FastWeightMemory(d, 'hebbian');
      const k = randomUnitVector(d, rng);
      const vA = randomUnitVector(d, rng);
      const vB = randomUnitVector(d, rng);
      for (let i = 0; i < a; i++) memory.write(k, vA);
      for (let i = 0; i < b; i++) memory.write(k, vB);
      sumA += cosine(memory.read(k), vA);
    }
    const measured = sumA / seeds;
    const predicted = a / Math.sqrt(a * a + b * b);
    assert.ok(
      Math.abs(measured - predicted) < 0.04,
      `${a}:${b} measured ${measured.toFixed(3)} vs closed form ${predicted.toFixed(3)}`,
    );
  }
});

test('an even split leaves both answers equally recalled, at neither of them', () => {
  const d = 32;
  const seeds = 48;
  let sumA = 0;
  let sumB = 0;
  for (let s = 0; s < seeds; s++) {
    const rng = mulberry32(5200 + s);
    const memory = new FastWeightMemory(d, 'hebbian');
    const k = randomUnitVector(d, rng);
    const vA = randomUnitVector(d, rng);
    const vB = randomUnitVector(d, rng);
    for (let i = 0; i < 4; i++) memory.write(k, vA);
    for (let i = 0; i < 4; i++) memory.write(k, vB);
    const out = memory.read(k);
    sumA += cosine(out, vA);
    sumB += cosine(out, vB);
  }
  const a = sumA / seeds;
  const b = sumB / seeds;
  assert.ok(Math.abs(a - b) < 0.03, `an even vote should be even: ${a.toFixed(3)} vs ${b.toFixed(3)}`);
  assert.ok(a < 0.95, 'a blend is not a clean answer to either question');
});
