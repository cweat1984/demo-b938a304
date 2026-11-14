import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAILY_RULE_ID, DEFAULT_PAY_RULES, WEEKLY_RULE_ID, dtContext, ensurePayRules, ruleFor, splitEntries, sumSlices, wagesOf } from './payRules.ts'

const weekly = DEFAULT_PAY_RULES[0]
const daily = DEFAULT_PAY_RULES[1]
const T = (id: string, date: string, hours: number, jobId = 'j1', start = '06:00') => ({ id, employeeId: 'e1', date, hours, jobId, start })
const db = {
  jobs: [{ id: 'j1', siteId: 's1' }, { id: 'j2', siteId: 's2' }],
  sites: [{ id: 's1' }, { id: 's2', dtAfter: 12 }],
}
const sum = (rows: ReturnType<typeof T>[], rule = daily, extra?: typeof db) => sumSlices([...splitEntries(rows, rule, e => dtContext(extra ?? db, e.jobId)).values()])

test('an 8-hour day worker: 10 Wednesday, 6 Saturday, 4 Sunday', () => {
  const s = sum([
    T('w', '2026-10-28', 10),
    T('sa', '2026-10-31', 6),
    T('su', '2026-11-01', 4),
  ])
  assert.deepEqual({ reg: s.reg, ot: s.ot, dt: s.dt }, { reg: 8, ot: 8, dt: 4 })
  assert.equal(s.reg + s.ot + s.dt, 20)
  assert.equal(wagesOf(30, s), 8 * 30 + 8 * 45 + 4 * 60)
})

test('a 40-hour week worker does not pay daily overtime', () => {
  const one = sum([T('w', '2026-10-28', 10)], weekly)
  assert.deepEqual({ reg: one.reg, ot: one.ot, dt: one.dt }, { reg: 10, ot: 0, dt: 0 })
  const week = sum(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'].map((d, i) => T('d' + i, d, 10)), weekly)
  assert.deepEqual({ reg: week.reg, ot: week.ot, dt: week.dt }, { reg: 40, ot: 10, dt: 0 })
  assert.equal(wagesOf(20, week), 40 * 20 + 10 * 30)
})

test('a site pays double time after 12 hours, and those hours are not also overtime', () => {
  const s = sum([T('a', '2026-10-28', 14, 'j2')], weekly)
  assert.deepEqual({ reg: s.reg, ot: s.ot, dt: s.dt }, { reg: 12, ot: 0, dt: 2 })
  assert.equal(s.reg + s.ot + s.dt, 14)
  assert.equal(wagesOf(30, s), 12 * 30 + 2 * 60)
})

test('a week can mix a plain site and a double-time site', () => {
  const rows = [
    ...['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map((d, i) => T('a' + i, d, 10, 'j1')),
    T('fri', '2026-10-30', 14, 'j2'),
  ]
  const s = sum(rows, weekly)
  // 40 straight on site A, then Friday is already past 40: 12 overtime and 2 double time
  assert.deepEqual({ reg: s.reg, ot: s.ot, dt: s.dt }, { reg: 40, ot: 12, dt: 2 })
  assert.equal(s.reg + s.ot + s.dt, 54)
  const dailyMix = sum([T('am', '2026-10-28', 10, 'j1', '06:00'), T('pm', '2026-10-28', 6, 'j2', '16:00')], daily)
  // Site A: 8 straight + 2 overtime. Site B's own 6 hours are overtime (the day is already past 8) and not double time (the site has not reached 12).
  assert.deepEqual({ reg: dailyMix.reg, ot: dailyMix.ot, dt: dailyMix.dt }, { reg: 8, ot: 8, dt: 0 })
  const onSite = sum([T('long', '2026-10-28', 14, 'j2')], daily)
  assert.deepEqual({ reg: onSite.reg, ot: onSite.ot, dt: onSite.dt }, { reg: 8, ot: 4, dt: 2 })
})

test('a daylight-saving night uses the date on the entry', () => {
  // Fall back, 2026-10-31: a clocked 9-hour night kept on Saturday is all Saturday overtime.
  const kept = sum([T('night', '2026-10-31', 9)], daily)
  assert.deepEqual({ reg: kept.reg, ot: kept.ot, dt: kept.dt }, { reg: 0, ot: 9, dt: 0 })
  // The same night split at midnight: 2 Saturday overtime and 7 Sunday double time.
  const split = sum([T('head', '2026-10-31', 2, 'j1', '22:00'), T('tail', '2026-11-01', 7, 'j1', '00:00')], daily)
  assert.deepEqual({ reg: split.reg, ot: split.ot, dt: split.dt }, { reg: 0, ot: 2, dt: 7 })
  // Weekly worker: the unsplit Saturday night stays in that week, not Sunday double time.
  const weeklyNight = sum([T('night', '2026-10-31', 9)], weekly)
  assert.equal(weeklyNight.dt, 0)
  assert.equal(weeklyNight.reg, 9)
})

test('people without a rule are weekly, and the defaults stay in the table', () => {
  const db = ensurePayRules({ employees: [{ payRuleId: undefined as string | undefined }, { payRuleId: DAILY_RULE_ID }], payRules: [] as { id: string; name: string; kind: 'weekly' | 'daily'; otAfter: number; otMult: number; satMult: number; sunMult: number; dtMult: number }[] })
  assert.equal(db.employees[0].payRuleId, WEEKLY_RULE_ID)
  assert.equal(db.employees[1].payRuleId, DAILY_RULE_ID)
  assert.equal(ruleFor(db.payRules!, db.employees[0]).kind, 'weekly')
  assert.ok(db.payRules!.some(r => r.id === DAILY_RULE_ID))
})
