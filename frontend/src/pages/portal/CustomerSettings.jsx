import { useEffect, useState } from 'react';
import { Settings, Bell, Globe, HardDrive, CreditCard, Package, Lock, User } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import TabPills from '../../components/ui/TabPills';
import { toast } from 'sonner';

export default function CustomerSettings() {
  const [tab, setTab] = useState('preferences');
  const [prefs, setPrefs] = useState(null);
  const [notifPrefs, setNotifPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefsRes, notifRes] = await Promise.all([
        api.getPreferences(),
        api.getNotificationPrefs(),
      ]);
      setPrefs(prefsRes);
      setNotifPrefs(notifRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const savePreferences = async () => {
    setSaving(true);
    try {
      const updated = await api.updatePreferences(prefs);
      setPrefs(updated);
      toast.success('Preferences saved');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const saveNotifPrefs = async () => {
    setSaving(true);
    try {
      const updated = await api.updateNotificationPrefs(notifPrefs);
      setNotifPrefs(updated);
      toast.success('Notification preferences saved');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggleNotif = (key) => {
    setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const tabs = [
    { key: 'preferences', label: 'Preferences', icon: Settings },
    { key: 'notifications', label: 'Notifications', icon: Bell },
  ];

  const timezones = [
    { value: 'UTC', label: 'UTC' },
    { value: 'US/Eastern', label: 'US Eastern (ET)' },
    { value: 'US/Central', label: 'US Central (CT)' },
    { value: 'US/Mountain', label: 'US Mountain (MT)' },
    { value: 'US/Pacific', label: 'US Pacific (PT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
    { value: 'Asia/Kolkata', label: 'Kolkata (IST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
    { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
    { value: 'Africa/Cairo', label: 'Cairo (EET)' },
    { value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
  ];

  const dateFormats = [
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (EU)' },
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
  ];

  const regions = [
    { value: 'us-east-1', label: 'US East (N. Virginia)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'EU (Ireland)' },
    { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  ];

  const notificationGroups = [
    {
      title: 'Billing',
      icon: CreditCard,
      items: [
        { key: 'invoiceCreated', label: 'Invoice created', desc: 'When a new invoice is generated' },
        { key: 'paymentReceived', label: 'Payment received', desc: 'When a payment is processed' },
        { key: 'paymentFailed', label: 'Payment failed', desc: 'When a payment attempt fails' },
        { key: 'subscriptionChange', label: 'Subscription changes', desc: 'Plan upgrades, downgrades, or cancellations' },
      ],
    },
    {
      title: 'Storage',
      icon: Package,
      items: [
        { key: 'storageWarning75', label: '75% storage warning', desc: 'When storage usage reaches 75%' },
        { key: 'storageWarning90', label: '90% storage warning', desc: 'When storage usage reaches 90%' },
        { key: 'storageQuotaFull', label: 'Storage quota full', desc: 'When storage quota is exhausted' },
        { key: 'uploadComplete', label: 'Upload complete', desc: 'When file uploads finish' },
      ],
    },
    {
      title: 'Security',
      icon: Lock,
      items: [
        { key: 'newLogin', label: 'New login alerts', desc: 'When your account is accessed from a new device' },
        { key: 'passwordChanged', label: 'Password changed', desc: 'When your password is updated' },
        { key: 'apiKeyCreated', label: 'API key events', desc: 'When API keys are created or revoked' },
      ],
    },
    {
      title: 'Account',
      icon: User,
      items: [
        { key: 'accountUpdates', label: 'Account updates', desc: 'Important account-related notifications' },
        { key: 'productNews', label: 'Product news', desc: 'Feature updates and product announcements' },
      ],
    },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Settings</h1>
        <p className="text-cv-text-secondary text-sm mt-1">Configure your account preferences and notifications</p>
      </div>

      <TabPills tabs={tabs} active={tab} onChange={setTab} />

      {/* ─── Preferences Tab ─── */}
      {tab === 'preferences' && prefs && (
        <div className="max-w-2xl space-y-6">
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2"><Globe size={16} className="text-cv-accent" /> Regional</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Timezone</label>
                <select className="form-input" value={prefs.timezone} onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}>
                  {timezones.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Date Format</label>
                <select className="form-input" value={prefs.dateFormat} onChange={(e) => setPrefs({ ...prefs, dateFormat: e.target.value })}>
                  {dateFormats.map((df) => <option key={df.value} value={df.value}>{df.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2"><HardDrive size={16} className="text-cv-accent" /> Storage Defaults</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Default Region</label>
                <select className="form-input" value={prefs.storageRegion} onChange={(e) => setPrefs({ ...prefs, storageRegion: e.target.value })}>
                  {regions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Default Bucket Visibility</label>
                <select className="form-input" value={prefs.defaultBucketVisibility} onChange={(e) => setPrefs({ ...prefs, defaultBucketVisibility: e.target.value })}>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>
          </div>

          <button onClick={savePreferences} className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      )}

      {/* ─── Notifications Tab ─── */}
      {tab === 'notifications' && notifPrefs && (
        <div className="max-w-2xl space-y-6">
          {notificationGroups.map((group) => (
            <div key={group.title} className="glass-card p-6">
              <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2">
                <group.icon size={16} className="text-cv-primary" /> {group.title}
              </h3>
              <div className="space-y-4">
                {group.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-cv-text font-medium">{item.label}</p>
                      <p className="text-xs text-cv-text-muted">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => toggleNotif(item.key)}
                      role="switch"
                      aria-checked={!!notifPrefs[item.key]}
                      aria-label={item.label}
                      className={`relative w-11 h-6 rounded-full transition-colors ${notifPrefs[item.key] ? 'bg-cv-primary' : 'bg-cv-surface-3 border border-cv-border'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${notifPrefs[item.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button onClick={saveNotifPrefs} className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Notification Preferences'}
          </button>
        </div>
      )}
    </div>
  );
}
