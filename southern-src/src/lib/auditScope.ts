import type * as T from '../data/types'
/** dive3 M8: who sees which audit rows. Owner: everything. Everyone else: their own role's rows, plus other roles' routine
 *  operational rows — never Owner / HR / Payroll / Accounting / DER rows, and never guest passes, field reveals, denials or sign-ins. */
const PRIVATE_ROLES = new Set(['owner', 'hr', 'payroll', 'accounting', 'der'])
const SENSITIVE = /^(Guest pass|Revealed|Reveal|Denied|Signed in|Signed out|Sign-in|Unlocked|Locked|Branding|Reset|Exported|Payroll|Drug|Alcohol|Reasonable|DER|Clearinghouse|SSN|Bank|HR |Pay rate|Wage)/i
export const auditVisible = (a: Pick<T.AuditEvent, 'role' | 'action'>, me?: string) => me === 'owner' || (a.role === me ? !/^(Guest pass|Revealed)/i.test(a.action) || me === 'hr' || me === 'payroll' : !PRIVATE_ROLES.has(a.role) && !SENSITIVE.test(a.action))
