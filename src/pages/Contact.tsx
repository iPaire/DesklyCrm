import PublicLayout from '../components/PublicLayout'

export default function Contact() {
  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-14">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">Contact Us</h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            Have a question or need help? We're here for you - usually respond within a few hours.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">

          {/* Left: contact info */}
          <div className="space-y-6">

            {/* Email card */}
            <div className="bg-primary-50 dark:bg-primary-950/40 border border-primary-100 dark:border-primary-900/50 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white text-lg">
                  ✉
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">Email Support</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Mon - Fri, 9am - 6pm CET</p>
                </div>
              </div>
              <a
                href="mailto:support@desklycrm.com"
                className="text-lg font-semibold text-primary-700 dark:text-primary-300 hover:underline break-all"
              >
                support@desklycrm.com
              </a>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                For billing, technical issues, feature requests, or general questions.
              </p>
            </div>

            {/* Response time */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">What to expect</h3>
              <div className="space-y-3">
                {[
                  { icon: '⚡', label: 'General questions', time: '< 4 hours' },
                  { icon: '🐛', label: 'Bug reports', time: '< 24 hours' },
                  { icon: '💳', label: 'Billing inquiries', time: '< 2 hours' },
                  { icon: '✨', label: 'Feature requests', time: 'Reviewed weekly' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <span>{item.icon}</span>
                      {item.label}
                    </span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                      {item.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: FAQ */}
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">Frequently asked questions</h2>
            <div className="space-y-4">
              {[
                {
                  q: 'How do I cancel my subscription?',
                  a: 'You can cancel anytime from Settings → Billing. Your account remains active until the end of the billing period.',
                },
                {
                  q: 'Can I export my data?',
                  a: 'Yes. You can export your contacts and deals as CSV from the respective pages at any time.',
                },
                {
                  q: 'Is my Gmail data stored on your servers?',
                  a: 'Email metadata is stored to display threads in Deskly. Full email bodies are fetched on demand and not permanently stored. See our Privacy Policy for details.',
                },
                {
                  q: 'Do you offer a discount for teams?',
                  a: 'We have a flat rate of $8/user/month which is already very competitive. Reach out if you have a larger team and we can discuss.',
                },
                {
                  q: 'I found a bug - what should I do?',
                  a: 'Email us at support@desklycrm.com with a description and screenshots. We take bugs seriously and will get back to you quickly.',
                },
              ].map(item => (
                <div key={item.q} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">{item.q}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
