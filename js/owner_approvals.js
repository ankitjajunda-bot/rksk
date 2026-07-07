var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
function calculateNozzleSale(nozzleData, shift) {
  if (!nozzleData) return 0;
  const openML = MathEngine.toML(nozzleData.open || 0);
  const closeML = MathEngine.toML(shift === "day" ? nozzleData.close_day || 0 : nozzleData.close_night || 0);
  let tests = 0;
  if (shift === "day") {
    tests = (closeML > openML) ? (nozzleData.tests_day ?? 1) : 0;
  } else {
    const dayCloseML = MathEngine.toML(nozzleData.close_day || 0);
    tests = (closeML > dayCloseML) ? (nozzleData.tests_night ?? 0) : 0;
  }
  return MathEngine.toLiters(MathEngine.calculateSalesML(openML, closeML, tests));
}
function getPendingGroupLabel(year, month, groupSuffix) {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthName = months[parseInt(month) - 1] || "Month";
  if (groupSuffix === "01_10") {
    return `${monthName} ${year} \xB7 1st to 10th`;
  } else if (groupSuffix === "11_20") {
    return `${monthName} ${year} \xB7 11th to 20th`;
  } else {
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    return `${monthName} ${year} \xB7 21st to ${lastDay}th`;
  }
}
function toggleSelectAllGroup(groupId, masterCheckbox) {
  const checkboxes = document.querySelectorAll(`.bulk-select-${groupId}`);
  checkboxes.forEach((cb) => {
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
  checkboxes.forEach((cb) => {
    const entryId = cb.value;
    const entry = db.pending_entries.find((e) => e.id === entryId);
    if (entry) {
      const ed = entry.entryData;
      const shift = ed.shift;
      if (entry.submission_type === "deposit") {
        totalCash += ed.deposit_amount || 0;
      } else {
        const p1 = calculateNozzleSale(ed.du1_p, shift);
        const d1 = calculateNozzleSale(ed.du1_d, shift);
        const p2 = calculateNozzleSale(ed.du2_p, shift);
        const d2 = calculateNozzleSale(ed.du2_d, shift);
        totalPetrol += p1 + p2;
        totalDiesel += d1 + d2;
        totalCash += ed.cash_sales || 0;
        totalCard += ed.card_sales || 0;
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
    btnEl.textContent = `\u2705 Approve Selected (${checkboxes.length})`;
  }
}
function bulkApproveEntries(groupId) {
  const selector = `.bulk-select-${groupId}:checked`;
  const checkedCheckboxes = document.querySelectorAll(selector);
  if (checkedCheckboxes.length === 0) {
    showNotification("Please select at least one entry to approve.", "warning");
    return;
  }
  if (!confirm(`Are you sure you want to approve and post all ${checkedCheckboxes.length} selected shift entries?`)) {
    return;
  }
  checkedCheckboxes.forEach((cb) => {
    approveEntry(cb.value, true);
  });
  saveDB();
  showNotification(`\u2705 Successfully approved and posted ${checkedCheckboxes.length} entries.`, "success");
  renderApprovalsPanel();
}
function refreshApprovalsPanel() {
  const refreshBtn = document.getElementById("approvals-refresh-btn");
  if (refreshBtn) {
    refreshBtn.textContent = "\u{1F504} Refreshing...";
    refreshBtn.disabled = true;
  }
  pullPendingEntries().then(() => {
    buildIndexes();
    renderApprovalsPanel();
    if (refreshBtn) {
       refreshBtn.textContent = "🔄 Pull Pending Entries";
       refreshBtn.disabled = false;
    }
  }).catch(() => {
    renderApprovalsPanel();
    if (refreshBtn) {
       refreshBtn.textContent = "🔄 Pull Pending Entries";
       refreshBtn.disabled = false;
    }
  });
}
function buildLiveShiftStatus() {
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const todayEntries = (db.pending_entries || []).filter(
    (e) => {
      var _a;
      return ((_a = e.entryData) == null ? void 0 : _a.date) === todayStr;
    }
  );
  const byEmployee = {};
  todayEntries.forEach((e) => {
    const emp = e.submittedBy;
    if (!byEmployee[emp]) byEmployee[emp] = { name: e.submittedByName, entries: [] };
    byEmployee[emp].entries.push(e);
  });
  const rows = Object.values(byEmployee).map(({ name, entries }) => {
    entries.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const first = entries[0];
    const last = entries[entries.length - 1];
    const lastTime = new Date(last.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    let totalLitres = 0;
    const firstEd = first.entryData;
    const lastEd = last.entryData;
    const shift = lastEd.shift || "day";
    ["du1_p", "du1_d", "du2_p", "du2_d"].forEach((key) => {
      var _a, _b, _c, _d, _e;
      const openVal = ((_a = firstEd[key]) == null ? void 0 : _a.open) || 0;
      const closeVal = shift === "day" ? ((_b = lastEd[key]) == null ? void 0 : _b.close_day) || 0 : ((_c = lastEd[key]) == null ? void 0 : _c.close_night) || 0;
      const testVal = shift === "day" ? ((_d = lastEd[key]) == null ? void 0 : _d.tests_day) || 0 : ((_e = lastEd[key]) == null ? void 0 : _e.tests_night) || 0;
      if (closeVal > openVal) totalLitres += Math.max(0, closeVal - openVal - testVal);
    });
    const totalPP = entries.reduce((s, e) => {
      var _a;
      return s + (((_a = e.entryData) == null ? void 0 : _a.phonepe_collection) || 0);
    }, 0);
    const totalCash = entries.reduce((s, e) => {
      var _a;
      return s + (((_a = e.entryData) == null ? void 0 : _a.cash_sales) || 0);
    }, 0);
    return { name, lastTime, totalLitres, totalPP, totalCash };
  });
  return rows;
}
function renderApprovalsPanel() {
  updateApprovalsBadge();
  const container = document.getElementById("approvals-list");
  if (!container) return;
  const selectedIds = /* @__PURE__ */ new Set();
  const masterSelectState = /* @__PURE__ */ new Map();
  const existingChecks = container.querySelectorAll('input[type="checkbox"].bulk-select-group');
  existingChecks.forEach((cb) => {
    if (cb.checked) selectedIds.add(cb.value);
  });
  container.querySelectorAll('input[type="checkbox"][id^="master-select-"]').forEach((cb) => {
    if (cb.checked) masterSelectState.set(cb.id, true);
  });
  const refreshBtn = document.getElementById("approvals-refresh-btn");
  if (refreshBtn) {
    refreshBtn.textContent = "\u{1F504} Refresh Now";
    refreshBtn.disabled = false;
  }
  const pending = (db.pending_entries || []).filter((e) => ["pending", "queued", "syncing", "pending_approval"].includes(e.status) && e.entryData && e.entryData.date);
  const reviewed = (db.pending_entries || []).filter((e) => !["pending", "queued", "syncing", "pending_approval"].includes(e.status) && e.entryData && e.entryData.date).sort((a, b) => (b.reviewedAt || "").localeCompare(a.reviewedAt || "")).slice(0, 20);
  
  if (pending.length === 0 && reviewed.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#64748b;padding:3rem;font-size:1rem;">No submissions yet. Employees submit readings from their phones.</div>';
    return;
  }
  let html = "";
  const groups = {};
  pending.forEach((entry) => {
    const ed = entry.entryData;
    const dateParts = ed.date.split("-");
    if (dateParts.length < 3) return;
    const year = dateParts[0];
    const month = dateParts[1];
    const day = parseInt(dateParts[2]);
    let groupSuffix = "21_End";
    if (day <= 10) {
      groupSuffix = "01_10";
    } else if (day <= 20) {
      groupSuffix = "11_20";
    }
    const key = `${year}-${month}-${groupSuffix}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(entry);
  });
  const sortedGroupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  if (pending.length > 0) {
    html += '<h3 style="font-weight:800;color:#f8fafc;font-size:1.1rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">\u23F3 Pending Approvals</h3>';
    sortedGroupKeys.forEach((groupId) => {
      const entries = groups[groupId];
      entries.sort((a, b) => {
        const dateDiff = a.entryData.date.localeCompare(b.entryData.date);
        if (dateDiff !== 0) return dateDiff;
        if (a.entryData.shift === b.entryData.shift) return 0;
        return a.entryData.shift === "day" ? -1 : 1;
      });
      const keyParts = groupId.split("-");
      const groupLabel = getPendingGroupLabel(keyParts[0], keyParts[1], keyParts[2]);
      html += `
        <div class="panel" style="margin-bottom:1.5rem; border:1px solid #475569; background:rgba(30,41,59,0.4); padding:1rem; border-radius:1rem;">
          <!-- Group Header -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; border-bottom:1px solid #334155; padding-bottom:0.75rem; margin-bottom:1rem;">
            <div>
              <h4 style="font-weight:800; color:#fff; font-size:1rem; margin:0;">\u{1F4C5} ${groupLabel}</h4>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.15rem;">Contains ${entries.length} pending submissions</div>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button id="group-btn-approve-${groupId}" onclick="bulkApproveEntries('${groupId}')" style="background:#22c55e; color:#fff; border:none; border-radius:0.5rem; padding:0.5rem 1rem; font-size:0.8rem; font-weight:700; cursor:pointer;" disabled>\u2705 Approve Selected (0)</button>
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
              <div style="text-align:center;"><div style="font-size:0.62rem; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Collections</div><strong style="font-size:1rem; color:#22c55e;" id="group-calc-collections-${groupId}">\u20B9 0.00</strong></div>
            </div>
          </div>

          <!-- Master Control -->
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; padding-left:0.5rem;">
            <input type="checkbox" id="master-select-${groupId}" onchange="toggleSelectAllGroup('${groupId}', this)" style="transform: scale(1.2); cursor:pointer;" ${masterSelectState.get(`master-select-${groupId}`) ? "checked" : ""}>
            <label for="master-select-${groupId}" style="font-size:0.8rem; color:#94a3b8; font-weight:700; cursor:pointer; user-select:none;">Select All Group Entries</label>
          </div>

          <!-- Entries List -->
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            ${entries.map((entry) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B;
        const ed = entry.entryData;
        const shift = ed.shift;
        if (entry.submission_type === "deposit") {
          const depositAmount = ed.deposit_amount || 0;
          return `
                  <div style="background:#0f111a; border:1px solid #22c55e; border-left: 3px solid #22c55e; border-radius:0.75rem; padding:1rem; display:flex; gap:0.75rem;">
                    <!-- Checkbox Column -->
                    <div style="display:flex; align-items:flex-start; padding-top:0.25rem;">
                      <input type="checkbox" class="bulk-select-${groupId} bulk-select-group" value="${entry.id}" onchange="updateGroupCalculations('${groupId}')" style="transform: scale(1.15); cursor:pointer;" ${selectedIds.has(entry.id) ? "checked" : ""}>
                    </div>

                    <!-- Details Column -->
                    <div style="flex:1; display:flex; flex-direction:column; gap:0.6rem;">
                      <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.25rem;">
                        <div>
                          <strong style="font-size:0.88rem; color:#fff;">${ed.date} \xB7 ${shift === "day" ? "\u2600\uFE0F Day Shift" : "\u{1F319} Night Shift"}</strong>
                          <span style="font-size:0.72rem; color:#64748b; margin-left:0.5rem;">by ${RKSKSchema.escapeHtml(entry.submittedByName)}</span>
                          <span style="font-size:0.68rem; background:rgba(34,197,94,0.15); color:#86efac; border:1px solid rgba(34,197,94,0.3); border-radius:3px; padding:0.05rem 0.3rem; margin-left:0.25rem;">\u{1F4B0} Cash Deposit</span>
                        </div>
                        <span style="font-size:0.7rem; color:#94a3b8; font-family:monospace;">${entry.submittedAt.replace("T", " ").slice(11, 16)}</span>
                      </div>

                      <div style="background:rgba(34,197,94,0.05); border:1px dashed rgba(34,197,94,0.3); border-radius:0.5rem; padding:0.75rem; display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-size:0.85rem; color:#94a3b8; font-weight:600;">Office Cash Deposited</span>
                        <strong style="font-size:1.2rem; color:#22c55e;">\u20B9 ${depositAmount.toLocaleString("en-IN")}</strong>
                      </div>

                      ${ed.remarks ? `<div style="font-size:0.75rem; color:#94a3b8; background:rgba(255,255,255,0.02); border-left:2px solid #22c55e; padding:0.35rem 0.6rem; border-radius:4px;">\u{1F4DD} <strong style="color:#f8fafc;">Note:</strong> ${RKSKSchema.escapeHtml(ed.remarks)}</div>` : ""}

                      <!-- Actions -->
                      <div style="display:flex; gap:0.5rem; justify-content:flex-end; flex-wrap:wrap; margin-top:0.25rem;">
                        <button onclick="approveEntry('${entry.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">\u2705 Approve & Credit Cash</button>
                        <button onclick="promptRejectEntry('${entry.id}')" style="background:#ef4444; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">\u274C Reject</button>
                      </div>
                    </div>
                  </div>
                `;
        }
        const du1_p_open = ((_a = ed.du1_p) == null ? void 0 : _a.open) || 0;
        const du1_p_close = shift === "day" ? ((_b = ed.du1_p) == null ? void 0 : _b.close_day) || 0 : ((_c = ed.du1_p) == null ? void 0 : _c.close_night) || 0;
        const du1_p_tests = shift === "day" ? ((_d = ed.du1_p) == null ? void 0 : _d.tests_day) || 0 : ((_e = ed.du1_p) == null ? void 0 : _e.tests_night) || 0;
        const du1_p_sale = calculateNozzleSale(ed.du1_p, shift);
        const du1_d_open = ((_f = ed.du1_d) == null ? void 0 : _f.open) || 0;
        const du1_d_close = shift === "day" ? ((_g = ed.du1_d) == null ? void 0 : _g.close_day) || 0 : ((_h = ed.du1_d) == null ? void 0 : _h.close_night) || 0;
        const du1_d_tests = shift === "day" ? ((_i = ed.du1_d) == null ? void 0 : _i.tests_day) || 0 : ((_j = ed.du1_d) == null ? void 0 : _j.tests_night) || 0;
        const du1_d_sale = calculateNozzleSale(ed.du1_d, shift);
        const du2_p_open = ((_k = ed.du2_p) == null ? void 0 : _k.open) || 0;
        const du2_p_close = shift === "day" ? ((_l = ed.du2_p) == null ? void 0 : _l.close_day) || 0 : ((_m = ed.du2_p) == null ? void 0 : _m.close_night) || 0;
        const du2_p_tests = shift === "day" ? ((_n = ed.du2_p) == null ? void 0 : _n.tests_day) || 0 : ((_o = ed.du2_p) == null ? void 0 : _o.tests_night) || 0;
        const du2_p_sale = calculateNozzleSale(ed.du2_p, shift);
        const du2_d_open = ((_p = ed.du2_d) == null ? void 0 : _p.open) || 0;
        const du2_d_close = shift === "day" ? ((_q = ed.du2_d) == null ? void 0 : _q.close_day) || 0 : ((_r = ed.du2_d) == null ? void 0 : _r.close_night) || 0;
        const du2_d_tests = shift === "day" ? ((_s = ed.du2_d) == null ? void 0 : _s.tests_day) || 0 : ((_t = ed.du2_d) == null ? void 0 : _t.tests_night) || 0;
        const du2_d_sale = calculateNozzleSale(ed.du2_d, shift);
        const ppOpen = ed.phonepe_opening || 0;
        const ppMid = ed.phonepe_midnight || 0;
        const ppClose = ed.phonepe_closing || 0;
        const ppColl = ed.phonepe_collection || 0;
        const ppFormula = shift === "night" && ppMid > 0 ? `(\u20B9${ppMid.toLocaleString("en-IN")}\u2212\u20B9${ppOpen.toLocaleString("en-IN")})+\u20B9${ppClose.toLocaleString("en-IN")}` : `\u20B9${ppClose.toLocaleString("en-IN")}\u2212\u20B9${ppOpen.toLocaleString("en-IN")}`;
        const prices = getPricesAt(ed.date);
        const p_price_1 = ((_u = ed.manual_prices) == null ? void 0 : _u.du1p) || prices.petrol;
        const p_price_2 = ((_v = ed.manual_prices) == null ? void 0 : _v.du2p) || prices.petrol;
        const d_price_1 = ((_w = ed.manual_prices) == null ? void 0 : _w.du1d) || prices.diesel;
        const d_price_2 = ((_x = ed.manual_prices) == null ? void 0 : _x.du2d) || prices.diesel;
        const estimatedRevenue = du1_p_sale * p_price_1 + du2_p_sale * p_price_2 + du1_d_sale * d_price_1 + du2_d_sale * d_price_2;
        const expectedCash = Math.max(0, estimatedRevenue - (ed.card_sales || 0) - ppColl);
        const variance = (ed.cash_sales || 0) - expectedCash;
        const varianceColor = variance < -100 ? "rgba(239, 68, 68, 0.4)" : variance > 100 ? "rgba(59, 130, 246, 0.4)" : "rgba(255,255,255,0.05)";
        const varianceTextColor = variance < -100 ? "#ef4444" : variance > 100 ? "#60a5fa" : "#22c55e";
        const varianceSign = variance > 0 ? "+" : "";
        const typeLabel = entry.submission_type === "opening" ? "\u{1F305} Opening" : entry.submission_type === "snapshot" ? "\u{1F4F8} Snapshot" : "\u{1F3C1} Closing";
        const isSnapshot = entry.submission_type === "snapshot";

        const exp_du1_p = getNozzleOpeningReading("du1_p", ed.date, shift);
        const exp_du1_d = getNozzleOpeningReading("du1_d", ed.date, shift);
        const exp_du2_p = getNozzleOpeningReading("du2_p", ed.date, shift);
        const exp_du2_d = getNozzleOpeningReading("du2_d", ed.date, shift);

        const hasGap_du1_p = Math.abs(du1_p_open - exp_du1_p) > 0.01 && (du1_p_open > 0 || exp_du1_p > 0);
        const hasGap_du1_d = Math.abs(du1_d_open - exp_du1_d) > 0.01 && (du1_d_open > 0 || exp_du1_d > 0);
        const hasGap_du2_p = Math.abs(du2_p_open - exp_du2_p) > 0.01 && (du2_p_open > 0 || exp_du2_p > 0);
        const hasGap_du2_d = Math.abs(du2_d_open - exp_du2_d) > 0.01 && (du2_d_open > 0 || exp_du2_d > 0);

        return `
                <div style="background:#0f111a; border:1px solid ${isSnapshot ? "#1d4ed8" : "#1e293b"}; border-left: 3px solid ${isSnapshot ? "#3b82f6" : "#334155"}; border-radius:0.75rem; padding:1rem; display:flex; gap:0.75rem;">
                  <!-- Checkbox Column -->
                  <div style="display:flex; align-items:flex-start; padding-top:0.25rem;">
                      <input type="checkbox" class="bulk-select-${groupId} bulk-select-group" value="${entry.id}" onchange="updateGroupCalculations('${groupId}')" style="transform: scale(1.15); cursor:pointer;" ${selectedIds.has(entry.id) ? "checked" : ""}>

                  <!-- Details Column -->
                  <div style="flex:1; display:flex; flex-direction:column; gap:0.5rem;">
                    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.25rem;">
                      <div>
                        <strong style="font-size:0.88rem; color:#fff;">${ed.date} \xB7 ${shift === "day" ? "\u2600\uFE0F Day Shift" : "\u{1F319} Night Shift"}</strong>
                        <span style="font-size:0.72rem; color:#64748b; margin-left:0.5rem;">by ${RKSKSchema.escapeHtml(entry.submittedByName)}</span>
                        <span style="font-size:0.68rem; background:rgba(59,130,246,0.15); color:#93c5fd; border:1px solid rgba(59,130,246,0.3); border-radius:3px; padding:0.05rem 0.3rem; margin-left:0.25rem;">${typeLabel}</span>
                      </div>
                      <span style="font-size:0.7rem; color:#94a3b8; font-family:monospace;">${entry.submittedAt.replace("T", " ").slice(11, 16)}</span>
                    </div>

                    <!-- Quarantine Alert -->
                    ${(entry.flagged_for_quarantine || entry.entryData?.flagged_for_quarantine) ? `
                      <div style="background:rgba(239, 68, 68, 0.1); border-left:4px solid #ef4444; padding:0.75rem; margin-bottom:0.5rem; border-radius:4px;">
                        <strong style="color:#fca5a5; font-size:0.85rem;">⚠️ QUARANTINED (DAILY SAFETY NET)</strong>
                        <ul style="color:#ef4444; font-size:0.75rem; margin:0.25rem 0 0 1rem; padding:0;">
                          ${(entry.quarantine_reasons || entry.entryData?.quarantine_reasons || []).map(r => `<li>${r}</li>`).join('')}
                        </ul>
                      </div>
                    ` : ''}

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
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#ef4444;">&#9679;</span> DU1-P (E2) ${((_y = ed.du1_p) == null ? void 0 : _y.is_reset) ? '<span style="font-size:0.6rem; background:rgba(239,68,68,0.2); color:#fca5a5; padding:0.1rem 0.3rem; border-radius:3px; margin-left:4px;">&#9888;&#65039; RESET</span>' : ""}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du1_p_open.toFixed(2)}${hasGap_du1_p ? ` <span style="color:#f43f5e; font-weight:bold; cursor:help;" title="Continuity Break! Expected: ${exp_du1_p.toFixed(2)}">⚠️</span>` : ''}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du1_p_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du1_p_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du1_p_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#eab308;">&#9679;</span> DU1-D (HSD) ${((_z = ed.du1_d) == null ? void 0 : _z.is_reset) ? '<span style="font-size:0.6rem; background:rgba(239,68,68,0.2); color:#fca5a5; padding:0.1rem 0.3rem; border-radius:3px; margin-left:4px;">&#9888;&#65039; RESET</span>' : ""}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du1_d_open.toFixed(2)}${hasGap_du1_d ? ` <span style="color:#f43f5e; font-weight:bold; cursor:help;" title="Continuity Break! Expected: ${exp_du1_d.toFixed(2)}">⚠️</span>` : ''}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du1_d_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du1_d_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du1_d_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.02); color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#ef4444;">&#9679;</span> DU2-P (E2) ${((_A = ed.du2_p) == null ? void 0 : _A.is_reset) ? '<span style="font-size:0.6rem; background:rgba(239,68,68,0.2); color:#fca5a5; padding:0.1rem 0.3rem; border-radius:3px; margin-left:4px;">&#9888;&#65039; RESET</span>' : ""}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du2_p_open.toFixed(2)}${hasGap_du2_p ? ` <span style="color:#f43f5e; font-weight:bold; cursor:help;" title="Continuity Break! Expected: ${exp_du2_p.toFixed(2)}">⚠️</span>` : ''}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right;">${du2_p_close.toFixed(2)}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#64748b;">${du2_p_tests} L</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; font-weight:700; color:#fff;">${du2_p_sale.toFixed(2)} L</td>
                        </tr>
                        <tr style="color:#e2e8f0;">
                          <td style="padding:0.3rem 0.5rem;"><span style="color:#eab308;">&#9679;</span> DU2-D (HSD) ${((_B = ed.du2_d) == null ? void 0 : _B.is_reset) ? '<span style="font-size:0.6rem; background:rgba(239,68,68,0.2); color:#fca5a5; padding:0.1rem 0.3rem; border-radius:3px; margin-left:4px;">&#9888;&#65039; RESET</span>' : ""}</td>
                          <td style="padding:0.3rem 0.5rem; text-align:right; color:#94a3b8;">${du2_d_open.toFixed(2)}${hasGap_du2_d ? ` <span style="color:#f43f5e; font-weight:bold; cursor:help;" title="Continuity Break! Expected: ${exp_du2_d.toFixed(2)}">⚠️</span>` : ''}</td>
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
                        <div style="font-weight:700; color:#f8fafc; font-size:0.78rem;">${formatCurrency(ed.cash_sales || 0)}</div>
                      </div>
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center;">
                        <div style="font-size:0.6rem; color:#64748b;">PhonePe (\u0394)</div>
                        <div style="font-weight:700; color:#38bdf8; font-size:0.78rem;">${formatCurrency(ppColl)}</div>
                      </div>
                      <div style="background:#090a10; border-radius:0.4rem; padding:0.4rem; text-align:center; border:1px solid ${varianceColor};">
                        <div style="font-size:0.6rem; color:#64748b;">Variance</div>
                        <div style="font-weight:700; color:${varianceTextColor}; font-size:0.78rem;">${varianceSign}${formatCurrency(variance)}</div>
                      </div>
                    </div>

                    ${ppColl > 0 || ppOpen > 0 ? `
                    <div style="font-size:0.72rem;color:#64748b;background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.1);border-radius:4px;padding:0.3rem 0.5rem;">
                      \u{1F4F1} PhonePe: ${ppFormula} = <strong style="color:#38bdf8;">\u20B9${ppColl.toLocaleString("en-IN")}</strong>
                      ${ed.manual_prices ? ' <span style="color:#f97316;font-size:0.65rem;">\u26A0\uFE0F Manual prices used</span>' : ""}
                    </div>` : ""}

                    ${function() {
          var _a2;
          const ledgerDay = db.master_ledger.find((r) => r.date === ed.date);
          const depositsApproved = (((_a2 = ledgerDay == null ? void 0 : ledgerDay.recon) == null ? void 0 : _a2.deposits) || []).reduce((sum, d) => sum + d.amount, 0);
          if (depositsApproved > 0) {
            return `
                          <div style="font-size:0.72rem;color:#22c55e;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.1);border-radius:4px;padding:0.35rem 0.5rem;margin-top:0.25rem;">
                            \u{1F4B0} Approved Office Deposits today: <strong style="color:#86efac;">\u20B9${depositsApproved.toLocaleString("en-IN")}</strong>
                          </div>
                        `;
          }
          return "";
        }()}

                    ${ed.remarks ? `<div style="font-size:0.75rem; color:#94a3b8; background:rgba(255,255,255,0.02); border-left:2px solid var(--primary); padding:0.35rem 0.6rem; border-radius:4px;">\u{1F4DD} <strong style="color:#f8fafc;">Note:</strong> ${RKSKSchema.escapeHtml(ed.remarks)}</div>` : ""}

                    ${ed.photo ? `<div style="margin-top:0.25rem;">
                      <div style="font-size:0.72rem; color:#94a3b8; margin-bottom:0.25rem;">\u{1F4F7} <strong>Attached Reading Photo:</strong></div>
                      <img src="${ed.photo}" alt="Reading slip photo" style="max-width:100%; max-height:300px; border-radius:0.5rem; border:1px solid #334155; cursor:pointer;" onclick="window.open(this.src, '_blank')">
                    </div>` : ""}

                    <!-- Actions -->
                    <div style="display:flex; gap:0.5rem; justify-content:flex-end; flex-wrap:wrap; margin-top:0.25rem;">
                      ${isSnapshot ? `<button onclick="approveEntry(event, '${entry.id}')" style="background:#3b82f6; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">\u{1F4CA} Post to Ledger</button>` : `<button onclick="approveEntry(event, '${entry.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">\u2705 Approve</button>`}
                      <button onclick="promptRejectEntry(event, '${entry.id}')" style="background:#ef4444; color:#fff; border:none; border-radius:0.4rem; padding:0.4rem 0.8rem; font-size:0.75rem; font-weight:700; cursor:pointer;">\u274C Reject</button>
                    </div>
                  </div>
                </div>
              `;
      }).join("")}
          </div>
        </div>
      `;
    });
  }
  if (reviewed.length > 0) {
    html += '<h3 style="font-weight:800;color:#64748b;font-size:1.1rem;margin-top:2rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">\u{1F4DC} Recently Reviewed (History)</h3>';
    reviewed.forEach((entry) => {
      const isApproved = entry.status === "approved";
      const sc = isApproved ? "#22c55e" : "#ef4444";
      const ed = entry.entryData;
      html += `
        <div style="background:#1e293b; border:1px solid #334155; border-left:3px solid ${sc}; border-radius:0.75rem; padding:1rem; margin-bottom:0.75rem; opacity:0.85;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.25rem;">
            <div>
              <strong style="font-size:0.85rem; color:#f8fafc;">${ed.date} \xB7 ${ed.shift === "day" ? "\u2600\uFE0F Day" : "\u{1F319} Night"}</strong>
              <span style="font-size:0.7rem; color:#94a3b8; margin-left:0.5rem;">by ${RKSKSchema.escapeHtml(entry.submittedByName)}</span>
            </div>
            <span style="font-size:0.7rem; color:${sc}; font-weight:700; text-transform:uppercase; padding:0.1rem 0.4rem; background:rgba(0,0,0,0.3); border-radius:4px;">
              ${entry.status}
            </span>
          </div>
          <div style="font-size:0.72rem; color:#64748b; margin-top:0.25rem; display:flex; justify-content:space-between;">
            <span>Reviewed at: ${entry.reviewedAt ? entry.reviewedAt.replace("T", " ").slice(0, 16) : "N/A"} by ${entry.reviewedBy || "N/A"}</span>
            <span>Cash: ${formatCurrency(ed.cash_sales || 0)} \xB7 Card: ${formatCurrency(ed.card_sales || 0)}</span>
          </div>
          ${entry.status === "rejected" && entry.rejectionReason ? `<div style="margin-top:0.4rem; padding:0.4rem; background:rgba(239,68,68,0.08); border-radius:4px; color:#fca5a5; font-size:0.75rem;">Reason: ${RKSKSchema.escapeHtml(entry.rejectionReason)}</div>` : ""}
        </div>
      `;
    });
  }
  container.innerHTML = html;
}
function approveEntry(event, entryId, skipRender = false) {
  const session = getSession();
  if (!session || session.role !== "owner") return;
  const idx = (db.pending_entries || []).findIndex((e) => e.id === entryId);
  if (idx === -1) return;
  const entry = db.pending_entries[idx];
  if (entry.status === "approved" || entry.status === "rejected") return;

  const btn = event && event.currentTarget ? event.currentTarget : null;
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = `<span style="opacity:0.7">Processing...</span>`;
  }

  const ed = entry.entryData;
  let row = db.master_ledger.find((r) => r.date === ed.date);
  let oldNetP = 0;
  let oldNetD = 0;
  if (row) {
    row._dirty = true;
    if (entry.submission_type !== "deposit") {
      try {
        const oldCalc = computeLedgerRow(row);
        oldNetP = oldCalc.totals.net_24h.petrol || 0;
        oldNetD = oldCalc.totals.net_24h.diesel || 0;
      } catch (err) {
        console.warn("[Approval] Failed to compute old ledger row sales: ", err);
      }
    }
  } else {
    const activePrices = getPricesAt(ed.date);
    row = {
      date: ed.date,
      prices: { petrol: activePrices.petrol, diesel: activePrices.diesel },
      du1_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du1_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du2_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      du2_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
      recon: { cash: 0, phonepe: 0, credit: 0, total_collection: 0, remarks: "" },
      _dirty: true
    };
    db.master_ledger.push(row);
  }
  if (entry.submission_type === "deposit") {
    row.recon.cash = (row.recon.cash || 0) + (ed.deposit_amount || 0);
    row.recon.total_collection = (row.recon.cash || 0) + (row.recon.phonepe || 0) + (row.recon.credit || 0);
    if (!db.cashflow) db.cashflow = { bank_balance: 0, phonepe_balance: 0, cash_drawer: 0, iocl_cushion: 0 };
    db.cashflow.cash_drawer = Math.max(0, (db.cashflow.cash_drawer || 0) - (ed.deposit_amount || 0));
    db.cashflow.bank_balance = (db.cashflow.bank_balance || 0) + (ed.deposit_amount || 0);
    if (!row.recon.deposits) row.recon.deposits = [];
    row.recon.deposits.push({
      id: entry.id,
      submitted_by: entry.submittedBy,
      submitted_by_name: entry.submittedByName,
      submitted_at: entry.submittedAt,
      amount: ed.deposit_amount,
      remarks: ed.remarks || ""
    });
    if (ed.remarks) {
      row.recon.remarks = row.recon.remarks ? `${row.recon.remarks} | Deposit: ${ed.remarks}` : `Deposit: ${ed.remarks}`;
    }
  } else {
    for (const nozzle of ["du1_p", "du1_d", "du2_p", "du2_d"]) {
      const o = ed[nozzle].open || 0;
      const c = ed.shift === "day" ? ed[nozzle].close_day || 0 : ed[nozzle].close_night || 0;
      if (c > 0 && o > 0 && c < o) {
        if (!ed[nozzle].is_reset) {
          SystemLogger.error("Approval Validation", `Rollback detected in ${nozzle}. Closing reading (${c}) is less than Opening reading (${o}). Overwrite aborted.`);
          alert(`Cannot approve: Meter rollback detected in ${nozzle}. This is not an authorized reset.`);
          return;
        } else {
          SystemLogger.warning("Approval Validation", `Owner authorized meter reset for ${nozzle} from ${o} to ${c}`);
        }
      }
    }
    if (ed.shift === "day") {
      for (const nozzle of ["du1_p", "du1_d", "du2_p", "du2_d"]) {
        row[nozzle].open = ed[nozzle].open || 0;
        row[nozzle].close_day = ed[nozzle].close_day || 0;
        row[nozzle].tests_day = ed[nozzle].tests_day || 0;
        if (!row[nozzle].close_night || row[nozzle].close_night === 0) {
          row[nozzle].close_night = ed[nozzle].close_day || 0;
        }
      }
    } else {
      for (const nozzle of ["du1_p", "du1_d", "du2_p", "du2_d"]) {
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
    row.recon.cash = (row.recon.cash || 0) + (ed.cash_sales || 0);
    row.recon.card = (row.recon.card || 0) + (ed.card_sales || 0);
    row.recon.phonepe = (row.recon.phonepe || 0) + (ed.phonepe_collection || 0);
    row.recon.total_collection = row.recon.cash + row.recon.card + row.recon.phonepe + (row.recon.credit || 0);
    if (!db.cashflow) db.cashflow = { bank_balance: 0, phonepe_balance: 0, cash_drawer: 0, iocl_cushion: 0 };
    db.cashflow.cash_drawer = (db.cashflow.cash_drawer || 0) + (ed.cash_sales || 0);
    db.cashflow.phonepe_balance = (db.cashflow.phonepe_balance || 0) + (ed.phonepe_collection || 0);
    if (ed.manual_prices) {
      if (!row.prices) row.prices = { petrol: 0, diesel: 0 };
      if (ed.manual_prices.du1p) row.prices.petrol = ed.manual_prices.du1p;
      else if (ed.manual_prices.du2p) row.prices.petrol = ed.manual_prices.du2p;
      if (ed.manual_prices.du1d) row.prices.diesel = ed.manual_prices.du1d;
      else if (ed.manual_prices.du2d) row.prices.diesel = ed.manual_prices.du2d;
    }
    if (ed.remarks) {
      row.recon.remarks = row.recon.remarks ? `${row.recon.remarks} | ${ed.remarks}` : ed.remarks;
    }
  }
  row._approved_by = session.username;
  row._approved_at = (/* @__PURE__ */ new Date()).toISOString();
  row._submitted_by = entry.submittedBy;
  if (entry.submission_type !== "deposit") {
    try {
      const newCalc = computeLedgerRow(row);
      const newNetP = newCalc.totals.net_24h.petrol || 0;
      const newNetD = newCalc.totals.net_24h.diesel || 0;
      db.stock.petrol = Math.max(0, db.stock.petrol + oldNetP - newNetP);
      db.stock.diesel = Math.max(0, db.stock.diesel + oldNetD - newNetD);
    } catch (err) {
      console.error("[Approval] Error recalculating stock metrics: ", err);
    }
  }
  db.master_ledger.sort((a, b) => b.date.localeCompare(a.date));
  db.pending_entries[idx].status = "approved";
  db.pending_entries[idx].reviewedBy = session.username;
  db.pending_entries[idx].reviewedAt = (/* @__PURE__ */ new Date()).toISOString();
  db.pending_entries[idx]._dirty = true;
  window.logAuditTrail("SHIFT_APPROVAL", "", JSON.stringify(db.pending_entries[idx]), `Approved shift entry ${entryId}`);
  window.markAppStateDirty("stock");
  window.markAppStateDirty("cashflow");
  if (!skipRender) {
    saveDB(true);
    const successMsg = entry.submission_type === "deposit" ? `\u2705 Cash Deposit of \u20B9${ed.deposit_amount.toLocaleString("en-IN")} approved and credited to the daily ledger!` : `\u2705 Entry for ${ed.date} approved and merged into Daily Production Ledger. Synced to cloud Supabase! View on Sales Cumulative Sheet.`;
    showNotification(successMsg, "success");
    renderApprovalsPanel();
    if (typeof renderLedger === "function") {
      renderLedger();
    }
  }
}
function promptRejectEntry(event, entryId) {
  const session = getSession();
  const idx = (db.pending_entries || []).findIndex((e) => e.id === entryId);
  if (idx === -1) return;
  const entry = db.pending_entries[idx];
  if (entry.status === "approved" || entry.status === "rejected") return;

  const btn = event && event.currentTarget ? event.currentTarget : null;
  if (btn && btn.disabled) return;

  const reason = prompt("Rejection reason (employee will see this):");
  if (reason === null) return;
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="opacity:0.7">Wait...</span>`;
  }

  db.pending_entries[idx].status = "rejected";
  db.pending_entries[idx].rejectionReason = reason || "No reason given";
  db.pending_entries[idx].reviewedBy = session.username;
  db.pending_entries[idx].reviewedAt = (/* @__PURE__ */ new Date()).toISOString();
  db.pending_entries[idx]._dirty = true;
  saveDB(true);
  showNotification("Entry rejected.", "info");
  renderApprovalsPanel();
}
function generateNextEmpId(users) {
  const keys = Object.keys(users).filter(k => k.startsWith("EMP"));
  if (keys.length === 0) return "EMP0001";
  const nums = keys.map(k => parseInt(k.replace("EMP", ""), 10));
  const max = Math.max(...nums);
  return "EMP" + String(max + 1).padStart(4, "0");
}

function renderUserManagement() {
  const session = getSession();
  if (!session || session.role !== "owner") return;
  const users = getUsers();
  const ulistEl = document.getElementById("user-mgmt-list");
  if (!ulistEl) return;
  const employees = Object.values(users).filter((u) => u.role === "employee" && !u.deleted);
  ulistEl.innerHTML = employees.length === 0 ? '<p style="color:#64748b;text-align:center;padding:1rem;">No employees yet. Add one below.</p>' : employees.map((u) => {
    let syncStatusHtml = '';
    const isReady = u.syncStatus === 'verified';
    if (isReady) {
      syncStatusHtml = `<span style="font-size:0.72rem; color:#22c55e; font-weight:700;">✅ Employee Ready</span>`;
    } else if (u.syncStatus === 'uploaded') {
      syncStatusHtml = `<span style="font-size:0.72rem; color:#eab308; font-weight:700;">⏳ Account Uploaded (Verifying...)</span>`;
    } else {
      syncStatusHtml = `<span style="font-size:0.72rem; color:#f97316; font-weight:700;">⚠️ Saved Locally (Sync Pending)</span>`;
    }

    return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:#0f1117;border-radius:0.6rem;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.5rem;">
          <div>
            <span style="font-weight:700;color:#f8fafc;">${u.displayName}</span>
            <span style="color:#64748b;font-size:0.78rem;margin-left:0.5rem;">@${u.username}</span><br>
            ${syncStatusHtml}
            &middot; <span style="font-size:0.72rem;color:${u.active ? "#22c55e" : "#ef4444"}; font-weight:600;">${u.active ? "Active" : "Inactive"}</span>
          </div>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            <button onclick="toggleEmployee('${u.id}')" style="background:${u.active ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)"};color:${u.active ? "#ef4444" : "#22c55e"};border:1px solid ${u.active ? "#ef4444" : "#22c55e"};border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">${u.active ? "Deactivate" : "Activate"}</button>
            <button id="del-btn-${u.id}" onclick="deleteEmployeeAccount('${u.id}')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">🗑️ Delete</button>
          </div>
        </div>`;
  }).join("");
  
  const addBtn = document.getElementById("add-employee-btn");
  if (addBtn && !addBtn._wired) {
    addBtn._wired = true;
    addBtn.addEventListener("click", addUserAccount);
  }
  // Device approvals removed — employees log in directly with credentials.
}

function addUserAccount() {
  return __async(this, null, function* () {
    var _a, _b, _c, _d;
    try {
      const name = (_a = document.getElementById("new-emp-name")) == null ? void 0 : _a.value.trim();
      const user = (_b = document.getElementById("new-emp-username")) == null ? void 0 : _b.value.trim().toLowerCase().replace(/\s+/g, "");
      const pin = (_c = document.getElementById("new-emp-pin")) == null ? void 0 : _c.value.trim();
      const role = ((_d = document.getElementById("new-emp-role-select")) == null ? void 0 : _d.value) || "employee";
      
      if (!name || !user || !pin) {
        showNotification("Fill in all three fields.", "danger");
        return;
      }
      if (!/^\d{4,6}$/.test(pin)) {
        showNotification("PIN/Password must be 4–6 digits.", "danger");
        return;
      }
      const users = getUsers();
      const usernameExists = Object.values(users).some(u => u.username.toLowerCase() === user && !u.deleted);
      if (usernameExists) {
        showNotification("Username already exists.", "danger");
        return;
      }
      
      const newId = generateNextEmpId(users);
      const passwordHash = yield hashString(pin);
      
      users[newId] = {
        id: newId,
        username: user,
        displayName: name,
        role,
        passwordHash: passwordHash,
        deviceId: null,
        deviceRegisteredAt: null,
        active: true,
        syncStatus: 'local',
        createdAt: new Date().toISOString()
      };
      
      // Save locally & queue for sync upload
      saveUsers(users, true);
      
      document.getElementById("new-emp-name").value = "";
      document.getElementById("new-emp-username").value = "";
      document.getElementById("new-emp-pin").value = "";
      
      showNotification(`💾 Account "${name}" saved locally. Syncing to cloud...`, "info");
      renderUserManagement();
      
      // Verification phase
      if (navigator.onLine) {
        try {
          // Push local state immediately
          yield syncPush(true);
          
          // Verify by downloading from Supabase
          const pulled = yield syncPull();
          if (pulled && pulled.users && pulled.users[newId]) {
            if (pulled.users[newId].passwordHash === passwordHash) {
              // Set ready status
              const updatedUsers = getUsers();
              if (updatedUsers[newId]) {
                updatedUsers[newId].syncStatus = 'verified';
                saveUsers(updatedUsers, true);
                showNotification(`✅ Employee Ready: "${name}" is fully registered and verified on Supabase!`, "success");
              }
            }
          }
        } catch (syncErr) {
          SystemLogger.error("addUserAccount", "Cloud sync/verification error: ", syncErr);
        }
      }
      renderUserManagement();
    } catch (err) {
      console.error("Failed to add user account:", err);
      showNotification("❌ Failed to add user account: " + err.message, "danger");
    }
  });
}

function resetEmployeeDevice(id) {
  if (!confirm(`Reset device for employee? they must register their phone again.`)) return;
  const users = getUsers();
  if (!users[id]) return;
  users[id].deviceId = null;
  users[id].deviceRegisteredAt = null;
  saveUsers(users, true);
  showNotification(`Device reset successful.`, "info");
  renderUserManagement();
}

function toggleEmployee(id) {
  const users = getUsers();
  if (!users[id]) return;
  users[id].active = !users[id].active;
  saveUsers(users, true);
  renderUserManagement();
}

window._deleteTimers = {};
function deleteEmployeeAccount(id) {
  const btn = document.getElementById(`del-btn-${id}`);
  if (!btn) return;
  if (btn.dataset.confirmed === "true") {
    clearTimeout(window._deleteTimers[id]);
    delete window._deleteTimers[id];
    if (id === "owner") {
      showNotification("⚠️ Cannot delete owner account!", "danger");
      return;
    }
    const users = getUsers();
    if (!users[id]) return;
    users[id].deleted = true;
    users[id].deviceId = null;
    saveUsers(users, true);
    showNotification(`Account deleted permanently.`, "info");
    renderUserManagement();
  } else {
    btn.dataset.confirmed = "true";
    btn.innerHTML = "⚠️ Confirm Delete?";
    btn.style.background = "#ef4444";
    btn.style.color = "#fff";
    window._deleteTimers[id] = setTimeout(() => {
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
    showNotification("⚠️ Setup cloud sync first under Settings.", "danger");
    return;
  }
  const token = btoa(`${cfg.supabaseUrl}|${cfg.supabaseKey}|${username}`);
  const url = `${location.origin}${location.pathname}#setup=${token}`;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showNotification(`📋 Setup link copied! Paste this exactly as-is into your phone.`, "success");
    }).catch(() => {
      prompt(`Copy link manually:`, url);
    });
  } else {
    prompt(`Your browser blocked auto-copying on local network. Please copy this link manually:`, url);
  }
}
window.copyEmployeeSetupLink = copyEmployeeSetupLink;

function renderPendingDeviceApprovals() {
  const container = document.getElementById("pending-device-approvals-list");
  if (!container) return;
  
  if (!db || !db.pending_entries) {
    container.innerHTML = '<p style="color:#64748b;font-size:0.75rem;text-align:center;padding:0.5rem;">Database loading...</p>';
    return;
  }
  
  const data = db.pending_entries.filter((e) => e.submission_type === "device_registration" && e.status === "pending");
  
  if (data.length === 0) {
    container.innerHTML = '<p style="color:#64748b;font-size:0.75rem;text-align:center;padding:0.5rem;">No pending device approvals.</p>';
    return;
  }
  const users = getUsers();
  const employees = Object.values(users).filter((u) => u.role === "employee" && !u.deleted);
  const unapprovedEmployees = employees.filter((u) => !u.deviceId);
  container.innerHTML = data.map((req) => {
    const info = req.entry_data || req.entryData || {};
    const reqName = info.name || req.submitted_by_name || req.submittedByName || "Unknown";
    const reqPhone = info.phone || "No phone";
    const reqDeviceId = info.deviceId || "";
    let dropdownHtml = "";
    if (unapprovedEmployees.length === 0) {
      dropdownHtml = employees.length === 0 ? '<span style="color:#ef4444;font-size:0.72rem;">Add employee profile first</span>' : '<span style="color:#94a3b8;font-size:0.72rem;">All profiles approved (Reset one above)</span>';
    } else {
      dropdownHtml = `
      <select id="approve-user-select-${req.id}" style="padding:0.3rem;background:var(--bg-input);color:#fff;border:1px solid var(--border);border-radius:0.3rem;font-size:0.72rem;">
        ${unapprovedEmployees.map((u) => `<option value="${u.id}">${u.displayName} (@${u.username})</option>`).join("")}
      </select>
    `;
    }
    const approveBtnHtml = unapprovedEmployees.length === 0 ? "" : `<button onclick="approveDeviceFromRequest(event, '${req.id}', '${reqDeviceId}')" style="background:#22c55e;color:#fff;border:none;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;font-weight:600;">Approve</button>`;
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem;background:#0f1117;border-radius:0.4rem;gap:0.5rem;flex-wrap:wrap;border:1px solid #334155;">
      <div>
        <span style="font-weight:700;color:#f8fafc;font-size:0.78rem;">${reqName}</span>
        <span style="color:#64748b;font-size:0.72rem;">(${reqPhone})</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.4rem;">
        ${dropdownHtml}
        ${approveBtnHtml}
        <button onclick="rejectDeviceRequest(event, '${req.id}')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;border-radius:0.4rem;padding:0.3rem 0.6rem;font-size:0.72rem;cursor:pointer;">Reject</button>
      </div>
    </div>
  `;
  }).join("");
}
window.renderPendingDeviceApprovals = renderPendingDeviceApprovals;

function approveDeviceFromRequest(event, reqId, deviceId) {
  return __async(this, null, function* () {
    const selectEl = document.getElementById(`approve-user-select-${reqId}`);
    if (!selectEl) return;
    const empId = selectEl.value;
    if (!empId) return;
    
    const users = getUsers();
    const targetUser = users[empId];
    if (!targetUser) {
      showNotification("Employee profile not found.", "danger");
      return;
    }
    if (!confirm(`Are you sure you want to approve this device for employee "${targetUser.displayName}"?`)) {
      return;
    }
    try {
      // Prevent double-clicking
      if (targetUser.deviceId === deviceId) return;

      // Disable button during network wait
      const btn = event ? event.currentTarget : null;
      if (btn) btn.disabled = true;

      targetUser.deviceId = deviceId;
      targetUser.deviceRegisteredAt = new Date().toISOString();
      
      const idx = (db.pending_entries || []).findIndex(e => e.id === reqId);
      if (idx !== -1) {
        db.pending_entries[idx].status = "approved";
        db.pending_entries[idx]._dirty = true;
      }
      
      // Pass 'true' to saveUsers to trigger immediate sync Push
      saveUsers(users, true);
      
      showNotification("Device approved successfully!", "success");
      renderUserManagement();
      renderPendingDeviceApprovals();
      
      if (btn) {
        btn.innerHTML = "Approved";
      }
    } catch (err) {
      console.error(err);
      const btn = event ? event.currentTarget : null;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = "Approve";
      }
      showNotification("Error approving device. Try again.", "danger");
    }
  });
}
window.approveDeviceFromRequest = approveDeviceFromRequest;
function rejectDeviceRequest(event, reqId) {
  return __async(this, null, function* () {
    const btn = event && event.currentTarget ? event.currentTarget : null;
    if (btn && btn.disabled) return;

    if (!confirm("Are you sure you want to reject and delete this request?")) {
      return;
    }
    
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span style="opacity:0.7">Wait...</span>`;
    }

    const idx = (db.pending_entries || []).findIndex(e => e.id === reqId);
    if (idx !== -1) {
      db.pending_entries[idx].status = "rejected";
      db.pending_entries[idx]._dirty = true;
      saveDB(true);
    }
    
    showNotification("Request rejected.", "info");
    renderPendingDeviceApprovals();
    
    if (btn) {
      btn.innerHTML = "Rejected";
    }
  });
}
window.rejectDeviceRequest = rejectDeviceRequest;
function showDeviceRequestForm(event) {
  if (event) event.preventDefault();
  const loginForm = document.getElementById("login-form");
  const reqForm = document.getElementById("device-request-form");
  const successPanel = document.getElementById("registration-success-panel");
  const hintEl = document.getElementById("owner-login-hint");
  if (loginForm) loginForm.style.display = "none";
  if (successPanel) successPanel.style.display = "none";
  if (reqForm) reqForm.style.display = "flex";
  if (hintEl) hintEl.style.display = "none";
  const devIdEl = document.getElementById("req-emp-device-id");
  if (devIdEl) devIdEl.value = getDeviceId();
}
window.showDeviceRequestForm = showDeviceRequestForm;
function showLoginForm(event) {
  if (event) event.preventDefault();
  const loginForm = document.getElementById("login-form");
  const reqForm = document.getElementById("device-request-form");
  const successPanel = document.getElementById("registration-success-panel");
  const hintEl = document.getElementById("owner-login-hint");
  if (reqForm) reqForm.style.display = "none";
  if (successPanel) successPanel.style.display = "none";
  if (loginForm) loginForm.style.display = "flex";
  if (hintEl) hintEl.style.display = "block";
}
window.showLoginForm = showLoginForm;
window.addEventListener("DOMContentLoaded", () => {
  const reqForm = document.getElementById("device-request-form");
  if (reqForm) {
    reqForm.addEventListener("submit", (e) => __async(this, null, function* () {
      e.preventDefault();
      const name = document.getElementById("req-emp-name").value.trim();
      const username = document.getElementById("req-emp-username").value.trim().toLowerCase().replace(/\s+/g, "");
      const phone = document.getElementById("req-emp-phone").value.trim();
      const deviceId = getDeviceId();
      if (!name || !username) {
        showNotification("\u26A0\uFE0F Name and Username are required.", "danger");
        return;
      }
      const submitBtn = reqForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting request...";
      }
      if (!supabaseClient) initSupabaseClient();
      if (!supabaseClient) {
        showNotification("\u274C Cloud connection not ready. Try again.", "danger");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Request Device Approval";
        }
        return;
      }
      try {
        const payload = {
          id: "dev_req_" + deviceId + "_" + Date.now(),
          submitted_by: username,
          submitted_by_name: name,
          submitted_at: (/* @__PURE__ */ new Date()).toISOString(),
          submission_type: "device_registration",
          status: "pending",
          entry_data: { name, username, phone, deviceId }
        };
        const { error } = yield supabaseClient.from("pending_entries").insert([payload]);
        if (error) throw error;
        reqForm.style.display = "none";
        const successPanel = document.getElementById("registration-success-panel");
        if (successPanel) {
          successPanel.style.display = "flex";
          successPanel.innerHTML = `
            <div style="text-align:center; padding: 2rem; color: #fff; width: 100%;">
              <h3 style="color:#22c55e; margin-bottom:1rem;">\u2705 Request Submitted!</h3>
              <p style="color:var(--text-dim); font-size:0.85rem; line-height:1.5; margin-bottom: 1.5rem;">
                Your device access request for <b>${name} (@${username})</b> has been submitted to the database.
                <br><br>
                Please ask the owner to click <b>Approve</b> under settings. Once approved, you can refresh this page and log in.
              </p>
              <button onclick="location.reload()" class="btn btn-primary" style="width: 100%;">\u{1F504} Refresh &amp; Try Login</button>
            </div>
          `;
        }
      } catch (err) {
        console.error(err);
        showNotification("\u274C Submission failed. Check connection.", "danger");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Request Device Approval";
        }
      }
    }));
  }
});
