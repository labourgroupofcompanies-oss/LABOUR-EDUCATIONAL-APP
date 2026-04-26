import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

interface Subscription {
    id: string;
    school_id: string;
    term: string;
    academic_year: string;
    status: string;
    momo_reference: string;
    amount_paid: number;
    created_at: string;
    activated_at?: string;
}

export default function SubscriptionManager() {
    const [subs, setSubs] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'pending' | 'active' | 'all'>('all');
    const [activating, setActivating] = useState<string | null>(null);

    const fetchSubs = async () => {
        setLoading(true);
        let query = supabase
            .from('school_subscriptions')
            .select('*')
            .order('created_at', { ascending: false });

        if (filter !== 'all') query = query.eq('status', filter);

        const { data, error } = await query;
        if (!error && data) setSubs(data);
        setLoading(false);
    };

    useEffect(() => { fetchSubs(); }, [filter]);

    const activate = async (sub: Subscription) => {
        setActivating(sub.id);
        const { error } = await supabase
            .from('school_subscriptions')
            .update({
                status: 'active',
                activated_at: new Date().toISOString(),
                paid_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

        if (!error) {
            setSubs(prev => prev.map(s => s.id === sub.id ? { ...s, status: 'active' } : s));
            
            // Log administrative action
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('developer_actions').insert([{
                    admin_id: user.id,
                    action: 'ACTIVATE_SUBSCRIPTION',
                    target_id: sub.school_id,
                    details: { subscription_id: sub.id, amount: sub.amount_paid, term: sub.term }
                }]);
            }
        }
        setActivating(null);
    };

    const reject = async (id: string) => {
        const { error } = await supabase
            .from('school_subscriptions')
            .update({ status: 'expired' })
            .eq('id', id);

        if (!error) setSubs(prev => prev.filter(s => s.id !== id));
    };

    // --- Pricing Manager ---
    const [prices, setPrices] = useState({ plan_1_term: 300, plan_2_terms: 600, plan_annual: 750 });
    const [savingPrices, setSavingPrices] = useState(false);
    const [priceMessage, setPriceMessage] = useState({ type: '', text: '' });

    const fetchPrices = async () => {
        const { data, error } = await supabase.from('subscription_prices').select('*').maybeSingle();
        if (data && !error) {
            setPrices({
                plan_1_term: data.plan_1_term,
                plan_2_terms: data.plan_2_terms,
                plan_annual: data.plan_annual
            });
        }
    };

    const handleSavePrices = async () => {
        setSavingPrices(true);
        // Ensure we target the first available row
        const { data: existingRows } = await supabase.from('subscription_prices').select('id').limit(1);
        const existingId = existingRows && existingRows.length > 0 ? existingRows[0].id : null;

        let error;
        if (existingId) {
            const res = await supabase.from('subscription_prices')
                .update(prices)
                .eq('id', existingId);
            error = res.error;
        } else {
            const res = await supabase.from('subscription_prices').insert([prices]);
            error = res.error;
        }

        setSavingPrices(false);
        if (error) {
            setPriceMessage({ type: 'error', text: 'Failed to save prices' });
        } else {
            setPriceMessage({ type: 'success', text: 'Prices updated successfully!' });
            setTimeout(() => setPriceMessage({ type: '', text: '' }), 4000);
        }
    };

    useEffect(() => {
        fetchSubs();
        fetchPrices();
    }, [filter]);

    const pendingCount = subs.filter(s => s.status === 'pending').length;

    return (
        <div className="space-y-6 lg:space-y-8">

            {/* Pricing Manager */}
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 lg:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                        <i className="fas fa-tags"></i>
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-800">Global Pricing</h3>
                        <p className="text-xs text-slate-500 font-medium">Subscription costs (in GHS)</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">1 Term Plan</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">GHS</span>
                            <input
                                type="number"
                                value={prices.plan_1_term}
                                onChange={e => setPrices(p => ({ ...p, plan_1_term: Number(e.target.value) }))}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">2 Terms Plan</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">GHS</span>
                            <input
                                type="number"
                                value={prices.plan_2_terms}
                                onChange={e => setPrices(p => ({ ...p, plan_2_terms: Number(e.target.value) }))}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">1 Year (3 Terms)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">GHS</span>
                            <input
                                type="number"
                                value={prices.plan_annual}
                                onChange={e => setPrices(p => ({ ...p, plan_annual: Number(e.target.value) }))}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                        {priceMessage.text && (
                            <div className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${priceMessage.type === 'success' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                {priceMessage.type === 'success' ? <i className="fas fa-check-circle"></i> : <i className="fas fa-exclamation-circle"></i>}
                                {priceMessage.text}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleSavePrices}
                        disabled={savingPrices}
                        className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                        {savingPrices ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-save"></i>}
                        Save Prices
                    </button>
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
                {(['pending', 'active', 'all'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 md:px-4 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all ${filter === f
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                            : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-300'
                            }`}
                    >
                        {f}
                        {f === 'pending' && pendingCount > 0 && (
                            <span className="ml-2 bg-orange-500 text-white text-[8px] md:text-[9px] rounded-full px-1.5 py-0.5">
                                {pendingCount}
                            </span>
                        )}
                    </button>
                ))}
                <button
                    onClick={fetchSubs}
                    className="ml-auto p-2 md:px-4 md:py-2 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-xs text-slate-600 transition-all flex items-center gap-2"
                >
                    <i className="fas fa-sync-alt"></i> <span className="hidden md:inline">Refresh</span>
                </button>
            </div>

            {
                loading ? (
                    <div className="flex items-center justify-center p-16">
                        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : subs.length === 0 ? (
                    <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center shadow-sm">
                        <i className="fas fa-inbox text-3xl text-slate-200 mb-3"></i>
                        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No {filter === 'all' ? '' : filter} Records</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {subs.map(sub => (
                            <div key={sub.id} className="bg-white border border-slate-100 rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md transition-all">
                                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                                    <div className="space-y-2 flex-1 min-w-0 w-full md:w-auto">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${sub.status === 'active'
                                                ? 'bg-green-100 text-green-700'
                                                : sub.status === 'pending'
                                                    ? 'bg-orange-100 text-orange-700'
                                                    : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                {sub.status}
                                            </span>
                                            <span className="font-black text-slate-800 text-sm">{sub.term} — {sub.academic_year}</span>
                                            <span className="text-blue-600 font-black text-sm">GHS {sub.amount_paid}</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                                            <p className="text-slate-500 text-xs truncate">
                                                <span className="font-bold text-slate-700">School ID:</span> {sub.school_id}
                                            </p>
                                            <p className="text-slate-500 text-xs truncate">
                                                <span className="font-bold text-slate-700">MoMo Ref:</span>{' '}
                                                <span className="font-mono bg-slate-50 px-1.5 py-0.5 rounded text-orange-600">{sub.momo_reference}</span>
                                            </p>
                                        </div>
                                        <p className="text-slate-400 text-[10px] uppercase tracking-tight font-medium">
                                            Sent: {new Date(sub.created_at).toLocaleString()}
                                            {sub.activated_at && ` · Ready: ${new Date(sub.activated_at).toLocaleString()}`}
                                        </p>
                                    </div>

                                    {sub.status === 'pending' && (
                                        <div className="flex gap-2 flex-shrink-0 w-full md:w-auto">
                                            <button
                                                onClick={() => activate(sub)}
                                                disabled={activating === sub.id}
                                                className="flex-1 md:flex-none px-4 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                                            >
                                                {activating === sub.id
                                                    ? <i className="fas fa-spinner animate-spin"></i>
                                                    : <i className="fas fa-check"></i>
                                                }
                                                Activate
                                            </button>
                                            <button
                                                onClick={() => reject(sub.id)}
                                                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-500 font-black text-xs rounded-xl transition-all flex items-center justify-center"
                                                title="Reject"
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            }
        </div >
    );
}
