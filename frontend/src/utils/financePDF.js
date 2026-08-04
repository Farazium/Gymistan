import { categoryTone, shortCategory, TONE_RGB } from './ledgerCategory'

const HEADER_BG = [15, 23, 42]
const BLUE = [59, 130, 246]
const GREEN_DARK = [21, 128, 61]
const GREEN_BG = [240, 253, 244]
const RED_DARK = [185, 28, 28]
const RED_BG = [254, 242, 242]
const BLUE_DARK = [29, 78, 216]
const BLUE_BG = [239, 246, 255]
const TABLE_HEAD_BG = [241, 245, 249]
const ALT_ROW = [248, 250, 252]
const BORDER = [226, 232, 240]
const TEXT_DARK = [15, 23, 42]
const TEXT_MID = [100, 116, 139]
const TEXT_LIGHT = [148, 163, 184]
const WHITE = [255, 255, 255]

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 14
const CONTENT_W = PAGE_W - MARGIN * 2

// Trim `text` until it actually fits `maxW` millimetres at the pdf's current
// font, adding an ellipsis. Counting characters instead (the old approach) lets
// a wide all-caps name spill into the next column while a narrow one stops short.
function fitText(pdf, text, maxW) {
  const str = String(text ?? '')
  if (pdf.getTextWidth(str) <= maxW) return str
  let cut = str.length
  while (cut > 1 && pdf.getTextWidth(str.slice(0, cut) + '…') > maxW) cut -= 1
  return str.slice(0, cut) + '…'
}

function fmtNum(n) {
  return `PKR ${Number(n).toLocaleString('en-PK')}`
}
function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-PK')
}

let _logoCache = null
async function getLogo() {
  if (_logoCache) return _logoCache
  const SIZE = 128
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')

  // Blue circle background
  ctx.fillStyle = '#3b82f6'
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
  ctx.fill()

  // Scale Lucide 24x24 SVG paths into canvas with padding
  const pad = 22
  const scale = (SIZE - pad * 2) / 24
  ctx.save()
  ctx.translate(pad, pad)
  ctx.scale(scale, scale)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2.2 / scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const paths = [
    'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z',
    'm2.5 21.5 1.4-1.4',
    'm20.1 3.9 1.4-1.4',
    'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z',
    'm9.6 14.4 4.8-4.8',
  ]
  for (const d of paths) {
    ctx.stroke(new Path2D(d))
  }
  ctx.restore()

  _logoCache = canvas.toDataURL('image/png')
  return _logoCache
}

function drawHeader(pdf, logo, title, subtitle, gymName) {
  pdf.setFillColor(...HEADER_BG)
  pdf.rect(0, 0, PAGE_W, 30, 'F')

  if (logo) {
    pdf.addImage(logo, 'PNG', MARGIN, 7, 16, 16)
  }

  // Gym name, big — shrinks/truncates for long names so it never hits the date on the right
  let name = (gymName || 'Gym').toUpperCase()
  let nameSize = 17
  if (name.length > 24) { name = name.slice(0, 23) + '...'; nameSize = 12 }
  else if (name.length > 16) nameSize = 13

  pdf.setTextColor(...WHITE)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(nameSize)
  pdf.text(name, MARGIN + 19, 15)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...TEXT_LIGHT)
  pdf.text(title, MARGIN + 19, 22)

  pdf.setTextColor(...TEXT_LIGHT)
  pdf.setFontSize(7.5)
  pdf.text(subtitle, PAGE_W - MARGIN, 14, { align: 'right' })
  pdf.text(`Generated: ${new Date().toLocaleDateString('en-PK')}`, PAGE_W - MARGIN, 21, { align: 'right' })
}

function drawFooter(pdf, pageNum, totalPages) {
  pdf.setFillColor(...HEADER_BG)
  pdf.rect(0, PAGE_H - 11, PAGE_W, 11, 'F')
  pdf.setTextColor(...TEXT_LIGHT)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 4, { align: 'right' })
  // App credit only on the final page
  if (pageNum === totalPages) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(...WHITE)
    pdf.text('Powered by Gymistan', PAGE_W / 2, PAGE_H - 4, { align: 'center' })
  }
}

function summaryCard(pdf, x, y, w, h, label, value, bgColor, accentColor, textColor) {
  pdf.setFillColor(...bgColor)
  pdf.roundedRect(x, y, w, h, 2, 2, 'F')
  pdf.setFillColor(...accentColor)
  pdf.roundedRect(x, y, 2.5, h, 1, 1, 'F')
  pdf.setTextColor(...TEXT_MID)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(6.5)
  pdf.text(label.toUpperCase(), x + 6, y + 6.5)
  pdf.setTextColor(...textColor)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  pdf.text(value, x + 6, y + 14)
}

