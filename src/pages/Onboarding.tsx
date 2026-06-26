import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useDarkModeStore } from '../store/darkModeStore'

const STEP_KEY = 'deskly-onboard-step'
const NEW_USER_KEY = 'deskly-new-user'

type Step = 1 | 2 | 3 | 4

const STEPS = [
  { label: 'Welcome' },
  { label: 'First contact' },
  { label: 'First deal' },
  { label: 'Done' },
]

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

const inputClass =
  'w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors'

export default function Onboarding() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { isDark, toggle } = useDarkModeStore()

  const savedStep = parseInt(localStorage.getItem(STEP_KEY) ?? '1', 10) as Step
  const [step, setStep] = useState<Step>(savedStep >= 1 && savedStep <= 4 ? savedStep : 1)

  // Step 1 state
  const [name, setName] = useState('')

  // Step 2 state
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactCompany, setContactCompany] = useState('')
  const [contactSaved, setContactSaved] = useState(false)

  // Step 3 state
  const [dealName, setDealName] = useState('')
  const [dealValue, setDealValue] = useState('')
  const [dealSaved, setDealSaved] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Consent modal - shown for Google OAuth users and any user without recorded consent
  const [showConsent, setShowConsent] = useState(
    localStorage.getItem('deskly-consent-v1') !== '1'
  )
  const [consentTerms, setConsentTerms] = useState(false)
  const [consentMarketing, setConsentMarketing] = useState(false)

  function handleConsent() {
    if (!consentTerms) return
    localStorage.setItem('deskly-consent-v1', '1')
    localStorage.setItem('deskly-marketing-v1', consentMarketing ? '1' : '0')
    setShowConsent(false)
    // Existing users (no new-user flag) just needed consent - go straight to dashboard
    if (localStorage.getItem('deskly-new-user') !== '1') {
      navigate('/dashboard', { replace: true })
    }
  }

  function goTo(s: Step) {
    setStep(s)
    setError('')
    localStorage.setItem(STEP_KEY, String(s))
  }

  // Step 1: Welcome
  async function handleWelcome() {
    goTo(2)
  }

  // Step 2: Add contact (or skip)
  async function handleContact(skip = false) {
    if (!skip) {
      if (!contactName.trim()) { setError('Contact name is required.'); return }
      if (!user) return
      setIsLoading(true)
      const { error: dbErr } = await supabase.from('contacts').insert({
        user_id: user.id,
        name: contactName.trim(),
        email: contactEmail.trim() || null,
        company: contactCompany.trim() || null,
      })
      setIsLoading(false)
      if (dbErr) { setError(dbErr.message); return }
      setContactSaved(true)
    }
    goTo(3)
  }

  // Step 3: Add deal (or skip)
  async function handleDeal(skip = false) {
    if (!skip) {
      if (!dealName.trim()) { setError('Deal name is required.'); return }
      if (!user) return
      setIsLoading(true)
      const { error: dbErr } = await supabase.from('deals').insert({
        user_id: user.id,
        name: dealName.trim(),
        value: dealValue ? parseFloat(dealValue) : null,
        stage: 'lead',
      })
      setIsLoading(false)
      if (dbErr) { setError(dbErr.message); return }
      setDealSaved(true)
    }
    goTo(4)
  }

  // Step 4: Finish
  function handleFinish() {
    localStorage.removeItem(NEW_USER_KEY)
    localStorage.removeItem(STEP_KEY)
    navigate('/dashboard', { replace: true })
  }

  const progress = ((step - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans transition-colors flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="Deskly" className="w-7 h-7 shrink-0" />
          <span className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Deskly</span>
        </div>
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-800">
        <div
          className="h-1 bg-primary-600 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-2 px-4">
        {STEPS.map((s, i) => {
          const stepNum = (i + 1) as Step
          const isDone = step > stepNum
          const isCurrent = step === stepNum
          return (
            <div key={s.label} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                    isDone
                      ? 'bg-primary-600 text-white'
                      : isCurrent
                        ? 'bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400 ring-2 ring-primary-600 ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-950'
                        : 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {isDone ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : stepNum}
                </div>
                <span className={`text-xs hidden sm:block ${isCurrent ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-10 sm:w-16 h-px mb-4 ${step > stepNum ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-800'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Consent modal - shown for Google OAuth and users without prior consent */}
      {showConsent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl p-8">
            <div className="w-12 h-12 bg-primary-100 dark:bg-primary-950 rounded-2xl flex items-center justify-center mb-5">
              <svg className="w-6 h-6 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Before you start</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Please review and accept our terms to continue using Deskly.
            </p>

            <div className="space-y-4 mb-6">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentTerms}
                  onChange={e => setConsentTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-primary-600 shrink-0"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" target="_blank" rel="noopener" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
                    Privacy Policy
                  </a>
                  <span className="text-red-500 ml-0.5">*</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentMarketing}
                  onChange={e => setConsentMarketing(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-primary-600 shrink-0"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Send me product updates and tips from Deskly{' '}
                  <span className="text-gray-400 dark:text-gray-500">(optional)</span>
                </span>
              </label>
            </div>

            <button
              onClick={handleConsent}
              disabled={!consentTerms}
              className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Card */}
      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8">

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 px-3.5 py-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-10.5a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* ── Step 1: Welcome ── */}
          {step === 1 && (
            <div>
              <div className="w-14 h-14 bg-primary-100 dark:bg-primary-950 rounded-2xl flex items-center justify-center mb-5">
                <svg className="w-7 h-7 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Welcome to Deskly!</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Let's get your CRM set up in under 2 minutes. We'll add your first contact and deal together.
              </p>

              <div className="space-y-3 mb-6">
                {[
                  { icon: '👥', text: 'Manage contacts and companies' },
                  { icon: '💼', text: 'Track deals through your pipeline' },
                  { icon: '✅', text: 'Stay on top of tasks and follow-ups' },
                  { icon: '📧', text: 'Sync your Gmail conversations' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-base">{item.icon}</span>
                    {item.text}
                  </div>
                ))}
              </div>

              <div className="mb-5">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Your name <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleWelcome()}
                  placeholder="First name"
                  autoFocus
                  className={inputClass}
                />
              </div>

              <button
                onClick={handleWelcome}
                className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Get started
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Step 2: Add first contact ── */}
          {step === 2 && (
            <div>
              <div className="w-14 h-14 bg-blue-100 dark:bg-blue-950 rounded-2xl flex items-center justify-center mb-5">
                <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Add your first contact</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Who do you work with? Add a client, lead, or colleague to get started.
              </p>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Full name"
                    autoFocus
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="email@example.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Company</label>
                  <input
                    type="text"
                    value={contactCompany}
                    onChange={(e) => setContactCompany(e.target.value)}
                    placeholder="Company name"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleContact(true)}
                  disabled={isLoading}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => handleContact(false)}
                  disabled={isLoading}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isLoading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isLoading ? 'Saving...' : 'Add contact →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Create first deal ── */}
          {step === 3 && (
            <div>
              <div className="w-14 h-14 bg-violet-100 dark:bg-violet-950 rounded-2xl flex items-center justify-center mb-5">
                <svg className="w-7 h-7 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Create your first deal</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Track an opportunity in your pipeline. You can always add more later.
              </p>

              {contactSaved && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-xl mb-5 text-sm text-green-700 dark:text-green-400">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Contact <strong>{contactName}</strong> added!
                </div>
              )}

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Deal name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={dealName}
                    onChange={(e) => setDealName(e.target.value)}
                    placeholder={contactName ? `Deal with ${contactName}` : 'e.g. Website redesign project'}
                    autoFocus
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Value <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      placeholder="0"
                      className={`${inputClass} pl-7`}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleDeal(true)}
                  disabled={isLoading}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => handleDeal(false)}
                  disabled={isLoading}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isLoading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isLoading ? 'Saving...' : 'Create deal →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Complete ── */}
          {step === 4 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {name ? `You're all set, ${name.split(' ')[0]}!` : "You're all set!"}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Your Deskly workspace is ready. Here's what was created:
              </p>

              <div className="space-y-2 mb-8 text-left">
                {contactSaved ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl text-sm text-green-700 dark:text-green-400">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Contact <strong>{contactName}</strong> added
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-4 h-4 shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    No contact added - add one from the Contacts page
                  </div>
                )}
                {dealSaved ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-xl text-sm text-green-700 dark:text-green-400">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Deal <strong>{dealName}</strong> created
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-4 h-4 shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    No deal created - add one from the Deals page
                  </div>
                )}
              </div>

              <button
                onClick={handleFinish}
                className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Go to Dashboard
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
