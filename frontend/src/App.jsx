import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from './api/client';
import AppLayout from './components/layout/AppLayout';
import CustomerLayout from './components/layout/CustomerLayout';
import LandingPage from './pages/landing/LandingPage';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import OtpVerification from './pages/auth/OtpVerification';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Dashboard from './pages/dashboard/Dashboard';
import CustomerList from './pages/customers/CustomerList';
import CustomerDetail from './pages/customers/CustomerDetail';
import CustomerCreate from './pages/customers/CustomerCreate';
import ProductCatalog from './pages/catalog/ProductCatalog';
import PlanList from './pages/plans/PlanList';
import PlanBuilder from './pages/plans/PlanBuilder';
import PlanDetail from './pages/plans/PlanDetail';
import SubscriptionList from './pages/subscriptions/SubscriptionList';
import SubscriptionDetail from './pages/subscriptions/SubscriptionDetail';
import SubscriptionCreate from './pages/subscriptions/SubscriptionCreate';
import MeteredBilling from './pages/billing/MeteredBilling';
import InvoiceList from './pages/invoices/InvoiceList';
import InvoiceDetail from './pages/invoices/InvoiceDetail';
import CreditNoteList from './pages/creditNotes/CreditNoteList';
import CouponList from './pages/coupons/CouponList';
import AddonList from './pages/addons/AddonList';
import EventLog from './pages/events/EventLog';
import Settings from './pages/settings/Settings';
import StorageDashboard from './pages/storage/StorageDashboard';
import BucketList from './pages/storage/BucketList';
import BucketDetail from './pages/storage/BucketDetail';
import StorageUsage from './pages/storage/StorageUsage';

// Customer portal pages
import CustomerDashboard from './pages/portal/CustomerDashboard';
import CustomerStorage from './pages/portal/CustomerStorage';
import CustomerBucketDetail from './pages/portal/CustomerBucketDetail';
import CustomerBilling from './pages/portal/CustomerBilling';
import CustomerInvoiceDetail from './pages/portal/CustomerInvoiceDetail';
import CustomerDeveloper from './pages/portal/CustomerDeveloper';
import CustomerAccount from './pages/portal/CustomerAccount';
import CustomerSettings from './pages/portal/CustomerSettings';
import CustomerHelp from './pages/portal/CustomerHelp';

// Admin user management
import UserList from './pages/users/UserList';
import UserDetail from './pages/users/UserDetail';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('cv_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const role = localStorage.getItem('cv_role');
  if (role === 'user') return <Navigate to="/portal" replace />;
  return children;
}

function UserRoute({ children }) {
  const role = localStorage.getItem('cv_role');
  if (role !== 'user') return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('cv_token');
    if (token) api.setToken(token);
    const tenantId = localStorage.getItem('cv_tenant_id');
    if (tenantId) api.setTenantId(tenantId);
    const role = localStorage.getItem('cv_role');
    if (role) api.setRole(role);
    const customerId = localStorage.getItem('cv_customer_id');
    if (customerId) api.setCustomerId(customerId);
    setAuthReady(true);
  }, []);

  if (!authReady) return null;

  return (
    <Routes>
      {/* Public landing page — the application's entry point */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-otp" element={<OtpVerification />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Customer Portal Routes */}
      <Route
        path="/portal/*"
        element={
          <ProtectedRoute>
            <UserRoute>
              <CustomerLayout>
                <Routes>
                  <Route path="/" element={<CustomerDashboard />} />
                  <Route path="/storage" element={<CustomerStorage />} />
                  <Route path="/storage/:id" element={<CustomerBucketDetail />} />
                  <Route path="/billing" element={<CustomerBilling />} />
                  <Route path="/billing/:id" element={<CustomerInvoiceDetail />} />
                  <Route path="/developer" element={<CustomerDeveloper />} />
                  <Route path="/account" element={<CustomerAccount />} />
                  <Route path="/settings" element={<CustomerSettings />} />
                  <Route path="/help" element={<CustomerHelp />} />
                </Routes>
              </CustomerLayout>
            </UserRoute>
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AdminRoute>
              <AppLayout>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/customers" element={<CustomerList />} />
                  <Route path="/customers/new" element={<CustomerCreate />} />
                  <Route path="/customers/:id" element={<CustomerDetail />} />
                  <Route path="/catalog" element={<ProductCatalog />} />
                  <Route path="/plans" element={<PlanList />} />
                  <Route path="/plans/new" element={<PlanBuilder />} />
                  <Route path="/plans/:id" element={<PlanDetail />} />
                  <Route path="/subscriptions" element={<SubscriptionList />} />
                  <Route path="/subscriptions/new" element={<SubscriptionCreate />} />
                  <Route path="/subscriptions/:id" element={<SubscriptionDetail />} />
                  <Route path="/metered" element={<MeteredBilling />} />
                  <Route path="/invoices" element={<InvoiceList />} />
                  <Route path="/invoices/:id" element={<InvoiceDetail />} />
                  <Route path="/credit-notes" element={<CreditNoteList />} />
                  <Route path="/coupons" element={<CouponList />} />
                  <Route path="/addons" element={<AddonList />} />
                  <Route path="/events" element={<EventLog />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/users" element={<UserList />} />
                  <Route path="/users/:id" element={<UserDetail />} />
                  <Route path="/storage" element={<StorageDashboard />} />
                  <Route path="/storage/buckets" element={<BucketList />} />
                  <Route path="/storage/buckets/:id" element={<BucketDetail />} />
                  <Route path="/storage/usage" element={<StorageUsage />} />
                </Routes>
              </AppLayout>
            </AdminRoute>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
