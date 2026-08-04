/* Sample gym for the public demo. Everything the demo shows is generated here,
   in the browser, from a fixed seed — so the tour is identical for every visitor
   and no request ever leaves the page. Shapes mirror the real DRF serializers
   exactly (see backend/apps/<app>/serializers.py); if a field moves there, it moves
   here too. */

// --- deterministic randomness -------------------------------------------------
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- date helpers -------------------------------------------------------------
export const today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
export const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
// `anchorDay` (optional) restores a day an earlier clamp shortened — a 31st
// membership resting on 28 Feb renews to 31 Mar — and is only applied when `d` is
// the last day of its month, so a deliberate mid-month date keeps its day.
export const addMonths = (d, n, anchorDay = null) => {
  const x = new Date(d)
  let day = x.getDate()
  const lastOfMonth = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
  if (anchorDay && day === lastOfMonth) day = Math.max(day, anchorDay)
  x.setDate(1) // avoid setMonth rolling over on a short target month
  x.setMonth(x.getMonth() + n)
  x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()))
  return x
}
export const monthKey = (d) => iso(d).slice(0, 7)

const FIRST = ['Ahmed', 'Bilal', 'Usman', 'Hamza', 'Zain', 'Faizan', 'Talha', 'Danish', 'Saad',
  'Kashif', 'Umair', 'Noman', 'Adeel', 'Rizwan', 'Shahzaib', 'Waleed', 'Hassan', 'Junaid',
  'Imran', 'Salman', 'Arsalan', 'Fahad', 'Owais', 'Moiz', 'Haris', 'Abdullah', 'Yasir', 'Tariq']
const FIRST_F = ['Ayesha', 'Fatima', 'Hira', 'Sana', 'Maryam', 'Zainab', 'Iqra', 'Amna', 'Rabia',
  'Noor', 'Areeba', 'Mahnoor', 'Sadia', 'Anum']
// Every sample person carries the same placeholder number: nothing in the demo
// should look like a real Pakistani mobile someone might actually dial.
const DEMO_PHONE = '03001111111'
const DEMO_CNIC = '35201-1111111-1'

const LAST = ['Khan', 'Ali', 'Ahmed', 'Malik', 'Butt', 'Sheikh', 'Chaudhry', 'Qureshi', 'Raza',
  'Hussain', 'Iqbal', 'Javed', 'Nawaz', 'Rehman', 'Siddiqui', 'Farooq', 'Aslam', 'Mehmood']

const EXPENSE_CATS = {
  RENT: 'Rent',
  UTILITIES: 'Utilities',
  BILLS: 'Bills',
  SALARIES: 'Salaries',
  EQUIPMENT: 'Equipment',
  MAINTENANCE: 'Maintenance',
  MARKETING: 'Marketing',
  INVENTORY: 'Inventory',
  OTHER: 'Other',
}
export const categoryLabel = (c) => EXPENSE_CATS[c] || 'Other'

/* What a gym is billed per WhatsApp message. The real figure is commercial and
   is quoted per gym, so the public demo shows a placeholder — the UI prints
   whatever this is verbatim rather than doing arithmetic on it. */
const WA_RATE = 'X'

export const DEMO_USER = {
  id: 1,
  name: 'Demo Owner',
  email: 'demo@gymistan.dev',
  role: 'GYM_ADMIN',
  is_active: true,
  gym: 1,
  gym_name: 'Iron Republic Gym',
  gym_phone: DEMO_PHONE,
  gym_address: 'Main Boulevard, Gulberg III, Lahore',
  gym_logo: null,
  gym_tier: 'TIER3',            // Elite, so the tour shows WhatsApp + Attendance
  gym_theme: 'blue',
  gym_card: 'onyx',
  gym_background_mode: 'animated',
  gym_background_image: null,
  created_at: '2024-02-01T09:00:00Z',
}

export const DEMO_GYM = {
  id: 1,
  name: 'Iron Republic Gym',
  address: 'Main Boulevard, Gulberg III, Lahore',
  phone: DEMO_PHONE,
  owner_phone: DEMO_PHONE,
  logo: null,
  is_active: true,
  joining_date: '2024-02-01',
  expiry_date: iso(addMonths(today(), 7)),
  subscription_amount: 6000,
  tier: 'TIER3',
  whatsapp_rate: WA_RATE,
  theme_color: 'blue',
  card_color: 'onyx',
  background_mode: 'animated',
  background_image: null,
  wa_allowance: 2000,
  wa_used: 1284,
}

