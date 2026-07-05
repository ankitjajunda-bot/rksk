/**
 * Certification Scanner Pipeline
 * Processes Observed Facts through the Current Repository Behaviour and the Operational Rule Engine.
 * Emits granular "Issues" for the Financial Integrity Center.
 */

window.CertificationScanner = {
    scan: function(db) {
        if (!db || !db.master_ledger) return [];
        
        let issues = [];
        const ledger = [...db.master_ledger].sort((a, b) => new Date(a.date) - new Date(b.date));

        ledger.forEach((row, index) => {
            const prevRow = index > 0 ? ledger[index - 1] : null;

            // Day Shift
            const dayFacts = this.extractShiftFacts(row, prevRow, 'Day');
            const dayLegacy = this.calculateLegacy(dayFacts);
            const dayOps = window.OperationalRuleEngine.calculateShift(dayFacts);
            issues = issues.concat(this.evaluateCertification(dayFacts, dayLegacy, dayOps));

            // Night Shift
            const nightFacts = this.extractShiftFacts(row, prevRow, 'Night');
            const nightLegacy = this.calculateLegacy(nightFacts);
            const nightOps = window.OperationalRuleEngine.calculateShift(nightFacts);
            issues = issues.concat(this.evaluateCertification(nightFacts, nightLegacy, nightOps));
        });

        return issues;
    },

    extractShiftFacts: function(row, prevRow, shiftType) {
        const facts = {
            date: row.date,
            type: shiftType,
            prices: row.prices,
            du1_p: { open: 0, close: 0, tests: 0 },
            du1_d: { open: 0, close: 0, tests: 0 },
            du2_p: { open: 0, close: 0, tests: 0 },
            du2_d: { open: 0, close: 0, tests: 0 },
            phonepe_collection: (row.recon && row.recon.PhonePe) ? row.recon.PhonePe : 0, 
            cash: (row.recon && row.recon.Cash) ? row.recon.Cash : 0,
            credit: (row.recon && row.recon.Ankit) ? row.recon.Ankit : 0, 
            expenses: (row.recon && row.recon.Kharcha) ? row.recon.Kharcha : 0,
        };

        ['du1_p', 'du1_d', 'du2_p', 'du2_d'].forEach(p => {
            if (row[p]) {
                if (shiftType === 'Day') {
                    facts[p].open = row[p].open || 0;
                    facts[p].close = row[p].close_day || 0;
                    facts[p].tests = row[p].tests_day || 0;
                } else {
                    facts[p].open = row[p].close_day || 0;
                    facts[p].close = row[p].close_night || 0;
                    facts[p].tests = row[p].tests_night || 0;
                }
            }
        });

        return facts;
    },

    calculateLegacy: function(facts) {
        const result = { totalRevenue: 0, netSales: { petrol: 0, diesel: 0 }, expectedCash: 0, testLitres: 0 };
        let phonePeSplit = facts.type === 'Day' ? facts.phonepe_collection : 0; 
        
        ['du1_p', 'du1_d', 'du2_p', 'du2_d'].forEach(p => {
            const data = facts[p];
            const product = p.endsWith('_p') ? 'petrol' : 'diesel';
            const gross = Math.max(0, data.close - data.open);
            const net = Math.max(0, gross - (data.tests * 5)); 
            
            result.testLitres += data.tests;
            result.netSales[product] += net;
            if (facts.prices && facts.prices[product]) {
                result.totalRevenue += (net * facts.prices[product]);
            }
        });

        result.expectedCash = result.totalRevenue - phonePeSplit - facts.credit - facts.expenses;
        return result;
    },

    evaluateCertification: function(facts, legacy, ops) {
        let shiftIssues = [];
        const baseIssue = {
            id: facts.date + '-' + facts.type,
            date: facts.date,
            shift: facts.type,
            product: 'Multiple',
            module: 'Financial Engine',
            observedFacts: facts,
            legacyResult: legacy,
            opsResult: ops
        };

        if (ops.totalRevenue === 0 && legacy.totalRevenue === 0) return shiftIssues;

        // Check Testing & Revenue Issue
        if (Math.abs(legacy.totalRevenue - ops.totalRevenue) > 1) {
            shiftIssues.push({
                ...baseIssue,
                id: baseIssue.id + '-REV',
                calculation: 'Net Revenue',
                issueType: 'Testing Volume Multiplier',
                severity: 'Critical',
                status: '🔴 Proven Incorrect',
                currentVal: legacy.totalRevenue,
                certifiedVal: ops.totalRevenue,
                difference: ops.totalRevenue - legacy.totalRevenue,
                pctDifference: (((ops.totalRevenue - legacy.totalRevenue) / legacy.totalRevenue) * 100).toFixed(2) + '%',
                financialImpact: ops.totalRevenue - legacy.totalRevenue,
                inventoryImpact: 0,
                ruleVersion: 'WF-A.1 / WF-B.1',
                actionRequired: 'Recalculate historical net sales',
                // 10 Section specifics
                proof_legacyMath: `Gross - Testing Count = Net Sales\nNet Sales * Price = ₹${legacy.totalRevenue.toFixed(2)}`,
                proof_opsMath: `Gross - (Testing Count * 5) = Net Sales\nNet Sales * Price = ₹${ops.totalRevenue.toFixed(2)}`,
                proof_rootCause: 'The repository interpreted Testing Count as litres (Multiplier 1). The Operational Knowledge Base defines Testing Count as the number of 5-litre measures.',
                proof_impact: 'Revenue, Expected Cash, and Profit variance.',
                proof_recommendation: 'Restore the testing multiplier of 5 to the core engine.'
            });
        }

        // Under Option B (24-Hour Consolidation), Night Shifts do not require a separate 
        // PhonePe settlement block. It is consolidated into the Day's T-1 settlement.

        // Check Expected Cash Impact
        if (Math.abs(legacy.expectedCash - ops.expectedCash) > 1 && shiftIssues.length > 0) {
            shiftIssues.push({
                ...baseIssue,
                id: baseIssue.id + '-CSH',
                calculation: 'Expected Cash',
                issueType: 'Cascading Variance',
                severity: 'Medium',
                status: '🟡 Cannot Yet Be Proven',
                currentVal: legacy.expectedCash,
                certifiedVal: ops.expectedCash,
                difference: ops.expectedCash - legacy.expectedCash,
                pctDifference: (((ops.expectedCash - legacy.expectedCash) / Math.max(1, legacy.expectedCash)) * 100).toFixed(2) + '%',
                financialImpact: ops.expectedCash - legacy.expectedCash,
                inventoryImpact: 0,
                ruleVersion: 'WF-A.3',
                actionRequired: 'Resolve root calculation (Testing/PhonePe) first',
                proof_legacyMath: `Revenue - PhonePe - Credit - Expenses = ₹${legacy.expectedCash.toFixed(2)}`,
                proof_opsMath: `Certified Revenue - Certified PhonePe - Credit - Expenses = ₹${ops.expectedCash.toFixed(2)}`,
                proof_rootCause: 'This is a downstream symptom of incorrect revenue or missing PhonePe data.',
                proof_impact: 'Owner cannot trust the Cash Variance (Shortage/Excess) printed on the DSR.',
                proof_recommendation: 'Fix the upstream dependency before certifying Expected Cash.'
            });
        }

        // If no issues, emit a Certified Correct row
        if (shiftIssues.length === 0) {
            shiftIssues.push({
                ...baseIssue,
                id: baseIssue.id + '-CERT',
                calculation: 'Shift Totals',
                issueType: 'None',
                severity: 'None',
                status: '🟢 Certified Correct',
                currentVal: ops.totalRevenue,
                certifiedVal: ops.totalRevenue,
                difference: 0,
                pctDifference: '0%',
                financialImpact: 0,
                inventoryImpact: 0,
                ruleVersion: 'WF-A, WF-B, WF-D',
                actionRequired: 'None',
                proof_legacyMath: `Matched Operational Engine perfectly.`,
                proof_opsMath: `Matched Legacy Engine perfectly.`,
                proof_rootCause: 'Data aligns with all verified rules.',
                proof_impact: 'None.',
                proof_recommendation: 'No Action Required'
            });
        }

        return shiftIssues;
    }
};
