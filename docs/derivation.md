# Where the theory curve comes from

The charts overlay a dashed reference line:

```
expected cosine(n, d) ≈ sqrt( d / (d + n − 1) )
```

This is the standard first-order signal-to-noise estimate for a linear
outer-product associative memory holding random unit vectors. We re-derived it
rather than quoting it, because it is the one number on the page that is not
measured, and a wrong reference line would quietly make every measurement look
right.

## Setup

- `n` associations, each a pair of independent random unit vectors `(k_p, v_p)` in `R^d`.
- State: `S = Σ_p k_p v_pᵀ`, so `S[i][j] = Σ_p k_p[i] · v_p[j]`.
- Readout at a stored key `k_t`: `v̂ = k_tᵀ S`.

## The algebra

Expand the readout:

```
v̂ = k_tᵀ S
  = k_tᵀ Σ_p k_p v_pᵀ
  = Σ_p (k_t · k_p) v_p
  = (k_t · k_t) v_t + Σ_{p≠t} (k_t · k_p) v_p
  = v_t + Σ_{p≠t} (k_t · k_p) v_p
```

The last step uses `k_t · k_t = 1`. So the readout is exactly the value you
stored plus one crosstalk term per other association. Nothing is approximated
yet; that expansion is exact for this memory.

Now the statistics. For independent random unit vectors in `d` dimensions, the
dot product `k_t · k_p` has mean zero and variance about `1/d`. The `n−1`
crosstalk vectors are approximately independent of each other and of `v_t`, and
each `v_p` is a unit vector, so the noise term has expected squared norm:

```
E‖noise‖² ≈ (n − 1) · (1/d)
```

The signal contributes squared norm 1 and is approximately orthogonal to the
accumulated noise, giving `‖v̂‖² ≈ 1 + (n−1)/d`. The cosine between `v̂` and `v_t`
is the fraction of the readout's length that points at the signal:

```
cos ≈ 1 / sqrt(1 + (n−1)/d) = sqrt( d / (d + n − 1) )
```

Two sanity checks fall straight out. At `n = 1` it gives exactly 1, which matches
the single-association test in `test/memory.test.js`. At `n = d + 1` it gives
`1/√2 ≈ 0.707`, so "as many associations as dimensions" costs you about 30% of
your alignment.

## Where it stops being true

**It is first-order.** The independence assumption for the crosstalk terms is an
approximation that gets looser as `n/d` grows.

**It is a dense-Gaussian result.** It is derived for keys whose dot products are
symmetric about zero. Sparse non-negative keys break that assumption in both
directions at once: most pairs do not overlap at all, and the pairs that do
overlap cannot cancel. The line is deliberately left on the chart when you switch
the page into sparse mode, so you can watch it stop fitting.

**It says nothing about the other write rules.** The delta rule and the decay gate
are not described by this curve and we do not draw it as if they were. Their
behaviour is measured, not predicted, in `docs/experiments.md`.

## Checked against simulation

`test/memory.test.js` asserts agreement to within 0.06 at `d = 32` for
`n ∈ {16, 32, 64, 128}`, averaged over 40 seeds, and that test fails the build if
it stops holding. The full table is in `docs/experiments.md` §1: measured 0.832 /
0.716 / 0.582 / 0.449 against predicted 0.825 / 0.713 / 0.580 / 0.449.
