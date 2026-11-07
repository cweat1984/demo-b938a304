# Southern Command deep-dive 3: combined findings

Four testers tried to break the app on Sat Oct 31, 2026 (accounting & sales, field & safety, dispatch, shop/guest/devices). Here is what's worst, what held up, and what's still worth testing on real devices.

## The short version

**Top priority, being fixed first:** anyone with a guest link can open the whole app as Owner, including money, payroll and HR, by moving one piece of the link. Until it ships, it's safest to change the site password after any sensitive demo.

The next worst: shop can release a crane with unfinished critical repairs back to dispatch with one tap; people on a drug/alcohol or post-accident hold can still clock in; private drug test notes show in the shared audit log; the dispatch board lets one crane sit on two jobs; invoices can come out thousands of times too big from a typed decimal; and payroll export can miss whole branches.

What's fine: nothing crashed, no page scrolled sideways on any phone, tablet or screen, guests can't see money through any normal screen, date math across the time change is right, and HR privacy and the pre-trip tag-out chain held up. All blockers and majors are being fixed.

## Totals

| Area | Blockers | Majors | Minors | Total |
|---|---:|---:|---:|---:|
| Shop, guest & devices | 2 | 14 | 13 | 29 |
| Field & safety | 3 | 22 | 19 | 44 |
| Dispatch | 4 | 15 | 10 | 29 |
| Accounting & sales | 3 | 16 | 16 | 35 |
| **All four areas** | **12** | **67** | **58** | **137** |

## Every blocker and major, ranked

Ranked by risk to people, money and live demos. The three evening call-off rows are one bug found by three testers.

