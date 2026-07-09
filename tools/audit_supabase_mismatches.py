import json
import urllib.request
import urllib.error
import sys

# Configure Supabase credentials
SUPABASE_URL = "https://tgaunkmbzzrlvdwyuykm.supabase.co"
SUPABASE_KEY = "sb_publishable_YJgYf4bM6Kh5AfqybtbH4g_H5hQN2Sf"

def fetch_supabase_ledger():
    url = f"{SUPABASE_URL}/rest/v1/daily_ledger?select=*"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            data = response.read()
            return json.loads(data)
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        print(e.read().decode())
        sys.exit(1)
    except Exception as e:
        print(f"Error fetching: {e}")
        sys.exit(1)

# Read the local honest ledger
def load_honest_ledger():
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(script_dir, "..", "js", "honest_ledger_data.js")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
        # Extract the JSON part from window.honest_ledger_data = { ... }
        json_str = content.split("window.honest_ledger_data = ")[1].strip()
        if json_str.endswith(";"):
            json_str = json_str[:-1]
        data = json.loads(json_str)
        return {row["date"]: row for row in data["daily_ledger"]}

def main():
    print("Fetching cloud ledger from Supabase...")
    cloud_rows = fetch_supabase_ledger()
    print(f"Fetched {len(cloud_rows)} rows from Supabase.")
    
    print("Loading local honest ledger data...")
    honest_map = load_honest_ledger()
    print(f"Loaded {len(honest_map)} verified rows.")
    
    mismatches = []
    missing_on_cloud = []
    
    for date, honest_row in honest_map.items():
        # Find matching cloud row
        cloud_row = next((r for r in cloud_rows if r["date"] == date), None)
        if not cloud_row:
            missing_on_cloud.append(date)
            continue
            
        # Compare nozzles
        diffs = {}
        for nozzle in ["du1_p", "du1_d", "du2_p", "du2_d"]:
            h_nozzle = honest_row.get(nozzle, {})
            c_nozzle = cloud_row.get(nozzle, {}) or {}
            
            for field in ["open", "close_day", "close_night"]:
                h_val = h_nozzle.get(field)
                c_val = c_nozzle.get(field)
                
                # Round for comparison to avoid float precision issues
                if h_val is not None and c_val is not None:
                    h_val_r = round(float(h_val), 2)
                    c_val_r = round(float(c_val), 2)
                    if h_val_r != c_val_r:
                        diffs[f"{nozzle}_{field}"] = {"honest": h_val_r, "cloud": c_val_r}
                        
        if diffs:
            mismatches.append({"date": date, "diffs": diffs})
            
    print(f"\nAudit complete. Found {len(mismatches)} mismatches and {len(missing_on_cloud)} missing cloud dates.")
    
    report = {
        "mismatches": mismatches,
        "missing_on_cloud": missing_on_cloud
    }
    out_path = os.path.join(script_dir, "supabase_audit_results.json")
    with open(out_path, "w") as out:
        json.dump(report, out, indent=2)
    print(f"Written results to {out_path}")

if __name__ == "__main__":
    main()
