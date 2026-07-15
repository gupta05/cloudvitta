import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, HardDrive, CreditCard, Code2, LogOut, Zap, User, Settings, HelpCircle, Bell } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import api from '../../api/client';
import { toast } from 'sonner';

const navItems = [
  { to: '/portal', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/portal/storage', icon: HardDrive, label: 'My Storage' },
  { to: '/portal/billing', icon: CreditCard, label: 'Billing' },
  { to: '/portal/developer', icon: Code2, label: 'Developer' },
  { to: '/portal/account', icon: User, label: 'Account' },
  { to: '/portal/settings', icon: Settings, label: 'Settings' },
  { to: '/portal/help', icon: HelpCircle, label: 'Help & Support' },
];

export default function CustomerLayout({ children }) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('cv_user') || '{}');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotif, setShowNotif] = useState(false);
  const [notifications, setNotifications] = useState([]);
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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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

  const typeIcons = {
    billing: '💳',
    storage: '📦',
    security: '🔒',
    account: '👤',
    system: '⚙️',
  };

  return (
    <div className="flex h-screen bg-cv-bg">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col border-r border-cv-border bg-cv-surface flex-shrink-0">
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
              >
                <Bell size={16} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-cv-danger text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {showNotif && (
                <div className="absolute bottom-full right-0 mb-2 w-80 glass-card shadow-xl border border-cv-border z-50 max-h-96 overflow-hidden">
                  <div className="px-4 py-3 border-b border-cv-border flex items-center justify-between">
                    <span className="text-sm font-semibold text-cv-text">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="text-xs text-cv-primary hover:text-cv-primary-hover">Mark all read</button>
                    )}
                  </div>
                  <div className="overflow-y-auto max-h-72">
                    {notifications.length > 0 ? notifications.map((n) => (
                      <div key={n.id} className={`px-4 py-3 border-b border-cv-border last:border-0 ${!n.isRead ? 'bg-cv-surface-2' : ''}`}>
                        <div className="flex items-start gap-2">
                          <span className="text-sm mt-0.5">{typeIcons[n.type] || '🔔'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-cv-text">{n.title}</p>
                            <p className="text-[11px] text-cv-text-muted mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-cv-text-muted mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                          </div>
                          {!n.isRead && <span className="w-2 h-2 bg-cv-primary rounded-full flex-shrink-0 mt-1" />}
                        </div>
                      </div>
                    )) : (
                      <div className="px-4 py-6 text-center text-xs text-cv-text-muted">No notifications</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-link w-full mt-1 text-cv-danger hover:bg-red-500/10"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
