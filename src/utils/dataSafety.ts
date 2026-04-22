/**
 * Data Safety Utilities
 * Logic to normalize and heal data shapes from external sources (DB, Cloud, Settings)
 */

/**
 * Strict check for plain objects {}
 * Excludes arrays, nulls, and special classes (Dates, Blobs, etc.)
 */
export function isPlainObject(val: any): boolean {
    return val !== null && 
           typeof val === 'object' && 
           Object.getPrototypeOf(val) === Object.prototype;
}

/**
 * Ensures a value is an array.
 * Heals "numeric-key objects" back into arrays.
 */
export function normalizeArray<T>(val: any): T[] {
    if (Array.isArray(val)) return val;
    
    if (isPlainObject(val)) {
        const keys = Object.keys(val).sort((a, b) => Number(a) - Number(b));
        // Check if all keys are numeric (0, 1, 2...)
        const isNumeric = keys.length > 0 && keys.every(k => !isNaN(Number(k)));
        
        if (isNumeric) {
            logHealing('Corrupted Array (Numeric Object)', val);
            return keys.map(k => val[k]);
        }
    }
    
    return [];
}

/**
 * Ensures a value is a plain object.
 */
export function normalizeObject<T extends object>(val: any): T {
    return isPlainObject(val) ? val : ({} as T);
}

export function safeString(val: any, fallback = ''): string {
    if (typeof val === 'string') return val;
    if (val === null || val === undefined) return fallback;
    return String(val);
}

export function safeNumber(val: any, fallback = 0): number {
    if (typeof val === 'number' && !isNaN(val)) return val;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

export function safeBoolean(val: any, fallback = false): boolean {
    if (typeof val === 'boolean') return val;
    if (val === 'true' || val === 1) return true;
    if (val === 'false' || val === 0) return false;
    return fallback;
}

export function safeEnum<T extends string>(val: any, allowed: T[], fallback: T): T {
    return allowed.includes(val) ? val : fallback;
}

/**
 * Developer log for data healing events.
 * Triggered when malformed data is detected and repaired.
 */
export function logHealing(label: string, data: any) {
    if (import.meta.env.DEV) {
        console.warn(`[DataSafety] Healing recovered malformed data: ${label}`, { original: data });
    }
}
