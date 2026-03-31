import { type ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';

interface SubscriptionGateProps {
    children: ReactNode;
    /** Optional: show a simpler inline lock instead of full-screen modal */
    inline?: boolean;
}

/**
 * Wraps any component that requires an active subscription.
 * Shows a warm "upgrade from trial" banner for new schools, and a stricter
 * "renew now" screen for schools whose paid subscription has lapsed.
 */
export default function SubscriptionGate({ children, inline }: SubscriptionGateProps) {
    const { user, isLoading: isAuthLoading } = useAuth();
    const { currentTerm, academicYear, isLoaded: isSessionLoaded } = useAcademicSession();
    const { isSubscribed, type, subscription, isLoading: isSubLoading } = useSubscription(
        user?.schoolId,
        currentTerm,
        academicYear
    );

    // ── REACTIVE IDENTITY & HISTORY ──
    const school = useLiveQuery(() => 
        user?.schoolId ? db.schools.where('idCloud').equals(user.schoolId).first() : undefined
    , [user?.schoolId]);

    const hasPaidSubs = useLiveQuery(async () => {
        if (!user?.schoolId) return null;
        try {
            const { count, error } = await supabase
                .from('school_subscriptions')
                .select('*', { count: 'exact', head: true })
                .eq('school_id', user.schoolId)
                .eq('status', 'active');
            
            if (error) return false;
            return (count ?? 0) > 0;
        } catch (e) {
            return false;
        }
    }, [user?.schoolId]);

    const isSchoolInfoLoading = school === undefined || hasPaidSubs === null;
    const onboardingTerm = school?.onboardingTerm ?? '';
    const onboardingYear = school?.onboardingAcademicYear ?? '';

    // Developer role is never gated
    if ((user as any)?.role?.toUpperCase() === 'DEVELOPER') {
        return <>{children}</>;
    }

    // ── GATING LOGIC ──
    // Stability fix: We must wait for school info (onboarding term) before deciding to gate.
    const isActuallyInitialLoading = (isAuthLoading || !isSessionLoaded || isSubLoading || isSchoolInfoLoading) && !isSubscribed;

    if (isActuallyInitialLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-400 text-sm font-black uppercase tracking-widest">Verifying Assets...</p>
                </div>
            </div>
        );
    }

    // ── DUAL SHIELD: Deterministic Local Comparison + Background Subscription State ──
    // If the current term exactly matches the onboarding term, the school is definitively in Trial Mode.
    const isCurrentlyInTrialTerm = 
        onboardingTerm && currentTerm && 
        onboardingYear && academicYear &&
        onboardingTerm.trim().toLowerCase() === currentTerm.trim().toLowerCase() &&
        onboardingYear.trim().toLowerCase() === academicYear.toString().trim().toLowerCase();

    if (isSubscribed || isCurrentlyInTrialTerm) {
        return <>{children}</>;
    }

    // If inline, just show a small banner instead of the full block
    if (inline) {
        return (
            <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 text-center shadow-xl shadow-slate-100/50">
                <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-lock text-2xl"></i>
                </div>
                <h3 className="text-xl font-black text-slate-900">Module Restricted</h3>
                <p className="text-slate-500 text-sm mt-2 mb-6">This feature requires an active subscription for {currentTerm}.</p>
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-subscription'))}
                    className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-95 text-xs uppercase tracking-widest"
                >
                    Unlock Now
                </button>
            </div>
        );
    }

    // ── TRIAL GRADUATE / LAPSED SWITCH ──
    // If school has NO record of ever paying a professional subscription, they are high-priority "Trial Graduates"
    if (hasPaidSubs === false) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 animate-fadeIn">
                {/* Trophy icon */}
                <div className="relative mb-8">
                    <div className="w-28 h-28 bg-gradient-to-br from-amber-400 to-orange-500 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-orange-400/40 rotate-6">
                        <i className="fas fa-star text-white text-5xl"></i>
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg border-4 border-white">
                        <i className="fas fa-arrow-up text-sm"></i>
                    </div>
                </div>

                {/* Headline */}
                <div className="mb-3">
                    <span className="inline-block px-4 py-1.5 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-full mb-4">
                        🎉 Your Free Trial is Complete
                    </span>
                </div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-3">
                    Time to Upgrade!
                </h2>
                <p className="text-slate-500 max-w-md mx-auto mb-3 leading-relaxed font-medium">
                    Your school's free trial covered{' '}
                    <span className="text-slate-900 font-bold">
                        {onboardingTerm} — {onboardingYear}
                    </span>
                    . You're now on{' '}
                    <span className="text-slate-900 font-bold">{currentTerm} — {academicYear}</span>.
                </p>
                <p className="text-slate-400 max-w-sm mx-auto mb-10 text-sm">
                    Subscribe to continue accessing your students, results, attendance, and more.
                </p>

                {/* Warm feature list */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10 w-full max-w-lg">
                    {[
                        { icon: 'fa-user-graduate', label: 'Students', color: 'text-blue-600', bg: 'bg-blue-50' },
                        { icon: 'fa-chart-bar', label: 'Results', color: 'text-purple-600', bg: 'bg-purple-50' },
                        { icon: 'fa-calendar-check', label: 'Attendance', color: 'text-green-600', bg: 'bg-green-50' },
                        { icon: 'fa-file-invoice-dollar', label: 'Payroll', color: 'text-orange-600', bg: 'bg-orange-50' },
                    ].map(f => (
                        <div key={f.label} className={`${f.bg} rounded-2xl p-4 flex flex-col items-center gap-2`}>
                            <i className={`fas ${f.icon} ${f.color} text-xl`}></i>
                            <span className={`text-[10px] font-black uppercase tracking-wide ${f.color}`}>{f.label}</span>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-subscription'))}
                        className="group relative px-10 py-5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-[1.5rem] font-black hover:from-orange-600 hover:to-amber-600 transition-all active:scale-95 shadow-2xl shadow-orange-500/30 overflow-hidden text-sm uppercase tracking-widest"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                        <span className="flex items-center gap-3 relative z-10">
                            <i className="fas fa-crown"></i>
                            Subscribe Now
                            <i className="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                        </span>
                    </button>

                    <button
                        onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-home'))}
                        className="px-10 py-5 bg-white border-2 border-slate-100 text-slate-500 rounded-[1.5rem] font-black hover:bg-slate-50 transition-all active:scale-95 text-sm uppercase tracking-widest"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    // ── LAPSED / EXPIRED: School had an active sub that ran out ──
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4 animate-fadeIn">
            <div className="relative mb-8">
                <div className="w-28 h-28 bg-gradient-to-br from-slate-800 to-black rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-slate-900/40 rotate-12 group-hover:rotate-0 transition-transform duration-500">
                    <i className="fas fa-shield-alt text-white text-4xl"></i>
                </div>
                <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg border-4 border-white">
                    <i className="fas fa-lock text-sm"></i>
                </div>
            </div>

            <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-3">Subscription Inactive</h2>
            <p className="text-slate-500 max-w-md mx-auto mb-10 leading-relaxed font-medium">
                Access to <span className="text-slate-900 font-bold underline decoration-orange-400/30 underline-offset-4">Professional Modules</span> is currently suspended for {currentTerm}, {academicYear}.
            </p>

            {/* Status Metadata if exists */}
            {subscription && (
                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 mb-10 w-full max-w-md grid grid-cols-2 gap-4 text-left">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Provider</p>
                        <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <i className="fas fa-credit-card text-xs text-[#09A5DB]"></i>
                            {subscription.provider || 'Paystack'}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Last Status</p>
                        <span className="text-[9px] font-black bg-red-100 text-red-600 px-2.5 py-1 rounded-full uppercase tracking-wider">{type === 'expired' ? 'Expired' : 'None'}</span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Reference</p>
                        <p className="text-[11px] font-mono text-slate-500 break-all">{subscription.paymentReference || subscription.payment_reference || 'N/A'}</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-4">
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-subscription'))}
                    className="group relative px-10 py-5 bg-[#09A5DB] text-white rounded-[1.5rem] font-black hover:bg-[#0785B0] transition-all active:scale-95 shadow-2xl shadow-blue-500/30 overflow-hidden text-sm uppercase tracking-widest"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    <span className="flex items-center gap-3 relative z-10">
                        Renew Subscription
                        <i className="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                    </span>
                </button>

                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-home'))}
                    className="px-10 py-5 bg-white border-2 border-slate-100 text-slate-500 rounded-[1.5rem] font-black hover:bg-slate-50 transition-all active:scale-95 text-sm uppercase tracking-widest"
                >
                    Back to Home
                </button>
            </div>
        </div>
    );
}
