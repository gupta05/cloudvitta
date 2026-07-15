import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, FolderOpen, Gauge, FileText, CreditCard, ShieldCheck, Bell,
  UploadCloud, MailCheck, Lock, Server, EyeOff, BadgeCheck,
  Check, ChevronDown, ChevronRight, Menu, X, HardDrive, FileArchive, Image, File,
} from 'lucide-react';

// ─── Scroll-reveal wrapper (IntersectionObserver, one-shot) ──────────────
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

// ─── Content (everything below reflects actual CloudVitta capabilities) ──
const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#security', label: 'Security' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const FEATURES = [
  {
    icon: FolderOpen,
    title: 'Buckets & objects',
    desc: 'Organize files into buckets, upload with drag & drop, download or delete anytime. Every upload is verified with a SHA-256 checksum.',
  },
  {
    icon: Gauge,
    title: 'Automatic usage metering',
    desc: 'Every upload, download, and delete is metered, and storage snapshots track your usage over time — no manual bookkeeping, ever.',
  },
  {
    icon: FileText,
    title: 'Subscriptions & invoices',
    desc: 'Simple monthly plans with clear invoices you can view and download from your billing page whenever you need them.',
  },
  {
    icon: CreditCard,
    title: 'Payments via Razorpay',
    desc: 'Upgrade with UPI, cards, or netbanking through Razorpay checkout. Every payment is signature-verified on the server before your plan activates.',
  },
  {
    icon: ShieldCheck,
    title: 'Account security built in',
    desc: 'Email OTP verification at sign-up, securely hashed passwords, and full session management — view and revoke active sessions on any device.',
  },
  {
    icon: Bell,
    title: 'Usage & billing alerts',
    desc: 'In-app notifications keep you informed about storage usage, billing events, plan renewals, and new sign-ins to your account.',
  },
];

const STEPS = [
  {
    icon: MailCheck,
    title: 'Create your account',
    desc: 'Sign up with your email and verify it with a one-time code. Your account starts on the Free plan with a storage bucket ready to go.',
  },
  {
    icon: UploadCloud,
    title: 'Upload & organize',
    desc: 'Create buckets and drag & drop your files. Access and download them securely from anywhere you’re signed in.',
  },
  {
    icon: Gauge,
    title: 'Track usage & upgrade',
    desc: 'Your dashboard shows storage and operations in real time. When you need more room, upgrade to Pro in a couple of clicks.',
  },
];

const SECURITY_ITEMS = [
  {
    icon: MailCheck,
    title: 'OTP-verified sign-up & resets',
    desc: 'Six-digit email codes with strict expiry and attempt limits protect registration and password recovery.',
  },
  {
    icon: Lock,
    title: 'Hardened credentials & sessions',
    desc: 'Passwords are hashed with bcrypt. Sessions expire automatically and can be reviewed and revoked from your account at any time.',
  },
  {
    icon: Server,
    title: 'Isolated, durable storage',
    desc: 'Files live on Oracle Cloud Infrastructure object storage, with every tenant’s data kept strictly separated.',
  },
  {
    icon: EyeOff,
    title: 'No public file URLs',
    desc: 'Downloads are authenticated and proxied through the platform — your files are never exposed on public links.',
  },
  {
    icon: BadgeCheck,
    title: 'Verified payments only',
    desc: 'Razorpay payment signatures are verified server-side before any subscription changes — no plan activates on an unverified payment.',
  },
];

const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    period: '/month',
    tagline: 'Get started — free forever, no credit card required.',
    cta: 'Start for free',
    highlight: false,
    features: [
      '500 MB storage',
      '1,000 upload operations / month',
      '10,000 download operations / month',
      'Buckets, dashboard & usage metering',
      'No credit card required',
    ],
  },
  {
    name: 'Pro',
    price: '₹200',
    period: '/month',
    tagline: 'For when 500 MB isn’t enough.',
    cta: 'Get started with Pro',
    highlight: true,
    features: [
      '1 GB storage',
      '5,000 upload operations / month',
      '50,000 download operations / month',
      'Monthly invoices in your billing page',
      'Pay via UPI, cards & netbanking (Razorpay)',
      'Cancel anytime — keep your files on Free',
    ],
  },
];

