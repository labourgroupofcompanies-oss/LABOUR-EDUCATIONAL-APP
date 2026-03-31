import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useAuth } from '../../hooks/useAuth';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { useSubscription } from '../../hooks/useSubscription';
import { dbService } from '../../services/dbService';
import { useAssetPreview } from '../../hooks/useAssetPreview';
import StaffManagement from './StaffManagement';
import ClassManagement from './ClassManagement';
import StudentManagement from './StudentManagement/StudentManagement';
import SubjectManagement from './SubjectManagement/SubjectManagement';
import ResultsManagement from './ResultsManagement/ResultsManagement';
import AttendanceDashboard from './AttendanceManagement/AttendanceDashboard';
import { eduDb } from '../../eduDb';
import TeacherPayslip from '../Teacher/TeacherPayslip';
import SyncStatusBadge from '../Common/SyncStatusBadge';
import Settings from './Settings';
import { syncService } from '../../services/syncService';
import { showToast } from '../Common/Toast';
import SubscriptionGate from '../Subscription/SubscriptionGate';
import SubscriptionPage from '../Subscription/SubscriptionPage';
import PromotionApprovals from './PromotionApprovals';
import SubscriptionStatusIndicator from '../Common/SubscriptionStatusIndicator';

type ViewType = 'overview' | 'students' | 'staff' | 'classes' | 'subjects' | 'results' | 'attendance' | 'settings' | 'subscription' | 'promotions' | 'payslip';

const tabConfig: { key: ViewType; label: string; shortLabel: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', shortLabel: 'Home', icon: 'fa-home' },
    { key: 'staff', label: 'Staff', shortLabel: 'Staff', icon: 'fa-chalkboard-teacher' },
    { key: 'classes', label: 'Classes', shortLabel: 'Classes', icon: 'fa-chalkboard' },
    { key: 'subjects', label: 'Subjects', shortLabel: 'Subjects', icon: 'fa-book' },
    { key: 'students', label: 'Students', shortLabel: 'Students', icon: 'fa-user-graduate' },
    { key: 'attendance', label: 'Attendance', shortLabel: 'Attend.', icon: 'fa-calendar-check' },
    { key: 'results', label: 'Results', shortLabel: 'Results', icon: 'fa-chart-bar' },
    { key: 'payslip', label: 'My Payslips', shortLabel: 'Payslips', icon: 'fa-file-invoice-dollar' },
    { key: 'settings', label: 'Settings', shortLabel: 'Settings', icon: 'fa-cog' },
    { key: 'subscription', label: 'Subscription', shortLabel: 'Subscribe', icon: 'fa-crown' },
];

