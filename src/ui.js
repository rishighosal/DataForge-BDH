/**
 * The interactive pieces. Each one owns a bit of DOM, recomputes from scratch on
 * every change, and holds no state beyond the control values — at these sizes a
 * full recompute is well under a frame, so there is nothing to cache and nothing
 * to invalidate.
 */

import {
  FastWeightMemory,
  KVCache,
  RULES,
  runTrial,
  readState,
  cosine,
  theoreticalCosine,
} from './memory.js';
import { buildRoster, storeRoster, evaluateRoster, ROSTER } from './roster.js';
import { lineChart, groupedBars, heatmap, vectorRows } from './charts.js';

const RULE_COLOR = {
  hebbian: '--hebbian',
  delta: '--delta',
  decay: '--decay',
};

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
};

const bytes = (n) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

function ruleParams(id, state) {
  if (id === 'delta') return { beta: state.beta };
  if (id === 'decay') return { lambda: state.lambda };
  return {};
}

/* ================================================================== *
 * Roster board — the concrete task
 * ================================================================== */

export function createRosterBoard(root, config = {}) {
  const state = {
    d: config.d ?? 16,
    count: config.count ?? ROSTER.length,
    seed: config.seed ?? 11,
    keyMode: config.keyMode ?? 'dense',
    beta: 1,
    lambda: 0.9,
    rules: config.rules ?? ['hebbian'],
  };
  const showControls = config.controls !== false;
  const roomOwner = new Map(ROSTER.map((entry) => [entry.room, entry.name]));

  root.replaceChildren();
  const controls = el('div', 'controls');
  const board = el('div', 'board');
  const scoreline = el('div', 'scoreline');

  if (showControls) root.appendChild(controls);
  root.appendChild(board);
  root.appendChild(scoreline);

  if (showControls) {
    controls.innerHTML = `
      <div class="control">
        <label for="rb-d">Matrix size <span class="lit">d</span> <span class="value" id="rb-d-val">${state.d}</span></label>
        <input id="rb-d" type="range" min="8" max="64" step="1" value="${state.d}">
      </div>
      <div class="control">
        <label for="rb-count">Names taught <span class="value" id="rb-count-val">${state.count}</span></label>
        <input id="rb-count" type="range" min="1" max="${ROSTER.length}" step="1" value="${state.count}">
      </div>
      <div class="control">
        <label for="rb-keys">Key geometry</label>
        <select id="rb-keys">
          <option value="dense">Dense (Gaussian)</option>
          <option value="sparse">Sparse non-negative (BDH-shaped)</option>
        </select>
      </div>
      <div class="control">
        <label for="rb-seed">Draw</label>
        <div class="btn-row">
          <button class="btn" id="rb-seed" type="button">New random draw</button>
        </div>
      </div>
    `;
  }

  function render() {
    const roster = buildRoster({ d: state.d, seed: state.seed, keyMode: state.keyMode });
    const results = state.rules.map((id) => {
      const memory = new FastWeightMemory(state.d, id, ruleParams(id, state));
      storeRoster(memory, roster, state.count);
      return { id, rule: RULES[id], memory, ...evaluateRoster(memory, roster, state.count) };
    });

    const cache = new KVCache(state.d);
    for (let i = 0; i < state.count; i++) {
      cache.write(roster.entries[i].key, roster.vocabulary[roster.entries[i].roomIndex].vector);
    }

    const table = el('table');
    const head = el('thead');
    head.innerHTML = `
      <tr>
        <th>Student</th>
        <th>Actual room</th>
        ${results
          .map(
            (r) =>
              `<th style="color:var(${RULE_COLOR[r.id]})">${r.rule.label} says</th>`,
          )
          .join('')}
      </tr>`;
    table.appendChild(head);

    const body = el('tbody');
    for (let i = 0; i < results[0].rows.length; i++) {
      const first = results[0].rows[i];
      const tr = el('tr');
      if (results.some((r) => !r.rows[i].correct)) tr.classList.add('is-wrong');

      tr.appendChild(el('td', 'name', first.name));
      tr.appendChild(el('td', 'room', first.expected));

      for (const result of results) {
        const row = result.rows[i];
        const owner = roomOwner.get(row.predicted);
        const aside =
          row.correct || !owner || owner === row.name
            ? ''
            : ` <span style="color:var(--ink-faint)">(${owner}'s)</span>`;
        const td = el('td');
        td.innerHTML = `
          <span class="answer ${row.correct ? 'right' : 'wrong'}">
            <span class="mark">${row.correct ? '✓' : '✗'}</span>
            <span class="said">${row.predicted}${aside}</span>
          </span>`;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
    board.replaceChildren(table);

    scoreline.replaceChildren();
    for (const result of results) {
      const tone = result.accuracy > 0.95 ? 'ok' : result.accuracy > 0.7 ? 'warn' : 'bad';
      const score = el('div', 'score');
      score.innerHTML = `
        <span class="label" style="color:var(${RULE_COLOR[result.id]})">${result.rule.label}</span>
        <span class="num">${result.correct}/${result.total}</span>
        <span class="tag ${tone}">${Math.round(result.accuracy * 100)}% recalled</span>`;
      scoreline.appendChild(score);
    }

    const footprint = el('div', 'score');
    footprint.innerHTML = `
      <span class="label">Footprint</span>
      <span class="mono tnum" style="font-size:.82rem">
        state ${bytes(results[0].memory.bytes())}
        <span style="color:var(--ink-faint)">vs</span>
        cache ${bytes(cache.bytes())}
      </span>`;
    scoreline.appendChild(footprint);
  }

  if (showControls) {
    const dInput = controls.querySelector('#rb-d');
    const countInput = controls.querySelector('#rb-count');
    dInput.addEventListener('input', () => {
      state.d = Number(dInput.value);
      controls.querySelector('#rb-d-val').textContent = state.d;
      render();
    });
    countInput.addEventListener('input', () => {
      state.count = Number(countInput.value);
      controls.querySelector('#rb-count-val').textContent = state.count;
      render();
    });
    controls.querySelector('#rb-keys').addEventListener('change', (event) => {
      state.keyMode = event.target.value;
      render();
    });
    controls.querySelector('#rb-seed').addEventListener('click', () => {
      state.seed = Math.floor(Math.random() * 100000);
      render();
    });
  }

  render();
  return { render, state };
}

/* ================================================================== *
 * Matrix inspector — what the state looks like and what comes back out
 * ================================================================== */

export function createMatrixInspector(root, config = {}) {
  const state = {
    d: config.d ?? 16,
    n: config.n ?? 12,
    seed: config.seed ?? 4,
    query: 0,
  };

  root.replaceChildren();
  root.innerHTML = `
    <div class="controls" style="margin-bottom:18px">
      <div class="control">
        <label for="mi-n">Associations written <span class="value" id="mi-n-val">${state.n}</span></label>
        <input id="mi-n" type="range" min="1" max="60" step="1" value="${state.n}">
      </div>
      <div class="control">
        <label for="mi-q">Ask about association</label>
        <select id="mi-q"></select>
      </div>
    </div>
    <div class="split" style="gap:24px">
      <div>
        <div class="chart-title">State matrix S — ${state.d}×${state.d}, fixed</div>
        <div id="mi-heat" style="max-width:240px"></div>
        <p class="muted" style="font-size:.78rem;margin-top:10px">
          Every association ever written is superimposed in these
          ${state.d * state.d} numbers. Nothing is added when you write more.
        </p>
      </div>
      <div>
        <div class="chart-title">Truth beside estimate</div>
        <div id="mi-vec"></div>
        <div id="mi-read" style="margin-top:12px"></div>
      </div>
    </div>`;

  const heatBox = root.querySelector('#mi-heat');
  const vecBox = root.querySelector('#mi-vec');
  const readBox = root.querySelector('#mi-read');
  const nInput = root.querySelector('#mi-n');
  const qSelect = root.querySelector('#mi-q');

  function render() {
    const trial = runTrial({
      d: state.d,
      n: state.n,
      seed: state.seed,
      rule: 'hebbian',
      evalEvery: state.n,
    });

    if (qSelect.options.length !== state.n) {
      qSelect.replaceChildren();
      for (let i = 0; i < state.n; i++) {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = `#${i + 1}${i === state.n - 1 ? ' (most recent)' : ''}`;
        qSelect.appendChild(option);
      }
    }
    state.query = Math.min(state.query, state.n - 1);
    qSelect.value = String(state.query);

    heatmap(heatBox, trial.memory.S, state.d);

    const truth = trial.values[state.query];
    const readout = readState(trial.memory.S, state.d, trial.keys[state.query]);
    vectorRows(vecBox, [
      { label: 'WHAT WE STORED', colorVar: '--ink-faint', values: truth },
      { label: 'WHAT THE CACHE RETURNS', colorVar: '--cache', values: truth },
      { label: 'WHAT THE MATRIX RETURNS', colorVar: '--hebbian', values: readout },
    ]);

    const score = cosine(readout, truth);
    const tone = score > 0.85 ? 'ok' : score > 0.5 ? 'warn' : 'bad';
    readBox.innerHTML = `
      <div class="scoreline" style="padding:0">
        <div class="score">
          <span class="label" style="color:var(--cache)">Cache</span>
          <span class="tag ok">exact</span>
        </div>
        <div class="score">
          <span class="label" style="color:var(--hebbian)">Matrix</span>
          <span class="num">${score.toFixed(3)}</span>
          <span class="tag ${tone}">cosine vs. truth</span>
        </div>
      </div>
      <p class="muted" style="font-size:.78rem;margin-top:8px">
        Expected for ${state.n} associations in ${state.d} dimensions:
        <span class="mono">${theoreticalCosine(state.n, state.d).toFixed(3)}</span>.
        One draw bounces around that; the average over all
        ${state.n} sits close to it.
      </p>`;
  }

  nInput.addEventListener('input', () => {
    state.n = Number(nInput.value);
    root.querySelector('#mi-n-val').textContent = state.n;
    render();
  });
  qSelect.addEventListener('change', () => {
    state.query = Number(qSelect.value);
    render();
  });

  render();
  return { render, state };
}

/* ================================================================== *
 * Capacity lab — recall and footprint against load
 * ================================================================== */

export function createCapacityLab(root, config = {}) {
  const state = {
    d: config.d ?? 32,
    nMax: config.nMax ?? 160,
    keyMode: 'dense',
    rules: ['hebbian', 'delta', 'decay'],
  };

  root.replaceChildren();
  root.innerHTML = `
    <div class="controls" style="margin-bottom:20px">
      <div class="control">
        <label for="cl-d">Matrix size <span class="lit">d</span> <span class="value" id="cl-d-val">${state.d}</span></label>
        <input id="cl-d" type="range" min="8" max="64" step="4" value="${state.d}">
      </div>
      <div class="control">
        <label for="cl-n">Load ceiling <span class="value" id="cl-n-val">${state.nMax}</span></label>
        <input id="cl-n" type="range" min="32" max="320" step="8" value="${state.nMax}">
      </div>
      <div class="control">
        <label for="cl-keys">Key geometry</label>
        <select id="cl-keys">
          <option value="dense">Dense (Gaussian)</option>
          <option value="sparse">Sparse non-negative (BDH-shaped)</option>
        </select>
      </div>
    </div>
    <div class="split">
      <div>
        <div class="chart-title">Mean recall across everything stored</div>
        <div id="cl-recall"></div>
        <div class="legend" style="margin-top:10px">
          <span class="legend-item"><span class="swatch" style="background:var(--hebbian)"></span>Hebbian (BDH)</span>
          <span class="legend-item"><span class="swatch" style="background:var(--delta)"></span>Delta rule</span>
          <span class="legend-item"><span class="swatch" style="background:var(--decay)"></span>Decay λ=0.9</span>
          <span class="legend-item" style="color:var(--ink-faint)"><span class="swatch dashed"></span>Theory √(d/(d+n−1))</span>
        </div>
      </div>
      <div>
        <div class="chart-title">Bytes held</div>
        <div id="cl-bytes"></div>
        <div class="legend" style="margin-top:10px">
          <span class="legend-item"><span class="swatch" style="background:var(--cache)"></span>KV cache</span>
          <span class="legend-item"><span class="swatch" style="background:var(--hebbian)"></span>Fixed state</span>
        </div>
      </div>
    </div>
    <p class="muted" style="font-size:.8rem;margin-top:14px" id="cl-note"></p>`;

  const recallBox = root.querySelector('#cl-recall');
  const bytesBox = root.querySelector('#cl-bytes');
  const note = root.querySelector('#cl-note');

  function render() {
    const evalEvery = Math.max(1, Math.round(state.nMax / 40));
    const runs = state.rules.map((id) => ({
      id,
      trial: runTrial({
        d: state.d,
        n: state.nMax,
        seed: 21,
        rule: id,
        params: ruleParams(id, { beta: 1, lambda: 0.9 }),
        keyMode: state.keyMode,
        evalEvery,
      }),
    }));

    const series = runs.map(({ id, trial }) => ({
      label: RULES[id].label,
      colorVar: RULE_COLOR[id],
      points: trial.series.map((s) => ({ x: s.n, y: Math.max(0, s.cosineAll) })),
    }));
    series.push({
      label: 'theory',
      colorVar: '--ink-faint',
      dashed: true,
      points: runs[0].trial.series.map((s) => ({ x: s.n, y: s.theory })),
    });

    lineChart(recallBox, {
      series,
      xMin: 1,
      xMax: state.nMax,
      yMin: 0,
      yMax: 1,
      xLabel: 'associations stored',
      yFormat: (v) => v.toFixed(2),
    });

    const base = runs[0].trial;
    lineChart(bytesBox, {
      series: [
        {
          label: 'cache',
          colorVar: '--cache',
          points: base.series.map((s) => ({ x: s.n, y: s.cacheBytes / 1024 })),
        },
        {
          label: 'state',
          colorVar: '--hebbian',
          points: base.series.map((s) => ({ x: s.n, y: s.stateBytes / 1024 })),
        },
      ],
      xMin: 1,
      xMax: state.nMax,
      yMin: 0,
      yMax: Math.max(base.series.at(-1).cacheBytes, base.series[0].stateBytes) / 1024,
      xLabel: 'associations stored',
      yFormat: (v) => `${Math.round(v)} KB`,
    });

    const crossing = base.series.find((s) => s.cacheBytes > s.stateBytes);
    note.innerHTML = crossing
      ? `At d=${state.d} the cache overtakes the fixed state after
         <strong>${crossing.n}</strong> associations and keeps going; the state is
         still ${bytes(base.series[0].stateBytes)} at
         n=${state.nMax}. Both curves are computed here, now, in this tab.`
      : `At d=${state.d} the fixed state is still larger than the cache across this
         whole range — a fixed-size memory is only a saving once you store enough
         to pay for it.`;
  }

  root.querySelector('#cl-d').addEventListener('input', (event) => {
    state.d = Number(event.target.value);
    root.querySelector('#cl-d-val').textContent = state.d;
    render();
  });
  root.querySelector('#cl-n').addEventListener('input', (event) => {
    state.nMax = Number(event.target.value);
    root.querySelector('#cl-n-val').textContent = state.nMax;
    render();
  });
  root.querySelector('#cl-keys').addEventListener('change', (event) => {
    state.keyMode = event.target.value;
    render();
  });

  render();
  return { render, state };
}

/* ================================================================== *
 * Recall by age — the result that reframed the project
 * ================================================================== */

export function createAgeProfile(root, config = {}) {
  const state = {
    d: config.d ?? 32,
    n: config.n ?? 128,
    lambda: config.lambda ?? 0.9,
    buckets: 8,
  };

  root.replaceChildren();
  root.innerHTML = `
    <div class="controls" style="margin-bottom:18px">
      <div class="control">
        <label for="ap-n">Associations written <span class="value" id="ap-n-val">${state.n}</span></label>
        <input id="ap-n" type="range" min="32" max="256" step="8" value="${state.n}">
      </div>
      <div class="control">
        <label for="ap-l">Decay <span class="lit">λ</span> <span class="value" id="ap-l-val">${state.lambda.toFixed(2)}</span></label>
        <input id="ap-l" type="range" min="0.70" max="1" step="0.01" value="${state.lambda}">
      </div>
    </div>
    <div id="ap-chart"></div>
    <div class="legend" style="margin-top:10px">
      <span class="legend-item"><span class="swatch" style="background:var(--hebbian)"></span>Hebbian (BDH)</span>
      <span class="legend-item"><span class="swatch" style="background:var(--delta)"></span>Delta rule</span>
      <span class="legend-item"><span class="swatch" style="background:var(--decay)"></span>Decay gate</span>
    </div>
    <p class="muted" style="font-size:.8rem;margin-top:12px" id="ap-note"></p>`;

  const chartBox = root.querySelector('#ap-chart');
  const note = root.querySelector('#ap-note');

  function render() {
    const perBucket = Math.max(1, Math.floor(state.n / state.buckets));
    const rules = [
      ['hebbian', {}],
      ['delta', { beta: 1 }],
      ['decay', { lambda: state.lambda }],
    ];

    const series = rules.map(([id, params]) => {
      const trial = runTrial({ d: state.d, n: state.n, seed: 33, rule: id, params, evalEvery: state.n });
      const values = [];
      for (let b = 0; b < state.buckets; b++) {
        let sum = 0;
        let count = 0;
        for (let i = b * perBucket; i < Math.min((b + 1) * perBucket, state.n); i++) {
          sum += cosine(trial.memory.read(trial.keys[i]), trial.values[i]);
          count++;
        }
        values.push(count ? sum / count : 0);
      }
      return { label: RULES[id].label, colorVar: RULE_COLOR[id], values };
    });

    const groups = Array.from({ length: state.buckets }, (_, b) =>
      b === 0 ? 'oldest' : b === state.buckets - 1 ? 'newest' : `${b * perBucket + 1}`,
    );

    groupedBars(chartBox, {
      groups,
      series,
      yMax: 1,
      xLabel: 'when the association was written',
      yFormat: (v) => v.toFixed(2),
    });

    const flat = series[0].values;
    const spread = Math.max(...flat) - Math.min(...flat);
    const deltaTilt = series[1].values.at(-1) - series[1].values[0];
    note.innerHTML = `
      Hebbian varies by just <strong>${spread.toFixed(2)}</strong> from oldest to newest —
      it is order-independent, so age genuinely does not matter to it. The delta rule
      swings <strong>${deltaTilt.toFixed(2)}</strong> across the same span. Same
      ${state.d}×${state.d} state, same data, different policy about who gets the fidelity.`;
  }

  root.querySelector('#ap-n').addEventListener('input', (event) => {
    state.n = Number(event.target.value);
    root.querySelector('#ap-n-val').textContent = state.n;
    render();
  });
  root.querySelector('#ap-l').addEventListener('input', (event) => {
    state.lambda = Number(event.target.value);
    root.querySelector('#ap-l-val').textContent = state.lambda.toFixed(2);
    render();
  });

  render();
  return { render, state };
}

/* ================================================================== *
 * Quiz
 * ================================================================== */

export function createQuiz(root, items) {
  root.replaceChildren();
  items.forEach((item, index) => {
    const wrap = el('div', 'quiz-item');
    wrap.innerHTML = `<div style="font-weight:600">${index + 1}. ${item.question}</div>`;
    const options = el('div', 'quiz-options');
    const feedback = el('div', 'quiz-feedback');
    feedback.hidden = true;

    item.options.forEach((label, optionIndex) => {
      const button = el('button', 'quiz-option');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        for (const child of options.children) child.disabled = true;
        button.classList.add(optionIndex === item.answer ? 'correct' : 'incorrect');
        if (optionIndex !== item.answer) options.children[item.answer].classList.add('correct');
        feedback.hidden = false;
        feedback.innerHTML = `${optionIndex === item.answer ? '' : '<strong>Not quite.</strong> '}${item.explain}`;
      });
      options.appendChild(button);
    });

    wrap.appendChild(options);
    wrap.appendChild(feedback);
    root.appendChild(wrap);
  });
}
/**
 * The write-it-back box.
 *
 * Recognising the right option in a multiple-choice list is a much weaker test
 * than producing the explanation yourself, and the track asks that a learner be
 * able to explain the concept back in their own words. So: an empty box, no
 * marking, and a reference answer you only see after you have committed to your
 * own. The checklist is there because self-marking against a paragraph is vague
 * and self-marking against four specific points is not.
 *
 * Nothing is sent anywhere. The draft is kept in localStorage so a reload does
 * not lose it, and every access is guarded because the page is also meant to
 * open from a file:// URL where storage can throw.
 */
