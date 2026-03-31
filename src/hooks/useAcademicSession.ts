import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../eduDb';
import { db } from '../db';
import { useAuth } from './useAuth';

/**
 * Returns the active academic session as set by the Headteacher in Settings.
 * Provides `currentTerm` (e.g. "Term 1") and `academicYear` (e.g. "2025/2026"),
 * as well as the numeric `currentYear`.
 * Defaults to school onboarding values if no settings are configured.
 */
export function useAcademicSession() {
    const { user } = useAuth();

    const session = useLiveQuery(async () => {
        if (!user?.schoolId) return null;

        // 1. Fetch academic settings
        const settings = await eduDb.settings
            .where('schoolId').equals(user.schoolId)
            .and(s => s.key === 'currentTerm' || s.key === 'academicYear')
            .toArray();

        const termSetting = settings.find(s => s.key === 'currentTerm')?.value as string | undefined;
        const yearSetting = settings.find(s => s.key === 'academicYear')?.value as string | undefined;

        // 2. Fetch school record for onboarding fallbacks (resilient lookup)
        const school = await db.schools
            .where('schoolId').equals(user.schoolId)
            .or('idCloud').equals(user.schoolId)
            .first();
        const fallbackTerm = school?.onboardingTerm ?? 'Term 1';
        const fallbackYear = school?.onboardingAcademicYear ?? `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;

        // 3. Resolve active values
        const activeTerm = termSetting ?? fallbackTerm;
        const activeYear = yearSetting ?? fallbackYear;
        const numericYear = activeYear ? parseInt(activeYear.split('/')[0]) : new Date().getFullYear();

        return {
            currentTerm: activeTerm,
            academicYear: activeYear,
            currentYear: isNaN(numericYear) ? new Date().getFullYear() : numericYear,
        };
    }, [user?.schoolId]);

    const defaultYear = `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;

    return {
        currentTerm: session?.currentTerm ?? 'Term 1',
        academicYear: session?.academicYear ?? defaultYear,
        currentYear: session?.currentYear ?? new Date().getFullYear(),
        isLoaded: session !== undefined,
    };
}
