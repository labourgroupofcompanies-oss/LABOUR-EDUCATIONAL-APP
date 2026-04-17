import { db } from '../db';
import { eduDb } from '../eduDb';
import { supabase } from '../supabaseClient';

export interface SubscriptionStatus {
    isSubscribed: boolean;
    type: 'trial' | 'active' | 'expired' | 'none';
    subscription?: any;
    lastVerifiedAt?: number;
    isLoading: boolean;
}

const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export const subscriptionService = {
    /**
     * Resolves the current subscription state for a school.
     * Checks Trial -> Cloud (if online) -> Local Cache.
     */
    async resolveStatus(schoolId: string, currentTerm: string, academicYear: string): Promise<SubscriptionStatus> {
        if (!schoolId || !currentTerm || !academicYear) {
            return { isSubscribed: false, type: 'none', isLoading: false };
        }

        try {
            // 1. FREE TRIAL LOGIC (Deterministic)
            // Use resilient query (checking both idCloud and schoolId) matching useAcademicSession pattern
            const school = await db.schools
                .where('idCloud').equals(schoolId)
                .or('schoolId').equals(schoolId)
                .first();

            const currentTermNorm = (currentTerm || '').trim().toLowerCase();
            const currentYearNorm = (academicYear || '').toString().trim().toLowerCase();

            // Check if settings have ever been explicitly modified
            const hasCustomSettings = await eduDb.settings
                .where('schoolId').equals(schoolId)
                .and(s => s.key === 'currentTerm' || s.key === 'academicYear')
                .count();

            if (school) {
                const schoolTerm = (school.onboardingTerm || 'Term 1').trim().toLowerCase();
                const schoolYear = (school.onboardingAcademicYear || '').trim().toLowerCase();

                // Trial applies if they haven't explicitly set a new term, OR if it strictly matches their onboarding term
                const isExplicitTrialTerm = schoolTerm === currentTermNorm && (schoolYear ? schoolYear === currentYearNorm : true);
                
                if (isExplicitTrialTerm || hasCustomSettings === 0) {
                    return { 
                        isSubscribed: true, 
                        type: 'trial', 
                        isLoading: false,
                        subscription: { status: 'trial', term: currentTerm, academic_year: academicYear }
                    };
                }
            }

            // 1.1 HEAL/FALLBACK: For new schools with missing metadata, default to trial if Term 1 and no history exists
            if (!school || !school.onboardingTerm) {
                const localSubs = await eduDb.subscriptions.where('schoolId').equals(schoolId).toArray();
                if (localSubs.length === 0 && (currentTermNorm === 'term 1' || hasCustomSettings === 0)) {
                    return {
                        isSubscribed: true,
                        type: 'trial',
                        isLoading: false,
                        subscription: { status: 'trial', term: currentTerm, academic_year: academicYear }
                    };
                }
            }

            const isOnline = window.navigator.onLine;

            // 2. CLOUD AUTHORITY (If Online)
            if (isOnline) {
                const { data: cloudSub } = await supabase
                    .from('school_subscriptions')
                    .select('*')
                    .eq('school_id', schoolId)
                    .eq('term', currentTerm)
                    .eq('academic_year', academicYear)
                    .in('status', ['active', 'trial'])
                    .maybeSingle();

                if (cloudSub) {
                    const status = cloudSub.status as 'active' | 'trial';
                    const verifiedSub = {
                        schoolId,
                        term: currentTerm,
                        academicYear: academicYear.toString(),
                        status: status,
                        verifiedAt: Date.now(),
                        idCloud: cloudSub.id,
                        syncStatus: 'synced' as const,
                        createdAt: new Date(cloudSub.created_at).getTime(),
                        updatedAt: Date.now(),
                    };

                    // Update local cache
                    await eduDb.subscriptions.put(verifiedSub);

                    return {
                        isSubscribed: true,
                        type: status,
                        subscription: cloudSub,
                        lastVerifiedAt: Date.now(),
                        isLoading: false
                    };
                }
            }

            // 3. OFFLINE CACHE FALLBACK
            const localSub = await eduDb.subscriptions
                .where('[schoolId+term+academicYear]')
                .equals([schoolId, currentTerm, academicYear.toString()])
                .first();

            if (localSub && (localSub.status === 'active' || localSub.status === 'trial')) {
                const verifiedAt = localSub.verifiedAt || localSub.updatedAt || 0;
                const age = Date.now() - verifiedAt;

                if (age < MAX_CACHE_AGE_MS) {
                    return {
                        isSubscribed: true,
                        type: localSub.status as 'active' | 'trial',
                        subscription: localSub,
                        lastVerifiedAt: verifiedAt,
                        isLoading: false
                    };
                }
            }

            return { isSubscribed: false, type: 'expired', isLoading: false };

        } catch (error) {
            console.error('[subscriptionService] Resolve failed:', error);
            // On error, try local cache unconditionally as safety
            const fallback = await eduDb.subscriptions
                .where({ schoolId, term: currentTerm, academicYear: academicYear.toString() })
                .first();
            
            const isSub = !!(fallback && (fallback.status === 'active' || fallback.status === 'trial'));
            return {
                isSubscribed: isSub,
                type: isSub ? (fallback!.status as 'active' | 'trial') : 'expired',
                isLoading: false
            };
        }
    },

    /**
     * Calls the Supabase Edge Function to verify a Paystack reference.
     */
    async verifyPayment(reference: string, schoolId: string, plan: string, term: string, academicYear: string) {
        const { data, error } = await supabase.functions.invoke('verify-paystack-subscription', {
            body: { reference, schoolId, plan, term, academicYear }
        });

        if (error) throw error;
        return data;
    }
};
