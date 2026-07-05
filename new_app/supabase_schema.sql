
-- ==========================================
-- Employee Sessions (Link Login)
-- ==========================================
CREATE TABLE IF NOT EXISTS employee_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  device_info TEXT
);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_token ON employee_sessions(token);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_expires ON employee_sessions(expires_at);
