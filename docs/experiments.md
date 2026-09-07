# Experiments

Everything here comes from `npm run experiments`, which prints these tables and
writes `results/experiments.json`. Forty seeds per cell unless stated otherwise.
A single run of a random-vector memory is noisy enough to support whichever
conclusion you were hoping for, so nothing below is a single run.

Rules under test, all holding an identical `d × d` state:

| id | update | stands in for |
|---|---|---|
| `hebbian` | `S ← S + k vᵀ` | BDH's synaptic update |
| `delta` | `S ← S + β k (v − kᵀS)ᵀ`, β = 1 | DeltaNet family; one gradient step on Titans' `‖M(k)−v‖²` |
| `decay` | `S ← λS + k vᵀ`, λ = 0.9 | Titans' forgetting gate with λ fixed rather than learned |

---

## 1. Recall against load

Mean cosine between what was stored and what comes back, averaged over every
stored association. `d = 32`, dense Gaussian keys.

| n | n/d | hebbian | delta | decay 0.9 | theory |
|---|---|---|---|---|---|
| 4 | 0.13 | 0.959 | 0.973 | 0.956 | 0.956 |
| 8 | 0.25 | 0.911 | 0.934 | 0.894 | 0.906 |
| 16 | 0.50 | 0.832 | 0.851 | 0.749 | 0.825 |
| 24 | 0.75 | 0.767 | 0.759 | 0.599 | 0.763 |
| 32 | 1.00 | 0.716 | 0.677 | 0.484 | 0.713 |
| 48 | 1.50 | 0.639 | 0.544 | 0.337 | 0.636 |
| 64 | 2.00 | 0.582 | 0.447 | 0.256 | 0.580 |
| 96 | 3.00 | 0.505 | 0.323 | 0.174 | 0.502 |
| 128 | 4.00 | 0.449 | 0.241 | 0.125 | 0.449 |
| 192 | 6.00 | 0.379 | 0.166 | 0.089 | 0.379 |
| 256 | 8.00 | 0.333 | 0.125 | 0.064 | 0.334 |

The Hebbian column tracks the derived curve to three decimal places at high load,
which is the check that the analysis in `derivation.md` is describing the thing we
actually built.

## 2. The result we did not expect

We assumed the delta rule would dominate, on the strength of the delta-rule
literature reporting better associative recall. Same seeds, same data, delta minus
hebbian:

| n | hebbian | delta | delta − hebbian |
|---|---|---|---|
| 8 | 0.912 | 0.936 | **+0.024** |
| 16 | 0.829 | 0.843 | +0.014 |
| 24 | 0.766 | 0.757 | −0.009 |
| 32 | 0.716 | 0.678 | −0.038 |
| 48 | 0.638 | 0.541 | −0.096 |
| 64 | 0.582 | 0.447 | −0.136 |
| 128 | 0.448 | 0.246 | −0.202 |
| 256 | 0.332 | 0.124 | **−0.208** |

The crossover sits near `n ≈ 0.7d`. Below it the delta rule wins slightly; above
it, it loses badly and keeps losing.

This is not a contradiction of the delta-rule literature. It is a consequence of
the metric we chose. "Mean over every association ever written" is a specific
question, and it is not the question a delta-rule model is built to answer.
Experiment 6 shows what it is optimising instead.

## 3. Two keys pointing the same way

One near-duplicate key arrives last and writes a different value. `d = 32`, 16
unrelated associations already stored. First number is recall of the **old** value
`v1` at the original key; bracketed number is recall of the **new** value `v2`.

| cos(k1,k2) | hebbian | delta | decay 0.9 |
|---|---|---|---|
| 0.00 | 0.807 [0.829] | 0.665 [1.000] | 0.413 [0.952] |
| 0.50 | 0.749 [0.778] | 0.506 [1.000] | 0.282 [0.951] |
| 0.90 | 0.657 [0.690] | 0.158 [1.000] | 0.203 [0.943] |
| 0.99 | 0.635 [0.671] | 0.063 [1.000] | 0.191 [0.940] |

Read the bottom row carefully, because it is easy to score it backwards. At
cos = 0.99 the two keys are effectively the same key carrying two different
values, which is an ambiguous request. Hebbian returns a blend: 0.635 towards the
old value and 0.671 towards the new one, so it is wrong about both. The delta rule
returns the new value perfectly and has destroyed the old one, which is right if
you meant to update a fact and catastrophic if you meant to store two.

Neither rule is more robust here. They disagree about what a repeated key means.

## 4. Does BDH's sparsity change the conclusion?

Our toy uses dense Gaussian vectors. BDH reports roughly 5% of neurons active and
those activations are non-negative, so they can never cancel. That is a real gap
between the toy and the thing it models, so we measured across it. `d = 64`,
hebbian, mean recall:

| n | dense | 3/64 active (~5%) | 6/64 (~10%) | 16/64 (25%) |
|---|---|---|---|---|
| 8 | 0.953 | 0.951 | 0.936 | 0.852 |
| 16 | 0.905 | 0.909 | 0.870 | 0.738 |
| 32 | 0.823 | 0.833 | 0.765 | 0.634 |
| 64 | 0.712 | 0.716 | 0.627 | 0.560 |
| 128 | 0.579 | 0.578 | 0.497 | 0.517 |

