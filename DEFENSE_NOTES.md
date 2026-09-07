# Defense notes — anticipated questions

Internal prep document for the live-defense judging criterion (15 points: "team
understands every major component, can trace the system, can predict the result of
changes, and can distinguish real behavior from precomputation or animation"). Not part of
the graded submission narrative — this is for the presenting team member.

## "Is any of this precomputed or animated?"
No. Every number is computed in the browser at the moment a control changes, using the
seeded RNG in `index.html`'s `<script>` block. Proof on demand: open browser DevTools,
change the `n` slider, watch the Network tab show zero requests — there's nothing to fetch,
because nothing is looked up. Offer to change a slider to an unusual value live and read the
resulting number aloud before it's rendered, to show it isn't scripted.

## "Why does querying different items give different similarity numbers?"
Because retrieval quality for the fast-weight memory is a random-noise phenomenon, not a
fixed function of `n` and `d` alone — it depends on the specific random keys drawn. That's
why the headline metric is the *average* over all stored items (a robust, low-noise number)
rather than one item's result, and why the chart also shows the theoretical curve
(`√(d/(d+n−1))`) as the expected trend a single noisy run should hover around. See
`verification/notes.md` for the exact investigation that led to this design choice.

## "Did you pick a favorable seed for the walkthrough?"
No — see `verification/notes.md` §2 in detail. We checked; a single specific-item query at
seed=7 was *not* monotonically clean (0.785 → 0.842 → 0.500 across n=4/16/64), which is
exactly what motivated switching the headline metric to an all-items average, which is
stable across every seed we checked (four seeds tabulated in the notes file, all telling the
same story). Once that fix was made, no seed search or cherry-picking was needed.

## "Does BDH's paper actually show this collapse curve?"
No, and the artifact says so explicitly in the "Evidence discipline" callout under "Inside
BDH." BDH's paper (arXiv:2509.26507) documents the mechanism — the exact Hebbian
outer-product update and ~5% sparsity — not an interference-vs-capacity measurement. The
curve is our demonstration of the general fast-weight mechanism class, derived
mathematically (`verification/derivation.md`) and cross-checked against 30-seed simulation
averages, and against the independent 2025-2026 literature (Titans, Gated DeltaNet-2,
Variational Linear Attention) that studies this exact phenomenon in the broader mechanism
family.

## "How is this different from what BDH actually does?"
Two disclosed simplifications: (1) our demo uses dense random Gaussian key/value vectors;
BDH uses sparse, non-negative neuron activations (~5% active). Sparsity changes *how fast*
capacity fills (fewer active dimensions collide less often at small scale, but a sparse
code also has less effective capacity per active dimension) but not the outer-product
mechanism itself. (2) BDH's synapses sit inside a full multi-layer network with additional
structure (attention over graph edges, ReLU-low-rank transforms in the GPU formulation);
our toy isolates just the memory-write/read primitive.

## "Why is the cache always exact in your demo — real attention isn't a hard lookup?"
Correct, and intentional: we implemented cache retrieval as an index lookup specifically to
isolate one variable (memory growth vs. interference) rather than conflating it with
softmax-attention's own weighting behavior, which is a separate topic. This is disclosed in
the README's "Reproducing the results" / architecture section.

## "What would change your claim / how would you falsify it?"
If increasing `d` did *not* improve fast-weight retrieval similarity at fixed `n` (sandbox,
try it), or if the cache's memory did *not* grow linearly in the byte-count chart, the
central claim would be wrong. Both are directly testable live in the sandbox in under 30
seconds — that's the point of the "try to break it" framing.

## "What's the single weakest part of this submission?"
The theoretical curve is a first-order approximation (stated in `derivation.md`), not an
exact formula, and gets less accurate at very small `d` (try `d=4` in the sandbox — the
dashed line visibly diverges more from the live curve there). We disclose this rather than
hide it.

## Quick facts to have ready
- Outer-product update: `S ← S + k·vᵀ`. Retrieval: `v̂ = k_qᵀS`.
- BDH's equation (verbatim): `σ(i,j) += Y(i)X(j)` — Dragon Hatchling §1.2.
- BDH sparsity: ~5% of neurons active (§6.4, "Empirical Finding 1").
- Theoretical similarity curve: `√(d/(d+n−1))`, derived from `E[||noise||²] ≈ (n−1)/d`.
- Cache memory: `n·d·8` bytes. Fast-weight memory: `d²·4` bytes (constant in `n`).
- BDH-CQ headline number (not reproduced by us, cited from the paper): 29.5% pass@2 on
  ARC-AGI-1 at $0.0007/task, 150M parameters.
