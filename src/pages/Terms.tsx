import PublicLayout from '../components/PublicLayout'

export default function Terms() {
  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-10">Last updated: March 2026</p>

        <div className="space-y-8">

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              By accessing or using Deskly ("the Service"), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">2. Use of the Service</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
              You may use Deskly only for lawful business purposes. You agree not to:
            </p>
            <ul className="space-y-2 text-gray-600 dark:text-gray-400">
              {[
                'Use the Service to send spam or unsolicited communications.',
                'Attempt to gain unauthorized access to any part of the Service.',
                'Reverse engineer, copy, or create derivative works of the Service.',
                'Use the Service to store or transmit malicious code.',
                'Violate any applicable laws or regulations.',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">3. Accounts</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              You are responsible for maintaining the confidentiality of your account credentials and for all activities
              that occur under your account. Notify us immediately at{' '}
              <a href="mailto:support@desklycrm.com" className="text-primary-600 dark:text-primary-400 hover:underline">
                support@desklycrm.com
              </a>{' '}
              if you suspect unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">4. Free Trial & Billing</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              Deskly offers a 14-day free trial with no credit card required. After the trial period, continued use
              of the Service requires a paid subscription at $10 per user per month. Subscriptions are billed monthly
              and can be cancelled at any time. Payments are processed securely by Stripe. Refunds are issued on a
              case-by-case basis - contact us to discuss.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">5. Data Ownership</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              You retain full ownership of all data you enter into Deskly. We do not claim any intellectual property
              rights over your content. Upon account deletion, your data will be permanently removed from our systems
              within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">6. Service Availability</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We strive to maintain high availability but do not guarantee uninterrupted access to the Service.
              We may perform scheduled maintenance with advance notice. We are not liable for any losses resulting
              from downtime or service interruptions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">7. Limitation of Liability</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              To the maximum extent permitted by law, Deskly shall not be liable for any indirect, incidental, special,
              or consequential damages arising from your use of the Service. Our total liability shall not exceed the
              amount you paid us in the three months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">8. Termination</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              You may cancel your account at any time from the Settings page. We reserve the right to terminate or
              suspend accounts that violate these Terms of Service, with or without notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">9. Changes to Terms</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              We may update these Terms from time to time. We will notify you via email at least 7 days before
              material changes take effect. Continued use of the Service after changes constitutes acceptance
              of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">10. Contact</h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              For questions about these Terms, contact us at{' '}
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
