# Dive 3: hostile test of Shop, IT/Admin, Guest security, Background photos and Devices

**Tester:** shop-guest-devices worker · **When:** Sat Oct 31, 2026, 1:20–2:10 AM CT
**Build:** a source snapshot taken at 1:20 AM CT, built in `/tmp/d3sgd`. Nothing in `app/src`, `dist` or `deploy.sh` was touched.
- **:4333**: the normal PWA build. It uses the local preview guest secret.
- **:4334**: **a replica of the live deploy.** `deploy.sh` was re-run step for step (standalone build, VITE_GUEST_SECRET/VITE_SITE_KEY derivation, StatiCrypt with the same template, salt and `--remember 30`), but with a **made-up password**. This is how I tested the live guest-link attacks without touching the live site. BRIEF.md forbids testing the live GitHub Pages site, so I didn't.
- **:4335**: a fake "attacker" page on another origin, used for the iframe tests.

**Engines:** Playwright Chromium (Chrome/Edge/Android) and WebKit (iPhone/iPad/Mac Safari).
**Secrets:** the site password, the real key and the PIN were never printed or shown in a screenshot. The PIN was typed by script from `.e2e-pin` in two staff-unlock tests only. The fake key and secret live in `/tmp/d3sgd/prod/`.
**Evidence:** `shots/` (119 PNGs) and `scripts/` (one `.mjs` per probe; `lib.mjs` has the helpers). Every finding below says which script reproduces it.

**Counts: 2 Blocker · 14 Major · 13 Minor**

---

## 0. How each area works (as built today)

**Guest passes.**
- Owner → Guest Passes (owner-only, behind a 4-digit PIN) signs `{id, name, expiry, scope show|ops|all}` with HMAC-SHA256.
- The link is `?guest=<token>#staticrypt_pwd=<site key>`. The fragment lets StatiCrypt decrypt the page without the password.
- `GuestLayer` checks the token, removes the token and key from the URL, and signs in as role `guest`. It loads a **fresh seed in memory** (`scrubDb`: no phones or addresses; no rates, bills, time or invoices unless the scope is `all`) and wraps every write: the main store, the side stores and `localStorage`.
- It also sets a "guest device" lock in localStorage plus the `sc_gd` cookie (60 days). That browser then gets no staff role picker until the owner PIN is entered.
- Expiry is checked on load, on every hash change and every second.
- Switch role (`guestSwitch`) changes the menu to another role's pages, limited to what the pass allows. The session stays a guest.

**`?as=` embeds.** These are honored only inside an iframe, and only when the frame is not a guest context. They are used by the Phone + office (`?sync`) demo.

**Side routes** (`?portal ?inspect ?welcome ?status ?sync ?sign ?certs ?recon ?sitedata`) are skipped entirely in a guest context.

**Console hooks.** `__store` and `__actions` are added only in DEV/E2E builds, **or when `?qa` is in the URL**.

**SSN and bank table.** Settings → Security center → "Sensitive fields" is shown only to Owner, HR and Payroll. Reveal is limited to the same roles and is logged.

**Audit log.** `#/audit` and the Security center audit list show the owner everything. Every other role sees everything except entries written by HR, Payroll, Accounting and the DER.

**Shop.**
- Work orders sit in four columns. "New work order" asks for unit, title, priority, source (default **Service Plan**) and tech. The due date is fixed by priority.
- The WO drawer has status buttons, "+1 labor hr", free-text parts with a $ amount, and "Release unit to service" once the WO is Ready for Release.
- The **Equipment drawer** also has "Release to service" for any Out of Service or Maintenance unit.
- `releaseToService` closes the WO, sets the unit to On Job or Available, and resets PM counters when it thinks the WO was a PM.

**Maintenance and annuals.** Annuals read `equipment.annualInspection`, which is now the single source. The Annual inspection checklist exists, but nothing writes that date.

**Inventory and rigging.**
- Checkout is scan → qty → used on → reason → sign.
- A rigging guard blocks checkout only when the quantity is more than on-hand minus removed or overdue tags.
- Transfer and adjust are done from the item drawer. Reorder groups items by vendor and creates draft POs. Receiving can't over-receive.

**Background photos.** Owner → Branding → Background photos.
- Photos are shrunk to ≤1920 px JPEG on the device and stored in IndexedDB `sc-backgrounds` (one store per **browser**). On/off, where (sign-in, app or both), rotation and overlay (20–85 %) are kept in localStorage `sc-bg-v1`.
- `BrandBackground` paints the photo on `body` and excludes the field role and guests.

