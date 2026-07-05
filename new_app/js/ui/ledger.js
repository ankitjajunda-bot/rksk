// ============================================================================
// js/ui/ledger.js — Sales Ledger Rendering
// ============================================================================

const LedgerUI = {
  shiftFilter: '24h',
  viewMode: 'table',

  async render() {
    const db = await OctaneDB.loadFullDB();
    const container = document.getElementById('view-ledger');
    if (!container) return;

    const rows = [...db.master_ledger].sort((a, b) => b.date.localeCompare(a.date));
    const wacMap = StockEngine.buildWACTimeline(db);

    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <span>📊 Sales Ledger (${rows.length} entries)</span>
          <div class="btn-group">
            <button class="btn btn-sm ${this.shiftFilter === '24h' ? 'btn-primary' : 'btn-ghost'}" onclick="LedgerUI.setFilter('24h')">24H</button>
            <button class="btn btn-sm ${this.shiftFilter === 'day' ? 'btn-primary' : 'btn-ghost'}" onclick="LedgerUI.setFilter('day')">Day</button>
            <button class="btn btn-sm ${this.shiftFilter === 'night' ? 'btn-primary' : 'btn-ghost'}" onclick="LedgerUI.setFilter('night')">Night</button>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>DU1 P</th><th>DU1 D</th>
                <th>DU2 P</th><th>DU2 D</th>
                <th>Total P</th><th>Total D</th>
                <th>Revenue</th><th>Profit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(row => this._renderRow(row, wacMap, db)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  _renderRow(row, wacMap, db) {
    const calc = MathEngine.computeLedgerRow(row, wacMap, db);
    const filter = this.shiftFilter;
    const getVal = (nozzle) => {
      if (filter === 'day') return calc.sales[nozzle].day;
      if (filter === 'night') return calc.sales[nozzle].night;
      return calc.sales[nozzle].day + calc.sales[nozzle].night;
    };
    const totalP = filter === 'day' ? calc.totals.day.petrol : filter === 'night' ? calc.totals.night.petrol : calc.totals.net_24h.petrol;
    const totalD = filter === 'day' ? calc.totals.day.diesel : filter === 'night' ? calc.totals.night.diesel : calc.totals.net_24h.diesel;
    const profitColor = calc.financials.profit >= 0 ? '#22c55e' : '#ef4444';

    return `
      <tr>
        <td><strong>${Helpers.formatDate(row.date)}</strong></td>
        <td>${getVal('du1_p').toFixed(1)}</td>
        <td>${getVal('du1_d').toFixed(1)}</td>
        <td>${getVal('du2_p').toFixed(1)}</td>
        <td>${getVal('du2_d').toFixed(1)}</td>
        <td class="highlight-p">${totalP.toFixed(1)}</td>
        <td class="highlight-d">${totalD.toFixed(1)}</td>
        <td>${Helpers.formatCurrency(calc.financials.total_revenue)}</td>
        <td style="color:${profitColor};font-weight:700;">${Helpers.formatCurrency(calc.financials.profit)}</td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="LedgerUI.editRow('${row.date}')">✏️</button>
          <button class="btn btn-sm btn-ghost" onclick="LedgerUI.deleteRow('${row.date}')">🗑️</button>
        </td>
      </tr>
    `;
  },

  setFilter(filter) {
    this.shiftFilter = filter;
    this.render();
  },

  async editRow(dateStr) {
    // Open edit modal (simplified)
    showNotification(`Edit mode for ${dateStr} — coming soon.`, 'info');
  },

  async deleteRow(dateStr) {
    if (!confirm(`Delete ledger entry for ${Helpers.formatDate(dateStr)}? Stock will be credited back.`)) return;
    const db = await OctaneDB.loadFullDB();
    const result = await LedgerEngine.deleteLedgerRow(dateStr, db);
    if (result.success) {
      showNotification(`✅ Entry deleted. Stock restored.`, 'success');
      this.render();
    } else {
      showNotification(`❌ ${result.error}`, 'danger');
    }
  }
};

window.LedgerUI = LedgerUI;
