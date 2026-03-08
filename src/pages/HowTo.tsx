import { Link } from 'react-router-dom'
import PublicLayout from '../components/PublicLayout'

// Replace this with your actual YouTube video ID when ready
// e.g. if your URL is https://www.youtube.com/watch?v=dQw4w9WgXcQ → videoId = 'dQw4w9WgXcQ'
const INTRO_VIDEO_ID = ''


export default function HowTo() {
  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">

        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50 dark:bg-primary-950 border border-primary-100 dark:border-primary-900 rounded-full text-xs font-semibold text-primary-700 dark:text-primary-300 mb-5">
            Get started in 5 minutes
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            How to use Deskly
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Watch the intro video below, then follow the step-by-step guide to set up your CRM.
          </p>
        </div>

        {/* Video section */}
        <div className="mb-16">
          {INTRO_VIDEO_ID ? (
            <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-800" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${INTRO_VIDEO_ID}?rel=0&modestbranding=1`}
                title="Getting started with Deskly"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            /* Placeholder shown until a real video ID is set */
            <div className="relative w-full rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" style={{ paddingBottom: '56.25%' }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
                <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-950 flex items-center justify-center">
                  <svg className="w-7 h-7 text-primary-600 dark:text-primary-400 ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Video coming soon</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
                    An intro walkthrough will be added here. In the meantime, follow the steps below to get started.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="mt-16 bg-primary-600 rounded-2xl p-8 sm:p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/30 to-transparent pointer-events-none" />
          <h2 className="text-2xl font-bold text-white mb-3 relative">Ready to get started?</h2>
          <p className="text-primary-200 mb-6 relative">Free 14-day trial. No credit card required.</p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-white hover:bg-gray-50 text-primary-700 font-bold rounded-xl transition-colors shadow-lg relative"
          >
            Create your free account
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-primary-300 text-sm mt-4 relative">
            Still have questions?{' '}
            <Link to="/contact" className="text-white hover:underline font-medium">Contact us →</Link>
          </p>
        </div>

      </div>
    </PublicLayout>
  )
}
