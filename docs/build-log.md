# Build log

Working notes kept while building this, mostly so we can answer "why is it like
that" during the demo without guessing. Rough chronological order. Claude Code was
used as a coding and drafting assistant throughout (see the disclosure in the
README); where it got something wrong and we caught it, that is written down here
too, because those are the parts we understand best.

---

### 2026-09-06 — picking a claim we could be wrong about

Started from the topic list and picked associative memory / fast weights, combined
with the KV-caching topic, because they are the same mechanism seen from two sides
and BDH's synaptic update *is* the mechanism rather than an example of it. The
alternative candidates were inference-time scaling and sparse activations; both
would have meant explaining a result we could not run.

First draft of the claim was "fixed-size memory degrades, a cache does not". True
but boring, and not really falsifiable by anything a learner could do in the demo.
Parked it.

### 2026-09-06 — the RNG

Started with the textbook LCG (`s = s*1664525 + 1013904223`) because it is four
lines. Swapped to mulberry32 after remembering that an LCG's low-order bits are
close to worthless and we use the output to pick sparse support indices, which
reads exactly those bits via `Math.floor(rng() * d)`. Probably would not have
mattered at these sizes. Not worth finding out during a demo.

### 2026-09-07 — the metric was lying to us

The first version showed a single query's cosine as the headline number: pick one
stored association, read it back, print the similarity. The guided walkthrough was
supposed to go "good, worse, bad" across three load levels and instead it went
0.785, 0.842, 0.500 — not monotone, because a single query is one draw from a noisy
distribution.

We nearly fixed this the wrong way. The obvious move is to search seeds for one
where the three numbers happen to line up, and we actually ran that search: 500
seeds, and it found some spectacular ones, including a seed where similarity goes
*negative* at n=64. Which is a good demonstration of why single-query numbers are
the wrong thing to put on the page, and a bad thing to do to a reader.

Changed the metric instead of the seed. The headline is now the mean over every
stored association, which is stable across every seed we tried (0.914 / 0.871 /
0.968 / 0.935 at n=4 for seeds 1, 7, 42, 99). No seed hunting required after that.

### 2026-09-07 — Node and the browser disagreed about the same seed

Cross-checking the browser numbers against the Node script gave 0.947 where the
browser said 0.871. Same seed, same d, same n, same arithmetic.

Cause: `runTrial` draws a query index every step for the per-step chart series,
even when the caller only wants the final matrix. The Node port skipped that draw,
so the two RNG streams diverged after the first association and every subsequent
key was different. Both implementations were individually correct and the
comparison was meaningless.

Fix was one line in the Node port. The lesson stuck though, and it is why
`src/memory.js` is now the single implementation that both the browser and the
tests import, instead of a browser copy and a Node copy that agree until they
don't.

### 2026-09-07 — restructure

Moved from one big HTML file to `src/` modules plus `npm start`, `npm test`,
`npm run experiments`, `npm run build`. Mostly so the maths could be imported by a
test runner. `scripts/build.js` flattens the modules back into one file for the
published artifact; it fails the build if two modules ever declare the same
top-level name, since the flat bundle has no module scope to protect them.

### 2026-09-07 — implementing the other two rules

Decided that a comparison table describing DeltaNet and Titans was weak when we
could just implement both update rules and let people run them. Two evenings.

Getting the delta rule right took a re-derivation because our state convention is
transposed relative to how the papers write it. DeltaNet is
`S ← S(I − βkkᵀ) + βvkᵀ` with `read = Sk`; ours reads `kᵀS`, so it becomes
`S ← S + βk(v − kᵀS)ᵀ`. The test that pins this down is the one that writes two
values at the same key and asserts the second one comes back exactly.

### 2026-09-07 — we were wrong about the delta rule

Wrote a test asserting delta beats hebbian at d=32, n=24. It failed: 0.769 against
0.759. Assumed a bug in our implementation and went looking for it for about an
hour.

There is no bug. Averaged over everything stored, the delta rule loses to plain
Hebbian above roughly n = 0.7d, and the gap widens to −0.208 by n = 8d. The reason
took another experiment to find: split recall by how long ago each association was
written and Hebbian is dead flat across age while delta puts nearly everything into
the most recent quarter. Subtracting the current read before writing is an erase
operation and older content is what gets erased.

This reframed the whole submission. The claim went from "fixed memory degrades" to
"a fixed state has a fixed fidelity budget and the write rule only decides who gets
it", which is a better claim: it is more specific, we can show it in one chart, and
it is the sort of thing you would get wrong if you only read abstracts. Which we
had been about to.

Deleted the failing test and replaced it with three that pin the real behaviour,
including the crossover direction in both regimes.

### 2026-09-08 — sparsity, because it was the obvious objection

The demo uses dense Gaussian vectors; BDH uses ~5% sparse non-negative
activations. That gap was sitting in our limitations list as a paragraph of
apology. Implemented sparse non-negative keys instead and measured it.

