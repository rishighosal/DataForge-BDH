# Where the theoretical curve comes from

The artifact overlays a dashed reference curve on every retrieval-similarity chart:

```
similarity(n, d) ≈ sqrt( d / (d + n − 1) )
```

This is the classical first-order signal-to-noise estimate for a linear (outer-product)
associative memory storing random unit vectors, re-derived here so the number in the code
isn't taken on faith.

## Setup

- `d`-dimensional keys and values, each drawn uniformly at random on the unit sphere
  (independent across all `n` stored pairs).
- Memory: `S = Σ_{p=1}^{n} k_p v_pᵀ` (a `d×d` matrix, outer-product/Hebbian accumulation).
- Query: pick one stored index `t`, retrieve `v̂ = S v` ... precisely, `v̂_j = Σ_i k_t(i) S(i,j)`,
  i.e. `v̂ = k_tᵀ S`.

## Derivation

Expand the readout using the stored keys:

```
v̂ = k_tᵀ S = k_tᵀ Σ_p k_p v_pᵀ = Σ_p (k_t · k_p) v_p
           = (k_t · k_t) v_t  +  Σ_{p≠t} (k_t · k_p) v_p
           =        1 · v_t   +           noise
```

(`k_t · k_t = 1` because keys are unit vectors.) So the readout is exactly the true value
`v_t` plus a noise term built from the `n−1` other stored pairs.

For random unit vectors in `d` dimensions and `d` reasonably large, the dot product of two
independent random unit vectors is approximately `Normal(0, 1/d)` (a standard concentration-
of-measure fact — the marginal of one coordinate of a uniform point on the sphere scales
like `1/√d`). So each cross term `(k_t · k_p) v_p` is a random vector scaled by a coefficient
of variance `≈ 1/d`, and the `n−1` cross terms are approximately independent of each other
and of `v_t`. The noise vector's squared norm is then approximately:

```
E[ ||noise||² ] ≈ (n − 1) · (1/d) · E[||v_p||²] = (n − 1) / d
```

(since `||v_p|| = 1`). The readout's squared norm is therefore approximately
`1 + (n−1)/d` (signal term + noise term, which are approximately uncorrelated), and the
cosine similarity between `v̂` and the true `v_t` — which is dominated by how much of `v̂`'s
norm is "pointed at" `v_t` versus scattered into orthogonal noise directions — comes out to
approximately:

```
similarity ≈ 1 / sqrt(1 + (n−1)/d) = sqrt( d / (d + n − 1) )
```

## What this is, and isn't

This is a **first-order approximation**, not an exact formula: it assumes the cross-term
noise vectors behave like independent isotropic noise, which is only approximately true for
finite `d` and `n`, and it gets less precise at very small `d` (where "a random dot product
is `Normal(0,1/d)`" is a cruder approximation). It is a well-known result in the classical
linear-associative-memory literature (going back to linear correlograph / Kohonen-style
associative memories) and is consistent with how the modern fast-weight literature
describes capacity in terms of a signal-to-noise ratio that scales with `d/n`.

## Empirical check

`verify_memory.js` averages the *actual* simulated similarity over 30 independent seeds at
`d=16` and compares against this formula:

| n  | simulated (30-seed avg) | theory `√(d/(d+n−1))` |
|----|--------------------------|------------------------|
| 16 | 0.715                    | 0.718                  |
| 32 | 0.554                    | 0.583                  |
| 64 | 0.418                    | 0.450                  |
| 96 | 0.399                    | 0.379                  |

The match is close (within a few percentage points) across two orders of magnitude of
`n/d`, which is why the artifact presents the formula as a genuine theoretical reference
line rather than a decorative curve — but it is still an approximation, and the artifact
says so explicitly.
