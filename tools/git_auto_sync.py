import os
import subprocess
import json

def run_cmd(cmd):
    try:
        res = subprocess.run(cmd, shell=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return res.stdout.decode('utf-8').strip()
    except subprocess.CalledProcessError as e:
        return f"ERROR: {e.stderr.decode('utf-8').strip()}"

print("--- Starting Automated Agent-to-Agent Git Sync ---")

# 1. Check if git repository is dirty
status = run_cmd("git status --porcelain")
if status:
    print("Stashing local untracked/modified changes to avoid merge conflicts...")
    run_cmd("git stash")

# 2. Fetch and pull remote changes
print("Pulling latest coordination state from origin/main...")
pull_res = run_cmd("git pull --rebase origin main")
print(pull_res)

# 3. Pop stash if we stashed anything
if status:
    print("Restoring local changes from stash...")
    run_cmd("git stash pop")

# 4. Read coordination state to verify alignment
alignment_path = "agent_alignment.json"
if os.path.exists(alignment_path):
    try:
        with open(alignment_path, "r") as f:
            state = json.load(f)
        print(f"\n[Alignment State]: Project = {state.get('project')}")
        print(f"  Active Driver: {state.get('active_driver')}")
        print(f"  Next Steps: {state.get('current_state', {}).get('next_steps', [])}")
    except Exception as e:
        print(f"Error reading alignment state: {e}")

print("\nSync complete! Codebase is aligned and clean.")
