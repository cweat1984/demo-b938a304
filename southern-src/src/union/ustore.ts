import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RateProfile, UClass } from './payroll'
interface S { profiles: Record<string, RateProfile>; classOv: Record<string, UClass>; setProfile: (p: RateProfile) => void; removeProfile: (jobId: string) => void; setClass: (empId: string, c?: UClass) => void }
export const useUnion = create<S>()(persist(set => ({
  profiles: {}, classOv: {},
  setProfile: p => set(s => ({ profiles: { ...s.profiles, [p.jobId]: p } })),
  removeProfile: id => set(s => { const n = { ...s.profiles }; delete n[id]; return { profiles: n } }),
  setClass: (id, c) => set(s => { const n = { ...s.classOv }; if (c) n[id] = c; else delete n[id]; return { classOv: n } }),
}), { name: 'sc-union' }))
