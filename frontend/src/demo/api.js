/* The demo backend, running in the browser.
   ------------------------------------------------------------------------
   In demo mode the axios instance's adapter is swapped for demoAdapter (see
   api/axios.js), so every screen in the app runs completely unchanged — it still
   calls `/members/`, still gets DRF-shaped JSON back, still writes through
   react-query. The difference is that the JSON comes from demo/data.js instead
   of Django, and writes mutate that in-memory dataset.

   That's deliberate: the demo must be the real product, not a screenshot of it.
   Add a member and the dashboard count moves; take a payment and the ledger,
   income statement and daily collection all follow. */
import {
  buildDataset, attended, punchTimes, categoryLabel,
  today, iso, addDays, addMonths, monthKey,
} from './data'

let db = null
export const data = () => (db ||= buildDataset())
export const resetData = () => { db = buildDataset() }

// --- small helpers ------------------------------------------------------------
const fail = (status, body) => {
  const err = new Error(typeof body === 'string' ? body : body?.detail || 'Demo error')
  err.response = { status, data: typeof body === 'string' ? { detail: body } : body }
  err.isAxiosError = true
  return err
}
const num = (v) => Number(v || 0)
const sum = (arr, f) => arr.reduce((a, x) => a + num(f(x)), 0)
const round2 = (n) => Math.round(n * 100) / 100
const has = (hay, needle) => String(hay || '').toLowerCase().includes(needle)
const dateOf = (isoString) => String(isoString).slice(0, 10)

const memberStatus = (m) => (m.expiry_date && m.expiry_date <= iso(today()) ? 'EXPIRED' : 'ACTIVE')
const blacklistActive = (m) =>
  !!m.blacklisted && (!m.blacklist_until || m.blacklist_until >= iso(today()))

const pkgOf = (id) => data().packages.find((p) => p.id === Number(id)) || null
const trainerOf = (id) => data().trainers.find((t) => t.id === Number(id)) || null
const memberOf = (id) => data().members.find((m) => m.id === Number(id)) || null

// --- serializers (mirroring the DRF ones) ------------------------------------
function memberRow(m) {
  return {
    id: m.id, member_id: m.member_id, name: m.name, phone: m.phone, gender: m.gender,
    father_name: m.father_name, package: m.package,
    package_name: pkgOf(m.package)?.name || null,
    trainer: m.trainer, trainer_name: trainerOf(m.trainer)?.name,
    status: memberStatus(m), expiry_date: m.expiry_date, join_date: m.join_date,
    address: m.address, notes: m.notes, device_user_id: m.device_user_id,
    blacklisted: m.blacklisted, blacklist_active: blacklistActive(m),
    blacklist_reason: m.blacklist_reason, blacklist_until: m.blacklist_until,
    deleted_at: m.deleted_at,
  }
}

function memberDetail(m) {
  const pkg = pkgOf(m.package)
  return {
    ...m,
    _rate: undefined,
    status: memberStatus(m),
    blacklist_active: blacklistActive(m),
    package_detail: pkg ? { ...pkg, member_count: memberCountFor(pkg.id) } : null,
    trainer_name: trainerOf(m.trainer)?.name,
  }
}

const memberCountFor = (packageId) =>
  data().members.filter((m) => !m.is_deleted && m.package === packageId).length

function salaryStatusFor(t, month) {
  const T = today()
  const key = month || monthKey(T)
  const rows = data().salaries.filter((s) => s.trainer === t.id && s.month === key)
  const paidBase = sum(rows, (r) => r.base_salary)
  const totalPaid = sum(rows, (r) => r.amount)
  const expected = num(t.monthly_salary)
  const pending = Math.max(expected - paidBase, 0)
  const status = expected > 0 && paidBase >= expected ? 'PAID' : paidBase > 0 ? 'PARTIAL' : 'PENDING'
  const joinDay = t.join_date ? new Date(`${t.join_date}T00:00:00`).getDate() : 1
  const [y, mo] = key.split('-').map(Number)
  const clampDay = (yy, mm, d) => new Date(yy, mm, 0).getDate() >= d ? d : new Date(yy, mm, 0).getDate()
  const dueDate = new Date(y, mo - 1, clampDay(y, mo, joinDay))
  const nextBase = mo === 12 ? new Date(y + 1, 0, 1) : new Date(y, mo, 1)
  const nextDue = status === 'PAID'
    ? new Date(nextBase.getFullYear(), nextBase.getMonth(),
        clampDay(nextBase.getFullYear(), nextBase.getMonth() + 1, joinDay))
    : dueDate
  return {
    month: key,
    expected: round2(expected),
    paid: round2(totalPaid),
    paid_base: round2(paidBase),
    pending: round2(pending),
    status,
    due_date: iso(dueDate),
    next_due: iso(nextDue),
    is_overdue: status !== 'PAID' && today() > dueDate,
  }
}

function trainerRow(t, detail = false) {
  const row = {
    id: t.id, name: t.name, phone: t.phone, cnic: t.cnic, join_date: t.join_date,
    monthly_salary: t.monthly_salary, photo: t.photo, is_active: t.is_active,
    notes: t.notes, device_user_id: t.device_user_id, has_fingerprint: t.has_fingerprint,
    created_at: t.created_at,
    members_count: data().members.filter((m) => !m.is_deleted && m.trainer === t.id).length,
    salary_status: salaryStatusFor(t),
  }
  if (!detail) return row
  return {
    ...row,
    assigned_members: data().members
      .filter((m) => !m.is_deleted && m.trainer === t.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({
        id: m.id, member_id: m.member_id, name: m.name, phone: m.phone,
        package_name: pkgOf(m.package)?.name || null, expiry_date: m.expiry_date,
      })),
    salary_history: data().salaries
      .filter((s) => s.trainer === t.id)
      .sort((a, b) => (a.payment_date < b.payment_date ? 1 : -1))
      .slice(0, 24),
  }
}

const productRow = (p) => ({ ...p, is_low_stock: p.quantity <= p.low_stock_alert })

// Escalation thresholds copied from apps/gyms/credits.py: nothing until 80% of
// the pack is spent, then low -> high -> critical -> exhausted. `null` below 80%
// is what hides the dashboard banner — an invented level like 'ok' has no entry
// in CREDIT_MESSAGES and crashes the banner.
const ALERT_LEVELS = [[95, 'critical'], [90, 'high'], [80, 'low']]

/* Python's round() breaks exact halves to the nearest EVEN integer, while JS
   Math.round always rounds them up — so 0.5% reads as 0 on the server and 1 in
   the browser. Gym.wa_percent_used is a rounded percentage, so the demo has to
   round the same way or its progress bar drifts a point off the real thing. */
