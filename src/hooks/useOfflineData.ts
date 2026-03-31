import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LabourItem } from '../db';

export function useOfflineData() {
    const items = useLiveQuery(() => db.items.toArray());

    const addItem = async (item: Omit<LabourItem, 'id' | 'createdAt' | 'syncStatus'>) => {
        return await db.items.add({
            ...item,
            syncStatus: 'pending',
            createdAt: Date.now(),
        });
    };

    const deleteItem = async (id: number) => {
        return await db.items.delete(id);
    };

    const updateItem = async (id: number, changes: Partial<LabourItem>) => {
        return await db.items.update(id, changes);
    };

    return {
        items,
        addItem,
        deleteItem,
        updateItem,
        isLoading: items === undefined,
    };
}
