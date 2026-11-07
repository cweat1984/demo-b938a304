# Recover and build the editable app

This directory is the sanitized Southern Command web/PWA source. It is not the live site. The encrypted owner and guest shells stay at the repository root (`index.html`, `g/`). Do not replace those files from a build, and do not deploy from this tree.

## Build

```bash
cd southern-src
npm ci
npm run dev      # http://localhost:5173
npm run build    # typecheck + vite build into southern-src/dist
npx vite preview --port 4174
```

`npm run build` writes `southern-src/dist` only. It does not touch the encrypted pages at the repo root.

## Guest-pass tests

`src/guest/devkeys.ts` is intentionally blank. The wrapped dev key was removed so a PIN cannot be guessed from this tree. Production guest keys are injected at deploy time with `VITE_GUEST_KEYS` and are not in this repo. Do not paste a real wrapped key back into `devkeys.ts`.

For local end-to-end tests only:

```bash
node scripts/e2e-fixture.mjs          # writes gitignored .e2e-pin and .e2e-keys.json
node scripts/run-batch.mjs            # vite with that fixture, then the saved test list
```

The fixture is a new key wrapped with a synthetic PIN. It is not the production PIN and must not be committed. Tests that need the deploy key file (`guestbuild-e2e.mjs`, `/workspace/pages-build/keys/`) are skipped: that file is not in this handoff.

## What a backup of this tree is

A source archive of `southern-src` (no `node_modules`, no `.e2e-pin`, no `.e2e-keys.json`) plus the git commit that produced it is enough to restore the editable app. The live encrypted site is a separate publication and is not rebuilt from this archive.
