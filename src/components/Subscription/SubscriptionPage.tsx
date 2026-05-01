import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { useSubscription } from '../../hooks/useSubscription';
import { subscriptionService } from '../../services/subscriptionService';
// @ts-ignore
import { usePaystackPayment } from 'react-paystack';

type Step = 'select' | 'submitting' | 'success' | 'error';

interface SubscriptionRecord {
    id: string;
    school_id: string;
    term: string;
    academic_year: string;
    status: 'pending' | 'active' | 'expired' | 'trial';
    momo_reference: string | null;
    amount_paid: number;
    created_at: string;
    verified_at?: string;
    paid_at?: string;
}

export default function SubscriptionPage() {
    const { user } = useAuth();
    const { currentTerm, academicYear } = useAcademicSession();
    const { isSubscribed, type, checkSubscription } = useSubscription(
        user?.schoolId, currentTerm, academicYear
    );

    const [step, setStep] = useState<Step>('select');
    const [message, setMessage] = useState('');
    const [subscriptionHistory, setSubscriptionHistory] = useState<SubscriptionRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);

    // Pending subscription for the current term (created on term change in Settings)
    const [pendingSub, setPendingSub] = useState<SubscriptionRecord | null>(null);

    const [promoPackages, setPromoPackages] = useState({ promo_1_term: 80, promo_2_terms: 160, promo_annual: 200, standard: 100 });
    const [selectedAdvancePlan, setSelectedAdvancePlan] = useState<'1_term' | '2_terms' | 'annual'>('1_term');

    const fetchSubscriptionHistory = async () => {
        if (!user?.schoolId) return;
        setLoadingHistory(true);
        setHistoryError(null);
        try {
            const { data, error } = await supabase
                .from('school_subscriptions')
                .select('*')
                .eq('school_id', user.schoolId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setSubscriptionHistory(data || []);

            // Extract the pending sub for the current term if one exists
            const pending = (data || []).find(
                s => s.term === currentTerm && s.academic_year === academicYear && s.status === 'pending'
            );
            setPendingSub(pending ?? null);
        } catch (err: any) {
            console.error('[SubscriptionPage] Fetch history failed:', err);
            setHistoryError('Failed to load payment history.');
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        const fetchPrices = async () => {
            try {
                const { data } = await supabase
                    .from('subscription_prices')
                    .select('promo_plan_1_term, promo_plan_2_terms, promo_plan_annual, standard_plan_1_term, plan_1_term')
                    .maybeSingle();
                if (data) {
                    setPromoPackages({
                        promo_1_term: Number(data.promo_plan_1_term ?? 80),
                        promo_2_terms: Number(data.promo_plan_2_terms ?? 160),
                        promo_annual: Number(data.promo_plan_annual ?? 200),
                        standard: Number(data.standard_plan_1_term ?? data.plan_1_term ?? 100),
                    });
                }
            } catch (err) {
                console.error('[SubscriptionPage] Failed to fetch prices:', err);
            }
        };
        fetchPrices();
        fetchSubscriptionHistory();
    }, [user?.schoolId, currentTerm, academicYear]);

    // Payment amount = amount on the pending subscription row, or advance payment amount
    let payAmount = pendingSub?.amount_paid ?? 0;
    if (type === 'trial') {
        if (selectedAdvancePlan === '1_term') payAmount = promoPackages.promo_1_term;
        else if (selectedAdvancePlan === '2_terms') payAmount = promoPackages.promo_2_terms;
        else if (selectedAdvancePlan === 'annual') payAmount = promoPackages.promo_annual;
    }

    const paystackConfig = {
        reference: `SUB_${Date.now()}`,
        email: (user as any)?.email || 'admin@school.com',
        amount: payAmount * 100, // kobo
        publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
        currency: 'GHS',
    };

    const initializePayment = usePaystackPayment(paystackConfig);

    const onSuccess = async (reference: any) => {
        setStep('submitting');
        try {
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(
                    'Verification is taking too long. Your payment was received — please check Payment History or contact support.'
                )), 20000)
            );
            const nextTerm = currentTerm === 'Term 1' ? 'Term 2' : currentTerm === 'Term 2' ? 'Term 3' : 'Term 1';
            const targetTerm = (type === 'trial') ? nextTerm : currentTerm;
            const targetPlan = (type === 'trial') ? selectedAdvancePlan : '1_term';

            const res = await Promise.race([
                subscriptionService.verifyPayment(
                    reference.reference,
                    user?.schoolId || '',
                    targetPlan,
                    targetTerm,
                    academicYear
                ),
                timeout
            ]);
            if (res.success) {
                setStep('success');
                await checkSubscription();
                await fetchSubscriptionHistory();
            } else {
                throw new Error(res.message || 'Verification failed');
            }
        } catch (err: any) {
            setMessage(err.message || 'Payment recorded but failed to update. Please contact support.');
            setStep('error');
        }
    };

    const onClose = () => console.log('Payment popup closed');

    const handlePayClick = () => {
        if (!paystackConfig.publicKey) {
            setMessage('Paystack Public Key is missing. Please contact the developer.');
            return;
        }
        initializePayment({ onSuccess, onClose });
    };

    const handleAdvancePayClick = () => {
        if (!paystackConfig.publicKey) {
            setMessage('Paystack Public Key is missing. Please contact the developer.');
            return;
        }
        initializePayment({ onSuccess, onClose });
    };

    const reset = () => { setStep('select'); setMessage(''); checkSubscription(); };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn pb-20">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <span className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center text-white">
                            <i className="fas fa-crown text-sm"></i>
                        </span>
                        Subscription
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Manage your school's access and billing</p>
                </div>
                {isSubscribed && type !== 'expired' && (
                    <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-xl border border-green-100">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-green-700">Account Active</span>
                    </div>
                )}
            </div>

            {step === 'select' && (
                <div className="space-y-6">

                    {/* ── FREE TRIAL STATUS ──────────────────────────────────────── */}
                    {type === 'trial' && (
                        <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-3xl p-6 space-y-5">
                            <div className="flex flex-col sm:flex-row items-center gap-5">
                                <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 flex-shrink-0">
                                    <i className="fas fa-gift text-2xl"></i>
                                </div>
                                <div className="flex-1 text-center sm:text-left">
                                    <p className="text-lg font-black text-emerald-900">
                                        🎉 You're on your Free Trial!
                                    </p>
                                    <p className="text-emerald-700 text-sm mt-1 font-medium">
                                        Full access is granted for <span className="font-black">{currentTerm} — {academicYear}</span> at no cost.
                                        When you advance to the next term in <strong>Settings → Academic</strong>, a subscription will be required.
                                    </p>
                                </div>
                                <span className="px-4 py-2 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full flex-shrink-0 shadow">
                                    Phase 1 — Free
                                </span>
                            </div>

                            {/* Advance Payment Selection */}
                            <div className="bg-white/80 border border-emerald-100 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        <i className="fas fa-forward mr-2 text-emerald-400"></i>Secure Next Term (Advance Payment)
                                    </p>
                                    <span className="bg-purple-100 text-purple-700 text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-sm">Promotional Prices</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                                    <button 
                                        onClick={() => setSelectedAdvancePlan('1_term')}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${selectedAdvancePlan === '1_term' ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-100 bg-white hover:border-purple-200'}`}
                                    >
                                        <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">1 Term</p>
                                        <p className="text-xl font-black text-slate-800">GHS {promoPackages.promo_1_term}</p>
                                    </button>
                                    <button 
                                        onClick={() => setSelectedAdvancePlan('2_terms')}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${selectedAdvancePlan === '2_terms' ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-100 bg-white hover:border-purple-200'}`}
                                    >
                                        <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">2 Terms</p>
                                        <p className="text-xl font-black text-slate-800">GHS {promoPackages.promo_2_terms}</p>
                                    </button>
                                    <button 
                                        onClick={() => setSelectedAdvancePlan('annual')}
                                        className={`p-4 rounded-xl border-2 text-left transition-all ${selectedAdvancePlan === 'annual' ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-100 bg-white hover:border-purple-200'}`}
                                    >
                                        <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">3 Terms (Annual)</p>
                                        <p className="text-xl font-black text-slate-800">GHS {promoPackages.promo_annual}</p>
                                    </button>
                                </div>
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <p className="text-[10px] text-slate-400 font-medium text-center sm:text-left flex-1">
                                        <i className="fas fa-info-circle mr-1"></i>
                                        Pay in advance to secure promotional pricing before standard rates (GHS {promoPackages.standard}) apply in Phase 3.
                                    </p>
                                    <button 
                                        onClick={handleAdvancePayClick}
                                        className="w-full sm:w-auto px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl uppercase tracking-widest shadow-xl shadow-slate-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        <i className="fas fa-credit-card text-emerald-400"></i> Pay Advance
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── ACTIVE STATUS ──────────────────────────────────────────── */}
                    {type === 'active' && !pendingSub && (
                        <div className="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-sm">
                            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-slate-200">
                                <i className="fas fa-gem text-2xl"></i>
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <p className="text-lg font-black text-slate-800">Subscription Active</p>
                                <p className="text-gray-500 text-sm mt-0.5">
                                    Covers <span className="font-bold text-gray-900">{currentTerm} — {academicYear}</span>
                                </p>
                            </div>
                            <span className="text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest bg-slate-100 text-slate-700">
                                Verified
                            </span>
                        </div>
                    )}

                    {/* ── LOCKED / PAYMENT REQUIRED ──────────────────────────────── */}
                    {((!isSubscribed || type === 'expired') || pendingSub) && type !== 'trial' && (
                        <div className="space-y-6">
                            {/* Lock banner */}
                            <div className="bg-orange-50 border border-orange-200 rounded-3xl p-6 flex items-center gap-5">
                                <div className="w-14 h-14 bg-orange-400 rounded-2xl flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-orange-200">
                                    <i className="fas fa-lock text-xl"></i>
                                </div>
                                <div>
                                    <p className="font-black text-orange-800 text-lg leading-tight">Access Locked</p>
                                    <p className="text-orange-600 text-sm mt-0.5">
                                        A subscription for <strong>{currentTerm} — {academicYear}</strong> is required to continue.
                                    </p>
                                </div>
                            </div>

                            {/* Payment card */}
                            {pendingSub && (
                                <div className="bg-slate-900 rounded-[2.5rem] p-8 md:p-12 text-white shadow-2xl shadow-slate-200 flex flex-col md:flex-row items-center gap-8 md:gap-16">
                                    <div className="flex-1 space-y-3">
                                        <h4 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Payment Due</h4>
                                        <p className="text-2xl md:text-3xl font-black leading-tight">{pendingSub.term} — {pendingSub.academic_year}</p>
                                        <p className="text-slate-400 text-sm">Full access to all school modules.</p>
                                        <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl">
                                            <i className={`fas text-[10px] ${payAmount <= promoPackages.promo_1_term ? 'fa-star text-purple-400' : 'fa-gem text-blue-400'}`}></i>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
                                                {payAmount <= promoPackages.promo_1_term ? 'Promotional Rate' : 'Standard Rate'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full md:w-auto text-center space-y-6">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total to Pay</p>
                                            <p className="text-5xl font-black tracking-tighter">GHS {payAmount}</p>
                                        </div>
                                        <button
                                            onClick={handlePayClick}
                                            className="w-full md:w-64 py-5 bg-[#09A5DB] hover:bg-[#0785B0] text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                                        >
                                            <i className="fas fa-credit-card"></i>
                                            Pay Now
                                        </button>
                                        {message && <p className="text-red-400 text-xs mt-2 font-medium">{message}</p>}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── PAYMENT HISTORY ────────────────────────────────────────── */}
                    <div className="space-y-6 pt-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-3">
                                <i className="fas fa-history text-gray-300"></i>
                                Payment History
                            </h3>
                            {!loadingHistory && !historyError && subscriptionHistory.length > 0 && (
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{subscriptionHistory.length} Records</span>
                            )}
                        </div>

                        {loadingHistory ? (
                            <div className="flex items-center justify-center p-12 bg-white border border-gray-100 rounded-3xl">
                                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : historyError ? (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                                <p className="text-red-600 font-bold text-xs">{historyError}</p>
                                <button onClick={fetchSubscriptionHistory} className="mt-2 text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline">Retry</button>
                            </div>
                        ) : subscriptionHistory.length === 0 ? (
                            <div className="bg-white border border-dashed border-gray-200 rounded-3xl p-12 text-center">
                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto text-gray-300 mb-4">
                                    <i className="fas fa-inbox text-xl"></i>
                                </div>
                                <p className="text-gray-400 font-black text-[10px] uppercase tracking-widest">No transaction records found</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {subscriptionHistory.map((sub, idx) => (
                                    <div key={sub.id || idx} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between hover:shadow-lg transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-gray-50 group-hover:bg-green-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:text-green-600 transition-all">
                                                <i className="fas fa-file-invoice-dollar"></i>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-black text-gray-900 text-sm">{sub.term} — {sub.academic_year}</p>
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                                                        sub.status === 'active' ? 'bg-green-100 text-green-700'
                                                        : sub.status === 'trial' ? 'bg-emerald-100 text-emerald-700'
                                                        : sub.status === 'pending' ? 'bg-orange-100 text-orange-700'
                                                        : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        {sub.status === 'trial' ? 'Free Trial' : sub.status}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    Ref: <span className="font-mono">{sub.momo_reference || 'N/A'}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black text-gray-900 text-sm">
                                                {sub.amount_paid === 0 ? <span className="text-emerald-600">FREE</span> : `GHS ${sub.amount_paid}`}
                                            </p>
                                            <p className="text-[9px] text-gray-400 font-medium uppercase mt-0.5">
                                                {sub.paid_at || sub.verified_at || sub.created_at
                                                    ? new Date(sub.paid_at || sub.verified_at || sub.created_at).toLocaleDateString()
                                                    : 'N/A'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── SUBMITTING ──────────────────────────────────────────────────── */}
            {step === 'submitting' && (
                <div className="bg-white border border-gray-100 rounded-[3rem] p-20 text-center space-y-6 shadow-2xl">
                    <div className="relative w-20 h-20 mx-auto">
                        <div className="absolute inset-0 border-4 border-orange-100 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-gray-900">Verifying Payment</h3>
                        <p className="text-gray-500 text-sm mt-2">Linking your secure payment to your school dashboard...</p>
                    </div>
                </div>
            )}

            {/* ── SUCCESS ─────────────────────────────────────────────────────── */}
            {step === 'success' && (
                <div className="bg-white border border-green-200 rounded-[3rem] p-16 text-center space-y-8 shadow-2xl animate-scaleUp">
                    <div className="w-24 h-24 bg-green-100 text-green-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-lg shadow-green-100 rotate-12">
                        <i className="fas fa-check-circle text-5xl"></i>
                    </div>
                    <div>
                        <h3 className="text-3xl font-black text-gray-900">Payment Successful!</h3>
                        <p className="text-gray-500 text-sm mt-3 max-w-sm mx-auto leading-relaxed">
                            Your subscription has been <span className="font-bold text-gray-900">verified and activated</span>. Full access to all modules is now restored.
                        </p>
                    </div>
                    <button onClick={reset} className="mx-auto px-12 py-4 bg-slate-900 text-white font-black rounded-[1.5rem] text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95 leading-none">
                        Continue to Dashboard
                    </button>
                </div>
            )}

            {/* ── ERROR ───────────────────────────────────────────────────────── */}
            {step === 'error' && (
                <div className="bg-white border border-red-100 rounded-[3rem] p-16 text-center space-y-8 shadow-2xl">
                    <div className="w-20 h-20 bg-red-50 text-red-400 rounded-full flex items-center justify-center mx-auto">
                        <i className="fas fa-exclamation-triangle text-4xl"></i>
                    </div>
                    <div className="space-y-3">
                        <p className="text-red-600 font-black text-lg">Checkout Encountered an Issue</p>
                        <p className="text-gray-500 text-sm bg-gray-50 p-4 rounded-2xl border border-gray-100 leading-relaxed">{message}</p>
                    </div>
                    <div className="flex flex-col items-center gap-4 pt-4">
                        <button onClick={reset} className="px-10 py-4 bg-gray-900 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-black">Try Again</button>
                        <p className="text-[10px] text-gray-400">Payment failed? Contact support via WhatsApp</p>
                    </div>
                </div>
            )}
        </div>
    );
}
