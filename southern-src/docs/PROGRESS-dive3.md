# dive3 progress (updated 08:10 CDT Oct 31) — single owner: this run
LIVE: 335b9e5 = owner-chosen main password (from SITE_PW_CHOSEN; pw.txt 600, previous random kept in keys/) on build f408fc1 (snap-S1). Verified: previous pw + old keys refused, chosen pw opens owner, /g/ guest links work, live-sec/syscheck/m2/guest-sec/rotate pass.
  e614131 = first (random) rotation, superseded.
  Verified: old password + old main key (query/fragment) refused, new password opens owner, old guest-link file lands on the
  password page (not owner), new guest links go to /g/; live-sec, live-syscheck, live-m2, live-guest-sec pass, 0 page errors.
  Old password kept under pages-build/keys/pw.old-*; new one in pw.txt (600). Check: pages-build/live-rotate.js
  f408fc1 shop-guest-devices (S1 suite green; batch-l rigging message regex updated; batch4 flake re-passed alone).
  0ad749f dispatch part 2; 2255031 field/safety part 3 + dispatch part 1; 3e375a3 field/safety part 2; 75c622e field/safety part 1; a9f4448 acct/sales part 2; 047eded acct/sales part 1; 718d374 security/guest split.
Main password ROTATED ~07:10 (e614131) with Chad's approval. Milestone 3 stays undeployed.

Accounting/sales: DONE (m7 Paychex file + m12 presets are in the undeployed X1 batch).
Field/safety parts 1-3: deployed. Dispatch part 1 (B1-B4, M1-M4): deployed in 2255031.
Suite flakes seen (nav2, guestbuild, batch4) re-pass alone.

DEPLOYED 0ad749f — dispatch part 2, snapshot /tmp/snap-D2 (built FROM the snapshot via /tmp/buildrun-dir.sh /tmp/snap-D2 D2b,
 logs /tmp/buildrun-D2b.out, /tmp/rD2b-*.log). First D2 run: only batch-l F6 + craneday failed (genuine) -> fixed:
  - urgent breakdown / tag-out notice now stays on top (crew notices are written first)  - craneday test: same site (M11 drive rule)
    and only checks the shared crane's items.
 Dispatch part 2 (d3g2-e2e ALL PASS, 5 devices): M5 extras dupe guard, M7 colour rules on the company record + m4 one audit row,
  M8 forecast shows down cranes back-on date, M9 crane remove undo, M10 operator per crane, M11 drive time between same-day jobs,
  M12 tap an open slot + board-first on phones + sticky forecast column, M13 notices use Chicago today, M14 crew told on added crane /
  outside hire, m3 ask answer, m6 audit line, m8 breakdown "Swap crane"/"Hire outside" buttons, m6 Job Builder crane hours.
  Already OK (no change): M6 call-off date, M15 hook-ready + caps, m1 m2 m7 m9 m10.  NOT done: M8 per-phase forecast segments.

DEPLOYED f408fc1 — shop-guest-devices: d3s-e2e.mjs ALL PASS on 5 devices (4180 preview):
  M5 Critical WO tags the unit Out of Service + urgent notice + crew told   M6 new WO defaults to Breakdown; PM release asks for the
  hour meter / odometer and plans the next service from it   M7 crane past its annual: swap/add refused (store + pickers show
  "Annual expired"), red conflict on the board, a passed Crane Annual inspection re-certifies (+365 d).
  d3g2 M14 test now skips expired-annual cranes. TODO before S1 suite: add d3s-e2e to runpar, snapshot S1.
THEN: M9 inventory qty/date validation, M10 rigging tag checkout, M11 per-brand photos, M12 print/overlay, M13 4K zoom -> rem, minors m1-m13.
  Also in app/src (shop): M9 one qtyProblem() rule in checkout/checkin/transfer/draft POs + numeric inputs, due-back >= today,
  transfer defaults to another branch; M10 rigging checkout by tag (pick/auto-pick in-date tags, refuses removed/out/overdue/wrong
  colour, tag recorded on checkout and returned on check-in; tag chips in checkout); M11 photos keyed per customer brand, Remove all,
  toast past 12; M12 photo never prints, overlay min 45 %, header/tabs on a translucent panel; M13+m4 4K scale by root font-size
  (min of w/h), no zoom; m1 guest WO shows "—"; m5 print hides briefing offer + tabs; m6 down crane 30-day strip; m10 WO due date +
  labor hours input. m9/m12 already done. batch-l 4K check accepts rem scaling; inventory-e2e picks a tag.
  d3s-e2e.mjs covers M5-M13; M11-M13 blocks not yet run. Add d3s to runpar, snapshot S1, full suite, deploy.

NOT DEPLOYED — d3x batch, snapshot /tmp/snap-X1 (== app/src at 07:49; app/src unchanged since):
  M8 forecast: segment per rig phase; red only for pairs that really clash (sharedOn per day: hours/phase/drive; awarded overlaps
  still red); down block runs to the shop return date ("back <date>" / "no return date"); "Booked while down" badge + red bar;
  legend adds Moving + Travel; rows/bars carry data-crane / data-job.
  acct m7: Time → "Paychex file" (after export): Hourly / Overtime / Per Diem per worker, period end; client ID is a placeholder
  (DEMO-CLIENT) and pay-component names must be confirmed against the real Paychex company setup.
  acct m12: presets save + restore company name / short / app name + logo (<=250 KB); option badge checks light + dark + field.
  Tests: d3x-e2e.mjs ALL PASS on 5 devices (4180). Added to runpar lane 2 (/tmp/runpar.sh); d3s in lane 1.
  Full suite X1 (/tmp/buildrun-X1.out, /tmp/rX1-*.log, built from snap-X1 into app/dist-next on 4174):
    union-map + nav3 timed out under load -> re-passed alone. nav2 FAILS alone too (twice): page error
    "undefined is not an object (evaluating 'this._ctx.clearRect')" — a Leaflet canvas redraw after the map is removed (WebKit).
    nav2 passed on S1 (f408fc1), so treat as possibly caused by this batch until proven otherwise. Suite finished 08:14: every other
    test passed (union-map, nav3 re-passed alone). NOT green -> not deployed. Previews 4174/4180/4191 stopped (restart:
    cd app && npx vite preview --outDir dist-next --port 4174; 4180 serves /tmp/dist-m2b).
NEXT STEPS:
  1. Diagnose nav2 on snap-X1 (run: cd app; BASE=http://localhost:4174/ node nav2-e2e.mjs after rebuilding dist-next from snap-X1
     with /tmp/buildrun-dir.sh, or 4180 preview). Compare with f408fc1 build; fix (likely guard Leaflet map remove / canvas
     renderer on unmount) or confirm flake, re-run full suite, deploy snap-X1 (or new snapshot), live checks, report hash.
  2. Whole-app regression pass: app/regress-devices.mjs (written, not run): every office page as owner + field app on iPhone 390,
     Pixel 7 412x915, Android tab 800x1280, iPad 820x1180, desktop 1920, 2560 — page errors, sideways overflow, NaN/undefined, renders.
  3. Remaining open: dispatch M8 done in X1; shop minors m2, m3, m7, m8, m11, m13 not done; dive2 items as listed above.