---

## 1. BLOCKERS

### B1. Anyone with a guest link becomes Owner by moving the key from `#` to `?` (no dev tools needed)
- **Where:** StatiCrypt's engine also accepts the key as a **query parameter** (`staticryptJs.js decryptOnLoadFromUrl`: `?staticrypt_pwd=` and `?remember_me`). `GuestLayer` only checks `location.hash` for the "trimmed link" case (`GuestLayer.tsx:44`).
- **Repro (production replica :4334, fresh or private browser, script `p1.mjs`):**
  1. From the guest link, keep only the key and put it after `?` instead of `#`: `https://…/?staticrypt_pwd=<key>`.
  2. **Actual:** the page decrypts, there is no lock, and the full staff role picker shows. Tap Owner → Receivables shows **$712.8K outstanding**. All 52 owner pages, Payables, Time & Payroll and People are open. Shot `p3-key-in-query-owner-receivables.png`.
  3. Add `&remember_me=1`: StatiCrypt stores the key for 30 days, so later **bare** visits go straight to the role picker (P4b).
  4. **Iframe variant:** a page on any other site frames `…/?as=owner&staticrypt_pwd=<key>`. The frame comes up as Owner Payables (**$172.9K unpaid**, 52 pages; shot `p5-framed-as-owner.png`). The `window.top !== self` check passes, and a fresh or partitioned frame has no guest lock.
- The `#` form is correctly refused ("This link isn't valid", P2).
- **Why blocker:** the key in every guest link is the **permanent site key**. Expiry and revoke don't change it, and a guest can forward it. Any recipient can then open every page as Owner, including money, pay and HR.
- **Fix:**
  - **(a)** In the StatiCrypt template, drop query-string support (accept the fragment only) and wipe the fragment right after decrypting.
  - **(b)** In `GuestLayer`/`Login`, also refuse when `location.search` has `staticrypt_pwd` or `remember_me`.
  - **(c)** Honor `?as=` only when the parent is same-origin and is the `?sync` page: `try { parent.location.search.includes('sync') } catch { deny }`. Add a JS frame-buster for any other cross-origin parent.
  - **(d)** Real fix: the staff role picker should never be reachable with only the key. Require the typed password (or real sign-in) for staff.
  - **(e)** Rotate the site password after any sensitive demo until this ships.

### B2. One tap on "Release to service" in the Equipment drawer clears any open work order, even unfinished critical ones
- **Where:** `EntityDrawer.tsx:241` calls `releaseToService(e.id)` with no WO. The store then closes `open0.slice(0,1)`, whatever its status. There is no confirmation and no check that the work is done.
- **Repro (Shop role, desktop, `s1.mjs`):** open each unit's drawer and tap the green "Release to service" (it sits right next to "Report breakdown"). Shot `s1-unit-release-19.png`.

| Unit | Open WO before | After one tap |
|---|---|---|
| Crane 19 | WO-7302 **Critical, In Progress** "Swing bearing inspection — OUT" | WO closed, crane **Available** |
| Truck T-204 | WO-7304 **Critical, Open** "Steer tire blowout & hub inspection" | WO closed, truck **Available** |
| Crane 44 | WO-7301 **Waiting Parts** "Hydraulic pump replacement" | WO closed, crane **Available** |

- **Why blocker:** a crane with a swing-bearing problem, or a tractor with a blown steer tire, goes back to Dispatch as free. That is a safety and liability risk.
- **Fix:**
  - The unit-drawer button should only appear when at least one WO is "Ready for Release", and should release only that WO.
  - Never auto-close Open, In Progress or Waiting Parts WOs.
  - If any Critical WO is still open, keep the unit Out of Service.
  - Add a confirm sheet ("Release crane 19? WO-7302 will be closed") with the mechanic's name and the hour meter.

---

## 2. MAJOR

**M1. `?qa` turns on the console hooks in production, so a guest can force Owner and reload the full data.**
- **Where:** `store.ts:1053/1057` (`…|| new URLSearchParams(location.search).has('qa')`).
- **Repro (replica :4334, `p2.mjs`):**
  1. Open a guest link.
  2. In the same tab, open `?qa=1#staticrypt_pwd=<key>`. `window.__store` now exists.
  3. In the console, run `__store.setState({session:{…role:'owner'}})`. The guest banner disappears and the user shows as "Pat Tester · Owner / Executive" with **52 pages**.
  4. Run `__store.getState().resetDemo()`. The scrubbed copy is replaced by the full seed: **116 phone numbers, pay rates, 75 bills**.