const roundHalfToEven = (n) => {
  const floor = Math.floor(n)
  const frac = n - floor
  if (frac > 0.5) return floor + 1
  if (frac < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

const creditState = () => {
  const g = data().gym
  const remaining = Math.max(g.wa_allowance - g.wa_used, 0)
  const percent = g.wa_allowance
    ? Math.min(roundHalfToEven((g.wa_used * 100) / g.wa_allowance), 100)
    : 100
  const level = remaining <= 0
    ? 'exhausted'
    : ALERT_LEVELS.find(([threshold]) => percent >= threshold)?.[1] ?? null
  return {
    gym: g.id, gym_name: g.name, allowance: g.wa_allowance, used: g.wa_used,
    remaining, percent_used: percent, alert_level: level, exhausted: remaining <= 0,
    rate: g.whatsapp_rate,
  }
}

// --- inventory / cashflow rollups --------------------------------------------
const sellsBetween = (start, end) =>
  data().stockLogs.filter((s) => s.action === 'SELL'
    && dateOf(s.created_at) >= start && dateOf(s.created_at) <= end)

const saleAmount = (s) => {
  const p = data().products.find((x) => x.id === s.product)
  return p ? num(p.sell_price) * s.quantity : 0
}
const saleProfit = (s) => {
  const p = data().products.find((x) => x.id === s.product)
  return p ? (num(p.sell_price) - num(p.cost_price)) * s.quantity : 0
}

// --- dashboard ---------------------------------------------------------------
function dashboard() {
  const T = today()
  const todayStr = iso(T)
  const monthStart = iso(new Date(T.getFullYear(), T.getMonth(), 1))
  const lastMonth = addMonths(T, -1)
  const lastMonthStart = iso(new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1))
  const EXPIRY_WINDOW = 3
  const soonEnd = iso(addDays(T, EXPIRY_WINDOW))

  const roster = data().members.filter((m) => !m.is_deleted)
  const active = roster.filter((m) => m.expiry_date > todayStr)
  const expired = roster.filter((m) => m.expiry_date <= todayStr)
  const expiring = roster.filter((m) => m.expiry_date > todayStr && m.expiry_date <= soonEnd)

  const pays = data().payments
  const revThis = sum(pays.filter((p) => p.payment_date >= monthStart), (p) => p.amount_paid)
  const revLast = sum(pays.filter((p) => p.payment_date >= lastMonthStart && p.payment_date < monthStart), (p) => p.amount_paid)
  const expThis = sum(data().expenses.filter((e) => e.date >= monthStart), (e) => e.amount)

  const products = data().products.filter((p) => p.is_active)
  const invValue = sum(products, (p) => num(p.sell_price) * p.quantity)
  const salesThis = sellsBetween(monthStart, todayStr)
  const salesLast = sellsBetween(lastMonthStart, iso(addDays(new Date(T.getFullYear(), T.getMonth(), 1), -1)))
  const invRevThis = sum(salesThis, saleAmount)
  const invRevLast = sum(salesLast, saleAmount)
  const invProfitThis = sum(salesThis, saleProfit)

  const totalThis = revThis + invRevThis
  const totalLast = revLast + invRevLast

  // Plan-gated blocks, mirroring DashboardView: null when the tier doesn't
  // include the feature, so the card is absent rather than showing a zero.
  const tier = data().gym.tier
  const attendance = ['TIER2_AT', 'TIER3'].includes(tier)
    ? (() => {
        const sheet = attendanceSheet({ scope: 'daily', date: todayStr })
        return {
          present_today: sheet.stats.present,
          total_members: sheet.stats.total,
          rate: sheet.stats.rate,
        }
      })()
    : null
  const whatsapp = ['TIER2_WA', 'TIER3'].includes(tier)
    ? {
        receipts_total: data().gym.wa_used,
        receipts_this_month: data().payments.filter((p) => p.slip_sent && p.payment_date >= monthStart).length,
      }
    : null

  return {
    attendance,
    whatsapp,
    members: {
      active: active.length,
      expired: expired.length,
      expiring_soon: expiring.length,
      new_this_month: roster.filter((m) => m.join_date >= monthStart).length,
      total: roster.length,
    },
    revenue: {
      this_month: round2(totalThis),
      last_month: round2(totalLast),
      growth: totalLast ? Math.round(((totalThis - totalLast) / totalLast) * 1000) / 10 : 0,
    },
    expenses: { this_month: round2(expThis) },
    net_profit: round2(totalThis - expThis),
    inventory: {
      total_products: products.length,
      low_stock_count: products.filter((p) => p.quantity <= p.low_stock_alert).length,
      stock_value: round2(invValue),
      revenue_this_month: round2(invRevThis),
      profit_this_month: round2(invProfitThis),
    },
    recent_payments: pays.slice(0, 5).map((p) => ({
      id: p.id, member_name: p.member_name || '—', amount_paid: num(p.amount_paid),
      status: p.status, payment_date: p.payment_date,
    })),
    members_expiring_soon: expiring
      .sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1))
      .slice(0, 10)
      .map((m) => ({
        id: m.id, name: m.name, phone: m.phone, expiry_date: m.expiry_date,
        reminder_sent: m.reminder_sent_for === m.expiry_date,
      })),
  }
}

// --- finance -----------------------------------------------------------------
const clampRange = (params) => {
  const T = today()
  const def = { start: iso(new Date(T.getFullYear(), T.getMonth(), 1)), end: iso(T) }
  const start = /^\d{4}-\d{2}-\d{2}$/.test(params.start || '') ? params.start : def.start
  let end = /^\d{4}-\d{2}-\d{2}$/.test(params.end || '') ? params.end : def.end
  if (end > iso(T)) end = iso(T)
  return { start, end }
}

function ledger(params) {
  const { start, end } = clampRange(params)
  const entries = []
  for (const p of data().payments) {
    if (p.payment_date < start || p.payment_date > end) continue
    const admission = String(p.notes || '').toLowerCase() === 'admission fee'
    entries.push({
      date: p.payment_date, description: p.member_name || 'Unknown Member',
      category: admission ? 'Admission Fee' : 'Member Fee', type: 'IN', amount: num(p.amount_paid),
    })
  }
  for (const s of sellsBetween(start, end)) {
    entries.push({
      date: dateOf(s.created_at),
      description: data().products.find((x) => x.id === s.product)?.name || 'Product',
      category: 'Inventory Sale', type: 'IN', amount: round2(saleAmount(s)),
    })
  }
  for (const e of data().expenses) {
    if (e.date < start || e.date > end) continue
    entries.push({
      date: e.date, description: e.title, category: categoryLabel(e.category),
      type: 'OUT', amount: num(e.amount),
    })
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : -1))
  const totalIn = sum(entries.filter((e) => e.type === 'IN'), (e) => e.amount)
  const totalOut = sum(entries.filter((e) => e.type === 'OUT'), (e) => e.amount)
  return { entries, total_in: round2(totalIn), total_out: round2(totalOut), net: round2(totalIn - totalOut) }
}

