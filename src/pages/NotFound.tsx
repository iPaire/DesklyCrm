import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function NotFound() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans flex flex-col items-center justify-center px-4 text-center transition-colors">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-6">
        <span className="text-3xl">🔍</span>
      </div>
      <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-3">404</h1>
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Page not found</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-xs">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to={user ? '/dashboard' : '/'}
        className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        {user ? 'Back to Dashboard' : 'Back to Home'}
      </Link>
    </div>
  )
}
