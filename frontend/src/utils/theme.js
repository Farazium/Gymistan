// Per-gym accent theming. Each preset maps Tailwind color shades 200–700 to
// space-separated RGB channels; applyTheme() writes them to CSS variables that
// tailwind.config.js binds `primary-*` to. Keep keys in sync with the backend
// Gym.theme_color choices (apps/gyms/models.py :: ThemeColor).

export const THEMES = {
  rose:    { name: 'Rose',    swatch: '#f43f5e', c: { 200: '254 205 211', 300: '253 164 175', 400: '251 113 133', 500: '244 63 94',   600: '225 29 72',   700: '190 18 60'  } },
  red:     { name: 'Red',     swatch: '#ef4444', c: { 200: '254 202 202', 300: '252 165 165', 400: '248 113 113', 500: '239 68 68',   600: '220 38 38',   700: '185 28 28'  } },
  orange:  { name: 'Orange',  swatch: '#f97316', c: { 200: '254 215 170', 300: '253 186 116', 400: '251 146 60',  500: '249 115 22',  600: '234 88 12',   700: '194 65 12'  } },
  amber:   { name: 'Amber',   swatch: '#f59e0b', c: { 200: '253 230 138', 300: '252 211 77',  400: '251 191 36',  500: '245 158 11',  600: '217 119 6',   700: '180 83 9'   } },
  yellow:  { name: 'Yellow',  swatch: '#eab308', c: { 200: '254 240 138', 300: '253 224 71',  400: '250 204 21',  500: '234 179 8',   600: '202 138 4',   700: '161 98 7'   } },
  lime:    { name: 'Lime',    swatch: '#84cc16', c: { 200: '217 249 157', 300: '190 242 100', 400: '163 230 53',  500: '132 204 22',  600: '101 163 13',  700: '77 124 15'  } },
  green:   { name: 'Green',   swatch: '#22c55e', c: { 200: '187 247 208', 300: '134 239 172', 400: '74 222 128',  500: '34 197 94',   600: '22 163 74',   700: '21 128 61'  } },
  emerald: { name: 'Emerald', swatch: '#10b981', c: { 200: '167 243 208', 300: '110 231 183', 400: '52 211 153',  500: '16 185 129',  600: '5 150 105',   700: '4 120 87'   } },
  teal:    { name: 'Teal',    swatch: '#14b8a6', c: { 200: '153 246 228', 300: '94 234 212',  400: '45 212 191',  500: '20 184 166',  600: '13 148 136',  700: '15 118 110' } },
  cyan:    { name: 'Cyan',    swatch: '#06b6d4', c: { 200: '165 243 252', 300: '103 232 249', 400: '34 211 238',  500: '6 182 212',   600: '8 145 178',   700: '14 116 144' } },
  sky:     { name: 'Sky',     swatch: '#0ea5e9', c: { 200: '186 230 253', 300: '125 211 252', 400: '56 189 248',  500: '14 165 233',  600: '2 132 199',   700: '3 105 161'  } },
  blue:    { name: 'Blue',    swatch: '#3b82f6', c: { 200: '191 219 254', 300: '147 197 253', 400: '96 165 250',  500: '59 130 246',  600: '37 99 235',   700: '29 78 216'  } },
  indigo:  { name: 'Indigo',  swatch: '#6366f1', c: { 200: '199 210 254', 300: '165 180 252', 400: '129 140 248', 500: '99 102 241',  600: '79 70 229',   700: '67 56 202'  } },
  violet:  { name: 'Violet',  swatch: '#8b5cf6', c: { 200: '221 214 254', 300: '196 181 253', 400: '167 139 250', 500: '139 92 246',  600: '124 58 237',  700: '109 40 217' } },
  purple:  { name: 'Purple',  swatch: '#a855f7', c: { 200: '233 213 255', 300: '216 180 254', 400: '192 132 252', 500: '168 85 247',  600: '147 51 234',  700: '126 34 206' } },
  fuchsia: { name: 'Fuchsia', swatch: '#d946ef', c: { 200: '245 208 254', 300: '240 171 252', 400: '232 121 249', 500: '217 70 239',  600: '192 38 211',  700: '162 28 175' } },
  pink:    { name: 'Pink',    swatch: '#ec4899', c: { 200: '251 207 232', 300: '249 168 212', 400: '244 114 182', 500: '236 72 153',  600: '219 39 119',  700: '190 24 93'  } },
}

export const PRESETS = Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, swatch: t.swatch }))

export const DEFAULT_THEME = 'blue'

// Card / surface tones. All intentionally dark (subtle hue only) so light text
// stays readable on any pick. Keep keys in sync with Gym.card_color choices.
// `rgb` = the surface channels; `swatch` = solid preview color.
export const SURFACES = {
  slate:    { name: 'Slate',    swatch: '#1f2937', rgb: '31 41 55'  },
  graphite: { name: 'Graphite', swatch: '#18181b', rgb: '24 24 27'  },
  midnight: { name: 'Midnight', swatch: '#10172a', rgb: '16 23 42'  },
  navy:     { name: 'Navy',     swatch: '#1a2338', rgb: '26 35 56'  },
  indigo:   { name: 'Indigo',   swatch: '#1e1b3a', rgb: '30 27 58'  },
  ocean:    { name: 'Ocean',    swatch: '#14262b', rgb: '20 38 43'  },
  forest:   { name: 'Forest',   swatch: '#15251f', rgb: '21 37 31'  },
  stone:    { name: 'Stone',    swatch: '#292524', rgb: '41 37 36'  },
  bronze:   { name: 'Bronze',   swatch: '#2a2116', rgb: '42 33 22'  },
  plum:     { name: 'Plum',     swatch: '#221a2e', rgb: '34 26 46'  },
  wine:     { name: 'Wine',     swatch: '#2a1a1f', rgb: '42 26 31'  },
}

export const SURFACE_PRESETS = Object.entries(SURFACES).map(([id, s]) => ({ id, name: s.name, swatch: s.swatch }))

export const DEFAULT_SURFACE = 'slate'

// Write the selected theme's channels onto :root so every `primary-*` class
// re-colors instantly. Falls back to Blue for unknown/empty values.
export function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES[DEFAULT_THEME]
  const root = document.documentElement.style
  for (const [shade, rgb] of Object.entries(theme.c)) {
    root.setProperty(`--p${shade}`, rgb)
  }
}

// Set the card/surface color (--surface). Falls back to Slate.
export function applySurface(surfaceId) {
  const surface = SURFACES[surfaceId] || SURFACES[DEFAULT_SURFACE]
  document.documentElement.style.setProperty('--surface', surface.rgb)
}
