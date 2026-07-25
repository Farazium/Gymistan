/* gymistan.dev — the public landing page.
   ------------------------------------------------------------------------
   Deliberately wears the sign-in screen's skin: the same deep-space backdrop,
   starfield, cursor spotlight, floating dumbbells and water-drop click ripple
   (all shared from components/space), the same Blue brand accent pinned on the
   page root, and the same anime.js reveal — staggered fade + rise — except here
   it fires as each section scrolls into view instead of on mount.

   Every claim on this page maps to something the product actually does; the
   feature copy is written off the real modules, and the four plans are the four
   real tiers (see backend/apps/gyms/models.py :: Tier). */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Dumbbell, Users, Package, CreditCard, Receipt, Boxes, BarChart2, UserCog,
  Fingerprint, MessageCircle, ArrowRight, Check, ChevronDown, PlayCircle,
  LogIn, ShieldCheck, Wallet, Clock, Sparkles, Menu, X, CheckCircle2, Mail,
} from 'lucide-react'
import anime from 'animejs/lib/anime.es.js'
import { Starfield, CursorGlow, DumbbellField } from '../../components/space/Scene'
import { PREFERS_REDUCED_MOTION, BRAND_ACCENT, spawnRipple } from '../../components/space/effects'

const CONTACT = {
  // TODO(gymistan): put the real business WhatsApp here (digits only, e.g.
  // '923001234567') and every contact CTA on the page switches back to WhatsApp
  // on its own — button, icon and footer link included. Null means we have no
  // number to send anyone to yet, so the page contacts by email instead.
  whatsapp: null,
  email: 'hello@gymistan.dev',
}

// Where a "talk to us" CTA points: WhatsApp when there's a number, a pre-filled
// email otherwise. Never a dead link, whichever way it falls.
const contactLink = (subject, message) => (CONTACT.whatsapp
  ? `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(message)}`
  : `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}`)

// Every trailing arrow on the page nudges forward when its button is hovered.
// One constant so they all travel the same distance at the same speed; the
// button or link it sits in has to carry `group`.
const ARROW_NUDGE = 'transition-transform duration-300 group-hover:translate-x-1'

/* The app's own .btn-secondary is white — correct inside the product, wrong on
   this dark page, where it reads as a hole punched in the sky. Landing's
   secondary is a ghost button in the brand accent instead, and `fill-from-side`
   (index.css) sweeps that accent in from the left on hover, since a <Link>
   never gets the app-wide fill-from-cursor that real <button>s do. */
const BTN_GHOST = 'btn fill-from-side border border-primary-500/40 bg-primary-500/10 text-primary-200 backdrop-blur-sm hover:border-primary-500 hover:text-white'

/* ---------------------------------------------------------------------------
   Reveal-on-scroll — the login page's entrance animation, triggered by an
   IntersectionObserver so each section arrives as you reach it. Elements opt in
   with data-reveal and start at opacity 0.
--------------------------------------------------------------------------- */
function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = root.querySelectorAll('[data-reveal]')
    if (!targets.length) return
    if (PREFERS_REDUCED_MOTION) {
      targets.forEach((el) => { el.style.opacity = '1' })
      return
    }
    const io = new IntersectionObserver((entries) => {
      const shown = entries.filter((e) => e.isIntersecting).map((e) => e.target)
      if (!shown.length) return
      shown.forEach((el) => io.unobserve(el))
      anime({
        targets: shown,
        opacity: [0, 1],
        translateY: [18, 0],
        delay: anime.stagger(80),
        duration: 750,
        easing: 'easeOutCubic',
      })
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 })
    targets.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return ref
}

