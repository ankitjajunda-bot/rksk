const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'js');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  content = content.replace(/daily_ledger/g, 'master_ledger');
  // Be careful with replacing 'users' with 'employees' as 'users' might be in auth logic.
  // The user said: "System authenticates locally against the employees array in localStorage. NO Supabase Auth."
  // So 'db.users' becomes 'db.employees'.
  content = content.replace(/db\.users/g, 'db.employees');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
