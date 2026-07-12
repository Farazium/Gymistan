// Per-package accent colors. Derived from the package's stable `id` (not its
// position in a list) so the same package always shows the same color in every
// screen — the Packages grid and the payment form — and colors don't shift when
// packages are added or removed.

export const PACKAGE_PALETTES = [
  { border: 'border-primary-500/40', bar: 'bg-primary-500', icon: 'bg-primary-500/20 text-primary-400', price: 'text-primary-400', tag: 'bg-primary-500/15 text-primary-300 border border-primary-500/25' },
  { border: 'border-violet-500/40',  bar: 'bg-violet-500',  icon: 'bg-violet-500/20 text-violet-400',   price: 'text-violet-400',  tag: 'bg-violet-500/15 text-violet-300 border border-violet-500/25' },
  { border: 'border-emerald-500/40', bar: 'bg-emerald-500', icon: 'bg-emerald-500/20 text-emerald-400', price: 'text-emerald-400', tag: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' },
  { border: 'border-orange-500/40',  bar: 'bg-orange-500',  icon: 'bg-orange-500/20 text-orange-400',   price: 'text-orange-400',  tag: 'bg-orange-500/15 text-orange-300 border border-orange-500/25' },
  { border: 'border-pink-500/40',    bar: 'bg-pink-500',    icon: 'bg-pink-500/20 text-pink-400',       price: 'text-pink-400',    tag: 'bg-pink-500/15 text-pink-300 border border-pink-500/25' },
  { border: 'border-cyan-500/40',    bar: 'bg-cyan-500',    icon: 'bg-cyan-500/20 text-cyan-400',       price: 'text-cyan-400',    tag: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25' },
]

export function packagePalette(pkgOrId) {
  const id = typeof pkgOrId === 'object' && pkgOrId !== null ? pkgOrId.id : pkgOrId
  const n = PACKAGE_PALETTES.length
  return PACKAGE_PALETTES[(((Number(id) || 0) % n) + n) % n]
}