const FAQS = [
  {
    q: 'Is CloudVitta really free to start?',
    a: 'Yes. Every new account starts on the Free plan with 500 MB of storage — no credit card required. You only pay if you choose to upgrade to Pro.',
  },
  {
    q: 'What happens if I reach my storage limit?',
    a: 'Your dashboard shows usage warnings as you approach your quota. At the limit, new uploads are blocked until you upgrade or delete files — everything already stored stays safe and downloadable.',
  },
  {
    q: 'How do payments work?',
    a: 'Pro is ₹200 per month, paid through Razorpay’s secure checkout with UPI, cards, or netbanking. Your plan activates only after the payment is verified on our servers, and every invoice is available in your billing page.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes, anytime from your billing page. Your account moves to the Free plan — your files remain intact, though uploads above the Free quota are blocked until you make room.',
  },
  {
    q: 'How is my data protected?',
    a: 'Accounts are OTP-verified with bcrypt-hashed passwords and revocable sessions. Files are stored on Oracle Cloud Infrastructure with strict tenant isolation, integrity-checked with SHA-256, and only ever served through authenticated downloads — never public URLs.',
  },
  {
    q: 'Is there a file size limit?',
    a: 'Individual uploads can be up to 100 MB per file, within your plan’s overall storage quota.',
  },
];