// ─── LEDGER ─────────────────────────────────────────────────────────────────
export async function exportLedgerPDF(data, start, end, gymName) {
  const [{ default: jsPDF }, logo] = await Promise.all([import('jspdf'), getLogo()])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  drawHeader(pdf, logo, 'Ledger Report', `${fmtDate(start)} — ${fmtDate(end)}`, gymName)

  let y = 38

  // Summary cards
  const cw = (CONTENT_W - 8) / 3
  summaryCard(pdf, MARGIN, y, cw, 20, 'Total In', fmtNum(data.total_in), GREEN_BG, [34, 197, 94], GREEN_DARK)
  summaryCard(pdf, MARGIN + cw + 4, y, cw, 20, 'Total Out', fmtNum(data.total_out), RED_BG, [239, 68, 68], RED_DARK)
  summaryCard(pdf, MARGIN + (cw + 4) * 2, y, cw, 20, 'Net', fmtNum(data.net), data.net >= 0 ? BLUE_BG : RED_BG, data.net >= 0 ? BLUE : [239, 68, 68], data.net >= 0 ? BLUE_DARK : RED_DARK)

  y += 28

  // Table header
  const cols = [
    { label: 'DATE', x: MARGIN, w: 26, align: 'left' },
    { label: 'DESCRIPTION', x: MARGIN + 26, w: 46, align: 'left' },
    // Wide enough for the longest label a payment can carry — a joining that
    // bundled the admission fee and folded in an old balance, part-paid. The
    // room comes from IN/OUT, which were far wider than any PKR figure needs.
    { label: 'CATEGORY', x: MARGIN + 72, w: 56, align: 'left' },
    { label: 'IN', x: MARGIN + 128, w: 28, align: 'right' },
    { label: 'OUT', x: MARGIN + 156, w: 26, align: 'right' },
  ]

  pdf.setFillColor(...TABLE_HEAD_BG)
  pdf.rect(MARGIN, y, CONTENT_W, 8, 'F')
  pdf.setDrawColor(...BORDER)
  pdf.setLineWidth(0.3)
  pdf.line(MARGIN, y + 8, MARGIN + CONTENT_W, y + 8)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  pdf.setTextColor(...TEXT_MID)
  cols.forEach(c => {
    const tx = c.align === 'right' ? c.x + c.w - 1 : c.x + 2
    pdf.text(c.label, tx, y + 5.5, { align: c.align })
  })
  y += 8

  const ROW_H = 7.5
  const pages = [1]

  data.entries.forEach((e, i) => {
    if (y + ROW_H > PAGE_H - 16) {
      drawFooter(pdf, pages.length, '?')
      pdf.addPage()
      pages.push(1)
      drawHeader(pdf, logo, 'Ledger Report (cont.)', `${fmtDate(start)} — ${fmtDate(end)}`, gymName)
      y = 38
      // re-draw table header
      pdf.setFillColor(...TABLE_HEAD_BG)
      pdf.rect(MARGIN, y, CONTENT_W, 8, 'F')
      pdf.setDrawColor(...BORDER)
      pdf.setLineWidth(0.3)
      pdf.line(MARGIN, y + 8, MARGIN + CONTENT_W, y + 8)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.5)
      pdf.setTextColor(...TEXT_MID)
      cols.forEach(c => {
        const tx = c.align === 'right' ? c.x + c.w - 1 : c.x + 2
        pdf.text(c.label, tx, y + 5.5, { align: c.align })
      })
      y += 8
    }

    if (i % 2 === 1) {
      pdf.setFillColor(...ALT_ROW)
      pdf.rect(MARGIN, y, CONTENT_W, ROW_H, 'F')
    }
    pdf.setDrawColor(...BORDER)
    pdf.setLineWidth(0.15)
    pdf.line(MARGIN, y + ROW_H, MARGIN + CONTENT_W, y + ROW_H)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)

    pdf.setTextColor(...TEXT_MID)
    pdf.text(fmtDate(e.date), cols[0].x + 2, y + 5)

    pdf.setTextColor(...TEXT_DARK)
    pdf.text(fitText(pdf, e.description, cols[1].w - 3), cols[1].x + 2, y + 5)

    const catColor = e.type === 'IN' ? TONE_RGB[categoryTone(e.category)] : TEXT_MID
    pdf.setTextColor(...catColor)
    pdf.text(fitText(pdf, e.category, cols[2].w - 3), cols[2].x + 2, y + 5)

    if (e.type === 'IN') {
      pdf.setTextColor(...GREEN_DARK)
      pdf.setFont('helvetica', 'bold')
      pdf.text(fmtNum(e.amount), cols[3].x + cols[3].w - 1, y + 5, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...TEXT_LIGHT)
      pdf.text('—', cols[4].x + cols[4].w - 1, y + 5, { align: 'right' })
    } else {
      pdf.setTextColor(...TEXT_LIGHT)
      pdf.text('—', cols[3].x + cols[3].w - 1, y + 5, { align: 'right' })
      pdf.setTextColor(...RED_DARK)
      pdf.setFont('helvetica', 'bold')
      pdf.text(fmtNum(e.amount), cols[4].x + cols[4].w - 1, y + 5, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
    }

    y += ROW_H
  })

  const totalPages = pages.length
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p)
    drawFooter(pdf, p, totalPages)
  }

  pdf.save(`ledger-${start}-to-${end}.pdf`)
}

