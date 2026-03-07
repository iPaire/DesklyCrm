import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import {
  getInviteByToken,
  acceptInvite,
  getUserActiveMembership,
  removeMember,
  syncSubscriptionQuantity,
} from '../lib/billing'

type Step = 'loading' | 'info' | 'auth' | 'accepting' | 'done' | 'error'

export default function Invite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [step, setStep] = useState<Step>('loading')
  const [invite, setInvite] = useState<{
    id: string
    email: string
    team_id: string
    expires_at: string | null
    teams: { name: string | null; owner_email: string | null } | null
  } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isSignUp, setIsSignUp] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  // For users already in a different team
  const [existingMembershipId, setExistingMembershipId] = useState<string | null>(null)
  const [sameTeamAlready, setSameTeamAlready] = useState(false)

  // Load and validate invite
  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Invalid invitation link.'); return }

    getInviteByToken(token).then(({ invite: inv, error }) => {
      if (error || !inv) {
        setStep('error')
        setErrorMsg('This invitation link is invalid or has already been used.')
        return
      }
      if (inv.status === 'active') {
        setStep('error')
        setErrorMsg('This invitation has already been accepted.')
        return
      }
      // Expiry check
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        setStep('error')
        setErrorMsg('This invitation has expired. Ask the team owner to send a new one.')
        return
      }
      setInvite(inv)
      setEmail(inv.email ?? '')
      setStep('info')
    })
  }, [token])

  // When user is known, check their existing membership
  useEffect(() => {
    if (!user || !invite) return
    getUserActiveMembership(user.id).then((membership) => {
      if (!membership) return
      if (membership.team_id === invite.team_id) {
        setSameTeamAlready(true)
      } else {
        setExistingMembershipId(membership.id)
      }
    })
  }, [user, invite])

  const doAccept = async (uid: string) => {
    if (!token) return
    setStep('accepting')
    const { member, error } = await acceptInvite(token, uid)
    if (error) {
      setStep('error')
      setErrorMsg(error.message)
      return
    }
    // Sync Stripe subscription quantity to reflect the new active seat
    if (member?.team_id) syncSubscriptionQuantity(member.team_id)
    setStep('done')
    setTimeout(() => navigate('/dashboard'), 2000)
  }

  const handleProceed = async () => {
    if (user) {
      if (sameTeamAlready) {
        navigate('/dashboard')
        return
      }
      // If in a different team, remove from old team first, then accept
      if (existingMembershipId) {
        await removeMember(existingMembershipId)
      }
      doAccept(user.id)
    } else {
      setStep('auth')
    }
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setErrorMsg('')

    if (isSignUp) {
      if (password !== confirm) { setErrorMsg('Passwords do not match.'); setAuthLoading(false); return }
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setErrorMsg(error.message); setAuthLoading(false); return }
      if (data.user) await doAccept(data.user.id)
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setErrorMsg(error.message); setAuthLoading(false); return }
      if (data.user) {
        // Check membership for newly signed-in user
        const membership = await getUserActiveMembership(data.user.id)
        if (membership) {
          if (membership.team_id === invite?.team_id) {
            navigate('/dashboard')
            return
          }
          await removeMember(membership.id)
        }
        await doAccept(data.user.id)
      }
    }
    setAuthLoading(false)
  }

  const teamName = invite?.teams?.name ?? invite?.teams?.owner_email?.split('@')[0] ?? 'a Deskly team'

  // ── Loading ──
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Error ──
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-950 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Invitation Error</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{errorMsg}</p>
          <Link to="/login" className="text-sm text-primary-600 dark:text-primary-400 font-medium hover:underline">
            Go to login
          </Link>
        </div>
      </div>
    )
  }

  // ── Done ──
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">You're in!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  // ── Accepting ──
  if (step === 'accepting') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <span className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin inline-block" />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Joining the team…</p>
        </div>
      </div>
    )
  }

  // ── Info / Auth ──
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 mb-8">
        <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">D</span>
        </div>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Deskly</span>
      </Link>

      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-50 to-violet-50 dark:from-primary-950/40 dark:to-violet-950/30 px-6 py-5 text-center border-b border-gray-100 dark:border-gray-800">
          <div className="w-10 h-10 bg-primary-100 dark:bg-primary-950 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6-4a4 4 0 11-8 0 4 4 0 018 0zm6 4a2 2 0 100-4 2 2 0 000 4zM3 20a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Team Invitation</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            You've been invited to join <span className="font-semibold text-gray-700 dark:text-gray-300">{teamName}</span>
          </p>
        </div>

        <div className="px-6 py-5">
          {step === 'info' && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 text-center">
                Invitation sent to <span className="font-medium text-gray-900 dark:text-white">{invite?.email}</span>
              </p>

              {/* Already in same team */}
              {sameTeamAlready && (
                <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                    You're already a member of this team!
                  </p>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="mt-3 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all text-sm"
                  >
                    Go to dashboard →
                  </button>
                </div>
              )}

              {/* In a different team - warn */}
              {!sameTeamAlready && existingMembershipId && user && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mb-1">
                    You're currently in another team
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Accepting this invite will remove you from your current team.
                  </p>
                </div>
              )}

              {!sameTeamAlready && (
                <>
                  {user ? (
                    <div className="space-y-3">
                      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                        Signed in as <span className="font-medium">{user.email}</span>
                      </p>
                      <button
                        onClick={handleProceed}
                        className="w-full py-2.5 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all"
                      >
                        {existingMembershipId ? 'Switch team & accept →' : 'Accept Invitation →'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleProceed}
                      className="w-full py-2.5 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all"
                    >
                      Accept Invitation →
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {step === 'auth' && (
            <form onSubmit={handleAuth} className="space-y-4">
              {/* Toggle sign up / sign in */}
              <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-4">
                {(['Create account', 'Sign in'] as const).map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setIsSignUp(i === 0)}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      isSignUp === (i === 0)
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input
                  type="email" required value={email} readOnly
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                <input
                  type="password" required minLength={6}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {isSignUp && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirm password</label>
                  <input
                    type="password" required
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}

              {errorMsg && (
                <p className="text-xs text-red-500 dark:text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 bg-gradient-to-r from-primary-600 to-violet-600 hover:from-primary-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {authLoading && (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {isSignUp ? 'Create account & join team' : 'Sign in & join team'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