// Illustrative preview of the real portal bucket view (files, sizes, quota meter).
const MOCK_FILES = [
  { icon: FileText, name: 'invoice-march.pdf', size: '1.2 MB' },
  { icon: Image, name: 'team-photo.png', size: '4.8 MB' },
  { icon: FileArchive, name: 'project-backup.zip', size: '82 MB' },
  { icon: File, name: 'notes.txt', size: '12 KB' },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  // Signed-in visitors get a shortcut to their app instead of auth CTAs.
  const token = localStorage.getItem('cv_token');
  const role = localStorage.getItem('cv_role');
  const appHome = role === 'user' ? '/portal' : '/dashboard';

  return (
    <div className="min-h-screen bg-cv-bg text-cv-text landing-smooth">
      {/* ─── Nav ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-cv-border bg-cv-bg/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cv-primary">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold">CloudVitta</span>
          </a>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3 py-2 rounded-md text-cv-text-secondary hover:text-cv-text hover:bg-cv-surface-2 transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {token ? (
              <Link to={appHome} className="btn btn-primary btn-sm">
                Open {role === 'user' ? 'portal' : 'dashboard'} <ChevronRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Create account</Link>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 -mr-2 rounded-md text-cv-text-secondary hover:bg-cv-surface-2"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-cv-border bg-cv-surface animate-fade-in">
            <div className="px-5 py-4 flex flex-col gap-1 text-sm">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2.5 rounded-md text-cv-text-secondary hover:bg-cv-surface-2 hover:text-cv-text"
                >
                  {l.label}
                </a>
              ))}
              <div className="h-px bg-cv-border my-2" />
              {token ? (
                <Link to={appHome} className="btn btn-primary justify-center">
                  Open {role === 'user' ? 'portal' : 'dashboard'}
                </Link>
              ) : (
                <>
                  <Link to="/login" className="px-3 py-2.5 rounded-md text-cv-text-secondary hover:bg-cv-surface-2 hover:text-cv-text">Log in</Link>
                  <Link to="/register" className="btn btn-primary justify-center">Create account</Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="top">
        {/* ─── Hero ────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 landing-grid-bg h-[560px]" aria-hidden="true" />
          <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-16 text-center">
            <Reveal>
              <div className="inline-flex items-center gap-2 text-xs font-medium border border-cv-border bg-cv-surface px-3.5 py-1.5 rounded-full text-cv-text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-cv-primary" />
                Multi-tenant cloud object storage
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 text-4xl sm:text-6xl font-bold tracking-tight leading-[1.08]">
                Store your files.
                <br className="hidden sm:block" />
                <span className="text-cv-primary"> We handle the rest.</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-5 text-base sm:text-lg text-cv-text-secondary max-w-2xl mx-auto leading-relaxed">
                CloudVitta is secure cloud storage for individuals and organizations — upload,
                organize, and access your files while authentication, usage metering,
                subscriptions, and billing are managed for you automatically.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link to="/register" className="btn btn-primary w-full sm:w-auto justify-center px-6 py-3">
                  Start free with 500 MB <ChevronRight size={15} />
                </Link>
                <Link to="/login" className="btn btn-secondary w-full sm:w-auto justify-center px-6 py-3">
                  Log in
                </Link>
              </div>
              <p className="mt-4 text-xs text-cv-text-muted">
                No credit card required · 500 MB free forever · Upgrade anytime
              </p>
            </Reveal>

            {/* Product preview — mirrors the real portal bucket view */}
            <Reveal delay={320}>
              <div className="mt-14 relative text-left" aria-hidden="true">
                <div className="glass-card overflow-hidden shadow-2xl shadow-black/40">
                  {/* Window bar */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-cv-border bg-cv-surface-2">
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-cv-border-light" />
                      <span className="w-2.5 h-2.5 rounded-full bg-cv-border-light" />
                      <span className="w-2.5 h-2.5 rounded-full bg-cv-border-light" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="text-xs text-cv-text-muted border border-cv-border rounded-full px-4 py-1 bg-cv-bg">
                        cloudvitta — my-files
                      </div>
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-cv-surface-3 border border-cv-border">
                          <FolderOpen size={17} className="text-cv-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">my-files</p>
                          <p className="text-xs text-cv-text-muted">4 objects · SHA-256 verified</p>
                        </div>
                      </div>
                      <span className="btn btn-primary btn-sm pointer-events-none self-start sm:self-auto">
                        <UploadCloud size={14} /> Upload
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {MOCK_FILES.map((f) => (
                        <div key={f.name} className="border border-cv-border rounded-lg p-3 bg-cv-bg">
                          <div className="w-full h-14 rounded-md bg-cv-surface-2 flex items-center justify-center mb-2">
                            <f.icon size={18} className="text-cv-text-secondary" />
                          </div>
                          <p className="text-xs font-medium truncate">{f.name}</p>
                          <p className="text-[11px] text-cv-text-muted">{f.size}</p>
                        </div>
                      ))}
                      <div className="dropzone !p-3 flex flex-col items-center justify-center text-center col-span-2 sm:col-span-1">
                        <UploadCloud size={16} className="text-cv-text-muted mb-1" />
                        <p className="text-[11px] text-cv-text-muted">Drag & drop files</p>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-cv-border">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-cv-text-muted flex items-center gap-1.5">
                          <HardDrive size={13} /> Storage used
                        </span>
                        <span className="text-cv-text-secondary font-medium">341 MB of 500 MB</span>
                      </div>
                      <div className="storage-meter">
                        <div className="storage-meter-fill" style={{ width: '68%' }} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[80%] h-12 bg-cv-primary/10 blur-3xl rounded-full -z-10" />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Features ────────────────────────────────────── */}
        <section id="features" className="border-t border-cv-border scroll-mt-16">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal className="max-w-2xl mb-12">
              <span className="text-xs font-bold tracking-widest uppercase text-cv-primary">Platform</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                Storage, metering, and billing — one platform
              </h2>
              <p className="text-cv-text-secondary mt-4 leading-relaxed">
                Everything you need to store files and stay on top of your usage and costs,
                without stitching tools together.
              </p>
            </Reveal>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 80}>
                  <div className="glass-card p-6 h-full transition-colors hover:border-cv-border-light">
                    <div className="w-10 h-10 rounded-lg bg-cv-surface-3 border border-cv-border flex items-center justify-center mb-5">
                      <f.icon size={18} className="text-cv-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{f.title}</h3>
                    <p className="text-sm text-cv-text-secondary leading-relaxed">{f.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─── How it works ────────────────────────────────── */}
        <section id="how-it-works" className="border-t border-cv-border bg-cv-surface/40 scroll-mt-16">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal className="text-center max-w-2xl mx-auto mb-14">
              <span className="text-xs font-bold tracking-widest uppercase text-cv-primary">How it works</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                From sign-up to first upload in minutes
              </h2>
            </Reveal>

            <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
              {STEPS.map((s, i) => (
                <Reveal key={s.title} delay={i * 100}>
                  <div className="glass-card p-6 h-full relative">
                    <span className="absolute top-5 right-5 text-4xl font-bold text-cv-surface-3 select-none">
                      {i + 1}
                    </span>
                    <div className="w-10 h-10 rounded-lg bg-cv-primary/10 border border-cv-primary/20 flex items-center justify-center mb-5">
                      <s.icon size={18} className="text-cv-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">{s.title}</h3>
                    <p className="text-sm text-cv-text-secondary leading-relaxed">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Security & privacy ──────────────────────────── */}
        <section id="security" className="border-t border-cv-border scroll-mt-16">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <Reveal className="lg:sticky lg:top-24">
                <span className="text-xs font-bold tracking-widest uppercase text-cv-primary">Security & privacy</span>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-3 leading-tight">
                  Private by default, verified at every step
                </h2>
                <p className="text-cv-text-secondary mt-4 leading-relaxed">
                  Your files belong to you. CloudVitta keeps every tenant&rsquo;s data isolated,
                  every download authenticated, and every payment verified — with account
                  security you can inspect and control yourself.
                </p>
                <Link to="/register" className="btn btn-secondary mt-8">
                  Create a secure account <ChevronRight size={15} />
                </Link>
              </Reveal>

              <div className="space-y-3">
                {SECURITY_ITEMS.map((s, i) => (
                  <Reveal key={s.title} delay={i * 70}>
                    <div className="glass-card p-5 flex items-start gap-4">
                      <div className="w-9 h-9 rounded-lg bg-cv-surface-3 border border-cv-border flex items-center justify-center shrink-0">
                        <s.icon size={16} className="text-cv-success" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">{s.title}</h3>
                        <p className="text-sm text-cv-text-secondary mt-1 leading-relaxed">{s.desc}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Pricing ─────────────────────────────────────── */}
        <section id="pricing" className="border-t border-cv-border bg-cv-surface/40 scroll-mt-16">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal className="text-center max-w-xl mx-auto mb-14">
              <span className="text-xs font-bold tracking-widest uppercase text-cv-primary">Pricing</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                Two plans. No surprises.
              </h2>
              <p className="text-cv-text-secondary mt-4">
                Start free and upgrade only when you need more space.
              </p>
            </Reveal>

            <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {PLANS.map((plan, i) => (
                <Reveal key={plan.name} delay={i * 100}>
                  <div
                    className={`glass-card p-7 h-full relative flex flex-col ${
                      plan.highlight ? 'border-cv-primary shadow-lg shadow-cv-primary/10' : ''
                    }`}
                  >
                    {plan.highlight && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-trial bg-cv-primary !text-white !border-cv-primary">
                        Most popular
                      </span>
                    )}
                    <h3 className="font-semibold text-lg">{plan.name}</h3>
                    <p className="text-sm text-cv-text-muted mt-1">{plan.tagline}</p>
                    <p className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                      <span className="text-sm text-cv-text-muted">{plan.period}</span>
                    </p>
                    <Link
                      to="/register"
                      className={`btn w-full justify-center mt-6 ${plan.highlight ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {plan.cta}
                    </Link>
                    <ul className="mt-7 space-y-3 text-sm text-cv-text-secondary">
                      {plan.features.map((feat) => (
                        <li key={feat} className="flex gap-2.5">
                          <Check size={15} className="text-cv-success shrink-0 mt-0.5" />
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={200}>
              <p className="text-center text-xs text-cv-text-muted mt-8 max-w-lg mx-auto leading-relaxed">
                Prices in INR. Pro is billed monthly via Razorpay secure checkout. Cancelling or
                downgrading keeps your files — uploads above your new quota are simply blocked
                until you free up space.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ─── FAQ ─────────────────────────────────────────── */}
        <section id="faq" className="border-t border-cv-border scroll-mt-16">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <Reveal className="text-center mb-12">
              <span className="text-xs font-bold tracking-widest uppercase text-cv-primary">FAQ</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-3">
                Frequently asked questions
              </h2>
            </Reveal>

            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <Reveal key={faq.q} delay={i * 50}>
                  <div className="glass-card overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 text-sm font-medium hover:bg-cv-surface-2 transition-colors"
                      aria-expanded={openFaq === i}
                    >
                      {faq.q}
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-cv-text-muted transition-transform duration-200 ${
                          openFaq === i ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {openFaq === i && (
                      <div className="px-5 pb-4 text-sm text-cv-text-secondary leading-relaxed animate-fade-in">
                        {faq.a}
                      </div>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─── CTA banner ──────────────────────────────────── */}
        <section className="border-t border-cv-border">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20">
            <Reveal>
              <div className="relative overflow-hidden rounded-2xl border border-cv-primary/30 bg-gradient-to-br from-cv-primary/15 via-cv-surface to-cv-surface px-8 sm:px-14 py-14 text-center">
                <div className="absolute inset-0 landing-grid-bg opacity-40" aria-hidden="true" />
                <div className="relative">
                  <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                    Your files deserve a better home
                  </h2>
                  <p className="text-cv-text-secondary mt-4 max-w-xl mx-auto">
                    Create your free account and upload your first file in minutes —
                    500 MB included, no credit card required.
                  </p>
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link to="/register" className="btn btn-primary w-full sm:w-auto justify-center px-6 py-3">
                      Create free account
                    </Link>
                    <Link to="/login" className="btn btn-secondary w-full sm:w-auto justify-center px-6 py-3">
                      Log in
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ─── Footer ────────────────────────────────────────── */}
      <footer className="border-t border-cv-border">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cv-primary">
                  <Zap size={18} className="text-white" />
                </div>
                <span className="text-lg font-bold">CloudVitta</span>
              </div>
              <p className="text-sm text-cv-text-muted max-w-xs leading-relaxed">
                Multi-tenant cloud object storage with usage metering, subscriptions,
                and billing built in.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cv-text-muted mb-4">Product</p>
              <ul className="space-y-2.5 text-sm text-cv-text-secondary">
                <li><a href="#features" className="hover:text-cv-text transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-cv-text transition-colors">How it works</a></li>
                <li><a href="#security" className="hover:text-cv-text transition-colors">Security</a></li>
                <li><a href="#pricing" className="hover:text-cv-text transition-colors">Pricing</a></li>
                <li><a href="#faq" className="hover:text-cv-text transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cv-text-muted mb-4">Account</p>
              <ul className="space-y-2.5 text-sm text-cv-text-secondary">
                <li><Link to="/login" className="hover:text-cv-text transition-colors">Log in</Link></li>
                <li><Link to="/register" className="hover:text-cv-text transition-colors">Create account</Link></li>
                <li><Link to="/forgot-password" className="hover:text-cv-text transition-colors">Reset password</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-cv-border mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-cv-text-muted">© 2026 CloudVitta. All rights reserved.</p>
            <p className="text-xs text-cv-text-muted">
              Storage on Oracle Cloud Infrastructure · Payments by Razorpay
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
