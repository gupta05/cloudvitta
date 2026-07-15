import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import api from '../../api/client';
import {
  LayoutDashboard, Users, Package, FileText, CreditCard,
  Receipt, Tags, Puzzle, Activity, Settings, LogOut,
  ChevronDown, Layers, Zap, HardDrive, FolderOpen, TrendingUp
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

  const handleLogout = () => {
    api.setToken(null);
    api.setTenantId(null);
    api.setCustomerId(null);
    api.setRole(null);
    localStorage.removeItem('cv_token');
    localStorage.removeItem('cv_tenant_id');
    localStorage.removeItem('cv_customer_id');
    localStorage.removeItem('cv_role');
    navigate('/login');
  };

  const handleTenantSwitch = (tenantId) => {
    setCurrentTenantId(tenantId);
    api.setTenantId(tenantId);
    setShowTenantDropdown(false);
    window.location.reload();
  };

  const currentTenant = tenants.find((t) => t.id === currentTenantId);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-cv-border bg-cv-surface" style={{minWidth: 256}}>
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
          <div className="p-3 border-b border-cv-border relative">
            <button
              onClick={() => setShowTenantDropdown(!showTenantDropdown)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-cv-surface-2 border border-cv-border hover:border-cv-border-light transition-colors text-sm"
            >
              <span className="text-cv-text font-medium truncate">{currentTenant?.name || 'Select Tenant'}</span>
              <ChevronDown size={14} className="text-cv-text-muted" />
            </button>
            {showTenantDropdown && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-cv-surface-2 border border-cv-border rounded-lg shadow-lg z-50 animate-fade-in">
                {tenants.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTenantSwitch(t.id)}
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
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
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
              <p className="text-xs text-cv-text-muted truncate">{user?.role === 'admin' ? '⚡ Admin' : user?.email}</p>
            </div>
            <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-cv-surface-2 text-cv-text-muted hover:text-cv-danger transition-colors" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-screen-xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