const DRAFT_KEY = 'ffm-explain-draft';

const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
};

const writeDraft = (value) => {
  try {
    localStorage.setItem(DRAFT_KEY, value);
  } catch {
    /* private window, blocked storage, thumbnailer — the box still works */
  }
};

const RUBRIC = [
  'Said the state is a fixed size and does not grow when you store more.',
  'Named the mechanism: writes are summed into shared dimensions, so every read picks up crosstalk from the others.',
  'Said the failure is a confident wrong answer — another key\u2019s value — rather than noise or a blank.',
  'Said a different write rule reallocates fidelity (recent vs. even) instead of creating more of it.',
];

const MODEL_ANSWER =
  'A fast-weight memory keeps one matrix of a fixed size. Storing a fact adds the ' +
  'outer product of its key and value into that same matrix, so nothing is ever ' +
  'allocated and nothing is ever deleted. Reading with a key returns that fact plus ' +
  'a fraction of every other fact whose key is not perfectly perpendicular to it, and ' +
  'that crosstalk grows as you add more facts into the same dimensions. So the memory ' +
  'does not run out and it does not error \u2014 it blends, and hands you another stored ' +
  'value with full confidence. Rules like the delta update or a decay gate change who ' +
  'keeps the fidelity, favouring recent writes, but the total amount of it is set by ' +
  'the size of the state, not by the rule.';

