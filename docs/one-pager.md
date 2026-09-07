# A Fixed State Has a Fixed Fidelity Budget: What Outer-Product Memory Actually Buys

## The design pressure

A Transformer answers a query by attending over every previous token, so it keeps an
explicit key–value cache that grows linearly with sequence length. The alternative is to
fold each token into a **fixed-size state**. The operation that does this is the same in
every architecture that tries it: an outer-product write, `S ← S + k vᵀ`, read back as
`v̂ = kᵀS`. The literature calls the resulting state a fast weight, a linear-attention
state, or, in Pathway's Dragon Hatchling (BDH), a synapse.

The cost is exact and derivable. Expanding the readout at a stored key gives
`v̂ = v_t + Σ_{p≠t} (k_t·k_p) v_p`: the value you stored, plus one crosstalk term per other
association. For random unit keys that noise has expected squared norm `(n−1)/d`, so the
expected cosine between readout and truth is about `√(d/(d+n−1))`. Our simulation matches
that to three decimals at `d=32` across two orders of magnitude in `n`.

## What we set out to show, and what we found instead

The obvious next question is whether a better write rule fixes this. Two are well
documented. The **delta rule** subtracts the current read before writing —
`S ← S + βk(v − kᵀS)ᵀ` — which Gated DeltaNet-2 (arXiv:2605.22791) describes exactly that
way, and which is one gradient step on Titans' memory objective `‖M(k) − v‖²`
(arXiv:2501.00663, eq. 11–12). A **decay gate** fades the state before each write,
`S ← λS + k vᵀ`, Titans' forgetting gate (eq. 13) with λ fixed rather than learned.

We implemented all three and expected the delta rule to dominate. Averaged over every
stored association at `d=32`, it does not:

| n/d | Hebbian | Delta | Decay λ=0.9 |
|---|---|---|---|
| 0.25 | 0.911 | **0.934** | 0.894 |
| 1.0 | **0.716** | 0.677 | 0.484 |
| 4.0 | **0.449** | 0.241 | 0.125 |

The delta rule wins while the memory is nearly empty and loses by 0.208 at four times
capacity. Splitting recall by *when* each association was written explains it. At `n=128`,
Hebbian scores 0.454 on the oldest associations and 0.448 on the newest, a spread of 0.022;
it is exactly order-independent, because `S` is a plain sum. The delta rule scores 0.031 on
the oldest and 0.798 on the newest. Subtracting the current read is an erase, and what it
erases is whatever older associations had written along that direction.

So the three rules are not better and worse versions of one another. They hold an identical
`d × d` state and differ only in **how they allocate a fixed amount of fidelity**: evenly
across all history, or concentrated on the recent past. The unweighted mean is one summary
of that allocation, and it is the summary that happens to flatter even distribution.

## Where BDH sits

BDH's working memory is a synapse strength updated during inference by
`σ(i,j) += Y(i)X(j)` (arXiv:2509.26507, §1.2) — the outer-product write above, at
neuron-synapse granularity, which the paper itself calls a fast weight. So BDH is the pure
accumulation column: no forgetting, order-independent, fidelity spread evenly over
everything in the session. BDH-CQ (arXiv:2608.09888) applies the same write-don't-replace
pattern one level up, accumulating contextual state per demonstration.

The obvious objection is that BDH's activations are sparse and non-negative, roughly 5% of
neurons active, while our toy uses dense Gaussian vectors whose signs cancel. We measured
across that gap rather than apologising for it. At `d=64`, recall in the two regimes agrees
within noise at 5% activation (0.833 vs 0.823 at n=32) and separates clearly by 25%
activation (0.634). The reason is geometric: two 3-of-64 sparse keys share an active
coordinate only 14% of the time, and a miss is exact orthogonality. That protection roughly
pays for the lost sign cancellation.

## Evidence, labelled

**Derived and verified here:** the interference trade-off, the `√(d/(d+n−1))` curve, the
recall-by-age profiles, the sparsity comparison, and Hebbian's state norm growing as √n
(22.51 measured against 22.63 predicted at n=512) while the delta rule saturates near 5.6.
All reproducible with one command; 40 seeds per cell.

**Reported by developers, not reproduced by us:** BDH's ~5% sparsity finding and BDH-CQ's
29.5% pass@2 on ARC-AGI-1 at $0.0007 per task. Pathway's own open BDH repository notes that
its published Sudoku result came from an internal implementation.

**Not claimed:** that BDH publishes any recall-against-capacity curve (it does not), or that
any rule here is categorically best.

## The limitation that matters most

Our recall metric is cosine, which is scale-invariant, so it is structurally blind to state
norm. That flatters Hebbian: its norm grows as √n without bound, which is precisely the
pathology Variational Linear Attention (arXiv:2605.11196) targets when it notes that a
growing state norm causes "progressive interference between stored associations". In a real
network that growth meets normalisation layers and finite precision. A fair comparison needs
a metric that is not scale-invariant, and ours is not it.

**The open question** is consolidation: how a system built on fast per-session accumulation
promotes anything useful into durable weights. Nothing in this family answers that yet.

*Interactive version, source, tests and full experiment tables: see the repository README.*
