import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

interface OverviewStats {
    totalSchools: number;
    totalUsers: number;
    totalStudents: number;
    unreadEnquiries: number;
    unreadLeads: number;
    activeSubscriptions: number;
    recentSchools: any[];
    recentEnquiries: any[];
    recentLeads: any[];
}

interface DeveloperOverviewProps {
    onNavigate: (view: string) => void;
}

const DeveloperOverview: React.FC<DeveloperOverviewProps> = ({ onNavigate }) => {
    const [stats, setStats] = useState<OverviewStats>({
        totalSchools: 0,
        totalUsers: 0,
        totalStudents: 0,
        unreadEnquiries: 0,
        unreadLeads: 0,
        activeSubscriptions: 0,
        recentSchools: [],
        recentEnquiries: [],
        recentLeads: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOverviewData();
    }, []);

    const fetchOverviewData = async () => {
        setLoading(true);
        try {
            const schoolQuery = supabase.from('schools')
                .select('*', { count: 'exact' })
                .neq('id', '00000000-0000-0000-0000-000000000000')
                .neq('school_name', 'System Administration');

            const [
                schools, 
                users, 
                students, 
                enquiries, 
                unreadEnq, 
                unreadLeads, 
                subs, 
                leads
            ] = await Promise.all([
                schoolQuery.order('created_at', { ascending: false }).limit(5),
                supabase.from('staff_profiles').select('*', { count: 'exact', head: true }),
                supabase.from('students').select('*', { count: 'exact', head: true }),
                supabase.from('customer_enquiries').select('*').order('created_at', { ascending: false }).limit(3),
                supabase.from('customer_enquiries').select('*', { count: 'exact', head: true }).eq('is_read', false),
                supabase.from('get_started_leads').select('*', { count: 'exact', head: true }).eq('is_read', false),
                supabase.from('school_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
                supabase.from('get_started_leads').select('*').order('created_at', { ascending: false }).limit(3)
            ]);

            console.log('Global Overview Data Fetched:', {
                schools: schools.count,
                users: users.count,
                students: students.count,
                leads: unreadLeads.count
            });

            setStats({
                totalSchools: schools.count || 0,
                totalUsers: users.count || 0,
                totalStudents: students.count || 0,
                unreadEnquiries: unreadEnq.count || 0,
                unreadLeads: unreadLeads.count || 0,
                activeSubscriptions: subs.count || 0,
                recentSchools: schools.data || [],
                recentEnquiries: enquiries.data || [],
                recentLeads: leads.data || []
            });
        } catch (err) {
            console.error('Failed to fetch overview data:', err);
        } finally {
            setLoading(false);
        }
    };

    const MetricCard = ({ label, value, icon, color, bg, secondary, onClick }: any) => (
        <div 
            onClick={onClick}
            className={`bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 hover:shadow-2xl transition-all group relative overflow-hidden cursor-pointer`}
        >
            <div className={`w-14 h-14 ${bg} ${color} rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform shadow-inner`}>
                <i className={`fas ${icon}`}></i>
            </div>
            <h3 className="text-4xl font-black text-slate-800 mb-1">{loading ? '...' : value}</h3>
            <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest mb-1">{label}</p>
            <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tight">{secondary}</p>
            <div className={`absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity`}>
                <i className={`fas ${icon} text-6xl rotate-12`}></i>
            </div>
        </div>
    );

    return (
        <div className="space-y-8 lg:space-y-12 animate-fadeIn">
            {/* Mission Control Header */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-8 lg:p-12 rounded-[2.5rem] lg:rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl shadow-blue-900/20">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2"></div>
                
                <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <span className="px-4 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-full text-[10px] font-black uppercase tracking-widest">Global Command Center</span>
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
                        </div>
                        <h2 className="text-4xl lg:text-6xl font-black tracking-tighter mb-4 leading-none">System Vitality</h2>
                        <p className="text-slate-400 font-medium text-lg lg:max-w-xl italic leading-relaxed">
                            A real-time aggregate of institutional growth, user engagement, and marketing conversion across the Labour Edu ecosystem.
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
                        <button 
                            onClick={() => onNavigate('announcements')}
                            className="p-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-[2rem] transition-all text-left group"
                        >
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-lg shadow-blue-600/20">
                                <i className="fas fa-bullhorn"></i>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Broadcast</p>
                            <p className="font-bold text-sm">Post Update</p>
                        </button>
                        <button 
                            onClick={() => onNavigate('invites')}
                            className="p-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-[2rem] transition-all text-left group"
                        >
                            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-lg shadow-emerald-600/20">
                                <i className="fas fa-plus"></i>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Acquisition</p>
                            <p className="font-bold text-sm">New Invite</p>
                        </button>
                    </div>
                </div>
            </div>

            {/* Educational Impact Section */}
            <div>
                <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-6 ml-2">Educational Impact</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                    <MetricCard 
                        label="Global Schools" 
                        value={stats.totalSchools} 
                        icon="fa-university" 
                        color="text-blue-600" 
                        bg="bg-blue-50" 
                        secondary="Institutional Nodes"
                        onClick={() => onNavigate('schools')}
                    />
                    <MetricCard 
                        label="Enrolled Students" 
                        value={stats.totalStudents} 
                        icon="fa-user-graduate" 
                        color="text-emerald-600" 
                        bg="bg-emerald-50" 
                        secondary="Academic Reach"
                    />
                    <MetricCard 
                        label="Active Staff" 
                        value={stats.totalUsers} 
                        icon="fa-chalkboard-teacher" 
                        color="text-purple-600" 
                        bg="bg-purple-50" 
                        secondary="System Operators"
                    />
                </div>
            </div>

            {/* Growth & Conversion Funnel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] mb-6 ml-2">Marketing & Subscriptions</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8">
                        <MetricCard 
                            label="Unread Leads" 
                            value={stats.unreadLeads} 
                            icon="fa-users-gear" 
                            color="text-indigo-600" 
                            bg="bg-indigo-50" 
                            secondary={stats.unreadLeads > 0 ? "Potential Growth" : "All Caught Up"}
                            onClick={() => onNavigate('leads')}
                        />
                        <MetricCard 
                            label="Active Subscriptions" 
                            value={stats.activeSubscriptions} 
                            icon="fa-crown" 
                            color="text-amber-600" 
                            bg="bg-amber-50" 
                            secondary="Pro-Plan Schools"
                            onClick={() => onNavigate('subscriptions')}
                        />
                    </div>

                    {/* Recent Global Registrations */}
                    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-8 lg:p-10">
                        <div className="flex justify-between items-center mb-10">
                            <div>
                                <h4 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                                    <i className="fas fa-clock text-blue-500"></i>
                                    Recent Deployments
                                </h4>
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">New Schools Onboarded</p>
                            </div>
                            <button onClick={() => onNavigate('schools')} className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-400 font-black text-[9px] uppercase tracking-widest rounded-xl transition-all">Registry</button>
                        </div>

                        <div className="space-y-4">
                            {loading ? (
                                [1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-50 rounded-2xl animate-pulse"></div>)
                            ) : stats.recentSchools.map((school, idx) => (
                                <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 group">
                                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-slate-300 font-black text-lg shadow-inner group-hover:text-blue-600 transition-all">
                                        {school.school_name?.charAt(0) || 'S'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-slate-800 text-sm truncate">{school.school_name}</p>
                                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{school.district || 'Global Node'}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-300">{new Date(school.created_at).toLocaleDateString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Activity Feed */}
                <div className="bg-slate-900 rounded-[2.5rem] p-8 lg:p-10 text-white flex flex-col shadow-2xl shadow-slate-900/20">
                    <div className="mb-10">
                        <h4 className="text-xl font-black tracking-tight flex items-center gap-3">
                            <i className="fas fa-satellite text-blue-400"></i>
                            Live Feed
                        </h4>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Interactions & Leads</p>
                    </div>

                    <div className="flex-1 space-y-6 overflow-y-auto custom-nav-scrollbar pr-2">
                        {/* Combine enquiries and leads for a live feed */}
                        {[...stats.recentEnquiries.map(e => ({...e, type: 'enquiry'})), ...stats.recentLeads.map(l => ({...l, type: 'lead'}))]
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((item, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => onNavigate(item.type === 'lead' ? 'leads' : 'enquiries')}
                                    className="p-5 bg-white/5 hover:bg-white/10 rounded-3xl border border-white/5 transition-all cursor-pointer group"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded ${item.type === 'lead' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'}`}>
                                            {item.type}
                                        </span>
                                        <span className="text-[9px] font-bold text-slate-500">{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <p className="font-black text-sm mb-1 group-hover:text-blue-400 transition-colors">{item.full_name}</p>
                                    <p className="text-[10px] text-slate-400 line-clamp-2 italic leading-relaxed">
                                        {item.type === 'enquiry' ? item.message : `Interested in: ${item.position}`}
                                    </p>
                                </div>
                            ))
                        }
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/5">
                        <button 
                            onClick={() => onNavigate('enquiries')}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-blue-600/20"
                        >
                            Open Lead Center
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Security Footnote */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-8 border-t border-slate-100 text-slate-300">
                <div className="flex items-center gap-3">
                    <i className="fas fa-shield-halved text-lg"></i>
                    <p className="text-[10px] font-bold uppercase tracking-widest">Global Encryption Node: <span className="text-slate-200">Active</span></p>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-center">Labour Edu Core v2.5 • Platform Stability: Optimal</p>
            </div>

            <style>{`
                .custom-nav-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-nav-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-nav-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default DeveloperOverview;
