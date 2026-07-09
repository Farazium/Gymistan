// Thermal receipt printing.
//
// Thermal printers install as ordinary OS printers, so we don't need any driver
// or SDK — we render an HTML receipt sized for the paper roll (58mm / 80mm) into
// a hidden iframe and call window.print(). The user picks the thermal printer in
// the browser's print dialog (and can set it as default for one-click printing).

export const PRINT_ENABLED_KEY = 'receiptPrintingEnabled'
export const PAPER_WIDTH_KEY = 'receiptPaperWidth'

export const isPrintingEnabled = () => localStorage.getItem(PRINT_ENABLED_KEY) === '1'
export const setPrintingEnabled = (on) => localStorage.setItem(PRINT_ENABLED_KEY, on ? '1' : '0')
export const getPaperWidth = () => (localStorage.getItem(PAPER_WIDTH_KEY) === '58' ? 58 : 80)
export const setPaperWidth = (w) => localStorage.setItem(PAPER_WIDTH_KEY, String(w))

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const money = (n) => `PKR ${Number(n || 0).toLocaleString('en-PK')}`

const fmtDate = (d) =>
  new Date(d).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })

// One "label ........ value" line.
function row(label, value, { bold = false } = {}) {
  const cls = bold ? ' class="b"' : ''
  return `<div class="row"${cls}><span>${esc(label)}</span><span>${esc(value)}</span></div>`
}

function buildReceiptHtml(r, widthMm) {
  const pad = widthMm === 58 ? '2mm' : '3mm'
  const gymSize = widthMm === 58 ? '18px' : '22px'
  const rows = []
  rows.push(row('Receipt #', String(r.receiptId ?? '—').padStart(5, '0')))
  rows.push(row('Date', fmtDate(r.date || new Date())))
  const info = []
  info.push(row('Member', r.memberName || '—'))
  if (r.memberId) info.push(row('Member ID', String(r.memberId).padStart(5, '0')))
  if (r.phone) info.push(row('Phone', r.phone))
  const pkg = r.packageName ? row('Package', r.packageName) : ''
  const money_rows = []
  money_rows.push(row('Amount', money(r.amount)))
  if (Number(r.discount) > 0) money_rows.push(row('Discount', `- ${money(r.discount)}`))

  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${widthMm}mm; background: #fff; }
  body { font-family: 'Courier New', ui-monospace, monospace; color: #000; padding: 4mm ${pad}; font-size: 12px; line-height: 1.45; }
  .center { text-align: center; }
  .gym { font-size: ${gymSize}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; line-height: 1.15; word-break: break-word; }
  .sub { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-top: 2px; }
  .hr { border-top: 1px dashed #000; margin: 6px 0; }
  .hr2 { border-top: 2px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row span:last-child { text-align: right; white-space: nowrap; }
  .b { font-weight: 800; }
  .total { font-size: ${widthMm === 58 ? '15px' : '17px'}; font-weight: 800; }
  .foot { text-align: center; margin-top: 8px; font-size: 11px; }
</style></head>
<body>
  <div class="center gym">${esc(r.gymName || 'Gym')}</div>
  <div class="center sub">Payment Receipt</div>
  <div class="hr"></div>
  ${rows.join('')}
  <div class="hr"></div>
  ${info.join('')}
  ${pkg ? `<div class="hr"></div>${pkg}` : ''}
  <div class="hr"></div>
  ${money_rows.join('')}
  <div class="hr2"></div>
  <div class="row total"><span>TOTAL PAID</span><span>${esc(money(r.amountPaid))}</span></div>
  <div class="hr"></div>
  ${row('Method', r.method === 'ONLINE' ? 'Online' : 'Cash')}
  ${row('Status', (r.status || 'PAID') === 'PAID' ? 'Paid' : r.status)}
  ${r.collectedBy ? row('Received by', r.collectedBy) : ''}
  <div class="hr"></div>
  <div class="foot">Thank you!</div>
</body></html>`
}

// Render the receipt into a hidden iframe and open the print dialog.
export function printThermalReceipt(receipt, widthMm = getPaperWidth()) {
  const html = buildReceiptHtml(receipt, widthMm)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)

  const cleanup = () => { setTimeout(() => iframe.remove(), 1500) }
  const doPrint = () => {
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } finally {
      cleanup()
    }
  }

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()

  // Let the text lay out, then open the print dialog.
  setTimeout(doPrint, 150)
}
