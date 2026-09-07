/**
 * Hand-rolled SVG charts. No chart library: the series here are three lines and a
 * grid of squares, and a charting dependency would outweigh the whole page.
 *
 * Everything reads its colours from CSS custom properties so the charts follow
 * the light/dark theme without a second palette being hard-coded in JS.
 */

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  return node;
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function text(content, attrs) {
  const node = svgEl('text', attrs);
  node.textContent = content;
  return node;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* ------------------------------------------------------------------ *
 * Line chart with a crosshair tooltip
 * ------------------------------------------------------------------ */

export function lineChart(container, options) {
  const {
    series = [],
    xMin = 0,
    xMax = 1,
    yMin = 0,
    yMax = 1,
    xLabel = '',
    yTicks = null,
    xTicks = null,
    yFormat = (v) => v.toFixed(2),
    xFormat = (v) => String(Math.round(v)),
    tooltipFormat = null,
  } = options;

  container.replaceChildren();
  container.classList.add('chart');

  const W = 480;
  const H = 210;
  const M = { top: 12, right: 68, bottom: 30, left: 44 };

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const sx = (x) => M.left + ((x - xMin) / Math.max(xMax - xMin, 1e-9)) * (W - M.left - M.right);
  const sy = (y) => H - M.bottom - ((y - yMin) / Math.max(yMax - yMin, 1e-9)) * (H - M.top - M.bottom);

  const ticksY = yTicks ?? Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  for (const t of ticksY) {
    svg.appendChild(
      svgEl('line', {
        x1: M.left,
        x2: W - M.right,
        y1: sy(t),
        y2: sy(t),
        stroke: cssVar('--border'),
        'stroke-width': 1,
      }),
    );
    svg.appendChild(
      text(yFormat(t), { x: M.left - 7, y: sy(t) + 3.5, 'font-size': 9, 'text-anchor': 'end' }),
    );
  }

  const ticksX = xTicks ?? Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);
  for (const t of ticksX) {
    svg.appendChild(
      text(xFormat(t), { x: sx(t), y: H - M.bottom + 15, 'font-size': 9, 'text-anchor': 'middle' }),
    );
  }
  if (xLabel) {
    svg.appendChild(
      text(xLabel, {
        x: (M.left + W - M.right) / 2,
        y: H - 3,
        'font-size': 9,
        'text-anchor': 'middle',
        fill: cssVar('--ink-faint'),
      }),
    );
  }

  const drawn = [];
  const endLabels = [];
  for (const s of series) {
    if (!s.points?.length) continue;
    const colour = cssVar(s.colorVar);
    const path = s.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
      .join(' ');
    svg.appendChild(
      svgEl('path', {
        d: path,
        fill: 'none',
        stroke: colour,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-dasharray': s.dashed ? '4 3' : null,
        opacity: s.dashed ? 0.85 : 1,
      }),
    );

    const last = s.points.at(-1);
    svg.appendChild(svgEl('circle', { cx: sx(last.x), cy: sy(last.y), r: 2.8, fill: colour }));
    endLabels.push({
      label: s.label,
      colour,
      x: sx(last.x) + 7,
      y: clamp(sy(last.y) + 3.2, M.top + 6, H - M.bottom),
    });
    drawn.push(s);
  }

  // Direct labels at the line ends, because identity should never rest on hue
  // alone. Converging lines put these on top of each other, so nudge them apart
  // from the bottom up before drawing.
  endLabels.sort((a, b) => a.y - b.y);
  const MIN_GAP = 10;
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < MIN_GAP) {
      endLabels[i].y = endLabels[i - 1].y + MIN_GAP;
    }
  }
  const overflow = endLabels.at(-1) ? endLabels.at(-1).y - (H - M.bottom) : 0;
  if (overflow > 0) for (const item of endLabels) item.y -= overflow;

  for (const item of endLabels) {
    svg.appendChild(
      text(item.label, {
        x: item.x,
        y: item.y,
        'font-size': 9,
        'font-weight': 600,
        fill: item.colour,
      }),
    );
  }

  const crosshair = svgEl('line', {
    y1: M.top,
    y2: H - M.bottom,
    stroke: cssVar('--ink-faint'),
    'stroke-width': 1,
    opacity: 0,
  });
  svg.appendChild(crosshair);

  const hit = svgEl('rect', {
    x: M.left,
    y: M.top,
    width: W - M.left - M.right,
    height: H - M.top - M.bottom,
    fill: 'transparent',
  });
  svg.appendChild(hit);
  container.appendChild(svg);

  const tip = document.createElement('div');
  tip.className = 'tooltip';
  container.appendChild(tip);

  const nearest = (points, x) => {
    let best = points[0];
    let bestGap = Infinity;
    for (const p of points) {
      const gap = Math.abs(p.x - x);
      if (gap < bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    return best;
  };

  hit.addEventListener('mousemove', (event) => {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) * W) / box.width;
    const xValue = clamp(
      xMin + ((px - M.left) / (W - M.left - M.right)) * (xMax - xMin),
      xMin,
      xMax,
    );
    const anchor = drawn.length ? nearest(drawn[0].points, xValue) : { x: xValue };
    const cx = sx(anchor.x);
    crosshair.setAttribute('x1', cx);
    crosshair.setAttribute('x2', cx);
    crosshair.setAttribute('opacity', '1');

    const lines = [tooltipFormat ? tooltipFormat(anchor.x) : `${xLabel || 'x'} = ${xFormat(anchor.x)}`];
    for (const s of drawn) {
      const p = nearest(s.points, anchor.x);
      lines.push(`${s.label}: ${yFormat(p.y)}`);
    }
    tip.innerHTML = lines.join('<br>');
    tip.style.left = `${(cx / W) * 100}%`;
    tip.style.top = `${(M.top / H) * 100}%`;
    tip.style.opacity = '1';
  });

  hit.addEventListener('mouseleave', () => {
    crosshair.setAttribute('opacity', '0');
    tip.style.opacity = '0';
  });

  return svg;
}