export function createExplainBack(root) {
  root.replaceChildren();

  const prompt = el(
    'p',
    'explain-prompt',
    'A colleague asks why a fixed-size memory gets facts wrong when a KV cache does not. ' +
      'Answer in three or four sentences, without scrolling up.',
  );

  const box = el('textarea', 'explain-box');
  box.rows = 6;
  box.placeholder = 'Your explanation…';
  box.setAttribute('aria-label', 'Your explanation of the claim');
  box.value = readDraft();

  const count = el('span', 'explain-count');
  const reveal = el('button', 'btn');
  reveal.type = 'button';
  reveal.textContent = 'Compare with ours';

  const bar = el('div', 'explain-bar');
  bar.append(count, reveal);

  const answer = el('div', 'explain-answer');
  answer.hidden = true;
  answer.innerHTML =
    '<p class="explain-answer-label">One way to put it</p>' +
    `<p class="explain-answer-body">${MODEL_ANSWER}</p>` +
    '<p class="explain-answer-label" style="margin-top:14px">Did yours cover these?</p>' +
    `<ul class="explain-rubric">${RUBRIC.map((r) => `<li>${r}</li>`).join('')}</ul>` +
    '<p class="explain-note">Wording does not matter. If you got the first three, you ' +
    'have the claim; the fourth is the part most people miss.</p>';

  const sync = () => {
    const words = box.value.trim().split(/\s+/).filter(Boolean).length;
    count.textContent = words === 0 ? 'no words yet' : `${words} word${words === 1 ? '' : 's'}`;
    writeDraft(box.value);
  };

  box.addEventListener('input', sync);
  reveal.addEventListener('click', () => {
    answer.hidden = false;
    reveal.disabled = true;
    reveal.textContent = 'Model answer shown';
  });

  sync();
  root.append(prompt, box, bar, answer);
}
