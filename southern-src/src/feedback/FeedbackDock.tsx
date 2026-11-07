import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { NotebookPen, Lightbulb, Download, Camera, ImagePlus, X, Bug, Heart, ThumbsDown, Sparkles } from 'lucide-react'
import { useStore } from '../data/store'
import { PAGES } from '../data/roles'
import { useFeedback, fb, exportNotes, type Suggestion } from '../data/feedback'
import { Sheet, Modal, Button, Segmented, Field } from '../components/ui'
import { cn, chiDate } from '../lib/util'

export const pageLabel = (k: string) => k === '_app' ? 'Whole app' : k === 'field' ? 'Field app' : PAGES.find(p => p.key === k)?.label ?? k

function download(name: string, text: string, type: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}
export async function exportAllNotes() {
  const { md, json } = exportNotes()
  const stamp = chiDate()
  download(`design-notes-${stamp}.md`, md + '\n\n---\n\n```json\n' + json + '\n```\n', 'text/markdown')
  download(`design-notes-${stamp}.json`, json, 'application/json')
  try { await navigator.clipboard.writeText(md) ; toast.success('Notes exported', { description: 'Downloaded .md + .json and copied to clipboard' }) } catch { toast.success('Notes exported', { description: 'Downloaded .md + .json (clipboard not available here)' }) }
}

