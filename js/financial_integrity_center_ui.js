function getStatusClass(status) {
    if(status.includes('🔴')) return 'status-red';
    if(status.includes('🟠')) return 'status-orange';
    if(status.includes('🟡')) return 'status-yellow';
    if(status.includes('🟢')) return 'status-green';
    return '';
}

function formatCurrency(val) {
    if(val === 'Unknown') return val;
    return '₹' + Number(val).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}

function openIssueModal(data) {
    // Remove existing modal if any
    const existing = document.getElementById('issue-details-modal');
    if (existing) existing.remove();

    const modalHTML = `
        <div id="issue-details-modal" style="position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:2rem;">
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);width:100%;max-width:900px;max-height:90vh;overflow-y:auto;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);display:flex;flex-direction:column;">
                
                <!-- Modal Header -->
                <div style="padding:1.5rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.2);">
                    <div>
                        <h3 style="margin:0;font-size:1.25rem;color:var(--text);display:flex;align-items:center;gap:0.75rem;">
                            <span class="status-badge ${getStatusClass(data.status)}">${data.status}</span>
                            ${data.calculation} Issue
                        </h3>
                        <div style="font-size:0.85rem;color:var(--text-muted);margin-top:0.35rem;">Date: ${data.date} | Shift: ${data.shift} | Rule: ${data.ruleVersion}</div>
                    </div>
                    <button onclick="document.getElementById('issue-details-modal').remove()" style="background:transparent;border:none;color:var(--text-muted);font-size:1.75rem;cursor:pointer;line-height:1;padding:0.5rem;">&times;</button>
                </div>

                <!-- Modal Body -->
                <div style="padding:1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:2rem;">
                    
                    <!-- Left Column: Math & Calculations -->
                    <div style="display:flex;flex-direction:column;gap:1.5rem;">
                        <div>
                            <h4 style="color:var(--text-muted);text-transform:uppercase;font-size:0.75rem;margin:0 0 0.5rem 0;letter-spacing:1px;">1. Repository Calculation (Legacy Engine)</h4>
                            <div style="background:#0f172a;border:1px solid var(--border);padding:1rem;border-radius:var(--radius-sm);font-family:monospace;font-size:1rem;color:#94a3b8;white-space:pre-wrap;line-height:1.5;">${data.proof_legacyMath}</div>
                        </div>

                        <div>
                            <h4 style="color:var(--primary);text-transform:uppercase;font-size:0.75rem;margin:0 0 0.5rem 0;letter-spacing:1px;">2. Certified Calculation (Operational Engine)</h4>
                            <div style="background:rgba(99,102,241,0.1);border:1px solid var(--primary);padding:1.25rem;border-radius:var(--radius-sm);font-family:monospace;font-size:1.1rem;color:#e0e7ff;font-weight:700;white-space:pre-wrap;line-height:1.5;box-shadow:inset 0 2px 10px rgba(0,0,0,0.2);">${data.proof_opsMath}</div>
                        </div>

                        <div>
                            <h4 style="color:var(--text-muted);text-transform:uppercase;font-size:0.75rem;margin:0 0 0.5rem 0;letter-spacing:1px;">3. Observed Facts (Raw Inputs)</h4>
                            <div style="background:var(--bg);border:1px solid var(--border);padding:1rem;border-radius:var(--radius-sm);font-family:monospace;font-size:0.85rem;color:var(--text-dim);white-space:pre-wrap;">PhonePe Submitted: ${formatCurrency(data.observedFacts.phonepe_collection)}\nCash Submitted: ${formatCurrency(data.observedFacts.cash)}</div>
                        </div>
                    </div>

                    <!-- Right Column: Analysis -->
                    <div style="display:flex;flex-direction:column;gap:1.5rem;">
                        <div>
                            <h4 style="color:var(--text-muted);text-transform:uppercase;font-size:0.75rem;margin:0 0 0.5rem 0;letter-spacing:1px;">4. Side-By-Side Comparison</h4>
                            <table style="width:100%;text-align:left;font-size:0.95rem;border-collapse:collapse;">
                                <tr style="border-bottom:1px solid var(--border);">
                                    <th style="padding:0.75rem 0;color:var(--text-muted);">Current Result</th>
                                    <td style="padding:0.75rem 0;font-family:monospace;font-size:1.1rem;">${formatCurrency(data.currentVal)}</td>
                                </tr>
                                <tr style="border-bottom:1px solid var(--border);">
                                    <th style="padding:0.75rem 0;color:var(--text-muted);">Certified Result</th>
                                    <td style="padding:0.75rem 0;font-family:monospace;font-size:1.1rem;color:var(--primary);font-weight:700;">${formatCurrency(data.certifiedVal)}</td>
                                </tr>
                                <tr>
                                    <th style="padding:0.75rem 0;color:var(--text-muted);">Difference</th>
                                    <td style="padding:0.75rem 0;font-family:monospace;font-size:1.1rem;font-weight:700;" class="${data.difference < 0 ? 'diff-neg' : 'diff-pos'}">${formatCurrency(data.difference)} (${data.pctDifference})</td>
                                </tr>
                            </table>
                        </div>

                        <div style="background:rgba(239,68,68,0.05);border-left:3px solid #ef4444;padding:1rem;">
                            <h4 style="color:#ef4444;text-transform:uppercase;font-size:0.75rem;margin:0 0 0.5rem 0;letter-spacing:1px;">5. Root Cause Analysis</h4>
                            <div style="color:var(--text);font-size:0.9rem;line-height:1.5;">${data.proof_rootCause}</div>
                        </div>

                        <div style="background:var(--bg);border-left:3px solid var(--border);padding:1rem;">
                            <h4 style="color:var(--text-muted);text-transform:uppercase;font-size:0.75rem;margin:0 0 0.5rem 0;letter-spacing:1px;">6. Action Required</h4>
                            <div style="color:var(--text);font-size:0.9rem;font-weight:600;line-height:1.5;">${data.actionRequired}</div>
                            <div style="color:var(--text-dim);font-size:0.85rem;margin-top:0.5rem;font-style:italic;">Recommendation: ${data.proof_recommendation}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Modal Footer -->
                <div style="padding:1.25rem 1.5rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;background:rgba(0,0,0,0.2);">
                    <button onclick="document.getElementById('issue-details-modal').remove()" class="btn btn-secondary" style="padding:0.75rem 1.5rem;">Close Details</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

let allIssues = [];

window.renderFinancialIntegrity = function() {
    const db = {
        daily_ledger: (typeof REFINED_SALES_LEDGER !== 'undefined' && window.REFINED_SALES_LEDGER) ? window.REFINED_SALES_LEDGER.daily_ledger : (typeof DSR_DRAFT_DATA !== 'undefined' ? DSR_DRAFT_DATA.daily_ledger : []),
        supply_bills: typeof SUPPLY_BILLS_DATA !== 'undefined' ? SUPPLY_BILLS_DATA : []
    };

    allIssues = window.CertificationScanner.scan(db);

    // Sort by negative difference first, then date descending
    allIssues.sort((a, b) => {
        if (a.difference !== b.difference) {
            return a.difference - b.difference;
        }
        return new Date(b.date) - new Date(a.date);
    });

    // Update Dashboard
    document.getElementById('stat-total').textContent = allIssues.length;
    document.getElementById('stat-red').textContent = allIssues.filter(i => i.status.includes('🔴')).length;
    document.getElementById('stat-orange').textContent = allIssues.filter(i => i.status.includes('🟠')).length;
    document.getElementById('stat-yellow').textContent = allIssues.filter(i => i.status.includes('🟡')).length;
    document.getElementById('stat-green').textContent = allIssues.filter(i => i.status.includes('🟢')).length;

    renderVanillaTable();
    setupFilters();
};

function renderVanillaTable() {
    const tbody = document.getElementById('integrity-grid-body');
    if(!tbody) return;
    
    tbody.innerHTML = '';
    
    // Get filter values
    const filters = {};
    document.querySelectorAll('.filter-input').forEach(input => {
        const col = input.getAttribute('data-col');
        const val = input.value.toLowerCase().trim();
        if(val) filters[col] = val;
    });

    try {
        allIssues.forEach((issue, index) => {
            // Safe filtering logic
            let show = true;
            
            const colData = [
                String(issue.date || '').toLowerCase(),
                String(issue.shift || '').toLowerCase(),
                String(issue.module || '').toLowerCase(),
                String(issue.calculation || '').toLowerCase(),
                String(issue.issueType || '').toLowerCase(),
                String(issue.ruleVersion || '').toLowerCase(),
                String(issue.difference || '0').toLowerCase(),
                String(issue.status || '').toLowerCase()
            ];
            
            for (let col in filters) {
                if (!colData[col].includes(filters[col])) {
                    show = false;
                    break;
                }
            }
            
            if(!show) return;

            // Render main row
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            
            const diffVal = formatCurrency(issue.difference);
            const diffClass = issue.difference < 0 ? 'diff-neg' : (issue.difference > 0 ? 'diff-pos' : '');
            
            tr.innerHTML = `
                <td>${issue.date}</td>
                <td>${issue.shift}</td>
                <td>${issue.module}</td>
                <td>${issue.calculation}</td>
                <td>${issue.issueType}</td>
                <td>${issue.ruleVersion}</td>
                <td><span class="diff-col ${diffClass}">${diffVal}</span></td>
                <td><span class="status-badge ${getStatusClass(issue.status)}">${issue.status}</span></td>
            `;
            
            tr.onclick = function() {
                openIssueModal(issue);
            };

            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:red;">Error rendering table: ${error.message}</td></tr>`;
    }
}

function setupFilters() {
    document.querySelectorAll('.filter-input').forEach(input => {
        // Remove old listeners by cloning
        const new_input = input.cloneNode(true);
        input.parentNode.replaceChild(new_input, input);
        
        new_input.addEventListener('keyup', renderVanillaTable);
        new_input.addEventListener('click', e => e.stopPropagation());
    });
}
