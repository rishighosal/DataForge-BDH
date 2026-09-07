# Fast Weights, Fixed Memory

**DataForge × Pathway — "Explain the Frontier" track**
**Live artifact:** https://claude.ai/code/artifact/394c8c5a-8fe6-4a60-a136-c9ba087ad747
**Local source:** [`index.html`](./index.html) (single file, zero build step, zero dependencies beyond one Google Fonts stylesheet)

## The one falsifiable claim this explainer teaches

> A constant-size matrix updated by outer-product ("Hebbian") writes can store and
> retrieve many key→value associations with no memory growth — but retrieval quality
> degrades in proportion to how many associations share that fixed capacity, while a
> Transformer's explicit key–value cache never degrades because its memory grows with
> every token it stores.

You test this claim yourself in the artifact: store real (key, value) associations into
a growing cache and into a constant-size matrix, query both back, and watch the numbers.

## Intended learner & prerequisites

Anyone comfortable with a dot product and a matrix-vector product. No machine-learning
background, no linear-algebra course beyond "vectors have a length and an angle between
them." If you've heard the terms "attention," "KV cache," or "context window" and want to
know what a *fast weight* actually is, this is for you.

## Learning objectives

By the end, a learner should be able to:
1. State why a Transformer's memory grows with sequence length, and why BDH's does not.
2. Explain the outer-product ("Hebbian") write `S ← S + k·vᵀ` and why it is the same
   operation the literature calls a "fast weight."
3. Predict, without running the demo, what happens to retrieval accuracy when `n` (stored
   associations) grows relative to `d` (memory dimension) — and verify the prediction live.
4. Name one concrete architecture on each side of the memory-growth trade-off (a
   Transformer's KV-cache vs. BDH's synaptic state vs. a gated fast-weight variant like
   DeltaNet/Titans).
5. State the single most important caveat: BDH's own paper documents the *mechanism*, not
   the interference curve this demo produces — that curve is a toy demonstration of the
   general fast-weight mechanism class, cross-checked against classical associative-memory
   theory and the current (2025–2026) fast-weight literature.

## Architecture — what's actually live

**Everything in this artifact is computed live in the browser. Nothing is precomputed,
cached, or a scripted animation.** Every slider drag re-derives the numbers from scratch
using a seeded pseudo-random generator (a linear congruential generator identical to the
one in [`verification/verify_memory.js`](./verification/verify_memory.js)), so results are
reproducible: the same `(dimension, n, seed)` triple always produces the same matrix, the
same stored vectors, and the same retrieval numbers, in the browser or in Node.

The page has one reusable component (`createMemoryDemo` in the inline `<script>`), used
five times:

| Instance | Where | Locked? | Purpose |
|---|---|---|---|
| `hero` | Hero section | Locked (d=16, n=16, seed=1) | Open on a running preset, not a blank canvas |
| `s1` / `s2` / `s3` | Guided walkthrough | Locked (d=16, n=4/16/64, seed=7) | Isolate one variable (`n`) at a time |
| `sbx` | Sandbox | Free (d, n, query, collision, reseed) | Let the learner try to break the claim |

Each instance runs the identical math:
- **Cache memory**: pushes every `(key, value)` pair into a growing array. Retrieval is an
  exact index lookup — by construction it can never be wrong. Memory = `n × d × 8 bytes`.
- **Fast-weight memory**: one `d×d` matrix `S`, updated per pair via the outer-product
  write `S[i][j] += k[i]·v[j]`. Retrieval is a matrix-vector product `v̂ = kᵀS`. Memory =
  `d² × 4 bytes`, constant in `n`.
- **Headline metric**: the *average* cosine similarity between every stored value and its
  fast-weight retrieval (`averageSim` in the script) — a low-noise, robust number, since any
  single query is one noisy draw from a random process. The specific item shown in the
  "truth beside estimate" bar chart is one concrete illustration of that average.
- **Theoretical reference curve**: `similarity ≈ √(d / (d + n − 1))`, the classical
  first-order noise estimate for random-vector linear associative memory (derived in
  [`verification/derivation.md`](./verification/derivation.md) and empirically matched
  against 30-seed averages in [`verification/verify_memory.js`](./verification/verify_memory.js)).
  Shown as the dashed line in every similarity chart, so the learner can see that a single
  live run is noisy but tracks a real, derivable trend.
- **"Force a collision"**: appends one more association whose key is a small random
  perturbation of an existing key (cosine similarity high but not 1), demonstrating that
  interference depends on key *similarity*, not just raw count.

No chart library, no CDN dependency beyond Google Fonts (Fraunces / Source Sans 3 / IBM
Plex Mono) — every chart, heatmap, and tooltip is hand-drawn inline SVG.

## Reproducing the results

```bash
# 1. Open the artifact directly — no server, no install:
open index.html   # or just double-click it / drag into a browser

# 2. Independently verify the underlying math in Node (no browser needed):
node verification/verify_memory.js
```
`verify_memory.js` implements the identical outer-product memory and prints retrieval
similarity at several `(d, n)` checkpoints across multiple seeds, plus a 30-seed average
used to sanity-check the theoretical curve before it was wired into the page. Every number
quoted in the artifact's guided-walkthrough copy (e.g. "n=4 → reliable," "n=64 → approaching
noise") was checked against this script's output for the exact `(d=16, seed=7)` preset
before being written — see [`verification/notes.md`](./verification/notes.md) for the
checked values.

