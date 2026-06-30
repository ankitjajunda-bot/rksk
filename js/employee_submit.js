// ── Employee: Submit Reading form ──────────────────────────
// Shows hint text under each opening field instead of pre-filling the value
function updateEmpOpeningHints() {
  updateEmpSubmissionTypeView();
  const dayVal   = document.getElementById('emp-date-day')?.value;
  const monthVal = document.getElementById('emp-date-month')?.value;
  const yearVal  = document.getElementById('emp-date-year')?.value;
  const shiftVal = document.getElementById('emp-shift')?.value || 'day';

  const nozzles = [
    { key: 'du1_p', hintId: 'hint-du1p', inputId: 'emp-du1p-open' },
    { key: 'du1_d', hintId: 'hint-du1d', inputId: 'emp-du1d-open' },
    { key: 'du2_p', hintId: 'hint-du2p', inputId: 'emp-du2p-open' },
    { key: 'du2_d', hintId: 'hint-du2d', inputId: 'emp-du2d-open' },
  ];

  nozzles.forEach(({ key, hintId, inputId }) => {
    const hintEl = document.getElementById(hintId);
    const inputEl = document.getElementById(inputId);
    if (!hintEl || !inputEl) return;
    if (dayVal && monthVal && yearVal) {
      const dateStr = `${yearVal}-${monthVal.padStart(2,'0')}-${dayVal.padStart(2,'0')}`;
      const val = getNozzleOpeningReading(key, dateStr, shiftVal);
      if (val > 0) {
        hintEl.textContent = `Expected: ${val.toFixed(2)}`;
        hintEl.style.display = 'block';
        inputEl.placeholder = val.toFixed(2);
      } else {
        hintEl.style.display = 'none';
        inputEl.placeholder = '0.00';
      }
    } else {
      hintEl.style.display = 'none';
    }
    // Never set inputEl.value from history — employee must type it
  });

  // Also update the live calculation preview
  updateEmpLiveCalc();
}

