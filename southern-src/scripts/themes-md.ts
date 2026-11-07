import { writeFileSync } from 'node:fs'
import { THEMES, SLH_BRAND, LIGHT_ACCENTS, tokens, contrast } from '../src/data/themes'
import { TRUCK_PAINT } from '../src/art/truckPaint'
const r = (n: number) => `${n.toFixed(2)}:1`
const pass = (n: number, min: number) => (n >= min ? `✅ ${r(n)}` : `⚠️ ${r(n)} (below ${min}:1)`)
let md = `# Southern Command — Theme System\n\nGenerated from \`app/src/data/themes.ts\` by \`npm run themes:md\` — hex values here are exactly the ones in code.\n\n`
md += `## How themes work\n\n- Every screen reads CSS variables (design tokens). A theme supplies six core colors — **primary, secondary, accent, background, surface, text** — and the app derives the rest: \`surface-2\`, \`surface-3\` (raised/pressed fills), \`line\` (hairlines/outlines), \`muted\` (secondary text, auto-raised to ≥ 4.5:1 on surface-2), \`faint\` (hints, ≥ 3:1), \`accent-ink\` (label color on primary buttons — white or near-black, whichever contrasts more) and \`accent-fg\` (primary used as text/icons, auto-adjusted to ≥ 4.5:1).\n`
md += `- **Status colors are not themeable.** Red (danger), amber (warning), green (OK) and blue (info) start from fixed values per mode and are pushed lighter/darker until they reach ≥ 4.5:1 on that theme's surface. Personalization is visual only and can never hide mandatory alerts.\n`
md += `- Where colors are used: **primary** = primary buttons, selected tabs/segments, active nav item, focus rings, map state outline, charts' current year. **secondary** = stripes, secondary chart series, truck-swatch stripe. **accent** = small highlights (chrome/wheels in swatches, badges). **background** = app canvas behind everything. **surface** = cards, sheets, sidebar, top bar, bottom tab bar. **text** = headings & body.\n`
md += `- Buttons: primary = \`primary\` fill + \`accent-ink\` label; secondary = \`surface-2\` fill + \`text\`; danger = status red. Cards: \`surface\` + 1px \`line\` border. Navigation: \`surface\` rail, active item \`surface-2\` with \`accent-fg\` icon. Inputs: \`surface-2\` fill, \`line\` border, \`primary\` focus border.\n`
md += `- Picker: Settings → Appearance (and Field app → More → Theme) shows a photo-real truck per scheme (960px WebP, lazy-loaded, < 80 KB each, in \`app/src/art/trucks/\`). Each themed truck is its own render matched to Southern Transport\u2019s real truck where one exists; most are transparent cut-outs, Light Mode keeps its studio backdrop as a rounded card image; SLH (the Southern crane) and Southern Style are studio renders matched to Chad's photos, cut out like the rest. Jen Mode is the app dark/night mode. Custom repaints a neutral 389 tri-drive render live with the user's colors. Each image keeps its own framing (front 3/4 or side) and is centered in its card.\n`
md += `### SLH brand token block (edit when exact crane-photo hex values arrive)\n\n| Token | Hex |\n|---|---|\n${Object.entries(SLH_BRAND).map(([k, v]) => `| ${k} | \`${v}\` |`).join('\n')}\n\n`
for (const t of THEMES) {
  md += `## ${t.name}${t.key === 'slh' ? ' (company default)' : ''}\n\n*${t.truck}* — ${t.blurb}\n\n`
  const tp = t.key === 'custom' ? undefined : TRUCK_PAINT[t.key]
  md += tp ? `Truck render: \`${tp.file}\` — body \`${tp.body}\` · panels \`${tp.panel}\` · stripes \`${tp.stripe}\` (${tp.note}).\n\n` : `Truck render: neutral Peterbilt 389 tri-drive sleeper (\`custom-base.webp\`) repainted live in the browser — primary = cab/sleeper/hood paint, secondary = frame and drive fenders, accent = pinstripes (alpha masks + multiply; chrome, glass, tires and shadows untouched).\n\n`
  md += `Key: \`${t.key}\` · default variant: ${t.defaultMode} · variants: ${Object.keys(t.variants).join(', ')}\n\n`
  for (const [mode, p] of Object.entries(t.variants)) {
    if (!p) continue
    const k = tokens(p)
    md += `### ${mode === 'dark' ? 'Dark' : 'Light'} variant\n\n| Role | Hex |\n|---|---|\n| Primary | \`${p.primary}\` |\n| Secondary | \`${p.secondary}\` |\n| Accent | \`${p.accent}\` |\n| Background | \`${p.bg}\` |\n| Surface | \`${p.surface}\` |\n| Text | \`${p.text}\` |\n| *derived* muted text | \`${k.muted}\` |\n| *derived* line | \`${k.line}\` |\n| *derived* button label (accent-ink) | \`${k.accentInk}\` |\n| *derived* status ok / warn / bad / info | \`${k.ok}\` / \`${k.warn}\` / \`${k.bad}\` / \`${k.info}\` |\n\n`
    md += `Contrast (WCAG 2.x): text/background ${pass(contrast(p.text, p.bg), 4.5)} · text/surface ${pass(contrast(p.text, p.surface), 4.5)} · muted/surface ${pass(contrast(k.muted, p.surface), 4.5)} · button label/primary ${pass(contrast(k.accentInk, p.primary), 4.5)} · primary-as-text/surface ${pass(contrast(k.accentFg, p.surface), 4.5)} · primary vs background (UI) ${pass(contrast(p.primary, p.bg), 3)} · danger/surface ${pass(contrast(k.bad, p.surface), 4.5)} · warning/surface ${pass(contrast(k.warn, p.surface), 4.5)} · ok/surface ${pass(contrast(k.ok, p.surface), 4.5)}\n\n`
  }
  if (t.key === 'light') md += `Light Mode accent choices (any truck color): ${LIGHT_ACCENTS.map(a => `${a.name} \`${a.hex}\` (${r(contrast(a.hex, '#ffffff'))} on white)`).join(' · ')}\n\n`
  if (t.key === 'custom') md += `Custom: the user picks all six colors (defaults shown above), sees a live preview card, and gets live WCAG checks — warns below 4.5:1 for text pairs and 3:1 for UI pairs. Status colors are still auto-guarded.\n\n`
  if (t.key === 'slh') md += `Glossy primer finish: on this theme cards get a subtle diagonal white sheen gradient and the canvas a soft top highlight (CSS in \`index.css\`, \`html[data-theme="slh"]\`). Amber appears only as the warning status color.\n\n`
}
writeFileSync('/workspace/southern-app/THEMES.md', md)
console.log('THEMES.md written', md.length)
