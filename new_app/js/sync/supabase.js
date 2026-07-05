// ============================================================================
// js/sync/supabase.js — Supabase Client & Operations
// ============================================================================

const SUPABASE_URL = 'https://tgaunkmbzzrlvdwyuykm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YJgYf4bM6Kh5AfqybtbH4g_H5hQN2Sf';

let _supabaseClient = null;

const SupabaseOps = {

  init() {
    if (typeof window.supabase === 'undefined') {
      ErrorTracker.warning('Supabase SDK not loaded', 'SupabaseOps');
      return null;
    }
    try {
      _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      ErrorTracker.info('Supabase client initialized', 'SupabaseOps');
      return _supabaseClient;
    } catch (e) {
      ErrorTracker.error('Failed to initialize Supabase', 'SupabaseOps', e);
      return null;
    }
  },

  getClient() {
    if (!_supabaseClient) this.init();
    return _supabaseClient;
  },

  async fetchPendingEntries() {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.from('pending_entries').select('*').eq('status', 'pending');
    if (error) throw error;
    return data || [];
  },

  async fetchMasterLedger() {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.from('master_ledger').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async fetchEmployees() {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');
    const { data, error } = await client.from('employees').select('*');
    if (error) throw error;
    return data || [];
  },

  async pushPendingEntry(entry) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');
    const payload = {
      id: entry.id,
      employee_id: entry.employee_id || null,
      date: entry.date,
      shift_type: entry.shift_type || entry.entryData?.shift || 'day',
      entry_data: entry.entry_data || entry.entryData || entry,
      status: entry.status || 'pending',
      submitted_at: entry.submitted_at || entry.submittedAt || new Date().toISOString()
    };
    const { error } = await client.from('pending_entries').upsert(payload);
    if (error) throw error;
  },

  async pushMasterLedger(entry) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');
    const payload = {
      id: entry.id || crypto.randomUUID(),
      employee_id: entry.employee_id || null,
      date: entry.date,
      shift_type: entry.shift_type || 'day',
      entry_data: entry.entry_data || entry,
      approved_at: entry.approved_at || new Date().toISOString()
    };
    const { error } = await client.from('master_ledger').upsert(payload);
    if (error) throw error;
  },

  async pushEmployee(employee) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');
    const payload = {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      pin: employee.pin || '0000',
      registration_code: employee.registration_code
    };
    const { error } = await client.from('employees').upsert(payload);
    if (error) throw error;
  },

  async deletePendingEntry(id) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');
    const { error } = await client.from('pending_entries').delete().eq('id', id);
    if (error) throw error;
  },

  async updatePendingEntryStatus(id, status) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase not initialized');
    const update = { status };
    if (status === 'approved') update.approved_at = new Date().toISOString();
    const { error } = await client.from('pending_entries').update(update).eq('id', id);
    if (error) throw error;
  }
};

window.SupabaseOps = SupabaseOps;
