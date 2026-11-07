// Proves a GitHub Pages publish of this repo does not include editable source
// or unencrypted demo data. robots.txt does not do that: Pages still serves
// any file it copies. This check fails if .nojekyll is present (that disables
// Jekyll's exclude list) or if a real Jekyll build copies southern-src.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const repo = path.resolve(import.meta.dirname, '../..')
const dest = process.env.PAGES_DEST || '/tmp/pages-site'
const fails = []
const bad = (m) => { fails.push(m); console.log('FAIL ' + m) }
const ok = (m) => console.log('ok   ' + m)

if (fs.existsSync(path.join(repo, '.nojekyll'))) bad('.nojekyll is present, so GitHub Pages would copy the whole repo including southern-src')
else ok('no .nojekyll (Jekyll exclude stays in effect)')

const cfg = fs.readFileSync(path.join(repo, '_config.yml'), 'utf8')
if (!/^exclude:[\s\S]*- southern-src\b/m.test(cfg)) bad('_config.yml does not exclude southern-src')
else ok('_config.yml excludes southern-src')

fs.rmSync(dest, { recursive: true, force: true })
const jekyll = spawnSync('jekyll', ['build', '--source', repo, '--destination', dest, '--disable-disk-cache'], { encoding: 'utf8' })
if (jekyll.status !== 0) {
  bad('jekyll build failed\n' + (jekyll.stderr || jekyll.stdout || '').slice(-2000))
} else {
  ok('jekyll build finished')
  const walk = (dir, acc = []) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      const rel = path.relative(dest, p)
      if (fs.statSync(p).isDirectory()) walk(p, acc)
      else acc.push(rel.split(path.sep).join('/'))
    }
    return acc
  }
  const files = walk(dest)
  const leaked = files.filter(f => /(^|\/)(southern-src|southern-app)(\/|$)/.test(f) || f.endsWith('.tsx') || f.endsWith('.mjs') || f.includes('devkeys') || f.endsWith('package.json'))
  if (leaked.length) bad('published tree contains source: ' + leaked.slice(0, 8).join(', '))
  else ok(`published tree has ${files.length} files and no southern-src`)
  const same = (rel) => {
    const a = fs.readFileSync(path.join(repo, rel))
    const b = fs.readFileSync(path.join(dest, rel))
    const ha = crypto.createHash('sha256').update(a).digest('hex')
    const hb = crypto.createHash('sha256').update(b).digest('hex')
    if (ha !== hb) bad(`${rel} changed in the Pages output`)
    else ok(`${rel} copied unchanged`)
  }
  same('index.html')
  same('g/index.html')
  same('sw-lite.js')
  same('manifest.webmanifest')
  if (!files.includes('g/index.html')) bad('guest shell missing from Pages output')
}
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS')
process.exit(fails.length ? 1 : 0)
