import { Link } from 'react-router-dom'
import { useDarkModeStore } from '../store/darkModeStore'
import { useAuthStore } from '../store/authStore'

// ── Icons ─────────────────────────────────────────────────────────────────────

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

function Check({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

// ── App screenshot mockup ─────────────────────────────────────────────────────

function AppMockup() {
  const stages = [
    { label: 'Lead', color: 'bg-gray-400', count: 3, deals: ['Acme Corp', 'Nova Inc'] },
    { label: 'Proposal', color: 'bg-violet-500', count: 2, deals: ['TechFlow', 'Brightline'] },
    { label: 'Closed', color: 'bg-emerald-500', count: 1, deals: ['Stellar Co'] },
  ]

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Browser chrome */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-200 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
          <span className="w-3 h-3 rounded-full bg-red-400" />
          <span className="w-3 h-3 rounded-full bg-yellow-400" />
          <span className="w-3 h-3 rounded-full bg-green-400" />
          <div className="flex-1 mx-3 bg-white dark:bg-gray-800 rounded-md px-3 py-1 text-[10px] text-gray-400 dark:text-gray-500">
            app.deskly.io/deals
          </div>
        </div>

        {/* App UI */}
        <div className="flex h-[280px] sm:h-[320px]">
          {/* Sidebar */}
          <div className="w-[140px] shrink-0 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col p-3 gap-1">
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-5 h-5 bg-primary-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-[8px]">D</span>
              </div>
              <span className="text-[10px] font-semibold text-gray-900 dark:text-white">Deskly</span>
            </div>
            {['Dashboard', 'Contacts', 'Deals', 'Tasks', 'Settings'].map((item, i) => (
              <div key={item} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[10px] ${
                i === 2 ? 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-semibold' : 'text-gray-500 dark:text-gray-400'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${i === 2 ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-700'}`} />
                {item}
              </div>
            ))}
          </div>

          {/* Kanban board */}
          <div className="flex-1 bg-gray-50 dark:bg-gray-950 p-3 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-900 dark:text-white">Pipeline</span>
              <div className="px-2 py-0.5 bg-primary-600 text-white text-[9px] font-semibold rounded-md">+ Add deal</div>
            </div>
            <div className="flex gap-2 overflow-hidden">
              {stages.map(stage => (
                <div key={stage.label} className="w-[120px] shrink-0 bg-white dark:bg-gray-800 rounded-lg p-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${stage.color}`} />
                    <span className="text-[9px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">{stage.label}</span>
                    <span className="ml-auto text-[9px] text-gray-400">{stage.count}</span>
                  </div>
                  <div className="space-y-1.5">
                    {stage.deals.map(deal => (
                      <div key={deal} className="bg-gray-50 dark:bg-gray-700 rounded-md p-1.5">
                        <p className="text-[9px] font-semibold text-gray-800 dark:text-gray-200">{deal}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-3 h-3 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center">
                            <span className="text-[6px] text-primary-600 font-bold">J</span>
                          </div>
                          <span className="text-[8px] text-gray-400">${Math.floor(Math.random() * 20 + 5)}k</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating notification */}
      <div className="absolute -bottom-3 -right-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-3 py-2 flex items-center gap-2 text-xs">
        <span className="w-6 h-6 bg-emerald-100 dark:bg-emerald-950 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400">✓</span>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-[11px]">Deal closed!</p>
          <p className="text-gray-400 dark:text-gray-500 text-[10px]">Stellar Co · $24k</p>
        </div>
      </div>

      {/* Floating email pill */}
      <div className="absolute -top-3 -left-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-3 py-2 flex items-center gap-2">
        <span className="text-sm">✉️</span>
        <div>
          <p className="text-[11px] font-semibold text-gray-900 dark:text-white">Email synced</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">from john@acme.com</p>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const { isDark, toggle } = useDarkModeStore()
  const user      = useAuthStore(s => s.user)
  const isLoading = useAuthStore(s => s.isLoading)

  const isLoggedIn = !isLoading && !!user

  return (
    <div className="h-screen overflow-y-auto bg-white dark:bg-gray-950 font-sans flex flex-col transition-colors
      [&::-webkit-scrollbar]:w-1.5
      [&::-webkit-scrollbar-track]:bg-transparent
      [&::-webkit-scrollbar-thumb]:bg-gray-300
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-400
      dark:[&::-webkit-scrollbar-thumb]:bg-gray-600
      dark:[&::-webkit-scrollbar-thumb:hover]:bg-gray-500">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-40 w-full border-b border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">D</span>
            </div>
            <span className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Deskly</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
            <a href="#features" className="hover:text-gray-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="hover:text-gray-900 dark:hover:text-white transition-colors">Pricing</a>
            <a href="#how-to" className="hover:text-gray-900 dark:hover:text-white transition-colors">How To</a>
            <Link to="/contact" className="hover:text-gray-900 dark:hover:text-white transition-colors">Contact</Link>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              title={isDark ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            {isLoggedIn ? (
              <Link to="/dashboard" className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                Go to App →
              </Link>
            ) : (
              <>
                <Link to="/login" className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Sign in
                </Link>
                <Link to="/signup" className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                  Start free →
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-24 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 dark:bg-primary-950 border border-primary-100 dark:border-primary-900 rounded-full text-xs font-semibold text-primary-700 dark:text-primary-300 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
            Free to start · No credit card required
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white tracking-tight max-w-3xl mx-auto leading-[1.1] mb-5">
            Simple CRM for{' '}
            <span className="text-primary-600 dark:text-primary-400">small teams</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
            Stop overpaying for bloated CRMs. Manage contacts, deals, and tasks in one place -
            with Gmail sync and smart automations built in.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            {isLoggedIn ? (
              <Link
                to="/dashboard"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl text-base transition-colors shadow-lg shadow-primary-200 dark:shadow-primary-950"
              >
                Go to App
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            ) : (
              <>
                <Link
                  to="/signup"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl text-base transition-colors shadow-lg shadow-primary-200 dark:shadow-primary-950"
                >
                  Start Free Trial
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <Link
                  to="/login"
                  className="w-full sm:w-auto px-7 py-3.5 text-base font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                >
                  Sign in to your account
                </Link>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-400 dark:text-gray-500 mb-16">
            {['Free to start', 'No credit card required', 'Set up in 5 minutes'].map(item => (
              <span key={item} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                {item}
              </span>
            ))}
          </div>

          {/* App mockup */}
          <AppMockup />
        </section>

        {/* ── Problem / Solution ── */}
        <section className="bg-gray-50 dark:bg-gray-900 border-y border-gray-100 dark:border-gray-800 py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Tired of complex CRMs?
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">
                You shouldn't need a 3-week onboarding just to track your deals.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Pain points */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-4">The old way</p>
                <div className="space-y-4">
                  {[
                    { name: 'Salesforce', desc: '$75/user/mo · Takes weeks to set up · Needs a dedicated admin' },
                    { name: 'HubSpot',    desc: '"Free" until you hit limits · Then $90/user/mo · Hidden fees' },
                    { name: 'Spreadsheets', desc: 'Messy, no automation · Hard to collaborate · Data gets lost' },
                  ].map(p => (
                    <div key={p.name} className="flex items-start gap-3">
                      <span className="mt-0.5 text-lg leading-none">❌</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deskly */}
              <div className="bg-primary-600 rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500/30 to-transparent pointer-events-none" />
                <p className="text-xs font-bold uppercase tracking-widest text-primary-200 mb-4 relative">With Deskly</p>
                <div className="space-y-4 relative">
                  {[
                    { check: '✅', title: '$10/user/mo', desc: 'Flat pricing, no surprises. Everything included.' },
                    { check: '✅', title: 'Set up in 5 minutes', desc: 'Guided onboarding. Invite your team the same day.' },
                    { check: '✅', title: 'Everything you need', desc: 'Contacts, deals, tasks, Gmail sync, automations.' },
                  ].map(s => (
                    <div key={s.title} className="flex items-start gap-3">
                      <span className="mt-0.5 text-lg leading-none">{s.check}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{s.title}</p>
                        <p className="text-xs text-primary-200 mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Price tag */}
                <div className="mt-6 pt-4 border-t border-primary-500/50 relative">
                  <p className="text-4xl font-black text-white">$10</p>
                  <p className="text-primary-200 text-sm">per user / month</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Everything you need. Nothing you don't.
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">
              Built for sales teams who want results, not complexity.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '📧',
                title: 'Gmail Integration',
                desc: 'Emails automatically log to contacts. Every thread, every context - right where you need it.',
                bullets: ['Auto-sync last 30 days', 'Match emails to contacts', 'Create deals from emails'],
                accent: 'from-blue-50 to-primary-50 dark:from-blue-950/30 dark:to-primary-950/30',
                border: 'border-blue-100 dark:border-blue-900/50',
              },
              {
                icon: '⚙️',
                title: 'Smart Automations',
                desc: 'Auto-create tasks, get alerts when deals go cold, follow up at the right time. Work smarter.',
                bullets: ['6 pre-built automations', 'Toggle on/off instantly', 'In-app notifications'],
                accent: 'from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30',
                border: 'border-violet-100 dark:border-violet-900/50',
              },
              {
                icon: '📊',
                title: 'Visual Pipeline',
                desc: 'See every deal at a glance. Drag cards between stages. Know exactly where every opportunity stands.',
                bullets: ['6-stage Kanban board', 'Drag & drop deals', 'Pipeline value at a glance'],
                accent: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30',
                border: 'border-emerald-100 dark:border-emerald-900/50',
              },
            ].map(f => (
              <div key={f.title} className={`rounded-2xl border ${f.border} bg-gradient-to-br ${f.accent} p-6 flex flex-col`}>
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed flex-1">{f.desc}</p>
                <ul className="space-y-1.5">
                  {f.bullets.map(b => (
                    <li key={b} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Social proof / Testimonials ── */}
        <section className="bg-gray-50 dark:bg-gray-900 border-y border-gray-100 dark:border-gray-800 py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                Loved by small teams
              </h2>
              <p className="text-gray-500 dark:text-gray-400">Here's what our beta users are saying.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-5 mb-12">
              {[
                {
                  quote: "We switched from HubSpot and cut our CRM costs by 80%. Deskly does everything we actually need - without the bloat.",
                  author: 'Sarah M.',
                  role: 'Founder, Brightline Agency',
                  avatar: 'S',
                  color: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
                },
                {
                  quote: "The Gmail sync is a game changer. I can see every email thread right next to the contact's deal. No more context switching.",
                  author: 'James K.',
                  role: 'Sales Lead, TechFlow',
                  avatar: 'J',
                  color: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
                },
                {
                  quote: "Set up in 20 minutes and my whole team was using it by end of day. I've never said that about any other CRM.",
                  author: 'Priya R.',
                  role: 'CEO, Nova Creative',
                  avatar: 'P',
                  color: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300',
                },
              ].map(t => (
                <div key={t.author} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col">
                  <div className="flex mb-3">
                    {[...Array(5)].map((_, i) => (
                      <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed flex-1 mb-4">
                    "{t.quote}"
                  </p>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full ${t.color} flex items-center justify-center text-sm font-bold shrink-0`}>
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">{t.author}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-6 text-center">
              {[
                { value: '500+', label: 'Teams using Deskly' },
                { value: '4.9 ★', label: 'Average rating' },
                { value: '< 5 min', label: 'Average setup time' },
              ].map(s => (
                <div key={s.value}>
                  <p className="text-3xl font-black text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg mb-10">
            One plan. Everything included. No hidden fees.
          </p>

          <div className="max-w-sm mx-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden">
            {/* Badge */}
            <div className="bg-primary-600 px-4 py-2 text-center">
              <span className="text-xs font-bold text-primary-100 uppercase tracking-widest">Free Trial - 14 Days</span>
            </div>

            <div className="p-8">
              <div className="mb-6">
                <div className="flex items-end justify-center gap-1 mb-1">
                  <span className="text-5xl font-black text-gray-900 dark:text-white">$10</span>
                  <span className="text-gray-400 dark:text-gray-500 mb-2">/user/mo</span>
                </div>
                <p className="text-sm text-gray-400 dark:text-gray-500">After your free trial</p>
              </div>

              <ul className="space-y-3 mb-8 text-left">
                {[
                  'Unlimited contacts & deals',
                  'Kanban deal pipeline',
                  'Task management',
                  'Gmail integration & sync',
                  '6 smart automations',
                  'In-app notification inbox',
                  'CSV import & export',
                  'Team member invitations',
                  'Email & chat support',
                ].map(feature => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                to={isLoggedIn ? '/dashboard' : '/signup'}
                className="block w-full py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-colors text-center text-sm shadow-sm"
              >
                {isLoggedIn ? 'Go to App →' : 'Start Free Trial →'}
              </Link>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">No credit card required</p>
            </div>
          </div>
        </section>

        {/* ── How To ── */}
        <section id="how-to" className="max-w-5xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 dark:bg-primary-950 border border-primary-100 dark:border-primary-900 rounded-full text-xs font-semibold text-primary-700 dark:text-primary-300 mb-5">
              Get started in 5 minutes
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              How to use Deskly
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">
              Watch the tutorial below to get up and running in minutes.
            </p>
          </div>

          {/* Video placeholder */}
          <div className="relative w-full rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" style={{ paddingBottom: '56.25%' }}>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
              <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center">
                <svg className="w-7 h-7 text-primary-600 dark:text-primary-400 ml-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Tutorial coming soon</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
                  A full walkthrough video will be added here shortly.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="bg-primary-600 py-20 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to close more deals?
            </h2>
            <p className="text-primary-200 text-lg mb-8">
              Join 500+ teams who switched from bloated CRMs to Deskly.
              Set up in minutes, not weeks.
            </p>
            <Link
              to={isLoggedIn ? '/dashboard' : '/signup'}
              className="inline-flex items-center gap-2 px-8 py-4 bg-white hover:bg-gray-50 text-primary-700 font-bold rounded-xl text-base transition-colors shadow-lg"
            >
              {isLoggedIn ? 'Go to App' : 'Get Started Free'}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <p className="text-primary-300 text-sm mt-4">Free 14-day trial · No credit card · Cancel anytime</p>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[10px]">D</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Deskly</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-gray-400 dark:text-gray-500">
            <Link to="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Terms</Link>
            <a href="mailto:support@desklycrm.com" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">support@desklycrm.com</a>
            <span>© {new Date().getFullYear()} Deskly</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
