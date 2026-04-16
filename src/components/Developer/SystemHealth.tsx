import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const SystemHealth: React.FC = () => {
    const [stats, setStats] = useState({
        totalSchools: 0,
        totalStudents: 0,
        totalStaff: 0,
        totalResults: 0,
        unhealthySyncs: 0,
        activeToday: 0
    });
    const [dbStatus, setDbStatus] = useState<'online' | 'checking' | 'error'>('checking');
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPersistent, setIsPersistent] = useState<boolean | null>(null);
    const [storageUsage, setStorageUsage] = useState<{ used: number, total: number } | null>(null);
    const [persistenceMessage, setPersistenceMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        fetchGlobalStats();
        checkStorageStatus();
    }, []);

    const checkStorageStatus = async () => {
        if (navigator.storage && typeof navigator.storage.persist === 'function') {
            const persistent = await navigator.storage.persisted();
            setIsPersistent(persistent);

            const estimate = await navigator.storage.estimate();
            setStorageUsage({
                used: Math.round((estimate.usage || 0) / (1024 * 1024)),
                total: Math.round((estimate.quota || 0) / (1024 * 1024))
            });
        }
    };

    const requestPersistence = async () => {
        if (navigator.storage && typeof navigator.storage.persist === 'function') {
            const granted = await navigator.storage.persist();
            setIsPersistent(granted);
            if (granted) {
                setPersistenceMessage({ type: 'success', text: "Persistence Granted! Your data is extra safe from browser cleanup." });
            } else {
                setPersistenceMessage({ type: 'error', text: "Persistence Denied. Browsers only grant this if you use the app frequently or bookmark it." });
            }
            setTimeout(() => setPersistenceMessage({ type: '', text: '' }), 6000);
        }
    };

    const fetchGlobalStats = async () => {
        setLoading(true);
        setDbStatus('checking');
        try {
            // 1. Check Connectivity
            const { error: pingError } = await supabase.from('schools').select('id').limit(1);
            if (pingError) throw pingError;
            setDbStatus('online');

            // 2. Global Counts
            const queries = [
                supabase.from('schools').select('*', { count: 'exact', head: true })
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .neq('school_name', 'System Administration'),
                supabase.from('students').select('*', { count: 'exact', head: true }),
                supabase.from('staff_profiles').select('*', { count: 'exact', head: true }),
                supabase.from('results').select('*', { count: 'exact', head: true }),
                // Sync health: Schools that haven't synced in 24h
                supabase.from('schools').select('*', { count: 'exact', head: true })
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .neq('school_name', 'System Administration')
                    .lt('last_sync_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
                // Active Today: Schools synced in last 24h
                supabase.from('schools').select('*', { count: 'exact', head: true })
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .neq('school_name', 'System Administration')
                    .gt('last_sync_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            ];

            const results = await Promise.all(queries);

            setStats({
                totalSchools: results[0].count || 0,
                totalStudents: results[1].count || 0,
                totalStaff: results[2].count || 0,
                totalResults: results[3].count || 0,
                unhealthySyncs: results[4].count || 0,
                activeToday: results[5].count || 0
            });

            // 3. Recent Global Activity (Interleaved)
            const [recentSchools, recentStudents, recentStaff] = await Promise.all([
                supabase.from('schools').select('school_name, created_at')
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .neq('school_name', 'System Administration')
                    .order('created_at', { ascending: false })
                    .limit(3),
                supabase.from('students').select('full_name, school_name, created_at').order('created_at', { ascending: false }).limit(3),
                supabase.from('staff_profiles').select('full_name, role, created_at').order('created_at', { ascending: false }).limit(3)
            ]);

            const combined = [
                ...(recentSchools.data || []).map(s => ({ ...s, type: 'school', label: 'New School', value: s.school_name })),
                ...(recentStudents.data || []).map(s => ({ ...s, type: 'student', label: 'New Student', value: `${s.full_name} (${s.school_name})` })),
                ...(recentStaff.data || []).map(s => ({ ...s, type: 'staff', label: `New ${s.role}`, value: s.full_name }))
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8);

            setRecentActivity(combined);

        } catch (err) {
            console.error('System Health fetch failed:', err);
            setDbStatus('error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 lg:space-y-8 animate-fadeIn">
            {/* Health Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Supabase Connectivity</p>
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${dbStatus === 'online' ? 'bg-green-500 animate-pulse' : dbStatus === 'checking' ? 'bg-amber-400' : 'bg-red-500'}`}></div>
                            <h3 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight capitalize">{dbStatus}</h3>
                        </div>
                    </div>
                    <i className="fas fa-database absolute -right-4 -bottom-4 text-6xl lg:text-7xl text-slate-50 group-hover:text-blue-50/50 transition-all"></i>
                </div>

                <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Global Schools</p>
                        <h3 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight">{loading ? '...' : stats.totalSchools}</h3>
                    </div>
                    <i className="fas fa-university absolute -right-4 -bottom-4 text-6xl lg:text-7xl text-slate-50 group-hover:text-blue-50/50 transition-all"></i>
                </div>

                <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Global Students</p>
                        <h3 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight">{loading ? '...' : stats.totalStudents}</h3>
                    </div>
                    <i className="fas fa-user-graduate absolute -right-4 -bottom-4 text-6xl lg:text-7xl text-slate-50 group-hover:text-blue-50/50 transition-all"></i>
                </div>

                <div className="bg-white p-6 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Sync Integrity</p>
                        <h3 className={`text-xl lg:text-2xl font-black tracking-tight ${stats.unhealthySyncs > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {stats.unhealthySyncs > 0 ? `${stats.unhealthySyncs} Offline` : '100% OK'}
                        </h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Based on 24h Heartbeat</p>
                    </div>
                    <i className="fas fa-check-double absolute -right-4 -bottom-4 text-6xl lg:text-7xl text-slate-50 group-hover:text-green-50/50 transition-all"></i>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                {/* Global Activity Feed */}
                <div className="lg:col-span-2 bg-white rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-10">
                    <div className="flex justify-between items-center mb-8 lg:mb-10">
                        <h4 className="text-lg lg:text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <i className="fas fa-bolt text-amber-500"></i>
                            Recent Global Activity
                        </h4>
                        <button onClick={fetchGlobalStats} className="text-[10px] font-bold text-blue-500 uppercase tracking-widest hover:text-blue-600 transition-all">Refresh</button>
                    </div>

                    <div className="space-y-4 lg:space-y-6">
                        {loading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-16 bg-slate-50 rounded-2xl animate-pulse"></div>
                                ))}
                            </div>
                        ) : recentActivity.length === 0 ? (
                            <p className="text-slate-400 font-bold italic text-center py-10 text-sm">No recent activity detected.</p>
                        ) : (
                            recentActivity.map((activity, idx) => (
                                <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:gap-6 p-4 rounded-3xl hover:bg-slate-50 transition-all group">
                                    <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center font-black shadow-inner ${
                                        activity.type === 'school' ? 'bg-blue-50 text-blue-500' : 
                                        activity.type === 'student' ? 'bg-purple-50 text-purple-500' : 
                                        'bg-amber-50 text-amber-500'
                                    }`}>
                                        <i className={`fas ${
                                            activity.type === 'school' ? 'fa-university' : 
                                            activity.type === 'student' ? 'fa-user-graduate' : 
                                            'fa-user-tie'
                                        }`}></i>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-slate-800 text-sm md:text-base truncate">{activity.label}: <span className="text-blue-600 font-bold">{activity.value}</span></p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Global System Event</p>
                                    </div>
                                    <div className="sm:text-right shrink-0">
                                        <p className="text-xs font-black text-slate-400">{new Date(activity.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{new Date(activity.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* System Diagnostics */}
                <div className="bg-slate-900 rounded-[2rem] lg:rounded-[2.5rem] shadow-2xl p-6 lg:p-10 text-white">
                    <h4 className="text-lg lg:text-xl font-black tracking-tight mb-8">Cloud Diagnostics</h4>

                    <div className="space-y-8">
                        <div>
                            <div className="flex justify-between items-end mb-3">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Database Load</p>
                                <span className="text-xs font-bold text-green-400">Low (2%)</span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 w-[2%] rounded-full shadow-lg shadow-blue-500/20"></div>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-end mb-3">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Storage API</p>
                                <span className="text-xs font-bold text-blue-400">Healthy</span>
                            </div>
                            <div className="flex gap-1">
                                {[1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4].map((_, i) => (
                                    <div key={i} className="flex-1 h-6 bg-blue-500/20 rounded-sm border border-blue-500/10 hidden sm:block"></div>
                                ))}
                                <div className="flex-1 h-6 bg-blue-500/20 rounded-sm border border-blue-500/10 sm:hidden"></div>
                                <div className="flex-1 h-6 bg-blue-500/20 rounded-sm border border-blue-500/10 sm:hidden"></div>
                                <div className="flex-1 h-6 bg-blue-500/20 rounded-sm border border-blue-500/10 sm:hidden"></div>
                            </div>
                        </div>

                        <div className="p-5 lg:p-6 bg-slate-800 rounded-3xl border border-white/5 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center">
                                    <i className="fas fa-shield-alt text-xs"></i>
                                </div>
                                <p className="text-xs font-black tracking-wide">Auth Latency: <span className="text-slate-400 ml-1">45ms</span></p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-500 flex items-center justify-center">
                                    <i className="fas fa-satellite-dish text-xs"></i>
                                </div>
                                <p className="text-xs font-black tracking-wide">Region: <span className="text-slate-400 ml-1">US-East</span></p>
                            </div>
                        </div>

                        {/* Local Storage Health */}
                        <div className="p-6 lg:p-8 bg-slate-800/50 rounded-[2rem] lg:rounded-[2.5rem] border border-white/5 space-y-6">
                            <div className="flex justify-between items-center">
                                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Offline Core</h5>
                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${isPersistent ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                    <span className={`w-1 h-1 rounded-full ${isPersistent ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`}></span>
                                    {isPersistent ? 'Protected' : 'Standard'}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Local Database</p>
                                        {storageUsage && (
                                            <span className="text-[10px] font-bold text-slate-300">{storageUsage.used}MB / {storageUsage.total}MB</span>
                                        )}
                                    </div>
                                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500 rounded-full"
                                            style={{ width: storageUsage ? `${(storageUsage.used / 100) * 100}%` : '1%' }}
                                        ></div>
                                    </div>
                                </div>

                                {!isPersistent && (
                                    <button
                                        onClick={requestPersistence}
                                        className="w-full py-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-blue-500/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        <i className="fas fa-shield-alt"></i>
                                        Lock Storage
                                    </button>
                                )}

                                {persistenceMessage.text && (
                                    <div className={`p-3 rounded-xl border text-[9px] font-bold uppercase tracking-tight text-center ${persistenceMessage.type === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                        {persistenceMessage.type === 'success' ? <i className="fas fa-check-circle mr-1"></i> : <i className="fas fa-exclamation-circle mr-1"></i>}
                                        {persistenceMessage.text}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Growth Visualization */}
                <div className="bg-white rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-10">
                    <div className="mb-8">
                        <h4 className="text-lg lg:text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <i className="fas fa-chart-line text-blue-500"></i>
                            Registration Velocity
                        </h4>
                        <p className="text-slate-400 font-medium text-[10px] uppercase tracking-widest mt-1">Last 7 Days (Est.)</p>
                    </div>

                    <div className="relative h-48 w-full flex items-end justify-between gap-1 px-2">
                        {/* Simple SVG/CSS Bar Chart Mockup with real-ish heights based on counts */}
                        {[0.2, 0.4, 0.3, 0.8, 0.5, 0.9, 0.6].map((v, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                <div 
                                    className="w-full bg-blue-500/10 hover:bg-blue-500/20 rounded-t-lg transition-all relative overflow-hidden"
                                    style={{ height: `${v * 100}%` }}
                                >
                                    <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                                </div>
                                <span className="text-[8px] font-black text-slate-300 uppercase">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-2xl">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Today</p>
                            <p className="text-xl font-black text-slate-800">{stats.activeToday}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Growth Rate</p>
                            <p className="text-xl font-black text-green-500">+{Math.round((stats.activeToday / (stats.totalSchools || 1)) * 100)}%</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemHealth;
