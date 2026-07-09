import re

with open('index.html', 'r') as f:
    content = f.read()

# Replace inline grid styles with just the class
content = content.replace(
    'class="emp-nozzle-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.6rem;"',
    'class="emp-nozzle-grid"'
)

# Fix input fields in nozzle grid
# We want to replace the hardcoded inline styles on inputs with the class 'emp-mobile-input'
content = re.sub(
    r'<input type="number" id="(emp-[a-z0-9]+-(open|close|tests))"(.*?)style="padding:0\.6rem;font-size:0\.85rem;width:100%;box-sizing:border-box;">',
    r'<input type="number" class="emp-mobile-input" id="\1"\3>',
    content
)

# Fix labels
content = re.sub(
    r'<label style="font-size:0\.7rem;color:#94a3b8;margin-bottom:0\.25rem;">(Opening|Closing|Testing \(Ltr\))</label>',
    r'<label class="emp-label">\1</label>',
    content
)

# Fix form groups
content = re.sub(
    r'<div class="form-group" style="margin:0;">',
    r'<div class="emp-form-group">',
    content
)

with open('index.html', 'w') as f:
    f.write(content)