- **Shots:** `p2-replica-qa-forced-owner-people.png`, `g2-qa-owner-resetdemo-receivables.png`.
- The main DB is still never saved, which is good: the guard checks the guest context. But side stores (for example `sc-rig-v1`) **do** persist, because their guard checks only `session.role === 'guest'`.
- **Fix:**
  - Remove the `?qa` switch from production. Use a separate E2E build flag only.
  - Make `guard.ts isGuest()` and `commit` use `guestContext()`, not `session.role`.
  - `resetDemo` should refuse in a guest context.

**M2. The guest signing secret ships inside the decrypted bundle, so any guest can mint an "all" pass for 10 years. The owner PIN can be cracked offline.**
- **Repro (`p1.mjs` P6):**
  1. Open a real guest link on the replica.
  2. Search the page's scripts for 64-hex strings: 3 candidates, one is the signing secret.
  3. Sign `{s:'all', e: now + 10 years}` with it. The forged pass opens with a guest banner, but Receivables shows **$674.9K** and the countdown runs for 10 years.
- The 30-day cap and the "no money" scope are enforced only in the guest's own browser.
- The PIN gate is a salted SHA-256 of 4 digits. Brute-forcing it from the bundle took **10 ms** (the PIN was not printed).
- These are the documented "honest limits", but they directly defeat Chad's "no money for guests" promise.
- **Fix:**
  - Short term: use a long owner passphrase with PBKDF2 (≥200k iterations) instead of a 4-digit PIN, and say plainly on the Guest Passes page that "a technical guest can see everything".
  - Real fix: verify passes on a tiny server or worker (for example Cloudflare), keep the secret off the client, and serve scoped data from there.

**M3. On tablets, laptops and projectors, the guest "Switch role" chip is under the countdown pill and can't be tapped.**
- **Repro (`g6.mjs`):** open a guest link at any width ≥640 px. `elementFromPoint` at the chip's center, left and right all hit the banner pill.

| Width | Chip tappable? |
|---|---|
| iPad 820 | No |
| Android tablet 1280 | No |
| Windows 1280 / 1366 | No |
| Mac 1440 | No |
| Projector 1920 | No |
| 4K | No |
| Phones | Yes |

- The first-visit hint ("Tap Switch role") points at the bell instead.
- **Shots:** `g6-ipad820-switch-covered.png`, `g6-proj1920-switch-covered.png`, `g0-guest-home.png`.
- Guests can still use the "See the app as…" card on Command, but the main affordance looks broken in front of a prospect.
- **Fix:** on ≥sm, put the countdown in the sidebar footer or the right side of the header. Or give the banner `pointer-events-none` and offset the chip. Point the hint at the chip's real rect.

**M4. "Phone + office demo" leaves a guest stranded.**
- **Repro (`g8.mjs`):**
  1. As a guest on Command, tap "Phone + office demo".
  2. The tab goes to `?sync=1`, which guest contexts block, so it shows "This browser is using a guest pass · Staff sign-in (owner PIN…)".
  3. **Back** returns to the same dead end.
- **Shot:** `g8-guest-phone-office-demo.png`.
- **Fix:** hide the button for guests, or build a guest-safe sync view (both frames as guest views, no `?as=`).

**M5. A Critical work order doesn't take the unit out of service.**
- **Repro (`s1.mjs`):** create a Critical WO on crane 34, "Boom hoist brake slipping — DO NOT RUN" (shot `s1-new-critical-wo.png`). The crane stays **Available** to Dispatch.
- **Fix:** Critical priority (or a "Unit down" toggle) should set the unit Out of Service and send the same tag-out notice the DVIR path uses.

**M6. Releasing any WO with the default source resets the PM counters.**
- **Repro (`s2.mjs` A):**
  1. Create "Replace cracked mirror bracket" with the default source "Service Plan".
  2. Release it.
- **Actual:** next service jumped 12,524 → 12,615 h, and the date jumped Dec 25 → Jan 29, with no PM done and no hour reading taken.
- **Where:**
  - The `releaseToService` PM check counts any `source === 'Service Plan'` WO as a PM.
  - "Service Plan" is the default in New WO (`Shop.tsx:110`).
