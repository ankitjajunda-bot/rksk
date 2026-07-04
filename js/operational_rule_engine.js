/**
 * Operational Rule Engine
 * Source of truth for business rules defined in the Operational Knowledge Base.
 */

window.OperationalRuleEngine = {
    // Defines the status of all active rules
    rules: {
        "WF-A.1": { name: "Day Shift Testing", status: "Verified", description: "Actual Testing Litres = Number of Tests × 5" },
        "WF-A.2": { name: "Net Sales Calculation", status: "Verified", description: "Net Customer Sales = Gross Litres - Actual Testing Litres" },
        "WF-A.3": { name: "Expected Cash Calculation", status: "Verified", description: "Expected Cash = Revenue - Digital - Credit - Expenses" },
        "WF-B.1": { name: "Night Shift Testing", status: "Verified", description: "Testing Count = 0. Gross Litres = Net Litres." },
        "WF-B.2": { name: "Night PhonePe Settlement", status: "Verified", description: "Pre-Settlement = Settlement - Open. Total PhonePe = Pre-Settlement + Close." },
        "WF-C.1": { name: "Tanker Dip Reconciliation", status: "Partially Verified", description: "Actual Litres Received = Dip After - Dip Before" },
        "WF-D.1": { name: "Historical Price Lookup", status: "Verified", description: "Revenue Price = Latest Historical Price where Effective_Date <= Shift_Date" }
    },

    /**
     * Calculates the true Operational Result for a given shift based on Observed Facts.
     */
    calculateShift: function(shiftFacts) {
        // shiftFacts structure:
        // { type: 'Day' | 'Night', date: 'YYYY-MM-DD', prices: {petrol, diesel}, 
        //   du1_p: {open, close, tests}, du2_p: ...,
        //   phonepe_open, phonepe_close, phonepe_settlement, cash, expenses, credit }

        const result = {
            grossLitres: { petrol: 0, diesel: 0 },
            testingLitres: { petrol: 0, diesel: 0 },
            netSales: { petrol: 0, diesel: 0 },
            revenue: { petrol: 0, diesel: 0 },
            totalRevenue: 0,
            digitalCollection: 0,
            expectedCash: 0,
            appliedRules: []
        };

        const pumps = ['du1_p', 'du1_d', 'du2_p', 'du2_d'];
        
        pumps.forEach(p => {
            const data = shiftFacts[p];
            if (!data) return;

            const product = p.endsWith('_p') ? 'petrol' : 'diesel';
            const gross = Math.max(0, data.close - data.open);
            result.grossLitres[product] += gross;

            let tests = 0;
            if (shiftFacts.type === 'Day') {
                result.appliedRules.push("WF-A.1");
                tests = data.tests * 5; // Day shift tests * 5
            } else {
                result.appliedRules.push("WF-B.1");
                tests = 0; // Night shift tests = 0
            }

            result.testingLitres[product] += tests;
            
            result.appliedRules.push("WF-A.2");
            const net = Math.max(0, gross - tests);
            result.netSales[product] += net;

            result.appliedRules.push("WF-D.1");
            const price = shiftFacts.prices[product] || 0; 
            // In a real historical lookup, we'd query the price array. 
            // For now we use the price locked in the shift facts.
            result.revenue[product] += (net * price);
        });

        result.totalRevenue = result.revenue.petrol + result.revenue.diesel;

        // Digital Collections
        if (shiftFacts.type === 'Night' && shiftFacts.phonepe_settlement !== undefined) {
            result.appliedRules.push("WF-B.2");
            const pre = shiftFacts.phonepe_settlement - shiftFacts.phonepe_open;
            result.digitalCollection = pre + shiftFacts.phonepe_close;
        } else {
            // Day shift
            result.digitalCollection = shiftFacts.phonepe_close - shiftFacts.phonepe_open;
        }

        // Expected Cash
        result.appliedRules.push("WF-A.3");
        result.expectedCash = result.totalRevenue - result.digitalCollection - shiftFacts.credit - shiftFacts.expenses;

        // Dedup rules
        result.appliedRules = [...new Set(result.appliedRules)];

        return result;
    }
};
