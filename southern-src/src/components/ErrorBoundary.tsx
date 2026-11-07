import { Component, type ReactNode } from 'react'
import { resetSection } from '../lib/storageGuard'

/** Catches a crash in one section (or the whole app) and offers to reset just that section's saved data on this device. */
export class ErrorBoundary extends Component<{ children: ReactNode; section?: string; label?: string }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { console.warn('[section crash]', this.props.section ?? 'app', err?.message) }
  render() {
    if (!this.state.err) return this.props.children
    const whole = !this.props.section
    return <div className="max-w-md mx-auto mt-16 text-center rounded-3xl border hairline bg-surface p-8" data-testid="section-crash" data-section={this.props.section ?? 'app'} style={whole ? { margin: '64px auto', fontFamily: 'system-ui, sans-serif' } : undefined}>
      <div className="display text-2xl font-semibold">{whole ? 'Something went wrong' : `${this.props.label ?? 'This section'} hit a problem`}</div>
      <div className="text-sm text-muted mt-2">Saved data on this device may be damaged. Resetting puts {whole ? 'this device’s saved data' : 'this section'} back to the sample data — the rest of the app is untouched.</div>
      <div className="flex gap-2 justify-center mt-5">
        <button className="h-11 px-5 rounded-xl bg-accent text-accent-ink font-semibold" data-testid="section-reset" onClick={() => resetSection(this.props.section ?? '*')}>{whole ? 'Reset this device’s data' : 'Reset this section'}</button>
        <button className="h-11 px-5 rounded-xl border hairline font-semibold" onClick={() => this.setState({ err: null })}>Try again</button>
      </div>
    </div>
  }
}
