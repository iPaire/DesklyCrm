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

export default function PublicLayout({ children }: { children: React.ReactNode }) {
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

      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <img src="/favicon.svg" alt="Deskly" className="w-7 h-7 shrink-0" />
            <span className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Deskly</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
            <Link to="/#features" className="hover:text-gray-900 dark:hover:text-white transition-colors">Features</Link>
            <Link to="/#pricing" className="hover:text-gray-900 dark:hover:text-white transition-colors">Pricing</Link>
            <a href="/#how-to" className="hover:text-gray-900 dark:hover:text-white transition-colors">How To</a>
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
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Deskly" className="w-6 h-6 shrink-0" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Deskly</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-gray-400 dark:text-gray-500">
            <Link to="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Terms</Link>
            <a href="mailto:hello@deskly.io" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">hello@deskly.io</a>
            <span>© {new Date().getFullYear()} Deskly</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
