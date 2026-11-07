import { useState } from 'react'
import { useStore } from '../data/store'
import { fullName } from '../data/logic'
import { PageHeader } from '../components/ui'
import { MyInfoForm } from '../components/MyInfo'
import { MyCertsPanel } from '../components/CertSend'

import MyCards from '../gapA/MyCards'
import MyUnionHistory from '../portal/MyUnionHistory'

export default function MyInfo() {
  const db = useStore(s => s.db)
  const session = useStore(s => s.session!)
  const me = db.employees.find(e => fullName(e) === session.name)
  const [pick, setPick] = useState(me?.id ?? '')
  const id = me?.id ?? pick
  return (
    <div className="max-w-[760px] mx-auto">
      <PageHeader eyebrow="Self-service" title="My Info" sub="Your certs, emergency contacts, address, phone and swag sizes. Changes go to HR automatically." />
      {!me && <label className="block mb-6"><span className="label">No employee record for {session.name} — edit for</span><select className="input" value={pick} onChange={e => setPick(e.target.value)}><option value="">Pick an employee…</option>{db.employees.filter(e => e.status === 'Active').map(e => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</select></label>}
      {id && <div className="card p-5 mb-8"><div className="display text-lg font-semibold mb-3">My certs</div><MyCertsPanel key={'c' + id} empId={id} /></div>}
      {id && <div className="card p-5 mb-8"><div className="display text-lg font-semibold mb-3">My cards</div><MyCards empId={id} /></div>}
      {(session.employeeId ?? me?.id) && <div className="card p-4 sm:p-5 mb-8" id="union-history"><MyUnionHistory key={'u' + (session.employeeId ?? me?.id)} empId={(session.employeeId ?? me?.id)!} mine /></div>}
      {id && <MyInfoForm key={id} empId={id} />}
    </div>
  )
}
