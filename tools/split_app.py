import os
import re

APP_JS = "/Users/macintosh/Library/CloudStorage/GoogleDrive-ankitjajunda@gmail.com/.shortcut-targets-by-id/1--IhGmgSN7U0Ddw0TmKNMsQkURKBo7P5/G Drive share/git repo/rksk/app.js"
OUT_DIR = "/Users/macintosh/Library/CloudStorage/GoogleDrive-ankitjajunda@gmail.com/.shortcut-targets-by-id/1--IhGmgSN7U0Ddw0TmKNMsQkURKBo7P5/G Drive share/git repo/rksk/js"

if not os.path.exists(OUT_DIR):
    os.makedirs(OUT_DIR)

with open(APP_JS, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Define the logical chunks based on // ── headers
# Format: (Start Keyword, File Name)
CHUNKS = [
    (0, "sync.js"),
    ("── User Store ──", "auth.js"),
    ("── Wire login form ──", "ui_login.js"),
    ("── Employee: Rolling Date Picker Helper ──", "employee_dashboard.js"),
    ("── Employee: Submit Reading form ──", "employee_submit.js"),
    ("── Owner: Approvals Panel ──", "owner_approvals.js"),
    ("── Format datetime helper ──", "core_db_ledger.js"),
    ("── GLOBAL RUNTIME ERROR REPORTING ──", "error_reporting.js"),
    ("── DSR DATA CHECKER / VERIFICATION DASHBOARD ──", "dsr_checker.js"),
    ("── OTP Password Reset Logic ──", "auth_reset.js")
]

current_chunk = 0
files_data = {chunk[1]: [] for chunk in CHUNKS}

for i, line in enumerate(lines):
    if current_chunk < len(CHUNKS) - 1:
        next_keyword = CHUNKS[current_chunk + 1][0]
        if isinstance(next_keyword, str) and next_keyword in line:
            current_chunk += 1
    
    files_data[CHUNKS[current_chunk][1]].append(line)

# Write out the files
for filename, chunk_lines in files_data.items():
    path = os.path.join(OUT_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(chunk_lines)
    print(f"Wrote {filename}: {len(chunk_lines)} lines")

print("Splitting complete.")
