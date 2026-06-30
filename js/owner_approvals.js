// ── Owner: Approvals Panel ─────────────────────────────────
// ── Owner: Approvals Panel ─────────────────────────────────
function calculateNozzleSale(nozzleData, shift) {
  if (!nozzleData) return 0;
  const open = nozzleData.open || 0;
  const close = shift === 'day' ? (nozzleData.close_day || 0) : (nozzleData.close_night || 0);
  const tests = shift === 'day' ? (nozzleData.tests_day || 0) : (nozzleData.tests_night || 0);
  return Math.max(0, close - open - tests);
}

function getPendingGroupLabel(year, month, groupSuffix) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = months[parseInt(month) - 1] || 'Month';
  
  if (groupSuffix === '01_10') {
    return `${monthName} ${year} · 1st to 10th`;
  } else if (groupSuffix === '11_20') {
    return `${monthName} ${year} · 11th to 20th`;
  } else {
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    return `${monthName} ${year} · 21st to ${lastDay}th`;
  }
}

function toggleSelectAllGroup(groupId, masterCheckbox) {
  const checkboxes = document.querySelectorAll(`.bulk-select-${groupId}`);
  checkboxes.forEach(cb => {
    cb.checked = masterCheckbox.checked;
  });
  updateGroupCalculations(groupId);
}

function updateGroupCalculations(groupId) {
  const checkboxes = document.querySelectorAll(`.bulk-select-${groupId}:checked`);
  let totalPetrol = 0;
  let totalDiesel = 0;
  let totalCash = 0;
  let totalCard = 0;

  checkboxes.forEach(cb => {
    const entryId = cb.value;
    const entry = db.pending_entries.find(e => e.id === entryId);
    if (entry) {
      const ed = entry.entryData;
      const shift = ed.shift;

      if (entry.submission_type === 'deposit') {
        totalCash += (ed.deposit_amount || 0);
      } else {
        const p1 = calculateNozzleSale(ed.du1_p, shift);
        const d1 = calculateNozzleSale(ed.du1_d, shift);
        const p2 = calculateNozzleSale(ed.du2_p, shift);
        const d2 = calculateNozzleSale(ed.du2_d, shift);

        totalPetrol += (p1 + p2);
        totalDiesel += (d1 + d2);
        totalCash += (ed.cash_sales || 0);
        totalCard += (ed.card_sales || 0);
      }
    }
  });

  const petEl = document.getElementById(`group-calc-petrol-${groupId}`);
  const dieEl = document.getElementById(`group-calc-diesel-${groupId}`);
  const colEl = document.getElementById(`group-calc-collections-${groupId}`);
  const countEl = document.getElementById(`group-calc-count-${groupId}`);
  const btnEl = document.getElementById(`group-btn-approve-${groupId}`);

  if (petEl) petEl.textContent = `${totalPetrol.toFixed(0)} L`;
  if (dieEl) dieEl.textContent = `${totalDiesel.toFixed(0)} L`;
  if (colEl) colEl.textContent = formatCurrency(totalCash + totalCard);
  if (countEl) countEl.textContent = `(${checkboxes.length} selected)`;
  if (btnEl) {
    btnEl.disabled = checkboxes.length === 0;
    btnEl.textContent = `✅ Approve Selected (${checkboxes.length})`;
  }
}

function bulkApproveEntries(groupId) {
  const selector = `.bulk-select-${groupId}:checked`;
  const checkedCheckboxes = document.querySelectorAll(selector);
  if (checkedCheckboxes.length === 0) {
    showNotification('Please select at least one entry to approve.', 'warning');
    return;
  }

  if (!confirm(`Are you sure you want to approve and post all ${checkedCheckboxes.length} selected shift entries?`)) {
    return;
  }

  // Process approvals silently in a loop, then save and render once at the end
  checkedCheckboxes.forEach(cb => {
    approveEntry(cb.value, true);
  });

  saveDB();
  showNotification(`✅ Successfully approved and posted ${checkedCheckboxes.length} entries.`, 'success');
  renderApprovalsPanel();
}

function refreshApprovalsPanel() {
  const refreshBtn = document.getElementById('approvals-refresh-btn');
  if (refreshBtn) { refreshBtn.textContent = '🔄 Refreshing...'; refreshBtn.disabled = true; }
  initSync().then(() => {
    buildIndexes();
    renderApprovalsPanel();
  }).catch(() => {
    renderApprovalsPanel();
  });
}

function buildLiveShiftStatus() {
  // Builds per-employee live status from today's pending_entries
  const todayStr = new Date().toISOString().split('T')[0];
  const todayEntries = (db.pending_entries || []).filter(e =>
    e.entryData?.date === todayStr
  );

  const byEmployee = {};
  todayEntries.forEach(e => {
    const emp = e.submittedBy;
    if (!byEmployee[emp]) byEmployee[emp] = { name: e.submittedByName, entries: [] };
    byEmployee[emp].entries.push(e);
  });

  const rows = Object.values(byEmployee).map(({ name, entries }) => {
    // Sort by submission time
    entries.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const first = entries[0];
    const last  = entries[entries.length - 1];
    const lastTime = new Date(last.submittedAt).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });

    // Calculate litres from opening to latest reading
    let totalLitres = 0;
    const firstEd = first.entryData;
    const lastEd  = last.entryData;
    const shift   = lastEd.shift || 'day';

    ['du1_p','du1_d','du2_p','du2_d'].forEach(key => {
      const openVal  = firstEd[key]?.open || 0;
      const closeVal = shift === 'day' ? (lastEd[key]?.close_day || 0) : (lastEd[key]?.close_night || 0);
      const testVal  = shift === 'day' ? (lastEd[key]?.tests_day || 0) : (lastEd[key]?.tests_night || 0);
      if (closeVal > openVal) totalLitres += Math.max(0, closeVal - openVal - testVal);
    });

    // Sum PhonePe collections across all entries
    const totalPP   = entries.reduce((s, e) => s + (e.entryData?.phonepe_collection || 0), 0);
    const totalCash = entries.reduce((s, e) => s + (e.entryData?.cash_sales || 0), 0);

    return { name, lastTime, totalLitres, totalPP, totalCash };
  });

  return rows;
}

