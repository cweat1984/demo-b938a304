import type * as T from '../data/types'
import { byId, fullName } from '../data/logic'
export { downloadCsv } from '../lib/util'
export const fullNameSafe = (db: T.DB, id: string) => fullName(byId(db.employees, id))