- **Fix:**
  - Default the source to "Repair" (or blank and required).
  - Treat a WO as a PM only with an explicit `pm: true` / PM type.
  - Ask for the current hours or miles on release, and compute the next service from that reading.

**M7. Expired annual inspections are not enforced, and the page says they are.**
- Crane 14's annual expired **Oct 26, 2026**, but it is **Available**, and releasing a WO on it keeps it Available (`s2.mjs` B, shot `s2-unit14-expired-annual-drawer.png`).
- Maintenance says "N crane(s) past their annual — locked out of dispatch until certified" (`Maintenance.tsx:75`), but no code enforces it: `annualInspection` is only read in three places.
- Submitting an Annual inspection never updates `annualInspection`, so a certified crane stays "overdue".
- **Fix:**
  - Block assignment and release when `annualInspection < today` (allow an Owner override with a reason).
  - On an Annual inspection pass with a cert number, set `annualInspection = date + 1 year`.

**M8. The audit log leaks owner and HR actions to every role.**
- **Repro (`it2.mjs`):**
  1. As Owner, create a guest pass "Dana Fictional · Acme Wind" and reveal one SSN in Security center.
  2. Sign in as **Front desk, Sales, Shop or Inventory** → Settings → Security center.
- **Actual:** they all see `Guest pass created · Dana Fictional · Acme Wind · expires …` (which prospects the owner is talking to) and `Revealed sensitive field · Chad Weathers SSN`.
- **Shots:** `it2-frontdesk-sees-owner-audit.png`, `it2-sales-sees-owner-audit.png`.
- **Where:** the filter in `SecurityCenter.tsx:92` and `Audit.tsx:12` hides only hr, payroll, accounting and der rows. Owner rows are visible to all.
- **Fix:** non-owners see only their own role's rows, plus a public allow-list of operational actions. Never show `Guest pass *`, `Revealed *`, `Denied *` or `Signed in` from other people.

**M9. Inventory quantities and dates are still loose (dive2 M8 said these would be fixed).**
- **UI** (`components/inv/kit.tsx:112`, `ItemDetail.tsx:70`, `Purchasing.tsx:59`):
  - Checkout accepts **1.5 "ea"** (`inputMode="decimal"`).
  - Due back has no minimum, so a date in 2020 is accepted.
  - Transfer accepts decimals and the **same branch**. The modal defaults to Midland even for Midland stock.
  - Reorder qty accepts 0.3 (PO-4104 was created with qty 0.3).
- **Data layer** (`s3.mjs`; matters for import and the future API):
  - `invCheckout` accepts **qty −5 (stock went 40 → 45)**, qty 0, and **NaN (on-hand became NaN and stayed corrupt)**.
  - `invTransfer` accepts 999 (more than on hand) and −3.
  - `invCheckin` accepts −4.
- CSV export *is* safe: a formula-injection name exported as `'=HYPERLINK…`.
- **Fix:** add one `validQty(item, n)` check (positive, finite, integer for "ea", ≤ on-hand) in every inventory action. Require due-back ≥ today, refuse same-branch transfers, and use `step=1 inputMode=numeric` for "ea".

**M10. Rigging checkout still doesn't pick a tag.**
- Purple, green and red slings all checked out without naming a tag (`s3.mjs`). The guard only compares counts (`rigging.ts:75`), so an overdue sling can physically go out as long as an in-date one is counted.
- **Fix:** checkout scans or picks the tag (`RG-xxxx`), refuses overdue, removed or wrong-color tags, and records the tag on the checkout. Check-in returns that tag.

**M11. Background photos are not per customer.**
- **Repro (`bg1.mjs`):**
  1. Import 3 photos.
  2. Change the customer name to "Prairie Crane Rental (fictional)". The card now reads "Background photos · Prairie Crane Rental", but the **previous company's photos** still show.
  3. "Reset to Southern defaults" doesn't clear or switch them either.
- Chad switches prospects between demos, so the last prospect's yard photos would show to the next one.
- The import also stops silently at 12 files (`slice(0,12)`).
- **Fix:** key photos by a brand or customer ID (`{brandId, id}`), and switch or clear them with the brand. Add "Remove all photos", and show a toast when files past 12 are skipped.

