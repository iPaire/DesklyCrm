import { useState, useRef, useCallback, useMemo } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useDarkModeStore } from '../store/darkModeStore'
import { useBillingStore } from '../store/billingStore'
import { NotificationBell } from './NotificationBell'
import { TrialGate } from './TrialGate'
import { getTrialInfo } from '../lib/billing'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="8.5" height="8.5" rx="2.5" />
        <rect x="12.5" y="3" width="8.5" height="8.5" rx="2.5" />
        <rect x="3" y="12.5" width="8.5" height="8.5" rx="2.5" />
        <rect x="12.5" y="12.5" width="8.5" height="8.5" rx="2.5" opacity="0.45" />
      </svg>
    ),
  },
  {
    to: '/contacts',
    label: 'Contacts',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4.5" />
        <path d="M3.5 21c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5H3.5z" />
      </svg>
    ),
  },
  {
    to: '/deals',
    label: 'Deals',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="10" width="5" height="11" rx="1.5" />
        <rect x="9.5" y="4" width="5" height="17" rx="1.5" />
        <rect x="16" y="7" width="5" height="14" rx="1.5" opacity="0.6" />
      </svg>
    ),
  },
  {
    to: '/tasks',
    label: 'Tasks',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="4.5" strokeWidth={1.75} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12l3 3 5-5" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-9H21M3 12H2m15.07-6.07l-.707.707M7.05 16.95l-.707.707M18.36 18.36l-.707-.707M6.34 6.34l-.707-.707M17 12a5 5 0 11-10 0 5 5 0 0110 0z" />
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

export default function Layout() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isDark, toggle: toggleDark } = useDarkModeStore()
  const { team } = useBillingStore()
  const isOwner = useBillingStore((s) => s.isOwner)
  const memberJoinedAt = useBillingStore((s) => s.memberJoinedAt)
  const hasPaidSeat = useBillingStore((s) => s.hasPaidSeat)
  const isSubscribed = team?.subscription_status === 'active'

  // For members: show their personal trial. For owners: show team trial.
  const trialInfo = useMemo(() => {
    if (!team || hasPaidSeat) return null
    if (!isOwner && memberJoinedAt) return getTrialInfo(memberJoinedAt)
    if (isOwner) return getTrialInfo(team.trial_start, team.trial_extended_days)
    return null
  }, [team, isOwner, memberJoinedAt, hasPaidSeat])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials = user?.email?.[0].toUpperCase() ?? 'U'

  // Pull-to-refresh
  const PULL_THRESHOLD = 72
  const pullStartY = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    const el = e.currentTarget
    if (el.scrollTop === 0) pullStartY.current = e.touches[0].clientY
    else pullStartY.current = 0
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (!pullStartY.current) return
    const dist = e.touches[0].clientY - pullStartY.current
    if (dist > 0) setPullDistance(Math.min(dist, PULL_THRESHOLD + 20))
  }, [])

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true)
      setTimeout(() => window.location.reload(), 300)
    } else {
      setPullDistance(0)
    }
  }, [pullDistance])

  const sidebarContent = (
    <>
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2.5 px-5 py-[18px] border-b border-gray-100 dark:border-gray-800 hover:opacity-80 transition-opacity text-left w-full"
      >
        <img src="/favicon.svg" alt="Deskly" className="w-7 h-7 shrink-0" />
        <span className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Deskly</span>
      </button>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-1 border-t border-gray-100 dark:border-gray-800 pt-3">
        {/* Trial banner */}
        {!isSubscribed && trialInfo && (
          <button
            onClick={() => { navigate('/settings'); setSidebarOpen(false) }}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
              trialInfo.isExpired
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100'
                : trialInfo.daysRemaining <= 3
                  ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 hover:bg-orange-100'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
            }`}
          >
            <p className="font-semibold">
              {trialInfo.isExpired ? 'Trial ended' : `${trialInfo.daysRemaining} day${trialInfo.daysRemaining !== 1 ? 's' : ''} left in trial`}
            </p>
            <p className="opacity-75 mt-0.5">
              {trialInfo.isExpired ? 'Upgrade to continue →' : 'Upgrade to Pro →'}
            </p>
          </button>
        )}

        {/* Notifications */}
        <NotificationBell />

        {/* Dark mode toggle */}
        <button
          onClick={toggleDark}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          <span className="flex items-center gap-3">
            {isDark ? <MoonIcon /> : <SunIcon />}
            {isDark ? 'Dark mode' : 'Light mode'}
          </span>
          {/* Toggle pill */}
          <div className={`relative w-8 h-4 rounded-full transition-colors ${isDark ? 'bg-primary-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-3 h-3 left-0.5 bg-white rounded-full shadow transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </button>

        {/* User info */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center shrink-0">
            <span className="text-primary-700 dark:text-primary-300 text-xs font-semibold">{initials}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{user?.email}</p>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-950 font-sans">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - fixed on mobile, static on desktop */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-60 flex flex-col
          bg-white dark:bg-gray-900
          border-r border-gray-100 dark:border-gray-800
          transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {sidebarContent}
      </aside>

      {/* Right side */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/favicon.svg" alt="Deskly" className="w-6 h-6 shrink-0" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Deskly</span>
          </button>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 relative"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Pull-to-refresh indicator */}
          {(pullDistance > 0 || refreshing) && (
            <div
              className="absolute left-0 right-0 flex items-center justify-center z-10 pointer-events-none transition-opacity"
              style={{ top: Math.min(pullDistance, PULL_THRESHOLD) - 36, opacity: Math.min(pullDistance / PULL_THRESHOLD, 1) }}
            >
              <div className={`w-8 h-8 rounded-full bg-white dark:bg-gray-800 shadow-md flex items-center justify-center ${refreshing ? 'animate-spin' : ''}`}
                style={{ transform: refreshing ? undefined : `rotate(${(pullDistance / PULL_THRESHOLD) * 360}deg)` }}>
                <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            </div>
          )}
          <TrialGate>
            <Outlet />
          </TrialGate>
        </main>
      </div>
    </div>
  )
}
