// ============================================================================
// js/ui/dashboard.js — Dashboard Rendering
// ============================================================================

const DashboardUI = {
  async render() {
    const db = await OctaneDB.loadFullDB();
    const container = document.getElementById('view-dashboard');
    if (!container) return;

    const todayStr = Helpers.todayStr();
    const ads = MathEngine.calculateADS(db.master_ledger, db.settings.ads_days);
    const prediction = MathEngine.predictNextOrder(db);
    const stockHistory = StockEngine.getStockHistoryFor(todayStr, db);
    const pendingCount = (await OctaneDB.dbGetAll('pending_entries')).filter(e => e.status === 'pending').length;
    const queueCount = await window.syncQueue.getPendingCount();

    const petrolPct = Math.min(100, Math.max(0, ((db.stock.petrol || 0) / (db.settings.petrol_capacity || 20000)) * 100));
    const dieselPct = Math.min(100, Math.max(0, ((db.stock.diesel || 0) / (db.settings.diesel_capacity || 20000)) * 100));
    const tankColor = (pct) => pct < 15 ? '#ef4444' : pct < 30 ? '#f97316' : '#22c55e';

    container.innerHTML = `
      <!-- Alerts Row -->
      ${pendingCount > 0 ? `<div class="alert alert-warning" onclick="AppRouter.navigate('approvals')">⏳ ${pendingCount} pending entries awaiting approval. <strong>Review now →</strong></div>` : ''}
      ${queueCount > 0 ? `<div class="alert alert-info">☁️ ${queueCount} operations queued for sync.</div>` : ''}
      ${prediction.daysToTrigger <= 2 ? `<div class="alert alert-danger">🚨 Fuel order needed in ${Math.ceil(prediction.daysToTrigger)} day(s)! Recommended: ${prediction.recommendedLoad.label}</div>` : ''}

      <!-- Tank Levels -->
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header">⛽ Petrol Tank</div>
          <div class="tank-container">
            <div class="tank-fill" style="height:${petrolPct}%; background:${tankColor(petrolPct)}"></div>
            <div class="tank-label">${(db.stock.petrol || 0).toFixed(0)} L</div>
          </div>
          <div class="tank-info">${petrolPct.toFixed(1)}% of ${Helpers.formatVol(db.settings.petrol_capacity)}</div>
        </div>
        <div class="card">
          <div class="card-header">🛢️ Diesel Tank</div>
          <div class="tank-container">
            <div class="tank-fill" style="height:${dieselPct}%; background:${tankColor(dieselPct)}"></div>
            <div class="tank-label">${(db.stock.diesel || 0).toFixed(0)} L</div>
          </div>
          <div class="tank-info">${dieselPct.toFixed(1)}% of ${Helpers.formatVol(db.settings.diesel_capacity)}</div>
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="grid grid-4">
        <div class="metric-card">
          <div class="metric-label">Avg Daily (P)</div>
          <div class="metric-value">${Helpers.formatVol(ads.petrol)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Avg Daily (D)</div>
          <div class="metric-value">${Helpers.formatVol(ads.diesel)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Days to Order</div>
          <div class="metric-value" style="color:${prediction.daysToTrigger <= 2 ? '#ef4444' : '#22c55e'}">${Math.ceil(prediction.daysToTrigger)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Ledger Entries</div>
          <div class="metric-value">${db.master_ledger.length}</div>
        </div>
      </div>

      <!-- Cashflow Summary -->
      <div class="card">
        <div class="card-header">💰 Cash Position</div>
        <div class="grid grid-4">
          <div class="metric-card compact"><div class="metric-label">Bank</div><div class="metric-value">${Helpers.formatCurrency(db.cashflow.bank_balance)}</div></div>
          <div class="metric-card compact"><div class="metric-label">PhonePe</div><div class="metric-value">${Helpers.formatCurrency(db.cashflow.phonepe_balance)}</div></div>
          <div class="metric-card compact"><div class="metric-label">Cash Drawer</div><div class="metric-value">${Helpers.formatCurrency(db.cashflow.cash_drawer)}</div></div>
          <div class="metric-card compact"><div class="metric-label">IOCL Cushion</div><div class="metric-value">${Helpers.formatCurrency(db.cashflow.iocl_cushion)}</div></div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card">
        <div class="card-header">⚡ Quick Actions</div>
        <div class="action-grid">
          <button class="btn btn-primary" onclick="AppRouter.navigate('approvals')">📋 Review Approvals (${pendingCount})</button>
          <button class="btn btn-secondary" onclick="SyncManager.pullPending().then(() => DashboardUI.render())">🔄 Pull Pending</button>
          <button class="btn btn-secondary" onclick="SyncManager.pushAll().then(() => showNotification('Push queued', 'success'))">☁️ Push All</button>
          <button class="btn btn-secondary" onclick="AppRouter.navigate('ledger')">📊 Sales Ledger</button>
        </div>
      </div>
    `;
  }
};

window.DashboardUI = DashboardUI;
