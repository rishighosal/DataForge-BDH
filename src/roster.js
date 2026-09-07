/**
 * A concrete lookup task to hang the abstract memory on.
 *
 * Cosine similarity is the honest metric but it is a terrible teacher: 0.71 does
 * not feel like anything. "You asked where Ananya lives and the memory said
 * Rohit's room" feels like something. So the demo stores a hall allotment —
 * name -> room — and decodes each readout against the full list of rooms in the
 * hall. A degraded memory does not return noise, it returns somebody else's room,
 * which is exactly how associative interference shows up in a real system.
 *
 * The roster is synthetic. The names and room numbers are invented for this demo
 * and are not anyone's real allotment; the hall abbreviations are the familiar
 * IIT Kharagpur ones because this was built for DataForge and the room codes
 * should read like room codes to the people in the room.
 */

import { mulberry32, makeVectorSource, decode, cosine } from './memory.js';

export const ROSTER = [
  { name: 'Ananya', room: 'LLR-214' },
  { name: 'Rohit', room: 'RK-117' },
  { name: 'Meera', room: 'MMM-308' },
  { name: 'Kabir', room: 'RP-142' },
  { name: 'Ishita', room: 'SNVH-221' },
  { name: 'Arjun', room: 'AZAD-119' },
  { name: 'Priya', room: 'MT-306' },
  { name: 'Devansh', room: 'NEHRU-233' },
  { name: 'Sneha', room: 'LLR-127' },
  { name: 'Vikram', room: 'PATEL-205' },
  { name: 'Tanvi', room: 'MT-118' },
  { name: 'Aditya', room: 'HJB-241' },
  { name: 'Nikhil', room: 'VS-134' },
  { name: 'Riya', room: 'SNVH-312' },
  { name: 'Farhan', room: 'ZH-209' },
  { name: 'Shreya', room: 'MT-224' },
  { name: 'Kunal', room: 'JCB-136' },
  { name: 'Divya', room: 'SNVH-105' },
  { name: 'Manish', room: 'RK-320' },
  { name: 'Aisha', room: 'MT-142' },
];

/**
 * Rooms that exist in the hall but hold nobody from our roster. Without these the
 * decoder would be choosing between only the rooms it was taught, which makes the
 * task easier than it should be and quietly flatters the memory.
 */
export const DECOY_ROOMS = [
  'LLR-309', 'RK-205', 'MMM-114', 'RP-227', 'SNVH-140',
  'AZAD-233', 'MT-215', 'NEHRU-118', 'PATEL-311', 'HJB-107',
  'VS-228', 'ZH-134',
];

export const ROOM_VOCABULARY = [...ROSTER.map((entry) => entry.room), ...DECOY_ROOMS];

/**
 * Turn the roster into vectors.
 *
 * Every name gets a key vector and every room in the hall — assigned or not —
 * gets a value vector. Both come from the same generator, so switching the demo
 * to sparse non-negative (BDH-shaped) activations switches names and rooms
 * together, which is what BDH actually does: one representation scheme for
 * everything on the wire.
 */
export function buildRoster({ d, seed = 11, keyMode = 'dense', sparseActive = null }) {
  const active = sparseActive ?? Math.max(1, Math.round(d * 0.05));
  const vectorFor = makeVectorSource(keyMode, d, active);
  const rng = mulberry32(seed);

  const vocabulary = ROOM_VOCABULARY.map((room) => ({ room, vector: vectorFor(rng) }));
  const roomIndex = new Map(vocabulary.map((entry, i) => [entry.room, i]));

  const entries = ROSTER.map((entry) => ({
    name: entry.name,
    room: entry.room,
    roomIndex: roomIndex.get(entry.room),
    key: vectorFor(rng),
  }));

  return { d, keyMode, sparseActive, entries, vocabulary };
}

/** Write the first `count` allotments into a memory, in roster order. */
export function storeRoster(memory, roster, count) {
  const limit = Math.min(count, roster.entries.length);
  for (let i = 0; i < limit; i++) {
    const entry = roster.entries[i];
    memory.write(entry.key, roster.vocabulary[entry.roomIndex].vector);
  }
  return limit;
}

/**
 * Ask the memory about every name it was taught and check the answer against the
 * roster. Returns one row per name plus the headline accuracy.
 */
export function evaluateRoster(memory, roster, count) {
  const limit = Math.min(count, roster.entries.length);
  const vectors = roster.vocabulary.map((entry) => entry.vector);
  const rows = [];
  let correct = 0;
  let cosineSum = 0;

  for (let i = 0; i < limit; i++) {
    const entry = roster.entries[i];
    const readout = memory.read(entry.key);
    const guess = decode(readout, vectors);
    const isCorrect = guess.index === entry.roomIndex;
    if (isCorrect) correct++;
    const trueCosine = cosine(readout, vectors[entry.roomIndex]);
    cosineSum += trueCosine;

    rows.push({
      position: i,
      name: entry.name,
      expected: entry.room,
      predicted: roster.vocabulary[guess.index]?.room ?? '—',
      correct: isCorrect,
      confidence: guess.score,
      margin: guess.margin,
      cosine: trueCosine,
    });
  }

  return {
    rows,
    correct,
    total: limit,
    accuracy: limit ? correct / limit : 1,
    meanCosine: limit ? cosineSum / limit : 1,
  };
}
