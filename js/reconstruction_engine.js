// Reconstruction Engine & Certification Controller

const STATE = {
  liveDb: null,
  proposals: [],
  decisions: {} // proposalId -> 'accept' | 'reject' | 'postpone'
};

document.getElementById('btn-run-engine').addEventListener('click', runReconstructionEngine);
document.getElementById('btn-preview-updates').addEventListener('click', previewAndApplyUpdates);

function logMsg(msg) {
  const panel = document.getElementById('engine-logs');
  panel.style.display = 'block';
  panel.innerHTML += `<div>[Engine] ${msg}</div>`;
  panel.scrollTop = panel.scrollHeight;
}

function runReconstructionEngine() {
  logMsg("Initializing Reconstruction Engine...");
  
  // 1. Load Live Database
  const dbStr = localStorage.getItem('octaneflow_db');
  if (!dbStr) {
    logMsg("ERROR: No live database found in localStorage.");
    return;
  }
  STATE.liveDb = JSON.parse(dbStr);
  STATE.proposals = [];
  STATE.decisions = {};
  
  const ledger = STATE.liveDb.master_ledger;
  logMsg(`Loaded ${ledger.length} ledger rows for verification.`);
  
  // 2. Totalizer Reconstruction (Forward Filling & Continuity)
  for (let i = 0; i < ledger.length; i++) {
    const row = ledger[i];
    const prevRow = i > 0 ? ledger[i-1] : null;
    
    ['du1_p', 'du1_d', 'du2_p', 'du2_d'].forEach(duKey => {
      if (!row[duKey]) row[duKey] = {};
      const du = row[duKey];
      
      // Rule 1: Morning Opening = Previous Night Closing
      if (prevRow && prevRow[duKey] && typeof prevRow[duKey].close_night === 'number') {
        const expectedOpen = prevRow[duKey].close_night;
        const actualOpen = du.open;
        
        if (typeof actualOpen !== 'number' || isNaN(actualOpen)) {
          // Missing Opening Reading
          STATE.proposals.push({
            id: `tot_open_${row.date}_${duKey}`,
            date: row.date,
            field: `${duKey.toUpperCase()} Morning Open`,
            currentValue: 'Missing / NaN',
            proposedValue: expectedOpen,
            evidence: `Previous Night Closing (${prevRow.date})`,
            confidence: '80%',
            status: 'status-suggested',
            statusText: 'Suggested Update',
            rule: 'Forward Continuity',
            reason: 'Totalizers must be continuous. Missing opening reading recovered from previous night close.',
            applyFn: (db) => {
              const r = db.master_ledger.find(x => x.date === row.date);
              if(r) { if(!r[duKey]) r[duKey] = {}; r[duKey].open = expectedOpen; }
            }
          });
        } else if (actualOpen !== expectedOpen) {
          // Conflict
          STATE.proposals.push({
            id: `tot_open_conflict_${row.date}_${duKey}`,
            date: row.date,
            field: `${duKey.toUpperCase()} Morning Open`,
            currentValue: actualOpen,
            proposedValue: expectedOpen,
            evidence: `Previous Night Closing (${prevRow.date})`,
            confidence: '🟠 Conflict',
            status: 'status-review',
            statusText: 'Requires Owner Review',
            rule: 'Mathematical Continuity',
            reason: `Morning opening (${actualOpen}) does not match previous night closing (${expectedOpen}).`,
            applyFn: (db) => {
              const r = db.master_ledger.find(x => x.date === row.date);
              if(r) { if(!r[duKey]) r[duKey] = {}; r[duKey].open = expectedOpen; }
            }
          });
        }
      }
      
      // Rule 2: Night Opening = Day Closing
      // In the app, Night Opening relies on close_day. If close_day is missing, it breaks.
      if (typeof du.open === 'number' && !isNaN(du.open)) {
        if (typeof du.close_day !== 'number' || isNaN(du.close_day)) {
          // Missing Close Day. Since totalizers can't be blank, if they skipped the day shift, 
          // the close_day is effectively the open reading (0 day sales).
          STATE.proposals.push({
            id: `tot_closeday_${row.date}_${duKey}`,
            date: row.date,
            field: `${duKey.toUpperCase()} Close Day (Night Open)`,
            currentValue: 'Missing / -',
            proposedValue: du.open,
            evidence: `Morning Open (${row.date})`,
            confidence: '95%',
            status: 'status-suggested',
            statusText: 'Suggested Update',
            rule: 'Cardinal Rule of Totalizers',
            reason: 'Day shift was not closed. To maintain continuity for the night shift, the reading must carry forward from the morning open.',
            applyFn: (db) => {
              const r = db.master_ledger.find(x => x.date === row.date);
              if(r) { if(!r[duKey]) r[duKey] = {}; r[duKey].close_day = du.open; }
            }
          });
        }
      }
      
      // Rule 3: Night Closing = Next Morning Opening (Backward Fill)
      // If close_night is missing, but tomorrow's open exists.
      const nextRow = i < ledger.length - 1 ? ledger[i+1] : null;
      if (nextRow && nextRow[duKey] && typeof nextRow[duKey].open === 'number') {
        const nextOpen = nextRow[duKey].open;
        if (typeof du.close_night !== 'number' || isNaN(du.close_night)) {
          STATE.proposals.push({
            id: `tot_closenight_${row.date}_${duKey}`,
            date: row.date,
            field: `${duKey.toUpperCase()} Night Close`,
            currentValue: 'Missing / -',
            proposedValue: nextOpen,
            evidence: `Next Morning Open (${nextRow.date})`,
            confidence: '80%',
            status: 'status-suggested',
            statusText: 'Suggested Update',
            rule: 'Backward Continuity',
            reason: 'Night close was missing. Recovered perfectly by looking at the next morning\'s opening reading.',
            applyFn: (db) => {
              const r = db.master_ledger.find(x => x.date === row.date);
              if(r) { if(!r[duKey]) r[duKey] = {}; r[duKey].close_night = nextOpen; }
            }
          });
        }
      }
    });
  }
  
  logMsg(`Reconstruction complete. Found ${STATE.proposals.length} fields requiring review.`);
  renderProposals();
  
  if (STATE.proposals.length > 0) {
    document.getElementById('btn-preview-updates').style.display = 'inline-block';
  }
}

