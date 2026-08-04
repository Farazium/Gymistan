// One reading of a ledger category, shared by the on-screen table and the PDF so
// the two can't drift apart. The backend writes the label (see
// dashboard.views._payment_category); this only decides how it is coloured.
//
// Money still owed is the thing worth spotting on a page of green rows, so a
// part-payment outranks everything else it could also be.
export function categoryTone(category = '') {
  if (category === 'Inventory Sale') return 'inventory'
  if (category.includes('(Partial)')) return 'partial'
  // A joining row reads as admission even when a package fee rode along with it
  // ("Admission + Member Fee") — that is the thing that makes it stand out.
  if (category.includes('Admission')) return 'admission'
  if (category.includes('Dues')) return 'dues'
  return 'income'
}

// The daily sheet already groups by section, so "Member Fee" on every row of a
// table headed "Member Fees" is noise. Same tones, shorter words.
export function shortCategory(category = '') {
  return category
    .replace('Member Fee + Dues', 'Fee + Dues')
    .replace('Member Fee', 'Fee')
    .replace('Dues Payment', 'Dues')
    .replace('Admission Fee', 'Admission')
}

// Tailwind badge classes for the Finance page.
export const TONE_CLASSES = {
  inventory: 'bg-cyan-500/20 text-cyan-400',
  admission: 'bg-indigo-500/20 text-indigo-400',
  partial: 'bg-yellow-500/20 text-yellow-400',
  dues: 'bg-orange-500/20 text-orange-400',
  income: 'bg-green-500/20 text-green-400',
}

// The same tones as RGB, for jsPDF (which takes channels, not classes).
export const TONE_RGB = {
  inventory: [8, 145, 178],
  admission: [99, 102, 241],
  partial: [180, 125, 8],
  dues: [194, 100, 20],
  income: [21, 128, 61],
}
