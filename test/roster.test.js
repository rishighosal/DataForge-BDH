import test from 'node:test';
import assert from 'node:assert/strict';

import { FastWeightMemory, cosine } from '../src/memory.js';
import {
  ROSTER,
  ROOM_VOCABULARY,
  buildRoster,
  storeRoster,
  evaluateRoster,
} from '../src/roster.js';

test('the roster is well formed: unique names, unique rooms, decoys present', () => {
  const names = ROSTER.map((r) => r.name);
  const rooms = ROSTER.map((r) => r.room);
  assert.equal(new Set(names).size, names.length, 'two students in one demo confuse the demo');
  assert.equal(new Set(rooms).size, rooms.length, 'two students cannot share a room here');
  assert.ok(
    ROOM_VOCABULARY.length > ROSTER.length,
    'the decoder must choose between more rooms than were taught, or the task is too easy',
  );
  assert.equal(new Set(ROOM_VOCABULARY).size, ROOM_VOCABULARY.length);
});

test('buildRoster is deterministic per seed and assigns every name a real room', () => {
  const a = buildRoster({ d: 32, seed: 5 });
  const b = buildRoster({ d: 32, seed: 5 });
  assert.deepEqual(Array.from(a.entries[0].key), Array.from(b.entries[0].key));

  for (const entry of a.entries) {
    assert.equal(a.vocabulary[entry.roomIndex].room, entry.room);
  }
});

test('a memory taught one name answers that name correctly and confidently', () => {
  const roster = buildRoster({ d: 32, seed: 2 });
  const memory = new FastWeightMemory(32, 'hebbian');
  storeRoster(memory, roster, 1);
  const result = evaluateRoster(memory, roster, 1);

  assert.equal(result.correct, 1);
  assert.equal(result.rows[0].predicted, roster.entries[0].room);
  assert.ok(result.rows[0].margin > 0.5, 'a single stored fact should be unambiguous');
  assert.ok(result.rows[0].cosine > 0.99);
});

test('storeRoster never writes more pairs than the roster holds', () => {
  const roster = buildRoster({ d: 16, seed: 3 });
  const memory = new FastWeightMemory(16, 'hebbian');
  const written = storeRoster(memory, roster, 999);
  assert.equal(written, ROSTER.length);
  assert.equal(memory.writes, ROSTER.length);
  assert.equal(evaluateRoster(memory, roster, 999).total, ROSTER.length);
});

test('roster accuracy falls as more names are crammed into the same state', () => {
  // Averaged over seeds: a single roster draw is noisy enough to invert.
  const d = 16;
  const seeds = 30;
  const accuracyAt = (count) => {
    let sum = 0;
    for (let s = 0; s < seeds; s++) {
      const roster = buildRoster({ d, seed: 400 + s });
      const memory = new FastWeightMemory(d, 'hebbian');
      storeRoster(memory, roster, count);
      sum += evaluateRoster(memory, roster, count).accuracy;
    }
    return sum / seeds;
  };

  const few = accuracyAt(4);
  const many = accuracyAt(20);
  assert.ok(few > 0.95, `4 names should be near-perfect, got ${few.toFixed(3)}`);
  assert.ok(many < few - 0.1, `20 names should be visibly worse, got ${many.toFixed(3)}`);
});

test('a wrong answer is another student real room, not noise', () => {
  // This is the pedagogical point of the whole roster: interference does not
  // produce garbage, it produces a confident, plausible, wrong answer.
  const d = 12;
  let sawMistake = false;
  for (let s = 0; s < 40 && !sawMistake; s++) {
    const roster = buildRoster({ d, seed: 900 + s });
    const memory = new FastWeightMemory(d, 'hebbian');
    storeRoster(memory, roster, 20);
    for (const row of evaluateRoster(memory, roster, 20).rows) {
      if (!row.correct) {
        sawMistake = true;
        assert.ok(
          ROOM_VOCABULARY.includes(row.predicted),
          `predicted "${row.predicted}" should still be a real room in the hall`,
        );
        assert.notEqual(row.predicted, row.expected);
      }
    }
  }
  assert.ok(sawMistake, 'an overloaded 12-d memory should get at least one room wrong');
});

test('delta and decay concentrate roster accuracy on the most recent names', () => {
  const d = 16;
  const seeds = 30;
  const half = 10;

  for (const [rule, params] of [
    ['delta', { beta: 1 }],
    ['decay', { lambda: 0.9 }],
  ]) {
    let early = 0;
    let late = 0;
    for (let s = 0; s < seeds; s++) {
      const roster = buildRoster({ d, seed: 500 + s });
      const memory = new FastWeightMemory(d, rule, params);
      storeRoster(memory, roster, 20);
      const rows = evaluateRoster(memory, roster, 20).rows;
      early += rows.slice(0, half).filter((r) => r.correct).length / half;
      late += rows.slice(half).filter((r) => r.correct).length / half;
    }
    early /= seeds;
    late /= seeds;
    assert.ok(
      late > early + 0.2,
      `${rule} should remember the last names better: early ${early.toFixed(2)} vs late ${late.toFixed(2)}`,
    );
  }
});

test('hebbian shows no such recency preference on the roster', () => {
  const d = 16;
  const seeds = 30;
  const half = 10;
  let early = 0;
  let late = 0;
  for (let s = 0; s < seeds; s++) {
    const roster = buildRoster({ d, seed: 500 + s });
    const memory = new FastWeightMemory(d, 'hebbian');
    storeRoster(memory, roster, 20);
    const rows = evaluateRoster(memory, roster, 20).rows;
    early += rows.slice(0, half).filter((r) => r.correct).length / half;
    late += rows.slice(half).filter((r) => r.correct).length / half;
  }
  early /= seeds;
  late /= seeds;
  assert.ok(
    Math.abs(late - early) < 0.15,
    `hebbian is order-independent, so early ${early.toFixed(2)} and late ${late.toFixed(2)} should match`,
  );
});

test('sparse BDH-shaped keys still solve the roster at low load', () => {
  const roster = buildRoster({ d: 64, seed: 8, keyMode: 'sparse', sparseActive: 3 });
  const memory = new FastWeightMemory(64, 'hebbian');
  storeRoster(memory, roster, 8);
  assert.equal(evaluateRoster(memory, roster, 8).accuracy, 1);
});
