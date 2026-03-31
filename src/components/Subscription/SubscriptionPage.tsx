import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { useSubscription } from '../../hooks/useSubscription';
import { subscriptionService } from '../../services/subscriptionService';
// @ts-ignore
import { usePaystackPayment } from 'react-paystack';

type Plan = '1_term' | '2_terms' | 'annual';
type Step = 'select' | 'submitting' | 'success' | 'error';

interface SubscriptionRecord {
    id: string;
    school_id: string;
    term: string;
    academic_year: string;
    status: 'pending' | 'active' | 'expired';
    momo_reference: string | null;
    amount_paid: number;
    created_at: string;
    verified_at?: string;
    paid_at?: string;
}

function getNextTerm(term: string) {
    if (term === 'Term 1') return 'Term 2';
    if (term === 'Term 2') return 'Term 3';
    return 'Term 1';
}

export default function SubscriptionPage() {
    const { user } = useAuth();
    const { currentTerm, academicYear } = useAcademicSession();
    const { isSubscribed, type, subscription, checkSubscription } = useSubscription(
        user?.schoolId, currentTerm, academicYear
    );

    const [plan, setPlan] = useState<Plan>('1_term');
    const [step, setStep] = useState<Step>('select');
    const [message, setMessage] = useState('');
    const [prices, setPrices] = useState({ plan_1_term: 300, plan_2_terms: 600, plan_annual: 750 });
    const [loadingPrices, setLoadingPrices] = useState(true);
    const [subscriptionHistory, setSubscriptionHistory] = useState<SubscriptionRecord[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);

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
        } catch (err: any) {
            console.error('[SubscriptionPage] Fetch history failed:', err);
            setHistoryError('Failed to load payment history.');
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        const fetchPrices = async () => {
            const { data, error } = await supabase.from('subscription_prices').select('*').single();
            if (data && !error) {
                setPrices({
                    plan_1_term: Number(data.plan_1_term),
                    plan_2_terms: Number(data.plan_2_terms),
                    plan_annual: Number(data.plan_annual)
                });
            }
            setLoadingPrices(false);
        };

        fetchPrices();
        fetchSubscriptionHistory();
    }, [user?.schoolId]);

    const amount = plan === 'annual' ? prices.plan_annual : plan === '2_terms' ? prices.plan_2_terms : prices.plan_1_term;
    const termsLabel = plan === 'annual'
        ? `All 3 Terms — ${academicYear}`
        : plan === '1_term'
            ? `${currentTerm} — ${academicYear}`
            : `${currentTerm} & ${getNextTerm(currentTerm)} — ${academicYear}`;

    const paystackConfig = {
        reference: `SUB_${(new Date()).getTime()}`,
        email: (user as any)?.email || 'admin@school.com',
        amount: amount * 100,
        publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
        currency: 'GHS',
    };

    const initializePayment = usePaystackPayment(paystackConfig);

    const onSuccess = async (reference: any) => {
        setStep('submitting');
        try {
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Verification is taking too long. Your payment was received — please check Payment History or contact support.')), 20000)
            );

            const res = await Promise.race([
                subscriptionService.verifyPayment(
                    reference.reference,
                    user?.schoolId || '',
                    plan,
                    currentTerm,
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
            setMessage(err.message || 'Payment recorded but failed to update system. Please contact support.');
            setStep('error');
        }
    };

    const onClose = () => {
        console.log('Payment popup closed');
    };

    const handlePayClick = () => {
        if (!paystackConfig.publicKey) {
            setMessage("Paystack Public Key is missing. Please contact developer.");
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
                
                {isSubscribed && (
                    <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-xl border border-green-100">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-green-700">Account Active</span>
                    </div>
                )}
            </div>

            {/* Current Status */}
            {isSubscribed ? (
                <div className={`border rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6 ${type === 'trial' ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 shadow-sm'}`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white flex-shrink-0 shadow-lg ${type === 'trial' ? 'bg-blue-500 shadow-blue-200' : 'bg-slate-900 shadow-slate-200'}`}>
                        <i className={`fas ${type === 'trial' ? 'fa-gift' : 'fa-gem'} text-2xl`}></i>
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <p className={`text-lg font-black ${type === 'trial' ? 'text-blue-800' : 'text-slate-800'}`}>
                            {type === 'trial' ? 'Free Trial Phase' : 'Professional Plan Active'}
                        </p>
                        <p className="text-gray-500 text-sm mt-0.5">
                            Covers <span className="font-bold text-gray-900">{currentTerm} — {academicYear}</span>
                        </p>
                    </div>
                    <div className="flex flex-col items-center md:items-end gap-1">
                         <span className={`text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest ${type === 'trial' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                            {type === 'trial' ? 'Experimental' : 'Verified'}
                        </span>
                        {(subscription?.verified_at || subscription?.paid_at) && (
                            <p className="text-[9px] text-gray-400 font-medium">Activated: {new Date(subscription.verified_at || subscription.paid_at).toLocaleDateString()}</p>
                        )}
                    </div>
                </div>

            ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-3xl p-6 flex items-center gap-5">
                    <div className="w-14 h-14 bg-orange-400 rounded-2xl flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-orange-200">
                        <i className="fas fa-lock text-xl"></i>
                    </div>
                    <div>
                        <p className="font-black text-orange-800 text-lg leading-tight">Access Restricted</p>
                        <p className="text-orange-600 text-sm mt-0.5">Your subscription for {currentTerm} is inactive. Choose a plan below.</p>
                    </div>
                </div>
            )}

            {step === 'select' && (
                <div className="space-y-8">
                    {/* Plan Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* 1 Term */}
                        <div onClick={() => setPlan('1_term')}
                            className={`relative cursor-pointer rounded-[2rem] border-2 p-8 transition-all ${plan === '1_term' ? 'border-orange-400 bg-orange-50/50 shadow-xl shadow-orange-100/50 scale-[1.02]' : 'border-gray-100 bg-white hover:border-orange-200'}`}>
                            {plan === '1_term' && (
                                <div className="absolute top-6 right-6 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center shadow-lg shadow-orange-200">
                                    <i className="fas fa-check text-white text-[10px]"></i>
                                </div>
                            )}
                            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mb-6">
                                <i className="fas fa-calendar text-xl"></i>
                            </div>
                            <h3 className="text-xl font-black text-gray-900">Termly</h3>
                            <p className="text-gray-400 text-xs mt-1 mb-6">Pay as you go, per term.</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-sm font-black text-gray-400">GHS</span>
                                <span className="text-4xl font-black text-gray-900 leading-none">{prices.plan_1_term}</span>
                            </div>
                        </div>

                        {/* 2 Terms */}
                        <div onClick={() => setPlan('2_terms')}
                            className={`relative cursor-pointer rounded-[2rem] border-2 p-8 transition-all ${plan === '2_terms' ? 'border-purple-500 bg-purple-50/50 shadow-xl shadow-purple-100/50 scale-[1.02]' : 'border-gray-100 bg-white hover:border-purple-200'}`}>
                            {plan === '2_terms' && (
                                <div className="absolute top-6 right-6 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-200">
                                    <i className="fas fa-check text-white text-[10px]"></i>
                                </div>
                            )}
                            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                                <i className="fas fa-layer-group text-xl"></i>
                            </div>
                            <h3 className="text-xl font-black text-gray-900">Semester</h3>
                            <p className="text-gray-400 text-xs mt-1 mb-6">Lock in two terms upfront.</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-sm font-black text-gray-400">GHS</span>
                                <span className="text-4xl font-black text-gray-900 leading-none">{prices.plan_2_terms}</span>
                            </div>
                        </div>

                        {/* Annual */}
                        <div onClick={() => setPlan('annual')}
                            className={`relative cursor-pointer rounded-[2rem] border-2 p-8 transition-all ${plan === 'annual' ? 'border-blue-500 bg-blue-50 shadow-xl shadow-blue-100/50 scale-[1.02]' : 'border-gray-100 bg-white hover:border-blue-200'}`}>
                            <div className="absolute -top-4 left-8">
                                <span className="bg-slate-900 text-white text-[9px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-full shadow-lg">Saving Mode</span>
                            </div>
                            {plan === 'annual' && (
                                <div className="absolute top-6 right-6 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-200">
                                    <i className="fas fa-check text-white text-[10px]"></i>
                                </div>
                            )}
                            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                                <i className="fas fa-trophy text-xl"></i>
                            </div>
                            <h3 className="text-xl font-black text-gray-900">Annual</h3>
                            <p className="text-gray-400 text-xs mt-1 mb-4">Ultimate peace of mind.</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-sm font-black text-gray-400">GHS</span>
                                <span className="text-4xl font-black text-gray-900 leading-none">{prices.plan_annual}</span>
                            </div>
                            <div className="mt-4 inline-flex items-center gap-2 bg-green-100 px-3 py-1.5 rounded-xl">
                                <i className="fas fa-bolt text-[10px] text-green-600"></i>
                                <span className="text-[10px] font-black text-green-700 tracking-tighter uppercase whitespace-nowrap">Save GHS {(prices.plan_1_term * 3) - prices.plan_annual}</span>
                            </div>
                        </div>
                    </div>

                    {/* Payment Summary & Action */}
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 md:p-12 text-white shadow-2xl shadow-slate-200 space-y-8 flex flex-col md:flex-row items-center gap-8 md:gap-16">
                        <div className="flex-1 space-y-4">
                            <h4 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Purchase Details</h4>
                            <div className="space-y-1">
                                <p className="text-2xl md:text-3xl font-black leading-tight">{termsLabel}</p>
                                <p className="text-slate-500 text-sm">Full access to all school modules.</p>
                            </div>
                        </div>
                        
                        <div className="w-full md:w-auto text-center space-y-6">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total to Pay</p>
                                <p className="text-5xl font-black tracking-tighter">GHS {amount}</p>
                            </div>
                            
                            <button onClick={handlePayClick}
                                disabled={loadingPrices}
                                className="w-full md:w-64 py-5 bg-[#09A5DB] hover:bg-[#0785B0] text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 text-sm uppercase tracking-widest">
                                {loadingPrices ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-credit-card"></i>}
                                Secure Checkout
                            </button>
                            
                            {message && <p className="text-red-400 text-xs mt-2 font-medium">{message}</p>}
                        </div>
                    </div>
                    
                    {/* Subscription History */}
                    <div className="space-y-6 pt-8">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-3">
                                <i className="fas fa-history text-gray-300"></i>
                                Payment History
                            </h3>
                            {!loadingHistory && !historyError && subscriptionHistory.length > 0 && (
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{subscriptionHistory.length} Records found</span>
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
                        ) : (subscriptionHistory || []).length === 0 ? (
                            <div className="bg-white border border-dashed border-gray-200 rounded-3xl p-12 text-center">
                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto text-gray-300 mb-4">
                                    <i className="fas fa-inbox text-xl"></i>
                                </div>
                                <p className="text-gray-400 font-black text-[10px] uppercase tracking-widest">No transaction records found</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {(subscriptionHistory || []).map((sub, idx) => (
                                    <div key={sub.id || idx} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between hover:shadow-lg transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-gray-50 group-hover:bg-green-50 rounded-xl flex items-center justify-center text-gray-400 group-hover:text-green-600 transition-all">
                                                <i className="fas fa-file-invoice-dollar"></i>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-black text-gray-900 text-sm">{sub.term} — {sub.academic_year}</p>
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${sub.status === 'active' ? 'bg-green-100 text-green-700' : sub.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                                        {sub.status}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-0.5">Reference: <span className="font-mono">{sub.momo_reference || 'N/A'}</span></p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black text-gray-900 text-sm">GHS {sub.amount_paid}</p>
                                            <p className="text-[9px] text-gray-400 font-medium uppercase mt-0.5">{sub.paid_at || sub.verified_at || sub.created_at ? new Date(sub.paid_at || sub.verified_at || sub.created_at).toLocaleDateString() : 'N/A'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {step === 'submitting' && (
                <div className="bg-white border border-gray-100 rounded-[3rem] p-20 text-center space-y-6 shadow-2xl">
                    <div className="relative w-20 h-20 mx-auto">
                        <div className="absolute inset-0 border-4 border-orange-100 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-gray-900">Activating Assets</h3>
                        <p className="text-gray-500 text-sm mt-2">Linking your secure payment to your school dashboard...</p>
                    </div>
                </div>
            )}

            {step === 'success' && (
                <div className="bg-white border border-green-200 rounded-[3rem] p-16 text-center space-y-8 shadow-2xl animate-scaleUp">
                    <div className="w-24 h-24 bg-green-100 text-green-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-lg shadow-green-100 rotate-12">
                        <i className="fas fa-check-circle text-5xl"></i>
                    </div>
                    <div>
                        <h3 className="text-3xl font-black text-gray-900">Success!</h3>
                        <p className="text-gray-500 text-sm mt-3 max-w-sm mx-auto leading-relaxed">
                            Your subscription has been <span className="font-bold text-gray-900">verified and activated instantly</span>. All professional features are now unlocked.
                        </p>
                    </div>
                    <button onClick={reset}
                        className="mx-auto px-12 py-4 bg-slate-900 text-white font-black rounded-[1.5rem] text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95 leading-none">
                        Continue to Dashboard
                    </button>
                </div>
            )}

            {step === 'error' && (
                <div className="bg-white border border-red-100 rounded-[3rem] p-16 text-center space-y-8 shadow-2xl animate-shake">
                    <div className="w-20 h-20 bg-red-50 text-red-400 rounded-full flex items-center justify-center mx-auto">
                        <i className="fas fa-exclamation-triangle text-4xl"></i>
                    </div>
                    <div className="space-y-3">
                        <p className="text-red-600 font-black text-lg">Checkout Encountered an Issue</p>
                        <p className="text-gray-500 text-sm bg-gray-50 p-4 rounded-2xl border border-gray-100 leading-relaxed">{message}</p>
                    </div>
                    <div className="flex flex-col items-center gap-4 pt-4">
                        <button onClick={reset} className="px-10 py-4 bg-gray-900 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-black">Try Another Method</button>
                        <p className="text-[10px] text-gray-400">Payment failed? Contact support via WhatsApp at 024XXXXXXX</p>
                    </div>
                </div>
            )}
        </div>
    );
}
