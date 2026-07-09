import json
import re

filename = "dsr_data_certified.js"

with open(filename, "r", encoding="utf-8") as f:
    content = f.read()

# Find the start of JSON
json_start = content.find("{")
prefix = content[:json_start]
json_str = content[json_start:]

# Remove trailing semicolon and whitespace
json_str = json_str.strip()
if json_str.endswith(";"):
    json_str = json_str[:-1]

data = json.loads(json_str)

dates_to_update = [
    "2026-05-21", "2026-05-22", "2026-05-23", "2026-05-24", "2026-05-25",
    "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-05-31"
]

updated_count = 0
for row in data.get("daily_ledger", []):
    if row.get("date") in dates_to_update:
        row["prices"] = {
            "petrol": 109.62,
            "diesel": 94.77
        }
        updated_count += 1

print(f"Updated {updated_count} rows.")

with open(filename, "w", encoding="utf-8") as f:
    f.write(prefix + json.dumps(data, indent=2) + ";\n")
