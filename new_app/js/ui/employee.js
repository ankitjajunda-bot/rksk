// ============================================================================
// js/ui/employee.js — Employee Submission Form with Live Preview
// ============================================================================

const EmployeeUI = {

  render(session) {
    const shell = document.getElementById('employee-shell');
    if (!shell) return;

    shell.innerHTML = `
      <div class="emp-header">
        <div>
          <h2 id="emp-user-name">${session.displayName || 'Employee'}</h2>
          <span class="text-dim">Shift Entry Form</span>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="Auth.logout()">🚪 Logout</button>
      </div>

      <div class="emp-form">
        <!-- Date & Shift -->
        <div class="form-row">
          <div class="form-group">
            <label>Day</label>
            <select id="emp-date-day" onchange="EmployeeUI.onFormChange()">
              ${Array.from({length: 31}, (_, i) => `<option value="${i+1}" ${i+1 === new Date().getDate() ? 'selected' : ''}>${i+1}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Month</label>
            <select id="emp-date-month" onchange="EmployeeUI.onFormChange()">
              ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => `<option value="${i+1}" ${i === new Date().getMonth() ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Year</label>
            <select id="emp-date-year" onchange="EmployeeUI.onFormChange()">
              <option value="2026" selected>2026</option>
              <option value="2025">2025</option>
            </select>
          </div>
          <div class="form-group">
            <label>Shift</label>
            <select id="emp-shift" onchange="EmployeeUI.onFormChange()">
              <option value="day">☀️ Day</option>
              <option value="night">🌙 Night</option>
            </select>
          </div>
        </div>

        <!-- Nozzle Readings -->
        ${this._renderNozzleGroup('DU1 Petrol', 'emp-du1p')}
        ${this._renderNozzleGroup('DU1 Diesel', 'emp-du1d')}
        ${this._renderNozzleGroup('DU2 Petrol', 'emp-du2p')}
        ${this._renderNozzleGroup('DU2 Diesel', 'emp-du2d')}

        <!-- Collections -->
        <div class="form-section">
          <h3>💵 Collections</h3>
          <div class="form-row">
            <div class="form-group">
              <label>Cash</label>
              <input type="number" id="emp-cash" placeholder="0" oninput="EmployeeUI.updateCalc()">
            </div>
            <div class="form-group">
              <label>Card</label>
              <input type="number" id="emp-card" placeholder="0" oninput="EmployeeUI.updateCalc()">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>PhonePe Open</label>
              <input type="number" id="emp-pp-open" placeholder="0" oninput="EmployeeUI.updateCalc()">
            </div>
            <div class="form-group">
              <label>PhonePe Close</label>
              <input type="number" id="emp-pp-close" placeholder="0" oninput="EmployeeUI.updateCalc()">
            </div>
          </div>
        </div>

        <!-- Remarks -->
        <div class="form-group">
          <label>Remarks</label>
          <textarea id="emp-remarks" rows="2" placeholder="Any notes for the owner..."></textarea>
        </div>

        <!-- LIVE CALCULATION PREVIEW -->
        <div class="live-preview" id="live-calc-preview">
          <h3>📊 Live Calculation Preview</h3>
          <div class="preview-grid">
            <div class="preview-item">
              <span class="preview-label">Total Petrol Sold</span>
              <span class="preview-value" id="live-petrol-sold">0.00 L</span>
            </div>
            <div class="preview-item">
              <span class="preview-label">Total Diesel Sold</span>
              <span class="preview-value" id="live-diesel-sold">0.00 L</span>
            </div>
            <div class="preview-item">
              <span class="preview-label">Expected Cash</span>
              <span class="preview-value" id="live-expected-cash">₹ 0</span>
            </div>
            <div class="preview-item">
              <span class="preview-label">Cash Discrepancy</span>
              <span class="preview-value" id="live-cash-discrepancy" style="color:#22c55e;">✅ ₹ 0</span>
            </div>
          </div>
        </div>

        <!-- Submit -->
        <button class="btn btn-primary btn-lg" id="emp-submit-btn" onclick="EmployeeUI.submit()">
          📤 Submit Shift Readings
        </button>
      </div>

      <!-- Past Submissions -->
      <div class="card" style="margin-top:1rem;">
        <div class="card-header">📋 Your Submissions</div>
        <div id="emp-submissions-list"><div class="empty-state">Loading...</div></div>
      </div>
    `;

    this._loadPastSubmissions(session);
  },

  _renderNozzleGroup(label, prefix) {
    return `
      <div class="nozzle-group">
        <h4>${label}</h4>
        <div class="form-row">
          <div class="form-group">
            <label>Opening</label>
            <input type="number" id="${prefix}-open" placeholder="0.00" step="0.01" oninput="EmployeeUI.updateCalc()">
          </div>
          <div class="form-group">
            <label>Closing</label>
            <input type="number" id="${prefix}-close" placeholder="0.00" step="0.01" oninput="EmployeeUI.updateCalc()">
          </div>
          <div class="form-group">
            <label>Tests</label>
            <input type="number" id="${prefix}-tests" placeholder="0" oninput="EmployeeUI.updateCalc()">
          </div>
        </div>
        <div class="nozzle-calc" id="calc-${prefix.replace('emp-', '')}" style="display:none;"></div>
      </div>
    `;
  },

  async autoFillOpeningReadings(date, shift) {
    const previousDate = MathEngine.addDays(date, -1);
    const targetDate = shift === 'day' ? previousDate : date;
    const targetShift = shift === 'day' ? 'night' : 'day';
    
    const allLedger = await OctaneDB.dbGetAll('master_ledger');
    const prevEntry = allLedger.find(e => e.date === targetDate && e.shift_type === targetShift);
    
    if (prevEntry && prevEntry.entry_data) {
      const data = prevEntry.entry_data;
      return {
        'du1p': data.du1_p?.close_night || data.du1_p?.close_day || 0,
        'du1d': data.du1_d?.close_night || data.du1_d?.close_day || 0,
        'du2p': data.du2_p?.close_night || data.du2_p?.close_day || 0,
        'du2d': data.du2_d?.close_night || data.du2_d?.close_day || 0
      };
    }
    return null;
  },

  async onFormChange() {
    const dayEl = document.getElementById('emp-date-day');
    const monthEl = document.getElementById('emp-date-month');
    const yearEl = document.getElementById('emp-date-year');
    const shiftEl = document.getElementById('emp-shift');
    
    if (dayEl && monthEl && yearEl && shiftEl) {
      const dateStr = `${yearEl.value}-${String(monthEl.value).padStart(2,'0')}-${String(dayEl.value).padStart(2,'0')}`;
      const shift = shiftEl.value;
      
      const openings = await this.autoFillOpeningReadings(dateStr, shift);
      if (openings) {
        Object.entries(openings).forEach(([key, value]) => {
          const input = document.getElementById(`emp-${key}-open`);
          if (input) {
            input.value = value;
            input.readOnly = true;
            input.style.background = 'rgba(255,255,255,0.03)';
            input.title = 'Auto-filled from previous shift. Contact owner to override.';
          }
        });
      } else {
        // Unlock if no previous entry found
        ['du1p','du1d','du2p','du2d'].forEach(key => {
          const input = document.getElementById(`emp-${key}-open`);
          if (input) {
            input.readOnly = false;
            input.style.background = '';
            input.title = '';
          }
        });
      }
    }
    this.updateCalc();
  },

  async updateCalc() {
    const v = (id) => Sanitize.number(document.getElementById(id)?.value);
    const nozzles = [
      { open: 'emp-du1p-open', close: 'emp-du1p-close', tests: 'emp-du1p-tests', fuel: 'petrol' },
      { open: 'emp-du1d-open', close: 'emp-du1d-close', tests: 'emp-du1d-tests', fuel: 'diesel' },
      { open: 'emp-du2p-open', close: 'emp-du2p-close', tests: 'emp-du2p-tests', fuel: 'petrol' },
      { open: 'emp-du2d-open', close: 'emp-du2d-close', tests: 'emp-du2d-tests', fuel: 'diesel' },
    ];

    let totalPetrol = 0, totalDiesel = 0, totalRevenue = 0;
    const db = await OctaneDB.loadFullDB();

    const dayEl = document.getElementById('emp-date-day');
    const monthEl = document.getElementById('emp-date-month');
    const yearEl = document.getElementById('emp-date-year');
    let dateStr = '';
    if (dayEl && monthEl && yearEl) {
      dateStr = `${yearEl.value}-${String(monthEl.value).padStart(2,'0')}-${String(dayEl.value).padStart(2,'0')}`;
    }
    const prices = dateStr ? MathEngine.getPricesAt(dateStr, db.prices) : { petrol: 0, diesel: 0 };

    const testDeduction = db.settings?.test_deduction_liters || 5;

    nozzles.forEach(nz => {
      const open = v(nz.open), close = v(nz.close), tests = v(nz.tests);
      const litres = Math.max(0, close - open - (tests * testDeduction));
      const price = prices[nz.fuel] || 0;
      const revenue = litres * price;
      totalRevenue += revenue;
      if (nz.fuel === 'petrol') totalPetrol += litres;
      else totalDiesel += litres;
    });

    const cashCollected = v('emp-cash');
    const expectedCash = Math.max(0, totalRevenue);
    const discrepancy = cashCollected - expectedCash;

    const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setEl('live-petrol-sold', totalPetrol.toFixed(2) + ' L');
    setEl('live-diesel-sold', totalDiesel.toFixed(2) + ' L');
    setEl('live-expected-cash', Helpers.formatCurrency(expectedCash));

    const discEl = document.getElementById('live-cash-discrepancy');
    if (discEl) {
      if (Math.abs(discrepancy) < 1) {
        discEl.innerHTML = '✅ ₹ 0';
        discEl.style.color = '#22c55e';
      } else {
        discEl.innerHTML = `❌ ${Helpers.formatCurrency(discrepancy)}`;
        discEl.style.color = '#ef4444';
      }
    }
  },

  async checkDuplicateSubmission(date, shift) {
    const pending = await OctaneDB.dbGetAll('pending_entries');
    const existsInPending = pending.some(e => 
      e.date === date && 
      e.shift_type === shift && 
      e.status !== 'rejected' // If rejected, they can try again
    );
    
    const ledger = await OctaneDB.dbGetAll('master_ledger');
    const existsInLedger = ledger.some(e => e.date === date && e.shift_type === shift);
    
    if (existsInPending || existsInLedger) {
      showNotification('⚠️ A submission for this shift already exists.', 'warning');
      return true;
    }
    return false;
  },

  async verifyShiftHandoff(date, shift, openings) {
    const previousDate = MathEngine.addDays(date, -1);
    const prevEntry = await OctaneDB.dbGetAll('master_ledger').then(all => 
      all.find(e => e.date === previousDate && e.shift_type === (shift === 'day' ? 'night' : 'day'))
    );
    
    if (prevEntry && prevEntry.entry_data) {
      const data = prevEntry.entry_data;
      const expected = {
        du1_p: data.du1_p?.close_night || data.du1_p?.close_day || 0,
        du1_d: data.du1_d?.close_night || data.du1_d?.close_day || 0,
        du2_p: data.du2_p?.close_night || data.du2_p?.close_day || 0,
        du2_d: data.du2_d?.close_night || data.du2_d?.close_day || 0
      };
      
      const mismatches = [];
      for (const key of ['du1_p', 'du1_d', 'du2_p', 'du2_d']) {
        // Strip out underscore for opening input keys
        const inputKey = key.replace('_', '');
        if (Math.abs(openings[inputKey] - expected[key]) > 0.01) {
          mismatches.push(`${key}: expected ${expected[key].toFixed(2)}, got ${openings[inputKey].toFixed(2)}`);
        }
      }
      
      if (mismatches.length > 0) {
        const warning = `⚠️ Opening readings don't match previous shift's closing:\n${mismatches.join('\n')}\n\nThis will be flagged for owner review.`;
        showNotification(warning, 'warning');
        // Flag the entry for quarantine
        return { valid: false, mismatches };
      }
    }
    return { valid: true };
  },

  async submit() {
    const session = Auth.getSession();
    if (!session) return;

    const v = (id) => Sanitize.number(document.getElementById(id)?.value);
    const dayEl = document.getElementById('emp-date-day');
    const monthEl = document.getElementById('emp-date-month');
    const yearEl = document.getElementById('emp-date-year');
    const shiftEl = document.getElementById('emp-shift');

    if (!dayEl?.value || !monthEl?.value || !yearEl?.value) {
      return showNotification('Please select a date.', 'danger');
    }

    const date = `${yearEl.value}-${String(monthEl.value).padStart(2,'0')}-${String(dayEl.value).padStart(2,'0')}`;
    if (!Validators.isNotFutureDate(date)) {
      return showNotification('Cannot submit future dates.', 'danger');
    }

    const shift = shiftEl?.value || 'day';

    if (await this.checkDuplicateSubmission(date, shift)) {
      return;
    }

    const mkNozzle = (prefix) => ({
      open: v(`${prefix}-open`),
      close_day: shift === 'day' ? v(`${prefix}-close`) : 0,
      close_night: shift === 'night' ? v(`${prefix}-close`) : 0,
      tests_day: shift === 'day' ? v(`${prefix}-tests`) : 0,
      tests_night: shift === 'night' ? v(`${prefix}-tests`) : 0,
    });

    const ppOpen = v('emp-pp-open'), ppClose = v('emp-pp-close');
    const ppCollection = Math.max(0, ppClose - ppOpen);

    const entry = {
      id: Helpers.generateId(),
      employee_id: session.uid || 'unknown',
      date,
      shift_type: shift,
      entry_data: {
        date, shift,
        du1_p: mkNozzle('emp-du1p'), du1_d: mkNozzle('emp-du1d'),
        du2_p: mkNozzle('emp-du2p'), du2_d: mkNozzle('emp-du2d'),
        cash_sales: v('emp-cash'), card_sales: v('emp-card'),
        phonepe_opening: ppOpen, phonepe_closing: ppClose,
        phonepe_collection: ppCollection,
        remarks: Sanitize.input(document.getElementById('emp-remarks')?.value || ''),
      },
      status: 'pending',
      submitted_at: new Date().toISOString(),
      _dirty: true
    };

    // Verify Shift Handoff
    const openings = {
      du1p: v('emp-du1p-open'),
      du1d: v('emp-du1d-open'),
      du2p: v('emp-du2p-open'),
      du2d: v('emp-du2d-open')
    };
    const handoff = await this.verifyShiftHandoff(date, shift, openings);
    if (!handoff.valid) {
      entry.entry_data.remarks += `\n[SYSTEM] Handoff Mismatch: ${handoff.mismatches.join(', ')}`;
      entry.quarantined = true;
    }

    const btn = document.getElementById('emp-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }

    await OctaneDB.dbPut('pending_entries', entry);
    await window.syncQueue.enqueue('PUSH_PENDING', entry);

    showNotification('✅ Entry saved locally. Waiting for owner approval.', 'success');

    // Clear form
    ['emp-du1p-open','emp-du1p-close','emp-du1p-tests','emp-du1d-open','emp-du1d-close','emp-du1d-tests',
     'emp-du2p-open','emp-du2p-close','emp-du2p-tests','emp-du2d-open','emp-du2d-close','emp-du2d-tests',
     'emp-cash','emp-card','emp-pp-open','emp-pp-close','emp-remarks'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    if (btn) { btn.disabled = false; btn.textContent = '📤 Submit Shift Readings'; }
    this.updateCalc();
    this._loadPastSubmissions(session);
  },

  async _loadPastSubmissions(session) {
    const listEl = document.getElementById('emp-submissions-list');
    if (!listEl) return;
    const all = await OctaneDB.dbGetAll('pending_entries');
    const mine = all.filter(e => e.employee_id === session.uid).sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || '')).slice(0, 20);

    if (mine.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No submissions yet.</div>';
      return;
    }

    listEl.innerHTML = mine.map(s => {
      const sc = s.status === 'approved' ? '#22c55e' : s.status === 'rejected' ? '#ef4444' : '#f97316';
      const icon = s.status === 'approved' ? '✅' : s.status === 'rejected' ? '❌' : '⏳';
      const date = s.date || s.entry_data?.date || 'Unknown';
      return `
        <div class="submission-item" style="border-left:3px solid ${sc};">
          <div style="display:flex;justify-content:space-between;">
            <strong>${Helpers.formatDate(date)}</strong>
            <span style="color:${sc};font-weight:700;">${icon} ${s.status.toUpperCase()}</span>
          </div>
          <div class="text-dim">${Helpers.timeAgo(s.submitted_at)}</div>
        </div>
      `;
    }).join('');
  }
};

window.EmployeeUI = EmployeeUI;
