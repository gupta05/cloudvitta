/**
 * CloudVitta API Client
 * Centralized HTTP client for all backend API calls.
 */

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('cv_token');
    this.tenantId = localStorage.getItem('cv_tenant_id');
    this.customerId = localStorage.getItem('cv_customer_id');
    this.role = localStorage.getItem('cv_role') || 'user';
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('cv_token', token);
    else localStorage.removeItem('cv_token');
  }

  setTenantId(tenantId) {
    this.tenantId = tenantId;
    if (tenantId) localStorage.setItem('cv_tenant_id', tenantId);
    else localStorage.removeItem('cv_tenant_id');
  }

  setCustomerId(customerId) {
    this.customerId = customerId;
    if (customerId) localStorage.setItem('cv_customer_id', customerId);
    else localStorage.removeItem('cv_customer_id');
  }

  setRole(role) {
    this.role = role || 'user';
    localStorage.setItem('cv_role', this.role);
  }

  isAdmin() {
    return this.role === 'admin' || this.role === 'member';
  }

  isUser() {
    return this.role === 'user';
  }

  async request(method, path, body = null, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...(this.tenantId && { 'x-tenant-id': this.tenantId }),
      ...options.headers,
    };

    const config = { method, headers };
    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${path}`, config);

    if (res.status === 401) {
      this.setToken(null);
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (res.status === 204) return null;

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  del(path) { return this.request('DELETE', path); }

  // ─── Auth ──────────────────────────────
  login(email, password) { return this.post('/auth/login', { email, password }); }
  register(data) { return this.post('/auth/register', data); }
  verifyOtp(pendingId, otp) { return this.post('/auth/verify-otp', { pendingId, otp }); }
  resendOtp(pendingId) { return this.post('/auth/resend-otp', { pendingId }); }
  forgotPassword(email) { return this.post('/auth/forgot-password', { email }); }
  resetPassword(data) { return this.post('/auth/reset-password', data); } // { email, otp, newPassword }
  resendResetOtp(email) { return this.post('/auth/resend-reset-otp', { email }); }
  getMe() { return this.get('/auth/me'); }

  // ─── Tenants ───────────────────────────
  getTenants() { return this.get('/tenants'); }
  createTenant(data) { return this.post('/tenants', data); }

  // ─── Customers ─────────────────────────
  getCustomers(params = '') { return this.get(`/customers${params ? '?' + params : ''}`); }
  getCustomer(id) { return this.get(`/customers/${id}`); }
  createCustomer(data) { return this.post('/customers', data); }
  updateCustomer(id, data) { return this.put(`/customers/${id}`, data); }
  deleteCustomer(id) { return this.del(`/customers/${id}`); }

  // ─── Product Catalog ───────────────────
  getProductFamilies() { return this.get('/product-families'); }
  createProductFamily(data) { return this.post('/product-families', data); }
  getProducts() { return this.get('/products'); }
  createProduct(data) { return this.post('/products', data); }
  getBillableMetrics() { return this.get('/billable-metrics'); }
  createBillableMetric(data) { return this.post('/billable-metrics', data); }

  // ─── Plans ─────────────────────────────
  getPlans(params = '') { return this.get(`/plans${params ? '?' + params : ''}`); }
  getPlan(id) { return this.get(`/plans/${id}`); }
  createPlan(data) { return this.post('/plans', data); }
  updatePlan(id, data) { return this.put(`/plans/${id}`, data); }
  publishPlan(id) { return this.post(`/plans/${id}/publish`); }
  createPlanVersion(planId, data) { return this.post(`/plans/${planId}/versions`, data); }
  updatePlanComponents(planId, versionId, data) { return this.put(`/plans/${planId}/versions/${versionId}/components`, data); }

  // ─── Subscriptions ─────────────────────
  getSubscriptions(params = '') { return this.get(`/subscriptions${params ? '?' + params : ''}`); }
  getSubscription(id) { return this.get(`/subscriptions/${id}`); }
  createSubscription(data) { return this.post('/subscriptions', data); }
  activateSubscription(id) { return this.post(`/subscriptions/${id}/activate`); }
  cancelAdminSubscription(id, reason) { return this.post(`/subscriptions/${id}/cancel`, { reason }); }
  changePlan(id, newPlanVersionId) { return this.post(`/subscriptions/${id}/change-plan`, { newPlanVersionId }); }
  addSubscriptionAddon(id, data) { return this.post(`/subscriptions/${id}/addons`, data); }

  // ─── Invoices ──────────────────────────
  getInvoices(params = '') { return this.get(`/invoices${params ? '?' + params : ''}`); }
  getInvoice(id) { return this.get(`/invoices/${id}`); }
  generateInvoice(subscriptionId, data) { return this.post(`/invoices/generate/${subscriptionId}`, data || {}); }
  finalizeInvoice(id) { return this.post(`/invoices/${id}/finalize`); }
  markInvoicePaid(id) { return this.post(`/invoices/${id}/mark-paid`); }
  voidInvoice(id) { return this.post(`/invoices/${id}/void`); }

  // ─── Credit Notes ─────────────────────
  getCreditNotes(params = '') { return this.get(`/credit-notes${params ? '?' + params : ''}`); }
  createCreditNote(data) { return this.post('/credit-notes', data); }

  // ─── Coupons ───────────────────────────
  getCoupons() { return this.get('/coupons'); }
  createCoupon(data) { return this.post('/coupons', data); }
  updateCoupon(id, data) { return this.put(`/coupons/${id}`, data); }

  // ─── Addons ────────────────────────────
  getAddons() { return this.get('/addons'); }
  createAddon(data) { return this.post('/addons', data); }

  // ─── Events / Metering ─────────────────
  getEvents(params = '') { return this.get(`/events${params ? '?' + params : ''}`); }
  ingestEvents(events) { return this.post('/events/ingest', { events }); }
  getUsage(params) { return this.get(`/events/usage?${params}`); }

  // ─── Stats ─────────────────────────────
  getStats() { return this.get('/stats'); }

  // ─── API Tokens ────────────────────────
  getApiTokens() { return this.get('/api-tokens'); }
  createApiToken(data) { return this.post('/api-tokens', data); }
  revokeApiToken(id) { return this.del(`/api-tokens/${id}`); }

  // ─── Webhooks ──────────────────────────
  getWebhooks() { return this.get('/webhooks'); }
  createWebhook(data) { return this.post('/webhooks', data); }
  updateWebhook(id, data) { return this.put(`/webhooks/${id}`, data); }
  deleteWebhook(id) { return this.del(`/webhooks/${id}`); }

  // ─── Settings ──────────────────────────
  getInvoicingEntity() { return this.get('/settings/invoicing-entity'); }
  updateInvoicingEntity(data) { return this.put('/settings/invoicing-entity', data); }

  // ─── Object Storage ───────────────────
  // Buckets
  createBucket(data) { return this.post('/storage/buckets', data); }
  getBuckets(params = '') { return this.get(`/storage/buckets${params ? '?' + params : ''}`); }
  getBucket(bucketId) { return this.get(`/storage/buckets/${bucketId}`); }
  deleteBucket(bucketId) { return this.del(`/storage/buckets/${bucketId}`); }

  // Objects
  async uploadObject(bucketId, file, key, metadata = {}) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('key', key || file.name);
    if (Object.keys(metadata).length > 0) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    const headers = {
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...(this.tenantId && { 'x-tenant-id': this.tenantId }),
      // Don't set Content-Type — browser will set multipart boundary automatically
    };

    const res = await fetch(`${API_BASE}/storage/buckets/${bucketId}/objects`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  }

  getObjects(bucketId, params = '') { return this.get(`/storage/buckets/${bucketId}/objects${params ? '?' + params : ''}`); }

  async downloadObject(bucketId, objectId) {
    const headers = {
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...(this.tenantId && { 'x-tenant-id': this.tenantId }),
    };

    const res = await fetch(`${API_BASE}/storage/buckets/${bucketId}/objects/${objectId}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const blob = await res.blob();
    const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'download';
    return { blob, filename, contentType: res.headers.get('Content-Type') };
  }

  getObjectMeta(bucketId, objectId) { return this.get(`/storage/buckets/${bucketId}/objects/${objectId}/meta`); }
  deleteObject(bucketId, objectId) { return this.del(`/storage/buckets/${bucketId}/objects/${objectId}`); }

  // Storage Usage
  getStorageUsage(params = '') { return this.get(`/storage/usage${params ? '?' + params : ''}`); }
  getStorageUsageHistory(params = '') { return this.get(`/storage/usage/history${params ? '?' + params : ''}`); }
  getStorageStats() { return this.get('/storage/stats'); }

  // ─── Customer Portal ──────────────────
  getPortalDashboard() { return this.get('/portal/dashboard'); }
  getPortalSubscription() { return this.get('/portal/subscription'); }
  getPortalInvoices() { return this.get('/portal/invoices'); }
  getPortalInvoice(id) { return this.get(`/portal/invoices/${id}`); }
  getPortalUsage(params = '') { return this.get(`/portal/usage${params ? '?' + params : ''}`); }
  getPortalActivity() { return this.get('/portal/activity'); }
  getPortalApiKeys() { return this.get('/portal/api-keys'); }
  createPortalApiKey(data) { return this.post('/portal/api-keys', data); }
  revokePortalApiKey(id) { return this.del(`/portal/api-keys/${id}`); }

  // ─── Portal Account ──────────────────
  getProfile() { return this.get('/portal/account/profile'); }
  updateProfile(data) { return this.put('/portal/account/profile', data); }
  changePassword(data) { return this.put('/portal/account/password', data); }
  getSessions() { return this.get('/portal/account/sessions'); }
  revokeSession(id) { return this.del(`/portal/account/sessions/${id}`); }
  revokeAllSessions() { return this.post('/portal/account/sessions/revoke-all'); }
  deleteAccount(data) { return this.post('/portal/account/delete', data); }
  logout() { return this.post('/auth/logout'); }

  // ─── Portal Settings ─────────────────
  getPreferences() { return this.get('/portal/settings/preferences'); }
  updatePreferences(data) { return this.put('/portal/settings/preferences', data); }
  getNotificationPrefs() { return this.get('/portal/settings/notifications'); }
  updateNotificationPrefs(data) { return this.put('/portal/settings/notifications', data); }

  // ─── Portal Billing ──────────────────
  getAvailablePlans() { return this.get('/portal/billing/plans'); }
  subscribeToPlan(data) { return this.post('/portal/billing/subscribe', data); }
  cancelSubscription(reason) { return this.post('/portal/billing/cancel', { reason }); }
  getPaymentMethods() { return this.get('/portal/billing/payment-methods'); }
  addPaymentMethod(data) { return this.post('/portal/billing/payment-methods', data); }
  removePaymentMethod(id) { return this.del(`/portal/billing/payment-methods/${id}`); }
  setDefaultPaymentMethod(id) { return this.put(`/portal/billing/payment-methods/${id}/default`); }
  getCurrentCharges() { return this.get('/portal/billing/charges'); }
  downloadInvoice(id) { return this.get(`/portal/billing/invoices/${id}/download`); }

  // ─── Portal Payments (Razorpay) ──────
  createPaymentOrder(data) { return this.post('/portal/billing/payments/create-order', data); }
  verifyPayment(data) { return this.post('/portal/billing/payments/verify', data); }
  reportPaymentFailure(data) { return this.post('/portal/billing/payments/failure', data); }
  getPaymentHistory(params = '') { return this.get(`/portal/billing/payments${params ? '?' + params : ''}`); }
  getTransactionHistory(params = '') { return this.get(`/portal/billing/payments/transactions${params ? '?' + params : ''}`); }

  // ─── Portal Notifications ────────────
  getNotifications(params = '') { return this.get(`/portal/notifications${params ? '?' + params : ''}`); }
  getUnreadCount() { return this.get('/portal/notifications/unread-count'); }
  markNotificationRead(id) { return this.put(`/portal/notifications/${id}/read`); }
  markAllNotificationsRead() { return this.put('/portal/notifications/read-all'); }
  deleteNotification(id) { return this.del(`/portal/notifications/${id}`); }

  // ─── Admin Users ─────────────────────
  getUsers(params = '') { return this.get(`/users${params ? '?' + params : ''}`); }
  getUser(id) { return this.get(`/users/${id}`); }
  updateUser(id, data) { return this.put(`/users/${id}`, data); }
  deleteUser(id) { return this.del(`/users/${id}`); }
  getUserSessions(id) { return this.get(`/users/${id}/sessions`); }
  getUserNotifications(id) { return this.get(`/users/${id}/notifications`); }
}

export const api = new ApiClient();
export default api;
