import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useBillingStore, selectTrialExpired } from '../store/billingStore'
import { startStripeCheckout } from '../lib/billing'
import { useNavigate } from 'react-router-dom'

// Pages that remain accessible even after trial expires
const ALLOWED_PATHS = ['/settings', '/settings/gmail/callback']

export function TrialGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const trialExpired = useBillingStore(selectTrialExpired)

  // Allow access to settings so the user can upgrade
  const isAllowed = ALLOWED_PATHS.some((p) => location.pathname.startsWith(p))

  if (!trialExpired || isAllowed) {
    return <>{children}</>
  }

  return (
    <>
      {/* Dim the app behind */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
        <TrialEndedModal />
      </div>
      {/* Still render children (blurred) */}
      <div className="pointer-events-none select-none">{children}</div>
    </>
  )
}

function TrialEndedModal() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const team = useBillingStore((s) => s.team)
  const seats = team?.seats ?? 1
  const monthlyTotal = seats * 10

  const handleUpgrade = async () => {
    setLoading(true)
    setError('')
    const { url, error: err } = await startStripeCheckout()
    if (err || !url) {
      setError(err ?? 'Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    window.location.href = url
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary-600 to-violet-600 px-6 pt-8 pb-6 text-center">
        <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white">Your trial has ended</h2>
        <p className="text-white/80 text-sm mt-1">Upgrade to keep your data and continue using Deskly</p>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        {/* Pricing */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            {seats} user{seats > 1 ? 's' : ''} × $10/month
          </p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            ${monthlyTotal}
            <span className="text-base font-normal text-gray-500 dark:text-gray-400">/month</span>
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Cancel anytime</p>
        </div>

        {/* Features */}
        <ul className="space-y-2 mb-5">
          {[
            'All your contacts & deals preserved',
            'Unlimited contacts & storage',
            'Team collaboration',
            'Gmail sync & automations',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 mb-3 text-center">{error}</p>
        )}

        {/* Upgrade button */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {loading ? 'Redirecting to Stripe…' : 'Upgrade Now →'}
        </button>

        {/* Extend trial / contact */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">
          Need more time?{' '}
          <a
            href="mailto:pedro@deskly.app?subject=Trial extension request"
            className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            Email us for a 7-day extension
          </a>
        </p>

        {/* Go to settings */}
        <button
          onClick={() => navigate('/settings')}
          className="w-full mt-3 py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Go to settings
        </button>
      </div>
    </div>
  )
}
