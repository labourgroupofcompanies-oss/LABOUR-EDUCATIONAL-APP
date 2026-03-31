const fs = require('fs');
const filePath = 'c:/Users/MR. RAY/Desktop/LABOUR-APP SYSTEM/src/services/syncService.ts';
const content = fs.readFileSync(filePath, 'utf8');
const patched = content.replace(/syncStatus:\s*'failed'/g, "syncStatus: 'pending'");
fs.writeFileSync(filePath, patched);
console.log('Patch complete.');