function incomeStatement(params) {
  const T = today()
  const year = Number(params.year) || T.getFullYear()
  const month = params.month ? Number(params.month) : null
  const start = month ? iso(new Date(year, month - 1, 1)) : iso(new Date(year, 0, 1))
  let end = month
    ? iso(new Date(year, month, 0))
    : iso(new Date(year, 11, 31))
  if (end > iso(T)) end = iso(T)

  const memberRevenue = sum(
    data().payments.filter((p) => p.status === 'PAID' && p.payment_date >= start && p.payment_date <= end),
    (p) => p.amount_paid,
  )
  const inventoryRevenue = sum(sellsBetween(start, end), saleAmount)
  const cats = {}
  for (const e of data().expenses) {
    if (e.date < start || e.date > end) continue
    const label = categoryLabel(e.category)
    cats[label] = (cats[label] || 0) + num(e.amount)
  }
  const totalExpenses = Object.values(cats).reduce((a, b) => a + b, 0)
  const totalRevenue = memberRevenue + inventoryRevenue
  return {
    period: { start, end, year, month },
    revenue: {
      member_fees: round2(memberRevenue),
      inventory_sales: round2(inventoryRevenue),
      total: round2(totalRevenue),
    },
    expenses: {
      by_category: Object.entries(cats)
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => ({ name, amount: round2(amount) })),
      total: round2(totalExpenses),
    },
    net_profit: round2(totalRevenue - totalExpenses),
  }
}

function expenseCategories(params) {
  const { start, end } = clampRange(params)
  const groups = {}
  for (const e of [...data().expenses].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (e.date < start || e.date > end) continue
    const label = categoryLabel(e.category)
    groups[label] ||= { total: 0, count: 0, entries: [] }
    groups[label].total += num(e.amount)
    groups[label].count += 1
    groups[label].entries.push({ date: e.date, title: e.title, amount: num(e.amount) })
  }
  const total = Object.values(groups).reduce((a, g) => a + g.total, 0)
  const categories = Object.entries(groups)
    .map(([category, g]) => ({
      category, pct: total ? Math.round((g.total / total) * 1000) / 10 : 0, ...g,
    }))
    .sort((a, b) => b.total - a.total)
  return { categories, total: round2(total) }
}

function dailyCollection(params) {
  const T = today()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : iso(T)
  const memberFees = []
  const admissionFees = []
  for (const p of data().payments) {
    if (p.payment_date !== date) continue
    const entry = { member: p.member_name || 'Unknown', package: p.package_name || '—', amount: num(p.amount_paid) }
    if (String(p.notes || '').toLowerCase() === 'admission fee') admissionFees.push(entry)
    else memberFees.push(entry)
  }
  const inventorySales = sellsBetween(date, date).map((s) => ({
    product: data().products.find((x) => x.id === s.product)?.name || 'Product',
    quantity: s.quantity,
    amount: round2(saleAmount(s)),
  }))
  const expenses = data().expenses
    .filter((e) => e.date === date)
    .map((e) => ({ title: e.title, category: categoryLabel(e.category), amount: num(e.amount) }))

  const totalIn = sum(memberFees, (x) => x.amount) + sum(admissionFees, (x) => x.amount)
    + sum(inventorySales, (x) => x.amount)
  const totalOut = sum(expenses, (x) => x.amount)
  return {
    date,
    member_fees: memberFees,
    admission_fees: admissionFees,
    inventory_sales: inventorySales,
    expenses,
    totals: {
      member_fees: round2(sum(memberFees, (x) => x.amount)),
      admission_fees: round2(sum(admissionFees, (x) => x.amount)),
      inventory_sales: round2(sum(inventorySales, (x) => x.amount)),
      expenses: round2(totalOut),
      total_in: round2(totalIn),
      net: round2(totalIn - totalOut),
    },
  }
}

// --- attendance --------------------------------------------------------------
function rangeFor(scope, date) {
  const d = new Date(`${date}T00:00:00`)
  if (scope === 'weekly') {
    const dow = (d.getDay() + 6) % 7 // Monday-first
    const start = addDays(d, -dow)
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    return { start, end: days[6], days }
  }
  if (scope === 'monthly') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const days = []
    for (let x = new Date(start); x <= end; x = addDays(x, 1)) days.push(new Date(x))
    return { start, end, days }
  }
  return { start: d, end: d, days: [d] }
}

function attendanceSheet(params) {
  const T = today()
  const todayStr = iso(T)
  const kind = params.type === 'trainer' ? 'trainer' : 'member'
  const scope = ['daily', 'weekly', 'monthly'].includes(params.scope) ? params.scope : 'daily'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : todayStr
  const { start, end, days } = rangeFor(scope, date)
  const dayStrs = days.map(iso)

  let people = kind === 'trainer'
    ? data().trainers.filter((t) => t.is_active).map((t) => ({ id: t.id, name: t.name, code: t.device_user_id || '', rate: 0.7 }))
    : data().members.filter((m) => !m.is_deleted).map((m) => ({ id: m.id, name: m.name, code: m.member_id || '', rate: m._rate ?? 0.6 }))
  people.sort((a, b) => a.name.localeCompare(b.name))
  if (params.id) people = people.filter((p) => String(p.id) === String(params.id))

  const overrides = data().attendanceOverrides
  const present = (p, ds) => {
    const o = overrides[`${kind}:${p.id}:${ds}`]
    if (o !== undefined) return o
    return attended(kind, p.id, ds, p.rate)
  }

  const elapsed = dayStrs.filter((ds) => ds <= todayStr)
  const rows = people.map((p) => {
    const cells = {}
    for (const ds of dayStrs) {
      if (ds > todayStr) { cells[ds] = { status: 'upcoming' }; continue }
      cells[ds] = present(p, ds)
        ? { status: 'present', ...punchTimes(kind, p.id, ds) }
        : { status: 'absent' }
    }
    const pres = elapsed.filter((ds) => cells[ds].status === 'present').length
    return {
      id: p.id, name: p.name, code: p.code, days: cells,
      present: pres, total: elapsed.length,
      rate: Math.round((pres / (elapsed.length || 1)) * 100),
    }
  })

  const dailyTotals = dayStrs.map((ds) => ({
    date: ds,
    present: ds > todayStr ? 0 : people.filter((p) => present(p, ds)).length,
    upcoming: ds > todayStr,
  }))

  const totalPeople = people.length
  const presentRecords = sum(rows, (r) => r.present)
  const possible = totalPeople * (elapsed.length || 1)

  let stats
  if (scope === 'daily') {
    const presentToday = dailyTotals[0]?.present || 0
    stats = {
      total: totalPeople, present: presentToday, absent: totalPeople - presentToday,
      rate: Math.round((presentToday / (totalPeople || 1)) * 100),
    }
  } else {
    const t = dailyTotals.find((x) => x.date === todayStr)
    stats = {
      total: totalPeople,
      present_today: t ? t.present : null,
      avg_daily: Math.round(presentRecords / (elapsed.length || 1)),
      rate: Math.round((presentRecords / (possible || 1)) * 100),
    }
  }

  return {
    type: kind, scope, date,
    range: { start: iso(start), end: iso(end) },
    days: dayStrs, rows, daily_totals: dailyTotals, stats,
  }
}