export async function captureScreen(): Promise<string | null> {
  try {
    const { default: h2c } = await import('html2canvas-pro')
    const canvas = await h2c(document.body, { scale: Math.min(1, 1200 / window.innerWidth), logging: false, useCORS: true, ignoreElements: el => el.hasAttribute?.('data-feedback-ui'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#111' })
    return canvas.toDataURL('image/jpeg', 0.6)
  } catch (e) { console.error("capture failed", e); return null }
}

export default function FeedbackDock() {
  const session = useStore(s => s.session)
  const ui = useStore(s => s.ui.page)
  const page = session?.role === 'field' ? 'field' : ui
  const design = useFeedback(s => s.designMode)
  const inbox = useFeedback(s => s.inbox)
  const [notes, setNotes] = useState(false)
  const [sug, setSug] = useState<{ shot: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dockOpen, setDockOpen] = useState(false)
  const [dockY, setDockY] = useState(() => Number(localStorage.getItem('sc-fbdock-y')) || 72)
  const dragged = useRef(false)
  const drag = useRef<{ y0: number; p0: number; moved: boolean } | null>(null)
  useEffect(() => { if (!dockOpen) return; const t = setTimeout(() => setDockOpen(false), 6000); return () => clearTimeout(t) }, [dockOpen])
  useEffect(() => {
    const mine = inbox.filter(i => !i.read && i.to === session?.name)
    if (mine.length) { mine.forEach(i => toast.success(i.title, { description: i.body, duration: 8000 })); fb.readInbox(session!.name) }
  }, [inbox, session])
  const open = async () => { setBusy(true); const shot = await captureScreen(); setBusy(false); setSug({ shot }) }
  if (!session) return null
  return (
    <>
      <div data-feedback-ui data-testid="fb-dock" style={{ ['--fby' as string]: `${dockY}%` }} className="fixed right-0 top-[var(--fby)] md:top-1/2 -translate-y-1/2 z-[45] flex flex-col gap-1.5 md:gap-2 items-end">
        {/* phones: a slim drag handle — drag up/down to move it out of the way, tap to open the notepad + idea buttons */}
        <button data-testid="fb-handle" aria-label={dockOpen ? 'Hide feedback buttons' : 'Show feedback buttons (drag to move)'} aria-expanded={dockOpen}
          onPointerDown={e => { drag.current = { y0: e.clientY, p0: dockY, moved: false }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
          onPointerMove={e => { const d = drag.current; if (!d) return; const dy = e.clientY - d.y0; if (Math.abs(dy) > 6) d.moved = true; if (d.moved) setDockY(Math.min(88, Math.max(14, d.p0 + dy / window.innerHeight * 100))) }}
          onPointerUp={() => { const d = drag.current; drag.current = null; dragged.current = !!d?.moved; if (d?.moved) localStorage.setItem('sc-fbdock-y', String(Math.round(dockY))) }}
          onClick={() => { if (dragged.current) { dragged.current = false; return } setDockOpen(o => !o) }}
          className={cn('md:hidden h-14 w-4 rounded-l-xl grid place-items-center shadow-lg touch-none transition-colors', dockOpen ? 'bg-ink/80' : 'bg-accent/75')}>
          <span className="flex flex-col gap-[3px]">{[0, 1, 2].map(i => <span key={i} className="block size-[3px] rounded-full bg-white/90" />)}</span>
        </button>
        <div className={cn('flex-col gap-1.5 md:gap-2 items-end', dockOpen ? 'flex' : 'hidden md:flex')}>
        {design && <button onClick={() => { setNotes(true); setDockOpen(false) }} data-testid="notepad-btn" aria-label="Design notepad" title="Design notepad — Love it / Hate it / Ideas" className="h-10 w-9 md:h-11 md:w-9 hover:w-11 transition-all rounded-l-2xl bg-warn text-black grid place-items-center shadow-lg"><NotebookPen className="size-4.5" /></button>}
        <button onClick={() => { setDockOpen(false); open() }} disabled={busy} data-testid="suggest-btn" aria-label="Suggest" title="Suggest an idea or report a bug" className="h-10 w-9 md:h-11 md:w-9 hover:w-11 transition-all rounded-l-2xl bg-accent text-accent-ink grid place-items-center shadow-lg">{busy ? <Camera className="size-4 animate-pulse" /> : <Lightbulb className="size-4.5" />}</button>
        </div>
      </div>
      <Notepad open={notes} onClose={() => setNotes(false)} page={page} />
      <SuggestForm open={!!sug} shot={sug?.shot ?? null} page={page} onClose={() => setSug(null)} />
    </>
  )
}

function Notepad({ open, onClose, page }: { open: boolean; onClose: () => void; page: string }) {
  const [scope, setScope] = useState<'page' | 'app'>('page')
  const key = scope === 'app' ? '_app' : page
  const n = useFeedback(s => s.notes[key]) ?? { love: '', hate: '', ideas: '' }
  const count = useFeedback(s => Object.values(s.notes).filter(x => x.love || x.hate || x.ideas).length)
  const box = (k: 'love' | 'hate' | 'ideas', label: string, icon: React.ReactNode, tone: string) => (
    <Field label={label}><div className="relative"><span className={cn('absolute left-3 top-3', tone)}>{icon}</span><textarea data-testid={`note-${k}`} className="input !pl-9 min-h-[96px]" value={n[k]} onChange={e => fb.setNote(key, { [k]: e.target.value })} placeholder={k === 'love' ? 'What feels right…' : k === 'hate' ? 'What bugs you…' : 'What if it…'} /></div></Field>
  )
  return (
    <Sheet open={open} onClose={onClose} title="Design notepad" sub={`${pageLabel(key)} · autosaves`} width={440} z={80}>
      <div data-feedback-ui className="flex flex-col gap-3" data-testid="notepad">
        <Segmented value={scope} onChange={setScope} options={[{ value: 'page', label: `This page · ${pageLabel(page)}` }, { value: 'app', label: 'Whole app' }]} />
        {box('love', 'Love it', <Heart className="size-4" />, 'text-ok')}
        {box('hate', 'Hate it', <ThumbsDown className="size-4" />, 'text-bad')}
        {box('ideas', 'Ideas', <Sparkles className="size-4" />, 'text-accent')}
        <div className="text-[11px] text-muted">{n.updated ? `Saved ${new Date(n.updated).toLocaleTimeString()}` : 'Start typing — saved on this device'} · {count} page{count === 1 ? '' : 's'} with notes</div>
        <Button variant="primary" icon={<Download className="size-4" />} onClick={exportAllNotes} data-testid="export-notes">Export all notes</Button>
        <div className="text-[11px] text-muted">Downloads Markdown + JSON and copies the Markdown so you can paste it to the builder. Turn this off in Settings → Design mode.</div>
      </div>
    </Sheet>
  )
}

export function SuggestForm({ open, onClose, page, shot }: { open: boolean; onClose: () => void; page: string; shot: string | null }) {
  const [kind, setKind] = useState<Suggestion['kind']>('Idea')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [img, setImg] = useState<string | null>(null)
  const go = useStore(s => s.go)
  const role = useStore(s => s.session?.role)
  useEffect(() => { if (open) { setImg(shot); setTitle(''); setDetails(''); setKind('Idea') } }, [open, shot])
  const onFile = (f?: File) => { if (!f) return; const r = new FileReader(); r.onload = () => setImg(String(r.result)); r.readAsDataURL(f) }
  const submit = () => {
    fb.add({ kind, title: title.trim(), details: details.trim(), page, screenshot: img ?? undefined })
    onClose()
    toast.success(kind === 'Bug' ? 'Bug reported — thank you' : 'Idea sent — thank you', { description: 'You’ll get a notification when it ships.', action: role !== 'field' ? { label: 'View board', onClick: () => go('suggest') } : undefined })
  }
  return (
    <Modal open={open} onClose={onClose} title="Suggest" sub={`From: ${pageLabel(page)} (captured automatically)`} width={520} z={80}>
      <div data-feedback-ui className="flex flex-col gap-3" data-testid="suggest-form">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'Idea', label: <span className="flex items-center gap-1.5"><Lightbulb className="size-4" />Idea</span> }, { value: 'Bug', label: <span className="flex items-center gap-1.5"><Bug className="size-4" />Bug</span> }]} />
        <Field label="Title"><input className="input" data-testid="sug-title" value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'Bug' ? 'What went wrong?' : 'What would make this better?'} /></Field>
        <Field label="Details"><textarea className="input min-h-[90px]" data-testid="sug-details" value={details} onChange={e => setDetails(e.target.value)} placeholder="Steps, who it helps, how often…" /></Field>
        <div className="card-flat p-3">
          <div className="label mb-2">Screenshot (optional)</div>
          {img ? <div className="relative"><img src={img} alt="Screenshot" className="rounded-xl w-full max-h-52 object-cover object-top border hairline" data-testid="sug-shot" /><button onClick={() => setImg(null)} className="absolute top-2 right-2 size-8 rounded-full bg-black/60 text-white grid place-items-center" aria-label="Remove screenshot"><X className="size-4" /></button></div> : <div className="text-sm text-muted">No screenshot attached.</div>}
          <label className="mt-2 h-10 rounded-xl bg-surface-3 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"><ImagePlus className="size-4" />Upload file or photo<input type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} /></label>
        </div>
        <Button variant="primary" size="lg" disabled={!title.trim()} onClick={submit} data-testid="sug-submit">Send</Button>
      </div>
    </Modal>
  )
}