| # | Area | Level | Issue | Why it matters | Status |
|---:|---|---|---|---|---|
| 1 | Shop, guest & devices | Blocker | Anyone with a guest link can move one piece of it in the web address and open the whole app as Owner. A website can also do this inside a hidden frame. | Guest links go to prospects. One forwarded link opens every page, including money, payroll and HR. Expiring or revoking the pass doesn't stop it. | **Being fixed first (top priority)** |
| 2 | Shop, guest & devices | Blocker | One tap on Release to service in the equipment drawer closes any open shop work order, even unfinished critical ones. | A crane with a bad swing bearing or a truck with a blown steer tire shows as Available to dispatch. Safety and liability risk. | Being fixed |
| 3 | Field & safety | Blocker | A person on a drug/alcohol or post-accident hold can still clock in. If the hold lands mid-shift, the clock-out button disappears and the clock keeps running. | Someone not cleared for work is on the clock and on the job. | Being fixed |
| 4 | Field & safety | Blocker | After an accident, one negative test clears the hold while the other test is still pending. The message also names the wrong program. | A person could go back to safety-sensitive work before they're cleared. DOT compliance problem. | Being fixed |
| 5 | Field & safety | Blocker | Reasonable-suspicion drug/alcohol notes show up in the shared audit log. | Anyone who can see the audit log reads private testing details. Breaks the federal confidentiality rule (49 CFR 40.321). | Being fixed |
| 6 | Dispatch | Blocker | The dispatch board lets one crane be booked all day on two jobs and calls it fine, while the forecast calls it double-booked. | The same crane gets promised to two customers, and the two screens disagree. | Being fixed |
| 7 | Dispatch | Blocker | Swap crane scrambles the job: trucks removed, busy trailers added, the old crane stays booked, and crew are pulled off other jobs with no notice. | One swap quietly breaks several jobs and people don't know they've been moved. | Being fixed |
| 8 | Dispatch | Blocker | Rescheduling a job leaves the hired outside crane and the trucks on the old dates. | You pay for a hired crane on days the job isn't there, and trucks stay blocked for other jobs. | Being fixed |
| 9 | Accounting & sales | Blocker | The invoice screen drops the decimal point as you type. 1.5 x $5,650.50 becomes an $8.49 million invoice, and Send still works. | A wildly wrong invoice can go to a customer. | Being fixed |
| 10 | Accounting & sales | Blocker | Payroll export only includes the branch the screen happens to be set to, then locks those records. Midland and Kilgore people were left out. | People don't get paid, and the file doesn't say it's one branch only. | Being fixed |
| 11 | Accounting & sales | Blocker | Double-tapping Save quote or Create job makes two copies, and there is no delete. | Duplicate jobs on the board, the second with no crew, and the win rate gets skewed. | Being fixed |
| 12 | Dispatch | Blocker | One date typo (a 2099 end date or a huge rig-up number) freezes the app for 15 to 40 seconds and books the whole fleet for decades. | One slip in a live demo hangs the phone or projector, and the bad job is still there after reload. | Being fixed |
| 13 | Shop, guest & devices | Major | A test switch left in the live build lets a guest make themselves Owner and reload the full company data. | Same hole as the guest link problem, by another route. | Being fixed |
| 14 | Shop, guest & devices | Major | The secret that signs guest passes ships inside the app, so a technical guest can make a 10-year full-access pass. The 4-digit owner PIN can be cracked in a split second. | The promise that guests never see money can't hold until passes are checked on a server. | Being fixed |
| 15 | Shop, guest & devices | Major | The audit log shows owner and HR actions (guest passes created, SSN reveals) to every role. | Front desk or Sales can see which prospects you're talking to and whose SSN was viewed. | Being fixed |
| 16 | Shop, guest & devices | Major | The Show me owner tour in Settings turns any role into Owner. | Anyone signed in gets full Owner access, including SSNs and Reset demo. | Being fixed |
| 17 | Shop, guest & devices | Major | A Critical work order doesn't take the unit out of service. | A crane marked DO NOT RUN stays Available to dispatch. | Being fixed |
| 18 | Shop, guest & devices | Major | Expired annual inspections aren't enforced, even though the page says those cranes are locked out. Passing an annual never updates the date. | A crane past its annual can be dispatched, and a certified crane stays flagged overdue. | Being fixed |
| 19 | Field & safety | Major | A failed crane inspection marks it Out of Service but opens no work order and tells no one, even when it's on a live job. | Dispatch and the shop only find out by noticing the board. | Being fixed |
| 20 | Dispatch | Major | Down cranes can be added as assist cranes with no warning, and an assist crane that breaks down shows no red on its job. | A crane in the shop can end up on a job. | Being fixed |
| 21 | Field & safety | Major | Once 7 toolbox talks are posted, today's daily JSA drops off the crew's phones. | Crews can't find or sign the day's safety plan. | Being fixed |
| 22 | Field & safety | Major | A field injury report doesn't prompt the DER to decide on post-accident testing. | Testing deadlines (2, 8 and 32 hours) can be missed. | Being fixed |
| 23 | Field & safety | Major | An incident can't be changed to Recordable later. | It never reaches the OSHA 300 log and the days-without-incident counter stays wrong. | Being fixed |
| 24 | Field & safety | Major | The OSHA 300 log shows the current year only, with no year picker. | In January you can't pull last year's log for the Feb 1 posting. | Being fixed |
| 25 | Field & safety | Major | The DOT override on a new CDL hire makes them a fully active driver with no restriction, and their pre-employment records don't follow them. | A driver could be dispatched without a Clearinghouse query or negative test on file. | Being fixed |
| 26 | Shop, guest & devices | Major | Rigging checkout doesn't pick a specific sling tag. | An overdue sling can go out as long as the count looks fine. | Being fixed |
| 27 | Field & safety | Major | On iPhone, inspection rows overlap and Pass and Fail sit side by side. | A mis-tap on Fail tags out a crane. | Being fixed |
| 28 | Field & safety | Major | Offline, a Not safe pre-trip says a shop work order was opened when nothing has been sent yet. | The driver thinks the shop knows when it doesn't. | Being fixed |
| 29 | Field & safety | Major | The random drug test selection for a quarter can be run again and again. | It undermines the fairness of the random program if audited. | Being fixed |
| 30 | Accounting & sales | Major | Repricing a quote with the margin slider doesn't change what gets invoiced. | The customer signs a $27,000 proposal and gets invoiced $22,500. | Being fixed |
| 31 | Accounting & sales | Major | Extra cranes added to a quote are free, and the cost is always assumed to be 66% of price. | Quotes undercharge and the margin shown is made up. | Being fixed |
| 32 | Accounting & sales | Major | The Job Builder day rate turns 4,500.50 into $450,050 a day. | A million-dollar quote from one typo. | Being fixed |
| 33 | Accounting & sales | Major | Extras added after invoicing never get billed. Extras added after the customer signed go on the invoice with no warning. | Lost money on one side, a customer dispute on the other. | Being fixed |
| 34 | Accounting & sales | Major | Equipment picked up in the evening bills the customer one extra day (the app uses UTC, not Chicago time). | Overbilling customers. The same bug was found by three testers. | Being fixed |
| 35 | Field & safety | Major | Evening field call-off is dated tomorrow (UTC date). | Adds a billable day. Same root cause as the row above. | Being fixed |
| 36 | Dispatch | Major | Call-off Picked up after 7 PM Central bills an extra day. | Same root cause as the two rows above. | Being fixed |
| 37 | Accounting & sales | Major | An invoice with a credit line can't be sent from the preview and no reason is shown, but the batch button sends it anyway. | Confusing for the clerk, and the two buttons disagree. | Being fixed |
| 38 | Accounting & sales | Major | Invoice lines with no description are silently dropped but still taxed, and the total shown doesn't match the invoice. | The customer is overcharged on tax. | Being fixed |
| 39 | Dispatch | Major | One-tap extras double up on a quick double tap, and you can credit a role the job never had. | Double billing and phantom credits. | Being fixed |
| 40 | Accounting & sales | Major | In bills to pay, a clerk can approve their own $1.9 million bill, and $1,250.00 is rejected as invalid. | No second check on big payments, and normal amounts get refused. | Being fixed |
| 41 | Accounting & sales | Major | Expenses say posted to job cost, but nothing posts. | Job profit looks better than it is. | Being fixed |
| 42 | Accounting & sales | Major | The All Company view for Owner and Accounting falls back to Oklahoma City after a reload. | Revenue, receivables and crane counts quietly show one branch. | Being fixed |
| 43 | Field & safety | Major | Clock-out says the ticket hours are filled in, then saves 0.01 hours. Not fixed since dive 2. | Pay and job cost come out wrong. | Being fixed |
| 44 | Field & safety | Major | Someone removed from a job while clocked in keeps getting charged to the old job. Not fixed since dive 2. | Hours land on the wrong job and nobody is prompted. | Being fixed |
| 45 | Field & safety | Major | Supervisor crew approval shows time from other jobs. | A supervisor can approve hours they didn't oversee. | Being fixed |
| 46 | Field & safety | Major | Entering two weeks' notice locks the worker out of the app immediately. | They can't see their schedule or clock in for their last days. | Being fixed |
| 47 | Field & safety | Major | If someone is separated while clocked in, their clock keeps running. | Paying hours after separation. | Being fixed |
| 48 | Field & safety | Major | Adding time for a past date charges it to today's job. | Hours land on a job the person wasn't on that day. | Being fixed |
| 49 | Field & safety | Major | Time-off requests accept blank and past dates and say Request sent. | Junk requests reach the office. | Being fixed |
| 50 | Field & safety | Major | One mistyped date (2001) drops a hand's lifetime union hours from 4,413 to 44. | Union hours and fringe look wrong to the hand and the hall. | Being fixed |
| 51 | Dispatch | Major | Rescheduling without moving the crew deletes the whole crew and tells no one. | People think they're working when they've been dropped. | Being fixed |
| 52 | Dispatch | Major | Reschedule accepts nonsense dates: a job already underway can have its start moved, and past dates are allowed. | Worked days and signed tickets end up outside the job. | Being fixed |
| 53 | Dispatch | Major | The reschedule clash preview is rough: it ignores time off, trucks, down cranes and awarded jobs. | It says it's clear when it isn't. | Being fixed |
| 54 | Dispatch | Major | The rig editor accepts nonsense (hook ready after the job ends, 1,000 travel days, a 100-year rig-down). | One bad entry blocks a crane for a century. | Being fixed |
| 55 | Dispatch | Major | One tap on X removes an assist crane and its rig plan, with no confirm and no undo. | Easy to lose work by accident, especially on a phone. | Being fixed |
| 56 | Dispatch | Major | Crew aren't told about crane swaps, added or removed cranes, outside hires or breakdowns. The emergency button says Safety is told, but Safety isn't. | People show up to the wrong setup, and Safety is out of the loop. | Being fixed |
| 57 | Dispatch | Major | The crane forecast shows out-of-service cranes as Available. | Sales can promise a crane that's in the shop. | Being fixed |
| 58 | Dispatch | Major | No drive-time check between same-day jobs (Catoosa, OK until noon, then Longview, TX at noon). | Impossible schedules look fine. | Being fixed |
| 59 | Dispatch | Major | Jobs with several cranes still get one operator's worth of crew. | Crew needs are undercounted on big jobs. | Being fixed |
| 60 | Dispatch | Major | A laptop not set to Central time shows the wrong day and wrong times. | Rental or projector laptops and out-of-state crews see the wrong schedule. | Being fixed |
| 61 | Dispatch | Major | Schedule colors: Conflict can be set to green and other categories to red, and colors only save on one browser. | Red stops meaning trouble, and every screen looks different. | Being fixed |
| 62 | Dispatch | Major | Dispatching on phones and tablets is hard: long-press drag only, the first job is below the fold, and the crane column scrolls away. | Lori can't run the board well from a phone. | Being fixed |
| 63 | Shop, guest & devices | Major | Drag-and-drop on the dispatch board breaks on big screens (2560 wide monitors and 4K TVs). | The board doesn't work on the office TV or larger monitors. | Being fixed |
| 64 | Shop, guest & devices | Major | Releasing almost any work order resets the service counters, because new work orders default to Service Plan. | Real maintenance gets pushed out without being done. | Being fixed |
| 65 | Shop, guest & devices | Major | Inventory accepts nonsense quantities (1.5 of an each item, negative checkouts, transfers to the same branch). | Stock counts go wrong and can get stuck broken. | Being fixed |
| 66 | Field & safety | Major | Reset demo leaves drug/alcohol tests and new hires behind. | After a reset, the demo data disagrees with itself. | Being fixed |
| 67 | Field & safety | Major | New hires are linked to employee records by name. | Two people with the same name could get mixed up. | Being fixed |
| 68 | Field & safety | Major | Closing the field ticket sheet doesn't ask before throwing away work. | Hours and a customer signature can be lost with one tap. | Being fixed |
| 69 | Field & safety | Major | A second pre-trip on the same unit the same day is blocked. | After a repair or driver swap, the new driver can't do their pre-trip. | Being fixed |
| 70 | Accounting & sales | Major | You still can't quote a new customer, and the job site isn't tied to the customer. Not fixed since dive 2. | A proposal can go to one customer at another customer's site. | Being fixed |
| 71 | Accounting & sales | Major | Mark lost takes one tap and can't be undone. | A mis-tap drops a $78.9K quote from the pipeline for good. | Being fixed |
| 72 | Accounting & sales | Major | A back swipe or reload in the Job Builder throws away the half-built quote. | Sales loses work on phones, where back swipe is natural. | Being fixed |
| 73 | Accounting & sales | Major | The job profit table hides the job name on phones and tablets. | Rows read only as percentages, so you can't tell which job is losing money. | Being fixed |
| 74 | Accounting & sales | Major | On phones, invoice lines can't be read or removed in the preview. | Invoices can't be checked from a phone. | Being fixed |
| 75 | Accounting & sales | Major | Rebranding stops at the printed invoice and the login page, and paste a website to get the logo doesn't work. | A prospect's demo still shows Southern on the invoice and login. | Being fixed |
| 76 | Shop, guest & devices | Major | Background photos aren't tied to the customer brand. | The last prospect's yard photos show up in the next prospect's demo. | Being fixed |
| 77 | Shop, guest & devices | Major | The background photo prints on every page, and at the lowest setting it makes titles hard to read. | Printouts waste ink, and screens are hard to read. | Being fixed |
| 78 | Shop, guest & devices | Major | On tablets, laptops and projectors, the guest Switch role button is covered by the countdown and can't be tapped. | The main guest feature looks broken in front of a prospect. | Being fixed |
| 79 | Shop, guest & devices | Major | Phone + office demo leaves a guest stuck on a dead-end page. | A prospect hits a wall mid-demo. | Being fixed |

