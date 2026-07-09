import json
import re
import os

files = ["dsr_data.js", "dsr_data_final_backup.js"]

dates_to_update = [
    "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24", "2026-05-25",
    "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-05-31"
]

for filename in files:
    if not os.path.exists(filename): continue
    with open(filename, "r", encoding="utf-8") as f:
        content = f.read()

    json_start = content.find("{")
    if json_start == -1: continue
    prefix = content[:json_start]
    json_str = content[json_start:]

    json_str = json_str.strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]

    data = json.loads(json_str)

    updated_count = 0
    for row in data.get("daily_ledger", []):
        if row.get("date") in dates_to_update:
            row["prices"] = {
                "petrol": 109.62,
                "diesel": 94.77
            }
            updated_count += 1

    print(f"Updated {updated_count} rows in {filename}.")

    with open(filename, "w", encoding="utf-8") as f:
        f.write(prefix + json.dumps(data, indent=2) + ";\n")
