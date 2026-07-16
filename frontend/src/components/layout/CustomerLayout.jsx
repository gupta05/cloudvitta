import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, HardDrive, CreditCard, Code2, LogOut, Zap, User, Settings, HelpCircle, Bell, Menu, X, Package, Lock, Cog } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatDate } from '../../lib/format';

const navItems = [
  { to: '/portal', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/portal/storage', icon: HardDrive, label: 'My Storage' },
  { to: '/portal/billing', icon: CreditCard, label: 'Billing' },
  { to: '/portal/developer', icon: Code2, label: 'Developer' },
  { to: '/portal/account', icon: User, label: 'Account' },
  { to: '/portal/settings', icon: Settings, label: 'Settings' },
  { to: '/portal/help', icon: HelpCircle, label: 'Help & Support' },
];

// Notification type → lucide icon (replaces the old emoji map)
const NOTIF_ICONS = {
  billing: CreditCard,
  storage: Package,
  security: Lock,
  account: User,
  system: Cog,
};

export default function CustomerLayout({ children }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('cv_user') || '{}');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notifRef = useRef(null);

  // Fetch unread count on mount and every 30 seconds
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await api.getUnreadCount();
        setUnreadCount(res?.count || 0);
      } catch (e) {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (showNotif) {
      api.getNotifications('limit=5').then((res) => {
        setNotifications(res?.data || []);
      }).catch(() => {});
    }
  }, [showNotif]);

  // Close dropdown on outside click / Esc
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setShowNotif(false);
        setDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((n) => n.map((item) => ({ ...item, isRead: true })));
    } catch (e) {}
  };

  const handleLogout = async () => {
    try { await api.logout(); } catch (e) {}
    api.setToken(null);
    api.setTenantId(null);
    api.setCustomerId(null);
    api.setRole(null);
    localStorage.removeItem('cv_user');
    toast.success('Signed out');
    navigate('/login');
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-cv-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cv-primary">
            <Zap size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold text-cv-text">CloudVitta</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-cv-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-cv-primary">
            {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-cv-text truncate">{user?.displayName || 'User'}</p>
            <p className="text-[10px] text-cv-text-muted truncate">{user?.email || ''}</p>
          </div>
          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="relative p-1.5 rounded-md text-cv-text-muted hover:text-cv-text hover:bg-cv-surface-2 transition-colors"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              aria-haspopup="true"
              aria-expanded={showNotif}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-cv-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown — fixed so the 320px panel never clips off-screen
                (the bell sits inside the 256px sidebar) */}
            {showNotif && (
              <div className="fixed left-3 bottom-24 w-80 max-w-[calc(100vw-1.5rem)] glass-card shadow-xl border border-cv-border z-[60] max-h-96 overflow-hidden">
                <div className="px-4 py-3 border-b border-cv-border flex items-center justify-between">
                  <span className="text-sm font-semibold text-cv-text">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-cv-primary hover:text-cv-primary-hover">Mark all read</button>
                  )}
                </div>
                <div className="overflow-y-auto max-h-72">
                  {notifications.length > 0 ? notifications.map((n) => {
                    const NotifIcon = NOTIF_ICONS[n.type] || Bell;
                    return (
                      <div key={n.id} className={`px-4 py-3 border-b border-cv-border last:border-0 ${!n.isRead ? 'bg-cv-surface-2' : ''}`}>
                        <div className="flex items-start gap-2">
                          <NotifIcon size={14} className="text-cv-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-cv-text">{n.title}</p>
                            <p className="text-[11px] text-cv-text-muted mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-cv-text-muted mt-1">{formatDate(n.createdAt, 'datetime')}</p>
                          </div>
                          {!n.isRead && <span className="w-2 h-2 bg-cv-primary rounded-full flex-shrink-0 mt-1" aria-hidden="true" />}
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="px-4 py-6 text-center text-xs text-cv-text-muted">No notifications</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="sidebar-link w-full mt-1 text-cv-danger hover:bg-cv-danger/10"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-cv-bg">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-shrink-0 flex-col border-r border-cv-border bg-cv-surface">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col border-r border-cv-border bg-cv-surface animate-slide-in" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <button onClick={() => setDrawerOpen(false)} className="icon-btn absolute top-4 right-3" aria-label="Close menu">
              <X size={18} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b border-cv-border bg-cv-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cv-primary">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold text-cv-text">CloudVitta</span>
          </div>
          <button onClick={() => setDrawerOpen(true)} className="icon-btn" aria-label="Open menu">
            <Menu size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
