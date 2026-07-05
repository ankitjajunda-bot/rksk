// ============================================================================
// js/ui/settings.js — Settings UI
// ============================================================================

const SettingsUI = {

  async render() {
    const container = document.getElementById('view-settings');
    if (!container) return;
    const db = await OctaneDB.loadFullDB();
    const employees = await OctaneDB.dbGetAll('employees');
    const errorLogs = await ErrorTracker.getLast(50);
    const syncQueueItems = await OctaneDB.dbGetAll('sync_queue');
    const failedSync = syncQueueItems.filter(i => i.status === 'failed');

    container.innerHTML = `
      <!-- Employee Management -->
      <div class="card">
        <div class="card-header">👥 Employee Management</div>
        <div id="employee-list">
          ${employees.length === 0 ? '<div class="empty-state">No employees registered.</div>' : ''}
          ${employees.map(e => `
            <div class="employee-row">
              <div>
                <strong>${Sanitize.input(e.name)}</strong>
                <span class="text-dim">${e.phone}</span>
                <span class="badge ${e.active !== false ? 'badge-success' : 'badge-danger'}">${e.active !== false ? 'Active' : 'Inactive'}</span>
              </div>
              <div>
                <span class="text-dim" style="font-family:monospace;">Code: ${e.registration_code || '—'}</span>
                <button class="btn btn-sm btn-ghost" onclick="SettingsUI.toggleEmployee('${e.id}')">${e.active !== false ? '🚫' : '✅'}</button>
                <button class="btn btn-sm btn-ghost" onclick="SettingsUI.deleteEmployee('${e.id}')">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="form-section" style="margin-top:1rem;">
          <h4>➕ Add Employee</h4>
          <div class="form-row">
            <div class="form-group"><label>Name</label><input type="text" id="new-emp-name" placeholder="Full Name"></div>
            <div class="form-group"><label>Phone</label><input type="tel" id="new-emp-phone" placeholder="+91 98765 43210"></div>
            <div class="form-group"><label>PIN</label><input type="text" id="new-emp-pin" placeholder="4-6 digit PIN"></div>
          </div>
          <button class="btn btn-primary" onclick="SettingsUI.addEmployee()">Add Employee</button>
        </div>
      </div>

      <!-- Tank & Stock Settings -->
      <div class="card">
        <div class="card-header">⛽ Tank & Stock Settings</div>
        <div class="form-row">
          <div class="form-group"><label>Petrol Capacity (L)</label><input type="number" id="cfg-petrol-cap" value="${db.settings.petrol_capacity}"></div>
          <div class="form-group"><label>Diesel Capacity (L)</label><input type="number" id="cfg-diesel-cap" value="${db.settings.diesel_capacity}"></div>
          <div class="form-group"><label>Safety Stock (L)</label><input type="number" id="cfg-safety" value="${db.settings.safety_stock}"></div>
          <div class="form-group"><label>ADS Window (days)</label><input type="number" id="cfg-ads-days" value="${db.settings.ads_days}"></div>
        </div>
        <div class="form-group" style="margin-top: 1rem;">
          <label for="cfg-test-deduction">Calibration Test Deduction (Liters per test)</label>
          <input type="number" id="cfg-test-deduction" min="1" max="50" step="1" value="${db.settings.test_deduction_liters || 5}">
          <span style="font-size:0.7rem;color:var(--text-muted);">Amount deducted per nozzle test (default: 5L)</span>
        </div>
        <button class="btn btn-primary" onclick="SettingsUI.saveSettings()">Save Settings</button>
      </div>

      <!-- Sync & Security -->
      <div class="card">
        <div class="card-header">🔒 Security</div>
        <div class="form-row">
          <div class="form-group"><label>Current Password</label><input type="password" id="cfg-old-pwd"></div>
          <div class="form-group"><label>New Password</label><input type="password" id="cfg-new-pwd"></div>
        </div>
        <button class="btn btn-secondary" onclick="SettingsUI.changePassword()">Change Owner Password</button>
        <div style="margin-top:1rem;">
          <label><input type="checkbox" id="cfg-mfa" ${MFA.isEnabled() ? 'checked' : ''} onchange="SettingsUI.toggleMFA()"> Enable MFA (Two-Factor Authentication)</label>
          ${MFA.isEnabled() ? `<div class="text-dim" style="margin-top:0.5rem;">Secret: <code>${MFA.getSecret()}</code></div>` : ''}
        </div>
      </div>

      <!-- Sync Queue -->
      <div class="card">
        <div class="card-header">☁️ Sync Queue (${syncQueueItems.length} items)</div>
        ${failedSync.length > 0 ? `
          <div class="alert alert-danger">❌ ${failedSync.length} failed sync operations</div>
          <button class="btn btn-sm btn-secondary" onclick="syncQueue.retryFailed().then(() => SettingsUI.render())">🔄 Retry Failed</button>
        ` : '<div class="text-dim" style="padding:1rem;">All clear.</div>'}
      </div>

      <!-- Error Logs -->
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <span>🐛 Error Logs (${errorLogs.length})</span>
          <button class="btn btn-sm btn-ghost" onclick="ErrorTracker.clear().then(() => SettingsUI.render())">Clear</button>
        </div>
        <div class="error-log-list" style="max-height:300px;overflow-y:auto;">
          ${errorLogs.length === 0 ? '<div class="empty-state">No errors.</div>' : ''}
          ${errorLogs.map(log => `
            <div class="error-log-entry ${log.severity}">
              <div style="display:flex;justify-content:space-between;">
                <span class="badge badge-${log.severity === 'error' || log.severity === 'critical' ? 'danger' : log.severity === 'warning' ? 'warning' : 'info'}">${log.severity.toUpperCase()}</span>
                <span class="text-dim">${Helpers.timeAgo(log.timestamp)}</span>
              </div>
              <div style="font-size:0.8rem;margin-top:0.25rem;">${Sanitize.input(log.message).substring(0, 200)}</div>
              ${log.context ? `<div class="text-dim" style="font-size:0.7rem;">${log.context}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Data Recovery -->
      <div class="card">
        <div class="card-header">💾 Data Recovery & Backup</div>
        <div style="display:flex;gap:1rem;margin-top:1rem;">
          <button class="btn btn-secondary" onclick="Recovery.downloadBackup()">⬇️ Download Full Backup</button>
          <button class="btn btn-secondary" onclick="document.getElementById('backup-upload').click()">⬆️ Import Backup</button>
          <input type="file" id="backup-upload" style="display:none;" accept=".json" onchange="SettingsUI.handleBackupUpload(event)">
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="card" style="border-color:rgba(239,68,68,0.3);">
        <div class="card-header" style="color:#ef4444;">⚠️ Danger Zone</div>
        <button class="btn btn-danger" onclick="if(confirm('Reset ALL data? This cannot be undone!')) { OctaneDB.dbClear('master_ledger'); OctaneDB.dbClear('pending_entries'); OctaneDB.dbClear('purchases'); showNotification('Data reset.', 'info'); SettingsUI.render(); }">🗑️ Reset All Data</button>
      </div>

      <!-- Storage & Data Safety -->
      <div class="panel" style="border: 1px solid #f97316; background: rgba(249,115,22,0.05); margin-top: 1rem; border-radius: 8px;">
        <div class="panel-header" style="padding: 1rem; border-bottom: 1px solid rgba(249,115,22,0.2);">
          <h3 class="panel-title" style="margin: 0; color: #f97316;">💾 Storage & Data Safety</h3>
        </div>
        <div style="padding:1.25rem;">
          <div id="storage-status">
            <span id="storage-persist-status">Checking storage status...</span>
            <button class="btn btn-sm btn-primary" id="request-persist-btn" style="display:none; margin-left: 10px;" onclick="requestPersistentStorage()">
              Request Persistent Storage
            </button>
          </div>
        </div>
      </div>
    `;

    setTimeout(this.checkStorageStatus, 100);
  },

  async checkStorageStatus() {
    if (navigator.storage && navigator.storage.persisted) {
      const isPersisted = await navigator.storage.persisted();
      const statusEl = document.getElementById('storage-persist-status');
      const btnEl = document.getElementById('request-persist-btn');
      if (statusEl) {
        if (isPersisted) {
          statusEl.innerHTML = '✅ Persistent Storage Granted. Data is safe.';
          statusEl.style.color = '#22c55e';
          if (btnEl) btnEl.style.display = 'none';
        } else {
          statusEl.innerHTML = '⚠️ Storage is volatile. Browser may clear data.';
          statusEl.style.color = '#ef4444';
          if (btnEl) btnEl.style.display = 'inline-block';
        }
      }
    }
  },

  async addEmployee() {
    const name = Sanitize.input(document.getElementById('new-emp-name')?.value);
    const phone = Sanitize.input(document.getElementById('new-emp-phone')?.value);
    const pin = Sanitize.input(document.getElementById('new-emp-pin')?.value);

    if (!name || !phone) return showNotification('Name and Phone are required.', 'danger');
    if (!Validators.isValidPhone(phone)) return showNotification('Invalid phone number.', 'danger');

    const emp = {
      id: Helpers.generateId(),
      name, phone, pin: pin || '0000',
      registration_code: Helpers.generateRegistrationCode(),
      role: 'employee',
      active: true,
      created_at: new Date().toISOString()
    };

    await OctaneDB.dbPut('employees', emp);
    await window.syncQueue.enqueue('PUSH_EMPLOYEE', emp);

    showNotification(`✅ Employee added! Registration code: ${emp.registration_code}`, 'success');
    document.getElementById('new-emp-name').value = '';
    document.getElementById('new-emp-phone').value = '';
    document.getElementById('new-emp-pin').value = '';
    this.render();
  },

  async toggleEmployee(id) {
    const emp = await OctaneDB.dbGet('employees', id);
    if (!emp) return;
    emp.active = !emp.active;
    await OctaneDB.dbPut('employees', emp);
    showNotification(`Employee ${emp.active ? 'activated' : 'deactivated'}.`, 'info');
    this.render();
  },

  async deleteEmployee(id) {
    if (!confirm('Delete this employee?')) return;
    await OctaneDB.dbDelete('employees', id);
    showNotification('Employee removed.', 'info');
    this.render();
  },

  async saveSettings() {
    const v = (id) => Sanitize.number(document.getElementById(id)?.value);
    const settings = {
      petrol_capacity: v('cfg-petrol-cap'), diesel_capacity: v('cfg-diesel-cap'),
      safety_stock: v('cfg-safety'), ads_days: v('cfg-ads-days'),
      test_deduction_liters: v('cfg-test-deduction')
    };
    for (const [key, value] of Object.entries(settings)) {
      await OctaneDB.dbPut('settings', { key, value });
    }
    showNotification('✅ Settings saved.', 'success');
  },

  async changePassword() {
    const old = document.getElementById('cfg-old-pwd')?.value;
    const newPwd = document.getElementById('cfg-new-pwd')?.value;
    if (!old || !newPwd) return showNotification('Fill both fields.', 'danger');
    if (newPwd.length < 6) return showNotification('Password must be 6+ chars.', 'danger');
    const result = await Auth.changeOwnerPassword(old, newPwd);
    showNotification(result.success ? '✅ Password changed.' : `❌ ${result.error}`, result.success ? 'success' : 'danger');
  },

  toggleMFA() {
    if (MFA.isEnabled()) {
      MFA.disableMFA();
      showNotification('MFA disabled.', 'info');
    } else {
      const secret = MFA.enableMFA();
      showNotification(`MFA enabled! Secret: ${secret}`, 'success');
    }
    this.render();
  },

  handleBackupUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!confirm('Importing this backup will merge or overwrite current data. Continue?')) return;
        await Recovery.importAllData(data);
        showNotification('✅ Backup imported successfully!', 'success');
        this.render();
      } catch (err) {
        showNotification('❌ Failed to parse backup file.', 'danger');
        console.error(err);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset
  }
};

window.SettingsUI = SettingsUI;
