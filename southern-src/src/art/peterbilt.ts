/**
 * Long-hood show-truck tractor (389-style) with a stand-up sleeper, drawn as an SVG side profile.
 * Pure string generator so it can render in React, in docs, and in headless previews.
 * Facing right. ViewBox 0 0 640 300, ground at y=270, ~20px per foot.
 * Generic oval badge only. No manufacturer marks.
 */
export interface TruckPaint { body: string; lower: string; pin: string; pin2?: string; glass?: string; letter?: string }

const W = 640, H = 300, G = 270

export function truckSvg(c: TruckPaint, opt: { id?: string; scene?: { bg: string; ground: string; line?: string }; shadow?: boolean } = {}) {
  const id = (opt.id ?? 'pb') .replace(/[^a-z0-9]/gi, '')
  const u = (n: string) => `${id}-${n}`
  const pin2 = c.pin2 ?? c.pin
  // geometry
  const fx = 556, rx1 = 132, rx2 = 46, wy = 236, tr = 34
  const body = 'M178,214 L178,48 Q178,34 192,34 L266,34 Q290,34 298,56 L304,80 L360,80 L388,146 L596,151 Q600,151 600,157 L600,222 L597,226 A41,41 0 0 0 515,226 L507,212 L304,212 L178,214 Z'
  const chromeV = `url(#${u('chv')})`, chromeH = `url(#${u('chh')})`
  const wheel = (cx: number, front = false) => `
    <g>
      <circle cx="${cx}" cy="${wy}" r="${tr}" fill="#0d0e10"/>
      <circle cx="${cx}" cy="${wy}" r="${tr - 3}" fill="none" stroke="#1d1f23" stroke-width="3" stroke-dasharray="3 3"/>
      <circle cx="${cx}" cy="${wy}" r="${tr - 10}" fill="url(#${u('rim')})" stroke="#4b5058" stroke-width="1"/>
      <circle cx="${cx}" cy="${wy}" r="${tr - 13}" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1"/>
      ${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; const x = cx + Math.cos(a) * 13, y = wy + Math.sin(a) * 13; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="url(#${u('lug')})" stroke="#5b616a" stroke-width=".5"/>` }).join('')}
      <circle cx="${cx}" cy="${wy}" r="${front ? 8 : 7}" fill="url(#${u('hub')})" stroke="#6b7280" stroke-width=".8"/>
      ${front ? `<path d="M${cx - 3},${wy} L${cx},${wy - 11} L${cx + 3},${wy} Z" fill="#f3f4f6" opacity=".0"/>` : ''}
      <ellipse cx="${cx - 7}" cy="${wy - 9}" rx="7" ry="3" fill="#fff" opacity=".45" transform="rotate(-30 ${cx - 7} ${wy - 9})"/>
    </g>`
  const markers = (pts: [number, number][]) => pts.map(([x, y]) => `<g><circle cx="${x}" cy="${y}" r="3.2" fill="#ffb020"/><circle cx="${x}" cy="${y}" r="7" fill="#ffb020" opacity=".18"/><circle cx="${x - 0.8}" cy="${y - 0.9}" r="1" fill="#fff" opacity=".8"/></g>`).join('')
  const scene = opt.scene ? `<rect width="${W}" height="${H}" fill="${opt.scene.bg}"/><rect y="${G}" width="${W}" height="${H - G}" fill="${opt.scene.ground}"/>${opt.scene.line ? `<rect y="${G}" width="${W}" height="1.5" fill="${opt.scene.line}"/>` : ''}` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Custom long-hood show truck">
<defs>
  <linearGradient id="${u('chv')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".28" stop-color="#d4d8de"/><stop offset=".48" stop-color="#6e7580"/><stop offset=".56" stop-color="#eef0f3"/><stop offset=".8" stop-color="#a7adb6"/><stop offset="1" stop-color="#e9ecef"/></linearGradient>
  <linearGradient id="${u('chh')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7c838d"/><stop offset=".22" stop-color="#f7f8fa"/><stop offset=".45" stop-color="#b8bec6"/><stop offset=".7" stop-color="#ffffff"/><stop offset="1" stop-color="#6b727c"/></linearGradient>
  <radialGradient id="${u('rim')}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#cfd4da"/><stop offset=".8" stop-color="#8a919b"/><stop offset="1" stop-color="#e5e8ec"/></radialGradient>
  <radialGradient id="${u('hub')}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#9aa1aa"/><stop offset="1" stop-color="#4b5058"/></radialGradient>
  <radialGradient id="${u('lug')}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#8b929b"/></radialGradient>
  <linearGradient id="${u('glass')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.glass ?? '#3b4656'}"/><stop offset=".55" stop-color="#0c1118"/><stop offset="1" stop-color="#1c2531"/></linearGradient>
  <linearGradient id="${u('shine')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".18" stop-color="#fff" stop-opacity=".08"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
  <linearGradient id="${u('sweep')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="${u('shadow')}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".7" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <pattern id="${u('diamond')}" width="6" height="4" patternUnits="userSpaceOnUse"><rect width="6" height="4" fill="#c9ced5"/><path d="M0,2 L3,0 L6,2 L3,4 Z" fill="#eef0f3"/></pattern>
  <clipPath id="${u('body')}"><path d="${body}"/></clipPath>
</defs>
${scene}
${opt.shadow === false ? '' : `<ellipse cx="322" cy="${G + 1}" rx="318" ry="11" fill="url(#${u('shadow')})"/>`}

<!-- frame rails & deck -->
<rect x="12" y="212" width="592" height="14" rx="2" fill="#16181b"/>
<rect x="12" y="206" width="168" height="7" fill="url(#${u('diamond')})" stroke="#8b929b" stroke-width=".6"/>
<path d="M78,200 h52 l4,7 h-60 z" fill="#1d2024"/><rect x="96" y="196" width="22" height="5" rx="2" fill="#2b2f35"/>

<!-- rear tandem quarter fenders -->
<path d="M${rx2 - 40},${wy - 2} A40,40 0 0 1 ${rx2 + 40},${wy - 2}" fill="none" stroke="${chromeV}" stroke-width="4" stroke-linecap="round"/>
<path d="M${rx1 - 40},${wy - 2} A40,40 0 0 1 ${rx1 + 40},${wy - 2}" fill="none" stroke="${chromeV}" stroke-width="4" stroke-linecap="round"/>

<!-- stand-up sleeper + cab + long hood (one painted shell) -->
<path d="${body}" fill="${c.body}"/>
<g clip-path="url(#${u('body')})">
  <path d="M0,166 C160,166 380,164 470,170 C540,175 580,186 640,200 L640,300 L0,300 Z" fill="${c.lower}"/>
  <path d="M0,166 C160,166 380,164 470,170 C540,175 580,186 640,200" fill="none" stroke="${c.pin}" stroke-width="3"/>
  <path d="M0,159 C160,159 380,157 470,163 C540,168 580,179 640,193" fill="none" stroke="${pin2}" stroke-width="1.2" opacity=".9"/>
  <path d="M0,174 C160,174 380,172 470,178 C540,183 580,194 640,208" fill="none" stroke="${pin2}" stroke-width="1" opacity=".7"/>
  <!-- hood flame/scallop pinstripe -->
  <path d="M410,156 C460,154 520,155 586,158 M430,162 C480,160 530,161 584,165" fill="none" stroke="${pin2}" stroke-width="1.1" opacity=".75"/>
  <rect width="${W}" height="${H}" fill="url(#${u('shine')})"/>
  <path d="M150,0 L210,0 L130,300 L70,300 Z" fill="url(#${u('sweep')})" opacity=".6"/>
  <path d="M420,0 L470,0 L410,300 L360,300 Z" fill="url(#${u('sweep')})" opacity=".55"/>
</g>
<path d="${body}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.2"/>

<!-- body seams: sleeper/cab joint, door, hood line, cowl -->
<path d="M304,82 L304,212" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/>
<path d="M314,96 L314,206 L382,206 L382,150 L360,96 Z" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="1"/>
<path d="M392,148 L596,153" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>
<path d="M392,146 L392,212" stroke="#000" stroke-opacity=".3" stroke-width="1"/>
<!-- hood side louvers -->
${[0, 1, 2, 3, 4].map(i => `<rect x="${418 + i * 7}" y="176" width="3" height="20" rx="1.5" fill="#000" opacity=".28"/>`).join('')}
<!-- front fender flare -->
<path d="M509,212 A47,47 0 0 1 602,214" fill="none" stroke="${c.lower}" stroke-width="7"/>
<path d="M509,212 A47,47 0 0 1 602,214" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="7"/>
<path d="M511,210 A45,45 0 0 1 600,212" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.2"/>

<!-- door-script lettering (company name, no manufacturer marks) -->
<text x="228" y="132" text-anchor="middle" font-family="'Brush Script MT','Segoe Script','Lucida Handwriting',cursive" font-style="italic" font-weight="700" font-size="22" fill="${c.letter ?? c.lower}" stroke="#ffffff" stroke-opacity=".35" stroke-width=".6">Southern</text>
<text x="228" y="146" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="7" letter-spacing="2.5" fill="${c.letter ?? c.lower}" opacity=".85">TRANSPORT</text>
<!-- sleeper windows & luggage door -->
<rect x="196" y="66" width="34" height="20" rx="6" fill="url(#${u('glass')})" stroke="${chromeV}" stroke-width="2"/>
<rect x="240" y="66" width="34" height="20" rx="6" fill="url(#${u('glass')})" stroke="${chromeV}" stroke-width="2"/>
<rect x="192" y="176" width="44" height="30" rx="4" fill="none" stroke="#000" stroke-opacity=".35"/>
<rect x="208" y="188" width="12" height="3" rx="1.5" fill="${chromeH}"/>

<!-- cab door window + windshield -->
<path d="M321,94 L354,94 L372,138 L321,138 Z" fill="url(#${u('glass')})" stroke="${chromeV}" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M362,84 L385,140 L380,140 L358,84 Z" fill="url(#${u('glass')})"/>
<path d="M326,128 L346,98" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>

<!-- drop visor with cab lights -->
<path d="M350,77 L398,86 L398,93 L358,90 Z" fill="${c.body}" stroke="#000" stroke-opacity=".5" stroke-width="1"/>
<path d="M352,79 L398,87" stroke="${chromeH}" stroke-width="1.6"/>
${markers([[364, 91], [372, 91.6], [380, 92.2], [388, 92.8], [395, 93.3]])}
<!-- sleeper roof lights -->
${markers([[200, 36], [218, 36], [236, 36], [254, 36], [272, 37.5]])}
<!-- air horns (bullhorns) on cab roof -->
<rect x="316" y="77" width="6" height="4" fill="#2b2f35"/><rect x="334" y="77" width="6" height="4" fill="#2b2f35"/><path d="M310,77 L344,75.5 L350,71 L350,79 L344,77 L310,78.5 Z" fill="${chromeV}" stroke="#6b7280" stroke-width=".5"/><path d="M314,73.5 L340,72.5 L345,69 L345,75.5 L340,74.5 L314,75 Z" fill="${chromeV}" stroke="#6b7280" stroke-width=".5"/>

<!-- west-coast mirror -->
<path d="M382,104 L396,108 M382,146 L396,140" stroke="${chromeV}" stroke-width="2"/>
<rect x="394" y="98" width="7" height="48" rx="2.5" fill="#16181b" stroke="${chromeV}" stroke-width="1.6"/>

<!-- air cleaners on the cowl -->
<rect x="398" y="112" width="24" height="70" rx="6" fill="${chromeH}" stroke="#5b616a" stroke-width=".8"/>
${[124, 142, 160, 172].map(y => `<rect x="397" y="${y}" width="26" height="3" rx="1.5" fill="#8a919b"/>`).join('')}
<rect x="404" y="182" width="12" height="20" fill="${chromeH}"/>

<!-- headlight + turn signal on fender -->
<rect x="556" y="168" width="34" height="16" rx="7" fill="${chromeV}" stroke="#4b5058" stroke-width=".8"/>
<rect x="562" y="171" width="22" height="10" rx="5" fill="#e8f1ff"/><circle cx="569" cy="175" r="2.4" fill="#fff"/>
<rect x="540" y="172" width="12" height="7" rx="3" fill="#ffb020"/>

<!-- tall chrome grille with generic oval badge -->
<path d="M595,148 Q595,145 598,145 L616,145 Q619,145 619,148 L619,224 L595,224 Z" fill="${chromeH}" stroke="#4b5058" stroke-width=".8"/>
<rect x="598" y="160" width="18" height="62" fill="#2b2f35"/>
${Array.from({ length: 12 }, (_, i) => `<rect x="598" y="${161 + i * 5}" width="18" height="2.4" fill="${chromeV}"/>`).join('')}
<ellipse cx="607" cy="153" rx="8.5" ry="5" fill="${c.pin}" stroke="${chromeV}" stroke-width="1.8"/>
<ellipse cx="605" cy="151.6" rx="3.6" ry="1.3" fill="#fff" opacity=".55"/>
<!-- hood ornament -->
<path d="M580,150 L589,142 L593,146 L591,151 Z" fill="${chromeV}"/>

<!-- exhaust stacks (cab-mounted) -->
<rect x="286" y="20" width="12" height="196" fill="${chromeH}" stroke="#5b616a" stroke-width=".7"/>
<path d="M286,20 L298,12 L298,20 Z" fill="#2b2f35"/>
<path d="M286,20 L298,12" stroke="#e5e7eb" stroke-width="1"/>
<rect x="284" y="120" width="16" height="74" rx="3" fill="${chromeH}" stroke="#5b616a" stroke-width=".7"/>
${Array.from({ length: 8 }, (_, i) => `<circle cx="292" cy="${128 + i * 8}" r="1.2" fill="#4b5058"/>`).join('')}
${[60, 104, 202].map(y => `<rect x="282" y="${y}" width="20" height="4" rx="2" fill="#2b2f35"/>`).join('')}

<!-- chrome fuel tanks with straps, step, battery box -->
<rect x="312" y="200" width="196" height="42" rx="20" fill="${chromeV}" stroke="#5b616a" stroke-width=".8"/>
${[352, 412, 472].map(x => `<rect x="${x}" y="198" width="7" height="46" rx="2" fill="#1d2024"/><rect x="${x + 1.5}" y="198" width="4" height="46" rx="1.5" fill="${chromeH}"/>`).join('')}
<ellipse cx="330" cy="209" rx="10" ry="3" fill="#fff" opacity=".6"/>
<rect x="254" y="206" width="54" height="34" rx="4" fill="${chromeV}" stroke="#5b616a" stroke-width=".8"/>
<rect x="254" y="222" width="54" height="2" fill="#6b7280"/>
<!-- sleeper skirt -->
<path d="M180,212 L250,212 L250,240 L186,240 Z" fill="${c.lower}" stroke="#000" stroke-opacity=".4"/>
<rect x="180" y="236" width="70" height="4" fill="${chromeH}"/>

<!-- bumper -->
<rect x="590" y="222" width="38" height="24" rx="6" fill="${chromeV}" stroke="#4b5058" stroke-width=".8"/>
<rect x="592" y="226" width="34" height="2" fill="#fff" opacity=".7"/>

<!-- wheels -->
${wheel(fx, true)}${wheel(rx1)}${wheel(rx2)}

<!-- mud flaps + chrome hanger -->
<rect x="4" y="214" width="26" height="4" rx="2" fill="${chromeH}"/>
<path d="M8,218 L22,218 L22,262 L8,262 Z" fill="#0c0d0f"/>
<rect x="8" y="254" width="14" height="5" fill="${chromeH}"/>
<path d="M174,218 L182,218 L182,256 L174,256 Z" fill="#0c0d0f"/>
</svg>`
}
