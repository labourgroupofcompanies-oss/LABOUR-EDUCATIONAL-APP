import { db } from '../db';

/**
 * Generates a unique school ID in the format: SCH-LOCAL-YYYY-RANDOM
 * This function is offline-capable and checks for collisions in local storage.
 */
export async function generateSchoolId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SCH-${year}`;
    let isUnique = false;
    let schoolId = '';
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
        attempts++;
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        schoolId = `${prefix}-${randomStr}`;

        // Check for collision in IndexedDB using schoolCode
        const existing = await db.schools.where('schoolCode').equals(schoolId).first();
        if (!existing) {
            isUnique = true;
        }
    }

    if (!isUnique) {
        // Fallback or handle extreme collision case
        // In theory, a 4-char alphanumeric random string has 36^4 combinations, 
        // which is over 1.6 million. Collisions are unlikely for a single local app.
        const extraRandom = Math.random().toString(36).substring(2, 10).toUpperCase();
        schoolId = `${prefix}-${extraRandom}`;
    }

    return schoolId;
}

/**
 * Generates a unique student ID in the format: STU-YYYY-XXXX
 */
export async function generateStudentId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `STU-${year}`;
    let isUnique = false;
    let studentId = '';
    let attempts = 0;
    const maxAttempts = 10;

    // We need to import eduDb here or pass it in. strict dependency injection is better but for now we import.
    // Dynamic import to avoid circular dependency if any (though unlikely here)
    const { eduDb } = await import('../eduDb');

    while (!isUnique && attempts < maxAttempts) {
        attempts++;
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        studentId = `${prefix}-${randomStr}`;

        const existing = await eduDb.students.where('studentIdString').equals(studentId).first();
        if (!existing) {
            isUnique = true;
        }
    }

    if (!isUnique) {
        const extraRandom = Math.random().toString(36).substring(2, 8).toUpperCase();
        studentId = `${prefix}-${extraRandom}`;
    }

    return studentId;
}