**M12. The background photo prints, and a low overlay makes text unreadable.**
- **Print:** with a photo on, print media still paints it. `html[data-bgphoto] body {background-image… !important}` beats the print rule `html, body {background:#fff !important}` on specificity. The printout is a full-page photo. Shot `bg1-print-page-1.png`.
- **Overlay:** at the 20 % minimum, page titles, red alert chips and sub-tabs sit right on the photo and wash out ("2 drivers blocked…" red on light gray). Shot `bg1-command-overlay20.png`. "Cards stay solid" protects cards only.
- **Fix:**
  - Add `@media print { html[data-bgphoto] body { background-image: none !important } }`.
  - Set the overlay minimum to about 45 %, or put page headers and chips on a translucent panel.
  - Run the contrast check (it already exists for brand colors) against the photo's average luminance.

**M13. Dispatch drag-and-drop breaks on screens ≥2400 px (the new 4K `zoom`).**
- `index.css` sets `html { zoom: 1.35 }` at ≥2400 px and `zoom: 2` at ≥3200 px. dnd-kit measures in unzoomed coordinates.
- **Repro (`dv4.mjs`):** drag pool person Seth S. onto job #10071.
  - 1920: the assign dialog opens for **#10071**, as it should.
  - 2560 (zoom 1.35) and 3840 (zoom 2): **nothing happens**. No drag overlay appears near the pointer (shot `dv4-zoomdrag-3840.png`).
- In another 4K run the drop was attributed to **#10131**, a job not under the pointer (`dv2.mjs`).
- This hits 4K TVs and also ordinary 2560×1440 monitors at 100 %.
- **Fix:** apply the 4K scale with `font-size`/rem on the root instead of `zoom` (or turn the zoom off on Dispatch), or pass dnd-kit a zoom-aware measuring config and modifiers. Re-test drag and Leaflet popups at 2560 and 3840.

**M14. "Show me — owner tour" in Settings turns any role into Owner.**
- **Repro (`it3.mjs`):** sign in as Front desk or Shop → Settings → "Show me — owner tour". The session role becomes **owner**, with SSN reveal, Reset demo and all 52 pages.
- **Where:** `tour.ts:33` (`if (role !== 'owner') signIn('owner')`).
- The tour also raises the idle timeout to 480 min and only puts it back on `endTour`.
- This doesn't matter much while the demo picker is open, but it will when Arrowline gets real sign-in.
- **Fix:** show the tour button to Owner only (or run the tour in a sandboxed demo session), and restore the timeout on unload.

---

## 3. MINOR
- **m1.** The guest WO drawer shows **"$0"** for labor and parts. The guest copy zeroes the values but still formats them. Show "—" for guests (`g3.mjs`; ops scope, every view on `#/shop`).
- **m2.** iPhone guest header: the 117 px Switch role chip squeezes search to "Ask or sea…" (`g4-iphone-guest-home.png`).
- **m3.** Android/iOS Back in the field app (Pixel 7):
  - Ticket → Back goes to **Job**, skipping Time.
  - The 2nd Back leaves an empty URL entry.
  - The 3rd Back lands on the previous session's `#/dispatch` URL while still in the field app (`dv5.mjs`).
- **m4.** A 3440×1440 ultrawide gets `zoom: 2`, so only 720 CSS px of height; Dispatch shows one row of jobs (`dv1-uw3440-dispatch.png`). Base the zoom on `min(width/1920, height/1080)`.
- **m5.** Office printouts still include the "Your morning briefing is ready" banner and sub-nav tabs. Shop prints 2 pages (`dv2-print-shop-1.png`).
- **m6.** The Equipment drawer for an Out of Service crane shows "0 booked · 30 open — **sell it**" with 29 white "Available" days (`s1-unit-release-19.png`).
- **m7.** On a shared staff device, a guest can still read that browser's side-store data (rigging, permits) and the company's background photos from IndexedDB (`bg1.mjs`: 3 photos readable from the guest tab). Clear or partition them for guest sessions.
- **m8.** Phones still have many targets under 44 px, mostly chips, segmented buttons and row links. iPhone: Equipment 27/35, Maintenance 11/16, Settings 21/27 (`dv1.log`). The hamburger itself is now 44×44.
- **m9.** The Audit page still says "Tamper-evident history" (`Audit.tsx:19`).
- **m10.** WO due dates can't be edited (the drawer has no date input); labor is only "+1 labor hr".
- **m11.** On a trimmed link, the lock overlay covers the staff role picker, but the picker is still rendered underneath and keyboard-focusable. `signIn` refuses, so this is defense in depth only.
- **m12.** If the tour is abandoned mid-way, the 480-min idle timeout persists.
- **m13.** The guest "Show me" hint on ≥sm points at the bell, not the chip (cosmetic part of M3).

