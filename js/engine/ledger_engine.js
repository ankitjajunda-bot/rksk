// ============================================================================
// js/engine/ledger_engine.js — Decoupled Ledger CRUD Engine
// ============================================================================

const LedgerEngine = {
  /**
   * Save daily readings to ledger and update stock levels based on sales difference.
   */
  saveDailyReadings(row, dbState, wacMap) {
    if (!dbState) return;
    
    const date = row.date;
    const oldRow = dbState.master_ledger.find(r => r.date === date);
    
    // Calculate old sales volumes
    const oldRecon = MathEngine.computeLedgerRow(oldRow, wacMap, dbState);
    const oldPetrolSales = oldRecon.totals.net_24h.petrol;
    const oldDieselSales = oldRecon.totals.net_24h.diesel;
    
    // Calculate new sales volumes
    const newRecon = MathEngine.computeLedgerRow(row, wacMap, dbState);
    const newPetrolSales = newRecon.totals.net_24h.petrol;
    const newDieselSales = newRecon.totals.net_24h.diesel;
    
    // Update stock levels
    if (dbState.stock) {
      if (typeof dbState.stock.petrol === 'number') {
        dbState.stock.petrol = Number((dbState.stock.petrol + oldPetrolSales - newPetrolSales).toFixed(3));
      }
      if (typeof dbState.stock.diesel === 'number') {
        dbState.stock.diesel = Number((dbState.stock.diesel + oldDieselSales - newDieselSales).toFixed(3));
      }
    }
    
    // Upsert row in master ledger
    if (oldRow) {
      Object.assign(oldRow, row);
    } else {
      dbState.master_ledger.push(row);
      // Sort master ledger by date ascending
      dbState.master_ledger.sort((a, b) => a.date.localeCompare(b.date));
    }
  },

  /**
   * Delete daily readings from ledger and refund the sales to stock levels.
   */
  deleteLedgerRow(date, dbState, wacMap) {
    if (!dbState || !dbState.master_ledger) return;
    
    const idx = dbState.master_ledger.findIndex(r => r.date === date);
    if (idx === -1) return;
    
    const oldRow = dbState.master_ledger[idx];
    const oldRecon = MathEngine.computeLedgerRow(oldRow, wacMap, dbState);
    const oldPetrolSales = oldRecon.totals.net_24h.petrol;
    const oldDieselSales = oldRecon.totals.net_24h.diesel;
    
    // Refund stock
    if (dbState.stock) {
      if (typeof dbState.stock.petrol === 'number') {
        dbState.stock.petrol = Number((dbState.stock.petrol + oldPetrolSales).toFixed(3));
      }
      if (typeof dbState.stock.diesel === 'number') {
        dbState.stock.diesel = Number((dbState.stock.diesel + oldDieselSales).toFixed(3));
      }
    }
    
    dbState.master_ledger.splice(idx, 1);
  },

  /**
   * Record a tanker load purchase, updating stock levels by actual decanted liters
   * and blending costs to calculate new rolling WAC rates.
   */
  recordTankerPurchase(purchase, dbState) {
    if (!dbState) return;
    
    const pQty = parseFloat(purchase.petrol_qty) || 0;
    const dQty = parseFloat(purchase.diesel_qty) || 0;
    const pPrice = parseFloat(purchase.petrol_price) || 0;
    const dPrice = parseFloat(purchase.diesel_price) || 0;
    
    // Nominal cost paid to supplier
    const petrolCostPaise = MathEngine.toPaise(pQty * pPrice);
    const dieselCostPaise = MathEngine.toPaise(dQty * dPrice);
    
    // Received volumes in tank (based on dips)
    const pRec = parseFloat(purchase.petrol_received) || pQty;
    const dRec = parseFloat(purchase.diesel_received) || dQty;
    
    // Update stock levels by actual received volumes
    if (dbState.stock) {
      const currentPetrol = dbState.stock.petrol || 0;
      const currentDiesel = dbState.stock.diesel || 0;
      
      const currentPetrolWacPaise = MathEngine.toPaise(dbState.stock.petrol_cost_wac || 0);
      const currentDieselWacPaise = MathEngine.toPaise(dbState.stock.diesel_cost_wac || 0);
      
      // BLEND COST FOR PETROL WAC
      const totalPetrolCostPaise = Math.round(currentPetrol * currentPetrolWacPaise) + petrolCostPaise;
      const totalPetrolLiters = currentPetrol + pRec;
      if (totalPetrolLiters > 0) {
        dbState.stock.petrol_cost_wac = MathEngine.toRupees(Math.round(totalPetrolCostPaise / totalPetrolLiters));
      }
      dbState.stock.petrol = Number((currentPetrol + pRec).toFixed(3));
      
      // BLEND COST FOR DIESEL WAC
      const totalDieselCostPaise = Math.round(currentDiesel * currentDieselWacPaise) + dieselCostPaise;
      const totalDieselLiters = currentDiesel + dRec;
      if (totalDieselLiters > 0) {
        dbState.stock.diesel_cost_wac = MathEngine.toRupees(Math.round(totalDieselCostPaise / totalDieselLiters));
      }
      dbState.stock.diesel = Number((currentDiesel + dRec).toFixed(3));
    }
    
    // Save purchase record
    if (!dbState.purchases) dbState.purchases = [];
    dbState.purchases.push(purchase);
    dbState.purchases.sort((a, b) => a.date.localeCompare(b.date));
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LedgerEngine;
}
if (typeof window !== 'undefined') {
  window.LedgerEngine = LedgerEngine;
}
