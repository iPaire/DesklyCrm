import PublicLayout from '../components/PublicLayout'

export default function Privacy() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-10">Last updated: March 2026</p>

        <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-8">

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">1. Information We Collect</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We collect information you provide directly to us when you create an account, such as your name, email address, and password.
              We also collect data you enter into the application, including contacts, deals, tasks, and notes.
            </p>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed mt-3">
              If you connect your Gmail account, we access your email metadata (sender, recipient, subject, date) and email body content
              solely to display and sync emails within Deskly. We do not store email content on our servers beyond what is necessary
              for the feature to function.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">2. How We Use Your Information</h2>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              {[
                'To provide, maintain, and improve the Deskly service.',
                'To authenticate your identity and keep your account secure.',
                'To send transactional emails (e.g., password resets, account notifications).',
                'To run automations you have enabled within the app.',
                'To respond to your support requests.',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">3. Data Storage & Security</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Your data is stored securely using Supabase (PostgreSQL) with row-level security enabled. All data is encrypted
              in transit via TLS and at rest. We follow industry-standard security practices to protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">4. Data Sharing</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We do not sell, trade, or rent your personal information to third parties. We may share data with trusted
              service providers who assist us in operating our platform (e.g., Supabase for database hosting, Google for
              Gmail OAuth), under strict confidentiality obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">5. Your Rights</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              You may request access to, correction of, or deletion of your personal data at any time by contacting us at{' '}
              <a href="mailto:support@desklycrm.com" className="text-primary-600 dark:text-primary-400 hover:underline">
                support@desklycrm.com
              </a>
              . You can also delete your account directly from the Settings page.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">6. Cookies</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We use minimal cookies and local storage to maintain your session and remember your preferences (e.g., dark mode).
              We do not use tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">7. Changes to This Policy</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of significant changes via email
              or a prominent notice within the application. Continued use of Deskly after changes constitutes your
              acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">8. Contact</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:support@desklycrm.com" className="text-primary-600 dark:text-primary-400 hover:underline">
                support@desklycrm.com
              </a>.
            </p>
          </section>

        </div>
      </div>
    </PublicLayout>
  )
}