// ─── INCOME STATEMENT ────────────────────────────────────────────────────────
export async function exportIncomeStatementPDF(data, gymName) {
  const [{ default: jsPDF }, logo] = await Promise.all([import('jspdf'), getLogo()])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const subtitle = `${fmtDate(data.period.start)} — ${fmtDate(data.period.end)}`
  drawHeader(pdf, logo, 'Income Statement', subtitle, gymName)

  let y = 38

  // Summary cards
  const cw = (CONTENT_W - 8) / 3
  summaryCard(pdf, MARGIN, y, cw, 20, 'Total Revenue', fmtNum(data.revenue.total), GREEN_BG, [34, 197, 94], GREEN_DARK)
  summaryCard(pdf, MARGIN + cw + 4, y, cw, 20, 'Total Expenses', fmtNum(data.expenses.total), RED_BG, [239, 68, 68], RED_DARK)
  const isProfit = data.net_profit >= 0
  summaryCard(pdf, MARGIN + (cw + 4) * 2, y, cw, 20, 'Net Profit', fmtNum(data.net_profit), isProfit ? GREEN_BG : RED_BG, isProfit ? [34, 197, 94] : [239, 68, 68], isProfit ? GREEN_DARK : RED_DARK)

  y += 32

  // Revenue section
  pdf.setFillColor(...TABLE_HEAD_BG)
  pdf.rect(MARGIN, y, CONTENT_W, 8, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(...TEXT_DARK)
  pdf.text('REVENUE BREAKDOWN', MARGIN + 3, y + 5.5)
  y += 8

  const revRows = [
    { label: 'Member Fees', value: data.revenue.member_fees },
    { label: 'Inventory Sales', value: data.revenue.inventory_sales },
  ]
  revRows.forEach((r, i) => {
    if (i % 2 === 1) { pdf.setFillColor(...ALT_ROW); pdf.rect(MARGIN, y, CONTENT_W, 8, 'F') }
    pdf.setDrawColor(...BORDER); pdf.setLineWidth(0.15); pdf.line(MARGIN, y + 8, MARGIN + CONTENT_W, y + 8)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...TEXT_DARK)
    pdf.text(r.label, MARGIN + 4, y + 5.5)
    pdf.setTextColor(...GREEN_DARK); pdf.setFont('helvetica', 'bold')
    pdf.text(fmtNum(r.value), PAGE_W - MARGIN - 2, y + 5.5, { align: 'right' })
    y += 8
  })
  // Total revenue
  pdf.setFillColor(220, 252, 231)
  pdf.rect(MARGIN, y, CONTENT_W, 9, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...GREEN_DARK)
  pdf.text('Total Revenue', MARGIN + 4, y + 6)
  pdf.text(fmtNum(data.revenue.total), PAGE_W - MARGIN - 2, y + 6, { align: 'right' })
  y += 16

  // Expenses section
  pdf.setFillColor(...TABLE_HEAD_BG)
  pdf.rect(MARGIN, y, CONTENT_W, 8, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...TEXT_DARK)
  pdf.text('EXPENSE BREAKDOWN', MARGIN + 3, y + 5.5)
  y += 8

  data.expenses.by_category.forEach((cat, i) => {
    if (y + 8 > PAGE_H - 16) { drawFooter(pdf, 1, 1); pdf.addPage(); y = 20 }
    if (i % 2 === 1) { pdf.setFillColor(...ALT_ROW); pdf.rect(MARGIN, y, CONTENT_W, 8, 'F') }
    pdf.setDrawColor(...BORDER); pdf.setLineWidth(0.15); pdf.line(MARGIN, y + 8, MARGIN + CONTENT_W, y + 8)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...TEXT_DARK)
    pdf.text(cat.name, MARGIN + 4, y + 5.5)
    pdf.setTextColor(...RED_DARK); pdf.setFont('helvetica', 'bold')
    pdf.text(fmtNum(cat.amount), PAGE_W - MARGIN - 2, y + 5.5, { align: 'right' })
    y += 8
  })
  // Total expenses
  pdf.setFillColor(254, 226, 226)
  pdf.rect(MARGIN, y, CONTENT_W, 9, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...RED_DARK)
  pdf.text('Total Expenses', MARGIN + 4, y + 6)
  pdf.text(fmtNum(data.expenses.total), PAGE_W - MARGIN - 2, y + 6, { align: 'right' })
  y += 16

  // Net profit banner
  pdf.setFillColor(...(isProfit ? [34, 197, 94] : [239, 68, 68]))
  pdf.roundedRect(MARGIN, y, CONTENT_W, 16, 2, 2, 'F')
  pdf.setTextColor(...WHITE)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10)
  pdf.text('NET PROFIT / LOSS', MARGIN + 5, y + 10)
  pdf.setFontSize(13)
  pdf.text(fmtNum(data.net_profit), PAGE_W - MARGIN - 5, y + 10, { align: 'right' })

  const totalPages = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) { pdf.setPage(p); drawFooter(pdf, p, totalPages) }

  pdf.save(`income-statement-${data.period.start}-to-${data.period.end}.pdf`)
}

