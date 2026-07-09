import json
import urllib.request
import urllib.error
import sys
import os

SUPABASE_URL = "https://tgaunkmbzzrlvdwyuykm.supabase.co"
SUPABASE_KEY = "sb_publishable_YJgYf4bM6Kh5AfqybtbH4g_H5hQN2Sf"
script_dir = os.path.dirname(os.path.abspath(__file__))
BACKUP_PATH = os.path.join(script_dir, "supabase_pre_migration_backup.json")
HONEST_DATA_PATH = os.path.join(script_dir, "..", "js", "honest_ledger_data.js")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def make_request(url, method="GET", body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, headers=headers, data=data, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read()
            return json.loads(res_data) if res_data else None
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        print(e.read().decode())
        sys.exit(1)
    except Exception as e:
        print(f"Connection Error: {e}")
        sys.exit(1)

def backup_supabase_ledger():
    print("STEP 1: Pulling current cloud ledger for backup...")
    url = f"{SUPABASE_URL}/rest/v1/daily_ledger?select=*"
    rows = make_request(url)
    if rows is None:
        rows = []
    print(f"Pulled {len(rows)} rows from Supabase.")
    
    # Save backup file
    os.makedirs(os.path.dirname(BACKUP_PATH), exist_ok=True)
    with open(BACKUP_PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2)
    
    # Verify backup exists and is non-empty
    if os.path.exists(BACKUP_PATH) and os.path.getsize(BACKUP_PATH) > 0:
        print(f"✅ Success: Backup saved cleanly to {BACKUP_PATH}")
    else:
        print("❌ Error: Backup file is missing or empty! Aborting.")
        sys.exit(1)

def clear_supabase_ledger():
    print("STEP 2: Deleting old mutated ledger rows from Supabase...")
    # Delete all rows where date is greater than '2000-01-01' (effectively everything)
    url = f"{SUPABASE_URL}/rest/v1/daily_ledger?date=gt.2000-01-01"
    make_request(url, method="DELETE")
    print("✅ Success: Supabase daily_ledger table truncated successfully.")

def load_honest_data():
    print("STEP 3: Loading verified honest physical data...")
    if not os.path.exists(HONEST_DATA_PATH):
        print(f"❌ Error: Honest data file not found at {HONEST_DATA_PATH}!")
        sys.exit(1)
    
    with open(HONEST_DATA_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    
    json_str = content.split("window.honest_ledger_data = ")[1].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    
    ledger_data = json.loads(json_str)
    raw_rows = ledger_data.get("daily_ledger", [])
    print(f"Loaded {len(raw_rows)} verified ledger days from honest_ledger_data.js")
    return raw_rows

def promote_to_supabase(rows):
    print("STEP 4: Promoting verified physical totalizers to Supabase...")
    
    # Format local honest rows to match Supabase database schema
    formatted_rows = []
    for r in rows:
        formatted = {
            "date": r["date"],
            "prices": r.get("prices"),
            "du1_p": r.get("du1_p"),
            "du1_d": r.get("du1_d"),
            "du2_p": r.get("du2_p"),
            "du2_d": r.get("du2_d"),
            "recon": r.get("recon"),
            "approved_by": r.get("approved_by"),
            "approved_at": r.get("approved_at"),
            "submitted_by": r.get("submitted_by")
        }
        formatted_rows.append(formatted)
        
    # Bulk insert in batches of 50
    batch_size = 50
    total_inserted = 0
    for i in range(0, len(formatted_rows), batch_size):
        batch = formatted_rows[i:i+batch_size]
        url = f"{SUPABASE_URL}/rest/v1/daily_ledger"
        make_request(url, method="POST", body=batch)
        total_inserted += len(batch)
        print(f"  Inserted batch: {i+1} to {min(i+batch_size, len(formatted_rows))} (Total: {total_inserted}/{len(formatted_rows)})")
        
    print(f"✅ Success: Promoted all {total_inserted} verified physical ledger entries to Supabase.")

def main():
    print("=== STARTING ULTRA-SAFE SUPABASE PROMOTION ===")
    backup_supabase_ledger()
    clear_supabase_ledger()
    honest_rows = load_honest_data()
    promote_to_supabase(honest_rows)
    print("=== PROMOTION COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    main()
