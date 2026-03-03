import { useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error'
  onDismiss: () => void
  action?: { label: string; onClick: () => void }
}

export function Toast({ message, type, onDismiss, action }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [onDismiss])

  const isSuccess = type === 'success'

  return (
    <div className="fixed top-4 right-4 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border max-w-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 animate-[fadeInDown_0.2s_ease]">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
        isSuccess
          ? 'bg-emerald-100 dark:bg-emerald-950'
          : 'bg-red-100 dark:bg-red-950'
      }`}>
        {isSuccess ? (
          <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{message}</p>
      {action && (
        <button
          onClick={() => { action.onClick(); onDismiss() }}
          className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