## Minor issues by area

<details><summary>Shop, guest & devices (13)</summary>

- Guests see $0 for labor and parts instead of a dash.
- On iPhone the guest Switch role button squeezes the search box.
- Android Back in the field app skips screens and can land on an old office page.
- Ultrawide monitors get zoomed too far; dispatch shows one row of jobs.
- Office printouts include the morning briefing banner and tabs.
- An out-of-service crane's drawer says sell it.
- On a shared staff device, a guest can read some local data and the background photos.
- Many phone tap targets are still under 44 px.
- The audit page still claims Tamper-evident history.
- Work order due dates can't be edited; labor is only +1 hour at a time.
- On a trimmed link the staff role picker is hidden but still keyboard-reachable (sign-in refuses it).
- Abandoning the tour mid-way leaves the long idle timeout on.
- The guest Show me hint points at the bell, not the Switch role button.

</details>

<details><summary>Field & safety (19)</summary>

- A fast double tap on Clock in opens the clock-out sheet.
- An instant clock-out saves a 0-hour entry.
- Manual time accepts dates as old as 1999.
- Double-clicking Publish makes two JSAs.
- The back-online message reads oddly (2 queued || 1 queued).
- Cert renewal pre-fills a guessed expiry date.
- Behind-the-scenes checks don't stop a held or inactive person being assigned (the screens do).
- Only Recordable incidents need a corrective action before closing.
- The new-incident time goes stale and future times are allowed.
- Incident numbers don't restart each year.
- The receipt sheet has no date field and dates evening receipts tomorrow.
- A laptop set to UTC shows tomorrow's date in the evening.
- New-hire numbers jump (SLH-9054).
- Onboarding is slow (about 3.6 seconds for two hires).
- Union search with only spaces shows 0 locals.
- The sheet Back button is smaller than a comfortable tap target.
- On a 1920 screen the field app is a small phone frame, hard to see on a projector.
- Benefits is one static welcome card, and wrong for union hands.
- Still missing from dive 2: no JSA creation on the phone, Needs Correction tickets can't be edited in the field, and riggers can create tickets.