/* Live entrance feed. The demo has no device, so we invent one: every few
   seconds someone off the roster "scans in", which is exactly what the real
   monitor hands the UI. */
const live = { seq: 0, events: [], last: 0, started: 0 }
function liveFeed(after) {
  const now = Date.now()
  if (!live.started) { live.started = now; live.last = now }
  if (now - live.last > 4200) {
    live.last = now
    const roster = data().members.filter((m) => !m.is_deleted)
    const useTrainer = Math.random() < 0.12
    const unknown = Math.random() < 0.07
    const at = new Date()
    const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    live.seq += 1
    if (unknown) {
      live.events.push({ seq: live.seq, time, kind: 'unknown', name: 'ID 4417', status: 'unknown' })
    } else if (useTrainer) {
      const t = data().trainers[Math.floor(Math.random() * data().trainers.length)]
      live.events.push({ seq: live.seq, time, kind: 'trainer', name: t.name, status: 'trainer', expiry: null })
    } else {
      const m = roster[Math.floor(Math.random() * roster.length)]
      const expired = memberStatus(m) === 'EXPIRED'
      live.events.push({ seq: live.seq, time, kind: 'member', name: m.name,
        status: expired ? 'expired' : 'active', expiry: m.expiry_date })
      // A scan is also attendance — mark them in for today.
      data().attendanceOverrides[`member:${m.id}:${iso(today())}`] = true
    }
    if (live.events.length > 60) live.events = live.events.slice(-60)
  }
  return {
    enabled: true,
    seq: live.seq,
    events: live.events.filter((e) => e.seq > after),
    error: null,
  }
}

// --- fingerprint enrollment simulation ---------------------------------------
const enroll = { state: 'idle', message: '', at: 0, target: null }
function enrollTick() {
  if (enroll.state !== 'running') return
  const elapsed = Date.now() - enroll.at
  if (elapsed > 6500) {
    enroll.state = 'done'
    enroll.message = 'Fingerprint enrolled'
    if (enroll.target) {
      const { kind, id } = enroll.target
      const person = kind === 'trainer' ? trainerOf(id) : memberOf(id)
      if (person) person.has_fingerprint = true
    }
  } else if (elapsed > 4000) {
    enroll.message = 'Third scan — hold still…'
  } else if (elapsed > 2000) {
    enroll.message = 'Second scan — place the same finger again'
  }
}

// --- payment slip (a real PDF, generated client-side) ------------------------
async function slipPdf(id) {
  const payment = data().payments.find((p) => p.id === Number(id))
  if (!payment) throw fail(404, 'Payment not found')
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a5' })
  const g = data().gym
  const money = (n) => `PKR ${Number(n || 0).toLocaleString('en-PK')}`
  let y = 48
  doc.setFontSize(20).setFont(undefined, 'bold').text(g.name, 40, y)
  y += 18
  doc.setFontSize(9).setFont(undefined, 'normal').text(`${g.address}  ·  ${g.phone}`, 40, y)
  y += 26
  doc.setDrawColor(200).line(40, y, 380, y)
  y += 26
  doc.setFontSize(14).setFont(undefined, 'bold').text('Payment Receipt', 40, y)
  y += 24
  doc.setFontSize(10).setFont(undefined, 'normal')
  const rows = [
    ['Receipt #', String(payment.id).padStart(5, '0')],
    ['Date', payment.payment_date],
    ['Member', payment.member_name || '—'],
    ['Phone', payment.member_phone || '—'],
    ['Package', payment.package_name || '—'],
    ['Amount', money(payment.amount)],
    ['Discount', money(payment.discount)],
    ['Paid', money(payment.amount_paid)],
    ['Method', payment.payment_method],
    ['Status', payment.status],
  ]
  if (payment.new_expiry) rows.push(['Valid till', payment.new_expiry])
  for (const [k, v] of rows) {
    doc.text(k, 40, y)
    doc.text(String(v), 200, y)
    y += 18
  }
  y += 12
  doc.setDrawColor(200).line(40, y, 380, y)
  y += 22
  doc.setFontSize(8).setTextColor(120)
    .text('Sample receipt from the Gymistan demo — not a real transaction.', 40, y)
  return doc.output('blob')
}

