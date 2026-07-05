// ============================================================================
// js/core/sync_queue.js — Sync Queue with Exponential Backoff Retry
// ============================================================================

class SyncQueue {
  constructor() {
    this.isProcessing = false;
    this.maxRetries = Infinity; // Retry forever until success
    this.retryDelay = 1000; // Start with 1s
    this.maxDelay = 60000; // Max 60s between retries
  }

  async enqueue(operation, data) {
    const item = {
      id: crypto.randomUUID(),
      operation,
      data,
      retries: 0,
      status: 'pending', // pending | processing | completed | failed
      createdAt: new Date().toISOString(),
      lastAttempt: null
    };
    await OctaneDB.dbPut('sync_queue', item);
    ErrorTracker.log('info', `Sync queue: enqueued ${operation}`, 'SyncQueue');
    this.processQueue(); // Fire and forget
    return item.id;
  }

  async processQueue() {
    if (this.isProcessing) return;
    if (!navigator.onLine) return;

    this.isProcessing = true;

    try {
      const items = await OctaneDB.dbGetAll('sync_queue');
      const pending = items
        .filter(i => (i.status === 'pending' || i.status === 'failed') && (!i.nextRetry || Date.now() >= i.nextRetry))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      for (const item of pending) {
        try {
          item.status = 'processing';
          item.lastAttempt = new Date().toISOString();
          await OctaneDB.dbPut('sync_queue', item);

          await this._execute(item);

          item.status = 'completed';
          item.completedAt = new Date().toISOString();
          await OctaneDB.dbPut('sync_queue', item);
          // Clean up completed items
          await OctaneDB.dbDelete('sync_queue', item.id);

        } catch (err) {
          item.retries = (item.retries || 0) + 1;
          item.status = 'failed';
          item.lastError = err.message;
          item.nextRetry = Date.now() + Math.min(this.retryDelay * Math.pow(1.5, item.retries), this.maxDelay);
          
          ErrorTracker.log('error', `Sync failed: ${item.operation}. Retrying at ${new Date(item.nextRetry).toLocaleTimeString()}`, 'SyncQueue', err);
          
          await OctaneDB.dbPut('sync_queue', item);
        }
      }
      
      // Setup next run if there are pending items in the future
      const updatedItems = await OctaneDB.dbGetAll('sync_queue');
      const futureItems = updatedItems.filter(i => i.status === 'failed' && i.nextRetry > Date.now());
      if (futureItems.length > 0) {
        const nextTime = Math.min(...futureItems.map(i => i.nextRetry));
        const delay = Math.max(1000, nextTime - Date.now());
        setTimeout(() => this.processQueue(), delay);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async _execute(item) {
    const { operation, data } = item;

    switch (operation) {
      case 'PUSH_PENDING':
        await SupabaseOps.pushPendingEntry(data);
        break;
      case 'PUSH_LEDGER':
        await SupabaseOps.pushMasterLedger(data);
        break;
      case 'PUSH_EMPLOYEE':
        await SupabaseOps.pushEmployee(data);
        break;
      case 'DELETE_PENDING':
        await SupabaseOps.deletePendingEntry(data.id);
        break;
      case 'PULL_PENDING':
        await SyncManager.pullPending();
        break;
      default:
        throw new Error(`Unknown sync operation: ${operation}`);
    }
  }

  async getPendingCount() {
    const items = await OctaneDB.dbGetAll('sync_queue');
    return items.filter(i => i.status === 'pending' || i.status === 'processing').length;
  }

  async getFailedItems() {
    const items = await OctaneDB.dbGetAll('sync_queue');
    return items.filter(i => i.status === 'failed');
  }

  async retryFailed() {
    const items = await OctaneDB.dbGetAll('sync_queue');
    const failed = items.filter(i => i.status === 'failed');
    for (const item of failed) {
      item.status = 'pending';
      item.retries = 0;
      await OctaneDB.dbPut('sync_queue', item);
    }
    this.processQueue();
  }

  async clearCompleted() {
    const items = await OctaneDB.dbGetAll('sync_queue');
    for (const item of items.filter(i => i.status === 'completed')) {
      await OctaneDB.dbDelete('sync_queue', item.id);
    }
  }
}

window.syncQueue = new SyncQueue();

// Listen for online events to process queue
window.addEventListener('online', () => {
  console.log('[SyncQueue] Back online — processing queue');
  window.syncQueue.processQueue();
});