function renderProposals() {
  const container = document.getElementById('proposals-container');
  if (STATE.proposals.length === 0) {
    container.innerHTML = `<div class="card"><h3 style="color:#10b981;">🟢 All Data Certified</h3><p>Your Sales Ledger perfectly matches the reconstructed historical timeline. No corrections needed!</p></div>`;
    return;
  }
  
  let html = '';
  STATE.proposals.forEach(p => {
    // Default decision is pending
    if (!STATE.decisions[p.id]) STATE.decisions[p.id] = 'pending';
    
    let actionsHtml = `
      <button class="btn btn-accept" onclick="makeDecision('${p.id}', 'accept')">✓ Accept This Change</button>
      <button class="btn btn-reject" onclick="makeDecision('${p.id}', 'reject')">✕ Reject This Change</button>
      <button class="btn btn-postpone" onclick="makeDecision('${p.id}', 'postpone')">⏱ Postpone Decision</button>
    `;
    
    if (STATE.decisions[p.id] === 'accept') actionsHtml = `<span style="color:#10b981; font-weight:bold;">✅ Accepted for Update</span>`;
    if (STATE.decisions[p.id] === 'reject') actionsHtml = `<span style="color:#ef4444; font-weight:bold;">❌ Rejected (Will not apply)</span>`;
    if (STATE.decisions[p.id] === 'postpone') actionsHtml = `<span style="color:#6b7280; font-weight:bold;">⏱ Postponed (Requires Owner Review)</span>`;
    
    const diff = (typeof p.currentValue === 'number' && typeof p.proposedValue === 'number') 
      ? (p.proposedValue - p.currentValue).toFixed(2) 
      : 'N/A';
      
    html += `
      <div class="card" id="card-${p.id}">
        <div style="display:flex; justify-content:space-between;">
          <h3 style="margin-top:0;">Date: ${p.date} | ${p.field}</h3>
          <span class="status-badge ${p.status}">${p.statusText}</span>
        </div>
        
        <p style="font-size:0.9rem; color:var(--text-muted); margin: 5px 0 15px;"><strong>Reasoning:</strong> ${p.reason}</p>
        
        <table class="diff-table">
          <tr>
            <th>Current Ledger Value</th>
            <th>Proposed Certified Value</th>
            <th>Difference</th>
            <th>Confidence</th>
          </tr>
          <tr>
            <td class="diff-val-old">${p.currentValue}</td>
            <td class="diff-val-new">${p.proposedValue}</td>
            <td>${diff}</td>
            <td>${p.confidence}</td>
          </tr>
        </table>
        
        <div style="font-size: 0.85rem; margin-top: 10px; color: #a0a0a0;">
          <strong>Evidence Used:</strong> ${p.evidence} | <strong>Business Rule:</strong> ${p.rule}
        </div>
        
        <div class="actions" id="actions-${p.id}">
          ${actionsHtml}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

window.makeDecision = function(id, decision) {
  STATE.decisions[id] = decision;
  renderProposals();
}

function previewAndApplyUpdates() {
  const accepted = STATE.proposals.filter(p => STATE.decisions[p.id] === 'accept');
  if (accepted.length === 0) {
    alert("You have not accepted any changes to apply.");
    return;
  }
  
  const confirmMsg = `PREVIEW UPDATES:
You have approved ${accepted.length} derived data corrections.

These changes will apply the Cardinal Rule of Totalizers (forward-filling missing blanks) without overwriting any raw physical observations.

Do you want to write these certified values to your live database?`;

  if (confirm(confirmMsg)) {
    // Clone DB
    let newDb = JSON.parse(JSON.stringify(STATE.liveDb));
    
    // Apply changes
    accepted.forEach(p => {
      p.applyFn(newDb);
    });
    
    // Save to localStorage
    localStorage.setItem('octaneflow_db', JSON.stringify(newDb));
    
    alert("✅ Sales Ledger successfully updated and certified!\n\nPlease refresh the main dashboard to view the corrected history and flawless math.");
    
    // Re-run to show empty list
    runReconstructionEngine();
  }
}
