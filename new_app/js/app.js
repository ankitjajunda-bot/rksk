// ============================================================================
// js/app.js — Main Entry Point
// ============================================================================

// Global notification system
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) { alert(message); return; }

  const colorMap = { success: '#22c55e', danger: '#ef4444', warning: '#f97316', info: '#38bdf8' };
  const iconMap = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };

  const div = document.createElement('div');
  div.className = `notification notification-${type}`;
  div.style.cssText = `
    background: ${colorMap[type] || colorMap.info}20;
    border: 1px solid ${colorMap[type] || colorMap.info}40;
    color: #f8fafc;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    animation: slideIn 0.3s ease;
    cursor: pointer;
  `;
  div.innerHTML = `<span>${iconMap[type] || 'ℹ️'}</span><span>${message}</span>`;
  div.onclick = () => div.remove();
  container.appendChild(div);
  setTimeout(() => { if (div.parentNode) div.remove(); }, 5000);
}
window.showNotification = showNotification;

// Simple router for owner views
const AppRouter = {
  currentView: 'dashboard',
  views: ['dashboard', 'ledger', 'approvals', 'settings'],

  navigate(viewName) {
    if (!this.views.includes(viewName)) return;
    this.currentView = viewName;

    // Hide all views
    this.views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.style.display = 'none';
    });

    // Show target
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.style.display = 'block';

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navItem) navItem.classList.add('active');

    // Render view
    switch (viewName) {
      case 'dashboard': DashboardUI.render(); break;
      case 'ledger': LedgerUI.render(); break;
      case 'approvals': ApprovalsUI.render(); break;
      case 'settings': SettingsUI.render(); break;
    }
  }
};
window.AppRouter = AppRouter;

// Request persistent storage to prevent browser eviction
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist();
    if (isPersisted) {
      console.log('[Storage] Persistent storage granted.');
      if (typeof SettingsUI !== 'undefined' && SettingsUI.checkStorageStatus) {
        SettingsUI.checkStorageStatus();
      }
    } else {
      console.warn('[Storage] Persistent storage denied. Data may be evicted.');
      // Show notification to user
      showNotification('⚠️ Your browser may delete data if storage is low. Sync regularly.', 'warning');
    }
  }
}
window.requestPersistentStorage = requestPersistentStorage;

// Main initialization
async function initApp() {
  console.log('[App] Starting OctaneFlow v2...');
  await requestPersistentStorage();

  // 1. Open IndexedDB
  await OctaneDB.openDB();

  // 2. Run migration if needed
  const migrated = await OctaneDB.migrateFromLocalStorage();
  if (migrated) {
    showNotification('✅ Data migrated from old app to IndexedDB!', 'success');
  }

  // 3. Initialize Supabase
  SupabaseOps.init();

  // 4. Check auth
  const session = await Auth.checkAuth();

  if (!session) {
    // Show login
    setupLoginHandlers();
    return;
  }

  if (session.role === 'owner') {
    // Setup nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => AppRouter.navigate(item.dataset.view));
    });
    AppRouter.navigate('dashboard');
  } else {
    EmployeeUI.render(session);
  }

  // 5. Process any pending sync items
  if (navigator.onLine) {
    window.syncQueue.processQueue();
  }

  // 6. Update online/offline indicator
  updateConnectivityStatus();
  window.addEventListener('online', updateConnectivityStatus);
  window.addEventListener('offline', updateConnectivityStatus);
}

function setupLoginHandlers() {
  const ownerLoginBtn = document.getElementById('owner-login-btn');
  const empLoginBtn = document.getElementById('emp-login-btn');
  const loginToggle = document.getElementById('login-toggle');

  if (ownerLoginBtn) {
    ownerLoginBtn.addEventListener('click', async () => {
      const pwd = document.getElementById('owner-password')?.value;
      if (!pwd) return showNotification('Enter password.', 'danger');
      const result = await Auth.loginOwner(pwd);
      if (result.success) {
        if (result.requiresMFA) {
          document.getElementById('mfa-section').style.display = 'block';
          document.getElementById('mfa-verify-btn').onclick = async () => {
            const code = document.getElementById('mfa-code')?.value;
            const valid = await MFA.verify(code);
            if (valid) { location.reload(); }
            else { showNotification('Invalid MFA code.', 'danger'); }
          };
        } else {
          location.reload();
        }
      } else {
        showNotification(result.error, 'danger');
      }
    });
  }

  if (empLoginBtn) {
    empLoginBtn.addEventListener('click', async () => {
      const phone = document.getElementById('emp-phone')?.value;
      const code = document.getElementById('emp-code')?.value;
      const pin = document.getElementById('emp-pin')?.value;
      if (!phone || !code || !pin) return showNotification('Enter phone, code, and PIN.', 'danger');
      const result = await Auth.loginEmployee(phone, code, pin);
      if (result.success) location.reload();
      else showNotification(result.error, 'danger');
    });
  }

  if (loginToggle) {
    loginToggle.addEventListener('click', () => {
      const ownerForm = document.getElementById('owner-login-form');
      const empForm = document.getElementById('emp-login-form');
      if (ownerForm.style.display === 'none') {
        ownerForm.style.display = 'block';
        empForm.style.display = 'none';
        loginToggle.textContent = 'Employee Login →';
      } else {
        ownerForm.style.display = 'none';
        empForm.style.display = 'block';
        loginToggle.textContent = '← Owner Login';
      }
    });
  }
}

function updateConnectivityStatus() {
  const el = document.getElementById('connectivity-status');
  if (!el) return;
  el.innerHTML = navigator.onLine
    ? '<span style="color:#22c55e;font-size:0.75rem;">🟢 Online</span>'
    : '<span style="color:#ef4444;font-size:0.75rem;">🔴 Offline</span>';
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

// Launch on DOM ready
document.addEventListener('DOMContentLoaded', initApp);
