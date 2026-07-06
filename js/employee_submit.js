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
function initIntelligentDataEntryFlow() {
  const shell = document.getElementById("employee-shell");
  if (!shell || shell._intelligentFlowAttached) return;
  shell._intelligentFlowAttached = true;
  shell.addEventListener("focusin", (e) => {
    if (e.target.tagName.toLowerCase() === "input") {
      setTimeout(() => e.target.select(), 10);
    }
  });
  const advanceToNext = (currentEl) => {
    const focusables = Array.from(shell.querySelectorAll("input, select, button, textarea"));
    const eligible = focusables.filter((el) => {
      if (el.disabled || el.readOnly || el.type === "hidden" || el.style.display === "none" || el.offsetWidth === 0 || el.offsetHeight === 0) return false;
      const details = el.closest("details");
      if (details && !details.open) return false;
      return true;
    });
    const currentIndex = eligible.indexOf(currentEl);
    if (currentIndex >= 0 && currentIndex + 1 < eligible.length) {
      const nextEl = eligible[currentIndex + 1];
      nextEl.focus();
    }
  };
  shell.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const el = document.activeElement;
      if (el.tagName.toLowerCase() === "textarea") return;
      if (el.tagName.toLowerCase() === "button") return;
      e.preventDefault();
      if (el.checkValidity && !el.checkValidity()) {
        el.reportValidity();
        return;
      }
      advanceToNext(el);
    }
  });
  shell.addEventListener("change", (e) => {
    if (e.target.tagName.toLowerCase() === "select" && document.activeElement === e.target) {
      advanceToNext(e.target);
    }
  });
}
function updateEmpOpeningHints() {
  var _a, _b, _c, _d;
  updateEmpSubmissionTypeView();
  const dayVal = (_a = document.getElementById("emp-date-day")) == null ? void 0 : _a.value;
  const monthVal = (_b = document.getElementById("emp-date-month")) == null ? void 0 : _b.value;
  const yearVal = (_c = document.getElementById("emp-date-year")) == null ? void 0 : _c.value;
  const shiftVal = ((_d = document.getElementById("emp-shift")) == null ? void 0 : _d.value) || "day";
  const nozzles = [
    { key: "du1_p", hintId: "hint-du1p", inputId: "emp-du1p-open" },
    { key: "du1_d", hintId: "hint-du1d", inputId: "emp-du1d-open" },
    { key: "du2_p", hintId: "hint-du2p", inputId: "emp-du2p-open" },
    { key: "du2_d", hintId: "hint-du2d", inputId: "emp-du2d-open" }
  ];
  nozzles.forEach(({ key, hintId, inputId }) => {
    const hintEl = document.getElementById(hintId);
    const inputEl = document.getElementById(inputId);
    if (!hintEl || !inputEl) return;
    if (dayVal && monthVal && yearVal) {
      const dateStr = `${yearVal}-${monthVal.padStart(2, "0")}-${dayVal.padStart(2, "0")}`;
      const val = getNozzleOpeningReading(key, dateStr, shiftVal);
      if (val > 0) {
        hintEl.textContent = `Expected: ${val.toFixed(2)}`;
        hintEl.style.display = "block";
        inputEl.placeholder = val.toFixed(2);
      } else {
        hintEl.style.display = "none";
        inputEl.placeholder = "0.00";
      }
    } else {
      hintEl.style.display = "none";
    }
  });
  updateEmpLiveCalc();
}
function updateDenominationTotal() {
  var _a, _b, _c, _d, _e, _f;
  const d500 = sanitizeNumber((_a = document.getElementById("denom-500")) == null ? void 0 : _a.value);
  const d200 = sanitizeNumber((_b = document.getElementById("denom-200")) == null ? void 0 : _b.value);
  const d100 = sanitizeNumber((_c = document.getElementById("denom-100")) == null ? void 0 : _c.value);
  const d50 = sanitizeNumber((_d = document.getElementById("denom-50")) == null ? void 0 : _d.value);
  const d20 = sanitizeNumber((_e = document.getElementById("denom-20")) == null ? void 0 : _e.value);
  const d10 = sanitizeNumber((_f = document.getElementById("denom-10")) == null ? void 0 : _f.value);
  const total = d500 * 500 + d200 * 200 + d100 * 100 + d50 * 50 + d20 * 20 + d10 * 10;
  const totalDisplay = document.getElementById("denom-total-display");
  if (totalDisplay) {
    totalDisplay.textContent = "\u20B9 " + total.toLocaleString("en-IN");
  }
  const cashInput = document.getElementById("emp-cash");
  if (cashInput) {
    cashInput.value = total.toLocaleString("en-IN");
    if (typeof updateEmpLiveCalc === "function") updateEmpLiveCalc();
  }
}
function updateEmpLiveCalc() {
  var _a, _b, _c, _d;
  const shift = ((_a = document.getElementById("emp-shift")) == null ? void 0 : _a.value) || "day";
  const dayVal = (_b = document.getElementById("emp-date-day")) == null ? void 0 : _b.value;
  const monthVal = (_c = document.getElementById("emp-date-month")) == null ? void 0 : _c.value;
  const yearVal = (_d = document.getElementById("emp-date-year")) == null ? void 0 : _d.value;
  let dateStr = "";
  if (dayVal && monthVal && yearVal) {
    dateStr = `${yearVal}-${monthVal.padStart(2, "0")}-${dayVal.padStart(2, "0")}`;
  }
  const prices = dateStr ? getPricesAt(dateStr) : { petrol: 0, diesel: 0 };
  const nozzles = [
    { openId: "emp-du1p-open", closeId: "emp-du1p-close", testsId: "emp-du1p-tests", previewId: "calc-du1p", fuel: "petrol" },
    { openId: "emp-du1d-open", closeId: "emp-du1d-close", testsId: "emp-du1d-tests", previewId: "calc-du1d", fuel: "diesel" },
    { openId: "emp-du2p-open", closeId: "emp-du2p-close", testsId: "emp-du2p-tests", previewId: "calc-du2p", fuel: "petrol" },
    { openId: "emp-du2d-open", closeId: "emp-du2d-close", testsId: "emp-du2d-tests", previewId: "calc-du2d", fuel: "diesel" }
  ];
  let totalLitres = 0;
  let totalRevenue = 0;
  nozzles.forEach(({ openId, closeId, testsId, previewId, fuel }) => {
    var _a2, _b2, _c2;
    const open = sanitizeNumber((_a2 = document.getElementById(openId)) == null ? void 0 : _a2.value);
    const close = sanitizeNumber((_b2 = document.getElementById(closeId)) == null ? void 0 : _b2.value);
    const tests = sanitizeNumber((_c2 = document.getElementById(testsId)) == null ? void 0 : _c2.value);
    const previewEl = document.getElementById(previewId);
    if (!previewEl) return;
    if (open <= 0 && close <= 0) {
      previewEl.style.display = "none";
      return;
    }
    const litres = Math.max(0, close - open - tests);
    const price = prices[fuel] || 0;
    const manualPriceEl = document.getElementById(previewId + "-manual-price");
    const effectivePrice = manualPriceEl && sanitizeNumber(manualPriceEl.value) > 0 ? sanitizeNumber(manualPriceEl.value) : price;
    const effectiveRevenue = litres * effectivePrice;
    totalLitres += litres;
    totalRevenue += effectiveRevenue;
    const isManual = manualPriceEl && sanitizeNumber(manualPriceEl.value) > 0;
    previewEl.style.display = "flex";
    previewEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.35rem;">
        <span style="font-size:0.75rem;color:#94a3b8;">Litres sold</span>
        <strong style="color:#fff;font-size:0.85rem;">${litres.toFixed(2)} L</strong>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.35rem;">
        <span style="font-size:0.75rem;color:#94a3b8;">Price/L ${isManual ? '<span style="color:#f97316;font-size:0.65rem;">\u26A0\uFE0F Manual</span>' : '<span style="color:#22c55e;font-size:0.65rem;">System \u2713</span>'}</span>
        <span style="font-size:0.75rem;color:#f8fafc;">\u20B9 ${effectivePrice.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.35rem;border-top:1px solid rgba(255,255,255,0.06);padding-top:0.35rem;">
        <span style="font-size:0.75rem;color:#94a3b8;">Est. Revenue</span>
        <strong style="color:#22c55e;font-size:0.9rem;">\u20B9 ${effectiveRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</strong>
      </div>
    `;
  });
  updatePhonePeDeltaPreview();
  const totalsEl = document.getElementById("emp-live-totals");
  if (totalsEl) {
    if (totalLitres > 0) {
      totalsEl.style.display = "flex";
      totalsEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.8rem;color:#94a3b8;font-weight:600;">Total Shift Sale</span>
          <span style="font-size:0.95rem;font-weight:800;color:#fff;">${totalLitres.toFixed(2)} L</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.8rem;color:#94a3b8;font-weight:600;">Est. Total Revenue</span>
          <span style="font-size:0.95rem;font-weight:800;color:#22c55e;">\u20B9 ${totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
        </div>
      `;
    } else {
      totalsEl.style.display = "none";
    }
  }
}
function updatePhonePeDeltaPreview() {
  var _a, _b, _c, _d;
  const shift = ((_a = document.getElementById("emp-shift")) == null ? void 0 : _a.value) || "day";
  const ppOpen = sanitizeNumber((_b = document.getElementById("emp-pp-open")) == null ? void 0 : _b.value);
  const ppMid = sanitizeNumber((_c = document.getElementById("emp-pp-midnight")) == null ? void 0 : _c.value);
  const ppClose = sanitizeNumber((_d = document.getElementById("emp-pp-close")) == null ? void 0 : _d.value);
  const previewEl = document.getElementById("pp-delta-preview");
  if (!previewEl) return;
  if (ppOpen <= 0 && ppClose <= 0) {
    previewEl.style.display = "none";
    return;
  }
  let delta = 0;
  let formula = "";
  let warning = "";
  if (shift === "night" && ppMid > 0) {
    delta = ppMid - ppOpen + ppClose;
    formula = `(\u20B9${ppMid.toLocaleString("en-IN")} \u2212 \u20B9${ppOpen.toLocaleString("en-IN")}) + \u20B9${ppClose.toLocaleString("en-IN")}`;
  } else {
    delta = ppClose - ppOpen;
    formula = `\u20B9${ppClose.toLocaleString("en-IN")} \u2212 \u20B9${ppOpen.toLocaleString("en-IN")}`;
    if (shift === "night" && delta < 0) {
      warning = "\u26A0\uFE0F Negative result \u2014 did you forget to enter the midnight reading?";
    }
  }
  previewEl.style.display = "flex";
  previewEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
      <span style="font-size:0.75rem;color:#94a3b8;">PhonePe this shift</span>
      <span style="font-size:0.75rem;color:#64748b;font-style:italic;">${formula}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:0.8rem;color:#94a3b8;font-weight:600;">= PhonePe Collected</span>
      <strong style="font-size:1rem;color:${delta < 0 ? "#ef4444" : "#38bdf8"}">\u20B9 ${delta.toLocaleString("en-IN")}</strong>
    </div>
    ${warning ? `<div style="font-size:0.72rem;color:#f97316;margin-top:0.2rem;">${warning}</div>` : ""}
  `;
}
function updateEmpShiftMode() {
  var _a;
  const shift = ((_a = document.getElementById("emp-shift")) == null ? void 0 : _a.value) || "day";
  const midnightRow = document.getElementById("pp-midnight-row");
  if (midnightRow) {
    midnightRow.style.display = shift === "night" ? "flex" : "none";
  }
  updateEmpOpeningHints();
}
function renderEmployeeView(session) {
  initIntelligentDataEntryFlow();
  const nameEl = document.getElementById("emp-user-name");
  if (nameEl) nameEl.textContent = session.displayName;
  initEmployeeDatePicker();
  const dayEl = document.getElementById("emp-date-day");
  const monthEl = document.getElementById("emp-date-month");
  const yearEl = document.getElementById("emp-date-year");
  const shiftEl = document.getElementById("emp-shift");
  const hintTriggers = [dayEl, monthEl, yearEl];
  hintTriggers.forEach((el) => {
    if (el && !el._listened) {
      el._listened = true;
      el.addEventListener("change", updateEmpOpeningHints);
    }
  });
  if (shiftEl && !shiftEl._listened) {
    shiftEl._listened = true;
    shiftEl.addEventListener("change", updateEmpShiftMode);
  }
  const calcFields = [
    "emp-du1p-open",
    "emp-du1p-close",
    "emp-du1p-tests",
    "emp-du1d-open",
    "emp-du1d-close",
    "emp-du1d-tests",
    "emp-du2p-open",
    "emp-du2p-close",
    "emp-du2p-tests",
    "emp-du2d-open",
    "emp-du2d-close",
    "emp-du2d-tests",
    "emp-pp-open",
    "emp-pp-midnight",
    "emp-pp-close"
  ];
  calcFields.forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el._calcListened) {
      el._calcListened = true;
      el.addEventListener("input", updateEmpLiveCalc);
    }
  });
  updateEmpOpeningHints();
  updateEmpShiftMode();
  const subs = (db.pending_entries || []).filter((e) => e.submittedBy === session.username && e.submission_type !== "device_registration").sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const listEl = document.getElementById("emp-submissions-list");
  if (listEl) {
    listEl.innerHTML = subs.length === 0 ? '<p style="color:#64748b;text-align:center;padding:2rem;">No submissions yet.</p>' : subs.map((s) => {
      const sc = s.status === "approved" ? "#22c55e" : s.status === "rejected" ? "#ef4444" : "#f97316";
      const si = s.status === "approved" ? "\u2705" : s.status === "rejected" ? "\u274C" : "\u23F3";
      return `
            <div style="background:#1e293b;border:1px solid #334155;border-left:3px solid ${sc};border-radius:0.75rem;padding:1rem;margin-bottom:0.75rem;">
               <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;color:#f8fafc;">${s.entryData.date} \xB7 ${s.entryData.shift === "day" ? "\u2600\uFE0F Day" : "\u{1F319} Night"}</span>
                <span style="color:${sc};font-weight:700;font-size:0.8rem;">${si} ${s.status.toUpperCase()}</span>
              </div>
              <div style="font-size:0.75rem;color:#64748b;margin-top:0.2rem;">Submitted: ${s.submittedAt.replace("T", " ").slice(0, 16)}</div>
              ${s.status === "rejected" && s.rejectionReason ? `<div style="margin-top:0.5rem;padding:0.5rem;background:rgba(239,68,68,0.1);border-radius:0.4rem;color:#fca5a5;font-size:0.8rem;">\u274C ${s.rejectionReason}</div>` : ""}
            </div>`;
    }).join("");
  }
  const submitBtn = document.getElementById("emp-submit-btn");
  if (submitBtn && !submitBtn._wired) {
    submitBtn._wired = true;
    submitBtn.addEventListener("click", () => submitEmployeeReading(session));
  }
}
function submitEmployeeReading(session) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const numericIds = [
      "emp-du1p-open",
      "emp-du1p-close",
      "emp-du1p-tests",
      "emp-du1d-open",
      "emp-du1d-close",
      "emp-du1d-tests",
      "emp-du2p-open",
      "emp-du2p-close",
      "emp-du2p-tests",
      "emp-du2d-open",
      "emp-du2d-close",
      "emp-du2d-tests",
      "emp-kharcha",
      "emp-phonepe",
      "emp-card",
      "emp-paytm",
      "emp-credit-sales",
      "emp-deposit-amount"
    ];
    for (const id of numericIds) {
      const el = document.getElementById(id);
      if (el && el.value.trim() !== "") {
        if (isNaN(Number(el.value.trim()))) {
          showNotification(`\u26A0\uFE0F Form Error: Invalid numeric value entered in one of the fields. Please check and try again.`, "danger");
          return;
        }
      }
    }
    const val = (id) => {
      var _a2;
      return sanitizeNumber((_a2 = document.getElementById(id)) == null ? void 0 : _a2.value);
    };
    const int = (id) => {
      var _a2;
      return Math.floor(sanitizeNumber((_a2 = document.getElementById(id)) == null ? void 0 : _a2.value));
    };
    const dayStr = ((_a = document.getElementById("emp-date-day")) == null ? void 0 : _a.value) || "";
    const monthStr = ((_b = document.getElementById("emp-date-month")) == null ? void 0 : _b.value) || "";
    const yearStr = ((_c = document.getElementById("emp-date-year")) == null ? void 0 : _c.value) || "";
    if (!dayStr || !monthStr || !yearStr) {
      showNotification("Please select a date.", "danger");
      return;
    }
    const date = `${yearStr}-${monthStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;
    const todayStr = (/* @__PURE__ */ new Date()).toLocaleDateString("en-CA");
    if (date > todayStr) {
      showNotification("\u26A0\uFE0F Validation Error: Cannot submit readings for future dates!", "danger");
      return;
    }
    const shift = ((_d = document.getElementById("emp-shift")) == null ? void 0 : _d.value) || "day";
    const submissionType = ((_e = document.getElementById("emp-submission-type")) == null ? void 0 : _e.value) || "closing";
    const duplicateEntry = findDuplicateSubmission({
      submissionType,
      entryData: { date, shift },
      submittedBy: session.username
    });
    if (duplicateEntry) {
      showNotification("\u26A0\uFE0F This submission already exists and is being processed. Please wait for it to finish syncing.", "warning");
      return;
    }
    if (submissionType === "deposit") {
      const depositAmount = val("emp-deposit-amount");
      if (depositAmount <= 0) {
        showNotification("\u26A0\uFE0F Validation Error: Please enter a valid deposit amount.", "danger");
        return;
      }
      if (!confirm(`Are you sure you want to submit a Cash Deposit of \u20B9${depositAmount.toLocaleString("en-IN")}?`)) {
        return;
      }
      const entry2 = buildPendingSubmissionEntry({
        session,
        submissionType: "deposit",
        entryData: {
          date,
          shift,
          deposit_amount: depositAmount,
          remarks: ((_g = (_f = document.getElementById("emp-remarks")) == null ? void 0 : _f.value) == null ? void 0 : _g.trim()) || ""
        },
        deviceId: getDeviceId()
      });
      const submitBtn2 = document.getElementById("emp-submit-btn");
      const originalText2 = submitBtn2 ? submitBtn2.innerHTML : "Submit Shift Readings";
      if (submitBtn2) {
        submitBtn2.disabled = true;
        submitBtn2.innerHTML = `⏳ Uploading...`;
      }
      
      const isOnline = navigator.onLine;
      if (!isOnline) {
        showNotification("💾 Saved Offline (waiting for internet)", "warning");
      } else {
        showNotification("☁️ Uploading cash deposit...", "info");
      }

      if (!db.pending_entries) db.pending_entries = [];
      db.pending_entries.push(entry2);
      buildIndexes();
      
      saveDB(true, true).then((success) => {
        if (submitBtn2) {
          submitBtn2.disabled = false;
          submitBtn2.innerHTML = originalText2;
        }
        if (success) {
          showNotification(`✅ Submitted Successfully / Upload Complete! Office Cash Deposit of ₹${depositAmount.toLocaleString("en-IN")} uploaded.`, "success");
          ["emp-deposit-amount", "emp-remarks"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
          });
          renderEmployeeView(session);
        } else {
          showNotification(`❌ Upload Failed. Saved locally, retrying in background.`, "danger");
          renderEmployeeView(session);
        }
      });
      return;
    }
    const checkNozzle = (prefix, label) => {
      var _a2, _b2, _c2;
      const openInput = (_a2 = document.getElementById(`${prefix}-open`)) == null ? void 0 : _a2.value;
      const closeInput = (_b2 = document.getElementById(`${prefix}-close`)) == null ? void 0 : _b2.value;
      const testsInput = (_c2 = document.getElementById(`${prefix}-tests`)) == null ? void 0 : _c2.value;
      const open = sanitizeNumber(openInput);
      const close = sanitizeNumber(closeInput);
      const tests = sanitizeNumber(testsInput);
      if (openInput && open < 0 || closeInput && close < 0 || testsInput && tests < 0) {
        return { type: "error", msg: `${label} readings cannot be negative.` };
      }
      if (openInput && closeInput && close > 0 && open > 0) {
        if (close < open) {
          return { type: "rollback", msg: `${label} closing reading (${close}) is less than opening reading (${open}).`, prefix };
        }
        if (close - open < tests) {
          return { type: "error", msg: `${label} tests (${tests} L) cannot be greater than the totalizer difference (${(close - open).toFixed(2)} L).` };
        }
      }
      return null;
    };
    const err1 = checkNozzle("emp-du1p", "DU1 Petrol");
    const err2 = checkNozzle("emp-du2p", "DU2 Petrol");
    const err3 = checkNozzle("emp-du1d", "DU1 Diesel");
    const err4 = checkNozzle("emp-du2d", "DU2 Diesel");
    const errors = [err1, err2, err3, err4].filter((e) => e !== null);
    const resetPrefixes = [];
    for (const err of errors) {
      if (err.type === "error") {
        if (typeof showGlobalError === "function") {
          showGlobalError("Validation Error: " + err.msg);
        } else {
          showNotification(`\u26A0\uFE0F Validation Error: ${err.msg}`, "danger");
        }
        return;
      }
      if (err.type === "rollback") {
        if (confirm(`\u26A0\uFE0F Rollback detected:
${err.msg}

Is this an authorized meter replacement or reset? Click OK to submit for owner approval.`)) {
          resetPrefixes.push(err.prefix);
        } else {
          return;
        }
      }
    }
    const getNozzleLiters = (prefix) => {
      const open = val(`${prefix}-open`);
      const close = val(`${prefix}-close`);
      const tests = val(`${prefix}-tests`);
      return Math.max(0, close - open - tests);
    };
    const du1_p_liters = getNozzleLiters("emp-du1p");
    const du2_p_liters = getNozzleLiters("emp-du2p");
    const du1_d_liters = getNozzleLiters("emp-du1d");
    const du2_d_liters = getNozzleLiters("emp-du2d");
    const totalPetrolLiters = du1_p_liters + du2_p_liters;
    const totalDieselLiters = du1_d_liters + du2_d_liters;
    const totalLiters = totalPetrolLiters + totalDieselLiters;
    const warnings = [];
    if (totalLiters === 0) {
      warnings.push("Total shift sales volume is 0 Liters.");
    }
    if (du1_p_liters > 5e3) warnings.push(`DU1 Petrol sales volume (${du1_p_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
    if (du2_p_liters > 5e3) warnings.push(`DU2 Petrol sales volume (${du2_p_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
    if (du1_d_liters > 5e3) warnings.push(`DU1 Diesel sales volume (${du1_d_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
    if (du2_d_liters > 5e3) warnings.push(`DU2 Diesel sales volume (${du2_d_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
    const prices = getPricesAt(date);
    const estimatedRevenue = totalPetrolLiters * prices.petrol + totalDieselLiters * prices.diesel;
    const cashEntered = val("emp-cash");
    const cardEntered = val("emp-card");
    const ppOpen = val("emp-pp-open");
    const ppMidnight = shift === "night" ? val("emp-pp-midnight") : 0;
    const ppClose = val("emp-pp-close");
    let ppCollection = 0;
    if (shift === "night" && ppMidnight > 0) {
      ppCollection = ppMidnight - ppOpen + ppClose;
    } else {
      ppCollection = Math.max(0, ppClose - ppOpen);
    }
    const totalCollections = cashEntered + cardEntered + ppCollection;
    if (estimatedRevenue > 0) {
      const discrepancy = totalCollections - estimatedRevenue;
      const absDiscrepancy = Math.abs(discrepancy);
      const ratio = totalCollections / estimatedRevenue;
      if (ratio > 1.5 && absDiscrepancy > 15e3) {
        warnings.push(`Collections (${formatCurrency(totalCollections)}) are more than 1.5x of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is +${formatCurrency(absDiscrepancy)}.`);
      } else if (ratio < 0.1 && estimatedRevenue > 1e3) {
        warnings.push(`Collections (${formatCurrency(totalCollections)}) are less than 10% of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is -${formatCurrency(absDiscrepancy)}.`);
      } else if (absDiscrepancy > 15e3) {
        warnings.push(`There is a significant difference of ${formatCurrency(discrepancy)} between collections (${formatCurrency(totalCollections)}) and estimated fuel revenue (${formatCurrency(estimatedRevenue)}).`);
      }
    } else if (totalCollections > 0) {
      warnings.push(`Collections entered (${formatCurrency(totalCollections)}) but estimated revenue is 0 (0 Liters sold).`);
    }
    if (warnings.length > 0) {
      const msg = "\u26A0\uFE0F Warning: Potential errors detected in your entry:\n\n" + warnings.map((w) => "\u2022 " + w).join("\n") + "\n\nAre you sure you want to submit this data?";
      if (!confirm(msg)) {
        return;
      }
    }
    const mkNozzle = (prefix, s) => {
      const openVal = val(`${prefix}-open`);
      const closeVal = val(`${prefix}-close`);
      const testsVal = int(`${prefix}-tests`);
      return {
        open: openVal,
        close_day: s === "day" ? closeVal : 0,
        close_night: s === "night" ? closeVal : 0,
        tests_day: s === "day" ? testsVal : 0,
        tests_night: s === "night" ? testsVal : 0,
        is_reset: resetPrefixes.includes(prefix)
      };
    };
    const manualPrices = {};
    ["du1p", "du1d", "du2p", "du2d"].forEach((nozzle) => {
      const el = document.getElementById(`calc-${nozzle}-manual-price`);
      if (el && sanitizeNumber(el.value) > 0) {
        manualPrices[nozzle] = sanitizeNumber(el.value);
      }
    });
    const entry = buildPendingSubmissionEntry({
      session,
      submissionType,
      entryData: {
        date,
        shift,
        du1_p: mkNozzle("emp-du1p", shift),
        du1_d: mkNozzle("emp-du1d", shift),
        du2_p: mkNozzle("emp-du2p", shift),
        du2_d: mkNozzle("emp-du2d", shift),
        cash_sales: val("emp-cash"),
        card_sales: val("emp-card"),
        phonepe_opening: ppOpen,
        phonepe_midnight: ppMidnight,
        phonepe_closing: ppClose,
        phonepe_collection: ppCollection,
        manual_prices: Object.keys(manualPrices).length > 0 ? manualPrices : null,
        remarks: ((_i = (_h = document.getElementById("emp-remarks")) == null ? void 0 : _h.value) == null ? void 0 : _i.trim()) || "",
        photo: window._empPhotoBase64 || null
      },
      deviceId: getDeviceId()
    });
    
    // Daily Safety Net: Check for continuity breaks
    const quarantine_reasons = [];
    const nozzleKeys = [
      { key: "du1_p", prefix: "emp-du1p" },
      { key: "du1_d", prefix: "emp-du1d" },
      { key: "du2_p", prefix: "emp-du2p" },
      { key: "du2_d", prefix: "emp-du2d" }
    ];
    nozzleKeys.forEach(({ key, prefix }) => {
      const openVal = val(`${prefix}-open`);
      const expectedOpen = getNozzleOpeningReading(key, date, shift);
      if (openVal > 0 && expectedOpen > 0 && Math.abs(openVal - expectedOpen) > 0.01) {
        quarantine_reasons.push(`${key.toUpperCase().replace('_', ' ')} continuity break: expected ${expectedOpen.toFixed(2)}, got ${openVal.toFixed(2)}`);
      }
    });
    if (quarantine_reasons.length > 0) {
      entry.entryData.flagged_for_quarantine = true;
      entry.entryData.quarantine_reasons = quarantine_reasons;
    }

    const submitBtn = document.getElementById("emp-submit-btn");
    const originalText = submitBtn ? submitBtn.innerHTML : "Submit Shift Readings";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `⏳ Uploading...`;
    }

    const isOnline = navigator.onLine;
    if (!isOnline) {
      showNotification("💾 Saved Offline (waiting for internet)", "warning");
    } else {
      showNotification("☁️ Uploading shift readings...", "info");
    }

    if (!db.pending_entries) db.pending_entries = [];
    db.pending_entries.push(entry);
    buildIndexes();
    const typeLabel = submissionType === "opening" ? "Opening Reading" : submissionType === "snapshot" ? "Mid-Shift Snapshot" : "Closing Reading";
    
    saveDB(true, true).then((success) => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
      
      // CRITICAL FIX: Always clear the form to prevent accidental duplicate submissions, 
      // regardless of whether the sync succeeded instantly or was queued offline.
      [
        "emp-du1p-open",
        "emp-du1p-close",
        "emp-du1p-tests",
        "emp-du1d-open",
        "emp-du1d-close",
        "emp-du1d-tests",
        "emp-du2p-open",
        "emp-du2p-close",
        "emp-du2p-tests",
        "emp-du2d-open",
        "emp-du2d-close",
        "emp-du2d-tests",
        "emp-cash",
        "emp-card",
        "emp-remarks",
        "emp-pp-open",
        "emp-pp-midnight",
        "emp-pp-close",
        "emp-deposit-amount"
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      ["calc-du1p", "calc-du1d", "calc-du2p", "calc-du2d", "emp-live-totals", "pp-delta-preview"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });
      const today = /* @__PURE__ */ new Date();
      const dEl = document.getElementById("emp-date-day");
      const mEl = document.getElementById("emp-date-month");
      const yEl = document.getElementById("emp-date-year");
      if (dEl) dEl.value = today.getDate();
      if (mEl) mEl.value = today.getMonth() + 1;
      if (yEl) yEl.value = today.getFullYear();

      // Clear photo after submit
      if (typeof removeEmpPhoto === 'function') removeEmpPhoto();

      if (success) {
        showNotification(`✅ Submitted Successfully / Upload Complete! ${typeLabel} submitted and synced.`, "success");
      } else {
        showNotification(`❌ Upload Failed. Saved locally, retrying in background.`, "danger");
      }
      
      // CRITICAL FIX: Removed the dangerous setTimeout(location.reload) which was killing 
      // the background network request mid-flight. Just gracefully re-render the view instead.
      renderEmployeeView(session);
    });
  });
}

// --- Photo Upload Handling ---
window._empPhotoBase64 = null;

function handleEmpPhotoUpload(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  
  // Max 10MB raw
  if (file.size > 10 * 1024 * 1024) {
    showNotification("Photo too large (max 10MB). Try again.", "danger");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Compress: max 800px wide, JPEG quality 0.6
      const MAX_W = 800;
      const MAX_H = 800;
      let w = img.width;
      let h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
      
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      
      const compressed = canvas.toDataURL("image/jpeg", 0.6);
      window._empPhotoBase64 = compressed;
      
      // Show preview
      const preview = document.getElementById("emp-photo-preview");
      const thumb = document.getElementById("emp-photo-thumb");
      const sizeEl = document.getElementById("emp-photo-size");
      if (preview) preview.style.display = "block";
      if (thumb) thumb.src = compressed;
      
      const sizeKB = Math.round(compressed.length * 0.75 / 1024);
      if (sizeEl) sizeEl.textContent = `Compressed: ${sizeKB} KB (${w}×${h}px)`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
window.handleEmpPhotoUpload = handleEmpPhotoUpload;

function removeEmpPhoto() {
  window._empPhotoBase64 = null;
  const preview = document.getElementById("emp-photo-preview");
  const thumb = document.getElementById("emp-photo-thumb");
  const input = document.getElementById("emp-photo-input");
  if (preview) preview.style.display = "none";
  if (thumb) thumb.src = "";
  if (input) input.value = "";
}
window.removeEmpPhoto = removeEmpPhoto;