export const TIERS = [
  {
    tier_id: 'TIER1', name: 'Starter', label: 'Tier 1', color: 'sky', sort_order: 0,
    recommended: false, description: 'Everything you need to run a gym',
    features: ['Member management', 'Packages & subscriptions', 'Payment recording',
      'Expenses tracking', 'Inventory management', 'Dashboard & reports',
      'Export to Excel', 'Gender & profile filters'],
    locked: [],
  },
  {
    tier_id: 'TIER2_WA', name: 'Connect', label: 'Tier 2.1', color: 'green', sort_order: 1,
    recommended: false, description: 'Starter + digital payment slips via WhatsApp',
    features: ['Everything in Starter', 'WhatsApp payment slips',
      'Digital receipt sharing', 'Member notification on payment'],
    locked: ['Attendance system'],
  },
  {
    tier_id: 'TIER2_AT', name: 'Track', label: 'Tier 2.2', color: 'violet', sort_order: 2,
    recommended: false, description: 'Starter + member attendance tracking',
    features: ['Everything in Starter', 'Member check-in / check-out',
      'Attendance reports', 'Daily attendance log'],
    locked: ['WhatsApp payment slips'],
  },
  {
    tier_id: 'TIER3', name: 'Elite', label: 'Tier 3', color: 'amber', sort_order: 3,
    recommended: true, description: 'Full package — WhatsApp + Attendance',
    features: ['Everything in Starter', 'WhatsApp payment slips',
      'Member check-in / check-out', 'Attendance reports',
      'Daily attendance log', 'Digital receipt sharing'],
    locked: [],
  },
]

