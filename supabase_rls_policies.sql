-- Create new tables for the new app
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,
  registration_code TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'employee',
  active BOOLEAN DEFAULT true,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'night')),
  entry_data JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ NULL,
  reviewed_by UUID REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS master_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'night')),
  entry_data JSONB NOT NULL,
  approved_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Pending Entries: Anyone can insert, owner can read/update
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