// Live litres + revenue calculation preview for employee form
function updateEmpLiveCalc() {
  const shift = document.getElementById('emp-shift')?.value || 'day';
  const dayVal   = document.getElementById('emp-date-day')?.value;
  const monthVal = document.getElementById('emp-date-month')?.value;
  const yearVal  = document.getElementById('emp-date-year')?.value;
  let dateStr = '';
  if (dayVal && monthVal && yearVal) {
    dateStr = `${yearVal}-${monthVal.padStart(2,'0')}-${dayVal.padStart(2,'0')}`;
  }
  const prices = dateStr ? getPricesAt(dateStr) : { petrol: 0, diesel: 0 };

  const nozzles = [
    { openId:'emp-du1p-open', closeId:'emp-du1p-close', testsId:'emp-du1p-tests', previewId:'calc-du1p', fuel:'petrol' },
    { openId:'emp-du1d-open', closeId:'emp-du1d-close', testsId:'emp-du1d-tests', previewId:'calc-du1d', fuel:'diesel' },
    { openId:'emp-du2p-open', closeId:'emp-du2p-close', testsId:'emp-du2p-tests', previewId:'calc-du2p', fuel:'petrol' },
    { openId:'emp-du2d-open', closeId:'emp-du2d-close', testsId:'emp-du2d-tests', previewId:'calc-du2d', fuel:'diesel' },
  ];

  let totalLitres = 0;
  let totalRevenue = 0;

  nozzles.forEach(({ openId, closeId, testsId, previewId, fuel }) => {
    const open  = parseFloat(document.getElementById(openId)?.value)  || 0;
    const close = parseFloat(document.getElementById(closeId)?.value) || 0;
    const tests = parseFloat(document.getElementById(testsId)?.value) || 0;
    const previewEl = document.getElementById(previewId);
    if (!previewEl) return;

    if (open <= 0 && close <= 0) {
      previewEl.style.display = 'none';
      return;
    }

    const litres = Math.max(0, close - open - tests);
    const price  = prices[fuel] || 0;
    
    const manualPriceEl = document.getElementById(previewId + '-manual-price');
    const effectivePrice = (manualPriceEl && parseFloat(manualPriceEl.value) > 0)
      ? parseFloat(manualPriceEl.value)
      : price;
    const effectiveRevenue = litres * effectivePrice;
    
    totalLitres  += litres;
    totalRevenue += effectiveRevenue;

    const isManual = manualPriceEl && parseFloat(manualPriceEl.value) > 0;

    previewEl.style.display = 'flex';
    previewEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.35rem;">
        <span style="font-size:0.75rem;color:#94a3b8;">Litres sold</span>
        <strong style="color:#fff;font-size:0.85rem;">${litres.toFixed(2)} L</strong>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.35rem;">
        <span style="font-size:0.75rem;color:#94a3b8;">Price/L ${isManual ? '<span style="color:#f97316;font-size:0.65rem;">⚠️ Manual</span>' : '<span style="color:#22c55e;font-size:0.65rem;">System ✓</span>'}</span>
        <span style="font-size:0.75rem;color:#f8fafc;">₹ ${effectivePrice.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.35rem;border-top:1px solid rgba(255,255,255,0.06);padding-top:0.35rem;">
        <span style="font-size:0.75rem;color:#94a3b8;">Est. Revenue</span>
        <strong style="color:#22c55e;font-size:0.9rem;">₹ ${effectiveRevenue.toLocaleString('en-IN',{maximumFractionDigits:0})}</strong>
      </div>
    `;
  });

  // Update PhonePe delta preview
  updatePhonePeDeltaPreview();

  // Totals footer
  const totalsEl = document.getElementById('emp-live-totals');
  if (totalsEl) {
    if (totalLitres > 0) {
      totalsEl.style.display = 'flex';
      totalsEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.8rem;color:#94a3b8;font-weight:600;">Total Shift Sale</span>
          <span style="font-size:0.95rem;font-weight:800;color:#fff;">${totalLitres.toFixed(2)} L</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.8rem;color:#94a3b8;font-weight:600;">Est. Total Revenue</span>
          <span style="font-size:0.95rem;font-weight:800;color:#22c55e;">₹ ${totalRevenue.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
        </div>
      `;
    } else {
      totalsEl.style.display = 'none';
    }
  }
}

// PhonePe delta calculation preview
function updatePhonePeDeltaPreview() {
  const shift = document.getElementById('emp-shift')?.value || 'day';
  const ppOpen  = parseFloat(document.getElementById('emp-pp-open')?.value)    || 0;
  const ppMid   = parseFloat(document.getElementById('emp-pp-midnight')?.value) || 0;
  const ppClose = parseFloat(document.getElementById('emp-pp-close')?.value)   || 0;
  const previewEl = document.getElementById('pp-delta-preview');
  if (!previewEl) return;

  if (ppOpen <= 0 && ppClose <= 0) { previewEl.style.display = 'none'; return; }

  let delta = 0;
  let formula = '';
  let warning = '';

  if (shift === 'night' && ppMid > 0) {
    delta = (ppMid - ppOpen) + ppClose;
    formula = `(₹${ppMid.toLocaleString('en-IN')} − ₹${ppOpen.toLocaleString('en-IN')}) + ₹${ppClose.toLocaleString('en-IN')}`;
  } else {
    delta = ppClose - ppOpen;
    formula = `₹${ppClose.toLocaleString('en-IN')} − ₹${ppOpen.toLocaleString('en-IN')}`;
    if (shift === 'night' && delta < 0) {
      warning = '⚠️ Negative result — did you forget to enter the midnight reading?';
    }
  }

  previewEl.style.display = 'flex';
  previewEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
      <span style="font-size:0.75rem;color:#94a3b8;">PhonePe this shift</span>
      <span style="font-size:0.75rem;color:#64748b;font-style:italic;">${formula}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:0.8rem;color:#94a3b8;font-weight:600;">= PhonePe Collected</span>
      <strong style="font-size:1rem;color:${delta < 0 ? '#ef4444' : '#38bdf8'}">₹ ${delta.toLocaleString('en-IN')}</strong>
    </div>
    ${warning ? `<div style="font-size:0.72rem;color:#f97316;margin-top:0.2rem;">${warning}</div>` : ''}
  `;
}

// Toggle midnight PhonePe field visibility based on shift selection
function updateEmpShiftMode() {
  const shift = document.getElementById('emp-shift')?.value || 'day';
  const midnightRow = document.getElementById('pp-midnight-row');
  if (midnightRow) {
    midnightRow.style.display = shift === 'night' ? 'flex' : 'none';
  }
  updateEmpOpeningHints();
}

function renderEmployeeView(session) {
  const nameEl = document.getElementById('emp-user-name');
  if (nameEl) nameEl.textContent = session.displayName;

  initEmployeeDatePicker(); // Populates D/M/Y dropdown selects if empty

  // Wire up listeners for hint updates and live calc
  const dayEl   = document.getElementById('emp-date-day');
  const monthEl = document.getElementById('emp-date-month');
  const yearEl  = document.getElementById('emp-date-year');
  const shiftEl = document.getElementById('emp-shift');

  const hintTriggers = [dayEl, monthEl, yearEl];
  hintTriggers.forEach(el => {
    if (el && !el._listened) {
      el._listened = true;
      el.addEventListener('change', updateEmpOpeningHints);
    }
  });

  if (shiftEl && !shiftEl._listened) {
    shiftEl._listened = true;
    shiftEl.addEventListener('change', updateEmpShiftMode);
  }

  // Wire live calc listeners on all nozzle input fields
  const calcFields = [
    'emp-du1p-open','emp-du1p-close','emp-du1p-tests',
    'emp-du1d-open','emp-du1d-close','emp-du1d-tests',
    'emp-du2p-open','emp-du2p-close','emp-du2p-tests',
    'emp-du2d-open','emp-du2d-close','emp-du2d-tests',
    'emp-pp-open','emp-pp-midnight','emp-pp-close'
  ];
  calcFields.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el._calcListened) {
      el._calcListened = true;
      el.addEventListener('input', updateEmpLiveCalc);
    }
  });

  // Show hints (not pre-fill) immediately on render
  updateEmpOpeningHints();
  updateEmpShiftMode();

  const subs = (db.pending_entries || [])
    .filter(e => e.submittedBy === session.username && e.submission_type !== 'device_registration')
    .sort((a,b) => b.submittedAt.localeCompare(a.submittedAt));

  const listEl = document.getElementById('emp-submissions-list');
  if (listEl) {
    listEl.innerHTML = subs.length === 0
      ? '<p style="color:#64748b;text-align:center;padding:2rem;">No submissions yet.</p>'
      : subs.map(s => {
          const sc = s.status === 'approved' ? '#22c55e' : s.status === 'rejected' ? '#ef4444' : '#f97316';
          const si = s.status === 'approved' ? '✅' : s.status === 'rejected' ? '❌' : '⏳';
          return `
            <div style="background:#1e293b;border:1px solid #334155;border-left:3px solid ${sc};border-radius:0.75rem;padding:1rem;margin-bottom:0.75rem;">
               <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;color:#f8fafc;">${s.entryData.date} · ${s.entryData.shift === 'day' ? '☀️ Day' : '🌙 Night'}</span>
                <span style="color:${sc};font-weight:700;font-size:0.8rem;">${si} ${s.status.toUpperCase()}</span>
              </div>
              <div style="font-size:0.75rem;color:#64748b;margin-top:0.2rem;">Submitted: ${s.submittedAt.replace('T',' ').slice(0,16)}</div>
              ${s.status === 'rejected' && s.rejectionReason
                ? `<div style="margin-top:0.5rem;padding:0.5rem;background:rgba(239,68,68,0.1);border-radius:0.4rem;color:#fca5a5;font-size:0.8rem;">❌ ${s.rejectionReason}</div>`
                : ''}
            </div>`;
        }).join('');
  }

  const submitBtn = document.getElementById('emp-submit-btn');
  if (submitBtn && !submitBtn._wired) {
    submitBtn._wired = true;
    submitBtn.addEventListener('click', () => submitEmployeeReading(session));
  }
}

async function submitEmployeeReading(session) {
  const val = id => parseFloat(document.getElementById(id)?.value || 0) || 0;
  const int = id => parseInt(document.getElementById(id)?.value  || 0) || 0;

  const dayStr = document.getElementById('emp-date-day')?.value || '';
  const monthStr = document.getElementById('emp-date-month')?.value || '';
  const yearStr = document.getElementById('emp-date-year')?.value || '';

  if (!dayStr || !monthStr || !yearStr) { showNotification('Please select a date.', 'danger'); return; }

  const date = `${yearStr}-${monthStr.padStart(2, '0')}-${dayStr.padStart(2, '0')}`;
  
  // Date Rule: Cannot submit data for future dates
  const todayStr = new Date().toLocaleDateString('en-CA'); 
  if (date > todayStr) {
    showNotification('⚠️ Validation Error: Cannot submit readings for future dates!', 'danger');
    return;
  }

  const shift = document.getElementById('emp-shift')?.value || 'day';
  const submissionType = document.getElementById('emp-submission-type')?.value || 'closing';

  if (submissionType === 'deposit') {
    const depositAmount = val('emp-deposit-amount');
    if (depositAmount <= 0) {
      showNotification('⚠️ Validation Error: Please enter a valid deposit amount.', 'danger');
      return;
    }
    if (!confirm(`Are you sure you want to submit a Cash Deposit of ₹${depositAmount.toLocaleString('en-IN')}?`)) {
      return;
    }
    
    const entry = {
      id: `pe_${Date.now()}`,
      submittedBy: session.username, submittedByName: session.displayName,
      submittedAt: new Date().toISOString(), deviceId: getDeviceId(),
      status: 'pending',
      submission_type: 'deposit',
      entryData: {
        date, shift,
        deposit_amount: depositAmount,
        remarks: document.getElementById('emp-remarks')?.value?.trim() || ''
      },
      rejectionReason: '', reviewedBy: '', reviewedAt: '',
      _dirty: true
    };

    const submitBtn = document.getElementById('emp-submit-btn');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Submit Shift Readings';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `⌛ Syncing to Cloud...`;
    }

    if (!db.pending_entries) db.pending_entries = [];
    db.pending_entries.push(entry);
    buildIndexes();

    saveDB(true).then(success => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
      if (success) {
        showNotification(`✅ Office Cash Deposit of ₹${depositAmount.toLocaleString('en-IN')} submitted and synced to cloud!`, 'success');
        
        ['emp-deposit-amount', 'emp-remarks'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        
        renderEmployeeView(session);
      } else {
        showNotification(`⚠️ Saved locally, but cloud sync is pending. We will automatically retry in the background.`, 'warning');
        renderEmployeeView(session);
      }
    });
    return;
  }

  // 1. Math Validations (Strict Errors, only run validation checks on fields that are filled)
  const checkNozzle = (prefix, label) => {
    const openInput = document.getElementById(`${prefix}-open`)?.value;
    const closeInput = document.getElementById(`${prefix}-close`)?.value;
    const testsInput = document.getElementById(`${prefix}-tests`)?.value;

    const open = sanitizeNumber(openInput);
    const close = sanitizeNumber(closeInput);
    const tests = sanitizeNumber(testsInput);

    if ((openInput && open < 0) || (closeInput && close < 0) || (testsInput && tests < 0)) {
      return `${label} readings cannot be negative.`;
    }
    
    // Only check close vs open validation if both fields are actually entered
    if (openInput && closeInput && close > 0 && open > 0) {
      if (close < open) {
        return `${label} closing reading (${close}) is less than opening reading (${open}).`;
      }
      if ((close - open) < tests) {
        return `${label} tests (${tests} L) cannot be greater than the totalizer difference (${(close - open).toFixed(2)} L).`;
      }
    }
    return null;
  };

  const err1 = checkNozzle('emp-du1p', 'DU1 Petrol');
  const err2 = checkNozzle('emp-du2p', 'DU2 Petrol');
  const err3 = checkNozzle('emp-du1d', 'DU1 Diesel');
  const err4 = checkNozzle('emp-du2d', 'DU2 Diesel');

  const err = err1 || err2 || err3 || err4;
  if (err) {
    if (typeof showGlobalError === 'function') {
      showGlobalError("Validation Error: " + err);
    } else {
      showNotification(`⚠️ Validation Error: ${err}`, 'danger');
    }
    return; // Hard Block
  }

  // Calculate volume totals for warning analysis
  const getNozzleLiters = (prefix) => {
    const open = val(`${prefix}-open`);
    const close = val(`${prefix}-close`);
    const tests = val(`${prefix}-tests`);
    return Math.max(0, close - open - tests);
  };

  const du1_p_liters = getNozzleLiters('emp-du1p');
  const du2_p_liters = getNozzleLiters('emp-du2p');
  const du1_d_liters = getNozzleLiters('emp-du1d');
  const du2_d_liters = getNozzleLiters('emp-du2d');

  const totalPetrolLiters = du1_p_liters + du2_p_liters;
  const totalDieselLiters = du1_d_liters + du2_d_liters;
  const totalLiters = totalPetrolLiters + totalDieselLiters;

  // Compile Warnings (Confirmations)
  const warnings = [];
  if (totalLiters === 0) {
    warnings.push("Total shift sales volume is 0 Liters.");
  }
  if (du1_p_liters > 5000) warnings.push(`DU1 Petrol sales volume (${du1_p_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (du2_p_liters > 5000) warnings.push(`DU2 Petrol sales volume (${du2_p_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (du1_d_liters > 5000) warnings.push(`DU1 Diesel sales volume (${du1_d_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);
  if (du2_d_liters > 5000) warnings.push(`DU2 Diesel sales volume (${du2_d_liters.toFixed(2)} L) is abnormally high (exceeds 5,000 L).`);

  const prices = getPricesAt(date);
  const estimatedRevenue = (totalPetrolLiters * prices.petrol) + (totalDieselLiters * prices.diesel);
  const cashEntered = val('emp-cash');
  const cardEntered = val('emp-card');
  const totalCollections = cashEntered + cardEntered;

  if (estimatedRevenue > 0) {
    const discrepancy = totalCollections - estimatedRevenue;
    const absDiscrepancy = Math.abs(discrepancy);
    const ratio = totalCollections / estimatedRevenue;

    if (ratio > 1.5 && absDiscrepancy > 15000) {
      warnings.push(`Collections (${formatCurrency(totalCollections)}) are more than 1.5x of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is +${formatCurrency(absDiscrepancy)}.`);
    } else if (ratio < 0.1 && estimatedRevenue > 1000) {
      warnings.push(`Collections (${formatCurrency(totalCollections)}) are less than 10% of estimated revenue (${formatCurrency(estimatedRevenue)}). Discrepancy is -${formatCurrency(absDiscrepancy)}.`);
    } else if (absDiscrepancy > 15000) {
      warnings.push(`There is a significant difference of ${formatCurrency(discrepancy)} between collections (${formatCurrency(totalCollections)}) and estimated fuel revenue (${formatCurrency(estimatedRevenue)}).`);
    }
  } else if (totalCollections > 0) {
    warnings.push(`Collections entered (${formatCurrency(totalCollections)}) but estimated revenue is 0 (0 Liters sold).`);
  }

  if (warnings.length > 0) {
    const msg = "⚠️ Warning: Potential errors detected in your entry:\n\n" +
                warnings.map(w => "• " + w).join("\n") +
                "\n\nAre you sure you want to submit this data?";
    if (!confirm(msg)) {
      return;
    }
  }


  const mkNozzle = (prefix, s) => {
    const openVal  = val(`${prefix}-open`);
    const closeVal = val(`${prefix}-close`);
    const testsVal = int(`${prefix}-tests`);
    // Only store fields that were actually entered
    return {
      open:        openVal,
      close_day:   s === 'day'   ? closeVal : 0,
      close_night: s === 'night' ? closeVal : 0,
      tests_day:   s === 'day'   ? testsVal : 0,
      tests_night: s === 'night' ? testsVal : 0,
    };
  };

  // PhonePe delta model
  const ppOpen     = val('emp-pp-open');
  const ppMidnight = shift === 'night' ? val('emp-pp-midnight') : 0;
  const ppClose    = val('emp-pp-close');
  let ppCollection = 0;
  if (shift === 'night' && ppMidnight > 0) {
    ppCollection = (ppMidnight - ppOpen) + ppClose;
  } else {
    ppCollection = ppClose - ppOpen;
  }

  // Manual price flag
  const manualPrices = {};
  ['du1p','du1d','du2p','du2d'].forEach(nozzle => {
    const el = document.getElementById(`calc-${nozzle}-manual-price`);
    if (el && parseFloat(el.value) > 0) {
      manualPrices[nozzle] = parseFloat(el.value);
    }
  });

  const entry = {
    id: `pe_${Date.now()}`,
    submittedBy: session.username, submittedByName: session.displayName,
    submittedAt: new Date().toISOString(), deviceId: getDeviceId(),
    status: 'pending',
    submission_type: submissionType, // 'opening' | 'snapshot' | 'closing'
    entryData: {
      date, shift,
      du1_p: mkNozzle('emp-du1p', shift),
      du1_d: mkNozzle('emp-du1d', shift),
      du2_p: mkNozzle('emp-du2p', shift),
      du2_d: mkNozzle('emp-du2d', shift),
      cash_sales:        val('emp-cash'),
      card_sales:        val('emp-card'),
      phonepe_opening:   ppOpen,
      phonepe_midnight:  ppMidnight,
      phonepe_closing:   ppClose,
      phonepe_collection: ppCollection,
      manual_prices:     Object.keys(manualPrices).length > 0 ? manualPrices : null,
      remarks:           document.getElementById('emp-remarks')?.value?.trim() || ''
    },
    rejectionReason: '', reviewedBy: '', reviewedAt: '',
    _dirty: true
  };



  const submitBtn = document.getElementById('emp-submit-btn');
  const originalText = submitBtn ? submitBtn.innerHTML : 'Submit Shift Readings';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `⌛ Syncing to Cloud...`;
  }

  if (!db.pending_entries) db.pending_entries = [];
  db.pending_entries.push(entry);
  buildIndexes(); // Keep in-memory index current
  
  const typeLabel = submissionType === 'opening' ? 'Opening Reading' : submissionType === 'snapshot' ? 'Mid-Shift Snapshot' : 'Closing Reading';

  saveDB(true).then(success => {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
    if (success) {
      showNotification(`✅ ${typeLabel} submitted and synced to cloud! Owner can see it under Operations → Approve Shifts.`, 'success');
      
      // Clear numeric form inputs
      ['emp-du1p-open','emp-du1p-close','emp-du1p-tests',
       'emp-du1d-open','emp-du1d-close','emp-du1d-tests',
       'emp-du2p-open','emp-du2p-close','emp-du2p-tests',
       'emp-du2d-open','emp-du2d-close','emp-du2d-tests',
       'emp-cash','emp-card','emp-remarks',
       'emp-pp-open','emp-pp-midnight','emp-pp-close',
       'emp-deposit-amount']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

      // Hide live calc previews after submit
      ['calc-du1p','calc-du1d','calc-du2p','calc-du2d','emp-live-totals','pp-delta-preview']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

      // Reset date selectors to today
      const today = new Date();
      const dEl = document.getElementById('emp-date-day');
      const mEl = document.getElementById('emp-date-month');
      const yEl = document.getElementById('emp-date-year');
      if (dEl) dEl.value = today.getDate();
      if (mEl) mEl.value = today.getMonth() + 1;
      if (yEl) yEl.value = today.getFullYear();
      
      renderEmployeeView(session);
    } else {
      showNotification(`⚠️ Saved locally, but cloud sync is pending. We will automatically retry in the background.`, 'warning');
      renderEmployeeView(session);
    }
  });
}