At BDH's reported sparsity the two regimes agree to within noise. The geometry
explains it:

| support | P(two keys overlap at all) | mean dot product |
|---|---|---|
| 3/64 | 0.140 | 0.044 |
| 6/64 | 0.446 | 0.081 |
| 16/64 | 0.996 | 0.219 |
| dense | 1.000 | 0.001 (mean \|dot\| = 0.099, signs cancel) |

Two effects pull against each other. Sparse keys usually miss each other entirely,
and a miss is exact orthogonality rather than approximate. When they do collide
they cannot cancel, so each collision costs more. At 5% the protection wins by
about as much as the lost cancellation costs, and the curves land on top of each
other. At 25% the supports almost always overlap, there is no cancellation to fall
back on, and recall degrades clearly.

The practical upshot for this project: using dense vectors is a fair simplification
at BDH's operating point, and we can say that with a number instead of a shrug.

## 5. Roster accuracy

The hall-allotment task from the artifact. Fraction of taught names whose room
decodes correctly against the 32-room vocabulary.

| d | names | hebbian | delta | decay 0.9 |
|---|---|---|---|---|
| 16 | 8 | 0.975 | 0.931 | 0.938 |
| 16 | 12 | 0.950 | 0.831 | 0.792 |
| 16 | 16 | 0.853 | 0.705 | 0.670 |
| 16 | 20 | 0.814 | 0.603 | 0.546 |
| 32 | 16 | 1.000 | 0.983 | 0.908 |
| 32 | 20 | 0.999 | 0.950 | 0.765 |
| 64 | 20 | 1.000 | 1.000 | 0.900 |

This is why the artifact's roster runs at `d = 16` and the three-rule comparison at
`d = 14`. At `d = 32` and above the task is saturated for Hebbian and there is
nothing to see. Discrete decoding is far more forgiving than raw cosine: a cosine
of 0.8 still decodes to the right room almost every time, because the competing
rooms are random and mostly further away.

## 6. Recall by age — the reframe

`d = 32`, `n = 128`, associations bucketed by when they were written.

| written at | hebbian | delta | decay 0.9 |
|---|---|---|---|
| 1–16 (oldest) | 0.454 | 0.031 | 0.004 |
| 17–32 | 0.447 | 0.031 | −0.012 |
| 33–48 | 0.445 | 0.071 | 0.006 |
| 49–64 | 0.465 | 0.115 | 0.002 |
| 65–80 | 0.447 | 0.174 | 0.009 |
| 81–96 | 0.458 | 0.297 | 0.056 |
| 97–112 | 0.443 | 0.475 | 0.226 |
| 113–128 (newest) | 0.448 | 0.798 | 0.738 |

Hebbian varies by 0.022 across the whole span. That is not approximately
order-independent, it is exactly order-independent: `S` is a plain sum, so
permuting the writes produces an identical matrix, and `test/memory.test.js`
asserts that to 1e-9.

The delta rule swings by 0.767 across the same span. Subtracting the current read
before writing is an erase, and what it erases is whatever older associations had
put along that direction.

So the three rules are not better and worse versions of each other. They are three
different answers to "who gets the fidelity". The unweighted mean in experiment 1
is just one summary of these curves, and it happens to be the summary that
flatters even distribution.

## 7. State norm

`d = 32`, Frobenius norm of `S`.

| n | hebbian | √n | delta | decay 0.9 |
|---|---|---|---|---|
| 8 | 2.822 | 2.828 | 2.677 | 2.066 |
| 32 | 5.638 | 5.657 | 4.513 | 2.286 |
| 128 | 11.292 | 11.314 | 5.615 | 2.297 |
| 512 | 22.505 | 22.627 | 5.647 | 2.298 |

Hebbian's norm is √n to within 0.5%, because independent outer products add
incoherently. Delta and decay both saturate.

This is the limitation that matters most for reading experiment 1 correctly.
Variational Linear Attention (arXiv:2605.11196) motivates its whole method by
linear-attention state norm growing with sequence length and "causing progressive
interference between stored associations". Our recall metric is cosine, which is
scale-invariant, so it cannot see norm growth at all. In a real network that
growth runs into normalisation layers, finite precision and downstream
nonlinearities. Hebbian looks best in experiment 1 partly because our metric is
blind to the cost the delta rule is paying to keep its state bounded.

Note also that we measure √n growth for random keys, where they report O(T). We
have not tried to reproduce their setting and are not claiming to; correlated or
learned keys would accumulate more coherently than independent random ones.

## What we would do with more time

- Learned rather than random keys. Real architectures spread keys deliberately,
  and every number here is a random-key baseline that should be beatable.
- A proper multi-query recall benchmark instead of uniform averaging, to test the
  delta rule on the task it was designed for.
- Sweep β for the delta rule. We only ever ran β = 1, the full-correction case, and
  the interesting behaviour is probably in between.
