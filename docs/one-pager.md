# A Fixed State Has a Fixed Fidelity Budget: What Outer-Product Memory Actually Buys

## The design pressure

A Transformer attends over every previous token, so it keeps a key-value cache that grows
linearly with sequence length. The alternative is to fold each token into a **fixed-size
state**. The operation is the same in every architecture that tries it: an outer-product
write, `S ← S + k vᵀ`, read back as `v̂ = kᵀS`. The literature calls the result a fast
weight, a linear-attention state, or, in Pathway's Dragon Hatchling (BDH), a synapse.

The cost is derivable rather than empirical. Expanding the readout at a stored key gives
`v̂ = v_t + Σ_{p≠t} (k_t·k_p) v_p`: the value you stored, plus one crosstalk term per other
association. For random unit keys that noise has expected squared norm `(n−1)/d`, putting
the expected cosine at about `√(d/(d+n−1))`. Simulation matches to three decimals at
`d=32` across two orders of magnitude in `n`.

## What we expected, and what we measured

Does a better write rule fix this? Two are well documented. The **delta rule** subtracts the
current read before writing, `S ← S + βk(v − kᵀS)ᵀ` — Gated DeltaNet-2 (arXiv:2605.22791)
describes the family in exactly those words, and it is one gradient step on Titans' memory
objective `‖M(k) − v‖²` (arXiv:2501.00663, eq. 11–12). A **decay gate** fades the state
first, `S ← λS + k vᵀ`, which is Titans' forgetting gate (eq. 13) with λ fixed.

We implemented all three and expected the delta rule to dominate. Averaged over every stored
association at `d=32`, it does not:

| n/d | Hebbian | Delta | Decay λ=0.9 |
|---|---|---|---|
| 0.25 | 0.911 | **0.934** | 0.894 |
| 1.0 | **0.716** | 0.677 | 0.484 |
| 4.0 | **0.449** | 0.241 | 0.125 |

Splitting recall by *when* each association was written explains it. At `n=128` Hebbian
scores 0.454 on the oldest and 0.448 on the newest, a spread of 0.022; it is exactly
order-independent, because `S` is a plain sum. The delta rule scores 0.031 and 0.798.
Subtracting the current read is an erase, and older content is what gets erased.

The three rules are not better and worse versions of each other. They hold an identical
state and differ in **how they allocate a fixed amount of fidelity**.

| System | State | Write rule optimises | Fidelity goes to | Strongest public evidence |
|---|---|---|---|---|
| Transformer KV cache | grows with every token | nothing; it stores | all of it, exactly | ubiquitous deployment |
| BDH / BDH-CQ | fixed, `d×d` synapses | nothing; pure accumulation | spread evenly over history | developer-reported |
| DeltaNet, Gated DeltaNet-2 | fixed | `‖M(k) − v‖²` at the current key | the recent past | developer-reported |
| Titans | fixed, plus momentum | same objective, learned gate `α_t` | recency, tunably | developer-reported |

The same arithmetic read the other way is why in-context learning works. Write one
association repeatedly with independent noise on each copy and recall climbs from 0.232 to
0.804 over sixteen demonstrations, in a state that never changes size, because the signal
adds coherently and the noise does not. Where demonstrations conflict, the readout is the
vote: for `a` against `b` the cosine to A lands on `a/√(a²+b²)`, measured to within 0.003.
Consistent evidence is cheap for this memory; unrelated facts are expensive.

## Where BDH and BDH-CQ sit

BDH's working memory is a synapse strength updated during inference by `σ(i,j) += Y(i)X(j)`
(arXiv:2509.26507, §1.2) — the outer-product write at neuron-synapse granularity, which the
paper itself calls a fast weight. BDH is the pure-accumulation column: no forgetting,
order-independent, fidelity spread evenly. BDH-CQ (arXiv:2608.09888) applies the same
additive pattern to demonstrations rather than tokens, which is the accumulation result above.

BDH's activations are sparse and non-negative, about 5% active, while our toy uses dense
Gaussian vectors whose signs cancel. We measured it. At
`d=64` the regimes agree within noise at 5% activation (0.833 vs 0.823 at n=32) and separate
clearly by 25% (0.634). Two 3-of-64 keys share an active coordinate only 14% of the time, and
a miss is exact orthogonality, which roughly pays for the lost cancellation.

## Maturity, honestly assessed

**Post-Transformer fixed-state memory: about 4 out of 10.** The mechanism is settled and the
mathematics is old; what is unsettled is everything around it. Evidence is concentrated in
developer-reported benchmarks rather than independent reproductions. Pathway's own open BDH
repository notes its published Sudoku result came from an internal implementation. Gated
DeltaNet-2 and Variational Linear Attention, both 2026, are still proposing fixes to the
interference problem, which is not what a solved area looks like.

The most prominent third-party name attached to BDH is Amazon: Pathway is an AWS
frontier-model partner and BDH is developed on SageMaker HyperPod. That is commercial and
infrastructure validation, **not** an independent evaluation — nobody outside Pathway has
reproduced its headline results. The largest remaining gaps are consolidation (promoting fast
state into durable weights), the absence of external reproductions at scale, and the fact that
no member of this family beats a full KV cache on memory *and* exactness at once — the cache's
freedom from interference is structural, not an engineering lag.

## Evidence classification

**Derived and verified here:** the interference trade-off, the `√(d/(d+n−1))` curve, the
recall-by-age profiles, the sparsity comparison, the accumulation result, and Hebbian's state
norm tracking √n (22.51 against 22.63 predicted at n=512) while the delta rule saturates near
5.6. Forty seeds per cell, one command, 37 tests. **Reported by developers, not reproduced by
us:** BDH's sparsity figure and BDH-CQ's 29.5% pass@2 on ARC-AGI-1 at $0.0007 per task.
**Not claimed:** that BDH publishes any recall-against-capacity curve, or that a rule here is
categorically best.

**The limitation that matters most:** cosine is scale-invariant, so it is structurally blind
to state norm. That flatters Hebbian, whose norm grows without bound — precisely the pathology
Variational Linear Attention (arXiv:2605.11196) targets when it notes a growing state norm
causes "progressive interference between stored associations". A fair head-to-head needs a
metric we do not have.

*Interactive version, source and full experiment tables: see the repository README.*
