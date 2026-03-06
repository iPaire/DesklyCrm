import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { exchangeCode, getGmailProfile } from '../lib/gmail'
import { useAuthStore } from '../store/authStore'

export default function GmailCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const code  = searchParams.get('code')
    const error = searchParams.get('error')

    if (error || !code) {
      setErrorMsg(
        error === 'access_denied'
          ? 'Gmail access was denied. Please try again.'
          : 'OAuth error - no authorization code received.',
      )
      setStatus('error')
      return
    }

    if (!user) {
      navigate('/login')
      return
    }

    ;(async () => {
      try {
        // Exchange authorization code for access + refresh tokens
        const tokens = await exchangeCode(code)

        // Get the Gmail email address
        const profile = await getGmailProfile(tokens.access_token)

        const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

        // Upsert into gmail_connections (one row per user)
        const { error: dbError } = await supabase
          .from('gmail_connections')
          .upsert(
            {
              user_id:       user.id,
              gmail_email:   profile.emailAddress,
              refresh_token: tokens.refresh_token ?? '',
              access_token:  tokens.access_token,
              token_expiry:  expiry,
              connected_at:  new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )

        if (dbError) throw new Error(dbError.message)

        // Redirect back to Settings with success flag
        navigate('/settings?gmail=connected', { replace: true })
      } catch (e: any) {
        setErrorMsg(e.message ?? 'Connection failed. Please try again.')
        setStatus('error')
      }
    })()
  }, [searchParams, user, navigate])

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-950 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Gmail connection failed</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-5">{errorMsg}</p>
          <button
            onClick={() => navigate('/settings')}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Back to Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="text-center">
        <div className="w-10 h-10 border-[3px] border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Connecting Gmail...</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Exchanging tokens, please wait.</p>
      </div>
    </div>
  )
}
