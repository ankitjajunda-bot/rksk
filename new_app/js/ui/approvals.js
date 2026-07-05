// ============================================================================
// js/ui/approvals.js — Approval Queue UI
// ============================================================================

const ApprovalsUI = {

  async render() {
    const container = document.getElementById('view-approvals');
    if (!container) return;

    const pending = await OctaneDB.dbGetAll('pending_entries');
    const pendingEntries = pending.filter(e => e.status === 'pending');
    const approvedEntries = pending.filter(e => e.status === 'approved').slice(0, 10);
    const rejectedEntries = pending.filter(e => e.status === 'rejected').slice(0, 10);

    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <span>📋 Pending Approvals (${pendingEntries.length})</span>
          <div style="display:flex;gap:0.5rem;">
            <button class="btn btn-sm btn-secondary" onclick="ApprovalsUI.pullAndRefresh()">🔄 Pull Entries</button>
            <button class="btn btn-sm btn-primary" onclick="ApprovalsUI.approveAll()">✅ Approve All</button>
          </div>
        </div>

        ${pendingEntries.length === 0 ? '<div class="empty-state">No pending entries. Click "Pull Entries" to check cloud.</div>' : ''}

        ${pendingEntries.map(entry => this._renderEntry(entry)).join('')}
      </div>

      ${approvedEntries.length > 0 ? `
      <div class="card" style="margin-top:1rem;">
        <div class="card-header">✅ Recently Approved (${approvedEntries.length})</div>
        ${approvedEntries.map(e => this._renderHistoryEntry(e, 'approved')).join('')}
      </div>` : ''}

      ${rejectedEntries.length > 0 ? `
      <div class="card" style="margin-top:1rem;">
        <div class="card-header">❌ Recently Rejected (${rejectedEntries.length})</div>
        ${rejectedEntries.map(e => this._renderHistoryEntry(e, 'rejected')).join('')}
      </div>` : ''}
    `;
  },

  _renderEntry(entry) {
    const data = entry.entry_data || entry.entryData || {};
    const date = entry.date || data.date || 'Unknown';
    const shift = entry.shift_type || data.shift || 'day';
    const submittedAt = entry.submitted_at || entry.submittedAt || '';

    // Try to compute preview metrics
    let previewHTML = '';
    try {
      const nozzles = ['du1_p', 'du1_d', 'du2_p', 'du2_d'];
      let totalP = 0, totalD = 0;
      nozzles.forEach(nz => {
        if (data[nz]) {
          const open = data[nz].open || 0;
          const close = shift === 'day' ? (data[nz].close_day || 0) : (data[nz].close_night || 0);
          const litres = Math.max(0, close - open);
          if (nz.includes('_p')) totalP += litres;
          else totalD += litres;
        }
      });
      previewHTML = `
        <div class="entry-preview">
          <span>⛽ P: ${totalP.toFixed(1)}L</span>
          <span>🛢️ D: ${totalD.toFixed(1)}L</span>
          ${data.cash_sales ? `<span>💵 ${Helpers.formatCurrency(data.cash_sales)}</span>` : ''}
        </div>
      `;
    } catch (e) {}

    return `
      <div class="approval-entry">
        <div class="entry-header">
          <div>
            <strong>${Helpers.formatDate(date)}</strong>
            <span class="badge badge-${shift === 'day' ? 'warning' : 'info'}">${shift === 'day' ? '☀️ Day' : '🌙 Night'}</span>
          </div>
          <span class="text-dim">${Helpers.timeAgo(submittedAt)}</span>
        </div>
        ${previewHTML}
        <div class="entry-actions">
          <button class="btn btn-sm btn-success" onclick="ApprovalsUI.approve('${entry.id}')">✅ Approve</button>
          <button class="btn btn-sm btn-danger" onclick="ApprovalsUI.reject('${entry.id}')">❌ Reject</button>
        </div>
      </div>
    `;
  },

  _renderHistoryEntry(entry, status) {
    const date = entry.date || entry.entry_data?.date || 'Unknown';
    const color = status === 'approved' ? '#22c55e' : '#ef4444';
    return `
      <div class="history-entry" style="border-left:3px solid ${color};">
        <span>${Helpers.formatDate(date)}</span>
        <span style="color:${color};font-weight:600;">${status.toUpperCase()}</span>
      </div>
    `;
  },

  async approve(entryId) {
    const session = Auth.getSession();
    const locked = await SyncManager.acquireLock(`pending_${entryId}`, session.uid);
    if (!locked) {
      showNotification('⚠️ This entry is being processed by another device. Please wait.', 'warning');
      return;
    }
    
    try {
      await Recovery.autoBackup();

      const entry = await OctaneDB.dbGet('pending_entries', entryId);
      if (!entry) return;

      const db = await OctaneDB.loadFullDB();
      const entryData = entry.entry_data || entry.entryData || {};

      // Merge with existing ledger row if it exists
      const existingIdx = db.master_ledger.findIndex(r => r.date === (entry.date || entryData.date));
      const existing = existingIdx !== -1 ? db.master_ledger[existingIdx] : {};

      const mergeNozzle = (nzKey) => {
        const ext = existing[nzKey] || { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 };
        const inc = entryData[nzKey] || { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 };
        return {
          open: inc.open || ext.open || 0,
          close_day: inc.close_day || ext.close_day || 0,
          close_night: inc.close_night || ext.close_night || 0,
          tests_day: inc.tests_day || ext.tests_day || 0,
          tests_night: inc.tests_night || ext.tests_night || 0
        };
      };

      // Build ledger row from entry data
      const ledgerRow = {
        id: entry.date || entryData.date,
        date: entry.date || entryData.date,
        prices: MathEngine.getPricesAt(entry.date || entryData.date, db.prices),
        du1_p: mergeNozzle('du1_p'),
        du1_d: mergeNozzle('du1_d'),
        du2_p: mergeNozzle('du2_p'),
        du2_d: mergeNozzle('du2_d'),
        recon: { 
          cash: (entryData.cash_sales || 0) + ((existing.recon && existing.recon.cash) || 0), 
          phonepe: (entryData.phonepe_collection || 0) + ((existing.recon && existing.recon.phonepe) || 0), 
          credit: (entryData.card_sales || 0) + ((existing.recon && existing.recon.credit) || 0) 
        },
        _dirty: true
      };

      await LedgerEngine.saveDailyReadings(ledgerRow, db);

      // Update pending entry status
      entry.status = 'approved';
      entry.approved_at = new Date().toISOString();
      await OctaneDB.dbPut('pending_entries', entry);

      // Sync to cloud
      try { await SupabaseOps.updatePendingEntryStatus(entryId, 'approved'); } catch (e) {
        await window.syncQueue.enqueue('PUSH_PENDING', entry);
      }

      showNotification(`✅ Entry approved and added to ledger.`, 'success');
      this.render();
      DashboardUI.render();
    } finally {
      await SyncManager.releaseLock(`pending_${entryId}`);
    }
  },

  async reject(entryId) {
    const reason = prompt('Rejection reason (optional):') || 'Rejected by owner';
    const entry = await OctaneDB.dbGet('pending_entries', entryId);
    if (!entry) return;

    entry.status = 'rejected';
    entry.rejectionReason = reason;
    await OctaneDB.dbPut('pending_entries', entry);

    try { await SupabaseOps.updatePendingEntryStatus(entryId, 'rejected'); } catch (e) {
      await window.syncQueue.enqueue('PUSH_PENDING', entry);
    }

    showNotification(`❌ Entry rejected.`, 'info');
    this.render();
  },

  async approveAll() {
    const pending = await OctaneDB.dbGetAll('pending_entries');
    const toApprove = pending.filter(e => e.status === 'pending');
    if (toApprove.length === 0) return showNotification('Nothing to approve.', 'info');
    if (!confirm(`Approve all ${toApprove.length} entries?`)) return;

    for (const entry of toApprove) {
      await this.approve(entry.id);
    }
  },

  async pullAndRefresh() {
    await SyncManager.pullPending();
    this.render();
  }
};

window.ApprovalsUI = ApprovalsUI;
