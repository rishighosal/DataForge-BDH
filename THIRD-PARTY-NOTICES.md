# Third-party notices

The MIT licence in [`LICENSE`](LICENSE) covers the original work in this repository:
`src/`, `test/`, `scripts/`, `index.html`, the generated `dist/index.html`, and the
documents under `docs/`.

It does not cover the following, which are referenced or loaded by URL rather than
redistributed here:

| Component | Origin | Licence / status |
|---|---|---|
| Fraunces, Source Sans 3, IBM Plex Mono | Google Fonts, loaded by stylesheet URL | SIL Open Font License 1.1 |
| The Dragon Hatchling (BDH) paper and the BDH-CQ technical report | Pathway and the papers' authors | Cited for educational commentary. Not redistributed. |
| `github.com/pathwaycom/bdh` (reference implementation) | Pathway | MIT. Linked only; no code from it is vendored here. |

No third-party code, data, model weights, or graphics are vendored into this
repository. `package.json` declares no `dependencies` and no `devDependencies`, so
`npm install` has nothing to fetch.
