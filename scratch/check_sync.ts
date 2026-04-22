import { db } from './src/db';
import { eduDb } from './src/eduDb';

async function checkSyncStatus() {
    console.log("Checking Sync Status...");
    
    const allTables = [
        ...Object.values(db.tables),
        ...Object.values(eduDb.tables)
    ];

    for (const table of allTables) {
        const pending = await table.where('syncStatus').equals('pending').toArray();
        if (pending.length > 0) {
            console.log(`Table [${table.name}] has ${pending.length} pending items:`, pending);
        }
    }
}

checkSyncStatus();
