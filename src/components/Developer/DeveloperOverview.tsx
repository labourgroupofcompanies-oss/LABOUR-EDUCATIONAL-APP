import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

interface OverviewStats {
    totalSchools: number;
    unreadEnquiries: number;
    activeSubscriptions: number;
    recentSchools: any[];
    recentEnquiries: any[];
}

interface DeveloperOverviewProps {
    onNavigate: (view: string) => void;
}

const DeveloperOverview: React.FC<DeveloperOverviewProps> = ({ onNavigate }) => {
    const [stats, setStats] = useState<OverviewStats>({
        totalSchools: 0,
        unreadEnquiries: 0,
        activeSubscriptions: 0,
        recentSchools: [],
        recentEnquiries: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOverviewData();
    }, []);

    const fetchOverviewData = async () => {
        setLoading(true);
        try {
            // Explicitly exclude the 'System Administration' account
            const schoolQuery = supabase.from('schools')
                .select('*', { count: 'exact' })
                .neq('id', '00000000-0000-0000-0000-000000000000')
                .neq('school_name', 'System Administration');

            const [schools, enquiries, unread, subs] = await Promise.all([
                schoolQuery.order('created_at', { ascending: false }).limit(5),
                supabase.from('customer_enquiries').select('*').order('created_at', { ascending: false }).limit(5),
                supabase.from('customer_enquiries').select('*', { count: 'exact', head: true }).eq('is_read', false),
                supabase.from('school_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active')
            ]);

            setStats({
                totalSchools: schools.count || 0,
                unreadEnquiries: unread.count || 0,
                activeSubscriptions: subs.count || 0,
                recentSchools: schools.data || [],
                recentEnquiries: enquiries.data || []
            });
        } catch (err) {
            console.error('Failed to fetch overview data:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 lg:space-y-12 animate-fadeIn">
            {/* Mission Control Header */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-8 lg:p-12 rounded-[2.5rem] lg:rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl shadow-blue-900/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">Global Dashboard</span>
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
                        </div>
                        <h2 className="text-4xl lg:text-5xl font-black tracking-tighter mb-2">Systems Overview</h2>
                        <p className="text-slate-400 font-medium text-lg lg:max-w-md italic">
                            Monitor infrastructure scaling, lead conversion, and institutional impact across the global platform.
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
                        <button 
                            onClick={() => onNavigate('announcements')}
                            className="p-5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl transition-all text-left group"
                        >
                            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <i className="fas fa-bullhorn text-sm"></i>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Global Broadcast</p>
                            <p className="font-bold text-sm">Post Update</p>
                        </button>
                        <button 
                            onClick={() => onNavigate('invites')}
                            className="p-5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl transition-all text-left group"
                        >
                            <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <i className="fas fa-plus text-sm"></i>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">School Onboarding</p>
                            <p className="font-bold text-sm">New Invite</p>
                        </button>
                    </div>
                </div>
            </div>

            {/* Core Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
                {[
                    { label: 'Cloud Schools', value: stats.totalSchools, icon: 'fa-university', color: 'text-blue-600', bg: 'bg-blue-50', secondary: 'Institutional Nodes' },
                    { label: 'Unread Leads', value: stats.unreadEnquiries, icon: 'fa-headset', color: 'text-amber-600', bg: 'bg-amber-50', secondary: stats.unreadEnquiries > 0 ? 'Action Required' : 'All Clear' },
                    { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: 'fa-crown', color: 'text-emerald-600', bg: 'bg-emerald-50', secondary: 'Professional Plans' },
                    { label: 'System Health', value: '100%', icon: 'fa-heartbeat', color: 'text-indigo-600', bg: 'bg-indigo-50', secondary: 'Zero Latency Issues' },
                ].map((stat, idx) => (
                    <div key={idx} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-2xl transition-all group relative overflow-hidden">
                        <div className={`w-14 h-14 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform shadow-inner`}>
                            <i className={`fas ${stat.icon}`}></i>
                        </div>
                        <h3 className="text-4xl font-black text-slate-800 mb-1">{loading ? '...' : stat.value}</h3>
                        <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest mb-1">{stat.label}</p>
                        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">{stat.secondary}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Recent Onboarded Schools */}
                <div className="xl:col-span-2 bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-8 lg:p-10">
                    <div className="flex justify-between items-center mb-10">
                        <div>
                            <h4 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                                <i className="fas fa-university text-blue-500"></i>
                                Recent Registrations
                            </h4>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Live Global Activity</p>
                        </div>
                        <button 
                            onClick={() => onNavigate('schools')}
                            className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-500 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
                        >
                            View Registry
                        </button>
                    </div>

                    <div className="space-y-4">
                        {loading ? (
                            [1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-50 rounded-3xl animate-pulse"></div>)
                        ) : stats.recentSchools.length === 0 ? (
                            <p className="text-center py-10 text-slate-400 font-bold italic">No schools enrolled yet.</p>
                        ) : (
                            stats.recentSchools.map((school, idx) => (
                                <div key={idx} className="flex items-center gap-5 p-5 rounded-3xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group">
                                    <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-400 font-black text-xl shadow-inner group-hover:text-blue-600 transition-all border border-slate-50">
                                        {(school.school_name || 'S').charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-slate-800 text-base truncate">{school.school_name || 'Unnamed School'}</p>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">{school.district || 'Location Pending'}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs font-black text-slate-400">{new Date(school.created_at).toLocaleDateString()}</p>
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 text-[8px] font-black rounded uppercase">Active</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Latest Enquiries */}
                <div className="bg-slate-50 rounded-[2.5rem] border border-slate-100 p-8 lg:p-10 flex flex-col">
                    <div className="flex justify-between items-center mb-10">
                        <div>
                            <h4 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                                <i className="fas fa-headset text-amber-500"></i>
                                Latest Leads
                            </h4>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Marketing Funnel</p>
                        </div>
                        <button 
                            onClick={() => onNavigate('enquiries')}
                            className="w-8 h-8 flex items-center justify-center bg-white rounded-xl text-slate-400 hover:text-blue-600 transition-all shadow-sm"
                        >
                            <i className="fas fa-arrow-right text-xs"></i>
                        </button>
                    </div>

                    <div className="space-y-6 flex-1">
                        {loading ? (
                             [1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-3xl animate-pulse"></div>)
                        ) : stats.recentEnquiries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-10 opacity-30 grayscale">
                                <i className="fas fa-inbox text-5xl mb-4"></i>
                                <p className="font-black text-xs uppercase tracking-widest">No leads yet</p>
                            </div>
                        ) : (
                            stats.recentEnquiries.map((enq, idx) => (
                                <div key={idx} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all cursor-pointer" onClick={() => onNavigate('enquiries')}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-[10px] font-black">
                                                {enq.full_name[0]}
                                            </div>
                                            <p className="font-black text-slate-800 text-sm truncate max-w-[120px]">{enq.full_name}</p>
                                        </div>
                                        {!enq.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(59,130,246,0.5)]"></span>}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold mb-3 truncate italic">"{enq.message}"</p>
                                    <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-slate-300">
                                        <span>{enq.school_name || 'Individual'}</span>
                                        <span>{new Date(enq.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <button 
                        onClick={() => onNavigate('enquiries')}
                        className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-xl shadow-slate-200"
                    >
                        Access Lead Manager
                    </button>
                </div>
            </div>
            
            {/* Security Footnote */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-8 border-t border-slate-100 text-slate-300">
                <div className="flex items-center gap-3">
                    <i className="fas fa-shield-halved text-lg"></i>
                    <p className="text-[10px] font-bold uppercase tracking-widest">Global Encryption Node: <span className="text-slate-200">Active</span></p>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-center">Labour Edu Core v2.4 • Platform Stability: Optimal</p>
            </div>
        </div>
    );
};

export default DeveloperOverview;