// ─── EXPENSE CATEGORIES ──────────────────────────────────────────────────────
export async function exportExpenseCategoriesPDF(data, start, end, gymName) {
  const [{ default: jsPDF }, logo] = await Promise.all([import('jspdf'), getLogo()])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  drawHeader(pdf, logo, 'Expense Categories', `${fmtDate(start)} — ${fmtDate(end)}`, gymName)

  let y = 38

  // Summary cards
  const cw = (CONTENT_W - 4) / 2
  summaryCard(pdf, MARGIN, y, cw, 20, 'Total Expenses', fmtNum(data.total), RED_BG, [239, 68, 68], RED_DARK)
  summaryCard(pdf, MARGIN + cw + 4, y, cw, 20, 'Categories', `${data.categories.length}`, BLUE_BG, BLUE, BLUE_DARK)
  y += 30

  data.categories.forEach((cat) => {
    const entryH = 10 + cat.entries.length * 7.5 + 4
    if (y + entryH > PAGE_H - 16) {
      drawFooter(pdf, 1, 1)
      pdf.addPage()
      drawHeader(pdf, logo, 'Expense Categories (cont.)', `${fmtDate(start)} — ${fmtDate(end)}`, gymName)
      y = 38
    }

    // Category header bar
    pdf.setFillColor(...TABLE_HEAD_BG)
    pdf.roundedRect(MARGIN, y, CONTENT_W, 10, 1.5, 1.5, 'F')
    pdf.setFillColor(...BLUE)
    pdf.roundedRect(MARGIN, y, 3, 10, 1, 1, 'F')

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(...TEXT_DARK)
    pdf.text(cat.category, MARGIN + 7, y + 6.8)

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...TEXT_MID)
    pdf.text(`${cat.count} expense${cat.count !== 1 ? 's' : ''}  •  ${cat.pct}% of total`, MARGIN + 60, y + 6.8)

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...RED_DARK)
    pdf.text(fmtNum(cat.total), PAGE_W - MARGIN - 2, y + 6.8, { align: 'right' })

    // Progress bar
    pdf.setFillColor(...BORDER)
    pdf.rect(MARGIN, y + 10, CONTENT_W, 2, 'F')
    pdf.setFillColor(239, 68, 68)
    pdf.rect(MARGIN, y + 10, CONTENT_W * (cat.pct / 100), 2, 'F')
    y += 14

    // Entries
    cat.entries.forEach((e, i) => {
      if (i % 2 === 1) { pdf.setFillColor(...ALT_ROW); pdf.rect(MARGIN, y, CONTENT_W, 7.5, 'F') }
      pdf.setDrawColor(...BORDER); pdf.setLineWidth(0.15)
      pdf.line(MARGIN, y + 7.5, MARGIN + CONTENT_W, y + 7.5)
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...TEXT_DARK)
      pdf.text(e.title, MARGIN + 6, y + 5)
      pdf.setTextColor(...TEXT_MID); pdf.setFontSize(7)
      pdf.text(fmtDate(e.date), MARGIN + 90, y + 5)
      pdf.setTextColor(...RED_DARK); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5)
      pdf.text(fmtNum(e.amount), PAGE_W - MARGIN - 2, y + 5, { align: 'right' })
      y += 7.5
    })
    y += 6
  })

  const totalPages = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) { pdf.setPage(p); drawFooter(pdf, p, totalPages) }

  pdf.save(`expense-categories-${start}-to-${end}.pdf`)
}

