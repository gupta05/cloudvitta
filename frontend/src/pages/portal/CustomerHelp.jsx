import { useState } from 'react';
import { HelpCircle, Info, Shield, FileText, ChevronDown, ChevronUp, MessageSquare, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const faqData = [
  { q: 'How do I upload files?', a: 'Navigate to My Storage, select a bucket, and use the upload area to drag & drop files or click to browse. You can also upload via the API using your API key.' },
  { q: 'What are the storage limits?', a: 'Storage limits depend on your plan. The Free plan includes 500 MB, and the Pro plan includes 1 GB for ₹200/month. View your current usage on the Dashboard or Billing page.' },
  { q: 'How do I upgrade my plan?', a: 'Go to Billing → Plans tab to view available plans. Click "Upgrade" on any plan to switch immediately. Your existing data will not be affected.' },
  { q: 'How does billing work?', a: 'CloudVitta bills monthly based on your plan. Your plan fee covers the storage included in your plan, charged at the start of each billing period. You are billed for storage according to your plan.' },
  { q: 'What happens if I exceed my storage quota?', a: 'You will receive warnings at 75% and 90% usage. Once you reach 100%, new uploads will be blocked until you upgrade your plan or delete existing files.' },
  { q: 'How do I get an API key?', a: 'Go to Account → Security tab or the Developer page. Click "Create API Key" and save the generated key securely. Use it in the Authorization header as a Bearer token.' },
  { q: 'Can I delete my account?', a: 'Yes. Go to Account → Delete Account tab. This will permanently delete all your data including storage files, billing history, and account information. This action cannot be undone.' },
  { q: 'How do I cancel my subscription?', a: 'Go to Billing → Overview and click "Cancel Subscription". Your storage will remain accessible until the end of the current billing period.' },
  { q: 'What regions are available for storage?', a: 'CloudVitta currently supports US East (N. Virginia), US West (Oregon), EU (Ireland), Asia Pacific (Mumbai), and Asia Pacific (Tokyo). You can set your default region in Settings.' },
  { q: 'Is my data encrypted?', a: 'Yes. All data is encrypted in transit using TLS 1.2+ and at rest using AES-256 encryption. Your files are stored in Oracle Cloud Infrastructure Object Storage with enterprise-grade security.' },
];

export default function CustomerHelp() {
  const [tab, setTab] = useState('help');
  const [openFaq, setOpenFaq] = useState(null);
  const [contactForm, setContactForm] = useState({ subject: '', message: '' });
  const [sending, setSending] = useState(false);

  const handleContact = (e) => {
    e.preventDefault();
    setSending(true);
    setTimeout(() => {
      toast.success('Message sent! We\'ll get back to you within 24 hours.');
      setContactForm({ subject: '', message: '' });
      setSending(false);
    }, 800);
  };

  const tabs = [
    { key: 'help', label: 'Help Center', icon: HelpCircle },
    { key: 'about', label: 'About', icon: Info },
    { key: 'privacy', label: 'Privacy Policy', icon: Shield },
    { key: 'terms', label: 'Terms of Service', icon: FileText },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Help & Support</h1>
        <p className="text-cv-text-secondary text-sm mt-1">Get help, learn about CloudVitta, and review our policies</p>
      </div>

      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-cv-surface-2 inline-flex flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-cv-primary text-white' : 'text-cv-text-secondary hover:text-cv-text'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── Help Center ─── */}
      {tab === 'help' && (
        <div className="max-w-3xl space-y-6">
          {/* FAQ */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-cv-text mb-4">Frequently Asked Questions</h3>
            <div className="space-y-2">
              {faqData.map((faq, i) => (
                <div key={i} className="border border-cv-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-cv-surface-2 transition-colors"
                  >
                    <span className="text-sm font-medium text-cv-text">{faq.q}</span>
                    {openFaq === i ? <ChevronUp size={16} className="text-cv-text-muted" /> : <ChevronDown size={16} className="text-cv-text-muted" />}
                  </button>
                  {openFaq === i && (
                    <div className="px-4 pb-4 text-sm text-cv-text-secondary animate-fade-in">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2">
              <MessageSquare size={16} className="text-cv-accent" /> Contact Support
            </h3>
            <form onSubmit={handleContact} className="space-y-4">
              <div>
                <label className="form-label">Subject</label>
                <input className="form-input" value={contactForm.subject} onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })} placeholder="What do you need help with?" required />
              </div>
              <div>
                <label className="form-label">Message</label>
                <textarea className="form-input" rows={4} value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} placeholder="Describe your issue in detail..." required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={sending}>
                {sending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>

          {/* API Docs link */}
          <div className="glass-card p-6 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-cv-text">API Documentation</h3>
              <p className="text-xs text-cv-text-muted mt-1">Learn how to integrate CloudVitta storage into your applications</p>
            </div>
            <a href="/portal/developer" className="btn btn-secondary btn-sm flex items-center gap-1">
              View Docs <ExternalLink size={12} />
            </a>
          </div>
        </div>
      )}

      {/* ─── About ─── */}
      {tab === 'about' && (
        <div className="max-w-3xl space-y-6">
          <div className="glass-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-cv-primary">
                <span className="text-2xl">⚡</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-cv-text">CloudVitta</h2>
                <p className="text-sm text-cv-text-muted">Enterprise Cloud Object Storage Platform</p>
              </div>
            </div>

            <p className="text-sm text-cv-text-secondary leading-relaxed mb-6">
              CloudVitta is a production-grade cloud object storage platform built for developers and businesses.
              It provides scalable, secure, and cost-effective storage with a powerful API, real-time usage metering,
              and flexible billing — all with enterprise-level reliability.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-cv-bg border border-cv-border">
                <h4 className="text-sm font-semibold text-cv-text mb-2">Platform Capabilities</h4>
                <ul className="text-xs text-cv-text-secondary space-y-1.5">
                  <li>• S3-compatible object storage</li>
                  <li>• Multi-tenant architecture</li>
                  <li>• Usage-based billing & metering</li>
                  <li>• Real-time storage analytics</li>
                  <li>• API key management</li>
                  <li>• Webhook integrations</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-cv-bg border border-cv-border">
                <h4 className="text-sm font-semibold text-cv-text mb-2">Security & Compliance</h4>
                <ul className="text-xs text-cv-text-secondary space-y-1.5">
                  <li>• AES-256 encryption at rest</li>
                  <li>• TLS 1.2+ encryption in transit</li>
                  <li>• JWT-based authentication</li>
                  <li>• Session management & revocation</li>
                  <li>• Tenant data isolation</li>
                  <li>• OTP email verification</li>
                </ul>
              </div>
            </div>

            <div className="border-t border-cv-border pt-4">
              <p className="text-xs text-cv-text-muted">Version 1.0.0 • Built with React, Express, Prisma, and Oracle Cloud Infrastructure</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Privacy Policy ─── */}
      {tab === 'privacy' && (
        <div className="max-w-3xl">
          <div className="glass-card p-8">
            <h2 className="text-xl font-bold text-cv-text mb-2">Privacy Policy</h2>
            <p className="text-xs text-cv-text-muted mb-6">Last updated: July 1, 2026</p>
            <div className="prose-dark space-y-6 text-sm text-cv-text-secondary leading-relaxed">
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">1. Information We Collect</h3>
                <p>We collect information you provide directly, including your name, email address, and payment information when you create an account. We also automatically collect usage data including storage metrics, API access patterns, and device information for security purposes.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">2. How We Use Your Information</h3>
                <p>We use your information to provide and maintain the CloudVitta service, process payments, send important notifications about your account, monitor and analyze usage patterns, and ensure the security of our platform.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">3. Data Storage & Security</h3>
                <p>Your files are stored in Oracle Cloud Infrastructure with AES-256 encryption at rest. All data in transit is protected with TLS 1.2+. We implement strict access controls and tenant isolation to ensure your data remains private and secure.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">4. Data Retention</h3>
                <p>We retain your data for as long as your account is active. When you delete your account, all associated data — including stored files, billing records, and usage logs — is permanently deleted within 30 days.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">5. Third-Party Services</h3>
                <p>We use Oracle Cloud Infrastructure for storage, and standard email services for account notifications. We do not sell your personal information to third parties.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">6. Your Rights</h3>
                <p>You have the right to access, correct, or delete your personal information. You can export your data through the API, update your profile settings, or delete your account entirely from the Account page.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">7. Contact</h3>
                <p>For privacy-related inquiries, please contact our support team through the Help Center or email privacy@cloudvitta.com.</p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ─── Terms of Service ─── */}
      {tab === 'terms' && (
        <div className="max-w-3xl">
          <div className="glass-card p-8">
            <h2 className="text-xl font-bold text-cv-text mb-2">Terms of Service</h2>
            <p className="text-xs text-cv-text-muted mb-6">Last updated: July 1, 2026</p>
            <div className="prose-dark space-y-6 text-sm text-cv-text-secondary leading-relaxed">
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">1. Acceptance of Terms</h3>
                <p>By accessing or using CloudVitta, you agree to be bound by these Terms of Service. If you do not agree, you may not use the service. These terms apply to all users, including administrators and end-users.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">2. Account Registration</h3>
                <p>You must provide accurate, complete, and current information when creating an account. You are responsible for safeguarding your password and API keys. You must notify us immediately of any unauthorized access to your account.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">3. Acceptable Use</h3>
                <p>You agree not to use CloudVitta to store illegal content, distribute malware, infringe on intellectual property rights, or engage in any activity that could harm the platform or other users. We reserve the right to suspend accounts that violate these terms.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">4. Storage & Quotas</h3>
                <p>Each plan includes a specific storage allowance along with operation quotas. Exceeding your plan's storage quota may result in service limitations. We will notify you when you approach your quota limits.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">5. Billing & Payments</h3>
                <p>Paid plans are billed according to the billing period selected. All fees are non-refundable unless otherwise stated. We reserve the right to modify pricing with 30 days' advance notice.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">6. Service Availability</h3>
                <p>We strive for 99.9% uptime but do not guarantee uninterrupted service. Scheduled maintenance will be announced in advance. We are not liable for any data loss or service interruption.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">7. Account Termination</h3>
                <p>You may delete your account at any time from the Account settings. Upon deletion, all your data will be permanently removed. We may terminate accounts that violate these terms without prior notice.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">8. Limitation of Liability</h3>
                <p>CloudVitta is provided "as is" without warranties of any kind. We shall not be liable for any indirect, incidental, or consequential damages arising from the use of our service.</p>
              </section>
              <section>
                <h3 className="text-base font-semibold text-cv-text mb-2">9. Changes to Terms</h3>
                <p>We may update these terms from time to time. Continued use of CloudVitta after changes constitutes acceptance of the revised terms. We will notify users of significant changes via email or in-app notification.</p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
