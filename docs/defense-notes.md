# Defense notes

Internal prep for the live questions. Not part of the graded narrative. Whoever
presents should be able to answer all of these without opening a file.

## Numbers to have cold

- Outer product write `S ← S + k vᵀ`; read `v̂ = kᵀS`. Our convention is transposed
  from how DeltaNet papers write it, which is why our delta rule reads
  `S ← S + βk(v − kᵀS)ᵀ` rather than `S ← S + β(v − Sk)kᵀ`.
- BDH's rule, verbatim from §1.2: `σ(i,j) += Y(i)X(j)`. Sparsity ~5%, §6.4.
- Theory curve `√(d/(d+n−1))`. At n = d it gives 0.707.
- State: `d²·8` bytes. Cache: `n·d·2·8` bytes. At d=16, n=20: 2 KB vs 5 KB.
- The headline result: at n = 4d, Hebbian 0.449, delta 0.241, decay 0.125.
- Recall by age at n=128: Hebbian spread 0.022, delta spread 0.767.
- State norm at n=512: Hebbian 22.505 (√512 = 22.627), delta 5.647.
- Sparsity at d=64, n=32: dense 0.823, 5%-sparse 0.833, 25%-sparse 0.634.
- 33 tests, 40 seeds per experiment cell.

## "Is any of this precomputed?"

Two things are, both labelled on the page: the sparsity table and the state-norm
figures, because they are 40-seed averages that would stall a tab. Everything else
recomputes on every control change. Proof on demand: open DevTools, move a slider,
watch the Network tab stay empty. Better proof: change a control to a value nobody
would have anticipated and read the number out before it renders.

## "Why should I believe the delta rule result? It contradicts the papers."

It does not contradict them, it measures a different quantity. Delta-rule papers
report associative recall benchmarks, which mostly ask about specific queried items
in context. We report the unweighted mean over every association ever written. Those
are different questions and experiment 6 shows both answers at once: split by age,
the delta rule is far ahead on recent writes and far behind on old ones. Say which
metric you mean and the apparent contradiction disappears.

We also expected the delta rule to win, wrote a test asserting it, and spent an hour
looking for the bug before accepting the result. That test is now three tests
asserting the real behaviour including the crossover direction.

## "Does BDH's paper show your interference curve?"

No, and the page says so in the evidence box. The paper documents the mechanism.
We have not run BDH and are not claiming to have reproduced anything. The
interference phenomenon is independently documented in Titans, Gated DeltaNet-2 and
Variational Linear Attention, all cited. Our contribution is a toy small enough to
manipulate, not a new finding.

## "Your toy uses dense Gaussian vectors and BDH doesn't."

Correct, and that was our biggest modelling worry, so we implemented sparse
non-negative keys and measured it instead of arguing about it. At BDH's reported
~5% activation the curves land on top of each other. The explanation is that
3-of-64 sparse keys overlap only 14% of the time and a miss is exact orthogonality,
which pays for the fact that non-negative keys cannot cancel. At 25% activation the
protection disappears and recall falls apart. The "key geometry" dropdown switches
the whole page over, live.

## "What's the weakest part?"

Cosine is scale-invariant, so our metric cannot see state norm, and Hebbian's norm
grows as √n without bound. That is exactly the pathology Variational Linear
Attention is built to fix. So experiment 1 partly flatters Hebbian by being blind to
what the delta rule is spending to keep its state bounded. We measured the norms
separately (experiment 7) rather than leave the hole unstated, but the honest answer
is that a fair head-to-head needs a metric we do not have.

Second weakest: β is hard-coded to 1 for the delta rule and we never swept it.

## "How would you falsify your own claim?"

Two ways, both live in the sandbox. If raising d at fixed n did not improve recall,
the crosstalk story is wrong. If any write rule lifted the whole recall-by-age curve
rather than tilting it, the "fixed budget" claim is wrong. Both take about thirty
seconds to try and we would rather a judge tried them than took our word.

## "Walk me through the code."

`src/memory.js` is the only place the maths lives; the browser, the tests and the
experiment scripts all import that one file. That is deliberate: early on we had a
Node copy and a browser copy that disagreed for the same seed, because one of them
drew an extra random number per step for the chart series and the streams diverged.
`scripts/build.js` flattens the modules into `dist/index.html` and fails the build
if two modules ever declare the same top-level name, since a flat bundle has no
module scope.

## "What did the AI do?"

It wrote a lot of the component and chart code, first drafts of the prose, and the
initial literature search. We chose the claim, designed the roster task and the
experiments, re-derived the theory curve and the delta-rule transposition by hand,
verified every citation against the actual paper, and wrote the tests. It also
introduced two errors we caught and wrote up: a factual claim that the cache costs
"twenty times" the state when it is 2.5× at those settings, and a CSS rule that
uppercased the variable `d` into `D` and `λ` into `Λ`. Both are in the build log.
Do not be defensive about this question; the rules allow AI assistance and require
disclosure, and the interesting answer is the specifics.
