/**
 * Demonstration lab — the BDH-CQ side of the same mechanism.
 *
 * Every other component here treats superposition as damage. This one points it at
 * the job it is good at. Write the same association several times with different
 * noise on it each time: the signal is identical every time so it adds coherently,
 * the noise is different every time so it partly cancels, and a fixed-size state
 * ends up holding a rule nobody handed it directly.
 *
 * That is what BDH-CQ's contextual memory does with demonstrations, one level up
 * from tokens. This is a toy of the mechanism, not an implementation of BDH-CQ.
 */

import { FastWeightMemory, mulberry32, randomUnitVector, cosine } from './memory.js';
import { lineChart } from './charts.js';

const SEEDS = 24; // enough to smooth the curve, few enough to stay under a frame

export function createDemonstrationLab(root, config = {}) {
  const state = {
    d: config.d ?? 32,
    demos: config.demos ?? 4,
    sigma: config.sigma ?? 0.5,
    distractors: config.distractors ?? 24,
    split: 4,
    seed: 4200,
  };

  root.replaceChildren();
  root.innerHTML = `
    <div class="controls" style="margin-bottom:18px">
      <div class="control">
        <label for="dl-m">Demonstrations of the rule <span class="value" id="dl-m-val">${state.demos}</span></label>
        <input id="dl-m" type="range" min="1" max="16" step="1" value="${state.demos}">
      </div>
      <div class="control">
        <label for="dl-s">Noise on each one <span class="value" id="dl-s-val">${state.sigma.toFixed(2)}</span></label>
        <input id="dl-s" type="range" min="0" max="0.8" step="0.05" value="${state.sigma}">
      </div>
    </div>
    <div class="split" style="gap:24px">
      <div>
        <div class="chart-title">Recall of the rule against evidence seen</div>
        <div id="dl-chart"></div>
        <div class="legend" style="margin-top:10px">
          <span class="legend-item"><span class="swatch" style="background:var(--hebbian)"></span>noisy demonstrations</span>
          <span class="legend-item"><span class="swatch" style="background:var(--cache)"></span>clean demonstrations</span>
        </div>
      </div>
      <div class="stack" style="gap:14px">
        <div id="dl-read"></div>
        <div>
          <div class="chart-title">When demonstrations disagree</div>
          <div class="control">
            <label for="dl-split">Evidence split <span class="value" id="dl-split-val">4 : 4</span></label>
            <input id="dl-split" type="range" min="0" max="8" step="1" value="${state.split}">
          </div>
          <div id="dl-vote" style="margin-top:10px"></div>
        </div>
      </div>
    </div>`;

  const chartBox = root.querySelector('#dl-chart');
  const readBox = root.querySelector('#dl-read');
  const voteBox = root.querySelector('#dl-vote');

  function noisyCopy(v, sigma, rng) {
    const d = state.d;
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

  /**
   * Mean recall of the rule after 1..16 demonstrations, averaged over SEEDS runs.
   *
   * A single run of this is jagged enough to read as "no effect", which would be a
   * lie about the mechanism rather than a quirk of presentation, so the curve is a
   * mean like every number in docs/experiments.md.
   *
   * The distractors are written *before* the demonstrations here, which lets one
   * pass produce the whole curve instead of 16 separate runs. That is only legal
   * because Hebbian writes are order-independent — a property proved in
   * docs/derivation.md and asserted to 1e-9 in test/memory.test.js.
   */
  function recallCurve(sigma) {
    const d = state.d;
    const totals = new Float64Array(16);
    for (let s = 0; s < SEEDS; s++) {
      const rng = mulberry32(state.seed + s);
      const memory = new FastWeightMemory(d, 'hebbian');
      const k = randomUnitVector(d, rng);
      const v = randomUnitVector(d, rng);
      for (let i = 0; i < state.distractors; i++) {
        memory.write(randomUnitVector(d, rng), randomUnitVector(d, rng));
      }
      for (let m = 1; m <= 16; m++) {
        memory.write(k, sigma === 0 ? v : noisyCopy(v, sigma, rng));
        totals[m - 1] += cosine(memory.read(k), v);
      }
    }
    return Array.from(totals, (t) => t / SEEDS);
  }

  function render() {
    const xs = Array.from({ length: 16 }, (_, i) => i + 1);
    const noisyCurve = recallCurve(state.sigma);
    const cleanCurve = recallCurve(0);
    lineChart(chartBox, {
      series: [
        {
          label: 'noisy',
          colorVar: '--hebbian',
          points: xs.map((m, i) => ({ x: m, y: Math.max(0, noisyCurve[i]) })),
        },
        {
          label: 'clean',
          colorVar: '--cache',
          points: xs.map((m, i) => ({ x: m, y: Math.max(0, cleanCurve[i]) })),
        },
      ],
      xMin: 1,
      xMax: 16,
      yMin: 0,
      yMax: 1,
      xLabel: 'demonstrations written',
      xTicks: [1, 4, 8, 12, 16],
      yFormat: (v) => v.toFixed(2),
    });

    const now = noisyCurve[state.demos - 1];
    const once = noisyCurve[0];
    const tone = now > 0.85 ? 'ok' : now > 0.5 ? 'warn' : 'bad';
    readBox.innerHTML = `
      <div class="scoreline" style="padding:0">
        <div class="score">
          <span class="label">After ${state.demos}</span>
          <span class="num">${now.toFixed(3)}</span>
          <span class="tag ${tone}">recall of the rule</span>
        </div>
      </div>
      <p class="muted" style="font-size:.84rem;margin-top:8px">
        One noisy demonstration gets you ${once.toFixed(3)}. ${state.demos} of them get you
        ${now.toFixed(3)}, and the state is exactly the same size either way. The signal is
        identical each time so it adds up. The noise is different each time so it partly
        cancels. Nothing was trained and nothing was told the rule. Curves are means over
        ${SEEDS} runs, because one run of this is noisy enough to look like nothing happening.
      </p>`;

    // The vote, also averaged. For exactly orthogonal answers the readout is
    // a*vA + b*vB and cos to vA is a/sqrt(a^2+b^2); two random unit vectors are only
    // approximately orthogonal, so one draw sits a few points off the closed form and
    // the mean converges onto it. Watching that convergence is the point.
    const a = state.split;
    const b = 8 - a;
    let sumA = 0;
    let sumB = 0;
    for (let s = 0; s < SEEDS * 2; s++) {
      const rng = mulberry32(5200 + s);
      const memory = new FastWeightMemory(state.d, 'hebbian');
      const k = randomUnitVector(state.d, rng);
      const vA = randomUnitVector(state.d, rng);
      const vB = randomUnitVector(state.d, rng);
      for (let i = 0; i < a; i++) memory.write(k, vA);
      for (let i = 0; i < b; i++) memory.write(k, vB);
      const out = memory.read(k);
      sumA += cosine(out, vA);
      sumB += cosine(out, vB);
    }
    const recallA = sumA / (SEEDS * 2);
    const recallB = sumB / (SEEDS * 2);
    const denom = Math.sqrt(a * a + b * b) || 1;

    voteBox.innerHTML = `
      <div class="board">
        <table>
          <caption class="visually-hidden">Recall of two conflicting answers against the closed-form prediction</caption>
          <thead><tr><th scope="col">answer</th><th scope="col">votes</th><th scope="col">recall</th><th scope="col">closed form</th></tr></thead>
          <tbody>
            <tr><td style="color:var(--delta);font-weight:600">A</td><td class="mono">${a}</td>
                <td class="mono">${recallA.toFixed(3)}</td><td class="mono">${(a / denom).toFixed(3)}</td></tr>
            <tr><td style="color:var(--decay);font-weight:600">B</td><td class="mono">${b}</td>
                <td class="mono">${recallB.toFixed(3)}</td><td class="mono">${(b / denom).toFixed(3)}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="muted" style="font-size:.82rem;margin-top:8px">
        Same key, two different answers. The state neither picks one nor breaks: it returns
        the vote-weighted blend, and measured recall lands on <span class="mono">a/√(a²+b²)</span>,
        which is the closed form for the angle between a sum and one of its terms.
      </p>`;
  }

  root.querySelector('#dl-m').addEventListener('input', (event) => {
    state.demos = Number(event.target.value);
    root.querySelector('#dl-m-val').textContent = state.demos;
    render();
  });
  root.querySelector('#dl-s').addEventListener('input', (event) => {
    state.sigma = Number(event.target.value);
    root.querySelector('#dl-s-val').textContent = state.sigma.toFixed(2);
    render();
  });
  root.querySelector('#dl-split').addEventListener('input', (event) => {
    state.split = Number(event.target.value);
    root.querySelector('#dl-split-val').textContent = `${state.split} : ${8 - state.split}`;
    render();
  });

  render();
  return { render, state };
}