// Count up to a number once it's on screen — used for the hero's mock stat tiles.
function Counter({ to, prefix = '', suffix = '', decimals = 0 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (PREFERS_REDUCED_MOTION) {
      el.textContent = `${prefix}${to.toLocaleString('en-PK')}${suffix}`
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return
      io.disconnect()
      const obj = { n: 0 }
      anime({
        targets: obj,
        n: to,
        duration: 1400,
        easing: 'easeOutExpo',
        update: () => {
          const v = decimals
            ? obj.n.toFixed(decimals)
            : Math.round(obj.n).toLocaleString('en-PK')
          el.textContent = `${prefix}${v}${suffix}`
        },
      })
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [to, prefix, suffix, decimals])
  return <span ref={ref}>{prefix}0{suffix}</span>
}

const Section = ({ id, children, className = '' }) => {
  const ref = useReveal()
  return (
    <section id={id} ref={ref} className={`relative mx-auto w-full max-w-6xl px-5 ${className}`}>
      {children}
    </section>
  )
}

const Eyebrow = ({ children }) => (
  <p data-reveal className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-300/90" style={{ opacity: 0 }}>
    {children}
  </p>
)

const Heading = ({ children, sub }) => (
  <>
    <h2 data-reveal className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl" style={{ opacity: 0 }}>
      {children}
    </h2>
    {sub && (
      <p data-reveal className="mt-3 max-w-2xl text-base leading-relaxed text-gray-400" style={{ opacity: 0 }}>
        {sub}
      </p>
    )}
  </>
)

/* --------------------------------- nav ---------------------------------- */
function Nav() {
  const [open, setOpen] = useState(false)
  const [solid, setSolid] = useState(false)

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    ['Features', '#features'],
    ['WhatsApp', '#whatsapp'],
    ['Attendance', '#attendance'],
    ['Plans', '#plans'],
    ['FAQ', '#faq'],
  ]

  return (
    <header
      data-solid
      className={`sticky top-0 z-30 transition-colors duration-300 ${
        solid ? 'border-b border-white/10 bg-slate-950/80 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3.5">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 ring-1 ring-white/10">
            <Dumbbell size={18} className="text-white" strokeWidth={2} />
          </span>
          <span className="text-lg font-bold tracking-tight text-white">Gymistan</span>
        </a>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition hover:bg-primary-500/10 hover:text-gray-100"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link to="/login" className={`group ${BTN_GHOST}`}>
            Sign in
            <LogIn size={15} className={ARROW_NUDGE} />
          </Link>
          <Link to="/demo" className="btn-primary relative overflow-hidden">
            <span className="btn-shimmer-sweep absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <span className="relative inline-flex items-center gap-2">
              <PlayCircle size={15} />
              Live demo
            </span>
          </Link>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="no-fx ml-auto rounded-lg p-2 text-gray-300 transition hover:bg-white/5 md:hidden"
          aria-label="Menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-slate-950/95 px-5 py-3 md:hidden">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 hover:bg-primary-500/10"
            >
              {label}
            </a>
          ))}
          <div className="mt-2 flex gap-2">
            <Link to="/login" className={`${BTN_GHOST} flex-1 justify-center`}>Sign in</Link>
            <Link to="/demo" className="btn-primary flex-1 justify-center">Live demo</Link>
          </div>
        </div>
      )}
    </header>
  )
}

/* --------------------------------- hero --------------------------------- */
function Hero() {
  const ref = useRef(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const targets = root.querySelectorAll('[data-reveal]')
    if (PREFERS_REDUCED_MOTION) {
      targets.forEach((el) => { el.style.opacity = '1' })
      return
    }
    anime({
      targets,
      opacity: [0, 1],
      translateY: [18, 0],
      delay: anime.stagger(90, { start: 120 }),
      duration: 750,
      easing: 'easeOutCubic',
    })
    anime({
      targets: root.querySelector('.logo-glow'),
      opacity: [0.25, 0.6],
      scale: [0.92, 1.1],
      duration: 2200,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    })
    return () => anime.remove(root.querySelectorAll('[data-reveal], .logo-glow'))
  }, [])

  return (
    <section id="top" ref={ref} className="relative mx-auto w-full max-w-6xl px-5 pb-20 pt-16 sm:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <div data-reveal className="mb-6 inline-flex" style={{ opacity: 0 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-3.5 py-1.5 text-xs font-medium text-primary-200 backdrop-blur-sm">
            <Sparkles size={13} />
            Built in Pakistan, for Pakistani gyms
          </span>
        </div>

        <h1
          data-reveal
          className="text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl"
          style={{ opacity: 0 }}
        >
          Everything your gym runs on,{' '}
          <span className="bg-gradient-to-r from-primary-300 via-primary-400 to-primary-200 bg-clip-text text-transparent">
            in one dashboard
          </span>
        </h1>

        <p data-reveal className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400" style={{ opacity: 0 }}>
          Members, packages, fees, expenses, supplements, trainer salaries, biometric
          attendance and WhatsApp receipts — one system, amounts in PKR, and books
          your accountant can actually read.
        </p>

        <div data-reveal className="mt-9 flex flex-wrap items-center justify-center gap-3" style={{ opacity: 0 }}>
          <Link to="/demo" className="group btn-primary relative overflow-hidden !px-6 !py-3 text-base">
            <span className="btn-shimmer-sweep absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <span className="relative inline-flex items-center gap-2">
              <PlayCircle size={18} />
              Try the live demo
              <ArrowRight size={16} className={ARROW_NUDGE} />
            </span>
          </Link>
          <Link to="/login" className={`group ${BTN_GHOST} !px-6 !py-3 text-base`}>
            Sign in
            <LogIn size={17} className={ARROW_NUDGE} />
          </Link>
        </div>

        <p data-reveal className="mt-4 text-xs text-gray-500" style={{ opacity: 0 }}>
          No sign-up, no card. The demo is the real app on a sample gym.
        </p>
      </div>

      {/* A dashboard-shaped preview — a marketing summary of the gym, not a copy
          of any one screen. The figures are the sample gym's real ones, so what a
          visitor reads here is what the demo will show them. */}
      <div
        data-reveal
        data-solid
        className="mt-16 rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6"
        style={{ opacity: 0 }}
      >
        <div className="mb-5 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
          <span className="ml-3 text-xs text-gray-500">Iron Republic Gym · Dashboard</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Active members', node: <Counter to={145} />, icon: Users, tone: 'text-primary-300' },
            { label: 'Collected this month', node: <Counter to={1190000} prefix="PKR " />, icon: Wallet, tone: 'text-green-400' },
            { label: 'Expiring in 3 days', node: <Counter to={10} />, icon: Clock, tone: 'text-yellow-400' },
            { label: 'Attendance today', node: <Counter to={56} suffix="%" />, icon: Fingerprint, tone: 'text-primary-300' },
          ].map(({ label, node, icon: Icon, tone }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <Icon size={16} className={tone} />
              <p className="mt-3 text-xl font-bold text-white sm:text-2xl">{node}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
            <p className="text-sm font-semibold text-gray-200">Six months of cashflow, already booked</p>
            <div className="mt-4 flex h-24 items-end gap-2">
              {[52, 61, 48, 74, 66, 88].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-primary-700/60 to-primary-400/80" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-gray-200">Receipts sent</p>
            <p className="mt-3 text-2xl font-bold text-green-400"><Counter to={1284} /></p>
            <p className="mt-1 text-[11px] text-gray-500">WhatsApp PDF slips, this gym, all-time</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------- features ------------------------------- */
const FEATURES = [
  { icon: Users, title: 'Member management', body: 'Full roster with photos, packages and trainers. Filter by active or expired, by gender, or by who has a trainer — and blacklisted and removed members sit in lists of their own.' },
  { icon: Package, title: 'Packages & subscriptions', body: 'Monthly, quarterly, annual, ladies-only, personal training — any duration and price, with the features each plan includes.' },
  { icon: CreditCard, title: 'Fees & renewals', body: 'Record a payment and the membership renews itself. Discounts, partial payments, admission fees and a printable slip for every one.' },
  { icon: MessageCircle, title: 'WhatsApp receipts', body: 'The payment slip lands on the member’s WhatsApp as a PDF, seconds after they pay. Renewal reminders go the same way.' },
  { icon: Fingerprint, title: 'Biometric attendance', body: 'ZKTeco devices connect straight in. Daily, weekly and monthly sheets for members and trainers, plus a live entrance screen that calls out each scan.' },
  { icon: UserCog, title: 'Trainers & salaries', body: 'Assign trainers to members, track monthly salary, commission and what’s still pending — and every payment books itself as an expense.' },
  { icon: Receipt, title: 'Expense tracking', body: 'Rent, utilities, salaries, equipment, maintenance, marketing — categorised and dated. After 24 hours an entry locks into the books and can no longer be deleted.' },
  { icon: Boxes, title: 'Supplement counter', body: 'Stock, cost and sell price for every product, low-stock alerts, and each sale flowing into revenue and profit automatically.' },
  { icon: BarChart2, title: 'Finance reports', body: 'Ledger, income statement, expense breakdown and a day-by-day collection sheet, each exportable as a PDF. Members, payments, expenses and stock export to Excel.' },
]

function Features() {
  return (
    <Section id="features" className="py-20">
      <Eyebrow>Everything included</Eyebrow>
      <Heading sub="Nine modules that cover the whole day: who trained, who paid, what it cost, and what’s left.">
        One system, not five spreadsheets
      </Heading>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            data-reveal
            data-solid
            className="group rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary-500/40 hover:shadow-lg hover:shadow-primary-500/10"
            style={{ opacity: 0 }}
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-500/15 ring-1 ring-primary-500/25 transition-colors group-hover:bg-primary-500/25">
              <Icon size={20} className="text-primary-300" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">{body}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ------------------------- WhatsApp spotlight --------------------------- */
// A slip arriving on a member's phone, replayed on a loop.
function WhatsAppPhone() {
  // Reduced motion starts on the last frame — the whole conversation, no replay.
  const [step, setStep] = useState(PREFERS_REDUCED_MOTION ? 3 : 0)
  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) return
    let s = 0
    const id = setInterval(() => {
      s = (s + 1) % 5
      setStep(s)
    }, 1500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border border-white/15 bg-slate-950/80 p-2.5 shadow-2xl shadow-black/50">
      <div className="rounded-[1.6rem] bg-[#0b141a] p-3">
        <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white">IR</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-gray-100">Iron Republic Gym</p>
            <p className="text-[10px] text-green-400">online</p>
          </div>
        </div>

        <div className="min-h-[190px] space-y-2 pt-3">
          {step >= 1 && (
            <div className="live-pop max-w-[85%] rounded-xl rounded-tl-sm bg-[#1f2c33] px-3 py-2">
              <p className="text-[11px] leading-snug text-gray-100">
                Assalam-o-Alaikum <b>Hamza Khan</b> 👋 Your payment of{' '}
                <b>PKR 4,500</b> has been received.
              </p>
              <p className="mt-1 text-right text-[9px] text-gray-500">6:41 PM</p>
            </div>
          )}
          {step >= 2 && (
            <div className="live-pop max-w-[85%] rounded-xl rounded-tl-sm bg-[#1f2c33] p-2">
              <div className="flex items-center gap-2 rounded-lg bg-black/30 p-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-red-500/20 text-[9px] font-bold text-red-300">PDF</span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-gray-100">receipt_00187.pdf</p>
                  <p className="text-[9px] text-gray-500">1 page · 48 KB</p>
                </div>
              </div>
              <p className="mt-1 text-right text-[9px] text-gray-500">6:41 PM</p>
            </div>
          )}
          {step >= 3 && (
            <div className="live-pop max-w-[85%] rounded-xl rounded-tl-sm bg-[#1f2c33] px-3 py-2">
              <p className="text-[11px] leading-snug text-gray-100">
                Membership valid till <b>25 Aug 2026</b>. Keep training 💪
              </p>
              <p className="mt-1 flex items-center justify-end gap-1 text-[9px] text-gray-500">
                6:41 PM <CheckCircle2 size={10} className="text-sky-400" />
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WhatsAppSection() {
  return (
    <Section id="whatsapp" className="py-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow>WhatsApp built in</Eyebrow>
          <Heading sub="No more “bhai receipt bhej dena”. The moment a fee is recorded, the member gets a proper PDF slip on WhatsApp — from your gym’s name, with your address and phone on it.">
            The receipt reaches them before they leave the counter
          </Heading>
          <ul className="mt-8 space-y-3">
            {[
              'PDF slips, not plain text — printable, forwardable, and the same file you can download.',
              'Renewal reminders for members expiring in the next few days, one tap from the dashboard.',
              'A welcome slip when someone joins, or rejoins after a break.',
              'Prepaid message credits with a live balance, so a month’s messaging never surprises you.',
            ].map((line) => (
              <li key={line} data-reveal className="flex gap-3 text-sm leading-relaxed text-gray-300" style={{ opacity: 0 }}>
                <Check size={17} className="mt-0.5 flex-shrink-0 text-green-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div data-reveal data-solid style={{ opacity: 0 }}>
          <WhatsAppPhone />
        </div>
      </div>
    </Section>
  )
}

/* ------------------------ Attendance spotlight -------------------------- */
const SCANS = [
  { name: 'Usman Malik', status: 'active', sub: 'Valid till 12 Sep 2026' },
  { name: 'Ayesha Siddiqui', status: 'active', sub: 'Valid till 3 Aug 2026' },
  { name: 'Adeel Nawaz', status: 'expired', sub: 'Expired 18 Jul 2026' },
  { name: 'Kamran Sheikh', status: 'trainer', sub: 'Trainer · Welcome' },
]

function AttendanceSection() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) return
    const id = setInterval(() => setI((v) => (v + 1) % SCANS.length), 2600)
    return () => clearInterval(id)
  }, [])
  const scan = SCANS[i]
  const tone = scan.status === 'expired'
    ? { ring: 'border-red-500/60', bg: 'from-red-500/25', text: 'text-red-300', label: 'EXPIRED' }
    : scan.status === 'trainer'
      ? { ring: 'border-green-500/60', bg: 'from-green-500/25', text: 'text-green-300', label: 'TRAINER' }
      : { ring: 'border-green-500/60', bg: 'from-green-500/25', text: 'text-green-300', label: 'ACTIVE' }

  return (
    <Section id="attendance" className="py-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div data-reveal data-solid className="order-2 lg:order-1" style={{ opacity: 0 }}>
          <div key={i} className={`live-pop rounded-2xl border ${tone.ring} bg-gradient-to-b ${tone.bg} to-slate-900/95 p-8 text-center backdrop-blur-xl`}>
            {scan.status === 'expired'
              ? <X size={52} className={`mx-auto ${tone.text}`} />
              : <CheckCircle2 size={52} className={`mx-auto ${tone.text}`} />}
            <p className="mt-4 text-xl font-bold text-white">{scan.name}</p>
            <span className={`mt-3 inline-block rounded-full border ${tone.ring} bg-white/5 px-3 py-1 text-xs font-semibold ${tone.text}`}>
              {tone.label}
            </span>
            <p className="mt-3 text-sm text-gray-300">{scan.sub}</p>
            <p className="mt-1 text-xs text-gray-500">Checked in at 6:12 PM</p>
          </div>
          <p className="mt-3 text-center text-xs text-gray-500">
            The live entrance screen — with a ting for active and a buzzer for expired.
          </p>
        </div>

        <div className="order-1 lg:order-2">
          <Eyebrow>Attendance that runs itself</Eyebrow>
          <Heading sub="Plug your ZKTeco device into the app and stop keeping a register. Punches sync into daily, weekly and monthly sheets for members and trainers, with per-person rates.">
            The gate knows who walked in
          </Heading>
          <ul className="mt-8 space-y-3">
            {[
              'Enroll a fingerprint from the app — the member just places a finger, nobody types on the keypad.',
              'Live entrance mode announces every scan on screen, expired memberships included.',
              'Attendance sheets for any day, week or month, exportable to Excel.',
              'Per-person attendance rates, and a calendar view on every member’s profile.',
            ].map((line) => (
              <li key={line} data-reveal className="flex gap-3 text-sm leading-relaxed text-gray-300" style={{ opacity: 0 }}>
                <Check size={17} className="mt-0.5 flex-shrink-0 text-green-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

/* --------------------------- why gyms switch ---------------------------- */
const REASONS = [
  { icon: Wallet, title: 'PKR from the ground up', body: 'Every amount, slip and report is in rupees — no conversion, no dollar-shaped software bent to fit.' },
  { icon: ShieldCheck, title: 'Books that stay honest', body: 'A recorded payment, expense or sale has no edit button anywhere in the app — and after 24 hours it can’t be deleted either. Last month stays as it was.' },
  { icon: BarChart2, title: 'Made for your accountant', body: 'Ledger, income statement and daily collection come out in the shape an accountant already expects.' },
  { icon: Sparkles, title: 'Your gym’s colours', body: 'Pick an accent, a card tone and a background. The whole app re-skins to your brand instantly.' },
]

function WhySection() {
  return (
    <Section className="py-20">
      <Eyebrow>Why gym owners switch</Eyebrow>
      <Heading>Built for how gyms here actually work</Heading>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {REASONS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            data-reveal
            data-solid
            className="flex gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-md"
            style={{ opacity: 0 }}
          >
            <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-500/15 ring-1 ring-primary-500/25">
              <Icon size={20} className="text-primary-300" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* -------------------------------- plans --------------------------------- */
// The four real tiers. Prices are quoted per gym, so the CTA opens a conversation
// rather than printing a number that would go stale.
const PLANS = [
  {
    name: 'Starter', label: 'Tier 1', blurb: 'Everything you need to run a gym.',
    features: ['Member management', 'Packages & subscriptions', 'Payment recording & slips',
      'Expense tracking', 'Supplement inventory', 'Dashboard & finance reports', 'Export to Excel'],
    locked: ['WhatsApp receipts', 'Biometric attendance'],
  },
  {
    name: 'Connect', label: 'Tier 2.1', blurb: 'Starter, plus receipts on WhatsApp.',
    features: ['Everything in Starter', 'WhatsApp payment slips', 'Renewal reminders',
      'Welcome messages', 'Prepaid message credits'],
    locked: ['Biometric attendance'],
  },
  {
    name: 'Track', label: 'Tier 2.2', blurb: 'Starter, plus biometric attendance.',
    features: ['Everything in Starter', 'ZKTeco device integration', 'Member & trainer sheets',
      'Live entrance screen', 'Fingerprint enrollment from the app'],
    locked: ['WhatsApp receipts'],
  },
  {
    name: 'Elite', label: 'Tier 3', blurb: 'The full system — WhatsApp and attendance.',
    features: ['Everything in Starter', 'WhatsApp payment slips', 'Renewal reminders',
      'ZKTeco device integration', 'Live entrance screen', 'Attendance reports'],
    locked: [], recommended: true,
  },
]

function Plans() {
  return (
    <Section id="plans" className="py-20">
      <Eyebrow>Plans</Eyebrow>
      <Heading sub="Start with the core system and add WhatsApp, attendance, or both. Move up whenever the gym grows — nothing is re-entered.">
        Pick what your gym needs
      </Heading>

      <div className="mt-12 grid gap-4 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            data-reveal
            data-solid
            className={`relative flex flex-col rounded-2xl border p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 ${
              plan.recommended
                ? 'border-primary-500/50 bg-primary-500/[0.07] shadow-lg shadow-primary-500/10'
                : 'border-white/10 bg-slate-900/60 hover:border-primary-500/30'
            }`}
            style={{ opacity: 0 }}
          >
            {plan.recommended && (
              <span className="absolute -top-2.5 left-6 rounded-full bg-primary-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Most popular
              </span>
            )}
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{plan.label}</p>
            <h3 className="mt-1.5 text-xl font-bold text-white">{plan.name}</h3>
            <p className="mt-2 min-h-[40px] text-sm text-gray-400">{plan.blurb}</p>

            <ul className="mt-5 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2 text-[13px] leading-snug text-gray-300">
                  <Check size={15} className="mt-0.5 flex-shrink-0 text-green-400" />
                  {f}
                </li>
              ))}
              {plan.locked.map((f) => (
                <li key={f} className="flex gap-2 text-[13px] leading-snug text-gray-600">
                  <X size={15} className="mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <a
              href={contactLink(
                `Gymistan ${plan.name} plan — pricing`,
                `Assalam-o-Alaikum, I'd like pricing for the Gymistan ${plan.name} plan.`,
              )}
              target="_blank"
              rel="noreferrer"
              className={`group ${plan.recommended ? 'btn-primary fill-from-side' : BTN_GHOST} mt-6 w-full justify-center`}
            >
              Get pricing
              <ArrowRight size={15} className={ARROW_NUDGE} />
            </a>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* --------------------------------- FAQ ---------------------------------- */
const FAQS = [
  ['Can I try it before paying?',
    'Yes — the Live demo button opens the real application on a sample gym with six months of members, payments, expenses and attendance already in it. Add a member, take a payment, run the reports. Nothing you do there is saved, and no sign-up is needed.'],
  ['Does it work with attendance machines?',
    'It works with ZKTeco fingerprint devices over your local network. You set the device IP once in the app, then punches sync into the attendance sheets. Fingerprints can be enrolled from the app itself, so nobody has to use the device menus.'],
  ['Do members really get their receipt on WhatsApp?',
    'On the WhatsApp plans, yes. The slip is generated as a PDF and delivered to the member’s number through the official WhatsApp Cloud API — the same file you can download or print. Messages run on prepaid credits, and the balance is always visible in the app.'],
  ['Can I track unpaid and expiring members?',
    'The dashboard opens with who is active, who has expired, and who expires in the next three days — with a one-tap reminder for each. The roster filters by status, gender and whether a trainer is assigned, and searches by name, father’s name, phone or member ID.'],
  ['What about my supplement counter and expenses?',
    'Both are in the same system. Products carry cost and sell price, so each sale reports revenue and profit; restocks book themselves as inventory expenses. Rent, bills, salaries, equipment and marketing all sit in categorised expense records.'],
  ['Is my gym’s data separate from other gyms?',
    'Every gym is its own tenant. Each request is scoped to the gym your account belongs to, so one gym’s members, payments and reports are never reachable from another’s login.'],
  ['How do logins work?',
    'Your gym is set up with its own admin login. Accounts are provisioned by us rather than created inside the app, so if you need a separate login for the front desk or your accountant, just ask and we’ll add it.'],
]

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <Section id="faq" className="py-20">
      <Eyebrow>Questions</Eyebrow>
      <Heading>Frequently asked</Heading>
      <div className="mt-10 space-y-3">
        {FAQS.map(([q, a], i) => (
          <div
            key={q}
            data-reveal
            data-solid
            className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-md"
            style={{ opacity: 0 }}
          >
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              className="no-fx flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-primary-500/[0.07]"
            >
              <span className="flex-1 text-sm font-semibold text-gray-100">{q}</span>
              <ChevronDown
                size={17}
                className={`flex-shrink-0 text-primary-300 transition-transform duration-300 ${open === i ? 'rotate-180' : ''}`}
              />
            </button>
            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: open === i ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-4 text-sm leading-relaxed text-gray-400">{a}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ------------------------------ closing CTA ----------------------------- */
function ClosingCta() {
  return (
    <Section className="py-20">
      <div
        data-reveal
        data-solid
        className="relative overflow-hidden rounded-3xl border border-primary-500/25 bg-gradient-to-br from-primary-600/20 via-slate-900/80 to-slate-900/80 p-10 text-center backdrop-blur-xl sm:p-14"
        style={{ opacity: 0 }}
      >
        <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            See it running on a real gym
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-gray-300">
            The demo is the actual application — every page, every report, every
            animation — loaded with a sample gym. Take two minutes and click through it.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/demo" className="btn-primary relative overflow-hidden !px-6 !py-3 text-base">
              <span className="btn-shimmer-sweep absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <span className="relative inline-flex items-center gap-2">
                <PlayCircle size={18} />
                Open the live demo
              </span>
            </Link>
            <a
              href={contactLink(
                'Gymistan for my gym',
                'Assalam-o-Alaikum, I want to know more about Gymistan for my gym.',
              )}
              target="_blank"
              rel="noreferrer"
              className={`group ${BTN_GHOST} !px-6 !py-3 text-base`}
            >
              {CONTACT.whatsapp ? <MessageCircle size={17} /> : <Mail size={17} />}
              Talk to us
            </a>
          </div>
        </div>
      </div>
    </Section>
  )
}

/* -------------------------------- footer -------------------------------- */
function Footer() {
  return (
    <footer data-solid className="relative border-t border-white/10 bg-slate-950/60 backdrop-blur-md">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 ring-1 ring-white/10">
              <Dumbbell size={18} className="text-white" strokeWidth={2} />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">Gymistan</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-gray-400">
            Gym management software built in Pakistan — members, fees, WhatsApp
            receipts, biometric attendance and finance reports in one dashboard.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Product</p>
          <ul className="mt-4 space-y-2 text-sm">
            {[['Features', '#features'], ['Plans', '#plans'], ['FAQ', '#faq']].map(([l, h]) => (
              <li key={h}><a href={h} className="text-gray-400 transition hover:text-primary-300">{l}</a></li>
            ))}
            <li><Link to="/demo" className="text-gray-400 transition hover:text-primary-300">Live demo</Link></li>
            <li><Link to="/login" className="text-gray-400 transition hover:text-primary-300">Sign in</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contact</p>
          <ul className="mt-4 space-y-2 text-sm">
            {CONTACT.whatsapp && (
              <li>
                <a href={contactLink('Gymistan', 'Assalam-o-Alaikum, I want to know more about Gymistan.')}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 text-gray-400 transition hover:text-primary-300">
                  <MessageCircle size={14} /> WhatsApp
                </a>
              </li>
            )}
            <li>
              <a href={`mailto:${CONTACT.email}`} className="inline-flex items-center gap-2 text-gray-400 transition hover:text-primary-300">
                <Mail size={14} /> {CONTACT.email}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 px-5 py-5 text-center text-xs text-gray-500">
        Gymistan © {new Date().getFullYear()} · Gym management, built for Pakistan
      </div>
    </footer>
  )
}

/* --------------------------------- page --------------------------------- */
export default function Landing() {
  const rippleRef = useRef(null)

  // Ripple across the open backdrop only — a tap on a card, the nav or the footer
  // is a tap on content, not on the sky behind it.
  const onRipple = (e) => spawnRipple(e, rippleRef.current, (t) => !!t.closest?.('[data-solid]'))

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-slate-950"
      style={BRAND_ACCENT}
      onPointerDown={onRipple}
    >
      {/* The sign-in screen's scene, fixed behind the whole scroll. */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
        <Starfield />
        <CursorGlow />
        <div className="pointer-events-auto absolute inset-0">
          <DumbbellField count={12} clearCenter={false} />
        </div>
      </div>

      {/* Ripple rings land here — above the scene, never blocking clicks. */}
      <div ref={rippleRef} className="ripple-layer fixed inset-0 z-[5]" />

      <div className="relative z-10">
        <Nav />
        <Hero />
        <Features />
        <WhatsAppSection />
        <AttendanceSection />
        <WhySection />
        <Plans />
        <Faq />
        <ClosingCta />
        <Footer />
      </div>
    </div>
  )
}
