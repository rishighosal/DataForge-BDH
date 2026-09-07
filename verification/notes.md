# Verification notes — how the demo's default parameters were chosen

This is a working log, kept so the team can defend "why d=16, why seed=7, why these n
values" under questioning rather than saying "it just looked good."

## 1. Confirming the phenomenon is real (not a scripted animation)

`verify_memory.js` implements the outer-product memory independently from `index.html` and
was written *first*. Running it across `d ∈ {8, 16, 32}` and multiple seeds confirmed:
retrieval similarity starts near 1.0 at small `n`, and decays as `n` grows relative to `d`,
with the *cache's* similarity staying at exactly 1.0 throughout (by construction). This
confirmed the effect emerges from real random-vector geometry before any UI copy was
written around it.

## 2. The single-query metric was too noisy for a guided walkthrough — and we changed the demo, not the seed

Initial design: the "truth beside estimate" panel queried one specific item (the most
recently stored one) and displayed *that item's* cosine similarity as the headline number.
Testing this against the locked-step presets (d=16, n∈{4,16,64}) with the already-chosen
seed=7 gave: n=4 → 0.785, n=16 → 0.842, n=64 → 0.500 — **not monotonically decreasing**,
because a single query is one noisy draw from a random process (confirmed by the 30-seed
average study in `derivation.md`, where individual seeds bounce around the smooth
theoretical trend by ±0.15–0.2 at any given `n`).

We considered — and rejected — searching across many seeds for one that happened to
produce a clean-looking single-query curve. That would have been presentation-driven
cherry-picking, in direct tension with the evidence-discipline stance the rest of this
submission takes. (For the record, a 500-seed search did find seeds with dramatic-looking
single-query curves — including one where similarity went *negative* at n=64 — which is a
good demonstration of exactly why single-query numbers are the wrong metric to feature.)

**Fix:** we changed the metric, not the seed. The demo's headline number is now the
*average* cosine similarity across **every** stored item at the current `n`
(`averageSim()` in `index.html`, `averageSimAcrossAllItems()` in `verify_memory.js`) — a
full evaluation pass rather than one draw. This is both more honest and more informative
(it's the quantity the theoretical curve is actually estimating), and it is stable across
seeds:

| seed | n=4   | n=16  | n=64  |
|------|-------|-------|-------|
| 1    | 0.914 | 0.766 | 0.435 |
| 7    | 0.871 | 0.738 | 0.462 |
| 42   | 0.968 | 0.714 | 0.423 |
| 99   | 0.935 | 0.707 | 0.456 |

(theory: 0.918 / 0.718 / 0.450) — every seed tells the same story once you average over all
stored items, so seed=7 was kept (it was already wired into the page) with no cherry-picking
required. The one specific item shown in the vector-bar visualization is still a single
concrete example, but it's now clearly labeled as "this one item" beside the robust average,
not presented as the headline number.

## 3. Bit-for-bit cross-check between the browser and Node

`index.html`'s `computeRun(d, n, seed)` draws a query-index random number on *every* step
(used to build the per-step chart series), even in code paths that don't end up using it.
The first version of `averageSimAcrossAllItems()` in this script omitted that draw, which
silently desynchronized the two RNG streams after step 1 and produced different numbers for
the "same" seed (0.947 vs. the browser's 0.871 at n=4, seed=7). Fixed by making the Node
function consume `rng()` in the exact same sequence as the browser, including the otherwise
unused draw. Re-running confirmed exact agreement:

```
$ node verify_memory.js | tail -4
n= 4  avgSimAllItems=0.871  theory=0.918  tier=reliable
n=16  avgSimAllItems=0.738  theory=0.718  tier=degraded
n=64  avgSimAllItems=0.462  theory=0.450  tier=~noise
```

These three numbers are exactly what a learner sees in the "Fast-weight" readout at Steps
1/2/3 of the guided walkthrough in `index.html` — the badge tiers (`reliable` / `degraded` /
`~noise`) use the same >0.85 / >0.5 thresholds in both places.

## 4. Why d=16 for the guided walkthrough

Small enough that the 16×16 heatmap is legible as individual cells, large enough that
`n=4/16/64` gives three clearly distinct regimes (`n≪d`, `n=d`, `n≫d`) within one order of
magnitude of `n`, and large enough that the Gaussian-dot-product approximation behind the
theoretical curve (`derivation.md`) is reasonably accurate. The sandbox lets a learner push
`d` down to 4 (where the approximation visibly gets rougher — an honest limitation, not
hidden) or up to 64.