</details>

<details><summary>Dispatch (10)</summary>

- Truck custom days Save does nothing, with no message, when the dates are backwards.
- Outside-crane hire dates aren't limited to the job; the same vendor crane can be hired twice.
- The dispatch Ask box misroutes some questions.
- Every color change writes an audit row, which can flood the log.
- Overlapping crane hours show amber and aren't counted as conflicts.
- Job Builder extra cranes have no hours picker and aren't noted in the audit line.
- Billing review times have no time zone label.
- Breakdown replace crane / hire outside buttons only open the job.
- Swap crane asks about each permanent crew member in a separate pop-up.
- Open crew slots change their hidden ID on every redraw, a likely cause of flaky drops.

</details>

<details><summary>Accounting & sales (16)</summary>

- Proposal Issued date jumps to tomorrow in the evening (UTC date).
- The customer's past margin hint is made up from the quote's own margin.
- Win rate shows about 100% because the demo has almost no lost quotes.
- A typo in tax % silently becomes No tax; 16% disables Send with no reason.
- Payments accept tiny or negative amounts and dates back to 1999; no month lock.
- Bill amounts accept odd inputs and fractional cents; over $2M warns but still saves.
- Payroll export can run mid-week and lock records with no warning; no regular/overtime columns.
- Accounting sync shows made-up timestamps, the wrong week end and no retry-all.
- A blank start date in the Job Builder shows Invalid Date and still lets you continue.
- Job Builder defaults to Plains Wind / Keenan II even for machine moving.
- The office can't log a forgotten extra on a finished job; the job-cost export lacks an absorbed-cost column.
- Branding edge cases: a white logo gives no colors or message, a misleading contrast badge, no name length limit, Reset has no confirm.
- The default dark theme makes main buttons gray, so they look disabled.
- The Ask box gives wrong or no answers for win rate, backlog, billing review and quote numbers.
- On iPhone, Mark lost sits at the edge of the bottom tab bar.
- A test hook is left in the live build, and Accounting could add extras the screen normally blocks.