---

## 4. Verified fixed since dive2 (attacked, held)
- **Guest `?as=owner` in the same tab, a new tab or after expiry:** all refused ("This browser is using a guest pass") (`g1.mjs`).
- **Side routes:** all nine are blocked for a guest browser: `?inspect ?welcome ?status ?portal ?sync ?sign ?certs ?recon ?sitedata`.
- **Guest storage:** a guest browser stores **nothing** in IndexedDB (only `sc-guest-device` and `sc-nav-v1`).
- **Shared device:** after a guest session, *including* a `?qa` forced-owner "wipe" attempt, the staff DB was intact (75 bills, 386 time, 25 invoices, staff marker WO present). The owner-PIN staff unlock works (`g7.mjs`).
- **Lock persistence:** deleting the localStorage lock alone doesn't help; the cookie keeps the lock. Clearing site data does remove it, which is expected.
- **Guest money sweep:** across every scope × Switch-role view × allowed page × first drawer, the only hits were "$0" (m1) and the word "profit" in the inventory guide (`g3.mjs`).
- **Ask/⌘K:** 19 money and PII questions per scope gave no $, phones or rates. The inventory CSV for guests has no cost columns (`g5.mjs`).
- **Expiry:** locks within a second on iPhone; the iPhone Switch role chip and sheet work, as does Switch role from the field app's More tab (`g4.mjs`).
- **SSN/bank table and Reset demo:** shown to Owner, HR and Payroll only, checked across all 13 roles (`it1.mjs`).
- **Release on a crane that's on a live job:** stays **On Job** (crane 70 on #10131); unrelated WOs stay open.
- **Devices:**
  - Field app is now full screen on iPad (820×1180, 1180×820), Android tablets (800×1280, 1280×800) and landscape phones.
  - 0 px horizontal overflow on all 14 profiles × 10 pages.
  - Hamburger is 44×44; no input under 16 px on touch devices; `overscroll-behavior-y: none` on `<html>`; landscape chrome 11–13 % of the height.
  - Dispatch uses a mouse-only pointer sensor plus a 350 ms touch long-press, and chips are `touch-action: manipulation`. Emulated swipe gestures didn't scroll even off-chip, so this needs a real-device check.

## 5. Device matrix (this run)
| Profile | Office pages | Field app | Notes |
|---|---|---|---|
| iPhone 14 (WebKit 390×664) | ✅ | ✅ full | m2, m8 |
| iPhone 14 landscape | ✅ | ✅ full (750×340) | — |
| iPad 820×1180 / 1180×820 | ✅ | ✅ full | M3 guest chip covered |
| Mac Safari 1440 | ✅ | preview frame (by design) | M3 |
| Windows Chrome/Edge 1366 / 1920 | ✅ | preview frame | M3 |
| Pixel 7 412×915 / landscape | ✅ | ✅ full | m3 Back |
| Android tablet 800×1280 / 1280×800 | ✅ | ✅ full | M3 |
| 2560 monitor / 3440 ultrawide / 4K TV | ✅ scaled | preview | **M13 drag broken**, m4 |
| Print (Chromium PDF) | content prints | — | M12 photo prints, m5 |
| Real device still needed | iOS notch landscape, Android pull-to-refresh and Back gesture in the installed PWA, real touch-scroll over crew chips | | |

## 6. Top fixes, ranked
1. **B1:** close the `?staticrypt_pwd=` query and iframe `?as=` path, and keep the staff picker behind a typed password. Rotate the site password now.
2. **B2:** the unit-drawer Release must not close unfinished or critical WOs; add a confirm step.
3. **M1:** remove `?qa` hooks from production builds; make guest guards use `guestContext()`.
4. **M5 + M7:** Critical WOs and expired annuals take units out of Dispatch; an Annual inspection pass updates the date.
5. **M8:** audit-log scoping (owner and sensitive rows are owner-only).
6. **M3 + M4:** make the guest Switch role chip tappable on tablets and desktop; fix or hide "Phone + office demo" for guests.
7. **M13:** replace the 4K `zoom` with rem scaling so Dispatch drag works on TVs and 1440p monitors.
8. **M6:** a real PM flag plus an hour-meter reading on release.
9. **M11 + M12:** per-customer background photos, a print rule and a higher overlay minimum.
10. **M9 + M10 + M14 + M2:** inventory quantity validation, tag-based rigging checkout, an owner-only tour, and a stronger PIN or server-side pass check.
