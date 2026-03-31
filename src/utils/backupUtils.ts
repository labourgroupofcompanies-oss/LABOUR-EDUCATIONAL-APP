import { db } from '../db';
import { eduDb } from '../eduDb';

// Helper to convert Blob to ArrayBuffer -> Uint8Array -> Array
const blobToArray = async (blob: Blob): Promise<number[]> => {
    const arrayBuffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(arrayBuffer));
};

// Helper to convert Array -> Uint8Array -> Blob
const arrayToBlob = (array: number[], type: string = 'application/octet-stream'): Blob => {
    return new Blob([new Uint8Array(array)], { type });
};

export const exportDatabase = async () => {
    try {
        const data: any = {
            version: 1,
            timestamp: Date.now(),
            db: {},
            eduDb: {}
        };

        // Export 'db' tables
        const dbTables = db.tables;
        for (const table of dbTables) {
            const tableName = table.name;
            const records = await table.toArray();

            // Process records to handle Blobs
            const processedRecords = await Promise.all(records.map(async (record) => {
                const newRecord = { ...record };
                for (const key in newRecord) {
                    if (newRecord[key] instanceof Blob) {
                        newRecord[key] = {
                            _type: 'blob',
                            mimeType: newRecord[key].type,
                            data: await blobToArray(newRecord[key])
                        };
                    }
                }
                return newRecord;
            }));

            data.db[tableName] = processedRecords;
        }

        // Export 'eduDb' tables
        const eduDbTables = eduDb.tables;
        for (const table of eduDbTables) {
            const tableName = table.name;
            const records = await table.toArray();

            // Process records to handle Blobs
            const processedRecords = await Promise.all(records.map(async (record) => {
                const newRecord = { ...record };
                for (const key in newRecord) {
                    if (newRecord[key] instanceof Blob) {
                        newRecord[key] = {
                            _type: 'blob',
                            mimeType: newRecord[key].type,
                            data: await blobToArray(newRecord[key])
                        };
                    }
                }
                return newRecord;
            }));

            data.eduDb[tableName] = processedRecords;
        }

        return JSON.stringify(data);
    } catch (error) {
        console.error('Export failed:', error);
        throw error;
    }
};

export const importDatabase = async (jsonString: string) => {
    try {
        const data = JSON.parse(jsonString);

        if (!data.version || !data.db || !data.eduDb) {
            throw new Error('Invalid backup file format');
        }

        // Import into 'db'
        await db.transaction('rw', db.tables, async () => {
            // Clear all tables first? Or maybe just overwrite/add?
            // Usually restore implies replacing state. Let's clear for safety/consistency.
            // CAUTION: This deletes everything!
            for (const table of db.tables) {
                await table.clear();
                const records = data.db[table.name] || [];

                // Reconstruct Blobs
                const processedRecords = records.map((record: any) => {
                    for (const key in record) {
                        if (record[key] && typeof record[key] === 'object' && record[key]._type === 'blob') {
                            record[key] = arrayToBlob(record[key].data, record[key].mimeType);
                        }
                    }
                    return record;
                });

                if (processedRecords.length > 0) {
                    await table.bulkAdd(processedRecords);
                }
            }
        });

        // Import into 'eduDb'
        await eduDb.transaction('rw', eduDb.tables, async () => {
            for (const table of eduDb.tables) {
                await table.clear();
                const records = data.eduDb[table.name] || [];

                // Reconstruct Blobs
                const processedRecords = records.map((record: any) => {
                    for (const key in record) {
                        if (record[key] && typeof record[key] === 'object' && record[key]._type === 'blob') {
                            record[key] = arrayToBlob(record[key].data, record[key].mimeType);
                        }
                    }
                    return record;
                });

                if (processedRecords.length > 0) {
                    await table.bulkAdd(processedRecords);
                }
            }
        });

        return true;
    } catch (error) {
        console.error('Import failed:', error);
        throw error;
    }
};
