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
let currentDsrMonth = "november";
const DSR_MONTH_MAP = {
  "november": { name: "November 2025", year: 2025, index: 11 },
  "december": { name: "December 2025", year: 2025, index: 12 },
  "january": { name: "January 2026", year: 2026, index: 1 },
  "February": { name: "February 2026", year: 2026, index: 2 },
  "february": { name: "February 2026", year: 2026, index: 2 },
  "march": { name: "March 2026", year: 2026, index: 3 },
  "april": { name: "April 2026", year: 2026, index: 4 },
  "may": { name: "May 2026", year: 2026, index: 5 },
  "june": { name: "June 2026", year: 2026, index: 6 }
};
function loadDsrDraftData() {
  return __async(this, null, function* () {
    if (window.dsrDraftData) return window.dsrDraftData;
    const savedEdits = localStorage.getItem("octaneflow_dsr_draft_edits");
    if (savedEdits) {
      try {
        let draft = JSON.parse(savedEdits);
        if (db && db.master_ledger) {
          const prodDates = new Set(db.master_ledger.map((r) => r.date));
          draft = draft.filter((r) => !prodDates.has(r.date));
        }
        window.dsrDraftData = draft;
        localStorage.setItem("octaneflow_dsr_draft_edits", JSON.stringify(draft));
        return window.dsrDraftData;
      } catch (e) {
        console.error("Failed to parse saved DSR draft edits:", e);
      }
    }
    try {
      const res = yield fetch("dsr_digitized_draft.json");
      if (!res.ok) throw new Error("Failed to load digitized DSR draft");
      const json = yield res.json();
      window.dsrDraftData = json.master_ledger || json;
      return window.dsrDraftData;
    } catch (err) {
      console.error("Error loading DSR draft data:", err);
      return [];
    }
  });
}
function saveDsrDraftEdits() {
  if (window.dsrDraftData) {
    localStorage.setItem("octaneflow_dsr_draft_edits", JSON.stringify(window.dsrDraftData));
  }
}
function calculateRowExpectedRev(row) {
  var _a, _b;
  const p1_open = row.du1_p.open || 0;
  const p1_close = row.du1_p.close_day || 0;
  const p2_open = row.du2_p.open || 0;
  const p2_close = row.du2_p.close_day || 0;
  const p_tests = ((row.du1_p.tests_day || 0) + (row.du1_p.tests_night || 0) + (row.du2_p.tests_day || 0) + (row.du2_p.tests_night || 0)) * 5;
  const p_sales = Math.max(0, p1_close - p1_open + (p2_close - p2_open) - p_tests);
  const d1_open = row.du1_d.open || 0;
  const d1_close = row.du1_d.close_day || 0;
  const d2_open = row.du2_d.open || 0;
  const d2_close = row.du2_d.close_day || 0;
  const d_tests = ((row.du1_d.tests_day || 0) + (row.du1_d.tests_night || 0) + (row.du2_d.tests_day || 0) + (row.du2_d.tests_night || 0)) * 5;
  const d_sales = Math.max(0, d1_close - d1_open + (d2_close - d2_open) - d_tests);
  return p_sales * (((_a = row.prices) == null ? void 0 : _a.petrol) || 0) + d_sales * (((_b = row.prices) == null ? void 0 : _b.diesel) || 0);
}
function dipToLiters(dipCm, maxCapacity, maxDipCm) {
  if (!dipCm || dipCm <= 0) return 0;
  if (dipCm >= maxDipCm) return maxCapacity;
  const r = maxDipCm / 2;
  const h = dipCm;
  try {
    const theta = 2 * Math.acos((r - h) / r);
    const segmentArea = 0.5 * r * r * (theta - Math.sin(theta));
    const totalArea = Math.PI * r * r;
    return maxCapacity * (segmentArea / totalArea);
  } catch (e) {
    return 0;
  }
}
function litersToDip(liters, maxCapacity, maxDipCm) {
  if (liters <= 0) return 0;
  if (liters >= maxCapacity) return maxDipCm;
  let low = 0;
  let high = maxDipCm;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (low + high) / 2;
    const vol = dipToLiters(mid, maxCapacity, maxDipCm);
    if (vol < liters) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}
