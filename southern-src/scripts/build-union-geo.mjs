// Builds src/union/geo/counties.json (pre-projected SVG paths, no runtime map deps) from us-atlas counties-10m.
// Run: NODE_PATH=/tmp/geo/node_modules node scripts/build-union-geo.mjs   (needs d3-geo topojson-client topojson-simplify us-atlas)
import { createRequire } from 'module'; import fs from 'fs'
const require = createRequire(process.env.NODE_PATH + '/x.js')
const d3 = require('d3-geo'), topo = require('topojson-client'), simp = require('topojson-simplify')
const us = require('us-atlas/counties-10m.json')
const ST = { '40': 'OK', '48': 'TX', '20': 'KS', '35': 'NM', '08': 'CO', '05': 'AR', '22': 'LA', '29': 'MO', '31': 'NE', '19': 'IA', '28': 'MS' }
let t = simp.presimplify(us); t = simp.simplify(t, 0.0008)
const counties = topo.feature(t, t.objects.counties).features.filter(f => ST[f.id.slice(0, 2)])
const states = topo.feature(t, t.objects.states).features.filter(f => ST[f.id])
const W = 1000, H = 760
const proj = d3.geoConicEqualArea().parallels([29.5, 45.5]).rotate([98, 0]).fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features: states })
const path = d3.geoPath(proj).digits(1)
const out = { w: W, h: H, k: proj.scale(), t: proj.translate(), p: [29.5, 45.5], r: 98,
  states: states.map(f => ({ id: f.id, st: ST[f.id], n: f.properties.name, d: path(f), c: proj(d3.geoCentroid(f)).map(v => Math.round(v)), b: path.bounds(f).flat().map(v => Math.round(v)) })),
  counties: counties.map(f => ({ id: f.id, st: ST[f.id.slice(0, 2)], n: f.properties.name, d: path(f), c: path.centroid(f).map(v => Math.round(v)) })) }
console.log('check pin OKC', proj([-97.5164, 35.4676]))
fs.mkdirSync('src/union/geo', { recursive: true }); fs.writeFileSync('src/union/geo/counties.json', JSON.stringify(out))
console.log(out.counties.length, 'counties', (fs.statSync('src/union/geo/counties.json').size / 1024).toFixed(0) + 'KB')