const HeadteacherDashboard: React.FC = () => {
    const { user, logout } = useAuth();
    const { currentTerm, academicYear } = useAcademicSession();
    const { isSubscribed, subscription, isLoading: isSubLoading } = useSubscription(user?.schoolId, currentTerm, academicYear);

    const [view, setView] = useState<ViewType>('overview');
    const [isSyncing, setIsSyncing] = useState(false);

    const [reportCardSelection, setReportCardSelection] = useState<{ studentId?: string; classId?: string } | null>(null);

    useEffect(() => {
        const toSubscription = () => setView('subscription');
        const toHome = () => setView('overview');
        const toReportCards = (e: any) => {
            setReportCardSelection(e.detail);
            setView('results');
        };
        window.addEventListener('navigate-to-subscription', toSubscription);
        window.addEventListener('navigate-to-home', toHome);
        window.addEventListener('navigate-to-report-cards', toReportCards);
        return () => {
            window.removeEventListener('navigate-to-subscription', toSubscription);
            window.removeEventListener('navigate-to-home', toHome);
            window.removeEventListener('navigate-to-report-cards', toReportCards);
        };
    }, []);

    const handleManualSync = async () => {
        if (!user?.schoolId || isSyncing) return;
        setIsSyncing(true);
        try {
            const result = await syncService.syncAll(user.schoolId);
            if (!result.success) {
                if (result.error === 'Sync in progress' || result.error === 'Pull in progress') {
                    showToast('A sync is currently running in the background.', 'info');
                } else {
                    showToast(result.error || 'Failed to sync data', 'error');
                }
            } else {
                showToast('Synchronization complete', 'success');
            }
        } catch (err: any) {
            showToast(err.message || 'Failed to trigger sync', 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    // Trigger sync on load
    useEffect(() => {
        if (user?.schoolId) {
            syncService.pullAll(user.schoolId).then(() => {
                syncService.syncAll(user.schoolId);
            });
        }
    }, [user?.schoolId]);

    // For mobile bottom nav, show only 5 tabs at a time with a "More" approach
    const [showMoreNav, setShowMoreNav] = useState(false);

    const schoolData = useLiveQuery(async () => {
        if (user?.schoolId) {
            return await db.schools
                .where('schoolId').equals(user.schoolId)
                .or('idCloud').equals(user.schoolId)
                .first();
        }
        return null;
    }, [user?.schoolId]);

    const stats = useLiveQuery(async () => {
        if (!user?.schoolId) return { students: 0, teachers: 0, classes: 0, subjects: 0 };
        const [students, teachers, classes, subjects] = await Promise.all([
            dbService.students.getAll(user.schoolId).then(res => 
                res.filter((s, i, arr) => 
                    arr.findIndex(t => t.fullName?.toLowerCase().trim() === s.fullName?.toLowerCase().trim()) === i
                ).length
            ),
            dbService.staff.getTeachers(user.schoolId).then(res => res.length),
            dbService.classes.getAll(user.schoolId).then(res => res.length),
            dbService.subjects.getAll(user.schoolId).then(res => res.length)
        ]);
        return { students, teachers, classes, subjects };
    }, [user?.schoolId]);

    const syncStatus = useLiveQuery(async () => {
        if (!user?.schoolId) return { pending: 0, synced: 0 };

        const allTables = [
            ...Object.values(db.tables).filter((t: any) => t.name !== 'items'),
            ...Object.values(eduDb.tables)
        ];

        let pendingCount = 0;
        let syncedCount = 0;

        for (const table of allTables) {
            const p = await table
                .where('syncStatus').equals('pending')
                .filter((item: any) => item.schoolId === user.schoolId || item.school_id === user.schoolId)
                .count();
            pendingCount += p;

            const s = await table
                .where('syncStatus').equals('synced')
                .filter((item: any) => item.schoolId === user.schoolId || item.school_id === user.schoolId)
                .count();
            syncedCount += s;
        }

        return { pending: pendingCount, synced: syncedCount };
    }, [user?.schoolId]);

    // Fetch active system announcements
    const [announcements, setAnnouncements] = useState<any[]>([]);
    useEffect(() => {
        const fetchAnnouncements = async () => {
            const { data } = await supabase
                .from('system_announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });
            if (data) setAnnouncements(data);
        };
        fetchAnnouncements();
    }, []);

    const logoPreview = useAssetPreview(schoolData?.logo);

    const quickActions = [
        { icon: 'fa-chalkboard-teacher', label: 'Staff', color: 'bg-indigo-500', action: () => setView('staff') },
        { icon: 'fa-chalkboard', label: 'Classes', color: 'bg-purple-500', action: () => setView('classes') },
        { icon: 'fa-book', label: 'Subjects', color: 'bg-orange-500', action: () => setView('subjects') },
        { icon: 'fa-user-graduate', label: 'Students', color: 'bg-blue-500', action: () => setView('students') },
        { icon: 'fa-calendar-check', label: 'Attendance', color: 'bg-pink-500', action: () => setView('attendance') },
        { icon: 'fa-chart-bar', label: 'Results', color: 'bg-green-500', action: () => setView('results') },
        { icon: 'fa-file-invoice-dollar', label: 'My Payslips', color: 'bg-emerald-500', action: () => setView('payslip') },
        { icon: 'fa-level-up-alt', label: 'Promotions', color: 'bg-rose-500', action: () => setView('promotions') },
        { icon: 'fa-cogs', label: 'Settings', color: 'bg-gray-500', action: () => setView('settings') },
    ];

    const renderView = () => {
        switch (view) {
            case 'overview':
                return (
                    <SubscriptionGate>
                        <div className="space-y-8 md:space-y-12 animate-fadeIn">
                            {/* Compact Sync Status Widget */}
                            {syncStatus && syncStatus.pending > 0 && (
                                <div className="bg-amber-50/50 border border-amber-100/50 rounded-2xl p-3 md:p-4 flex flex-col gap-3">
                                    <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center text-lg shadow-sm flex-shrink-0">
                                                <i className={`fas fa-sync-alt ${isSyncing ? 'animate-spin' : 'animate-spin-slow'}`}></i>
                                            </div>
                                            <div>
                                                <p className="text-amber-900 font-black text-xs uppercase tracking-tight">Offline Sync Queue</p>
                                                <p className="text-amber-700 text-[10px] font-medium leading-tight">
                                                    {syncStatus.pending} items pending online backup.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={handleManualSync}
                                                disabled={isSyncing}
                                                className="px-4 py-2 bg-amber-200/50 hover:bg-amber-200 text-amber-900 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                                            >
                                                {isSyncing ? 'Syncing...' : 'Sync Now'}
                                            </button>
                                            <SyncStatusBadge status="pending" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                                {[
                                    { label: 'Students', value: stats?.students || 0, icon: 'fa-user-graduate', color: 'text-blue-600', bg: 'bg-blue-50' },
                                    { label: 'Teachers', value: stats?.teachers || 0, icon: 'fa-chalkboard-teacher', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                                    { label: 'Classes', value: stats?.classes || 0, icon: 'fa-chalkboard', color: 'text-purple-600', bg: 'bg-purple-50' },
                                    { label: 'Subjects', value: stats?.subjects || 0, icon: 'fa-book', color: 'text-orange-600', bg: 'bg-orange-50' },
                                ].map((stat, idx) => (
                                    <div key={idx} className="bg-white p-5 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                                        <div className={`w-10 h-10 md:w-14 md:h-14 ${stat.bg} ${stat.color} rounded-xl md:rounded-2xl flex items-center justify-center text-lg md:text-2xl mb-3 md:mb-6 group-hover:scale-110 transition-transform shadow-sm`}>
                                            <i className={`fas ${stat.icon}`}></i>
                                        </div>
                                        <h3 className="text-2xl md:text-4xl font-black text-gray-800 mb-1">{stat.value}</h3>
                                        <p className="text-[9px] md:text-[10px] text-gray-400 font-black uppercase tracking-widest">{stat.label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Actions */}
                            <div className="space-y-4 md:space-y-8">
                                <h2 className="text-lg font-black text-gray-800 flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-lg bg-yellow-400 text-white flex items-center justify-center text-sm">
                                        <i className="fas fa-bolt"></i>
                                    </span>
                                    Quick Actions
                                </h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                                    {quickActions.map((action, idx) => (
                                        <button
                                            key={idx}
                                            onClick={action.action}
                                            className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all text-left flex items-center gap-3 md:flex-col md:gap-4 group hover:border-primary/20 active:scale-95"
                                        >
                                            <div className={`w-10 h-10 md:w-12 md:h-12 ${action.color} rounded-xl md:rounded-2xl flex items-center justify-center text-white flex-shrink-0 shadow-sm group-hover:scale-110 transition-transform`}>
                                                <i className={`fas ${action.icon} text-lg`}></i>
                                            </div>
                                            <span className="font-black text-[11px] md:text-[10px] uppercase tracking-wide md:tracking-widest text-gray-600 group-hover:text-primary transition-colors">{action.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </SubscriptionGate>
                );
            case 'staff': return <SubscriptionGate><StaffManagement /></SubscriptionGate>;
            case 'classes': return <SubscriptionGate><ClassManagement /></SubscriptionGate>;
            case 'subjects': return <SubscriptionGate><SubjectManagement /></SubscriptionGate>;
            case 'students': return <SubscriptionGate><StudentManagement /></SubscriptionGate>;
            case 'results': return <SubscriptionGate><ResultsManagement initialSelection={reportCardSelection} /></SubscriptionGate>;
            case 'attendance': return <SubscriptionGate><AttendanceDashboard /></SubscriptionGate>;
            case 'promotions': return <SubscriptionGate><PromotionApprovals /></SubscriptionGate>;
            case 'payslip': return <TeacherPayslip />;
            case 'settings': return <Settings />;
            case 'subscription': return <SubscriptionPage />;
            default: return null;
        }
    };

    // Bottom nav: show first 5 tabs + a "More" approach
    const primaryTabs = [
        tabConfig[0], // Overview
        tabConfig[8], // Subscription (Promoted)
        tabConfig[1], // Staff
        tabConfig[2], // Classes
        tabConfig[3], // Subjects
    ];
    const moreTabs = tabConfig.filter(t => !primaryTabs.includes(t));

    return (
        <div className="max-w-7xl mx-auto py-4 md:py-8 px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-8 relative z-10 pb-24 md:pb-0">

            {/* ── System Announcements ── */}
            {announcements.length > 0 && (
                <div className="space-y-4 animate-fadeIn">
                    {announcements.map(a => (
                        <div key={a.id} className={`p-4 md:p-6 rounded-3xl border flex items-start gap-4 shadow-sm ${a.level === 'critical' ? 'bg-red-50 border-red-100 text-red-900' :
                            a.level === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-900' :
                                'bg-blue-50 border-blue-100 text-blue-900'
                            }`}>
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${a.level === 'critical' ? 'bg-red-500 text-white' :
                                a.level === 'warning' ? 'bg-amber-500 text-white' :
                                    'bg-blue-500 text-white'
                                }`}>
                                <i className={`fas ${a.level === 'critical' ? 'fa-exclamation-triangle' : 'fa-info-circle'}`}></i>
                            </div>
                            <div className="flex-1">
                                <h4 className="font-black text-xs md:text-sm uppercase tracking-wider">{a.title}</h4>
                                <p className="text-xs md:text-sm font-medium mt-1 leading-relaxed opacity-80">{a.message}</p>
                            </div>
                            <button
                                onClick={() => setAnnouncements(prev => prev.filter(x => x.id !== a.id))}
                                className="text-current opacity-30 hover:opacity-100 transition-opacity"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Header ── */}
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 shadow-2xl shadow-blue-300/40">
                {/* Blobs */}
                <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
                <div className="pointer-events-none absolute bottom-0 left-1/3 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl"></div>

                {/* MOBILE header */}
                <div className="md:hidden px-5 py-4 relative z-10">
                    <div className="flex items-center gap-3">
                        {logoPreview ? (
                            <img src={logoPreview} alt="Logo" className="w-10 h-10 rounded-xl object-cover border-2 border-white/30 flex-shrink-0" />
                        ) : (
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/20">
                                <i className="fas fa-university text-white text-base"></i>
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="text-white/50 text-[8px] font-black uppercase tracking-[0.18em] leading-none mb-0.5">
                                Headteacher Portal
                            </p>
                            <div className="flex items-center gap-2">
                                <p className="text-white font-black text-base leading-tight truncate">
                                    {schoolData?.schoolName?.split(' ').slice(0, 2).join(' ') || 'Dashboard'}
                                </p>
                                <SubscriptionStatusIndicator isSubscribed={isSubscribed} isLoading={isSubLoading} className="scale-75 origin-left" />
                            </div>
                            <p className="text-blue-100/60 text-[7px] font-bold tracking-widest uppercase">ID: {schoolData?.schoolCode || user?.schoolId}</p>
                        </div>
                        <button
                            onClick={logout}
                            className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-red-500/70 rounded-xl text-white border border-white/20 transition-all active:scale-90 flex-shrink-0"
                            title="Log Out"
                        >
                            <i className="fas fa-sign-out-alt text-sm"></i>
                        </button>
                    </div>
                </div>

                {/* DESKTOP header */}
                <div className="hidden md:flex items-center justify-between gap-6 p-8 relative z-10">
                    <div className="flex items-center gap-5 min-w-0">
                        {logoPreview ? (
                            <img src={logoPreview} alt="School Logo" className="w-20 h-20 rounded-2xl object-cover shadow-xl border-2 border-white/30 flex-shrink-0" />
                        ) : (
                            <div className="w-20 h-20 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white shadow-xl border border-white/20 flex-shrink-0">
                                <i className="fas fa-university text-3xl"></i>
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-white/60 font-black text-[9px] uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
                                <i className="fas fa-circle text-green-400 text-[6px] animate-pulse"></i>
                                Headteacher Portal — ID: <span className="text-white">{schoolData?.schoolCode || user?.schoolId}</span>
                            </p>
                            <h1 className="text-white font-black text-3xl leading-tight tracking-tight truncate">
                                {schoolData?.schoolName || 'Labour Edu'}
                            </h1>
                            <p className="text-blue-200 text-sm font-medium mt-1 flex items-center gap-2">
                                <i className="fas fa-map-marker-alt text-red-300"></i>
                                {schoolData?.district || 'District'}, {schoolData?.region || 'Region'}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-3 flex-shrink-0">
                        <div 
                            onClick={() => setView('subscription')}
                            className="cursor-pointer hover:scale-110 transition-transform active:scale-95"
                            title={isSubscribed ? (subscription?.status === 'trial' ? 'Trial Mode' : 'Account Active') : 'Inactive Plan'}
                        >
                            <SubscriptionStatusIndicator isSubscribed={isSubscribed} isLoading={isSubLoading} />
                        </div>
                        <button
                            onClick={logout}
                            className="flex items-center gap-2 bg-white/10 hover:bg-red-500/80 border border-white/20 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                        >
                            <i className="fas fa-sign-out-alt"></i> Log Out
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Main Content Area ── */}
            <div className="premium-card overflow-hidden mb-4 md:mb-8 bg-white rounded-[2rem] shadow-sm border border-gray-100">
                {/* Desktop top tab bar */}
                <div className="hidden md:flex border-b border-gray-100 overflow-x-auto whitespace-nowrap bg-gray-50/30">
                    {tabConfig.map(({ key, label, icon }) => (
                        <button
                            key={key}
                            onClick={() => setView(key)}
                            className={`flex flex-row items-center gap-2 flex-shrink-0 px-6 py-5 font-black text-[10px] uppercase tracking-widest transition-all ${view === key ? 'text-primary border-b-2 border-primary bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                        >
                            <i className={`fas ${icon} text-sm ${view === key ? 'text-primary' : 'text-gray-300'}`}></i>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="p-4 md:p-8 min-h-[500px]">
                    {renderView()}
                </div>
            </div>

            {/* ── Mobile Fixed Bottom Navigation ── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
                <div className="flex items-center">
                    {primaryTabs.map(({ key, shortLabel, icon }) => (
                        <button
                            key={key}
                            onClick={() => { setView(key); setShowMoreNav(false); }}
                            className={`relative flex-1 flex flex-col items-center pt-2 pb-3 gap-1 transition-all active:scale-95 ${view === key ? 'text-primary' : 'text-gray-400'}`}
                        >
                            {view === key && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full"></span>}
                            <i className={`fas ${icon} text-xl`}></i>
                            <span className="text-[8px] font-black uppercase tracking-tight leading-none">{shortLabel}</span>
                        </button>
                    ))}

                    <button
                        onClick={() => setShowMoreNav(prev => !prev)}
                        className={`relative flex-1 flex flex-col items-center pt-2 pb-3 gap-1 transition-all active:scale-90 ${moreTabs.some(t => t.key === view) ? 'text-primary' : 'text-gray-400'}`}
                    >
                        {moreTabs.some(t => t.key === view) && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full"></span>}
                        <i className={`fas ${showMoreNav ? 'fa-times' : 'fa-ellipsis-h'} text-xl`}></i>
                        <span className="text-[8px] font-black uppercase tracking-tight leading-none">More</span>
                    </button>
                </div>

                {showMoreNav && (
                    <div className="border-t border-gray-100 bg-white grid grid-cols-4 divide-x divide-gray-50 animate-fadeIn">
                        {moreTabs.map(({ key, shortLabel, icon }) => (
                            <button
                                key={key}
                                onClick={() => { setView(key); setShowMoreNav(false); }}
                                className={`flex flex-col items-center py-3 gap-1 transition-all active:scale-95 ${view === key ? 'text-primary bg-primary/5' : 'text-gray-400'}`}
                            >
                                <i className={`fas ${icon} text-lg`}></i>
                                <span className="text-[8px] font-black uppercase tracking-tight leading-none">{shortLabel}</span>
                            </button>
                        ))}
                    </div>
                )}
            </nav>

            <div className="text-center pt-4 text-gray-300 text-[10px] font-black uppercase tracking-[0.2em]">
                <p>Labour Edu App System • Internal Build v1.1 • Stability: Optimal</p>
            </div>
        </div>
    );
};

export default HeadteacherDashboard;
