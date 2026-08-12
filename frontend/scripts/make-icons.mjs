// Renders the PWA install icons from public/favicon.svg — the one source the
// favicon is already rendered from, so the installed app and the browser tab can
// never drift apart. Run with `node scripts/make-icons.mjs` after editing the SVG.
//
// Two shapes, because Android asks for both:
//   pwa-192.png / pwa-512.png  "any"     — the mark on the app's dark ground
//   pwa-maskable-512.png       "maskable" — the same, but with the mark shrunk
//     into the middle 80% so a launcher can crop it to a circle or a squircle
//     without biting into the dumbbell.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'public', 'favicon.svg'))
const BG = { r: 0x0b, g: 0x12, b: 0x20, alpha: 1 } // --theme-color, the app's ground

async function icon(size, { safe = 1 } = {}) {
  const inner = Math.round(size * safe)
  const mark = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
  const pad = Math.round((size - inner) / 2)
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, top: pad, left: pad }])
    .png()
    .toBuffer()
}

for (const [name, size, opts] of [
  ['pwa-192.png', 192, { safe: 0.72 }],
  ['pwa-512.png', 512, { safe: 0.72 }],
  ['pwa-maskable-512.png', 512, { safe: 0.55 }],
  // iOS ignores the manifest's icons and reads this one off the page instead.
  ['apple-touch-icon.png', 180, { safe: 0.72 }],
]) {
  writeFileSync(join(root, 'public', name), await icon(size, opts))
  console.log('wrote public/' + name)
}