/* ---------------------------------------------------------------------------
   The dataset. Built once per page load and then mutated in place by the demo
   API, so adding a member or taking a payment really does move the dashboard.
--------------------------------------------------------------------------- */
export function buildDataset() {
  const rnd = mulberry32(20260725)
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
  const T = today()

  // --- packages ---
  const packages = [
    { name: 'Monthly — Gym Only', price: 3500, duration_months: 1, has_trainer: false, description: 'Full gym floor access', features: ['Cardio zone', 'Free weights', 'Locker'] },
    { name: 'Monthly — Gym + Cardio', price: 4500, duration_months: 1, has_trainer: false, description: 'Gym floor plus cardio classes', features: ['Cardio classes', 'Free weights', 'Locker'] },
    { name: 'Quarterly Saver', price: 9500, duration_months: 3, has_trainer: false, description: '3 months, one payment', features: ['Everything in Monthly', 'Save PKR 1,000'] },
    { name: 'Half-Yearly', price: 17500, duration_months: 6, has_trainer: false, description: '6 months, best value', features: ['Everything in Monthly', 'Free diet plan'] },
    { name: 'Annual Elite', price: 32000, duration_months: 12, has_trainer: false, description: 'A full year of training', features: ['Everything in Monthly', 'Free kit bag', '2 guest passes'] },
    { name: 'Personal Training — 1 Month', price: 12000, duration_months: 1, has_trainer: true, description: 'Dedicated trainer, 1 month', features: ['Dedicated trainer', 'Custom plan', 'Weekly weigh-in'] },
    { name: 'Personal Training — 3 Months', price: 33000, duration_months: 3, has_trainer: true, description: 'Dedicated trainer, 3 months', features: ['Dedicated trainer', 'Custom plan', 'Diet coaching'] },
    { name: 'Ladies Batch (Evening)', price: 5000, duration_months: 1, has_trainer: false, description: 'Women-only evening slot', features: ['Separate hall', 'Female instructor'] },
  ].map((p, i) => ({
    id: i + 1, gym: 1, is_active: true, ...p,
    created_at: '2024-02-05T10:00:00Z', updated_at: '2024-02-05T10:00:00Z',
  }))

  // --- trainers ---
  const trainers = [
    { name: 'Kamran Sheikh', phone: DEMO_PHONE, monthly_salary: 55000, join_date: '2024-03-05' },
    { name: 'Bilal Anwar', phone: DEMO_PHONE, monthly_salary: 48000, join_date: '2024-06-12' },
    { name: 'Sara Iqbal', phone: DEMO_PHONE, monthly_salary: 52000, join_date: '2024-09-01' },
    { name: 'Waqas Ahmed', phone: DEMO_PHONE, monthly_salary: 40000, join_date: '2025-01-20' },
    { name: 'Hina Rauf', phone: DEMO_PHONE, monthly_salary: 45000, join_date: '2025-04-08' },
    { name: 'Osama Tariq', phone: DEMO_PHONE, monthly_salary: 38000, join_date: '2025-11-15' },
  ].map((t, i) => ({
    id: i + 1, gym: 1, cnic: DEMO_CNIC,
    photo: null, is_active: true, device_user_id: String(200 + i), has_fingerprint: i < 4,
    notes: '', created_at: `${t.join_date}T09:00:00Z`, ...t,
  }))

  // --- members ---
  // A realistic mix: mostly active, a handful expiring in the next few days, and
  // a tail of lapsed members the owner would be chasing.
  const members = []
  const TOTAL = 180
  for (let i = 0; i < TOTAL; i++) {
    const female = rnd() < 0.22
    const name = `${pick(female ? FIRST_F : FIRST)} ${pick(LAST)}`
    const pkg = female && rnd() < 0.6 ? packages[7] : pick(packages)
    const joinedAgo = int(5, 640)
    const join = addDays(T, -joinedAgo)
    let expiry
    const roll = rnd()
    if (roll < 0.1) expiry = addDays(T, int(0, 3))        // expiring in the next 3 days
    else if (roll < 0.24) expiry = addDays(T, -int(1, 70)) // lapsed
    else expiry = addDays(T, int(4, 30 * pkg.duration_months))
    members.push({
      id: i + 1,
      gym: 1,
      member_id: String(i + 1).padStart(5, '0'),
      name,
      phone: DEMO_PHONE,
      gender: female ? 'FEMALE' : 'MALE',
      father_name: `${pick(FIRST)} ${pick(LAST)}`,
      address: pick(['Gulberg III', 'Model Town', 'DHA Phase 5', 'Johar Town', 'Faisal Town',
        'Bahria Town', 'Cantt', 'Iqbal Town']) + ', Lahore',
      photo: null,
      join_date: iso(join),
      expiry_date: iso(expiry),
      package: pkg.id,
      package_name: pkg.name,
      trainer: pkg.has_trainer ? pick(trainers).id : null,
      notes: '',
      is_deleted: false,
      deleted_at: null,
      blacklisted: false,
      blacklist_reason: '',
      blacklist_until: null,
      blacklisted_at: null,
      device_user_id: String(1000 + i),
      has_fingerprint: rnd() < 0.75,
      reminder_sent_for: null,
      // Raised below by the part-paid seed payments.
      dues: 0,
      dues_reminded_for: null,
      created_at: `${iso(join)}T10:00:00Z`,
      updated_at: `${iso(join)}T10:00:00Z`,
      // demo-only: drives the attendance sheet's presence pattern
      _rate: 0.35 + rnd() * 0.55,
    })
  }
  // Two soft-deleted and two blacklisted, so those management lists aren't empty.
  members.push(...[
    { name: 'Faraz Ashraf', deleted: true }, { name: 'Sohail Akhtar', deleted: true },
    { name: 'Nabeel Riaz', black: 'Repeated misuse of equipment' },
    { name: 'Adnan Baig', black: 'Non-payment after multiple reminders' },
  ].map((x, k) => {
    const i = TOTAL + k
    const join = addDays(T, -int(120, 500))
    return {
      id: i + 1, gym: 1, member_id: String(i + 1).padStart(5, '0'), name: x.name,
      phone: DEMO_PHONE, gender: 'MALE',
      father_name: `${pick(FIRST)} ${pick(LAST)}`, address: 'Lahore', photo: null,
      join_date: iso(join), expiry_date: iso(addDays(T, -int(10, 90))),
      package: packages[0].id, package_name: packages[0].name, trainer: null, notes: '',
      is_deleted: !!x.deleted, deleted_at: x.deleted ? addDays(T, -int(3, 40)).toISOString() : null,
      blacklisted: !!x.black, blacklist_reason: x.black || '',
      blacklist_until: x.black ? (k === 2 ? iso(addMonths(T, 6)) : null) : null,
      blacklisted_at: x.black ? addDays(T, -int(5, 60)).toISOString() : null,
      device_user_id: '', has_fingerprint: false, reminder_sent_for: null,
      dues: 0, dues_reminded_for: null,
      created_at: `${iso(join)}T10:00:00Z`, updated_at: `${iso(join)}T10:00:00Z`,
      _rate: 0.2,
    }
  }))

  // --- payments: back-fill six months of renewals ---
  const payments = []
  let payId = 1
  const roster = members.filter((m) => !m.is_deleted)
  for (let monthsBack = 6; monthsBack >= 0; monthsBack--) {
    const base = addMonths(T, -monthsBack)
    // Roughly two in five members renew in any given month — enough volume that
    // the gym reads as comfortably profitable, which is what an owner evaluating
    // the product needs to see.
    const count = monthsBack === 0
      ? Math.round(roster.length * 0.42)
      : int(Math.round(roster.length * 0.38), Math.round(roster.length * 0.48))
    for (let n = 0; n < count; n++) {
      const m = pick(roster)
      const pkg = packages.find((p) => p.id === m.package) || packages[0]
      const day = monthsBack === 0 ? int(1, Math.max(T.getDate(), 1)) : int(1, 28)
      const date = new Date(base.getFullYear(), base.getMonth(), Math.min(day, 28))
      const discount = rnd() < 0.15 ? int(1, 6) * 250 : 0
      const paid = Number(pkg.price) - discount
      payments.push({
        id: payId++, gym: 1, member: m.id, member_name: m.name, member_phone: m.phone,
        package: pkg.id, package_name: pkg.name,
        collected_by: 1, collected_by_name: 'Demo Owner',
        amount: Number(pkg.price), discount, amount_paid: paid,
        admission_amount: 0, dues_amount: 0, remaining: 0,
        is_dues_payment: false, is_joining: false,
        status: 'PAID', payment_method: rnd() < 0.72 ? 'CASH' : 'ONLINE',
        payment_date: iso(date), due_date: null,
        prev_expiry: iso(addMonths(date, -pkg.duration_months)),
        new_expiry: iso(addMonths(date, pkg.duration_months)),
        month: monthKey(date), notes: '', is_rejoin: false,
        slip_sent: rnd() < 0.6, deletable: iso(date) === iso(T),
        created_at: `${iso(date)}T${String(int(10, 20)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00Z`,
      })
    }
  }
  // A few admission fees and a couple of pending dues, for texture.
  for (let n = 0; n < 26; n++) {
    const m = pick(roster)
    const date = addDays(T, -int(0, 150))
    payments.push({
      id: payId++, gym: 1, member: m.id, member_name: m.name, member_phone: m.phone,
      package: null, package_name: null, collected_by: 1, collected_by_name: 'Demo Owner',
      amount: 1500, discount: 0, amount_paid: 1500, status: 'PAID', payment_method: 'CASH',
      admission_amount: 1500, dues_amount: 0, remaining: 0,
      is_dues_payment: false, is_joining: true,
      payment_date: iso(date), due_date: null, prev_expiry: null, new_expiry: null,
      month: monthKey(date), notes: 'Admission fee', is_rejoin: false, slip_sent: true,
      deletable: iso(date) === iso(T), created_at: `${iso(date)}T11:00:00Z`,
    })
  }
  // Joinings where the desk took the admission fee and the first package fee in
  // one go. One payment, one receipt — the ledger shows it whole as
  // "Member + Admission Fee", the daily sheet splits it back into its two totals.
  for (let n = 0; n < 6; n++) {
    const m = pick(roster)
    const pkg = packages.find((p) => p.id === m.package) || packages[0]
    const date = addDays(T, -int(0, 120))
    const admission = 1500
    payments.push({
      id: payId++, gym: 1, member: m.id, member_name: m.name, member_phone: m.phone,
      package: pkg.id, package_name: pkg.name, collected_by: 1, collected_by_name: 'Demo Owner',
      amount: admission + Number(pkg.price), discount: 0,
      amount_paid: admission + Number(pkg.price), status: 'PAID', payment_method: 'CASH',
      admission_amount: admission, dues_amount: 0, remaining: 0,
      is_dues_payment: false, is_joining: true,
      payment_date: iso(date), due_date: null, prev_expiry: null,
      new_expiry: iso(addMonths(date, pkg.duration_months)),
      month: monthKey(date), notes: 'Admission + first payment', is_rejoin: false,
      slip_sent: true, deletable: iso(date) === iso(T),
      created_at: `${iso(date)}T${String(int(9, 19)).padStart(2, '0')}:15:00Z`,
    })
  }
  // Balances coming back in. These buy no time, so they leave the expiry alone —
  // the books call them "Dues Payment" rather than a member fee.
  const settledPicked = new Set()
  for (let n = 0; n < 4; n++) {
    const m = pick(roster)
    if (settledPicked.has(m.id)) continue
    settledPicked.add(m.id)
    const owed = 1000 * int(1, 3)
    const date = addDays(T, -int(1, 60))
    // One of them is still short, to show what a part-settled balance reads like.
    const paid = n === 0 ? Math.round(owed / 2) : owed
    payments.push({
      id: payId++, gym: 1, member: m.id, member_name: m.name, member_phone: m.phone,
      package: null, package_name: null, collected_by: 1, collected_by_name: 'Demo Owner',
      amount: owed, discount: 0, amount_paid: paid,
      status: paid < owed ? 'PARTIAL' : 'PAID', payment_method: 'CASH',
      admission_amount: 0, dues_amount: owed, remaining: owed - paid,
      is_dues_payment: true, is_joining: false,
      payment_date: iso(date), due_date: null, prev_expiry: null, new_expiry: null,
      month: monthKey(date), notes: 'Outstanding dues', is_rejoin: false,
      slip_sent: true, deletable: false, created_at: `${iso(date)}T12:40:00Z`,
    })
    if (paid < owed) m.dues = Number(m.dues || 0) + (owed - paid)
  }
  // Part-payments: the member took the cycle but still owes the rest, so the
  // shortfall is carried on them as dues — that is what fills the dashboard's
  // Outstanding Dues table and turns their badge yellow.
  const duesPicked = new Set()
  for (let n = 0; n < 7; n++) {
    const m = pick(roster)
    if (duesPicked.has(m.id)) continue
    duesPicked.add(m.id)
    const pkg = packages.find((p) => p.id === m.package) || packages[0]
    const date = addDays(T, -int(1, 20))
    const paid = Math.round(Number(pkg.price) / 2)
    const remaining = Number(pkg.price) - paid
    m.dues = remaining
    payments.push({
      id: payId++, gym: 1, member: m.id, member_name: m.name, member_phone: m.phone,
      package: pkg.id, package_name: pkg.name, collected_by: 1, collected_by_name: 'Demo Owner',
      amount: Number(pkg.price), discount: 0, amount_paid: paid,
      admission_amount: 0, dues_amount: 0, remaining,
      is_dues_payment: false, is_joining: false,
      status: 'PARTIAL', payment_method: 'CASH', payment_date: iso(date),
      due_date: iso(addDays(date, 15)), prev_expiry: iso(addMonths(date, -pkg.duration_months)),
      new_expiry: iso(addMonths(date, pkg.duration_months)),
      month: monthKey(date), notes: 'Half now, half on the 15th', is_rejoin: false,
      slip_sent: false, deletable: false, created_at: `${iso(date)}T17:30:00Z`,
    })
  }
  payments.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  // --- products + sales ---
  const products = [
    { name: 'Whey Protein 2lb', category: 'PROTEIN', sell_price: 11500, cost_price: 9800, quantity: 14, low_stock_alert: 4 },
    { name: 'Whey Protein 5lb', category: 'PROTEIN', sell_price: 24500, cost_price: 21000, quantity: 6, low_stock_alert: 3 },
    { name: 'Creatine Monohydrate 300g', category: 'SUPPLEMENTS', sell_price: 6500, cost_price: 5200, quantity: 3, low_stock_alert: 5 },
    { name: 'Pre-Workout 250g', category: 'SUPPLEMENTS', sell_price: 7800, cost_price: 6400, quantity: 9, low_stock_alert: 4 },
    { name: 'BCAA 400g', category: 'SUPPLEMENTS', sell_price: 5900, cost_price: 4700, quantity: 11, low_stock_alert: 4 },
    { name: 'Protein Bar', category: 'SNACKS', sell_price: 450, cost_price: 300, quantity: 84, low_stock_alert: 20 },
    { name: 'Mineral Water 1.5L', category: 'DRINKS', sell_price: 120, cost_price: 80, quantity: 132, low_stock_alert: 30 },
    { name: 'Energy Drink', category: 'DRINKS', sell_price: 250, cost_price: 170, quantity: 46, low_stock_alert: 15 },
    { name: 'Shaker Bottle', category: 'EQUIPMENT', sell_price: 950, cost_price: 600, quantity: 2, low_stock_alert: 5 },
    { name: 'Lifting Straps', category: 'EQUIPMENT', sell_price: 1400, cost_price: 900, quantity: 17, low_stock_alert: 5 },
    { name: 'Gym Gloves', category: 'EQUIPMENT', sell_price: 1800, cost_price: 1150, quantity: 12, low_stock_alert: 4 },
  ].map((p, i) => ({
    id: i + 1, gym: 1, description: '', is_active: true, ...p,
    created_at: '2024-03-01T09:00:00Z', updated_at: '2024-03-01T09:00:00Z',
  }))

  const stockLogs = []
  let logId = 1
  for (let monthsBack = 5; monthsBack >= 0; monthsBack--) {
    const base = addMonths(T, -monthsBack)
    for (let n = 0; n < int(38, 58); n++) {
      const p = pick(products)
      const day = monthsBack === 0 ? int(1, Math.max(T.getDate(), 1)) : int(1, 28)
      const d = new Date(base.getFullYear(), base.getMonth(), Math.min(day, 28), int(10, 21), int(0, 59))
      stockLogs.push({
        id: logId++, product: p.id, product_name: p.name, action: 'SELL',
        quantity: p.sell_price > 5000 ? 1 : int(1, 4), note: '',
        created_by_name: 'Demo Owner', created_at: d.toISOString(),
      })
    }
  }

  // --- expenses ---
  const expenses = []
  let expId = 1
  const push = (title, amount, category, date, description = '') => {
    expenses.push({
      id: expId++, gym: 1, added_by: 1, added_by_name: 'Demo Owner', trainer: null,
      title, amount, category, date: iso(date), description, receipt: null,
      deletable: iso(date) === iso(T),
      created_at: `${iso(date)}T09:00:00Z`, updated_at: `${iso(date)}T09:00:00Z`,
    })
  }
  for (let monthsBack = 6; monthsBack >= 0; monthsBack--) {
    const base = addMonths(T, -monthsBack)
    const on = (day) => new Date(base.getFullYear(), base.getMonth(), Math.min(day, 28))
    if (monthsBack > 0 || T.getDate() >= 3) push('Gym rent', 185000, 'RENT', on(2))
    if (monthsBack > 0 || T.getDate() >= 6) push('Electricity bill (LESCO)', int(58, 96) * 1000, 'UTILITIES', on(5))
    if (monthsBack > 0 || T.getDate() >= 8) push('Internet + water', 9500, 'BILLS', on(7))
    if (monthsBack > 0 || T.getDate() >= 6) push('Trainer salaries', 278000, 'SALARIES', on(5))
    if (monthsBack > 0 || T.getDate() >= 12) push('Housekeeping staff', 34000, 'SALARIES', on(11))
    if (rnd() < 0.55) push(pick(['Treadmill belt service', 'AC servicing', 'Plumbing repair', 'Mirror replacement']), int(6, 34) * 1000, 'MAINTENANCE', on(int(3, 24)))
    if (rnd() < 0.4) push(pick(['New dumbbell set', 'Bench press pads', 'Cable attachments', 'Rubber flooring']), int(25, 140) * 1000, 'EQUIPMENT', on(int(3, 24)))
    if (rnd() < 0.5) push(pick(['Instagram ads', 'Ramzan offer flyers', 'Banner printing', 'Influencer collab']), int(8, 45) * 1000, 'MARKETING', on(int(3, 24)))
    push('Supplement stock purchase', int(90, 260) * 1000, 'INVENTORY', on(int(4, 20)))
    if (rnd() < 0.45) push(pick(['Tea & refreshments', 'Stationery', 'Sound system rental', 'Misc repairs']), int(3, 14) * 1000, 'OTHER', on(int(3, 26)))
  }
  expenses.sort((a, b) => (a.date < b.date ? 1 : -1))

  // --- salary payments (per trainer, last few months) ---
  const salaries = []
  let salId = 1
  trainers.forEach((t) => {
    for (let monthsBack = 5; monthsBack >= 1; monthsBack--) {
      const d = addMonths(T, -monthsBack)
      const day = Math.min(new Date(t.join_date).getDate(), 28)
      const pd = new Date(d.getFullYear(), d.getMonth(), day)
      if (pd < new Date(t.join_date)) continue
      const commission = rnd() < 0.4 ? int(2, 12) * 1000 : 0
      salaries.push({
        id: salId++, trainer: t.id, month: monthKey(pd),
        base_salary: t.monthly_salary, commission, amount: t.monthly_salary + commission,
        payment_date: iso(pd), note: commission ? 'Includes PT commission' : '',
        paid_by_name: 'Demo Owner', created_at: `${iso(pd)}T15:00:00Z`,
      })
    }
  })
  // This month: some paid, some still pending — the page's whole point.
  trainers.slice(0, 3).forEach((t) => {
    const day = Math.min(new Date(t.join_date).getDate(), 28)
    const pd = new Date(T.getFullYear(), T.getMonth(), day)
    if (pd > T) return
    salaries.push({
      id: salId++, trainer: t.id, month: monthKey(T), base_salary: t.monthly_salary,
      commission: 0, amount: t.monthly_salary, payment_date: iso(pd), note: '',
      paid_by_name: 'Demo Owner', created_at: `${iso(pd)}T15:00:00Z`,
    })
  })

  const waTopups = [
    { id: 3, gym: 1, gym_name: DEMO_GYM.name, messages: 1000, carried_over: 216, allowance_after: 1216, rate: WA_RATE, amount: WA_RATE, notes: 'Monthly pack', created_by_name: 'Super Admin', created_at: addDays(T, -18).toISOString() },
    { id: 2, gym: 1, gym_name: DEMO_GYM.name, messages: 1000, carried_over: 84, allowance_after: 1084, rate: WA_RATE, amount: WA_RATE, notes: '', created_by_name: 'Super Admin', created_at: addDays(T, -52).toISOString() },
    { id: 1, gym: 1, gym_name: DEMO_GYM.name, messages: 500, carried_over: 0, allowance_after: 500, rate: WA_RATE, amount: WA_RATE, notes: 'First top-up', created_by_name: 'Super Admin', created_at: addDays(T, -95).toISOString() },
  ]

  const device = {
    name: 'ZKTeco K40 — Main Entrance',
    ip: '192.168.1.201',
    port: 4370,
    password: 0,
    is_active: true,
    last_sync: addDays(T, 0).toISOString(),
    last_sync_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    last_sync_status: 'OK — 37 new punches (0 unknown ids)',
    last_sync_count: 37,
  }

  return {
    gym: { ...DEMO_GYM },
    user: { ...DEMO_USER },
    packages,
    trainers,
    members,
    payments,
    products,
    stockLogs,
    expenses,
    salaries,
    waTopups,
    device,
    tiers: TIERS.map((t) => ({ ...t })),
    // Manual attendance overrides keyed `${kind}:${id}:${date}` → true/false.
    attendanceOverrides: {},
    nextIds: {
      member: members.length + 1,
      payment: payId,
      expense: expId,
      product: products.length + 1,
      trainer: trainers.length + 1,
      package: packages.length + 1,
      stockLog: logId,
      salary: salId,
    },
  }
}

/* Deterministic "was this person in the gym that day?" — no stored rows, so the
   attendance sheet can be asked about any month without a million records. */
export function attended(kind, id, dateStr, rate) {
  let h = 2166136261
  const key = `${kind}:${id}:${dateStr}`
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const v = ((h >>> 0) % 1000) / 1000
  const dow = new Date(`${dateStr}T00:00:00`).getDay()
  const dayFactor = dow === 0 ? 0.45 : dow === 5 ? 0.8 : 1 // quieter Sundays, slow Fridays
  return v < rate * dayFactor
}

/* A stable check-in / check-out pair for a day someone showed up. */
export function punchTimes(kind, id, dateStr) {
  let h = 5381
  const key = `t:${kind}:${id}:${dateStr}`
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0
  const morning = h % 2 === 0
  const inH = morning ? 6 + (h % 3) : 17 + (h % 4)
  const inM = (h >>> 3) % 60
  const dur = 55 + ((h >>> 7) % 50)
  const outTotal = inH * 60 + inM + dur
  const p = (n) => String(n).padStart(2, '0')
  return {
    check_in: `${p(inH)}:${p(inM)}`,
    check_out: `${p(Math.floor(outTotal / 60) % 24)}:${p(outTotal % 60)}`,
  }
}