/* ------------------------------------------------------------------ *
 * Grouped bars, used for recall-by-age
 * ------------------------------------------------------------------ */

export function groupedBars(container, options) {
  const { groups = [], series = [], yMax = 1, yFormat = (v) => v.toFixed(1), xLabel = '' } = options;

  container.replaceChildren();
  container.classList.add('chart');

  const W = 480;
  const H = 210;
  const M = { top: 12, right: 14, bottom: 34, left: 44 };
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });

  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const sy = (v) => M.top + plotH - (clamp(v, 0, yMax) / yMax) * plotH;

  for (let i = 0; i <= 4; i++) {
    const value = (yMax * i) / 4;
    svg.appendChild(
      svgEl('line', {
        x1: M.left,
        x2: W - M.right,
        y1: sy(value),
        y2: sy(value),
        stroke: cssVar('--border'),
        'stroke-width': 1,
      }),
    );
    svg.appendChild(
      text(yFormat(value), {
        x: M.left - 7,
        y: sy(value) + 3.5,
        'font-size': 9,
        'text-anchor': 'end',
      }),
    );
  }

  const groupW = plotW / groups.length;
  const barW = Math.max(2, (groupW * 0.74) / series.length);

  groups.forEach((group, gi) => {
    const groupX = M.left + gi * groupW;
    series.forEach((s, si) => {
      const value = s.values[gi] ?? 0;
      const x = groupX + groupW * 0.13 + si * barW;
      const y = sy(Math.max(value, 0));
      const height = Math.max(1, M.top + plotH - y);
      const rect = svgEl('rect', {
        x: x + 1,
        y,
        width: Math.max(1, barW - 2), // 2px gap keeps adjacent bars from fusing
        height,
        fill: cssVar(s.colorVar),
        rx: 2,
      });
      const title = svgEl('title');
      title.textContent = `${s.label}, ${group}: ${yFormat(value)}`;
      rect.appendChild(title);
      svg.appendChild(rect);
    });

    svg.appendChild(
      text(group, {
        x: groupX + groupW / 2,
        y: H - M.bottom + 14,
        'font-size': 8.5,
        'text-anchor': 'middle',
      }),
    );
  });

  if (xLabel) {
    svg.appendChild(
      text(xLabel, {
        x: M.left + plotW / 2,
        y: H - 4,
        'font-size': 9,
        'text-anchor': 'middle',
        fill: cssVar('--ink-faint'),
      }),
    );
  }

  container.appendChild(svg);
  return svg;
}

/* ------------------------------------------------------------------ *
 * The state matrix itself
 * ------------------------------------------------------------------ */

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const mix = (shift) => {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    return Math.round(ca + (cb - ca) * t);
  };
  return `rgb(${mix(16)},${mix(8)},${mix(0)})`;
}

export function heatmap(container, S, d, options = {}) {
  const { size = 240 } = options;
  container.replaceChildren();

  const svg = svgEl('svg', {
    viewBox: `0 0 ${size} ${size}`,
    role: 'img',
    'aria-label': `${d} by ${d} state matrix`,
  });

  let peak = 1e-9;
  for (let i = 0; i < S.length; i++) peak = Math.max(peak, Math.abs(S[i]));

  const neg = cssVar('--div-neg');
  const mid = cssVar('--div-mid');
  const pos = cssVar('--div-pos');
  const cell = size / d;

  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      const t = S[i * d + j] / peak;
      svg.appendChild(
        svgEl('rect', {
          x: j * cell,
          y: i * cell,
          width: Math.max(cell - 0.5, 0.5),
          height: Math.max(cell - 0.5, 0.5),
          fill: t >= 0 ? mixHex(mid, pos, t) : mixHex(mid, neg, -t),
          rx: cell > 6 ? 1 : 0,
        }),
      );
    }
  }

  container.appendChild(svg);
  return svg;
}

/* ------------------------------------------------------------------ *
 * Truth beside estimate
 * ------------------------------------------------------------------ */

export function vectorRows(container, rows) {
  container.replaceChildren();
  const d = rows[0]?.values.length ?? 0;
  if (!d) return null;

  const W = 320;
  const rowH = 34;
  const gap = 16;
  const H = rows.length * (rowH + gap);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });

  let peak = 1e-9;
  for (const row of rows) for (const v of row.values) peak = Math.max(peak, Math.abs(v));

  const barW = W / d;

  rows.forEach((row, index) => {
    const top = index * (rowH + gap);
    const mid = top + gap + rowH / 2;

    svg.appendChild(
      text(row.label, {
        x: 0,
        y: top + 10,
        'font-size': 8.5,
        'font-weight': 700,
        fill: cssVar('--ink-muted'),
      }),
    );
    svg.appendChild(
      svgEl('line', {
        x1: 0,
        x2: W,
        y1: mid,
        y2: mid,
        stroke: cssVar('--border'),
        'stroke-width': 1,
      }),
    );

    const colour = cssVar(row.colorVar);
    row.values.forEach((value, i) => {
      const h = (Math.abs(value) / peak) * (rowH / 2 - 2);
      svg.appendChild(
        svgEl('rect', {
          x: i * barW + 0.5,
          y: value >= 0 ? mid - h : mid,
          width: Math.max(barW - 1, 0.6),
          height: Math.max(h, 0.7),
          fill: colour,
          rx: 1,
        }),
      );
    });
  });

  container.appendChild(svg);
  return svg;
}