// ─── DAILY COLLECTION SHEET ──────────────────────────────────────────────────
export async function exportDailyCollectionPDF(data, gymName) {
  const [{ default: jsPDF }, logo] = await Promise.all([import('jspdf'), getLogo()])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const dateLabel = fmtDate(data.date)
  drawHeader(pdf, logo, 'Daily Collection Sheet', dateLabel, gymName)

  let y = 36

  // ── Section helper ──────────────────────────────────────────────────────────
  function section(title, accentColor, rows, columns, total, emptyMsg) {
    if (y + 12 > PAGE_H - 20) { drawFooter(pdf, 1, 1); pdf.addPage(); drawHeader(pdf, logo, 'Daily Collection Sheet (cont.)', dateLabel, gymName); y = 36 }

    pdf.setFillColor(...TABLE_HEAD_BG)
    pdf.rect(MARGIN, y, CONTENT_W, 9, 'F')
    pdf.setFillColor(...accentColor)
    pdf.rect(MARGIN, y, 3, 9, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...TEXT_DARK)
    pdf.text(title, MARGIN + 6, y + 6)
    if (total > 0) {
      pdf.setTextColor(...accentColor)
      pdf.text(fmtNum(total), PAGE_W - MARGIN - 2, y + 6, { align: 'right' })
    }
    y += 9

    if (!rows.length) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...TEXT_LIGHT)
      pdf.text(emptyMsg, MARGIN + 6, y + 5.5)
      y += 8
      return
    }

    // Column headers
    pdf.setFillColor(250, 252, 255)
    pdf.rect(MARGIN, y, CONTENT_W, 6.5, 'F')
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(...TEXT_MID)
    columns.forEach(c => {
      const tx = c.align === 'right' ? c.x + c.w - 1 : c.x + 2
      pdf.text(c.label, tx, y + 4.5, { align: c.align })
    })
    y += 6.5

    rows.forEach((row, i) => {
      if (y + 7.5 > PAGE_H - 20) { drawFooter(pdf, 1, 1); pdf.addPage(); drawHeader(pdf, logo, 'Daily Collection Sheet (cont.)', dateLabel, gymName); y = 36 }
      if (i % 2 === 1) { pdf.setFillColor(...ALT_ROW); pdf.rect(MARGIN, y, CONTENT_W, 7.5, 'F') }
      pdf.setDrawColor(...BORDER); pdf.setLineWidth(0.15); pdf.line(MARGIN, y + 7.5, MARGIN + CONTENT_W, y + 7.5)
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5)
      columns.forEach(c => {
        const raw = row[c.key] ?? '—'
        const val = c.fmt ? c.fmt(raw) : raw
        const text = c.align === 'right' ? String(val) : fitText(pdf, val, c.w - 3)
        const tx = c.align === 'right' ? c.x + c.w - 1 : c.x + 2
        // `color` may be a function so a column can take its colour from the
        // value in the row (the payment-type column does).
        const colour = typeof c.color === 'function' ? c.color(row[c.key]) : c.color
        pdf.setTextColor(...(colour || TEXT_DARK))
        if (c.bold) pdf.setFont('helvetica', 'bold')
        pdf.text(text, tx, y + 5, { align: c.align })
        if (c.bold) pdf.setFont('helvetica', 'normal')
      })
      y += 7.5
    })
    y += 5
  }

  const memberCols = [
    { label: 'MEMBER', key: 'member', x: MARGIN, w: 62, align: 'left' },
    { label: 'PACKAGE', key: 'package', x: MARGIN + 62, w: 56, align: 'left' },
    {
      label: 'TYPE', key: 'type', x: MARGIN + 118, w: 42, align: 'left',
      fmt: shortCategory, color: (v) => TONE_RGB[categoryTone(v)],
    },
    { label: 'AMOUNT', key: 'amount_fmt', x: MARGIN + 160, w: CONTENT_W - 160, align: 'right', color: GREEN_DARK, bold: true },
  ]
  const inventoryCols = [
    { label: 'PRODUCT', key: 'product', x: MARGIN, w: 100, align: 'left' },
    { label: 'QTY', key: 'quantity', x: MARGIN + 100, w: 30, align: 'left' },
    { label: 'AMOUNT', key: 'amount_fmt', x: MARGIN + 130, w: CONTENT_W - 130, align: 'right', color: GREEN_DARK, bold: true },
  ]
  const expenseCols = [
    { label: 'DESCRIPTION', key: 'title', x: MARGIN, w: 100, align: 'left' },
    { label: 'CATEGORY', key: 'category', x: MARGIN + 100, w: 60, align: 'left' },
    { label: 'AMOUNT', key: 'amount_fmt', x: MARGIN + 160, w: CONTENT_W - 160, align: 'right', color: RED_DARK, bold: true },
  ]

  const admissionCols = [
    { label: 'MEMBER', key: 'member', x: MARGIN, w: 118, align: 'left' },
    {
      label: 'TYPE', key: 'type', x: MARGIN + 118, w: 42, align: 'left',
      fmt: shortCategory, color: (v) => TONE_RGB[categoryTone(v)],
    },
    { label: 'AMOUNT', key: 'amount_fmt', x: MARGIN + 160, w: CONTENT_W - 160, align: 'right', color: [99, 102, 241], bold: true },
  ]

  const fmtRows = (rows) => rows.map(r => ({ ...r, amount_fmt: fmtNum(r.amount) }))

  section('MEMBER FEES', GREEN_DARK, fmtRows(data.member_fees), memberCols, data.totals.member_fees, 'No member fees collected')
  section('ADMISSION FEES', [99, 102, 241], fmtRows(data.admission_fees), admissionCols, data.totals.admission_fees, 'No admission fees collected')
  section('INVENTORY SALES', [8, 145, 178], fmtRows(data.inventory_sales), inventoryCols, data.totals.inventory_sales, 'No inventory sales')
  section('EXPENSES', RED_DARK, fmtRows(data.expenses), expenseCols, data.totals.total_expenses, 'No expenses recorded')

  // ── Totals box ──────────────────────────────────────────────────────────────
  if (y + 40 > PAGE_H - 20) { drawFooter(pdf, 1, 1); pdf.addPage(); drawHeader(pdf, logo, 'Daily Collection Sheet (cont.)', dateLabel, gymName); y = 36 }
  y += 2

  const boxH = 38
  pdf.setFillColor(...TABLE_HEAD_BG)
  pdf.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, 'F')

  const col1 = MARGIN + CONTENT_W / 2 - 4
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...TEXT_MID)
  pdf.text('Total Collected (IN)', MARGIN + 6, y + 8)
  pdf.text('Total Expenses (OUT)', MARGIN + 6, y + 17)
  pdf.setDrawColor(...BORDER); pdf.setLineWidth(0.3); pdf.line(MARGIN + 4, y + 21, MARGIN + CONTENT_W - 4, y + 21)

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...GREEN_DARK)
  pdf.text(fmtNum(data.totals.total_in), col1, y + 8, { align: 'right' })
  pdf.setTextColor(...RED_DARK)
  pdf.text(fmtNum(data.totals.total_expenses), col1, y + 17, { align: 'right' })

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(...TEXT_MID)
  pdf.text('NET CASH IN HAND', MARGIN + 6, y + 30)
  pdf.setFontSize(13); pdf.setTextColor(...(data.totals.net >= 0 ? GREEN_DARK : RED_DARK))
  pdf.text(fmtNum(data.totals.net), PAGE_W - MARGIN - 6, y + 30, { align: 'right' })

  y += boxH + 10

  // ── Signature line ──────────────────────────────────────────────────────────
  pdf.setDrawColor(...BORDER); pdf.setLineWidth(0.4)
  pdf.line(MARGIN, y, MARGIN + 80, y)
  pdf.line(PAGE_W - MARGIN - 80, y, PAGE_W - MARGIN, y)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...TEXT_MID)
  pdf.text('Collected by', MARGIN, y + 4)
  pdf.text('Verified by', PAGE_W - MARGIN - 80, y + 4)

  const totalPages = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) { pdf.setPage(p); drawFooter(pdf, p, totalPages) }

  pdf.save(`daily-collection-${data.date}.pdf`)
}
