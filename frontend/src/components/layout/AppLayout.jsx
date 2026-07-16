import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import api from '../../api/client';
import { toast } from 'sonner';
import {
  LayoutDashboard, Users, Package, FileText, CreditCard,
  Receipt, Tags, Puzzle, Activity, Settings, LogOut,
  ChevronDown, Layers, Zap, HardDrive, FolderOpen, TrendingUp, Menu, X, Gauge
} from 'lucide-react';

// Full admin navigation
const adminNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { type: 'divider', label: 'OBJECT STORAGE' },
  { to: '/storage', icon: HardDrive, label: 'Storage Overview' },
  { to: '/storage/buckets', icon: FolderOpen, label: 'Buckets' },
  { to: '/storage/usage', icon: TrendingUp, label: 'Usage & Billing' },
  { type: 'divider', label: 'PLATFORM' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/users', icon: Activity, label: 'Users' },
  { to: '/catalog', icon: Package, label: 'Product Catalog' },
  { to: '/plans', icon: Layers, label: 'Plans' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { to: '/metered', icon: Gauge, label: 'Metered Billing' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/credit-notes', icon: Receipt, label: 'Credit Notes' },
  { to: '/coupons', icon: Tags, label: 'Coupons' },
  { to: '/addons', icon: Puzzle, label: 'Add-ons' },
  { to: '/events', icon: Activity, label: 'Events' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

// End-user navigation — only shows their storage
const userNavItems = [
  { to: '/storage', icon: HardDrive, label: 'My Storage' },
  { to: '/storage/buckets', icon: FolderOpen, label: 'My Buckets' },
  { to: '/storage/usage', icon: TrendingUp, label: 'Usage & Billing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [currentTenantId, setCurrentTenantId] = useState(localStorage.getItem('cv_tenant_id'));
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tenantRef = useRef(null);

  const isAdmin = api.isAdmin();
  const navItems = isAdmin ? adminNavItems : userNavItems;

  useEffect(() => {
    api.getMe().then((data) => {
      setUser(data.user);
      setTenants(data.tenants || []);
      // Sync role from server
      api.setRole(data.user.role);
      api.setCustomerId(data.user.customerId);
      // Preserve the operator's active tenant selection (from the switcher) across
      // reloads. Only fall back to the home/default tenant when nothing is selected
      // yet, or the stored selection is no longer one of the org's tenants.
      const orgTenants = data.tenants || [];
      const storedIsValid = currentTenantId && orgTenants.some((t) => t.id === currentTenantId);
      if (storedIsValid) {
        api.setTenantId(currentTenantId);
      } else if (data.user.tenantId) {
        api.setTenantId(data.user.tenantId);
        setCurrentTenantId(data.user.tenantId);
      } else if (orgTenants.length > 0) {
        const defaultTenant = orgTenants[0].id;
        setCurrentTenantId(defaultTenant);
        api.setTenantId(defaultTenant);
      }
    }).catch(() => {
      navigate('/login');
    });
  }, []);

  // Close tenant dropdown on outside click / Esc
  useEffect(() => {
    const handleClick = (e) => {
      if (tenantRef.current && !tenantRef.current.contains(e.target)) setShowTenantDropdown(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setShowTenantDropdown(false);
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

  const handleTenantSwitch = (tenantId) => {
    setCurrentTenantId(tenantId);
    api.setTenantId(tenantId);
    setShowTenantDropdown(false);
    window.location.reload();
  };

  const currentTenant = tenants.find((t) => t.id === currentTenantId);

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

      {/* Tenant Switcher — only for admins */}
      {isAdmin && (
        <div className="p-3 border-b border-cv-border relative" ref={tenantRef}>
          <button
            onClick={() => setShowTenantDropdown(!showTenantDropdown)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-cv-surface-2 border border-cv-border hover:border-cv-border-light transition-colors text-sm"
            aria-haspopup="listbox"
            aria-expanded={showTenantDropdown}
          >
            <span className="text-cv-text font-medium truncate">{currentTenant?.name || 'Select Tenant'}</span>
            <ChevronDown size={14} className="text-cv-text-muted" />
          </button>
          {showTenantDropdown && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-cv-surface-2 border border-cv-border rounded-lg shadow-lg z-50 animate-fade-in" role="listbox">
              {tenants.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTenantSwitch(t.id)}
                  role="option"
                  aria-selected={t.id === currentTenantId}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-cv-surface-3 first:rounded-t-lg last:rounded-b-lg transition-colors ${t.id === currentTenantId ? 'text-cv-primary font-semibold' : 'text-cv-text'}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item, idx) => {
          if (item.type === 'divider') {
            return (
              <div key={idx} className="pt-4 pb-1 px-2">
                <p className="text-[10px] font-bold text-cv-text-muted uppercase tracking-widest">{item.label}</p>
              </div>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === '/storage'}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-cv-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-cv-primary">
            {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-cv-text truncate">{user?.displayName}</p>
            <p className="text-xs text-cv-text-muted truncate flex items-center gap-1">
              {user?.role === 'admin' ? <><Zap size={10} className="text-cv-primary" aria-hidden="true" /> Admin</> : user?.email}
            </p>
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

      {/* Main Content */}
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
          <div className="p-6 max-w-screen-xl mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
