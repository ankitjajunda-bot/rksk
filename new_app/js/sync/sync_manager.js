// ============================================================================
// js/sync/sync_manager.js — Orchestrates Push/Pull Operations
// ============================================================================

const SyncManager = {

  /**
   * Pull ALL data from Supabase into IndexedDB.
   */
  async pullAll() {
    const results = { pending: 0, ledger: 0, employees: 0, errors: [] };

    try {
      const pending = await SupabaseOps.fetchPendingEntries();
      for (const entry of pending) {
        entry.id = entry.id || crypto.randomUUID();
        await OctaneDB.dbPut('pending_entries', entry);
      }
      results.pending = pending.length;
    } catch (e) {
      results.errors.push(`Pending: ${e.message}`);
      ErrorTracker.error('Failed to pull pending entries', 'SyncManager', e);
    }

    try {
      const ledger = await SupabaseOps.fetchMasterLedger();
      for (const entry of ledger) {
        entry.id = entry.id || entry.date;
        await OctaneDB.dbPut('master_ledger', entry);
      }
      results.ledger = ledger.length;
    } catch (e) {
      results.errors.push(`Ledger: ${e.message}`);
      ErrorTracker.error('Failed to pull master ledger', 'SyncManager', e);
    }

    try {
      const employees = await SupabaseOps.fetchEmployees();
      for (const emp of employees) {
        await OctaneDB.dbPut('employees', emp);
      }
      results.employees = employees.length;
    } catch (e) {
      results.errors.push(`Employees: ${e.message}`);
      ErrorTracker.error('Failed to pull employees', 'SyncManager', e);
    }

    ErrorTracker.info(`Pull complete: ${results.pending} pending, ${results.ledger} ledger, ${results.employees} employees`, 'SyncManager');
    return results;
  },

  /**
   * Push all pending local changes to Supabase via the sync queue.
   */
  async pushAll() {
    const pending = await OctaneDB.dbGetAll('pending_entries');
    const dirtyPending = pending.filter(e => e._dirty || e.status === 'pending');

    for (const entry of dirtyPending) {
      await window.syncQueue.enqueue('PUSH_PENDING', entry);
    }

    const ledger = await OctaneDB.dbGetAll('master_ledger');
    const dirtyLedger = ledger.filter(r => r._dirty);

    for (const row of dirtyLedger) {
      await window.syncQueue.enqueue('PUSH_LEDGER', row);
    }

    ErrorTracker.info(`Push queued: ${dirtyPending.length} pending + ${dirtyLedger.length} ledger entries`, 'SyncManager');
    return { pending: dirtyPending.length, ledger: dirtyLedger.length };
  },

  /**
   * Pull only pending entries from Supabase.
   */
  async pullPending() {
    try {
      const remote = await SupabaseOps.fetchPendingEntries();
      const local = await OctaneDB.dbGetAll('pending_entries');
      const localIds = new Set(local.map(e => e.id));

      let newCount = 0;
      for (const entry of remote) {
        if (!localIds.has(entry.id)) {
          await OctaneDB.dbPut('pending_entries', entry);
          newCount++;
        } else {
          // Update status if changed remotely
          const localEntry = local.find(e => e.id === entry.id);
          if (localEntry && localEntry.status !== entry.status) {
            localEntry.status = entry.status;
            await OctaneDB.dbPut('pending_entries', localEntry);
          }
        }
      }

      if (typeof showNotification === 'function') {
        showNotification(`✅ Pulled ${newCount} new entries from cloud.`, 'success');
      }
      return { success: true, count: newCount };
    } catch (e) {
      ErrorTracker.error('Failed to pull pending entries', 'SyncManager', e);
      if (typeof showNotification === 'function') {
        showNotification('❌ Failed to pull entries from cloud.', 'danger');
      }
      return { success: false, error: e.message };
    }
  },

  /**
   * Push pending entries from local to Supabase.
   */
  async pushPending() {
    const pending = await OctaneDB.dbGetAll('pending_entries');
    const toPush = pending.filter(e => e._dirty || !e._synced);

    for (const entry of toPush) {
      await window.syncQueue.enqueue('PUSH_PENDING', entry);
      entry._synced = true;
      entry._dirty = false;
      await OctaneDB.dbPut('pending_entries', entry);
    }

    return { queued: toPush.length };
  },

  /**
   * Sync a single employee to Supabase.
   */
  async syncEmployee(employee) {
    await window.syncQueue.enqueue('PUSH_EMPLOYEE', employee);
  },

  /**
   * Simple optimistic lock
   */
  async acquireLock(resourceId, userId) {
    const lock = await OctaneDB.dbGet('locks', resourceId);
    if (lock && lock.expires > Date.now()) {
      return false; // Locked by someone else
    }
    await OctaneDB.dbPut('locks', {
      key: resourceId,
      userId: userId,
      expires: Date.now() + 30000 // 30 second timeout
    });
    return true;
  },

  async releaseLock(resourceId) {
    await OctaneDB.dbDelete('locks', resourceId);
  }
};

window.SyncManager = SyncManager;
