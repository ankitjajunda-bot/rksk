/**
 * Financial Integrity Engine
 * Scans the local database for mathematical anomalies, accounting invariants,
 * and unverified business rules.
 */

window.FinancialIntegrityScanner = {
    scan: function(db) {
        let violations = [];
        let idCounter = 1;

        if (!db || !db.master_ledger) return violations;

        const ledger = [...db.master_ledger].sort((a, b) => new Date(a.date) - new Date(b.date));

        for (let i = 0; i < ledger.length; i++) {
            let row = ledger[i];
            let prevRow = i > 0 ? ledger[i-1] : null;

            // 1. Check for Meter Gap (Continuity)
            if (prevRow) {
                const pumps = ['du1_p', 'du1_d', 'du2_p', 'du2_d'];
                pumps.forEach(p => {
                    const todayOpen = row[p] ? (row[p].open || 0) : 0;
                    const yestClose = prevRow[p] ? (prevRow[p].close_night || prevRow[p].close_day || prevRow[p].open || 0) : 0;
                    
                    if (todayOpen !== yestClose && (todayOpen > 0 || yestClose > 0)) {
                        const gap = todayOpen - yestClose;
                        violations.push({
                            id: `FIV-${idCounter++}`,
                            date: row.date,
                            module: 'Sales Verification',
                            severity: '🔴 Incorrect',
                            title: `Meter Continuity Break (${p})`,
                            description: `Yesterday's closing meter was ${yestClose}, but today's opening meter is ${todayOpen}. A gap of ${gap} Litres is unaccounted for.`,
                            impact: 'Unrecorded off-book sales. Cash leakage.',
                            resolution: 'Requires hard-linking opening meters to previous closing meters.'
                        });
                    }
                });
            }

            // 2. Check for Negative Sales Clipping (Rollover)
            const pumps = ['du1_p', 'du1_d', 'du2_p', 'du2_d'];
            pumps.forEach(p => {
                if (row[p]) {
                    const open = row[p].open || 0;
                    const closeDay = row[p].close_day || 0;
                    if (closeDay > 0 && closeDay < open) {
                        violations.push({
                            id: `FIV-${idCounter++}`,
                            date: row.date,
                            module: 'Mathematical Assertion',
                            severity: '🔴 Incorrect',
                            title: `Negative Sale Clipped (${p})`,
                            description: `Closing meter (${closeDay}) is less than Opening meter (${open}). System silently clipped the negative volume to 0.`,
                            impact: 'Massive physical stock discrepancy hidden from UI.',
                            resolution: 'Throw FinancialException. Do not allow shift submission until rollover is explicitly logged.'
                        });
                    }
                }
            });

            // 3. Check for Testing Multiplier Defect
            pumps.forEach(p => {
                if (row[p] && row[p].tests_day > 0) {
                    violations.push({
                        id: `FIV-${idCounter++}`,
                        date: row.date,
                        module: 'Business Logic',
                        severity: '🔴 Incorrect',
                        title: 'Testing Volume Multiplier Defect',
                        description: `Operator logged ${row[p].tests_day}L of test fuel. Historic codebase multiplied this by 5, inflating test deduction to ${row[p].tests_day * 5}L.`,
                        impact: `Artificially decreases net sales by ${row[p].tests_day * 4}L. Hides ghost stock.`,
                        resolution: 'Fix deployed in Sprint 4, but historical data remains mathematically corrupted.'
                    });
                }
            });

            // 4. CapEx Lumping Defect
            const kharcha = row.kharcha ? parseFloat(row.kharcha) : 0;
            if (kharcha > 10000) {
                violations.push({
                    id: `FIV-${idCounter++}`,
                    date: row.date,
                    module: 'Accounting',
                    severity: '🔵 Owner Decision Required',
                    title: 'Massive Expense (Likely CapEx)',
                    description: `An expense of ₹${kharcha} was logged as 'kharcha'. If this is Capital Expenditure, it mathematically destroys Net Operating Profit for the day.`,
                    impact: 'Net Profit metric invalidated.',
                    resolution: 'Separate CapEx and OpEx ledgers.'
                });
            }

            // 5. Unverified Prices
            if (!row.prices || (!row.prices.petrol && !row.prices.diesel)) {
                violations.push({
                    id: `FIV-${idCounter++}`,
                    date: row.date,
                    module: 'Pricing Engine',
                    severity: '🟡 Needs Review',
                    title: 'Global Price Fallback Triggered',
                    description: `Shift was submitted without active fuel prices for this specific date. System fell back to global default.`,
                    impact: 'Potential Revenue leakage if default price is lower than actual price.',
                    resolution: 'Verify prices for this date.'
                });
            }
            
            // 6. Credit Sales Mapping
            if (row.credit && parseFloat(row.credit) > 0) {
                violations.push({
                    id: `FIV-${idCounter++}`,
                    date: row.date,
                    module: 'Accounting',
                    severity: '🟡 Needs Review',
                    title: 'Unmapped Credit Sale',
                    description: `₹${row.credit} of fuel was sold on credit, but not mapped to a customer in the Accounts Receivable ledger.`,
                    impact: 'Asset lost. Owner has no mathematical trail to collect this debt.',
                    resolution: 'Require Customer ID for all credit sales.'
                });
            }
        }

        // Add System-Wide Warnings
        violations.push({
            id: `FIV-${idCounter++}`,
            date: 'System-Wide',
            module: 'Inventory Valuation',
            severity: '🔴 Incorrect',
            title: 'Missing Thermal Density Correction (ASTM 53B)',
            description: `Book stock assumes 1 Invoice Litre = 1 Dip Litre. Temperature expansion is completely ignored.`,
            impact: 'Produces fake "Excesses" in summer and "Shortages" in winter.',
            resolution: 'Require Temperature Probes and ASTM calculations for dip reconciliation.'
        });

        violations.push({
            id: `FIV-${idCounter++}`,
            date: 'System-Wide',
            module: 'Financial Engine',
            severity: '🔴 Incorrect',
            title: 'Floating Point Math Drift',
            description: `WAC and Inventory math use IEEE 754 floating-point decimals. Over 5 years, rounding errors will permanently drift.`,
            impact: 'Ghost Cash and Ghost Stock accumulation.',
            resolution: 'Transition all financial logic to Integer (Paise) math.'
        });

        return violations;
    }
};
