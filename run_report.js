const fs = require('fs');

const jsString = fs.readFileSync('dumped_ledger.json', 'utf8');

// We evaluate the JS string to get the array
// We need to make sure we just assign it to a variable
let data = [];
try {
  eval('data = ' + jsString);
} catch (e) {
  console.error("Failed to eval JS data:", e);
  process.exit(1);
}

let no_change_count = 0;
let negative_count = 0;

console.log("# Totalizer Analysis Report\\n");

data.forEach(d => {
  ['du1_p', 'du1_d', 'du2_p', 'du2_d'].forEach(du => {
    if (d[du]) {
      const o = d[du].open;
      const c_night = d[du].close_night;
      const c_day = d[du].close_day;
      
      if (typeof o === 'number' && typeof c_night === 'number' && o === c_night && o > 0) {
        console.log(`- ${d.date} | ${du.toUpperCase()} | Open: ${o}, Close Night: ${c_night} (No Change)`);
        no_change_count++;
      }
      
      [
        { key: 'open', val: o },
        { key: 'close_day', val: c_day },
        { key: 'close_night', val: c_night }
      ].forEach(({key, val}) => {
        if (typeof val === 'number' && val < 0) {
          console.log(`- ${d.date} | ${du.toUpperCase()} | ${key.toUpperCase()}: ${val} (Negative)`);
          negative_count++;
        }
      });
    }
  });
});

console.log(`\\nTotal unchanged shifts: ${no_change_count}`);
console.log(`Total negative values: ${negative_count}`);
