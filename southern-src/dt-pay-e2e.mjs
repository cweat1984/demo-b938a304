// Double time after N h/day (job rate profile) is applied in the pay calc, never below the assigned rate.
import { build } from 'esbuild'
import fs from 'fs'
const r = await build({ entryPoints: ['src/union/payroll.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/turbine$/ }, () => ({ path: 'turbine', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const countyOfJobTurbine = () => null', loader: 'js' })) } }] })
const f = '/tmp/payroll-test.mjs'; fs.writeFileSync(f, r.outputFiles[0].text)
const P = await import(f + '?' + Date.now())
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const emp = { id: 'e1', first: 'A', last: 'B', craft: 'Rigger', rate: 30 }
const db = { jobs: [{ id: 'j1', siteId: 's1', shift: 'Day' }], sites: [{ id: 's1', city: 'Nowhere', state: 'ZZ' }], equipment: [] }
const T = (id, date, hours, start = '06:00') => ({ id, employeeId: 'e1', jobId: 'j1', date, start, end: '', hours })
const prof = o => ({ j1: { jobId: 'j1', name: 'p', otMult: 1.5, dtMult: 2, custom: [], ...o } })
const sum = (cs, lbl) => cs.flatMap(c => c.lines).filter(l => l.label.startsWith(lbl)).reduce((a, l) => a + l.qty, 0)
const amt = cs => cs.reduce((a, c) => a + c.total, 0)
// no dtAfter → no double time
let c = P.computeEmployee(db, [], prof({}), emp, [T('t1', '2026-10-26', 14)])
ok(sum(c, 'Double time') === 0 && sum(c, 'Straight') === 14, 'no "double time after" set → no double time')
// dtAfter 12: 14 h day → 2 h DT at 2× assigned rate
c = P.computeEmployee(db, [], prof({ dtAfter: 12 }), emp, [T('t1', '2026-10-26', 14)])
ok(sum(c, 'Double time') === 2 && sum(c, 'Straight') === 12, '14 h day with DT after 12 → 12 straight + 2 double')
ok(Math.abs(amt(c) - (12 * 30 + 2 * 60)) < 0.01, `pay = 12×$30 + 2×$60 (${amt(c)})`)
// split day across two entries counts the whole day
c = P.computeEmployee(db, [], prof({ dtAfter: 10 }), emp, [T('t1', '2026-10-26', 6, '06:00'), T('t2', '2026-10-26', 6, '13:00')])
ok(sum(c, 'Double time') === 2, 'split day 6+6 with DT after 10 → 2 h double time')
// dtMult below otMult or junk → never below OT, never below assigned rate
c = P.computeEmployee(db, [], prof({ dtAfter: 8, dtMult: 0.5 }), emp, [T('t1', '2026-10-26', 10)])
const dl = c.flatMap(x => x.lines).find(l => l.label.startsWith('Double time'))
ok(dl && dl.rate >= 30 * 1.5, `bad DT multiplier (0.5) is raised to at least OT (${dl?.rate}/h)`)
ok(c.flatMap(x => x.lines).every(l => l.label.startsWith('Per') || l.rate >= 30), 'every hourly line ≥ assigned rate')
// dtAfter set, dtMult blank → default 2×
c = P.computeEmployee(db, [], prof({ dtAfter: 8, dtMult: undefined }), emp, [T('t1', '2026-10-26', 10)])
ok(c.flatMap(x => x.lines).find(l => l.label.startsWith('Double time'))?.rate === 60, 'blank DT multiplier defaults to 2×')
// DT hours aren't also paid as weekly OT
c = P.computeEmployee(db, [], prof({ dtAfter: 10 }), emp, ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map((d, i) => T('t' + i, d, 12)))
ok(sum(c, 'Double time') === 8 && sum(c, 'Straight') + sum(c, 'Overtime') === 40, `4×12 h with DT after 10 → 8 DT + 40 reg/OT (no double counting)`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED'); process.exit(fails.length ? 1 : 0)