</details>

## What held up

- No script errors and no sideways scrolling on any page or device tested, across all four areas.
- Guests can't see money or personal info through any normal screen, the Ask box or exports (sweep across every scope and page).
- Guest links refuse the old Owner tricks from dive 2, side pages are blocked for guests, guests store nothing, and expiry locks within a second.
- A guest session can't wipe a shared staff device's data; the owner PIN unlock works.
- SSN and bank fields and Reset demo are limited to Owner, HR and Payroll across all 13 roles; HR records stay private from 6 non-HR roles.
- The pre-trip tag-out chain works end to end: banner, all six roles notified, survives offline and reload.
- Date math holds: DST change, year-end and leap day are all correct; an overnight shift totals right.
- Reschedule blocks end-before-start and blank dates; double-clicks on reschedule and Emergency create one entry.
- Two open tabs stay in sync; a reload right after Save keeps the change.
- Accounting, Safety and Shop can't reach the dispatch board; Sales can't deep-link into money pages.
- Customer proposal print no longer shows cost or margin; one page with signature lines.
- Payroll export now lists held rows as do not pay; invoice and payment dates use the Chicago date late at night.
- Accounting sync no longer shows Synced while disconnected; expenses use real job numbers.
- Duplicate-name hires no longer freeze; emails and employee numbers are unique.
- Union local search is forgiving (city, county, state, local number) and safe against junk input.
- Call-off is off by default in the field and refuses out-of-order steps.
- Emergency lists affected jobs and Ops has the button; out-of-service trucks need a confirm.
- Field app is full screen on phones, iPads and Android tablets.

## Still missing or worth testing on real devices

- Real-device checks: iPhone notch in landscape, Android pull-to-refresh and Back gesture in the installed app, and real touch-scrolling over crew chips on the dispatch board.
- Dispatch drag-and-drop on the actual office TV or a 2560 monitor, and on a real phone and tablet.
- The field app on real crew phones offline in a yard, then reconnecting.
- Printing from a real office printer (invoice, proposal, shop pages) with a background photo on.
- One conflict engine shared by the board, forecast, pickers and reschedule (cranes, hours, rig days, down units, drive time).
- Server-side guest pass checks and a real staff sign-in, so guest promises hold against technical guests.
- One Chicago-time date helper used everywhere, so evening work isn't dated tomorrow.
- Benefits enrollment and a union-fringe view for union hands.
- Supplemental invoice or credit memo for changes after invoicing.
- Delete/void for quotes and jobs, and undo for Mark lost.

Page: https://cursor.com/canvas/store-ee191005-8171-4f27-b914-4dc928a4f8d8/33501fce-155b-4721-a741-410fca58dac8