function getDailyDeliveries(dateStr) {
  let ms = 0;
  let hsd = 0;
  let ms_shortage = 0;
  let hsd_shortage = 0;
  if (typeof SUPPLY_BILLS_DATA !== "undefined") {
    const daySupplies = SUPPLY_BILLS_DATA.filter((s) => s.invoice_date_iso === dateStr);
    daySupplies.forEach((s) => {
      const qty = (s.quantity_kl || 0) * 1e3;
      if (s.product === "Petrol") ms += qty;
      else if (s.product === "Diesel") hsd += qty;
    });
  }
  if (ms === 0 && hsd === 0 && db && db.purchases) {
    db.purchases.forEach((p) => {
      const pDate = p.date ? p.date.split("T")[0] : "";
      if (pDate === dateStr) {
        ms += p.petrol_liters || 0;
        hsd += p.diesel_liters || 0;
        ms_shortage += p.petrol_shortage || 0;
        hsd_shortage += p.diesel_shortage || 0;
      }
    });
  }
  return { ms, hsd, ms_shortage, hsd_shortage };
}
function validateDsrData(data) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v;
  const issues = [];
  data.sort((a, b) => a.date.localeCompare(b.date));
  const max_cap_ms = ((_a = db.settings) == null ? void 0 : _a.petrol_capacity) || 2e4;
  const max_cap_hsd = ((_b = db.settings) == null ? void 0 : _b.diesel_capacity) || 2e4;
  const max_dip_ms = ((_c = db.settings) == null ? void 0 : _c.petrol_tank_dia) || 200;
  const max_dip_hsd = ((_d = db.settings) == null ? void 0 : _d.diesel_tank_dia) || 200;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const prevRow = i > 0 ? data[i - 1] : null;
    const nextRow = i < data.length - 1 ? data[i + 1] : null;
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    if (row.date > todayStr) {
      issues.push({
        type: "future_date",
        date: row.date,
        msg: `[${row.date}] \u274C Future Date Error: Record is dated in the future (today is ${todayStr}).`
      });
    }
    const p1_open = sanitizeNumber((_e = row.du1_p) == null ? void 0 : _e.open);
    const p1_close = sanitizeNumber((_f = row.du1_p) == null ? void 0 : _f.close_day);
    const p2_open = sanitizeNumber((_g = row.du2_p) == null ? void 0 : _g.open);
    const p2_close = sanitizeNumber((_h = row.du2_p) == null ? void 0 : _h.close_day);
    const p_tests = (sanitizeNumber((_i = row.du1_p) == null ? void 0 : _i.tests_day) + sanitizeNumber((_j = row.du1_p) == null ? void 0 : _j.tests_night) + sanitizeNumber((_k = row.du2_p) == null ? void 0 : _k.tests_day) + sanitizeNumber((_l = row.du2_p) == null ? void 0 : _l.tests_night)) * 5;
    const p_sales = Math.max(0, p1_close - p1_open + (p2_close - p2_open) - p_tests);
    const d1_open = sanitizeNumber((_m = row.du1_d) == null ? void 0 : _m.open);
    const d1_close = sanitizeNumber((_n = row.du1_d) == null ? void 0 : _n.close_day);
    const d2_open = sanitizeNumber((_o = row.du2_d) == null ? void 0 : _o.open);
    const d2_close = sanitizeNumber((_p = row.du2_d) == null ? void 0 : _p.close_day);
    const d_tests = (sanitizeNumber((_q = row.du1_d) == null ? void 0 : _q.tests_day) + sanitizeNumber((_r = row.du1_d) == null ? void 0 : _r.tests_night) + sanitizeNumber((_s = row.du2_d) == null ? void 0 : _s.tests_day) + sanitizeNumber((_t = row.du2_d) == null ? void 0 : _t.tests_night)) * 5;
    const d_sales = Math.max(0, d1_close - d1_open + (d2_close - d2_open) - d_tests);
    const expectedRev = p_sales * sanitizeNumber((_u = row.prices) == null ? void 0 : _u.petrol) + d_sales * sanitizeNumber((_v = row.prices) == null ? void 0 : _v.diesel);
    const actualColl = sanitizeNumber(row.actual_collection, expectedRev);
    const variance = expectedRev - actualColl;
    let isConsecutive = false;
    if (prevRow) {
      const d1 = new Date(prevRow.date);
      const d2 = new Date(row.date);
      const diffDays = Math.round((d2 - d1) / (1e3 * 60 * 60 * 24));
      if (diffDays === 1) {
        isConsecutive = true;
      }
    }
    const deliv = getDailyDeliveries(row.date);
    const phys_ms = dipToLiters(row.dip_ms_cm || 0, max_cap_ms, max_dip_ms);
    const phys_hsd = dipToLiters(row.dip_hsd_cm || 0, max_cap_hsd, max_dip_hsd);
    let book_ms = phys_ms;
    let book_hsd = phys_hsd;
    if (i > 0 && isConsecutive) {
      book_ms = (prevRow.phys_ms || 0) + deliv.ms - p_sales;
      book_hsd = (prevRow.phys_hsd || 0) + deliv.hsd - d_sales;
    }
    const var_ms = phys_ms - book_ms;
    const var_hsd = phys_hsd - book_hsd;
    row.phys_ms = phys_ms;
    row.phys_hsd = phys_hsd;
    row.book_ms = book_ms;
    row.book_hsd = book_hsd;
    row.exp_dip_ms = litersToDip(book_ms, max_cap_ms, max_dip_ms);
    row.exp_dip_hsd = litersToDip(book_hsd, max_cap_hsd, max_dip_hsd);
    row.var_ms = var_ms;
    row.var_hsd = var_hsd;
    const addNozzleIssue = (type, nozzleLabel, uKey, oVal, cVal, prevCl, nextOp, desc) => {
      issues.push({
        type,
        date: row.date,
        msg: `[${row.date}] ${desc}`,
        context: {
          nozzle: nozzleLabel,
          prevClose: prevCl,
          openVal: oVal,
          closeVal: cVal,
          nextOpen: nextOp
        }
      });
    };
    if (p1_close < p1_open) {
      addNozzleIssue("trend", "Petrol DU1", "du1_p", p1_open, p1_close, prevRow ? prevRow.du1_p.close_night : null, nextRow ? nextRow.du1_p.open : null, `Petrol DU1 closing (${p1_close.toFixed(2)}) is less than opening (${p1_open.toFixed(2)})`);
    }
    if (p2_close < p2_open) {
      addNozzleIssue("trend", "Petrol DU2", "du2_p", p2_open, p2_close, prevRow ? prevRow.du2_p.close_day : null, nextRow ? nextRow.du2_p.open : null, `Petrol DU2 closing (${p2_close.toFixed(2)}) is less than opening (${p2_open.toFixed(2)})`);
    }
    if (d1_close < d1_open) {
      addNozzleIssue("trend", "Diesel DU1", "du1_d", d1_open, d1_close, prevRow ? prevRow.du1_d.close_day : null, nextRow ? nextRow.du1_d.open : null, `Diesel DU1 closing (${d1_close.toFixed(2)}) is less than opening (${d1_open.toFixed(2)})`);
    }
    if (d2_close < d2_open) {
      addNozzleIssue("trend", "Diesel DU2", "du2_d", d2_open, d2_close, prevRow ? prevRow.du2_d.close_day : null, nextRow ? nextRow.du2_d.open : null, `Diesel DU2 closing (${d2_close.toFixed(2)}) is less than opening (${d2_open.toFixed(2)})`);
    }
    if (isConsecutive) {
      if (Math.abs(p1_open - prevRow.du1_p.close_night) > 0.01) {
        addNozzleIssue("continuity", "Petrol DU1", "du1_p", p1_open, p1_close, prevRow.du1_p.close_night, nextRow ? nextRow.du1_p.open : null, `Petrol DU1 opening (${p1_open.toFixed(2)}) doesn't match previous day's closing (${prevRow.du1_p.close_night.toFixed(2)})`);
      }
      if (Math.abs(p2_open - prevRow.du2_p.close_night) > 0.01) {
        addNozzleIssue("continuity", "Petrol DU2", "du2_p", p2_open, p2_close, prevRow.du2_p.close_night, nextRow ? nextRow.du2_p.open : null, `Petrol DU2 opening (${p2_open.toFixed(2)}) doesn't match previous day's closing (${prevRow.du2_p.close_night.toFixed(2)})`);
      }
      if (Math.abs(d1_open - prevRow.du1_d.close_night) > 0.01) {
        addNozzleIssue("continuity", "Diesel DU1", "du1_d", d1_open, d1_close, prevRow.du1_d.close_night, nextRow ? nextRow.du1_d.open : null, `Diesel DU1 opening (${d1_open.toFixed(2)}) doesn't match previous day's closing (${prevRow.du1_d.close_night.toFixed(2)})`);
      }
      if (Math.abs(d2_open - prevRow.du2_d.close_night) > 0.01) {
        addNozzleIssue("continuity", "Diesel DU2", "du2_d", d2_open, d2_close, prevRow.du2_d.close_night, nextRow ? nextRow.du2_d.open : null, `Diesel DU2 opening (${d2_open.toFixed(2)}) doesn't match previous day's closing (${prevRow.du2_d.close_night.toFixed(2)})`);
      }
    }
    if (Math.abs(variance) > 5e3) {
      issues.push({
        type: "variance",
        date: row.date,
        msg: `[${row.date}] High cash variance: expected \u20B9${expectedRev.toFixed(0)}, actual \u20B9${actualColl.toFixed(0)} (diff: \u20B9${variance.toFixed(0)})`
      });
    }
    const var_ms_pct = p_sales > 0 ? Math.abs(var_ms) / p_sales * 100 : 0;
    if (Math.abs(var_ms) > 100 && var_ms_pct > 3) {
      issues.push({
        type: "wetstock",
        date: row.date,
        msg: `[${row.date}] Petrol Wetstock Var: ${var_ms.toFixed(1)} L (${var_ms_pct.toFixed(2)}% of sales)`
      });
    }
    const var_hsd_pct = d_sales > 0 ? Math.abs(var_hsd) / d_sales * 100 : 0;
    if (Math.abs(var_hsd) > 100 && var_hsd_pct > 3) {
      issues.push({
        type: "wetstock",
        date: row.date,
        msg: `[${row.date}] Diesel Wetstock Var: ${var_hsd.toFixed(1)} L (${var_hsd_pct.toFixed(2)}% of sales)`
      });
    }
  }
  if (data.length > 0) {
    const meta = DSR_MONTH_MAP[currentDsrMonth];
    if (meta) {
      const year = meta.year;
      const monthIdx = meta.index;
      const today = /* @__PURE__ */ new Date();
      const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === monthIdx;
      const maxDay = isCurrentMonth ? today.getDate() : new Date(year, monthIdx, 0).getDate();
      const existingDates = new Set(data.map((row) => row.date));
      for (let day = 1; day <= maxDay; day++) {
        const dateStr = `${year}-${String(monthIdx).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (year === 2025 && monthIdx === 11 && day < 11) {
          continue;
        }
        if (!existingDates.has(dateStr)) {
          issues.push({
            type: "missing_date",
            date: dateStr,
            msg: `[${dateStr}] \u26A0\uFE0F Missing DSR Entry: No record found for this date in the ledger.`
          });
        }
      }
    }
  }
  issues.sort((a, b) => a.date.localeCompare(b.date));
  return issues;
}
function updateDsrSummaryCards(petrolSales, dieselSales, issues) {
  document.getElementById("dsr-summary-petrol-sales").textContent = `${petrolSales.toLocaleString(void 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
  document.getElementById("dsr-summary-diesel-sales").textContent = `${dieselSales.toLocaleString(void 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
  const statusBadge = document.getElementById("dsr-summary-status-badge");
  const issueCountEl = document.getElementById("dsr-summary-issue-count");
  const errorLog = document.getElementById("dsr-validation-error-log");
  const errorList = document.getElementById("dsr-validation-error-list");
  const errorTitle = errorLog ? errorLog.querySelector(".error-log-title") : null;
  if (errorTitle) {
    errorTitle.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align:middle; margin-right:4px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
      \u{1F534} Review Issues \u2014 <span style="font-size: 0.85rem; font-weight: 800; background: rgba(239, 68, 68, 0.2); padding: 2px 8px; border-radius: 4px; color: #fca5a5;">${issues.length} Discrepancies Remaining</span>
    `;
  }
  if (issues.length === 0) {
    statusBadge.innerHTML = `<span class="validation-badge success" style="background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 4px 8px; border-radius: 4px; font-size:0.75rem; font-weight:600;">\u2705 All Clean</span>`;
    issueCountEl.textContent = "0 issues detected";
    errorLog.style.display = "none";
  } else {
    statusBadge.innerHTML = `<span class="validation-badge warning" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 4px 8px; border-radius: 4px; font-size:0.75rem; font-weight:600;">\u26A0\uFE0F Issues</span>`;
    issueCountEl.textContent = `${issues.length} discrepancy errors detected`;
    errorList.innerHTML = "";
    issues.forEach((issue) => {
      const li = document.createElement("li");
      li.style.marginBottom = "12px";
      li.style.listStyle = "none";
      li.style.background = "rgba(239, 68, 68, 0.05)";
      li.style.border = "1px solid rgba(239, 68, 68, 0.15)";
      li.style.padding = "10px";
      li.style.borderRadius = "6px";
      li.style.cursor = "pointer";
      li.style.transition = "all 0.15s ease-in-out";
      li.title = "Click to auto-scroll and highlight this discrepancy cell in the table";
      li.onmouseenter = () => {
        li.style.background = "rgba(239, 68, 68, 0.08)";
        li.style.borderColor = "rgba(239, 68, 68, 0.3)";
        li.style.transform = "translateY(-1px)";
        li.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
      };
      li.onmouseleave = () => {
        li.style.background = "rgba(239, 68, 68, 0.05)";
        li.style.borderColor = "rgba(239, 68, 68, 0.15)";
        li.style.transform = "";
        li.style.boxShadow = "";
      };
      if (issue.type === "continuity" || issue.type === "trend") {
        const field = issue.type === "continuity" ? "open" : "close_day";
        li.onclick = () => window.jumpToDsrCell(issue.date, issue.context.unit, field);
      }
      let html = `<div style="font-weight:700; color:#fca5a5; margin-bottom: 6px; font-size: 0.78rem;">${issue.msg}</div>`;
      if (issue.type === "continuity") {
        html += `
          <div style="display: flex; gap: 15px; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; font-size: 0.73rem; font-family: 'JetBrains Mono', monospace;">
            <div style="flex: 1; opacity: 0.8;">
              <span style="color: var(--text-dim);">\u{1F448} PREV CLOSE:</span> 
              <b style="color: #38bdf8;">${issue.context.prevClose.toFixed(2)}</b>
            </div>
            <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 15px; color: #ef4444; font-weight:700;">
              <span>\u{1F534} CURRENT OPEN:</span> 
              <b>${issue.context.openVal.toFixed(2)}</b>
            </div>
            <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 15px; opacity: 0.8;">
              <span style="color: var(--text-dim);">\u{1F449} NEXT OPEN:</span> 
              <b>${issue.context.nextOpen !== null ? issue.context.nextOpen.toFixed(2) : "\u2014"}</b>
            </div>
          </div>
        `;
      } else if (issue.type === "trend") {
        html += `
          <div style="display: flex; gap: 15px; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 4px; font-size: 0.73rem; font-family: 'JetBrains Mono', monospace;">
            <div style="flex: 1; opacity: 0.8;">
              <span style="color: var(--text-dim);">\u{1F448} PREV CLOSE:</span> 
              <b>${issue.context.prevClose !== null ? issue.context.prevClose.toFixed(2) : "\u2014"}</b>
            </div>
            <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 15px; color: #ef4444; font-weight:700;">
              <span>\u274C GOES BACKWARDS:</span> 
              <b>Open: ${issue.context.openVal.toFixed(2)} | Close: ${issue.context.closeVal.toFixed(2)}</b>
            </div>
            <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 15px; opacity: 0.8;">
              <span style="color: var(--text-dim);">\u{1F449} NEXT OPEN:</span> 
              <b>${issue.context.nextOpen !== null ? issue.context.nextOpen.toFixed(2) : "\u2014"}</b>
            </div>
          </div>
        `;
      }
      li.innerHTML = html;
      errorList.appendChild(li);
    });
    errorLog.style.display = "block";
  }
}
function propagateDsrOpeningTotalizers() {
  window.dsrDraftData.sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < window.dsrDraftData.length; i++) {
    const prev = window.dsrDraftData[i - 1];
    const curr = window.dsrDraftData[i];
    curr.du1_p.open = prev.du1_p.close_day;
    curr.du2_p.open = prev.du2_p.close_day;
    curr.du1_d.open = prev.du1_d.close_day;
    curr.du2_d.open = prev.du2_d.close_day;
  }
}
function renderDsrChecker() {
  return __async(this, null, function* () {
    if (!window.dsrDraftData) {
      const tableBody = document.getElementById("dsr-review-table-body");
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="15" style="text-align:center; color: var(--text-dim); padding: 3rem;">Loading digitized DSR logs...</td></tr>`;
      }
      yield loadDsrDraftData();
    }
    const data = window.dsrDraftData || [];
    const meta = DSR_MONTH_MAP[currentDsrMonth];
    if (!meta) return;
    const year = meta.year;
    const monthIdx = meta.index;
    const prefix = `${year}-${String(monthIdx).padStart(2, "0")}`;
    const prodRows = db.master_ledger.filter((row) => row.date.startsWith(prefix));
    const draftRows = data.filter((row) => row.date.startsWith(prefix));
    const combinedMap = {};
    prodRows.forEach((row) => {
      var _a, _b;
      combinedMap[row.date] = JSON.parse(JSON.stringify(row));
      combinedMap[row.date].actual_collection = (_b = (_a = row.recon) == null ? void 0 : _a.total_collection) != null ? _b : calculateRowExpectedRev(row);
    });
    draftRows.forEach((row) => {
      combinedMap[row.date] = row;
    });
    const today = /* @__PURE__ */ new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === monthIdx;
    const maxDay = isCurrentMonth ? today.getDate() : new Date(year, monthIdx, 0).getDate();
    const fullMonthData = [];
    for (let day = 1; day <= maxDay; day++) {
      const dateStr = `${year}-${String(monthIdx).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (year === 2025 && monthIdx === 11 && day < 11) {
        continue;
      }
      if (combinedMap[dateStr]) {
        fullMonthData.push(combinedMap[dateStr]);
      } else {
        fullMonthData.push({
          date: dateStr,
          prices: { petrol: 113.37, diesel: 98.41 },
          du1_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
          du2_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
          du1_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
          du2_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
          recon: {},
          actual_collection: 0,
          dip_ms_cm: 0,
          dip_hsd_cm: 0,
          isPlaceholder: true
        });
      }
    }
    fullMonthData.sort((a, b) => a.date.localeCompare(b.date));
    const issues = validateDsrData(fullMonthData);
    const issueDates = new Set(issues.map((i) => i.date));
    const renderedMonthData = fullMonthData.filter((row) => {
      if (row.isPlaceholder) return true;
      const isDraft = draftRows.some((dr) => dr.date === row.date);
      if (isDraft) return true;
      const hasIssue = issueDates.has(row.date);
      if (hasIssue) return true;
      return false;
    });
    document.getElementById("dsr-summary-month-name").textContent = meta.name;
    const pendingCount = renderedMonthData.filter((row) => !row.isPlaceholder).length;
    document.getElementById("dsr-summary-total-days").textContent = `${pendingCount} issues/drafts pending`;
    const tbody = document.getElementById("dsr-review-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (renderedMonthData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; color: #22c55e; font-weight: 600; padding: 3rem;">\u{1F389} All clean! No pending issues or drafts for this month.</td></tr>`;
      updateDsrSummaryCards(0, 0, []);
      return;
    }
    let petrolTotalSales = 0;
    let dieselTotalSales = 0;
    renderedMonthData.forEach((row, idx) => {
      var _a, _b;
      const prevRow = idx > 0 ? renderedMonthData[idx - 1] : null;
      const p1_open = row.du1_p.open || 0;
      const p1_close = row.du1_p.close_day || 0;
      const p2_open = row.du2_p.open || 0;
      const p2_close = row.du2_p.close_day || 0;
      const p_tests = ((row.du1_p.tests_day || 0) + (row.du1_p.tests_night || 0) + (row.du2_p.tests_day || 0) + (row.du2_p.tests_night || 0)) * 5;
      const p_sales = Math.max(0, p1_close - p1_open + (p2_close - p2_open) - p_tests);
      petrolTotalSales += p_sales;
      const d1_open = row.du1_d.open || 0;
      const d1_close = row.du1_d.close_day || 0;
      const d2_open = row.du2_d.open || 0;
      const d2_close = row.du2_d.close_day || 0;
      const d_tests = ((row.du1_d.tests_day || 0) + (row.du1_d.tests_night || 0) + (row.du2_d.tests_day || 0) + (row.du2_d.tests_night || 0)) * 5;
      const d_sales = Math.max(0, d1_close - d1_open + (d2_close - d2_open) - d_tests);
      dieselTotalSales += d_sales;
      const expectedRev = p_sales * (((_a = row.prices) == null ? void 0 : _a.petrol) || 0) + d_sales * (((_b = row.prices) == null ? void 0 : _b.diesel) || 0);
      const actualColl = row.actual_collection !== void 0 ? row.actual_collection : expectedRev;
      const variance = expectedRev - actualColl;
      let isConsecutive = false;
      if (prevRow) {
        const d1 = new Date(prevRow.date);
        const d2 = new Date(row.date);
        const diffDays = Math.round((d2 - d1) / (1e3 * 60 * 60 * 24));
        if (diffDays === 1) {
          isConsecutive = true;
        }
      }
      const deliv = getDailyDeliveries(row.date);
      const hasP1ContinuityError = isConsecutive && Math.abs(p1_open - prevRow.du1_p.close_night) > 0.01;
      const hasP2ContinuityError = isConsecutive && Math.abs(p2_open - prevRow.du2_p.close_night) > 0.01;
      const hasD1ContinuityError = isConsecutive && Math.abs(d1_open - prevRow.du1_d.close_night) > 0.01;
      const hasD2ContinuityError = isConsecutive && Math.abs(d2_open - prevRow.du2_d.close_night) > 0.01;
      const hasP1TrendError = p1_close < p1_open;
      const hasP2TrendError = p2_close < p2_open;
      const hasD1TrendError = d1_close < d1_open;
      const hasD2TrendError = d2_close < d2_open;
      const hasVarianceError = Math.abs(variance) > 5e3;
      const rowHasError = hasP1ContinuityError || hasP2ContinuityError || hasD1ContinuityError || hasD2ContinuityError || hasP1TrendError || hasP2TrendError || hasD1TrendError || hasD2TrendError || hasVarianceError;
      const tr = document.createElement("tr");
      tr.id = `dsr-row-${row.date}`;
      if (row.isPlaceholder) {
        tr.style.background = "rgba(255, 255, 255, 0.015)";
        tr.style.opacity = "0.55";
      } else if (rowHasError) {
        tr.style.background = "rgba(239, 68, 68, 0.04)";
      }
      const varianceColor = Math.abs(variance) > 5e3 ? "#ef4444" : Math.abs(variance) > 100 ? "#eab308" : "#22c55e";
      const p1OpenTitle = hasP1ContinuityError ? `Continuity Mismatch: Open (${p1_open.toFixed(2)}) does not match yesterday's close (${prevRow.du1_p.close_night.toFixed(2)})` : prevRow ? `Clean: Matches yesterday's close (${prevRow.du1_p.close_night.toFixed(2)})` : `Clean: First day opening`;
      const p1CloseTitle = hasP1TrendError ? `Trend Error: Evening close (${p1_close.toFixed(2)}) is less than open (${p1_open.toFixed(2)})` : `Clean: Reading is greater than open`;
      const p2OpenTitle = hasP2ContinuityError ? `Continuity Mismatch: Open (${p2_open.toFixed(2)}) does not match yesterday's close (${prevRow.du2_p.close_night.toFixed(2)})` : prevRow ? `Clean: Matches yesterday's close (${prevRow.du2_p.close_night.toFixed(2)})` : `Clean: First day opening`;
      const p2CloseTitle = hasP2TrendError ? `Trend Error: Evening close (${p2_close.toFixed(2)}) is less than open (${p2_open.toFixed(2)})` : `Clean: Reading is greater than open`;
      const d1OpenTitle = hasD1ContinuityError ? `Continuity Mismatch: Open (${d1_open.toFixed(2)}) does not match yesterday's close (${prevRow.du1_d.close_night.toFixed(2)})` : prevRow ? `Clean: Matches yesterday's close (${prevRow.du1_d.close_night.toFixed(2)})` : `Clean: First day opening`;
      const d1CloseTitle = hasD1TrendError ? `Trend Error: Evening close (${d1_close.toFixed(2)}) is less than open (${d1_open.toFixed(2)})` : `Clean: Reading is greater than open`;
      const d2OpenTitle = hasD2ContinuityError ? `Continuity Mismatch: Open (${d2_open.toFixed(2)}) does not match yesterday's close (${prevRow.du2_d.close_night.toFixed(2)})` : prevRow ? `Clean: Matches yesterday's close (${prevRow.du2_d.close_night.toFixed(2)})` : `Clean: First day opening`;
      const d2CloseTitle = hasD2TrendError ? `Trend Error: Evening close (${d2_close.toFixed(2)}) is less than open (${d2_open.toFixed(2)})` : `Clean: Reading is greater than open`;
      tr.innerHTML = `
      <td style="font-weight:600; font-size:0.8rem; white-space:nowrap; padding: 0.5rem; border-bottom: 1px solid var(--border);">${row.date}</td>

      <!-- Petrol Totalizers -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-petrol">
        <span class="editable-cell ${hasP1ContinuityError ? "diff-highlight" : ""}" title="${p1OpenTitle}" style="border-bottom: 1px dashed var(--color-petrol); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du1_p', 'open', this.textContent)">${p1_open.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-petrol">
        <span class="editable-cell ${hasP1TrendError ? "diff-highlight" : ""}" title="${p1CloseTitle}" style="border-bottom: 1px dashed var(--color-petrol); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du1_p', 'close_day', this.textContent)">${p1_close.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-petrol">
        <span class="editable-cell ${hasP2ContinuityError ? "diff-highlight" : ""}" title="${p2OpenTitle}" style="border-bottom: 1px dashed var(--color-petrol); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du2_p', 'open', this.textContent)">${p2_open.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-petrol">
        <span class="editable-cell ${hasP2TrendError ? "diff-highlight" : ""}" title="${p2CloseTitle}" style="border-bottom: 1px dashed var(--color-petrol); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du2_p', 'close_day', this.textContent)">${p2_close.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-dim); font-size: 0.75rem;" class="col-petrol">
        ${p_tests} L
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: var(--color-petrol);" class="col-petrol">
        ${p_sales.toFixed(1)} L
      </td>

      <!-- Petrol Tank Wetstock -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; background: rgba(16, 185, 129, 0.02);" class="col-petrol">
        <span class="editable-cell" title="Enter physical Petrol dip in cm" style="border-bottom: 1px dashed #10b981; padding: 2px 4px; cursor: pointer; color: #fff; font-weight: 600;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'recon', 'dip_ms_cm', this.textContent)">${(row.dip_ms_cm || 0).toFixed(1)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-muted); font-size: 0.75rem; background: rgba(16, 185, 129, 0.02);" class="col-petrol">
        ${(row.phys_ms || 0).toFixed(0)} L
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: ${Math.abs(row.var_ms || 0) > p_sales * 5e-3 ? "#ef4444" : "#10b981"}; background: rgba(16, 185, 129, 0.02);" class="col-petrol" title="Book Stock (Expected): ${(row.book_ms || 0).toFixed(0)} L (Dip: ${(row.exp_dip_ms || 0).toFixed(1)} cm) | Physical Stock (Actual): ${(row.phys_ms || 0).toFixed(0)} L (Dip: ${(row.dip_ms_cm || 0).toFixed(1)} cm)${deliv.ms_shortage > 0 ? " | Tanker Shortage: -" + deliv.ms_shortage.toFixed(0) + " L" : ""}">
        ${(row.var_ms || 0) >= 0 ? "+" : ""}${(row.var_ms || 0).toFixed(0)} L${deliv.ms_shortage > 0 ? ' <small style="color:#f87171;font-weight:normal;" title="Tanker delivery shortfall of ' + deliv.ms_shortage.toFixed(0) + ' L detected via density check">\u26A0\uFE0F</small>' : ""}
      </td>

      <!-- Diesel Totalizers -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-diesel">
        <span class="editable-cell ${hasD1ContinuityError ? "diff-highlight" : ""}" title="${d1OpenTitle}" style="border-bottom: 1px dashed var(--color-diesel); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du1_d', 'open', this.textContent)">${d1_open.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-diesel">
        <span class="editable-cell ${hasD1TrendError ? "diff-highlight" : ""}" title="${d1CloseTitle}" style="border-bottom: 1px dashed var(--color-diesel); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du1_d', 'close_day', this.textContent)">${d1_close.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-diesel">
        <span class="editable-cell ${hasD2ContinuityError ? "diff-highlight" : ""}" title="${d2OpenTitle}" style="border-bottom: 1px dashed var(--color-diesel); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du2_d', 'open', this.textContent)">${d2_open.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;" class="col-diesel">
        <span class="editable-cell ${hasD2TrendError ? "diff-highlight" : ""}" title="${d2CloseTitle}" style="border-bottom: 1px dashed var(--color-diesel); padding: 2px 4px; cursor: pointer;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'du2_d', 'close_day', this.textContent)">${d2_close.toFixed(2)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-dim); font-size: 0.75rem;" class="col-diesel">
        ${d_tests} L
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: var(--color-diesel);" class="col-diesel">
        ${d_sales.toFixed(1)} L
      </td>

      <!-- Diesel Tank Wetstock -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; background: rgba(245, 158, 11, 0.02);" class="col-diesel">
        <span class="editable-cell" title="Enter physical Diesel dip in cm" style="border-bottom: 1px dashed #f59e0b; padding: 2px 4px; cursor: pointer; color: #fff; font-weight: 600;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'recon', 'dip_hsd_cm', this.textContent)">${(row.dip_hsd_cm || 0).toFixed(1)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-muted); font-size: 0.75rem; background: rgba(245, 158, 11, 0.02);" class="col-diesel">
        ${(row.phys_hsd || 0).toFixed(0)} L
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: ${Math.abs(row.var_hsd || 0) > d_sales * 5e-3 ? "#ef4444" : "#10b981"}; background: rgba(245, 158, 11, 0.02);" class="col-diesel" title="Book Stock (Expected): ${(row.book_hsd || 0).toFixed(0)} L (Dip: ${(row.exp_dip_hsd || 0).toFixed(1)} cm) | Physical Stock (Actual): ${(row.phys_hsd || 0).toFixed(0)} L (Dip: ${(row.dip_hsd_cm || 0).toFixed(1)} cm)${deliv.hsd_shortage > 0 ? " | Tanker Shortage: -" + deliv.hsd_shortage.toFixed(0) + " L" : ""}">
        ${(row.var_hsd || 0) >= 0 ? "+" : ""}${(row.var_hsd || 0).toFixed(0)} L${deliv.hsd_shortage > 0 ? ' <small style="color:#f87171;font-weight:normal;" title="Tanker delivery shortfall of ' + deliv.hsd_shortage.toFixed(0) + ' L detected via density check">\u26A0\uFE0F</small>' : ""}
      </td>

      <!-- Cash Variance Analysis -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; color: var(--text-muted); font-size: 0.8rem;">
        \u20B9${expectedRev.toFixed(0)}
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right;">
        <span class="editable-cell" style="border-bottom: 1px dashed var(--primary); padding: 2px 4px; cursor: pointer; color: #fff; font-weight: 600;" contenteditable="true" onblur="updateDsrCell('${row.date}', 'recon', 'actual_collection', this.textContent)">\u20B9${actualColl.toFixed(0)}</span>
      </td>
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: right; font-weight: 700; color: ${varianceColor}; font-family: monospace;">
        ${variance >= 0 ? "+" : ""}\u20B9${variance.toFixed(0)}
      </td>

      <!-- Math Check Status -->
      <td style="padding: 0.5rem; border-bottom: 1px solid var(--border); text-align: center;">
        ${row.isPlaceholder ? `<span style="color: var(--text-dim); font-size: 0.75rem;">Placeholder</span>` : rowHasError ? `<button class="btn btn-warning btn-xs" style="font-size:0.7rem; padding: 4px 8px; border-radius:4px; font-weight:700; background-color: #d97706; border-color: #d97706; color: #fff; cursor: pointer;" onclick="submitRowToLedger('${row.date}')">\u26A0\uFE0F Submit anyway</button>` : `<button class="btn btn-success btn-xs" style="font-size:0.7rem; padding: 4px 8px; border-radius:4px; font-weight:700; background-color: #22c55e; border-color: #22c55e; color: #fff; cursor: pointer;" onclick="submitRowToLedger('${row.date}')">\u{1F4E9} Submit</button>`}
      </td>
    `;
      tbody.appendChild(tr);
    });
    const filteredIssues = issues.filter((issue) => renderedMonthData.some((row) => row.date === issue.date));
    updateDsrSummaryCards(petrolTotalSales, dieselTotalSales, filteredIssues);
  });
}
window.selectDsrMonth = function(monthKey) {
  currentDsrMonth = monthKey;
  document.querySelectorAll("#dsr-month-tabs .btn").forEach((el) => {
    el.classList.remove("active");
  });
  const btn = document.getElementById(`dsr-tab-${monthKey}`) || document.getElementById(`dsr-tab-${monthKey.toLowerCase()}`);
  if (btn) btn.classList.add("active");
  renderDsrChecker();
};
window.updateDsrCell = function(date, unitKey, fieldKey, rawValue) {
  var _a, _b;
  const cleanVal = rawValue.replace(/[^0-9\.]/g, "");
  const num = parseFloat(cleanVal);
  if (isNaN(num)) {
    renderDsrChecker();
    return;
  }
  let row = window.dsrDraftData.find((r) => r.date === date);
  if (!row) {
    const prodRow = db.master_ledger.find((r) => r.date === date);
    if (prodRow) {
      row = JSON.parse(JSON.stringify(prodRow));
      row.actual_collection = (_b = (_a = prodRow.recon) == null ? void 0 : _a.total_collection) != null ? _b : calculateRowExpectedRev(prodRow);
      window.dsrDraftData.push(row);
    } else {
      row = {
        date,
        prices: { petrol: 113.37, diesel: 98.41 },
        du1_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
        du2_p: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
        du1_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
        du2_d: { open: 0, close_day: 0, close_night: 0, tests_day: 0, tests_night: 0 },
        recon: {},
        actual_collection: 0,
        dip_ms_cm: 0,
        dip_hsd_cm: 0
      };
      window.dsrDraftData.push(row);
    }
  }
  let changed = false;
  if (unitKey === "recon" && fieldKey === "actual_collection") {
    if (row.actual_collection !== num) {
      row.actual_collection = num;
      changed = true;
    }
  } else if (unitKey === "recon" && fieldKey === "dip_ms_cm") {
    if (row.dip_ms_cm !== num) {
      row.dip_ms_cm = num;
      changed = true;
    }
  } else if (unitKey === "recon" && fieldKey === "dip_hsd_cm") {
    if (row.dip_hsd_cm !== num) {
      row.dip_hsd_cm = num;
      changed = true;
    }
  } else if (row[unitKey]) {
    const oldVal = row[unitKey][fieldKey];
    if (oldVal !== num) {
      row[unitKey][fieldKey] = num;
      if (fieldKey === "close_day") {
        row[unitKey]["close_night"] = num;
      }
      propagateDsrOpeningTotalizers();
      changed = true;
    }
  }
  if (changed) {
    saveDsrDraftEdits();
    renderDsrChecker();
    showNotification(`\u270F\uFE0F Value saved to local draft. Click 'Merge to Production' (top-right) to apply and sync changes to Supabase.`, "success");
  } else {
    renderDsrChecker();
  }
};
window.exportDsrJSON = function() {
  if (!window.dsrDraftData) return;
  const jsonStr = JSON.stringify({ master_ledger: window.dsrDraftData }, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `octaneflow_digitized_dsr_draft_${currentDsrMonth}.json`;
  a.click();
};
window.approveAndMergeDsr = function() {
  const issues = validateDsrData(window.dsrDraftData);
  const issueDates = new Set(issues.map((i) => i.date));
  const cleanRows = window.dsrDraftData.filter((row) => !issueDates.has(row.date) && !row.isPlaceholder);
  const dirtyRows = window.dsrDraftData.filter((row) => issueDates.has(row.date));
  if (cleanRows.length === 0) {
    showNotification("\u26A0\uFE0F No clean/verified entries found to merge. Please resolve issues first.", "warning");
    return;
  }
  if (!confirm(`Are you sure you want to merge ${cleanRows.length} clean/verified DSR records to the production daily ledger? (The remaining ${dirtyRows.length} records with issues/gaps will stay in review).`)) {
    return;
  }
  const session = getSession();
  const approvedBy = session ? session.username : "owner";
  const approvedAt = (/* @__PURE__ */ new Date()).toISOString();
  let mergeCount = 0;
  cleanRows.forEach((row) => {
    let existingRow = db.master_ledger.find((r) => r.date === row.date);
    let oldNetP = 0;
    let oldNetD = 0;
    if (existingRow) {
      try {
        const oldCalc = computeLedgerRow(existingRow);
        oldNetP = oldCalc.totals.net_24h.petrol || 0;
        oldNetD = oldCalc.totals.net_24h.diesel || 0;
      } catch (e) {
      }
    }
    const newRow = JSON.parse(JSON.stringify(row));
    const actualColl = newRow.actual_collection !== void 0 ? newRow.actual_collection : calculateRowExpectedRev(newRow);
    newRow.recon = {
      cash: actualColl,
      phonepe: 0,
      credit: 0,
      total_collection: actualColl,
      remarks: "OCR Digitized DSR"
    };
    delete newRow.actual_collection;
    newRow._approved_by = approvedBy;
    newRow._approved_at = approvedAt;
    newRow._submitted_by = "ocr";
    try {
      const newCalc = computeLedgerRow(newRow);
      const newNetP = newCalc.totals.net_24h.petrol || 0;
      const newNetD = newCalc.totals.net_24h.diesel || 0;
      db.stock.petrol = Math.max(0, db.stock.petrol + oldNetP - newNetP);
      db.stock.diesel = Math.max(0, db.stock.diesel + oldNetD - newNetD);
    } catch (e) {
    }
    if (existingRow) {
      const idx = db.master_ledger.indexOf(existingRow);
      db.master_ledger[idx] = newRow;
    } else {
      db.master_ledger.push(newRow);
    }
    mergeCount++;
  });
  db.master_ledger.sort((a, b) => b.date.localeCompare(a.date));
  saveDB();
  window.dsrDraftData = dirtyRows;
  if (dirtyRows.length === 0) {
    localStorage.removeItem("octaneflow_dsr_draft_edits");
  } else {
    localStorage.setItem("octaneflow_dsr_draft_edits", JSON.stringify(dirtyRows));
  }
  showNotification(`\u{1F389} Successfully merged ${mergeCount} clean DSR entries to the production database. ${dirtyRows.length} entries with issues remain in draft.`, "success");
  initApp();
};
window.submitRowToLedger = function(date) {
  const row = window.dsrDraftData.find((r) => r.date === date);
  if (!row) {
    showNotification("\u26A0\uFE0F Cannot submit placeholder or empty row. Please enter some values first.", "warning");
    return;
  }
  const session = getSession();
  const approvedBy = session ? session.username : "owner";
  const approvedAt = (/* @__PURE__ */ new Date()).toISOString();
  let existingRow = db.master_ledger.find((r) => r.date === row.date);
  let oldNetP = 0;
  let oldNetD = 0;
  if (existingRow) {
    try {
      const oldCalc = computeLedgerRow(existingRow);
      oldNetP = oldCalc.totals.net_24h.petrol || 0;
      oldNetD = oldCalc.totals.net_24h.diesel || 0;
    } catch (e) {
    }
  }
  const newRow = JSON.parse(JSON.stringify(row));
  const actualColl = newRow.actual_collection !== void 0 ? newRow.actual_collection : calculateRowExpectedRev(newRow);
  newRow.recon = {
    cash: actualColl,
    phonepe: 0,
    credit: 0,
    total_collection: actualColl,
    remarks: "OCR Digitized DSR"
  };
  delete newRow.actual_collection;
  delete newRow.isPlaceholder;
  newRow._approved_by = approvedBy;
  newRow._approved_at = approvedAt;
  newRow._submitted_by = "ocr";
  try {
    const newCalc = computeLedgerRow(newRow);
    const newNetP = newCalc.totals.net_24h.petrol || 0;
    const newNetD = newCalc.totals.net_24h.diesel || 0;
    db.stock.petrol = Math.max(0, db.stock.petrol + oldNetP - newNetP);
    db.stock.diesel = Math.max(0, db.stock.diesel + oldNetD - newNetD);
  } catch (e) {
  }
  if (existingRow) {
    const idx = db.master_ledger.indexOf(existingRow);
    db.master_ledger[idx] = newRow;
  } else {
    db.master_ledger.push(newRow);
  }
  db.master_ledger.sort((a, b) => b.date.localeCompare(a.date));
  saveDB();
  window.dsrDraftData = window.dsrDraftData.filter((r) => r.date !== date);
  if (window.dsrDraftData.length === 0) {
    localStorage.removeItem("octaneflow_dsr_draft_edits");
  } else {
    localStorage.setItem("octaneflow_dsr_draft_edits", JSON.stringify(window.dsrDraftData));
  }
  showNotification(`\u{1F389} Successfully submitted DSR entry for ${formatDate(date)} to sales ledger.`, "success");
  initApp();
};
window.renderDsrChecker = renderDsrChecker;
window.applyStockAnchor = function() {
  const dateEl = document.getElementById("anchor-date");
  const petrolEl = document.getElementById("anchor-petrol");
  const dieselEl = document.getElementById("anchor-diesel");
  const statusEl = document.getElementById("anchor-status");
  const date = dateEl == null ? void 0 : dateEl.value;
  const petrol_L = parseFloat(petrolEl == null ? void 0 : petrolEl.value);
  const diesel_L = parseFloat(dieselEl == null ? void 0 : dieselEl.value);
  if (!date || isNaN(petrol_L) || isNaN(diesel_L)) {
    if (statusEl) statusEl.textContent = "\u26A0\uFE0F Please fill in date, petrol L and diesel L.";
    return;
  }
  if (!db.settings) db.settings = {};
  db.settings.stock_anchor = { date, petrol_L, diesel_L };
  saveDB();
  if (statusEl) {
    statusEl.textContent = `\u2705 Anchor set: ${date} | Petrol ${petrol_L.toFixed(0)} L | Diesel ${diesel_L.toFixed(0)} L`;
    statusEl.style.color = "#10b981";
  }
  renderLedger();
  showNotification(`\u2693 Stock anchor set for ${date}. All historical inventory recalculated!`, "success");
};
window.clearStockAnchor = function() {
  if (db.settings) delete db.settings.stock_anchor;
  saveDB();
  const statusEl = document.getElementById("anchor-status");
  if (statusEl) {
    statusEl.textContent = "Anchor cleared.";
    statusEl.style.color = "var(--text-muted)";
  }
  renderLedger();
};
function loadAnchorUI() {
  var _a, _b, _c;
  const anchor = (_a = db.settings) == null ? void 0 : _a.stock_anchor;
  if (!anchor) return;
  const dateEl = document.getElementById("anchor-date");
  const petrolEl = document.getElementById("anchor-petrol");
  const dieselEl = document.getElementById("anchor-diesel");
  const statusEl = document.getElementById("anchor-status");
  if (dateEl) dateEl.value = anchor.date || "";
  if (petrolEl) petrolEl.value = anchor.petrol_L != null ? anchor.petrol_L : "";
  if (dieselEl) dieselEl.value = anchor.diesel_L != null ? anchor.diesel_L : "";
  if (statusEl) {
    statusEl.textContent = `\u2705 Active anchor: ${anchor.date} | P ${(_b = anchor.petrol_L) == null ? void 0 : _b.toFixed(0)} L | D ${(_c = anchor.diesel_L) == null ? void 0 : _c.toFixed(0)} L`;
    statusEl.style.color = "#10b981";
  }
}
window.loadAnchorUI = loadAnchorUI;
function toggleExpensePopover(event, date) {
  event.stopPropagation();
  const openPopovers = document.querySelectorAll(".expense-popover");
  openPopovers.forEach((p) => p.remove());
  const dayExps = typeof KC_EXPENSES_DATA !== "undefined" ? KC_EXPENSES_DATA[date] : null;
  if (!dayExps || dayExps.length === 0) return;
  const container = event.target.closest(".expense-popover-container");
  if (!container) return;
  const popover = document.createElement("div");
  popover.className = "expense-popover";
  let listHtml = "";
  dayExps.forEach((it) => {
    const amtStr = typeof it.amount === "number" ? "\u20B9 " + it.amount.toFixed(0) : it.amount;
    listHtml += `<div class="expense-popover-item"><span>${it.name}</span><span class="item-val">${amtStr}</span></div>`;
  });
  popover.innerHTML = `
    <div class="expense-popover-header">
      <span class="expense-popover-title">DSR Expenses: ${formatDate(date)}</span>
      <button class="expense-popover-close" onclick="this.closest('.expense-popover').remove()">&times;</button>
    </div>
    <div class="expense-popover-list">
      ${listHtml}
    </div>
  `;
  container.appendChild(popover);
  const closeHandler = (e) => {
    if (!popover.contains(e.target) && e.target !== event.target) {
      popover.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  document.addEventListener("click", closeHandler);
}
window.toggleExpensePopover = toggleExpensePopover;
window.jumpToDsrCell = function(date, unit, field) {
  const rowEl = document.getElementById(`dsr-row-${date}`);
  if (!rowEl) return;
  rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
  const span = rowEl.querySelector(`span[onblur*="'${unit}'"][onblur*="'${field}'"]`);
  if (span) {
    span.style.transition = "none";
    span.style.background = "#facc15";
    span.style.color = "#000";
    span.style.fontWeight = "800";
    span.style.borderRadius = "4px";
    setTimeout(() => {
      span.focus();
      const range = document.createRange();
      range.selectNodeContents(span);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 350);
    setTimeout(() => {
      span.style.transition = "all 1s ease";
      span.style.background = "";
      span.style.color = "";
      span.style.fontWeight = "";
    }, 1500);
  }
};
let tempModalExpenses = [];
function renderModalExpenses() {
  const container = document.getElementById("modal-expenses-list");
  if (!container) return;
  if (tempModalExpenses.length === 0) {
    container.innerHTML = `<div style="color: var(--text-dim); text-align: center; padding: 0.5rem;">No daily cash expenses logged for this date.</div>`;
    return;
  }
  container.innerHTML = "";
  tempModalExpenses.forEach((exp, idx) => {
    const div = document.createElement("div");
    div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:4px 8px; border-radius:4px; margin-bottom: 2px;";
    div.innerHTML = `
      <span class="modal-expense-name"></span>
      <div style="display:flex; gap:10px; align-items:center;">
        <span style="font-weight:700; color:var(--primary);">\u20B9 ${exp.amount.toFixed(0)}</span>
        <button type="button" onclick="deleteModalExpense(${idx})" style="background:none; border:none; color:#ef4444; font-size:1.1rem; line-height:1; cursor:pointer; padding:0 4px;">&times;</button>
      </div>
    `;
    div.querySelector(".modal-expense-name").textContent = exp.name;
    container.appendChild(div);
  });
}
function addModalExpense() {
  const nameInput = document.getElementById("new-dayexp-name");
  const amtInput = document.getElementById("new-dayexp-amount");
  if (!nameInput || !amtInput) return;
  const name = nameInput.value.trim();
  const amt = parseFloat(amtInput.value);
  if (!name || isNaN(amt) || amt <= 0) {
    showNotification("Please enter a valid description and amount.", "warning");
    return;
  }
  tempModalExpenses.push({ name, amount: amt });
  nameInput.value = "";
  amtInput.value = "";
  renderModalExpenses();
}
function deleteModalExpense(idx) {
  tempModalExpenses.splice(idx, 1);
  renderModalExpenses();
}
window.addModalExpense = addModalExpense;
window.deleteModalExpense = deleteModalExpense;
