import { useState, useEffect, useCallback } from 'react';
import { subscriptionService } from '../services/subscriptionService';

interface SubscriptionStatus {
    isSubscribed: boolean;
    type: 'trial' | 'active' | 'expired' | 'none';
    isLoading: boolean;
    subscription: any | null;
    lastVerifiedAt?: number;
    checkSubscription: () => Promise<void>;
}

/**
 * Hook to check the subscription status of a school.
 * Delegated to subscriptionService for cloud-authoritative & offline-safe logic.
 */
export function useSubscription(schoolId: string | undefined, term: string, academicYear: string): SubscriptionStatus {
    const [status, setStatus] = useState<Omit<SubscriptionStatus, 'checkSubscription'>>({
        isSubscribed: false,
        type: 'none',
        isLoading: true,
        subscription: null
    });

    const checkSubscription = useCallback(async () => {
        if (!schoolId || !term || !academicYear) {
            setStatus(prev => ({ ...prev, isLoading: false }));
            return;
        }

        const res = await subscriptionService.resolveStatus(schoolId, term, academicYear);
        setStatus({
            isSubscribed: res.isSubscribed,
            type: res.type,
            subscription: res.subscription,
            lastVerifiedAt: res.lastVerifiedAt,
            isLoading: false
        });
    }, [schoolId, term, academicYear]);

    useEffect(() => {
        checkSubscription();
    }, [checkSubscription]);

    return { ...status, checkSubscription };
}

