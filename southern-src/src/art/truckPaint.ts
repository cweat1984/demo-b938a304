import type { ThemeKey } from '../data/themes'

/**
 * Paint on each theme's photo-real truck render (truck-art/renders/*.webp).
 * Every render except Heavy Artillery is the Miami Vice 389 sleeper photo with its three paint
 * regions recolored (body / panels / stripes+chassis+hubs), so the truck shape is pixel-identical.
 * Heavy Artillery is the client's olive blacked-out day cab. Pure data (no image imports) so
 * scripts/themes-md.ts can print it into THEMES.md.
 */
export interface TruckPaintSpec { file: string; body: string; panel: string; stripe: string; note: string }
export const TRUCK_PAINT: Record<Exclude<ThemeKey, 'custom'>, TruckPaintSpec> = {
  slh: { file: 'slh.webp', body: '#9ca1a8', panel: '#141517', stripe: '#ffffff', note: 'studio render of the Southern Lifting & Hoisting Liebherr all-terrain crane (matched to Chad\'s photo), transparent cut-out with soft shadow; boom gray reads ≈ #bac1c7 in full sun, palette keeps the primer gray' },
  jen: { file: 'jen-mode.webp', body: '#0b0b0c', panel: '#3a3a3c', stripe: '#8e8e93', note: 'gloss-black tri-drive 389 sleeper (straight stacks), transparent cut-out; Jen Mode is the app dark/night mode' },
  light: { file: 'light-mode.webp', body: '#f4f5f7', panel: '#f4f5f7', stripe: '#475467', note: 'supplied render (pearl white, slate pinstripes) kept on its own light studio backdrop as a rounded card image; also used for Custom' },
  miami: { file: 'miami-vice.webp', body: '#ec9462', panel: '#f4e6cc', stripe: '#1fc4c4', note: 'original render; peach, cream and turquoise sampled from the real truck' },
  cotton: { file: 'cotton-candy.webp', body: '#ba2f7a', panel: '#32abb3', stripe: '#32abb3', note: 'supplied render matched to the real truck; solid gloss magenta (photos ≈ #d83385 sun / #b04287 shade), turquoise frame, fifth wheel and deck (photos ≈ #60d6e5–#70e2ed), magenta drive fenders, chrome' },
  purple: { file: 'purple-pressure.webp', body: '#c4b4d6', panel: '#412564', stripe: '#412564', note: 'supplied side-profile render matched to the real truck; pale metallic lavender-silver (photos ≈ #ccadde / #9692a9 overcast), deep violet pinstripes and hood swoosh (photos ≈ #392862–#423165), candy-purple frame, chrome fenders' },
  ivy: { file: 'ivys-poison.webp', body: '#0f2f82', panel: '#b4bfcc', stripe: '#ffffff', note: 'Chad-approved render of the 1986 Peterbilt 359; deep candy metallic royal blue (photos ≈ #0d2f80–#15328c, highlight #1a44a0), silver/white tribal flames (photos ≈ #b2bdc9), chrome stacks, bumper and wheels' },
  artillery: { file: 'heavy-artillery.webp', body: '#4b4735', panel: '#121312', stripe: '#121312', note: 'original render; satin olive blacked-out day cab sampled from the real truck' },
  southern: { file: 'southern-style.webp', body: '#4f2a29', panel: '#8d8476', stripe: '#c4cad3', note: 'studio render of the Southern Style Peterbilt (matched to Chad\'s photos; two drive axles as on the real truck), transparent cut-out with soft shadow; root-beer burgundy ≈ #4d2c29 / #612728 (sun), champagne-tan ≈ #8d8476, chrome' },
}