They match dense to within noise at 5% active and fall apart by 25%. The
explanation is in the overlap statistics: 3-of-64 keys share an active coordinate
only 14% of the time. Disjoint supports give exact orthogonality, which roughly
pays for the loss of sign cancellation. Better outcome than the apology, and it
means we can defend the modelling choice with a table.

### 2026-09-08 — two things the assistant got wrong on the page

Worth recording since the demo will probably attract questions about what the AI
did versus what we did.

1. The hero paragraph claimed the cache costs "twenty times the storage" of the
   matrix. It is 5 KB against 2 KB at those settings, so 2.5×. Caught by reading
   the footprint readout rendered directly underneath the sentence contradicting
   it. Rewritten to state both numbers and make the point about the ratio growing.
2. Control labels are uppercased in CSS, which silently turned the matrix
   dimension `d` into `D` and the decay parameter `λ` into `Λ`. Different symbols.
   Fixed with a `.lit` class that opts those spans out of `text-transform`.

Both were caught by looking at the rendered page rather than by reading the code.

### 2026-09-08 (later) — auditing against the rubric instead of against our taste

Went back to the published criteria and scored ourselves honestly rather than admiring
the thing. Four gaps, three of them real:

1. **The artifact URL was not public.** The submission requires a public URL that opens
   without sign-in and ours was a private share link. Added a GitHub Pages workflow that
   builds `dist/index.html` and deploys it. That also fixes link stability, which is a
   separate scored item, since a Pages URL outlives whatever we happen to be using.
2. **No explicit sixty-second path.** The criteria name a sixty-second test and we were
   relying on the reader inventing one. Added three numbered slider moves at the top that
   reproduce the central claim, with the expected outcome of each stated before you do it.
3. **BDH-CQ was one paragraph.** For a criterion worth ten points that is thin. Built the
   demonstration panel instead (below).
4. **Mobile.** We had written the media queries and never looked. Turned out to be fine —
   no page-level horizontal overflow at any width headless Chromium will render — but the
   first screenshot at 390 px looked catastrophically broken and cost half an hour before
   we worked out the renderer clamps to 477 px and crops the image. Worth writing down so
   nobody re-investigates it.

### 2026-09-08 — accumulation is not only damage

The whole page treated superposition as the failure mode, which is a one-note reading of
the mechanism and left BDH-CQ as a footnote. BDH-CQ's contextual state accumulates
additively per demonstration, so the obvious question is what additive accumulation buys
you rather than what it costs.

Measured it before building anything. Write one association repeatedly with independent
noise on each copy: recall goes 0.232 → 0.804 over sixteen writes with the state size
unchanged, because the signal is identical every time and the noise is not. Write two
different values at one key and the readout is the vote, landing on `a/√(a²+b²)`, which is
exact for orthogonal answers rather than an approximation.

That closed form is now the tightest check in the repository. It is also the reason the
panel exists: you can watch a measurement converge onto an exact prediction, which is a
better argument that the implementation is right than any amount of us saying so.

Two things went wrong building it. The first version used a single seed, so the noisy curve
was jagged enough to read as "nothing is happening" (0.452 at one demonstration, 0.456 at
four) and the vote showed 0.760 against a closed form of 0.707, which looks like the closed
form is wrong. Both were sampling, not error. Averaged the panel over 24 runs and the curve
became monotone and the vote landed on 0.702. The lesson is the same one from 2026-09-07:
if a single run is too noisy to show the effect, showing a single run is a misleading
choice, not an honest one.

To keep the averaged version fast enough for a slider, the distractors are now written
before the demonstrations, which lets one pass produce the whole curve. That is only legal
because Hebbian writes are order-independent — a property we had already proved and tested,
which is the first time one of those tests paid for itself as something other than a check.

### 2026-09-08 — build determinism

Adding CI surfaced a bug that had been sitting there quietly. `scripts/build.js` concatenated
source files verbatim, so the bundle inherited whatever line endings the checkout had: mixed
CRLF on Windows, pure LF on Linux. The CI step that fails when `dist/` has drifted from
`src/` would therefore have failed on every push for a reason that has nothing to do with
the code. Normalised line endings on read; the build is now byte-identical across platforms
and two consecutive builds hash the same.

### Still open

- β for the delta rule is hard-coded to 1 everywhere. There is almost certainly
  something interesting between 0 and 1 and we have not looked.
- Keys are random. Learned keys would be spread deliberately and every number here
  is a random-key baseline.
- No multi-query recall benchmark, which is the task the delta rule is actually
  built for, and the honest place to test it on its own terms.
- The demonstration panel varies noise and count but not the *number of distinct rules*
  being demonstrated at once, which is closer to what an in-context learner actually
  faces.
- Nobody outside the team has sat down with the page yet. The sixty-second path is our
  guess at where a stranger starts, not an observation.