## What is live vs. precomputed vs. synthetic

- **Live**: all charts, the heatmap, every retrieval number, the theoretical curve formula.
- **Synthetic**: the "facts" being stored are random unit vectors, not real-world data —
  stated explicitly in the artifact. This is a deliberate simplification so the geometry
  (orthogonality, interference) is easy to see and to verify by hand; it is not a claim
  about any specific real dataset.
- **Precomputed**: nothing. (The only thing resembling precomputation is the *choice* of
  seeds 1, 7, and 42 for the locked walkthrough/hero instances, picked because they run the
  same live code — not because their output was cached.)
- **Animated-for-illustration**: nothing; there are no illustrative animations standing in
  for real computation anywhere on the page.

## Primary sources (see also the artifact's own "Sources" footer, cited inline throughout)

1. Pathway. *The Dragon Hatchling: The Missing Link between the Transformer and Models of
   the Brain.* [arXiv:2509.26507](https://arxiv.org/abs/2509.26507) (Sept 2025). Source for
   the exact Hebbian/outer-product update equation `σ(i,j) += Y(i)X(j)` (§1.2), the "fast
   weights" framing, and the ~5% neuron-activation sparsity (§6.4).
2. Pathway Research. *BDH-CQ: In-Context Learning with Recurrent Latent Reasoning.*
   [arXiv:2608.09888](https://arxiv.org/abs/2608.09888) (Aug 2026). Source for the additive
   contextual-memory accumulation and the 29.5% pass@2 / $0.0007-per-task ARC-AGI-1 result.
3. Behrouz, Zhong, et al. (Google Research). *Titans: Learning to Memorize at Test Time.*
   [arXiv:2501.00663](https://arxiv.org/abs/2501.00663) (Jan 2025). Fast-weight associative
   memory updated at test time with explicit forgetting via weight decay — the gated
   counterpoint to BDH's pure accumulation.
4. *Gated DeltaNet-2: Decoupling Erase and Write in Linear Attention.*
   [arXiv:2605.22791](https://arxiv.org/abs/2605.22791) (2026). Current research on
   correcting exactly the interference this demo reproduces via an error-corrective
   delta-rule update.
5. *Variational Linear Attention: Stable Associative Memory for Long-Context Transformers.*
   [arXiv:2605.11196](https://arxiv.org/abs/2605.11196) (2026). Another 2026 paper attacking
   the same associative-memory stability problem.

All five were fetched and read directly (not recalled from model memory) before writing any
claim that cites them; see `verification/notes.md` for what was confirmed from each source.

## AI assistance & technical ownership disclosure

Claude Code (Sonnet 5) assisted with: drafting the interactive artifact's HTML/CSS/JS,
writing the standalone Node verification script, locating and fetching the primary sources
above, and drafting this README and the one-page summary. The team:
- Reviewed and can explain every function in `index.html` and `verification/verify_memory.js`.
- Independently re-derived the theoretical similarity formula
  (`verification/derivation.md`) rather than accepting it unchecked.
- Verified each citation against the actual paper (not a secondhand summary) before it was
  used to support a claim.
- Chose the seeds used in the locked walkthrough steps after checking their output against
  the verification script — not by cherry-picking among many seeds for a flattering curve
  (see `verification/notes.md` for the actual search process and why an *average-over-all-
  items* metric was adopted instead of a single noisy query).

No AI-generated citations, numbers, or quotes appear anywhere in this submission; every
number is either derived live from the code or was read directly from a cited primary
source.

## Files in this repository

| File | What it is |
|---|---|
| `index.html` | The interactive artifact (open directly in any browser) |
| `verification/verify_memory.js` | Standalone Node re-implementation of the memory math, used to check `index.html`'s numbers |
| `verification/derivation.md` | The derivation of the theoretical similarity curve shown as the dashed line in the charts |
| `verification/notes.md` | Working log of how default parameters were chosen, including a bug caught and fixed mid-build |
| `ONE_PAGE_SUMMARY.md` / `.pdf` | The required one-page concept summary (also see `ONE_PAGE_SUMMARY.print.html`, the print-styled source the PDF was rendered from via headless Edge: `msedge --headless --print-to-pdf=ONE_PAGE_SUMMARY.pdf ONE_PAGE_SUMMARY.print.html`) |
| `DEFENSE_NOTES.md` | Internal prep for the live-defense judging criterion — not part of the graded narrative |
| `LICENSE` | MIT license for the original code |

## Credits & license

- Code (`index.html`, `verification/*`) — MIT License, see [`LICENSE`](./LICENSE).
- Fonts: Fraunces, Source Sans 3, IBM Plex Mono — all via Google Fonts, each under the SIL
  Open Font License.
- No other third-party assets, datasets, or model weights are used.
- Built by the team for DataForge (IIT Kharagpur) × Pathway, "Explain the Frontier" track.

## Known limitations

- The demo uses dense random Gaussian vectors, not BDH's actual sparse non-negative
  activations — a deliberate simplification, disclosed in the artifact's evidence-discipline
  callout, not a reproduction of BDH itself.
- The theoretical curve `√(d/(d+n−1))` is a first-order approximation (derivation in
  `verification/derivation.md`); it assumes independent random unit-vector keys and gets
  noisier as an approximation at very small `d`.
- "Force a collision" perturbs a key by a fixed blend factor (0.35); it is illustrative of
  the general phenomenon, not a parameter sweep over collision severity.
