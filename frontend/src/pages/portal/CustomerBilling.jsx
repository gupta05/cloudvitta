import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CreditCard, FileText, ChevronRight, HardDrive, Zap, Download as DownloadIcon, Package, Check, Star, Plus, Trash2, AlertTriangle, Receipt, RefreshCw, Gauge, IndianRupee, Info } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import TabPills from '../../components/ui/TabPills';
import { formatCurrency, formatRupees } from '../../lib/currency';
import { formatDate } from '../../lib/format';
import { PAYMENT_BADGES } from '../../lib/uiMaps';
import { loadRazorpayScript } from '../../lib/razorpay';
import { PRIMARY, GRID_STROKE, AXIS_STROKE, TOOLTIP_STYLE } from '../../lib/chartTheme';
import { toast } from 'sonner';

export default function CustomerBilling() {
  const [tab, setTab] = useState('overview');
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [charges, setCharges] = useState(null);
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [metered, setMetered] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Plan change
  const [changingPlan, setChangingPlan] = useState(null);
  const [subscribing, setSubscribing] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Cancel
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Payment method form
  const [showAddPM, setShowAddPM] = useState(false);
  const [pmForm, setPmForm] = useState({ brand: 'visa', last4: '', expMonth: '', expYear: '' });
  const [addingPM, setAddingPM] = useState(false);
  const [removePMTarget, setRemovePMTarget] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, invRes, usageRes, plansRes, pmRes, chargesRes, payRes, txnRes] = await Promise.all([
        api.getPortalSubscription(),
        api.getPortalInvoices(),
        api.getPortalUsage(),
        api.getAvailablePlans(),
        api.getPaymentMethods(),
        api.getCurrentCharges(),
        api.getPaymentHistory(),
        api.getTransactionHistory(),
      ]);
      setSubscription(subRes?.subscription);
      setInvoices(invRes?.data || []);
      setUsage(usageRes);
      setPlans(plansRes?.data || []);
      setPaymentMethods(pmRes?.data || []);
      setCharges(chargesRes);
      setPayments(payRes?.data || []);
      setTransactions(txnRes?.data || []);

      // Metered-billing view (404 when not on a metered plan)
      const isMeteredSub = subRes?.subscription?.planVersion?.plan?.planType === 'METERED';
      if (isMeteredSub) {
        try { setMetered(await api.getMeteredUsage()); } catch { setMetered(null); }
      } else {
        setMetered(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Parse plan details from subscription
  let planName = 'No active plan';
  let planPrice = formatRupees(0);
  let billingPeriod = '';
  let quotaGB = 0;
  let includedOps = 0;
  let planPriceValue = 0;
  const isMetered = subscription?.planVersion?.plan?.planType === 'METERED';

  if (subscription) {
    planName = subscription.planVersion?.plan?.name || 'Unknown';
    billingPeriod = subscription.planVersion?.billingPeriod || '';
    for (const comp of (subscription.planVersion?.priceComponents || [])) {
      const pricing = JSON.parse(comp.pricingModel || '{}');
      if (pricing.model === 'flat') { planPrice = formatRupees(pricing.price || 0); planPriceValue = pricing.price || 0; }
      if (pricing.model === 'metered_gb_month') {
        planPrice = `${formatRupees(pricing.pricePerGBMonth || 0)}/GB`;
        if (pricing.hardCapGB && !quotaGB) quotaGB = pricing.hardCapGB;
      }
      // Storage quota = the storage the plan grants (includedGB), falling back to hardCapGB.
      if (pricing.includedGB) quotaGB = pricing.includedGB;
      else if (pricing.hardCapGB && !quotaGB) quotaGB = pricing.hardCapGB;
      // Operations meter is combined PUT+GET, so sum each component's included allowance.
      if (pricing.includedOps) includedOps += pricing.includedOps;
    }
  }

  const currentStorageGB = usage?.storage?.currentGB || 0;
  const putOps = usage?.operations?.storage_put_ops || 0;
  const getOps = usage?.operations?.storage_get_ops || 0;

  // Free plans subscribe directly; paid plans go through Razorpay checkout.
  const handleSubscribe = async (plan) => {
    if ((plan.monthlyPrice || 0) > 0) {
      return launchCheckout(plan);
    }
    setSubscribing(true);
    try {
      await api.subscribeToPlan({ planVersionId: plan.versionId });
      toast.success('Plan changed successfully!');
      setChangingPlan(null);
      fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setSubscribing(false); }
  };

  const launchCheckout = async (plan, purpose = 'subscription_purchase') => {
    setSubscribing(true);
    try {
      const order = await api.createPaymentOrder({
        planVersionId: plan.versionId,
        purpose,
        ...(purpose === 'renewal' && subscription && { subscriptionId: subscription.id }),
      });
      await loadRazorpayScript();
      setChangingPlan(null);

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amountCents, // already in paise — never multiply
        currency: order.currency,
        name: 'CloudVitta',
        description: purpose === 'renewal'
          ? `${order.planName} plan — renewal`
          : `${order.planName} plan — monthly subscription`,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: '#3b82f6' }, // Razorpay checkout needs a literal hex (cv-primary)
        modal: {
          ondismiss: () => {
            api.reportPaymentFailure({ razorpay_order_id: order.orderId, cancelled: true }).catch(() => {});
            toast.info('Payment cancelled — you have not been charged');
          },
        },
        handler: async (resp) => {
          setVerifying(true);
          try {
            await api.verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            toast.success(purpose === 'renewal'
              ? `${order.planName} plan renewed!`
              : `Payment successful — ${order.planName} plan is now active!`);
          } catch (err) {
            toast.error(`Payment received but verification failed: ${err.message}. Reference: ${resp.razorpay_payment_id} — it will be confirmed automatically.`);
          } finally {
            setVerifying(false);
            fetchData();
          }
        },
      });

      rzp.on('payment.failed', (resp) => {
        api.reportPaymentFailure({
          razorpay_order_id: order.orderId,
          code: resp.error?.code || null,
          description: resp.error?.description || null,
        }).catch(() => {});
        toast.error(resp.error?.description || 'Payment failed. Please try again.');
      });

      rzp.open();
    } catch (err) { toast.error(err.message); }
    finally { setSubscribing(false); }
  };

  // Pay an open (FINALIZED/OVERDUE) invoice — used by metered arrears invoices.
  const payInvoice = async (inv) => {
    setSubscribing(true);
    try {
      const order = await api.createPaymentOrder({ purpose: 'invoice_payment', invoiceId: inv.id });
      await loadRazorpayScript();

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amountCents, // already in paise — never multiply
        currency: order.currency,
        name: 'CloudVitta',
        description: `Invoice ${order.invoiceNumber || inv.invoiceNumber} — usage charges`,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: '#3b82f6' },
        modal: {
          ondismiss: () => {
            api.reportPaymentFailure({ razorpay_order_id: order.orderId, cancelled: true }).catch(() => {});
            toast.info('Payment cancelled — you have not been charged');
          },
        },
        handler: async (resp) => {
          setVerifying(true);
          try {
            await api.verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            toast.success(`Invoice ${inv.invoiceNumber} paid!`);
          } catch (err) {
            toast.error(`Payment received but verification failed: ${err.message}. Reference: ${resp.razorpay_payment_id} — it will be confirmed automatically.`);
          } finally {
            setVerifying(false);
            fetchData();
          }
        },
      });

      rzp.on('payment.failed', (resp) => {
        api.reportPaymentFailure({
          razorpay_order_id: order.orderId,
          code: resp.error?.code || null,
          description: resp.error?.description || null,
        }).catch(() => {});
        toast.error(resp.error?.description || 'Payment failed. Please try again.');
      });

      rzp.open();
    } catch (err) { toast.error(err.message); }
    finally { setSubscribing(false); }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelSubscription(cancelReason);
      toast.success('Subscription cancelled');
      setShowCancel(false);
      fetchData();
    } catch (err) { toast.error(err.message); }
    finally { setCancelling(false); }
  };

  const handleAddPM = async (e) => {
    e.preventDefault();
    if (pmForm.last4.length !== 4 || !/^\d{4}$/.test(pmForm.last4)) {
      return toast.error('Last 4 digits must be exactly 4 numbers');
    }
    setAddingPM(true);
    try {
      await api.addPaymentMethod({
        brand: pmForm.brand,
        last4: pmForm.last4,
        expMonth: parseInt(pmForm.expMonth) || null,
        expYear: parseInt(pmForm.expYear) || null,
      });
      toast.success('Payment method added');
      setShowAddPM(false);
      setPmForm({ brand: 'visa', last4: '', expMonth: '', expYear: '' });
      const pmRes = await api.getPaymentMethods();
      setPaymentMethods(pmRes?.data || []);
    } catch (err) { toast.error(err.message); }
    finally { setAddingPM(false); }
  };

  const handleRemovePM = async (id) => {
    try {
      await api.removePaymentMethod(id);
      toast.success('Payment method removed');
      setPaymentMethods((pm) => pm.filter((p) => p.id !== id));
    } catch (err) { toast.error(err.message); }
  };

  const handleSetDefault = async (id) => {
    try {
      await api.setDefaultPaymentMethod(id);
      toast.success('Default payment method updated');
      setPaymentMethods((pm) => pm.map((p) => ({ ...p, isDefault: p.id === id })));
    } catch (err) { toast.error(err.message); }
  };

  const handleDownloadInvoice = async (inv) => {
    try {
      const data = await api.downloadInvoice(inv.id);
      // Create printable window
      const w = window.open('', '_blank');
      w.document.write(`<html><head><meta charset="utf-8"><title>Invoice ${inv.invoiceNumber}</title>
        <style>body{font-family:system-ui;padding:40px;max-width:800px;margin:0 auto}
        table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:10px;text-align:left;border-bottom:1px solid #ddd}
        th{background:#f5f5f5}h1{margin:0}.meta{color:#666;font-size:14px}.total{font-size:20px;font-weight:bold}</style></head>
        <body><h1>Invoice ${data.invoice.invoiceNumber}</h1>
        <p class="meta">From: ${data.company?.legalName || 'CloudVitta Inc.'}</p>
        <p class="meta">To: ${data.invoice.customer?.name || 'Customer'}</p>
        <p class="meta">Date: ${formatDate(data.invoice.issueDate)}</p>
        <p class="meta">Status: ${data.invoice.status}</p>
        <table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>`);
      for (const line of (data.invoice.lines || [])) {
        w.document.write(`<tr><td>${line.name}</td><td>${line.quantity}</td><td>${formatCurrency(line.unitPriceCents)}</td><td>${formatCurrency(line.totalCents)}</td></tr>`);
      }
      w.document.write(`</tbody></table>
        <p>Subtotal: ${formatCurrency(data.invoice.subtotalCents)}</p>
        <p>Tax: ${formatCurrency(data.invoice.taxCents)}</p>
        <p class="total">Total: ${formatCurrency(data.invoice.totalCents)}</p>
        ${data.company?.footerNote ? `<p class="meta" style="margin-top:40px">${data.company.footerNote}</p>` : ''}
        </body></html>`);
      w.document.close();
      w.print();
    } catch (err) { toast.error(err.message); }
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: CreditCard },
    { key: 'plans', label: 'Plans', icon: Package },
    { key: 'invoices', label: 'Invoices', icon: FileText },
    { key: 'payments', label: 'Payments', icon: Receipt },
    { key: 'payment', label: 'Payment Methods', icon: CreditCard },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Billing</h1>
        <p className="text-cv-text-secondary text-sm mt-1">Manage your subscription, plans, and payment methods</p>
      </div>

      <TabPills tabs={tabs} active={tab} onChange={setTab} />

      {/* ─── Overview Tab ─── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Overdue invoice → uploads blocked banner (metered dunning) */}
          {metered?.uploadsBlocked && metered.overdueInvoice && (
            <div className="p-4 rounded-lg bg-cv-danger/10 border border-cv-danger/30 flex flex-wrap items-center justify-between gap-3" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-cv-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-cv-danger">Uploads are blocked — invoice overdue</p>
                  <p className="text-xs text-cv-text-secondary mt-1">
                    Invoice {metered.overdueInvoice.invoiceNumber} ({formatCurrency(metered.overdueInvoice.amountDueCents)}) was due {formatDate(metered.overdueInvoice.dueDate)}.
                    Pay it to resume uploads — your stored files remain accessible.
                  </p>
                </div>
              </div>
              <button onClick={() => payInvoice({ id: metered.overdueInvoice.id, invoiceNumber: metered.overdueInvoice.invoiceNumber })}
                disabled={subscribing} className="btn btn-primary btn-sm shrink-0">
                <IndianRupee size={12} /> Pay Now
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Plan */}
            <div className="lg:col-span-2 glass-card p-6">
              <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2">
                <CreditCard size={16} className="text-cv-accent" /> Current Plan
              </h3>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-2xl font-bold text-cv-text">{planName}</p>
                  <p className="text-sm text-cv-text-muted">{planPrice}/{billingPeriod?.toLowerCase() || 'month'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {subscription && <span className={`badge badge-${subscription.status.toLowerCase()}`}>{subscription.status}</span>}
                  <button onClick={() => setTab('plans')} className="btn btn-secondary btn-sm">Change Plan</button>
                </div>
              </div>

              {subscription?.trialEndDate && subscription.status === 'TRIAL' && (
                <div className="p-3 rounded-lg bg-cv-info/10 border border-cv-info/20 mb-4">
                  <p className="text-xs text-cv-info">Trial ends {formatDate(subscription.trialEndDate, 'long')}</p>
                </div>
              )}

              {/* Metered plans: currentPeriodEnd is the live billing cycle, not a paid-through date */}
              {isMetered && subscription?.currentPeriodEnd && (
                <div className="p-3 rounded-lg bg-cv-info/10 border border-cv-info/20 mb-4">
                  <p className="text-xs text-cv-info flex items-center gap-1.5">
                    <Gauge size={12} />
                    Billing cycle: {formatDate(subscription.currentPeriodStart)} — {formatDate(subscription.currentPeriodEnd, 'long')}.
                    You'll be invoiced at the end of the cycle for your measured usage.
                  </p>
                </div>
              )}

              {!isMetered && subscription?.currentPeriodEnd && (() => {
                const periodEnd = new Date(subscription.currentPeriodEnd);
                const daysLeft = Math.ceil((periodEnd - Date.now()) / 86400000);
                const expiringSoon = daysLeft <= 7;
                const currentPlan = plans.find((p) => p.isCurrent);
                return (
                  <div className={`p-3 rounded-lg mb-4 flex items-center justify-between gap-3 ${expiringSoon ? 'bg-cv-warning/10 border border-cv-warning/20' : 'bg-cv-info/10 border border-cv-info/20'}`}>
                    <p className={`text-xs ${expiringSoon ? 'text-cv-warning' : 'text-cv-info'}`}>
                      Paid through {formatDate(periodEnd, 'long')}
                      {expiringSoon && (daysLeft > 0 ? ` — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ' — expired, renew to keep your plan')}
                    </p>
                    {expiringSoon && currentPlan && (
                      <button onClick={() => launchCheckout(currentPlan, 'renewal')} disabled={subscribing}
                        className="btn btn-primary btn-sm shrink-0 flex items-center gap-1">
                        <RefreshCw size={12} /> Renew Now
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Usage Bars */}
              <div className="space-y-4 mt-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-cv-text-secondary flex items-center gap-1"><HardDrive size={12} /> Storage</span>
                    <span className="font-mono text-cv-text">{currentStorageGB.toFixed(2)} / {quotaGB} GB</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${Math.min(100, quotaGB > 0 ? (currentStorageGB / quotaGB) * 100 : 0)}%`, background: currentStorageGB > quotaGB && quotaGB > 0 ? 'var(--color-cv-danger)' : undefined }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-cv-text-secondary flex items-center gap-1"><Zap size={12} /> Operations</span>
                    <span className="font-mono text-cv-text">{(putOps + getOps).toLocaleString()} / {includedOps.toLocaleString()}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${Math.min(100, includedOps > 0 ? ((putOps + getOps) / includedOps) * 100 : 0)}%` }} />
                  </div>
                </div>
              </div>

              {subscription && (
                <div className="mt-4 pt-4 border-t border-cv-border">
                  <button onClick={() => setShowCancel(true)} className="text-xs text-cv-danger hover:text-cv-danger/80 font-medium">Cancel Subscription</button>
                </div>
              )}
            </div>

            {/* Charges */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-cv-text mb-4">{isMetered ? 'Estimated Bill' : 'Current Charges'}</h3>
              {isMetered && metered?.estimate ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-3xl font-bold text-cv-accent">{formatCurrency(metered.estimate.accruedCents)}</p>
                    <p className="text-xs text-cv-text-muted mt-1">accrued so far this cycle</p>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-3 border-t border-cv-border">
                    <span className="text-cv-text-secondary">Projected at cycle end</span>
                    <span className="font-mono text-cv-text">{formatCurrency(metered.estimate.projectedCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-cv-text-secondary">Average storage</span>
                    <span className="font-mono text-cv-text">{metered.estimate.avgGBSoFar.toFixed(3)} GB</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-cv-text-secondary">Cycle elapsed</span>
                    <span className="font-mono text-cv-text">{metered.estimate.elapsedPct}%</span>
                  </div>
                  <div className="pt-3 border-t border-cv-border">
                    <p className="text-xs text-cv-text-muted">{metered.formula}</p>
                  </div>
                </div>
              ) : charges?.charges?.length > 0 ? (
                <div className="space-y-3">
                  {charges.charges.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-cv-text-secondary">{c.component}</span>
                      <span className="font-mono text-cv-text">{formatRupees(c.amount)}</span>
                    </div>
                  ))}
                  <div className="border-t border-cv-border pt-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-cv-text">Total</span>
                    <span className="text-lg font-bold text-cv-accent">{formatRupees(charges.total)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-cv-text-muted">No charges this period</p>
              )}
            </div>
          </div>

          {/* ─── Metered usage detail (metered plans only) ─── */}
          {isMetered && metered && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Usage chart for the current cycle */}
              <div className="lg:col-span-2 glass-card p-6">
                <h3 className="text-sm font-semibold text-cv-text mb-1 flex items-center gap-2">
                  <Gauge size={16} className="text-cv-accent" /> Usage This Cycle
                </h3>
                <p className="text-xs text-cv-text-muted mb-4">
                  Daily storage measurements — your bill is the time-weighted average of these, capped at {metered.estimate.hardCapGB} GB
                </p>
                {metered.dailyUsage.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={metered.dailyUsage}>
                      <defs>
                        <linearGradient id="meteredGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="day" stroke={AXIS_STROKE} fontSize={11} />
                      <YAxis stroke={AXIS_STROKE} fontSize={11} tickFormatter={(v) => `${v} GB`} domain={[0, metered.estimate.hardCapGB || 'auto']} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v.toFixed(3)} GB`, 'Storage']} />
                      <Area type="monotone" dataKey="usedGB" stroke={PRIMARY} strokeWidth={2} fill="url(#meteredGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-52 text-cv-text-muted text-sm">
                    Usage measurements appear here as snapshots accrue (every 15 minutes)
                  </div>
                )}
              </div>

              {/* Pricing explainer + recent cycles */}
              <div className="space-y-6">
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold text-cv-text mb-3 flex items-center gap-2">
                    <Info size={14} className="text-cv-info" /> How metered billing works
                  </h3>
                  <ul className="space-y-2 text-xs text-cv-text-secondary">
                    <li>• Your storage is measured every 15 minutes throughout the cycle.</li>
                    <li>• At the end of the cycle you're billed the <strong className="text-cv-text">time-weighted average</strong> at {formatRupees(metered.estimate.pricePerGBMonth)}/GB-month.</li>
                    <li>• Example: 700 MB average ≈ {formatRupees(metered.estimate.pricePerGBMonth * 0.7)} — you never prepay.</li>
                    <li>• Storage is <strong className="text-cv-text">capped at {metered.estimate.hardCapGB} GB</strong> and cannot be exceeded.</li>
                    <li>• Invoices are due within 7 days; overdue invoices block new uploads.</li>
                  </ul>
                </div>

                {metered.cycles.length > 0 && (
                  <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-cv-text mb-3">Previous Cycles</h3>
                    <div className="space-y-2">
                      {metered.cycles.map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-cv-text-secondary">{formatDate(c.periodStart)} — {formatDate(c.periodEnd)}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-cv-text-muted">{(c.avgGB ?? 0).toFixed(2)} GB</span>
                            {c.invoice ? (
                              <Link to={`/portal/billing/${c.invoice.id}`} className="font-mono text-cv-primary hover:text-cv-primary-hover">
                                {formatCurrency(c.amountCents || 0)}
                              </Link>
                            ) : (
                              <span className="font-mono text-cv-text">{formatCurrency(c.amountCents || 0)}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Plans Tab ─── */}
      {tab === 'plans' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div key={plan.id} className={`glass-card p-6 relative ${plan.isCurrent ? 'border-cv-primary' : ''}`}>
                {plan.isCurrent && (
                  <div className="absolute top-3 right-3">
                    <span className="badge badge-active">Current</span>
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-cv-text">{plan.name}</h3>
                  <p className="text-xs text-cv-text-muted mt-1">{plan.description || plan.planType}</p>
                </div>
                <div className="mb-4">
                  {plan.isMetered ? (
                    <>
                      <span className="text-3xl font-bold text-cv-text">{formatRupees(plan.pricePerGBMonth || 0)}</span>
                      <span className="text-sm text-cv-text-muted">/GB-month</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-cv-text">{formatRupees(plan.monthlyPrice)}</span>
                      <span className="text-sm text-cv-text-muted">/{plan.billingPeriod?.toLowerCase() === 'annual' ? 'year' : 'mo'}</span>
                    </>
                  )}
                </div>
                <div className="space-y-2 mb-6 text-sm">
                  {plan.isMetered ? (
                    <>
                      <div className="flex items-center gap-2 text-cv-text-secondary">
                        <Check size={14} className="text-cv-success" /> Pay only for measured usage
                      </div>
                      <div className="flex items-center gap-2 text-cv-text-secondary">
                        <Check size={14} className="text-cv-success" /> Billed at end of each cycle
                      </div>
                      <div className="flex items-center gap-2 text-cv-text-secondary">
                        <Check size={14} className="text-cv-success" /> {plan.storageGB} GB hard cap
                      </div>
                      <div className="flex items-center gap-2 text-cv-text-secondary">
                        <Check size={14} className="text-cv-success" /> {plan.includedOps.toLocaleString()} Operations/mo
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-cv-text-secondary">
                        <Check size={14} className="text-cv-success" /> {plan.storageGB} GB Storage
                      </div>
                      <div className="flex items-center gap-2 text-cv-text-secondary">
                        <Check size={14} className="text-cv-success" /> {plan.includedOps.toLocaleString()} Operations/mo
                      </div>
                    </>
                  )}
                  {plan.trialDays > 0 && (
                    <div className="flex items-center gap-2 text-cv-info">
                      <Star size={14} /> {plan.trialDays}-day free trial
                    </div>
                  )}
                </div>
                {plan.isCurrent ? (
                  <button className="btn btn-secondary w-full cursor-default opacity-60" disabled>Current Plan</button>
                ) : (
                  <button onClick={() => setChangingPlan(plan)} className="btn btn-primary w-full">
                    {plan.isMetered ? 'Switch to Pay-as-you-go' : subscription ? (plan.monthlyPrice > planPriceValue ? 'Upgrade' : plan.monthlyPrice < planPriceValue ? 'Downgrade' : 'Switch') : 'Subscribe'}
                  </button>
                )}
              </div>
            ))}
          </div>
          {plans.length === 0 && (
            <EmptyState icon={Package} message="No plans available" compact />
          )}
        </div>
      )}

      {/* ─── Invoices Tab ─── */}
      {tab === 'invoices' && (
        <div className="glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-cv-border">
            <h3 className="text-sm font-semibold text-cv-text flex items-center gap-2">
              <FileText size={16} className="text-cv-accent" /> Invoice History
            </h3>
          </div>
          {invoices.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th><th>Due Date</th><th></th></tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-mono font-medium">{inv.invoiceNumber}</td>
                    <td className="text-cv-text-muted">{formatDate(inv.periodStart)}</td>
                    <td className="font-mono">{formatCurrency(inv.totalCents)}</td>
                    <td><span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span></td>
                    <td className="text-cv-text-muted">{formatDate(inv.dueDate)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {['FINALIZED', 'OVERDUE'].includes(inv.status) && inv.amountDueCents > 0 && (
                          <button onClick={() => payInvoice(inv)} disabled={subscribing}
                            className="btn btn-primary btn-sm flex items-center gap-1">
                            <IndianRupee size={12} /> Pay Now
                          </button>
                        )}
                        <Link to={`/portal/billing/${inv.id}`} className="text-cv-primary hover:text-cv-primary-hover text-xs font-medium flex items-center gap-1">
                          View <ChevronRight size={12} />
                        </Link>
                        <button onClick={() => handleDownloadInvoice(inv)} className="text-cv-text-muted hover:text-cv-text text-xs flex items-center gap-1" aria-label={`Download invoice ${inv.invoiceNumber}`}>
                          <DownloadIcon size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={FileText} message="No invoices yet" compact />
          )}
        </div>
      )}

      {/* ─── Payments Tab (payment history + transaction ledger) ─── */}
      {tab === 'payments' && (
        <div className="space-y-6">
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-cv-border">
              <h3 className="text-sm font-semibold text-cv-text flex items-center gap-2">
                <Receipt size={16} className="text-cv-accent" /> Payment History
              </h3>
            </div>
            {payments.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Method</th><th>Amount</th><th>Status</th><th>Reference</th><th></th></tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const badge = PAYMENT_BADGES[p.status] || { class: 'badge-pending', label: p.status };
                    return (
                      <tr key={p.id}>
                        <td className="text-cv-text-muted">{formatDate(p.createdAt)}</td>
                        <td>{p.planName ? `${p.planName} plan` : 'Plan payment'}{p.purpose === 'renewal' ? ' (renewal)' : ''}</td>
                        <td className="text-cv-text-muted capitalize">{p.method || '—'}</td>
                        <td className="font-mono">{formatCurrency(p.amountCents)}</td>
                        <td><span className={`badge ${badge.class}`}>{badge.label}</span></td>
                        <td className="font-mono text-xs text-cv-text-muted" title={p.razorpayPaymentId || p.razorpayOrderId}>
                          {(p.razorpayPaymentId || p.razorpayOrderId || '').slice(0, 18)}
                        </td>
                        <td>
                          {p.invoiceId && (
                            <Link to={`/portal/billing/${p.invoiceId}`} className="text-cv-primary hover:text-cv-primary-hover text-xs font-medium flex items-center gap-1">
                              Invoice <ChevronRight size={12} />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={Receipt} message="No payments yet" compact />
            )}
          </div>

          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-cv-border">
              <h3 className="text-sm font-semibold text-cv-text flex items-center gap-2">
                <FileText size={16} className="text-cv-accent" /> Transaction Ledger
              </h3>
              <p className="text-xs text-cv-text-muted mt-1">Complete record of all financial activity on your account</p>
            </div>
            {transactions.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Event</th><th>Description</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="text-cv-text-muted whitespace-nowrap">{formatDate(t.createdAt)}</td>
                      <td className="font-mono text-xs">{t.type.replaceAll('_', ' ')}</td>
                      <td className="text-cv-text-secondary">{t.description}</td>
                      <td className={`font-mono ${t.direction === 'CREDIT' ? 'text-cv-success' : t.direction === 'DEBIT' ? 'text-cv-danger' : 'text-cv-text-muted'}`}>
                        {t.direction === 'CREDIT' ? '+' : t.direction === 'DEBIT' ? '−' : ''}{t.amountCents ? formatCurrency(t.amountCents) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={FileText} message="No transactions yet" compact />
            )}
          </div>
        </div>
      )}

      {/* ─── Payment Methods Tab ─── */}
      {tab === 'payment' && (
        <div className="max-w-2xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-cv-text">Payment Methods</h3>
            <button onClick={() => setShowAddPM(true)} className="btn btn-primary btn-sm"><Plus size={14} /> Add Method</button>
          </div>

          {paymentMethods.length > 0 ? (
            <div className="space-y-3">
              {paymentMethods.map((pm) => (
                <div key={pm.id} className="glass-card p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-8 rounded bg-cv-surface-3 flex items-center justify-center text-xs font-bold text-cv-text uppercase">
                      {pm.brand}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-cv-text">
                        •••• •••• •••• {pm.last4}
                        {pm.isDefault && <span className="ml-2 text-xs text-cv-success">(Default)</span>}
                      </p>
                      <p className="text-xs text-cv-text-muted">
                        {pm.expMonth && pm.expYear ? `Expires ${String(pm.expMonth).padStart(2, '0')}/${pm.expYear}` : 'No expiry set'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!pm.isDefault && (
                      <button onClick={() => handleSetDefault(pm.id)} className="text-xs text-cv-primary hover:text-cv-primary-hover font-medium">Set Default</button>
                    )}
                    <button onClick={() => setRemovePMTarget(pm)} className="icon-btn icon-btn-danger" aria-label={`Remove ${pm.brand} card ending ${pm.last4}`}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CreditCard}
              message="No payment methods"
              compact
              action={
                <button onClick={() => setShowAddPM(true)} className="btn btn-primary"><Plus size={14} /> Add Payment Method</button>
              }
            />
          )}

          <div className="p-4 rounded-lg bg-cv-info/5 border border-cv-info/10">
            <p className="text-xs text-cv-info">Cards listed here are for display only. Real charges are processed securely through Razorpay checkout when you upgrade or renew a plan.</p>
          </div>
        </div>
      )}

      {/* ─── Plan Change Modal ─── */}
      <Modal open={!!changingPlan} onClose={() => setChangingPlan(null)} title={changingPlan ? `Change to ${changingPlan.name}?` : ''}>
        {changingPlan && (
          <>
            <p className="text-sm text-cv-text-muted mb-4">
              {changingPlan.isMetered ? (
                <>You'll switch to <strong>{changingPlan.name}</strong> — pay-as-you-go billing. Nothing is charged now: at the end of each billing cycle you'll receive an invoice for your <strong>measured average storage</strong> at <strong>{formatRupees(changingPlan.pricePerGBMonth || 0)}/GB-month</strong> (e.g. 700 MB average ≈ {formatRupees((changingPlan.pricePerGBMonth || 0) * 0.7)}). Storage is capped at <strong>{changingPlan.storageGB} GB</strong> and cannot be exceeded.</>
              ) : (changingPlan.monthlyPrice || 0) > 0 ? (
                <>You'll be charged <strong>{formatRupees(changingPlan.monthlyPrice)}</strong> now via Razorpay secure checkout. Your <strong>{changingPlan.name}</strong> plan activates immediately after payment.</>
              ) : (
                <>You'll be switched to the <strong>{changingPlan.name}</strong> plan at <strong>{formatRupees(changingPlan.monthlyPrice)}/{changingPlan.billingPeriod?.toLowerCase() === 'annual' ? 'year' : 'mo'}</strong>.</>
              )}
              {subscription && ' Your current subscription will be ended.'}
              {subscription && isMetered && ' Your usage so far this cycle will be invoiced.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setChangingPlan(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => handleSubscribe(changingPlan)} className="btn btn-primary" disabled={subscribing}>
                {subscribing && <span className="btn-spinner" />}
                {subscribing ? 'Processing...' : changingPlan.isMetered ? 'Switch to Pay-as-you-go' : (changingPlan.monthlyPrice || 0) > 0 ? `Pay ${formatRupees(changingPlan.monthlyPrice)} & Upgrade` : 'Confirm Change'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ─── Cancel Modal ─── */}
      <Modal open={showCancel} onClose={() => setShowCancel(false)} title="Cancel Subscription">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-cv-warning/10 border border-cv-warning/30 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-cv-warning" />
          </div>
          <p className="text-sm text-cv-text-muted">Are you sure you want to cancel your subscription? Your storage will continue to be available until the end of the billing period.</p>
        </div>
        <div className="mb-4">
          <label className="form-label" htmlFor="cancel-reason">Reason (optional)</label>
          <textarea id="cancel-reason" className="form-input" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Tell us why you're leaving..." />
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setShowCancel(false)} className="btn btn-secondary">Keep Plan</button>
          <button onClick={handleCancel} className="btn btn-danger" disabled={cancelling}>
            {cancelling && <span className="btn-spinner" />}
            {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
          </button>
        </div>
      </Modal>

      {/* ─── Add Payment Method Modal ─── */}
      <Modal open={showAddPM} onClose={() => setShowAddPM(false)} title="Add Payment Method">
        <form onSubmit={handleAddPM} className="space-y-4">
          <div>
            <label className="form-label" htmlFor="pm-brand">Card Brand</label>
            <select id="pm-brand" className="form-input" value={pmForm.brand} onChange={(e) => setPmForm({ ...pmForm, brand: e.target.value })}>
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
              <option value="amex">Amex</option>
              <option value="discover">Discover</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="pm-last4">Last 4 Digits</label>
            <input id="pm-last4" className="form-input" maxLength={4} pattern="\d{4}" placeholder="4242" value={pmForm.last4}
              onChange={(e) => setPmForm({ ...pmForm, last4: e.target.value.replace(/\D/g, '').substring(0, 4) })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label" htmlFor="pm-exp-month">Exp. Month</label>
              <input id="pm-exp-month" className="form-input" type="number" min={1} max={12} placeholder="12" value={pmForm.expMonth}
                onChange={(e) => setPmForm({ ...pmForm, expMonth: e.target.value })} />
            </div>
            <div>
              <label className="form-label" htmlFor="pm-exp-year">Exp. Year</label>
              <input id="pm-exp-year" className="form-input" type="number" min={2024} max={2040} placeholder="2028" value={pmForm.expYear}
                onChange={(e) => setPmForm({ ...pmForm, expYear: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowAddPM(false)} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={addingPM}>
              {addingPM && <span className="btn-spinner" />}
              {addingPM ? 'Adding...' : 'Add Card'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Remove Payment Method Confirmation ─── */}
      <ConfirmDialog
        open={!!removePMTarget}
        onClose={() => setRemovePMTarget(null)}
        onConfirm={() => handleRemovePM(removePMTarget.id)}
        title="Remove payment method?"
        message={removePMTarget ? `Remove the ${removePMTarget.brand} card ending in ${removePMTarget.last4}?` : ''}
        confirmLabel="Remove"
        danger
      />

      {/* ─── Payment Verifying Overlay ─── */}
      {verifying && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-label="Verifying payment">
          <div className="glass-card p-8 text-center max-w-sm">
            <div className="w-10 h-10 border-2 border-cv-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-cv-text mb-1">Verifying payment…</h3>
            <p className="text-sm text-cv-text-muted">Please do not close this window.</p>
          </div>
        </div>
      )}
    </div>
  );
}