/* ---------------------------------------------------------------------------
   The router. `path` has the /api prefix already stripped by the adapter.
--------------------------------------------------------------------------- */
export async function handle({ method, path, params, body }) {
  const m = (re) => re.exec(path)
  const T = today()
  let mm   // holds the current path match while the route table is walked

  // ---------------- auth ----------------
  if (method === 'post' && path === '/auth/login/') {
    return { user: data().user, access: 'demo-access-token', refresh: 'demo-refresh-token' }
  }
  if (method === 'get' && path === '/auth/me/') return data().user
  if (method === 'patch' && path === '/auth/me/') {
    if (body?.name) data().user.name = body.name
    return data().user
  }
  if (method === 'post' && path === '/auth/change-password/') {
    throw fail(400, { detail: 'Passwords are read-only in the demo.' })
  }

  // ---------------- dashboard & finance ----------------
  if (method === 'get' && path === '/dashboard/') return dashboard()
  if (method === 'get' && path === '/dashboard/finance/ledger/') return ledger(params)
  if (method === 'get' && path === '/dashboard/finance/income-statement/') return incomeStatement(params)
  if (method === 'get' && path === '/dashboard/finance/expense-categories/') return expenseCategories(params)
  if (method === 'get' && path === '/dashboard/finance/daily-collection/') return dailyCollection(params)
  if (method === 'get' && path === '/dashboard/superadmin/') throw fail(403, 'Not available in the demo')

  // ---------------- members ----------------
  if (method === 'get' && path === '/members/next-id/') {
    const used = new Set(data().members.map((x) => Number(x.member_id)).filter(Boolean))
    let n = 1
    while (used.has(n)) n++
    return { next_id: String(n).padStart(5, '0') }
  }
  if (method === 'get' && path === '/members/deleted/') {
    return data().members.filter((x) => x.is_deleted).map(memberRow)
  }
  if (method === 'get' && path === '/members/blacklisted/') {
    return data().members
      .filter((x) => !x.is_deleted && x.blacklisted)
      .sort((a, b) => (String(a.blacklisted_at) < String(b.blacklisted_at) ? 1 : -1))
      .map(memberRow)
  }
  if (method === 'get' && path === '/members/') {
    let rows = data().members.filter((x) => !x.is_deleted && !x.blacklisted)
    if (params.status === 'ACTIVE') rows = rows.filter((x) => memberStatus(x) === 'ACTIVE')
    if (params.status === 'EXPIRED') rows = rows.filter((x) => memberStatus(x) === 'EXPIRED')
    if (params.package) rows = rows.filter((x) => String(x.package) === String(params.package))
    if (params.gender) rows = rows.filter((x) => x.gender === params.gender)
    // `has_trainer` (not a trainer id) is what the roster filter sends — see
    // MemberListCreateView.get_queryset.
    if (params.has_trainer === 'true') rows = rows.filter((x) => x.trainer != null)
    else if (params.has_trainer === 'false') rows = rows.filter((x) => x.trainer == null)
    // Search is one field at a time, chosen by `search_by`, exactly as the
    // backend does it — a phone search must not match a name.
    if (params.search) {
      const q = String(params.search).trim().toLowerCase()
      const field = ['name', 'father_name', 'phone', 'member_id'].includes(params.search_by)
        ? params.search_by
        : 'name'
      rows = rows.filter((x) => has(x[field], q))
    }
    const ord = params.ordering || '-created_at'
    const key = ord.replace('-', '')
    const dir = ord.startsWith('-') ? -1 : 1
    rows = [...rows].sort((a, b) => (String(a[key] ?? '') < String(b[key] ?? '') ? -dir : dir))
    return rows.map(memberRow)
  }
  if ((mm = m(/^\/members\/(\d+)\/$/))) {
    const member = memberOf(mm[1])
    if (!member) throw fail(404, 'Not found')
    if (method === 'get') return memberDetail(member)
    if (method === 'patch') {
      // FormData (photo upload) can't be persisted meaningfully in the demo.
      const patch = body instanceof FormData ? Object.fromEntries(body.entries()) : (body || {})
      delete patch.photo
      Object.assign(member, patch)
      if (patch.package) member.package = Number(patch.package)
      if ('trainer' in patch) member.trainer = patch.trainer ? Number(patch.trainer) : null
      member.updated_at = new Date().toISOString()
      return memberDetail(member)
    }
    if (method === 'delete') {
      member.is_deleted = true
      member.deleted_at = new Date().toISOString()
      member.has_fingerprint = false
      return null
    }
  }
  if (method === 'post' && path === '/members/') {
    const patch = body instanceof FormData ? Object.fromEntries(body.entries()) : (body || {})
    const pkg = pkgOf(patch.package)
    if (pkg?.has_trainer && !patch.trainer) {
      throw fail(400, { trainer: ['This package includes a trainer — please select one.'] })
    }
    if (data().members.some((x) => x.phone === patch.phone && !x.is_deleted)) {
      throw fail(400, { phone: ['A member with this phone number already exists.'] })
    }
    const id = data().nextIds.member++
    const join = patch.join_date || iso(T)
    const member = {
      id, gym: 1,
      member_id: patch.member_id || String(id).padStart(5, '0'),
      name: patch.name, phone: patch.phone, gender: patch.gender || 'MALE',
      father_name: patch.father_name || '', address: patch.address || '', photo: null,
      join_date: join,
      expiry_date: patch.expiry_date || iso(addMonths(new Date(`${join}T00:00:00`), pkg?.duration_months || 1)),
      package: pkg?.id ?? null,
      trainer: patch.trainer ? Number(patch.trainer) : null,
      notes: patch.notes || '', is_deleted: false, deleted_at: null,
      blacklisted: false, blacklist_reason: '', blacklist_until: null, blacklisted_at: null,
      device_user_id: '', has_fingerprint: false, reminder_sent_for: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      _rate: 0.65,
    }
    data().members.push(member)
    // An admission fee, if one was collected, is its own payment record.
    const fee = Number(patch.admission_fee || 0)
    if (fee > 0) {
      const pid = data().nextIds.payment++
      data().payments.unshift({
        id: pid, gym: 1, member: id, member_name: member.name, member_phone: member.phone,
        package: null, package_name: null, collected_by: 1, collected_by_name: data().user.name,
        amount: fee, discount: 0, amount_paid: fee, status: 'PAID', payment_method: 'CASH',
        payment_date: iso(T), due_date: null, prev_expiry: null, new_expiry: null,
        month: monthKey(T), notes: 'Admission fee', is_rejoin: false,
        slip_sent: String(patch.send_welcome) === 'true', deletable: true,
        created_at: new Date().toISOString(),
      })
      if (String(patch.send_welcome) === 'true') spendCredit()
    }
    return memberDetail(member)
  }
  if ((mm = m(/^\/members\/(\d+)\/hard-delete\/$/)) && method === 'delete') {
    const i = data().members.findIndex((x) => x.id === Number(mm[1]))
    if (i < 0) throw fail(404, 'Not found')
    data().members.splice(i, 1)
    return null
  }
  if ((mm = m(/^\/members\/(\d+)\/restore\/$/)) && method === 'post') {
    const member = memberOf(mm[1])
    if (!member) throw fail(404, 'Not found')
    Object.assign(member, {
      is_deleted: false, deleted_at: null, blacklisted: false,
      blacklist_reason: '', blacklist_until: null, blacklisted_at: null,
    })
    if (body?.join_date) member.join_date = body.join_date
    if (body?.package) member.package = Number(body.package)
    if ('trainer' in (body || {})) member.trainer = body.trainer ? Number(body.trainer) : null
    if (body?.expiry_date) member.expiry_date = body.expiry_date
    if (Number(body?.admission_fee || 0) > 0) {
      const fee = Number(body.admission_fee)
      data().payments.unshift({
        id: data().nextIds.payment++, gym: 1, member: member.id, member_name: member.name,
        member_phone: member.phone, package: null, package_name: null, collected_by: 1,
        collected_by_name: data().user.name, amount: fee, discount: 0, amount_paid: fee,
        status: 'PAID', payment_method: 'CASH', payment_date: iso(T), due_date: null,
        prev_expiry: null, new_expiry: null, month: monthKey(T), notes: 'Admission fee',
        is_rejoin: true, slip_sent: false, deletable: true, created_at: new Date().toISOString(),
      })
    }
    if (String(body?.send_welcome) === 'true') spendCredit()
    return { detail: 'Member restored' }
  }
  if ((mm = m(/^\/members\/(\d+)\/blacklist\/$/))) {
    const member = memberOf(mm[1])
    if (!member) throw fail(404, 'Not found')
    if (method === 'post') {
      const reason = String(body?.reason || '').trim()
      if (!reason) throw fail(400, { reason: 'A reason is required' })
      let until = null
      if (!(String(body?.indefinite) === 'true' || body?.indefinite === true)) {
        const months = Number(body?.duration_months)
        if (!Number.isInteger(months) || months < 1) {
          throw fail(400, { duration_months: 'Duration must be at least 1 month' })
        }
        until = iso(addMonths(T, months))
      }
      Object.assign(member, {
        blacklisted: true, blacklist_reason: reason, blacklist_until: until,
        blacklisted_at: new Date().toISOString(),
      })
      return memberDetail(member)
    }
    if (method === 'delete') {
      Object.assign(member, {
        blacklisted: false, blacklist_reason: '', blacklist_until: null, blacklisted_at: null,
      })
      return memberDetail(member)
    }
  }
  if ((mm = m(/^\/members\/(\d+)\/reminder\/$/)) && method === 'post') {
    const member = memberOf(mm[1])
    if (!member) throw fail(404, { message: 'Member not found' })
    if (creditState().exhausted) {
      throw fail(402, { message: 'Out of WhatsApp credits', out_of_credits: true })
    }
    if (member.reminder_sent_for === member.expiry_date) {
      throw fail(400, { message: 'Reminder already sent for this expiry' })
    }
    member.reminder_sent_for = member.expiry_date
    spendCredit()
    return { message: 'Reminder sent', reminder_sent: true }
  }

  // ---------------- packages ----------------
  if (method === 'get' && path === '/packages/') {
    return data().packages.map((p) => ({ ...p, member_count: memberCountFor(p.id) }))
  }
  if (method === 'post' && path === '/packages/') {
    const pkg = {
      id: data().nextIds.package++, gym: 1, name: body.name, description: body.description || '',
      price: Number(body.price), duration_months: Number(body.duration_months) || 1,
      features: body.features || [], has_trainer: !!body.has_trainer,
      is_active: body.is_active !== false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    data().packages.push(pkg)
    return { ...pkg, member_count: 0 }
  }
  if ((mm = m(/^\/packages\/(\d+)\/$/))) {
    const pkg = pkgOf(mm[1])
    if (!pkg) throw fail(404, 'Not found')
    if (method === 'patch') {
      Object.assign(pkg, body, { price: body.price !== undefined ? Number(body.price) : pkg.price })
      return { ...pkg, member_count: memberCountFor(pkg.id) }
    }
    if (method === 'delete') {
      if (memberCountFor(pkg.id)) {
        throw fail(400, { detail: 'Members are still on this package — move them first.' })
      }
      data().packages = data().packages.filter((p) => p.id !== pkg.id)
      return null
    }
    if (method === 'get') return { ...pkg, member_count: memberCountFor(pkg.id) }
  }

  // ---------------- payments ----------------
  if (method === 'get' && path === '/payments/') {
    let rows = data().payments
    if (params.member) rows = rows.filter((p) => String(p.member) === String(params.member))
    if (params.package) rows = rows.filter((p) => String(p.package) === String(params.package))
    if (params.status) rows = rows.filter((p) => p.status === params.status)
    if (params.search) {
      const q = String(params.search).toLowerCase()
      rows = rows.filter((p) => has(p.member_name, q) || has(p.member_phone, q) || has(p.month, q))
    }
    return rows
  }
  if ((mm = m(/^\/payments\/(\d+)\/slip\/$/)) && method === 'get') return slipPdf(mm[1])
  if ((mm = m(/^\/payments\/(\d+)\/whatsapp\/$/)) && method === 'post') {
    const p = data().payments.find((x) => x.id === Number(mm[1]))
    if (!p) throw fail(404, { message: 'Payment not found' })
    if (creditState().exhausted) {
      throw fail(402, { message: 'Out of WhatsApp credits', out_of_credits: true })
    }
    p.slip_sent = true
    spendCredit()
    return { message: 'Slip sent' }
  }
  if (method === 'post' && path === '/payments/') {
    const member = memberOf(body.member)
    if (!member) throw fail(400, { member: ['Select a member'] })
    const pkg = pkgOf(body.package)
    const amount = Number(body.amount || 0)
    const discount = Number(body.discount || 0)
    const paid = Number(body.amount_paid ?? amount - discount)
    if (discount > amount) throw fail(400, { discount: ['Discount cannot exceed the amount'] })
    const status = body.status || 'PAID'
    const prevExpiry = member.expiry_date
    let newExpiry = null
    if (status === 'PAID' && pkg) {
      // Renew from the later of today and the current expiry, like the backend.
      const base = prevExpiry && prevExpiry > iso(T) ? new Date(`${prevExpiry}T00:00:00`) : T
      newExpiry = iso(addMonths(base, pkg.duration_months))
      member.expiry_date = newExpiry
      member.reminder_sent_for = null
    }
    const payment = {
      id: data().nextIds.payment++, gym: 1, member: member.id, member_name: member.name,
      member_phone: member.phone, package: pkg?.id ?? null, package_name: pkg?.name ?? null,
      collected_by: 1, collected_by_name: data().user.name,
      amount, discount, amount_paid: paid, status,
      payment_method: body.payment_method || 'CASH', payment_date: iso(T),
      due_date: body.due_date || null, prev_expiry: prevExpiry, new_expiry: newExpiry,
      month: monthKey(T), notes: body.notes || '', is_rejoin: false, slip_sent: false,
      deletable: true, created_at: new Date().toISOString(),
    }
    data().payments.unshift(payment)
    return payment
  }
  if ((mm = m(/^\/payments\/(\d+)\/$/)) && method === 'delete') {
    const p = data().payments.find((x) => x.id === Number(mm[1]))
    if (!p) throw fail(404, 'Not found')
    if (!p.deletable) {
      throw fail(403, { detail: 'This payment is more than 24 hours old and is now a permanent record; it can no longer be deleted.' })
    }
    data().payments = data().payments.filter((x) => x.id !== p.id)
    return null
  }

  // ---------------- expenses ----------------
  if (method === 'get' && path === '/expenses/') {
    let rows = data().expenses
    if (params.category) rows = rows.filter((e) => e.category === params.category)
    if (params.month) rows = rows.filter((e) => Number(e.date.slice(5, 7)) === Number(params.month))
    if (params.year) rows = rows.filter((e) => Number(e.date.slice(0, 4)) === Number(params.year))
    if (params.search) {
      const q = String(params.search).toLowerCase()
      rows = rows.filter((e) => has(e.title, q) || has(e.description, q))
    }
    return rows
  }
  if (method === 'post' && path === '/expenses/') {
    const amount = Number(body.amount || 0)
    if (amount <= 0) throw fail(400, { amount: ['Amount must be greater than 0'] })
    if (body.date && body.date > iso(T)) throw fail(400, { date: ['Date cannot be in the future'] })
    const expense = {
      id: data().nextIds.expense++, gym: 1, added_by: 1, added_by_name: data().user.name,
      trainer: null, title: body.title, amount, category: body.category || 'OTHER',
      date: body.date || iso(T), description: body.description || '', receipt: null,
      deletable: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    data().expenses.unshift(expense)
    return expense
  }
  if ((mm = m(/^\/expenses\/(\d+)\/$/)) && method === 'delete') {
    const e = data().expenses.find((x) => x.id === Number(mm[1]))
    if (!e) throw fail(404, 'Not found')
    if (!e.deletable) {
      throw fail(403, { detail: 'This expense is more than 24 hours old and is now a permanent record; it can no longer be deleted.' })
    }
    data().expenses = data().expenses.filter((x) => x.id !== e.id)
    return null
  }

  // ---------------- inventory ----------------
  if (method === 'get' && path === '/inventory/sales/') {
    return data().stockLogs
      .filter((s) => s.action === 'SELL')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((s) => {
        const p = data().products.find((x) => x.id === s.product)
        return {
          id: s.id, product: p?.name || 'Product', quantity: s.quantity,
          unit_price: num(p?.sell_price), amount: round2(saleAmount(s)),
          date: s.created_at, deletable: dateOf(s.created_at) === iso(T),
        }
      })
  }
  if ((mm = m(/^\/inventory\/sales\/(\d+)\/$/)) && method === 'delete') {
    const s = data().stockLogs.find((x) => x.id === Number(mm[1]))
    if (!s) throw fail(404, 'Not found')
    if (dateOf(s.created_at) !== iso(T)) {
      throw fail(403, { detail: 'This sale is more than 24 hours old and is now a permanent record; it can no longer be deleted.' })
    }
    const p = data().products.find((x) => x.id === s.product)
    if (p) p.quantity += s.quantity
    data().stockLogs = data().stockLogs.filter((x) => x.id !== s.id)
    return null
  }
  if (method === 'get' && path === '/inventory/') {
    let rows = data().products
    if (params.category) rows = rows.filter((p) => p.category === params.category)
    if (params.is_active !== undefined && params.is_active !== '') {
      const want = String(params.is_active) === 'true'
      rows = rows.filter((p) => p.is_active === want)
    }
    if (params.search) {
      const q = String(params.search).toLowerCase()
      rows = rows.filter((p) => has(p.name, q))
    }
    return rows.map(productRow)
  }
  if (method === 'post' && path === '/inventory/') {
    const product = {
      id: data().nextIds.product++, gym: 1, name: body.name,
      category: body.category || 'OTHER', description: body.description || '',
      sell_price: Number(body.sell_price || 0), cost_price: Number(body.cost_price || 0),
      quantity: Number(body.quantity || 0), low_stock_alert: Number(body.low_stock_alert || 5),
      is_active: body.is_active !== false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    data().products.push(product)
    if (product.quantity > 0 && product.cost_price > 0) {
      data().expenses.unshift({
        id: data().nextIds.expense++, gym: 1, added_by: 1, added_by_name: data().user.name,
        trainer: null, title: `${product.name} — Initial stock`,
        amount: product.cost_price * product.quantity, category: 'INVENTORY',
        date: iso(T), description: 'Initial stock', receipt: null, deletable: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
    }
    return productRow(product)
  }
  if ((mm = m(/^\/inventory\/(\d+)\/adjust\/$/)) && method === 'post') {
    const p = data().products.find((x) => x.id === Number(mm[1]))
    if (!p) throw fail(404, 'Not found')
    const qty = Number(body.quantity)
    const action = body.action
    if (!Number.isInteger(qty) || qty < 0) throw fail(400, { detail: 'Quantity must be a whole number' })
    if (qty === 0 && action !== 'ADJUSTMENT') throw fail(400, { detail: 'Quantity must be greater than 0' })
    if (action === 'SELL') {
      if (p.quantity < qty) throw fail(400, { detail: 'Not enough stock' })
      p.quantity -= qty
    } else if (action === 'RESTOCK') {
      p.quantity += qty
      data().expenses.unshift({
        id: data().nextIds.expense++, gym: 1, added_by: 1, added_by_name: data().user.name,
        trainer: null, title: `${p.name} — Restock`, amount: num(p.cost_price) * qty,
        category: 'INVENTORY', date: iso(T), description: 'Restock', receipt: null,
        deletable: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
    } else if (action === 'ADJUSTMENT') {
      p.quantity = qty
    } else {
      throw fail(400, { detail: 'Invalid action' })
    }
    data().stockLogs.unshift({
      id: data().nextIds.stockLog++, product: p.id, product_name: p.name, action,
      quantity: qty, note: body.note || '', created_by_name: data().user.name,
      created_at: new Date().toISOString(),
    })
    return productRow(p)
  }
  if ((mm = m(/^\/inventory\/(\d+)\/logs\/$/)) && method === 'get') {
    return data().stockLogs
      .filter((s) => s.product === Number(mm[1]))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((s) => ({
        id: s.id, action: s.action, quantity: s.quantity, note: s.note,
        created_by_name: s.created_by_name, created_at: s.created_at,
      }))
  }
  if ((mm = m(/^\/inventory\/(\d+)\/$/))) {
    const p = data().products.find((x) => x.id === Number(mm[1]))
    if (!p) throw fail(404, 'Not found')
    if (method === 'get') return productRow(p)
    if (method === 'patch') { Object.assign(p, body); return productRow(p) }
    if (method === 'delete') {
      data().products = data().products.filter((x) => x.id !== p.id)
      return null
    }
  }

  // ---------------- trainers ----------------
  if (method === 'get' && path === '/trainers/') {
    let rows = data().trainers
    if (params.is_active !== undefined && params.is_active !== '') {
      rows = rows.filter((t) => t.is_active === (String(params.is_active) === 'true'))
    }
    if (params.search) {
      const q = String(params.search).toLowerCase()
      rows = rows.filter((t) => has(t.name, q) || has(t.phone, q) || has(t.cnic, q))
    }
    return rows.map((t) => trainerRow(t))
  }
  if (method === 'post' && path === '/trainers/') {
    const patch = body instanceof FormData ? Object.fromEntries(body.entries()) : (body || {})
    const t = {
      id: data().nextIds.trainer++, gym: 1, name: patch.name, phone: patch.phone || '',
      cnic: patch.cnic || '', join_date: patch.join_date || iso(T),
      monthly_salary: Number(patch.monthly_salary || 0), photo: null,
      is_active: patch.is_active !== false && patch.is_active !== 'false',
      device_user_id: '', has_fingerprint: false, notes: patch.notes || '',
      created_at: new Date().toISOString(),
    }
    data().trainers.push(t)
    return trainerRow(t)
  }
  if ((mm = m(/^\/trainers\/(\d+)\/pay-salary\/$/)) && method === 'post') {
    const t = trainerOf(mm[1])
    if (!t) throw fail(404, 'Not found')
    const base = Number(body?.base_salary ?? t.monthly_salary)
    const commission = Number(body?.commission || 0)
    if (base < 0 || commission < 0) throw fail(400, { detail: 'Amounts cannot be negative' })
    if (base + commission <= 0) throw fail(400, { detail: 'Total must be greater than 0' })
    const paymentDate = body?.payment_date || iso(T)
    const key = paymentDate.slice(0, 7)
    const status = salaryStatusFor(t, key)
    if (iso(T) < status.due_date) {
      throw fail(400, { detail: `Salary for that month isn't due yet — it can be paid on or after ${status.due_date}.` })
    }
    data().salaries.unshift({
      id: data().nextIds.salary++, trainer: t.id, month: key, base_salary: base,
      commission, amount: base + commission, payment_date: paymentDate,
      note: body?.note || '', paid_by_name: data().user.name, created_at: new Date().toISOString(),
    })
    data().expenses.unshift({
      id: data().nextIds.expense++, gym: 1, added_by: 1, added_by_name: data().user.name,
      trainer: t.id, title: `${t.name} — Salary`, amount: base + commission,
      category: 'SALARIES', date: paymentDate,
      description: `Salary for ${key}${commission > 0 ? ` (incl. commission PKR ${commission.toLocaleString('en-PK')})` : ''}`,
      receipt: null, deletable: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    return trainerRow(t, true)
  }
  if ((mm = m(/^\/trainers\/(\d+)\/$/))) {
    const t = trainerOf(mm[1])
    if (!t) throw fail(404, 'Not found')
    if (method === 'get') return trainerRow(t, true)
    if (method === 'patch') {
      const patch = body instanceof FormData ? Object.fromEntries(body.entries()) : (body || {})
      delete patch.photo
      Object.assign(t, patch)
      if (patch.monthly_salary !== undefined) t.monthly_salary = Number(patch.monthly_salary)
      return trainerRow(t, true)
    }
    if (method === 'delete') {
      data().members.forEach((x) => { if (x.trainer === t.id) x.trainer = null })
      data().trainers = data().trainers.filter((x) => x.id !== t.id)
      return null
    }
  }

  // ---------------- gyms / plan / WhatsApp credits ----------------
  if (method === 'get' && path === '/gyms/tiers/') return data().tiers
  if (method === 'get' && path === '/gyms/whatsapp-billing/') {
    return { credits: creditState(), topups: data().waTopups }
  }
  if ((mm = m(/^\/gyms\/(\d+)\/$/)) && method === 'patch') {
    const patch = body instanceof FormData ? Object.fromEntries(body.entries()) : (body || {})
    delete patch.logo
    delete patch.background_image
    Object.assign(data().gym, patch)
    // Appearance lives on the user payload too — keep /auth/me/ in step so the
    // theme/surface the visitor picks survives a page change.
    const u = data().user
    if (patch.theme_color) u.gym_theme = patch.theme_color
    if (patch.card_color) u.gym_card = patch.card_color
    if (patch.background_mode) u.gym_background_mode = patch.background_mode
    if (patch.name) u.gym_name = patch.name
    if (patch.phone) u.gym_phone = patch.phone
    if (patch.address) u.gym_address = patch.address
    return { ...data().gym, member_count: data().members.filter((x) => !x.is_deleted).length, user_count: 1 }
  }

  // ---------------- attendance ----------------
  if (method === 'get' && path === '/attendance/') return attendanceSheet(params)
  if (method === 'post' && path === '/attendance/mark/') {
    const kind = body?.type === 'trainer' ? 'trainer' : 'member'
    const date = body?.date || iso(T)
    const present = !(body?.present === false || String(body?.present) === 'false')
    data().attendanceOverrides[`${kind}:${body?.id}:${date}`] = present
    return { message: present ? 'present' : 'cleared' }
  }
  if (path === '/attendance/device/') {
    if (method === 'get') return data().device
    if (method === 'put') { Object.assign(data().device, body); return data().device }
  }
  if (method === 'post' && path === '/attendance/device/ping/') {
    return { online: true, message: 'Device reachable (simulated)' }
  }
  if (method === 'post' && path === '/attendance/device/sync/') {
    const applied = 3 + Math.floor(Math.random() * 12)
    data().device.last_sync_at = new Date().toISOString()
    data().device.last_sync_count = applied
    data().device.last_sync_status = `OK — ${applied} new punches (0 unknown ids)`
    return {
      message: data().device.last_sync_status,
      summary: { applied, skipped_unknown: 0, latest: new Date().toISOString() },
    }
  }
  if (method === 'post' && path === '/attendance/device/push/') {
    let assigned = 0
    let next = 1
    const used = new Set([...data().members, ...data().trainers]
      .map((p) => Number(p.device_user_id)).filter(Boolean))
    for (const p of [...data().members.filter((x) => !x.is_deleted), ...data().trainers]) {
      if (!p.device_user_id) {
        while (used.has(next)) next++
        p.device_user_id = String(next)
        used.add(next)
        assigned++
      }
    }
    const pushed = data().members.filter((x) => !x.is_deleted).length + data().trainers.length
    return {
      message: `Pushed ${pushed} people to the device${assigned ? ` — ${assigned} got a new device ID` : ''}`,
      pushed, assigned, errors: [],
    }
  }
  if (method === 'get' && path === '/attendance/device/users/') {
    const users = [...data().members.filter((x) => !x.is_deleted && x.device_user_id),
      ...data().trainers.filter((x) => x.device_user_id)]
      .slice(0, 40)
      .map((p) => ({
        uid: Number(p.device_user_id), user_id: p.device_user_id, name: p.name,
        privilege: 0, card: 0,
        mapped_to: { type: p.member_id ? 'member' : 'trainer', id: p.id, name: p.name },
      }))
    return { users }
  }
  if (method === 'get' && path === '/attendance/device/live/') {
    return liveFeed(Number(params.after || 0))
  }
  if (path === '/attendance/device/enroll/') {
    if (method === 'post') {
      enroll.state = 'running'
      enroll.at = Date.now()
      enroll.message = 'Place finger on the sensor 3 times…'
      enroll.target = { kind: body?.type === 'trainer' ? 'trainer' : 'member', id: body?.id }
      return { started: true, message: enroll.message }
    }
    if (method === 'get') { enrollTick(); return { state: enroll.state, message: enroll.message } }
    if (method === 'patch') { enroll.state = 'cancelled'; return { cancelled: true } }
    if (method === 'delete') {
      const kind = body?.type === 'trainer' ? 'trainer' : 'member'
      const person = kind === 'trainer' ? trainerOf(body?.id) : memberOf(body?.id)
      if (person) person.has_fingerprint = false
      return { removed: true }
    }
  }
  if (method === 'get' && path === '/attendance/device/fingerprint/') {
    const kind = params.type === 'trainer' ? 'trainer' : 'member'
    const person = kind === 'trainer' ? trainerOf(params.id) : memberOf(params.id)
    if (!person) throw fail(404, { message: 'Not found' })
    return { enrolled: !!person.has_fingerprint, checked: true }
  }

  throw fail(404, { detail: `The demo doesn't cover ${method.toUpperCase()} ${path}` })
}

// Every WhatsApp send burns one prepaid credit, same as production.
function spendCredit() {
  const g = data().gym
  if (g.wa_used < g.wa_allowance) g.wa_used += 1
}
