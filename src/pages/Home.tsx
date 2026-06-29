import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDarkModeStore } from '../store/darkModeStore'
import { useAuthStore } from '../store/authStore'

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

function DashboardMockup() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.06)] overflow-hidden text-left">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
        <span className="w-[11px] h-[11px] rounded-full bg-[#E6655C]" />
        <span className="w-[11px] h-[11px] rounded-full bg-[#E5B33E]" />
        <span className="w-[11px] h-[11px] rounded-full bg-[#5BB872]" />
        <span className="mx-auto font-mono text-[11.5px] text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md px-8 py-[3px]">
          www.desklycrm.com/dashboard
        </span>
      </div>

      {/* App body */}
      <div className="flex h-[380px]">
        {/* Mini sidebar */}
        <div className="w-[172px] shrink-0 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 p-[10px] flex flex-col gap-[3px]">
          <div className="flex items-center gap-2 px-2 mb-2">
            <img src="/favicon.svg" alt="Deskly" className="w-[22px] h-[22px] shrink-0" />
            <span className="text-[13px] font-bold text-gray-900 dark:text-white">Deskly</span>
          </div>
          <div className="relative flex items-center justify-between px-[9px] py-[7px] rounded-lg bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 text-[12.5px] font-semibold">
            <span className="absolute top-2 bottom-2 w-[3px] rounded-full bg-primary-600" style={{ left: '-2px' }} />
            Dashboard
          </div>
          <div className="flex items-center justify-between px-[9px] py-[7px] rounded-lg text-gray-500 dark:text-gray-400 text-[12.5px]">
            Contacts
            <span className="font-mono text-[10.5px] text-gray-400">124</span>
          </div>
          <div className="flex items-center justify-between px-[9px] py-[7px] rounded-lg text-gray-500 dark:text-gray-400 text-[12.5px]">
            Deals
            <span className="font-mono text-[10.5px] text-gray-400">12</span>
          </div>
          <div className="flex items-center justify-between px-[9px] py-[7px] rounded-lg text-gray-500 dark:text-gray-400 text-[12.5px]">
            Tasks
            <span className="bg-[#C9524B] text-white text-[9.5px] font-semibold rounded-full px-1.5 py-px">3</span>
          </div>
        </div>

        {/* Mini main content */}
        <div className="flex-1 bg-gray-50 dark:bg-gray-950 py-[18px] px-5 overflow-hidden">
          <p className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-gray-400">Tuesday · June 25</p>
          <p className="text-[17px] font-bold tracking-tight text-gray-900 dark:text-white mt-1 mb-3.5">Good morning, Maria.</p>

          <div className="grid gap-2.5 mb-2.5" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
            {/* Pipeline card */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[10px] py-[15px] px-4">
              <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-gray-400">Open pipeline value</span>
              <p className="text-[28px] font-bold tracking-tight text-gray-900 dark:text-white mt-1 tabular-nums">$48,500</p>
              <div className="h-1.5 rounded bg-gray-100 dark:bg-gray-800 mt-3 overflow-hidden">
                <div className="h-full rounded bg-gradient-to-r from-primary-600 to-primary-400" style={{ width: '81%' }} />
              </div>
              <div className="flex gap-1 mt-3">
                <div className="h-1 rounded" style={{ flex: 8, background: '#8A8275' }} />
                <div className="h-1 rounded" style={{ flex: 6, background: '#2E72C8' }} />
                <div className="h-1 rounded" style={{ flex: 4, background: '#6D5BD0' }} />
                <div className="h-1 rounded" style={{ flex: 2, background: '#C8841F' }} />
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-2.5">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[10px] py-3 px-[14px]">
                <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-gray-400">Contacts</span>
                <p className="text-[19px] font-bold text-gray-900 dark:text-white mt-0.5 tabular-nums">124</p>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[10px] py-3 px-[14px]">
                <span className="font-mono text-[9px] tracking-[0.08em] uppercase text-gray-400">Won this month</span>
                <p className="text-[19px] font-bold text-gray-900 dark:text-white mt-0.5 tabular-nums">$23,800</p>
              </div>
            </div>
          </div>

          {/* Alert task */}
          <div
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-[9px] py-[11px] px-[14px]"
            style={{ borderLeft: '3px solid #C9524B' }}
          >
            <p className="font-mono text-[9px] tracking-[0.08em] uppercase" style={{ color: '#C9524B' }}>Needs you today</p>
            <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white mt-1">Call Acme Corp back · due yesterday</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const features = [
  {
    icon: (
      <div className="w-[38px] h-[38px] rounded-[10px] bg-primary-50 dark:bg-primary-950 flex items-center justify-center">
        <svg width="20" height="18" viewBox="0 0 20 18" fill="none">
          <circle cx="10" cy="5.5" r="3.5" fill="#4F46E5" />
          <path d="M2 17c0-3.866 3.582-7 8-7s8 3.134 8 7" fill="#4F46E5" />
        </svg>
      </div>
    ),
    title: 'Contacts that stay tidy',
    desc: 'A fast, scannable register of every person and company - with custom columns, smart search, and a full history on each one.',
  },
  {
    icon: (
      <div className="w-[38px] h-[38px] rounded-[10px] bg-[#EDE9F9] dark:bg-violet-950 flex items-end justify-center gap-[3px] pb-[11px]">
        <span className="w-1 rounded-sm" style={{ height: '9px', background: '#6D5BD0' }} />
        <span className="w-1 rounded-sm" style={{ height: '15px', background: '#6D5BD0' }} />
        <span className="w-1 rounded-sm" style={{ height: '12px', background: 'rgba(109,91,208,0.6)' }} />
      </div>
    ),
    title: 'A pipeline you can read',
    desc: 'Drag deals across stages on a Kanban board with live column totals. Color is a quiet signal, never noise.',
  },
  {
    icon: (
      <div className="w-[38px] h-[38px] rounded-[10px] bg-[#FAEEDC] dark:bg-amber-950 flex items-center justify-center">
        <div className="w-[15px] h-[15px] border-2 rounded-[5px] flex items-center justify-center" style={{ borderColor: '#C8841F' }}>
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <path d="M1 3L3 5L7 1" stroke="#C8841F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    title: 'Tasks that nudge you',
    desc: 'Overdue, today, upcoming - grouped automatically and surfaced on your dashboard so nothing quietly slips.',
  },
  {
    icon: (
      <div className="w-[38px] h-[38px] rounded-[10px] bg-[#E7F3EC] dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-lg">
        ✉
      </div>
    ),
    title: 'Gmail, synced',
    desc: 'Conversations land on the right contact automatically, so the whole team sees one honest thread of activity.',
  },
  {
    icon: (
      <div className="w-[38px] h-[38px] rounded-[10px] bg-[#E9EEF6] dark:bg-blue-950 flex items-center justify-center">
        <span className="w-[13px] h-[13px] rounded-full bg-[#2E72C8]" />
        <span className="w-[13px] h-[13px] rounded-full -ml-[5px]" style={{ background: 'rgba(46,114,200,0.45)' }} />
      </div>
    ),
    title: 'Built for a team',
    desc: "Invite the whole crew, share one workspace, and always know who's talking to whom. Per-seat pricing, no surprises.",
  },
  {
    icon: (
      <div className="w-[38px] h-[38px] rounded-[10px] bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
          <circle cx="8.5" cy="8.5" r="6" stroke="#8A8275" strokeWidth="2" strokeLinecap="round" strokeDasharray="11 8" />
        </svg>
      </div>
    ),
    title: 'Gentle automations',
    desc: 'Stale-deal alerts, follow-up reminders and auto-logged emails. Helpful prompts, never a rules engine to babysit.',
  },
]

export default function Home() {
  const { isDark, toggle } = useDarkModeStore()
  const user      = useAuthStore(s => s.user)
  const isLoading = useAuthStore(s => s.isLoading)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isLoggedIn = !isLoading && !!user

  return (
    <div className="font-display h-[100dvh] overflow-y-auto bg-white dark:bg-gray-950 overflow-x-hidden transition-colors
      [&::-webkit-scrollbar]:w-1.5
      [&::-webkit-scrollbar-track]:bg-transparent
      [&::-webkit-scrollbar-thumb]:bg-gray-300
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-400
      dark:[&::-webkit-scrollbar-thumb]:bg-gray-600
      dark:[&::-webkit-scrollbar-thumb:hover]:bg-gray-500">

      {/* ── NAV ── */}
      <nav className="sticky top-0 z-20 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-8 py-[14px] grid grid-cols-3 items-center">
          <Link to="/" className="flex items-center gap-2.5 justify-self-start">
            <img src="/favicon.svg" alt="Deskly" className="w-7 h-7 shrink-0" />
            <span className="text-[17px] font-bold tracking-tight text-gray-900 dark:text-white">Deskly</span>
          </Link>

          <div className="hidden md:flex items-center justify-center gap-[30px]">
            <a href="#features" className="text-[16px] font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="text-[16px] font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Pricing</a>
            <a href="#testimonial" className="text-[16px] font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Customers</a>
          </div>
          <div className="md:hidden" />

          <div className="flex items-center gap-2.5 justify-self-end">
            <button
              onClick={toggle}
              title={isDark ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            {!isLoggedIn && (
              <Link to="/login" className="hidden sm:block px-3 py-2 text-[14px] font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                Log in
              </Link>
            )}
            <Link
              to={isLoggedIn ? '/dashboard' : '/signup'}
              className="bg-primary-600 hover:bg-primary-700 text-white text-[14px] font-semibold py-[9px] px-4 rounded-lg transition-colors"
            >
              {isLoggedIn ? 'Go to App' : 'Start free'}
            </Link>
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="md:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3 flex flex-col gap-1">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Features</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Pricing</a>
            <a href="#testimonial" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Customers</a>
            <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Log in</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="max-w-[1120px] mx-auto px-4 sm:px-8 pt-[74px] text-center">
        <span className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.04em] text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950 border border-primary-100 dark:border-primary-900 rounded-full px-[14px] py-[6px]">
          ● The CRM for small teams
        </span>

        <h1 className="text-[clamp(36px,5.5vw,62px)] leading-[1.04] tracking-[-0.035em] font-bold mt-[26px] mx-auto max-w-[780px] text-gray-900 dark:text-white">
          The CRM that keeps your whole team organized.
        </h1>

        <p className="text-[20px] leading-[1.6] text-gray-700 dark:text-gray-300 mt-6 mx-auto max-w-[580px]">
          Contacts, deals, and tasks in one calm place. Deskly is built for teams of two to twenty who want their day organized - not another enterprise platform to manage.
        </p>

        <div className="flex items-center justify-center gap-3 mt-[34px] flex-wrap">
          <Link
            to={isLoggedIn ? '/dashboard' : '/signup'}
            className="bg-primary-600 hover:bg-primary-700 text-white text-[15.5px] font-semibold py-[13px] px-6 rounded-lg transition-colors"
          >
            {isLoggedIn ? 'Go to App' : 'Start free - 14 days'}
          </Link>
          <a
            href="#features"
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-[15.5px] font-semibold py-[13px] px-[22px] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            See a live demo
          </a>
        </div>

        <p className="font-mono text-xs text-gray-400 dark:text-gray-500 mt-4">No credit card · $10 / user / month after trial</p>

        <div className="mt-[54px]">
          <DashboardMockup />
        </div>

        <p className="font-mono text-[11.5px] text-gray-400 dark:text-gray-500 mt-[26px]">Trusted by 1,200+ small teams · 4.8★ average rating</p>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="max-w-[1120px] mx-auto px-4 sm:px-8 pt-24">
        <div className="text-center max-w-[600px] mx-auto">
          <span className="font-mono text-xs tracking-[0.12em] uppercase text-gray-400 dark:text-gray-500">Everything, organized</span>
          <h2 className="text-[clamp(28px,3.2vw,38px)] leading-[1.12] tracking-[-0.03em] font-bold mt-3.5 text-gray-900 dark:text-white">
            Six things your team does daily - finally in one calm place.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] mt-12">
          {features.map(f => (
            <div
              key={f.title}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6
                hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.06)]
                hover:-translate-y-0.5 hover:border-gray-400 dark:hover:border-gray-600 transition-all duration-200"
            >
              {f.icon}
              <p className="text-[16.5px] font-bold mt-[18px] tracking-[-0.01em] text-gray-900 dark:text-white">{f.title}</p>
              <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-[1.6] mt-2">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section id="testimonial" className="max-w-[1120px] mx-auto px-4 sm:px-8 pt-[90px]">
        <div className="bg-gray-900 dark:bg-gray-800 rounded-2xl px-8 sm:px-14 py-16 text-center">
          <p className="text-[clamp(18px,2.4vw,28px)] leading-[1.4] tracking-[-0.015em] font-semibold max-w-[760px] mx-auto text-gray-100">
            "We tried the big-name CRMs and spent more time configuring than selling. Deskly we set up in an afternoon - now the whole team just{' '}
            <span className="text-primary-400">opens it every morning</span>."
          </p>
          <div className="flex items-center justify-center gap-3 mt-[30px]">
            <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-sm font-bold text-white shrink-0">JM</div>
            <div className="text-left">
              <p className="text-[14.5px] font-semibold text-gray-100">Julia Marchetti</p>
              <p className="text-[13px] text-gray-400 mt-0.5">Founder, Northwind Studio · 9 people</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="max-w-[1120px] mx-auto px-4 sm:px-8 pt-[90px]">
        <div className="text-center max-w-[560px] mx-auto">
          <span className="font-mono text-xs tracking-[0.12em] uppercase text-gray-400 dark:text-gray-500">Pricing</span>
          <h2 className="text-[clamp(28px,3.2vw,38px)] leading-[1.12] tracking-[-0.03em] font-bold mt-3.5 text-gray-900 dark:text-white">
            One honest plan. That's the whole menu.
          </h2>
          <p className="text-[17px] text-gray-700 dark:text-gray-300 leading-[1.6] mt-3.5">
            No "contact sales," no tiers designed to upsell you. Everything Deskly does, for everyone on your team.
          </p>
        </div>

        <div className="max-w-[440px] mx-auto mt-11 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="px-8 pt-[30px] pb-[26px] border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-bold text-gray-900 dark:text-white">Deskly for Teams</span>
              <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 rounded-full px-[11px] py-1">
                14-DAY TRIAL
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mt-[18px]">
              <span className="text-[48px] font-bold tracking-[-0.03em] text-gray-900 dark:text-white tabular-nums">$10</span>
              <span className="text-[15px] text-gray-500 dark:text-gray-400">/ user / month</span>
            </div>
            <Link
              to={isLoggedIn ? '/dashboard' : '/signup'}
              className="block text-center mt-[22px] bg-primary-600 hover:bg-primary-700 text-white text-[15px] font-semibold py-[13px] rounded-lg transition-colors"
            >
              Start your free trial
            </Link>
          </div>

          <div className="px-8 pt-[26px] pb-[30px] flex flex-col gap-[13px]">
            {[
              'Unlimited contacts, deals & tasks',
              'Kanban pipeline & activity timelines',
              'Gmail sync & gentle automations',
              'Every team member, one flat price',
              'Dark mode, and a real human on support',
            ].map(feature => (
              <div key={feature} className="flex items-center gap-[11px]">
                <span className="text-emerald-600 dark:text-emerald-400 text-[15px] shrink-0">✓</span>
                <span className="text-[14.5px] text-gray-700 dark:text-gray-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-[1120px] mx-auto px-4 sm:px-8 pt-24 text-center">
        <h2 className="text-[clamp(32px,3.8vw,44px)] leading-[1.08] tracking-[-0.03em] font-bold max-w-[620px] mx-auto text-gray-900 dark:text-white">
          Get organized this afternoon.
        </h2>
        <p className="text-[18px] text-gray-700 dark:text-gray-300 mt-[18px] mx-auto max-w-[480px] leading-[1.6]">
          Bring your contacts in, set up your pipeline, and invite the team. It really does take one afternoon.
        </p>
        <Link
          to={isLoggedIn ? '/dashboard' : '/signup'}
          className="inline-block mt-[30px] bg-primary-600 hover:bg-primary-700 text-white text-[16px] font-semibold py-3.5 px-7 rounded-lg transition-colors"
        >
          Start free - 14 days
        </Link>
      </section>

      {/* ── FOOTER ── */}
      <footer className="max-w-[1120px] mx-auto px-4 sm:px-8 mt-20 pt-10 pb-14 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-[18px]">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="Deskly" className="w-6 h-6 shrink-0" />
          <span className="text-[14px] font-bold text-gray-900 dark:text-white">Deskly</span>
          <span className="text-[13px] text-gray-400 dark:text-gray-500 ml-2">© {new Date().getFullYear()} · A calmer CRM</span>
        </div>
        <div className="flex gap-[22px]">
          <Link to="/privacy" className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Privacy</Link>
          <Link to="/terms" className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Terms</Link>
          <Link to="/contact" className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Contact</Link>
        </div>
      </footer>

    </div>
  )
}