function renderApprovalsPanel() {
  updateApprovalsBadge();
  
  // Reset the refresh button state if it exists
  const refreshBtn = document.getElementById('approvals-refresh-btn');
  if (refreshBtn) {
    refreshBtn.textContent = '🔄 Refresh Now';
    refreshBtn.disabled = false;
  }

  const container = document.getElementById('approvals-list');
  if (!container) return;

  const pending = (db.pending_entries || []).filter(e => e.status === 'pending' && e.entryData && e.entryData.date);
  const reviewed = (db.pending_entries || []).filter(e => e.status !== 'pending' && e.entryData && e.entryData.date)
                     .sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''))
                     .slice(0, 20); // show last 20 reviewed items

  if (pending.length === 0 && reviewed.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#64748b;padding:3rem;font-size:1rem;">No submissions yet. Employees submit readings from their phones.</div>';
    return;
  }

  let html = '';

  // Group pending entries by Month-Year and 10-day period
  const groups = {};
  pending.forEach(entry => {
    const ed = entry.entryData;
    const dateParts = ed.date.split('-');
    if (dateParts.length < 3) return;
    const year = dateParts[0];
    const month = dateParts[1];
    const day = parseInt(dateParts[2]);

    let groupSuffix = '21_End';
    if (day <= 10) {
      groupSuffix = '01_10';
    } else if (day <= 20) {
      groupSuffix = '11_20';
    }

    const key = `${year}-${month}-${groupSuffix}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(entry);
  });

  // Sort groups chronologically descending (latest group first)
  const sortedGroupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  // Render Pending Batches
  if (pending.length > 0) {
    html += '<h3 style="font-weight:800;color:#f8fafc;font-size:1.1rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">⏳ Pending Approvals</h3>';
    
    sortedGroupKeys.forEach(groupId => {
      const entries = groups[groupId];
      // Sort entries within group chronologically ascending (oldest first) so readings flow sequentially
      entries.sort((a, b) => {
        const dateDiff = a.entryData.date.localeCompare(b.entryData.date);
        if (dateDiff !== 0) return dateDiff;
        if (a.entryData.shift === b.entryData.shift) return 0;
        return a.entryData.shift === 'day' ? -1 : 1;
      });

      const keyParts = groupId.split('-');
      const groupLabel = getPendingGroupLabel(keyParts[0], keyParts[1], keyParts[2]);

      html += `
        <div class="panel" style="margin-bottom:1.5rem; border:1px solid #475569; background:rgba(30,41,59,0.4); padding:1rem; border-radius:1rem;">
          <!-- Group Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; border-bottom:1px solid #334155; padding-bottom:0.75rem; margin-bottom:1rem;">
            <div>
              <h4 style="font-weight:800; color:#fff; font-size:1rem; margin:0;">📅 ${groupLabel}</h4>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.15rem;">Contains ${entries.length} pending submissions</div>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button id="group-btn-approve-${groupId}" onclick="bulkApproveEntries('${groupId}')" style="background:#22c55e; color:#fff; border:none; border-radius:0.5rem; padding:0.5rem 1rem; font-size:0.8rem; font-weight:700; cursor:pointer;" disabled>✅ Approve Selected (0)</button>
            </div>
          </div>

          <!-- Group Batch Real-Time Stats Card -->
          <div style="background:#0f172a; border:1px solid #1e293b; border-radius:0.75rem; padding:0.75rem 1.25rem; margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
            <div style="font-size:0.75rem; color:#94a3b8;">
              <strong style="color:#22c55e;">Checked Items Live Totalizer</strong><br>
              Match these sums with your paper logs: <span id="group-calc-count-${groupId}" style="color:#f97316; font-weight:700;">(0 selected)</span>
            </div>
            <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
              <div style="text-align:center;"><div style="font-size:0.62rem; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Petrol (MS)</div><strong style="font-size:1rem; color:#fff;" id="group-calc-petrol-${groupId}">0 L</strong></div>
              <div style="text-align:center;"><div style="font-size:0.62rem; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Diesel (HSD)</div><strong style="font-size:1rem; color:#fff;" id="group-calc-diesel-${groupId}">0 L</strong></div>
              <div style="text-align:center;"><div style="font-size:0.62rem; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Collections</div><strong style="font-size:1rem; color:#22c55e;" id="group-calc-collections-${groupId}">₹ 0.00</strong></div>
            </div>
          </div>

          <!-- Master Control -->
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; padding-left:0.5rem;">
            <input type="checkbox" id="master-select-${groupId}" onchange="toggleSelectAllGroup('${groupId}', this)" style="transform: scale(1.2); cursor:pointer;">
            <label for="master-select-${groupId}" style="font-size:0.8rem; color:#94a3b8; font-weight:700; cursor:pointer; user-select:none;">Select All Group Entries</label>
          </div>

          <!-- Entries List -->
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            ${entries.map(entry => {
              const ed = entry.entryData;
              const shift = ed.shift;

              if (entry.submission_type === 'deposit') {
                const depositAmount = ed.deposit_amount || 0;
                return `
                  <div style="background:#0f111a; border:1px solid #22c55e; border-left: 3px solid #22c55e; border-radius:0.75rem; padding:1rem; display:flex; gap:0.75rem;">
                    <!-- Checkbox Column -->
                    <div style="display:flex; align-items:flex-start; padding-top:0.25rem;">
                      <input type="checkbox" class="bulk-select-${groupId}" value="${entry.id}" onchange="updateGroupCalculations('${groupId}')" style="transform: scale(1.15); cursor:pointer;">
                    </div>

                    <!-- Details Column -->
                    <div style="flex:1; display:flex; flex-direction:column; gap:0.6rem;">
                      <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.25rem;">
                        <div>
                          <strong style="font-size:0.88rem; color:#fff;">${ed.date} · ${shift === 'day' ? '☀️ Day Shift' : '🌙 Night Shift'}</strong>
                          <span style="font-size:0.72rem; color:#64748b; margin-left:0.5rem;">by ${entry.submittedByName}</span>
                          <span style="font-size:0.68rem; background:rgba(34,197,94,0.15); color:#86efac; border:1px solid rgba(34,197,94,0.3); border-radius:3px; padding:0.05rem 0.3rem; margin-left:0.25rem;">💰 Cash Deposit</span>
                        </div>
                        <span style="font-size:0.7rem; color:#94a3b8; font-family:monospace;">${entry.submittedAt.replace('T',' ').slice(11,16)}</span>
                      </div>

                      <div style="background:rgba(34,197,94,0.05); border:1px dashed rgba(34,197,94,0.3); border-radius:0.5rem; padding:0.75rem; display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-size:0.85rem; color:#94a3b8; font-weight:600;">Office Cash Deposited</span>
                        <strong style="font-size:1.2rem; color:#22c55e;">₹ ${depositAmount.toLocaleString('en-IN')}</strong>
                      </div>

                      ${ed.remarks ? `<div style="font-size:0.75rem; color:#94a3b8; background:rgba(255,255,255,0.02); border-left:2px solid #22c55e; padding:0.35rem 0.6rem; border-radius:4px;">📝 <strong style="color:#f8fafc;">Note:</strong> ${ed.remarks}</div>` : ''}

                      <!-- Actions -->
                      <div style="display:flex; gap:0.5rem; justify-content:flex-end; flex-wrap:wrap; margin-top:0.25rem;">
                        <button onclick="approveEntry('${entry.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">✅ Approve & Credit Cash</button>
                        <button onclick="promptRejectEntry('${entry.id}')" style="background:#ef4444; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">❌ Reject</button>
                      </div>
                    </div>
                  </div>
                `;
              }

              // Calculate nozzle sales
              const du1_p_open = ed.du1_p?.open || 0;
              const du1_p_close = shift === 'day' ? (ed.du1_p?.close_day || 0) : (ed.du1_p?.close_night || 0);
              const du1_p_tests = shift === 'day' ? (ed.du1_p?.tests_day || 0) : (ed.du1_p?.tests_night || 0);
              const du1_p_sale = calculateNozzleSale(ed.du1_p, shift);

              const du1_d_open = ed.du1_d?.open || 0;
              const du1_d_close = shift === 'day' ? (ed.du1_d?.close_day || 0) : (ed.du1_d?.close_night || 0);
              const du1_d_tests = shift === 'day' ? (ed.du1_d?.tests_day || 0) : (ed.du1_d?.tests_night || 0);
              const du1_d_sale = calculateNozzleSale(ed.du1_d, shift);

              const du2_p_open = ed.du2_p?.open || 0;
              const du2_p_close = shift === 'day' ? (ed.du2_p?.close_day || 0) : (ed.du2_p?.close_night || 0);
              const du2_p_tests = shift === 'day' ? (ed.du2_p?.tests_day || 0) : (ed.du2_p?.tests_night || 0);
              const du2_p_sale = calculateNozzleSale(ed.du2_p, shift);

              const du2_d_open = ed.du2_d?.open || 0;
              const du2_d_close = shift === 'day' ? (ed.du2_d?.close_day || 0) : (ed.du2_d?.close_night || 0);
              const du2_d_tests = shift === 'day' ? (ed.du2_d?.tests_day || 0) : (ed.du2_d?.tests_night || 0);
              const du2_d_sale = calculateNozzleSale(ed.du2_d, shift);

              // Financial Math
              const prices = getPricesAt(ed.date);
              const totalPetrolSales = du1_p_sale + du2_p_sale;
              const totalDieselSales = du1_d_sale + du2_d_sale;
              const estimatedRevenue = (totalPetrolSales * prices.petrol) + (totalDieselSales * prices.diesel);
              const expectedCash = Math.max(0, estimatedRevenue - (ed.card_sales || 0));
              const variance = (ed.cash_sales || 0) - expectedCash;

              const varianceColor = variance < -100 ? 'rgba(239, 68, 68, 0.4)' : variance > 100 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.05)';
              const varianceTextColor = variance < -100 ? '#ef4444' : variance > 100 ? '#60a5fa' : '#22c55e';
              const varianceSign = variance > 0 ? '+' : '';

              const typeLabel = entry.submission_type === 'opening' ? '🌅 Opening' : entry.submission_type === 'snapshot' ? '📸 Snapshot' : '🏁 Closing';
              const isSnapshot = entry.submission_type === 'snapshot';

              // PhonePe display
              const ppOpen = ed.phonepe_opening || 0;
              const ppMid  = ed.phonepe_midnight || 0;
              const ppClose= ed.phonepe_closing  || 0;
              const ppColl = ed.phonepe_collection || 0;
              const ppFormula = (shift==='night' && ppMid>0)
                ? `(₹${ppMid.toLocaleString('en-IN')}−₹${ppOpen.toLocaleString('en-IN')})+₹${ppClose.toLocaleString('en-IN')}`
                : `₹${ppClose.toLocaleString('en-IN')}−₹${ppOpen.toLocaleString('en-IN')}`;

              return `
                <div style="background:#0f111a; border:1px solid ${isSnapshot ? '#1d4ed8' : '#1e293b'}; border-left: 3px solid ${isSnapshot ? '#3b82f6' : '#334155'}; border-radius:0.75rem; padding:1rem; display:flex; gap:0.75rem;">
                  <!-- Checkbox Column -->
                  <div style="display:flex; align-items:flex-start; padding-top:0.25rem;">
                    <input type="checkbox" class="bulk-select-${groupId}" value="${entry.id}" onchange="updateGroupCalculations('${groupId}')" style="transform: scale(1.15); cursor:pointer;">
                  </div>

                  <!-- Details Column -->
                  <div style="flex:1; display:flex; flex-direction:column; gap:0.5rem;">
                    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.25rem;">
                      <div>
                        <strong style="font-size:0.88rem; color:#fff;">${ed.date} · ${shift === 'day' ? '☀️ Day Shift' : '🌙 Night Shift'}</strong>
                        <span style="font-size:0.72rem; color:#64748b; margin-left:0.5rem;">by ${entry.submittedByName}</span>
                        <span style="font-size:0.68rem; background:rgba(59,130,246,0.15); color:#93c5fd; border:1px solid rgba(59,130,246,0.3); border-radius:3px; padding:0.05rem 0.3rem; margin-left:0.25rem;">${typeLabel}</span>
                      </div>
                      <span style="font-size:0.7rem; color:#94a3b8; font-family:monospace;">${entry.submittedAt.replace('T',' ').slice(11,16)}</span>
                    </div>

                    <!-- Nozzles Dynamic Tables -->
                    <table style="width:100%; font-size:0.75rem; border-collapse:collapse; background:rgba(255,255,255,0.01); border:1px solid #1e293b; border-radius:6px; overflow:hidden;">
                      <thead>
                        <tr style="background:rgba(255,255,255,0.03); color:#94a3b8; text-align:left; border-bottom:1px solid #1e293b;">
                          <th style="padding:0.3rem 0.5rem;">Nozzle</th>
                          <th style="padding:0.3rem 0.5rem; text-align:right;">Open</th>
                          <th style="padding:0.3rem 0.5rem; text-align:right;">Close</th>
                          <th style="padding:0.3rem 0.5rem; text-align:right;">Tests</th>
                          <th style="padding:0.3rem 0.5rem; text-align:right; color:#22c55e;">Sale Volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#ef4444;">●</span> DU1-P (E2)</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du1_p_open.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du1_p_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du1_p_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du1_p_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#eab308;">●</span> DU1-D (HSD)</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du1_d_open.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du1_d_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du1_d_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du1_d_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#ef4444;">●</span> DU2-P (E2)</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du2_p_open.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du2_p_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du2_p_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du2_p_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#eab308;">●</span> DU2-D (HSD)</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du2_d_open.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du2_d_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du2_d_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du2_d_sale.toFixed(2)} L</td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Financial stats grid -->
                    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.4rem;">
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center;">
                        <div style="font-size:0.6rem; color:#64748b;">Expected Rev</div>
                        <div style="font-weight:700; color:#f8fafc; font-size:0.78rem;">${formatCurrency(estimatedRevenue)}</div>
                      </div>
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center;">
                        <div style="font-size:0.6rem; color:#64748b;">Cash</div>
                        <div style="font-weight:700; color:#f8fafc; font-size:0.78rem;">${formatCurrency(ed.cash_sales||0)}</div>
                      </div>
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center;">
                        <div style="font-size:0.6rem; color:#64748b;">PhonePe (Δ)</div>
                        <div style="font-weight:700; color:#38bdf8; font-size:0.78rem;">${formatCurrency(ppColl)}</div>
                      </div>
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center; border:1px solid ${varianceColor};">
                        <div style="font-size:0.6rem; color:#64748b;">Variance</div>
                        <div style="font-weight:700; color:${varianceTextColor}; font-size:0.78rem;">${varianceSign}${formatCurrency(variance)}</div>
                      </div>
                    </div>

                    ${ppColl > 0 || ppOpen > 0 ? `
                    <div style="font-size:0.72rem;color:#64748b;background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.1);border-radius:4px;padding:0.3rem 0.5rem;">
                      📱 PhonePe: ${ppFormula} = <strong style="color:#38bdf8;">₹${ppColl.toLocaleString('en-IN')}</strong>
                      ${ed.manual_prices ? ' <span style="color:#f97316;font-size:0.65rem;">⚠️ Manual prices used</span>' : ''}
                    </div>` : ''}

                    ${(function() {
                      const ledgerDay = db.daily_ledger.find(r => r.date === ed.date);
                      const depositsApproved = (ledgerDay?.recon?.deposits || []).reduce((sum, d) => sum + d.amount, 0);
                      if (depositsApproved > 0) {
                        return `
                          <div style="font-size:0.72rem;color:#22c55e;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.1);border-radius:4px;padding:0.35rem 0.5rem;margin-top:0.25rem;">
                            💰 Approved Office Deposits today: <strong style="color:#86efac;">₹${depositsApproved.toLocaleString('en-IN')}</strong>
                          </div>
                        `;
                      }
                      return '';
                    })()}

                    ${ed.remarks ? `<div style="font-size:0.75rem; color:#94a3b8; background:rgba(255,255,255,0.02); border-left:2px solid var(--primary); padding:0.35rem 0.6rem; border-radius:4px;">📝 <strong style="color:#f8fafc;">Note:</strong> ${ed.remarks}</div>` : ''}

                    <!-- Actions -->
                    <div style="display:flex; gap:0.5rem; justify-content:flex-end; flex-wrap:wrap; margin-top:0.25rem;">
                      ${isSnapshot ? `<button onclick="approveEntry('${entry.id}')" style="background:#3b82f6; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">📊 Post to Ledger</button>` : `<button onclick="approveEntry('${entry.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">✅ Approve</button>`}
                      <button onclick="promptRejectEntry('${entry.id}')" style="background:#ef4444; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">❌ Reject</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });
  }

  // Render Reviewed Submissions History
  if (reviewed.length > 0) {
    html += '<h3 style="font-weight:800;color:#64748b;font-size:1.1rem;margin-top:2rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">📜 Recently Reviewed (History)</h3>';
    reviewed.forEach(entry => {
      const isApproved = entry.status === 'approved';
      const sc = isApproved ? '#22c55e' : '#ef4444';
      const ed = entry.entryData;
      
      html += `
        <div style="background:#1e293b; border:1px solid #334155; border-left:3px solid ${sc}; border-radius:0.75rem; padding:1rem; margin-bottom:0.75rem; opacity:0.85;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.25rem;">
            <div>
              <strong style="font-size:0.85rem; color:#f8fafc;">${ed.date} · ${ed.shift === 'day' ? '☀️ Day' : '🌙 Night'}</strong>
              <span style="font-size:0.7rem; color:#94a3b8; margin-left:0.5rem;">by ${entry.submittedByName}</span>
            </div>
            <span style="font-size:0.7rem; color:${sc}; font-weight:700; text-transform:uppercase; padding:0.1rem 0.4rem; background:rgba(0,0,0,0.3); border-radius:4px;">
              ${entry.status}
            </span>
          </div>
          <div style="font-size:0.72rem; color:#64748b; margin-top:0.25rem; display:flex; justify-content:space-between;">
            <span>Reviewed at: ${entry.reviewedAt ? entry.reviewedAt.replace('T',' ').slice(0,16) : 'N/A'} by ${entry.reviewedBy || 'N/A'}</span>
            <span>Cash: ${formatCurrency(ed.cash_sales||0)} · Card: ${formatCurrency(ed.card_sales||0)}</span>
          </div>
          ${entry.status === 'rejected' && entry.rejectionReason 
            ? `<div style="margin-top:0.4rem; padding:0.4rem; background:rgba(239,68,68,0.08); border-radius:4px; color:#fca5a5; font-size:0.75rem;">Reason: ${entry.rejectionReason}</div>` 
            : ''}
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

function approveEntry(entryId, skipRender = false) {
  const session = getSession();
  if (!session || session.role !== 'owner') return;
  const idx = (db.pending_entries||[]).findIndex(e=>e.id===entryId);
  if (idx===-1) return;
  const entry = db.pending_entries[idx];
  const ed    = entry.entryData;

  // Retrieve existing ledger row or initialize a new one
  let row = db.daily_ledger.find(r => r.date === ed.date);
  let oldNetP = 0;
  let oldNetD = 0;

  if (row) {
    row._dirty = true;
    if (entry.submission_type !== 'deposit') {
      // Record old sales values for stock reconciliation
      try {
        const oldCalc = computeLedgerRow(row);
        oldNetP = oldCalc.totals.net_24h.petrol || 0;
        oldNetD = oldCalc.totals.net_24h.diesel || 0;
      } catch (err) {
        console.warn('[Approval] Failed to compute old ledger row sales: ', err);
      }
    }
  } else {
    // Determine selling prices for the date
    const activePrices = getPricesAt(ed.date);
    row = {
      date: ed.date,
      prices: { petrol: activePrices.petrol, diesel: activePrices.diesel },
      du1_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du1_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du2_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du2_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      recon: { cash: 0, phonepe: 0, credit: 0, total_collection: 0, remarks: '' },
      _dirty: true
    };
    db.daily_ledger.push(row);
  }

  if (entry.submission_type === 'deposit') {
    row.recon.cash = (row.recon.cash || 0) + (ed.deposit_amount || 0);
    row.recon.total_collection = (row.recon.cash || 0) + (row.recon.phonepe || 0) + (row.recon.credit || 0);

    if (!row.recon.deposits) row.recon.deposits = [];
    row.recon.deposits.push({
      id: entry.id,
      submitted_by: entry.submittedBy,
      submitted_by_name: entry.submittedByName,
      submitted_at: entry.submittedAt,
      amount: ed.deposit_amount,
      remarks: ed.remarks || ''
    });

    if (ed.remarks) {
      row.recon.remarks = row.recon.remarks
        ? `${row.recon.remarks} | Deposit: ${ed.remarks}`
        : `Deposit: ${ed.remarks}`;
    }
  } else {
    // Merge nozzle values based on shift
    if (ed.shift === 'day') {
      for (const nozzle of ['du1_p', 'du1_d', 'du2_p', 'du2_d']) {
        row[nozzle].open = ed[nozzle].open || 0;
        row[nozzle].close_day = ed[nozzle].close_day || 0;
        row[nozzle].tests_day = ed[nozzle].tests_day || 0;
        if (!row[nozzle].close_night || row[nozzle].close_night === 0) {
          row[nozzle].close_night = ed[nozzle].close_day || 0;
        }
      }
    } else {
      // shift === 'night'
      for (const nozzle of ['du1_p', 'du1_d', 'du2_p', 'du2_d']) {
        row[nozzle].close_night = ed[nozzle].close_night || 0;
        row[nozzle].tests_night = ed[nozzle].tests_night || 0;
        if (!row[nozzle].close_day || row[nozzle].close_day === 0) {
          row[nozzle].close_day = ed[nozzle].open || 0;
        }
        if (!row[nozzle].open || row[nozzle].open === 0) {
          row[nozzle].open = ed[nozzle].open || 0;
        }
      }
    }

    // Merge financial collections
    row.recon.cash = (row.recon.cash || 0) + (ed.cash_sales || 0);
    row.recon.phonepe = (row.recon.phonepe || 0) + (ed.card_sales || 0);
    row.recon.total_collection = row.recon.cash + row.recon.phonepe + (row.recon.credit || 0);

    if (ed.remarks) {
      row.recon.remarks = row.recon.remarks
        ? `${row.recon.remarks} | ${ed.remarks}`
        : ed.remarks;
    }
  }

  // Set audit metadata
  row._approved_by = session.username;
  row._approved_at = new Date().toISOString();
  row._submitted_by = entry.submittedBy;

  if (entry.submission_type !== 'deposit') {
    // Recompute sales and reconcile stock level adjustments
    try {
      const newCalc = computeLedgerRow(row);
      const newNetP = newCalc.totals.net_24h.petrol || 0;
      const newNetD = newCalc.totals.net_24h.diesel || 0;

      db.stock.petrol = Math.max(0, db.stock.petrol + oldNetP - newNetP);
      db.stock.diesel = Math.max(0, db.stock.diesel + oldNetD - newNetD);
    } catch (err) {
      console.error('[Approval] Error recalculating stock metrics: ', err);
    }
  }

  // Sort daily ledger descending by date
  db.daily_ledger.sort((a,b)=>b.date.localeCompare(a.date));

  // Update pending entry state
  db.pending_entries[idx].status     = 'approved';
  db.pending_entries[idx].reviewedBy = session.username;
  db.pending_entries[idx].reviewedAt = new Date().toISOString();
  db.pending_entries[idx]._dirty     = true;

  if (!skipRender) {
    saveDB(true);
    const successMsg = entry.submission_type === 'deposit'
      ? `✅ Cash Deposit of ₹${ed.deposit_amount.toLocaleString('en-IN')} approved and credited to the daily ledger!`
      : `✅ Entry for ${ed.date} approved and merged into Daily Production Ledger. Synced to cloud Supabase! View on Sales Cumulative Sheet.`;
    showNotification(successMsg, 'success');
    renderApprovalsPanel();
  }
}

function promptRejectEntry(entryId) {
  const reason = prompt('Rejection reason (employee will see this):');
  if (reason === null) return;
  const session = getSession();
  const idx = (db.pending_entries||[]).findIndex(e=>e.id===entryId);
  if (idx===-1) return;
  db.pending_entries[idx].status          = 'rejected';
  db.pending_entries[idx].rejectionReason = reason || 'No reason given';
  db.pending_entries[idx].reviewedBy      = session.username;
  db.pending_entries[idx].reviewedAt      = new Date().toISOString();
  db.pending_entries[idx]._dirty          = true;
  saveDB(true);
  showNotification('Entry rejected.', 'info');
  renderApprovalsPanel();
}

function renderUserManagement() {
  const session = getSession();
  if (!session || session.role !== 'owner') return;
  const users    = getUsers();
  const ulistEl  = document.getElementById('user-mgmt-list');
  if (!ulistEl) return;

  const employees = Object.values(users).filter(u => u.role === 'employee');
  ulistEl.innerHTML = employees.length === 0
    ? '<p style="color:#64748b;text-align:center;padding:1rem;">No employees yet. Add one below.</p>'
    : employees.map(u => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:#0f1117;border-radius:0.6rem;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
          <div>
            <span style="font-weight:700;color:#f8fafc;">${u.displayName}</span>
            <span style="color:#64748b;font-size:0.78rem;margin-left:0.5rem;">@${u.username}</span><br>
            <span style="font-size:0.72rem;color:${u.deviceId?'#22c55e':'#f97316'};">
              ${u.deviceId ? `✅ Device approved (...${u.deviceId.slice(-8)})` : '⏳ No device approved (pending registration)'}
            </span>
            · <span style="font-size:0.72rem;color:${u.active?'#22c55e':'#ef4444'};">${u.active?'Active':'Inactive'}</span>
          </div>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            <button onclick="resetEmployeeDevice('${u.username}')" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">📱 Reset Device</button>
            <button onclick="toggleEmployee('${u.username}')" style="background:${u.active?'rgba(239,68,68,0.1)':'rgba(34,197,94,0.1)'};color:${u.active?'#ef4444':'#22c55e'};border:1px solid ${u.active?'#ef4444':'#22c55e'};border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">${u.active?'Deactivate':'Activate'}</button>
            <button id="del-btn-${u.username}" onclick="deleteEmployeeAccount('${u.username}')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">🗑️ Delete</button>
          </div>
        </div>`).join('');

  const addBtn = document.getElementById('add-employee-btn');
  if (addBtn && !addBtn._wired) {
    console.log('[User Management] Wiring add employee button listener');
    addBtn._wired = true;
    addBtn.addEventListener('click', addUserAccount);
  }

  // Render the pending approvals dynamically from Supabase
  renderPendingDeviceApprovals();
}

async function addUserAccount() {
  console.log('[User Management] addUserAccount clicked!');
  try {
    const name = document.getElementById('new-emp-name')?.value.trim();
    const user = document.getElementById('new-emp-username')?.value.trim().toLowerCase().replace(/\s+/g,'');
    const pin  = document.getElementById('new-emp-pin')?.value.trim();
    const role = document.getElementById('new-emp-role-select')?.value || 'employee';
    console.log('[User Management] Form inputs:', { name, user, pin, role });
    if (!name||!user||!pin) { showNotification('Fill in all three fields.','danger'); return; }
    if (!/^\d{4,6}$/.test(pin)) { showNotification('PIN must be 4–6 digits.','danger'); return; }
    const users = getUsers();
    if (users[user]) { showNotification('Username already exists.','danger'); return; }
    users[user] = {
      username: user, displayName: name, role: role,
      pinHash: await hashString(pin),
      deviceId: null, deviceRegisteredAt: null,
      active: true, createdAt: new Date().toISOString()
    };
    saveUsers(users);
    document.getElementById('new-emp-name').value = '';
    document.getElementById('new-emp-username').value = '';
    document.getElementById('new-emp-pin').value = '';
    showNotification(`✅ Account "${name}" (${role === 'owner' ? 'Owner' : 'Employee'}) added successfully!`, 'success');
    renderUserManagement();
  } catch (err) {
    console.error('Failed to add user account:', err);
    showNotification('❌ Failed to add user account: ' + err.message, 'danger');
  }
}

function resetEmployeeDevice(username) {
  if (!confirm(`Reset device for ${username}? They must log in again from their phone.`)) return;
  const users = getUsers();
  if (!users[username]) return;
  users[username].deviceId = null;
  users[username].deviceRegisteredAt = null;
  saveUsers(users);
  showNotification(`Device reset for ${username}.`, 'info');
  renderUserManagement();
}

function toggleEmployee(username) {
  const users = getUsers();
  if (!users[username]) return;
  users[username].active = !users[username].active;
  saveUsers(users);
  renderUserManagement();
}

window._deleteTimers = {};
function deleteEmployeeAccount(username) {
  const btn = document.getElementById(`del-btn-${username}`);
  if (!btn) return;

  if (btn.dataset.confirmed === "true") {
    clearTimeout(window._deleteTimers[username]);
    delete window._deleteTimers[username];

    if (username === 'owner') {
      showNotification('⚠️ Cannot delete the primary administrator account!', 'danger');
      return;
    }
    const session = getSession();
    if (session && session.username === username) {
      showNotification('⚠️ Cannot delete the account you are currently logged in with!', 'danger');
      return;
    }

    const users = getUsers();
    if (!users[username]) return;
    delete users[username];
    saveUsers(users);
    showNotification(`Account @${username} deleted permanently.`, 'info');
    renderUserManagement();
  } else {
    btn.dataset.confirmed = "true";
    btn.innerHTML = "⚠️ Confirm Delete?";
    btn.style.background = "#ef4444";
    btn.style.color = "#fff";

    window._deleteTimers[username] = setTimeout(() => {
      btn.dataset.confirmed = "false";
      btn.innerHTML = "🗑️ Delete";
      btn.style.background = "rgba(239, 68, 68, 0.15)";
      btn.style.color = "#ef4444";
    }, 3000);
  }
}
window.deleteEmployeeAccount = deleteEmployeeAccount;

function copyEmployeeSetupLink(username) {
  const cfg = getSyncCfg();
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    showNotification('⚠️ Setup cloud sync first under Settings.', 'danger');
    return;
  }
  const token = btoa(`${cfg.supabaseUrl}|${cfg.supabaseKey}|${username}`);
  const url = `${location.origin}${location.pathname}#setup=${token}`;

  navigator.clipboard.writeText(url)
    .then(() => showNotification(`📋 Setup link for @${username} copied to clipboard! Send this to them.`, 'success'))
    .catch(() => {
      alert(`Could not copy automatically. Here is the link:\n\n${url}`);
    });
}
window.copyEmployeeSetupLink = copyEmployeeSetupLink;

async function renderPendingDeviceApprovals() {
  const container = document.getElementById('pending-device-approvals-list');
  if (!container) return;

  if (!supabaseClient) {
    container.innerHTML = '<p style="color:#ef4444;font-size:0.75rem;text-align:center;">Sync not configured or offline.</p>';
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('pending_entries')
      .select('*')
      .eq('submission_type', 'device_registration');
    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<p style="color:#64748b;font-size:0.75rem;text-align:center;padding:0.5rem;">No pending device approvals.</p>';
      return;
    }

    const users = getUsers();
    const allEmployees = Object.values(users).filter(u => u.role === 'employee');
    const unapprovedEmployees = allEmployees.filter(u => !u.deviceId);

    container.innerHTML = data.map(req => {
      const info = req.entry_data || {};
      let dropdownHtml = '';
      if (unapprovedEmployees.length === 0) {
        dropdownHtml = allEmployees.length === 0
          ? '<span style="color:#ef4444;font-size:0.72rem;">Add employee profile first</span>'
          : '<span style="color:#94a3b8;font-size:0.72rem;">All profiles approved (Reset one above)</span>';
      } else {
        dropdownHtml = `
          <select id="approve-user-select-${req.id}" style="padding:0.3rem;background:var(--bg-input);color:#fff;border:1px solid var(--border);border-radius:0.3rem;font-size:0.72rem;">
            ${unapprovedEmployees.map(u => `<option value="${u.username}">${u.displayName} (@${u.username})</option>`).join('')}
          </select>
        `;
      }

      const approveBtnHtml = unapprovedEmployees.length === 0
        ? ''
        : `<button onclick="approveDeviceFromRequest('${req.id}', '${info.deviceId}')" style="background:#22c55e;color:#fff;border:none;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;font-weight:600;">Approve</button>`;

      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem;background:#0f1117;border-radius:0.4rem;gap:0.5rem;flex-wrap:wrap;border:1px solid #334155;">
          <div>
            <span style="font-weight:700;color:#f8fafc;font-size:0.78rem;">${info.name || req.submitted_by_name}</span>
            <span style="color:#64748b;font-size:0.72rem;">(${info.phone || 'No phone'})</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.4rem;">
            ${dropdownHtml}
            ${approveBtnHtml}
            <button onclick="rejectDeviceRequest('${req.id}')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">Reject</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:#ef4444;font-size:0.75rem;text-align:center;">Failed to load: ${err.message || err}</p>`;
  }
}
window.renderPendingDeviceApprovals = renderPendingDeviceApprovals;

async function approveDeviceFromRequest(reqId, deviceId) {
  const selectEl = document.getElementById(`approve-user-select-${reqId}`);
  if (!selectEl) return;
  const username = selectEl.value;
  if (!username) return;

  if (!confirm(`Are you sure you want to approve this device for employee @${username}?`)) {
    return;
  }

  try {
    const users = getUsers();
    if (!users[username]) {
      showNotification('Username not found.', 'danger');
      return;
    }

    users[username].deviceId = deviceId;
    users[username].deviceRegisteredAt = new Date().toISOString();

    // 1. Delete request in Supabase
    const { error: delErr } = await supabaseClient.from('pending_entries').delete().eq('id', reqId);
    if (delErr) throw delErr;

    // 2. Save users (which pushes to cloud app_state)
    saveUsers(users);

    showNotification('Device approved successfully!', 'success');
    renderUserManagement();
    renderPendingDeviceApprovals();
  } catch (err) {
    console.error(err);
    showNotification('Error approving device. Try again.', 'danger');
  }
}
window.approveDeviceFromRequest = approveDeviceFromRequest;

async function rejectDeviceRequest(reqId) {
  if (!confirm('Are you sure you want to reject and delete this request?')) {
    return;
  }

  try {
    const { error } = await supabaseClient.from('pending_entries').delete().eq('id', reqId);
    if (error) throw error;

    showNotification('Request rejected.', 'info');
    renderPendingDeviceApprovals();
  } catch (err) {
    console.error(err);
    showNotification('Error rejecting request.', 'danger');
  }
}
window.rejectDeviceRequest = rejectDeviceRequest;

// Device Registration Helpers for Employee Form
function showDeviceRequestForm(event) {
  if (event) event.preventDefault();
  const loginForm = document.getElementById('login-form');
  const reqForm = document.getElementById('device-request-form');
  const successPanel = document.getElementById('registration-success-panel');
  const hintEl = document.getElementById('owner-login-hint');

  if (loginForm) loginForm.style.display = 'none';
  if (successPanel) successPanel.style.display = 'none';
  if (reqForm) reqForm.style.display = 'flex';
  if (hintEl) hintEl.style.display = 'none';

  // Pre-fill generated Device ID
  const devIdEl = document.getElementById('req-emp-device-id');
  if (devIdEl) devIdEl.value = getDeviceId();
}
window.showDeviceRequestForm = showDeviceRequestForm;

function showLoginForm(event) {
  if (event) event.preventDefault();
  const loginForm = document.getElementById('login-form');
  const reqForm = document.getElementById('device-request-form');
  const successPanel = document.getElementById('registration-success-panel');
  const hintEl = document.getElementById('owner-login-hint');

  if (reqForm) reqForm.style.display = 'none';
  if (successPanel) successPanel.style.display = 'none';
  if (loginForm) loginForm.style.display = 'flex';
  if (hintEl) hintEl.style.display = 'block';
}
window.showLoginForm = showLoginForm;

// Wire up the submit handler for the device request form
window.addEventListener('DOMContentLoaded', () => {
  const reqForm = document.getElementById('device-request-form');
  if (reqForm) {
    reqForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('req-emp-name').value.trim();
      const username = document.getElementById('req-emp-username').value.trim().toLowerCase().replace(/\s+/g,'');
      const phone = document.getElementById('req-emp-phone').value.trim();
      const deviceId = getDeviceId();

      if (!name || !username) {
        showNotification('⚠️ Name and Username are required.', 'danger');
        return;
      }

      const submitBtn = reqForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting request...';
      }

      if (!supabaseClient) initSupabaseClient();
      if (!supabaseClient) {
        showNotification('❌ Cloud connection not ready. Try again.', 'danger');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Request Device Approval'; }
        return;
      }

      try {
        const payload = {
          id: 'dev_req_' + deviceId + '_' + Date.now(),
          submitted_by: username,
          submitted_by_name: name,
          submitted_at: new Date().toISOString(),
          submission_type: 'device_registration',
          status: 'pending',
          entry_data: { name, username, phone, deviceId }
        };

        const { error } = await supabaseClient.from('pending_entries').insert([payload]);
        if (error) throw error;

        reqForm.style.display = 'none';
        const successPanel = document.getElementById('registration-success-panel');
        if (successPanel) {
          successPanel.style.display = 'flex';
          successPanel.innerHTML = `
            <div style="text-align:center; padding: 2rem; color: #fff; width: 100%;">
              <h3 style="color:#22c55e; margin-bottom:1rem;">✅ Request Submitted!</h3>
              <p style="color:var(--text-dim); font-size:0.85rem; line-height:1.5; margin-bottom: 1.5rem;">
                Your device access request for <b>${name} (@${username})</b> has been submitted to the database.
                <br><br>
                Please ask the owner to click <b>Approve</b> under settings. Once approved, you can refresh this page and log in.
              </p>
              <button onclick="location.reload()" class="btn btn-primary" style="width: 100%;">🔄 Refresh &amp; Try Login</button>
            </div>
          `;
        }
      } catch (err) {
        console.error(err);
        showNotification('❌ Submission failed. Check connection.', 'danger');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Request Device Approval'; }
      }
    });
  }
});


