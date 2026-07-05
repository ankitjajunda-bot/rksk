// ============================================================================
// js/utils/recovery.js — Data Recovery and Backup Utility
// ============================================================================

const Recovery = {
  /**
   * Export all data for manual recovery.
   */
  async exportAllData() {
    const stores = [
      'master_ledger', 'pending_entries', 'employees', 'purchases', 
      'settings', 'stock', 'cashflow', 'prices', 'holidays', 'expenses'
    ];
    const data = {};
    for (const store of stores) {
      data[store] = await OctaneDB.dbGetAll(store);
    }
    return data;
  },

  /**
   * Import data from backup.
   */
  async importAllData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error("Invalid backup data format.");
    }
    for (const [store, records] of Object.entries(data)) {
      if (Array.isArray(records)) {
        for (const record of records) {
          await OctaneDB.dbPut(store, record);
        }
      }
    }
    console.log('[Recovery] Data imported successfully.');
  },

  /**
   * Auto-backup before any major operation.
   */
  async autoBackup() {
    try {
      const data = await this.exportAllData();
      const backup = {
        timestamp: new Date().toISOString(),
        data: data
      };
      
      // Store in a separate backup store
      await OctaneDB.dbPut('backups', { id: backup.timestamp, data: backup });
      
      // Keep only last 10 backups
      const allBackups = await OctaneDB.dbGetAll('backups');
      if (allBackups.length > 10) {
        const sortedBackups = allBackups.sort((a, b) => a.id.localeCompare(b.id));
        const oldest = sortedBackups[0];
        await OctaneDB.dbDelete('backups', oldest.id);
      }
      console.log('[Recovery] Auto-backup created:', backup.timestamp);
    } catch (e) {
      console.error('[Recovery] Auto-backup failed:', e);
      ErrorTracker.error('Auto-backup failed', 'Recovery', e);
    }
  },

  /**
   * Download the backup as a JSON file.
   */
  async downloadBackup() {
    const data = await this.exportAllData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `octaneflow_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

window.Recovery = Recovery;
