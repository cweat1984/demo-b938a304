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

## Publishing without exposing this directory

`robots.txt` does not hide files. GitHub Pages serves whatever the build copies.

The repository root has `_config.yml` and must not contain `.nojekyll`. With that, Pages runs Jekyll and the `exclude` list drops `southern-src` (source, tests, and unencrypted demo data). The encrypted shells (`index.html`, `g/index.html`, and the public images) are copied unchanged. Adding `.nojekyll` again would publish the whole git tree, including this directory.

Check, from the repository root (needs the `jekyll` command, does not deploy):

```bash
node southern-src/scripts/check-pages-publish.mjs
```

`guestbuild-e2e.mjs` stays skipped here. It needs the deploy key file and the prebuilt guest money dataset. A synthetic PIN can sign a pass, but it is not that package, and live keys are not copied into this tree.

## Isolated preview build (not the live site)

There is no authenticated external host in this workspace. Do not put this build on the public GitHub Pages origin: that origin is the live demo, and a subpath would share its browser storage.

```bash
cd southern-src
VITE_PREVIEW_ISOLATE=1 npm run build
```

`VITE_PREVIEW_ISOLATE=1` prefixes this build's `sc-` storage and IndexedDB names with `sc-preview-`. It does not set test hooks (`VITE_E2E` stays off). Guest signing keys stay blank, so guest-pass minting fails closed. No site password or PIN is embedded.

Hand `dist/` to the existing coordinator encrypt step (`/workspace/pages-build` on that computer). Encrypt with a new preview password there. Host the ciphertext on a different origin from `https://cweat1984.github.io/demo-b938a304/`. Do not commit `dist/` and do not copy it over the live `index.html`.

Roster Undo/Redo is phase one only: dispatch assign, move, replace crew, and take someone off a job. History is in memory, at most 30 steps, named, and scoped to the current sign-in (role, person, and signed-in time). It is cleared on sign-in, sign-out, guest switch, demo reset, and when another tab replaces the database. Guests get no undo bar and no history. It is not written to localStorage. A new edit drops the redo stack. Undo refuses a step when that assignment changed since, or the person is on a safety hold or inactive. It never deletes audit lines and does not undo payments, bill payments, job delete, crane restore, quote-lost, extra rows, crane swap, accident holds, drug-test clearance, signed JSAs, approved or released financial or safety actions, or sent messages.

Keyboard: Windows Ctrl+Z undo, Ctrl+Y and Ctrl+Shift+Z redo; Mac Cmd+Z undo and Cmd+Shift+Z redo. Those shortcuts are ignored while typing in a field, a contenteditable region, or a dialog, and while an IME composition or a key repeat is in progress. Phones and tablets get 44px Undo, Redo, and a shortcut-help button.

An edit is also copied to `sc-db-pending` with a `savedRev` so an immediate reload can keep it if IndexedDB has not finished. Reset demo clears that pending copy. Guest tabs do not write it.
