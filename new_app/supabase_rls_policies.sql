-- Enable RLS on all tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_ledger ENABLE ROW LEVEL SECURITY;

-- Employees: Read-only for authenticated users, insert/update only by owner
CREATE POLICY "Employees are viewable by authenticated users" ON employees
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only owner can insert employees" ON employees
  FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM employees WHERE role = 'owner'));

CREATE POLICY "Only owner can update employees" ON employees
  FOR UPDATE USING (auth.uid() IN (SELECT id FROM employees WHERE role = 'owner'));

-- Pending Entries: Employees can insert, owner can read/update
CREATE POLICY "Anyone can insert pending entries" ON pending_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Owner can read all pending entries" ON pending_entries
  FOR SELECT USING (auth.uid() IN (SELECT id FROM employees WHERE role = 'owner'));

CREATE POLICY "Owner can update pending entries" ON pending_entries
  FOR UPDATE USING (auth.uid() IN (SELECT id FROM employees WHERE role = 'owner'));

-- Master Ledger: Only owner can insert/update, everyone can read
CREATE POLICY "Everyone can read master ledger" ON master_ledger
  FOR SELECT USING (true);

CREATE POLICY "Only owner can insert to master ledger" ON master_ledger
  FOR INSERT WITH CHECK (auth.uid() IN (SELECT id FROM employees WHERE role = 'owner'));

CREATE POLICY "Only owner can update master ledger" ON master_ledger
  FOR UPDATE USING (auth.uid() IN (SELECT id FROM employees WHERE role = 'owner'));

-- Disable delete on master_ledger entirely
CREATE POLICY "No one can delete from master ledger" ON master_ledger
  FOR DELETE USING (false);

-- ==========================================
-- Employee Sessions (Link Login)
-- ==========================================

-- Create employee_sessions table
CREATE TABLE IF NOT EXISTS employee_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  device_info TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_sessions_token ON employee_sessions(token);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_expires ON employee_sessions(expires_at);

-- Enable RLS
ALTER TABLE employee_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Owner can manage sessions" ON employee_sessions
  FOR ALL USING (auth.uid() IN (SELECT id FROM employees WHERE role = 'owner'));

CREATE POLICY "Anyone can validate token" ON employee_sessions
  FOR SELECT USING (true);
