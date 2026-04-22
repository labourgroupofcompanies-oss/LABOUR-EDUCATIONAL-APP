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
import { normalizeArray, safeString, safeNumber } from '../../utils/dataSafety';
import SubscriptionGate from '../Subscription/SubscriptionGate';
import SubscriptionPage from '../Subscription/SubscriptionPage';
import PromotionApprovals from './PromotionApprovals';
import SubscriptionStatusIndicator from '../Common/SubscriptionStatusIndicator';
import NotificationBell from '../Common/NotificationBell';
import ContactModal from '../Common/ContactModal';
import GraduatesManagement from './GraduatesManagement';
import CalendarManager from './CalendarManager';
import AcademicAnalytics from './AcademicAnalytics';

type ViewType = 'overview' | 'students' | 'staff' | 'classes' | 'subjects' | 'results' | 'attendance' | 'settings' | 'subscription' | 'promotions' | 'payslip' | 'graduates' | 'calendar' | 'analytics';

const tabConfig: { key: ViewType; label: string; shortLabel: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', shortLabel: 'Home', icon: 'fa-home' },
    { key: 'staff', label: 'Staff', shortLabel: 'Staff', icon: 'fa-chalkboard-teacher' },
    { key: 'classes', label: 'Classes', shortLabel: 'Classes', icon: 'fa-chalkboard' },
    { key: 'subjects', label: 'Subjects', shortLabel: 'Subjects', icon: 'fa-book' },
    { key: 'students', label: 'Students', shortLabel: 'Students', icon: 'fa-user-graduate' },
    { key: 'graduates', label: 'Graduates', shortLabel: 'Alumni', icon: 'fa-award' },
    { key: 'promotions', label: 'Promotions', shortLabel: 'Promos', icon: 'fa-level-up-alt' },
    { key: 'attendance', label: 'Attendance', shortLabel: 'Attend.', icon: 'fa-calendar-check' },
    { key: 'results', label: 'Results', shortLabel: 'Results', icon: 'fa-chart-bar' },
    { key: 'analytics', label: 'Analytics', shortLabel: 'Analytics', icon: 'fa-chart-line' },
    { key: 'calendar', label: 'Calendar', shortLabel: 'Events', icon: 'fa-calendar-alt' },
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
    const [showHelp, setShowHelp] = useState(false);

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
        if (!user?.schoolId) return { studentCount: 0, staffCount: 0, classCount: 0, subjectCount: 0, upcomingEvents: [] };
        
        try {
            const [students, teachers, classes, subjects, eventsRaw] = await Promise.all([
                dbService.students.getAll(user.schoolId).then(res => 
                    normalizeArray(res).filter((s, i, arr) => 
                        s && s.fullName && arr.findIndex(t => t.fullName?.toLowerCase().trim() === s.fullName?.toLowerCase().trim()) === i
                    ).length
                ),
                dbService.staff.getTeachers(user.schoolId).then(res => normalizeArray(res).length),
                dbService.classes.getAll(user.schoolId).then(res => normalizeArray(res).length),
                dbService.subjects.getAll(user.schoolId).then(res => normalizeArray(res).length),
                // Safe query for newly added schoolEvents table
                (async () => {
                    try {
                        return await eduDb.schoolEvents
                            .where('schoolId').equals(user.schoolId)
                            .toArray();
                    } catch (err) {
                        console.warn("schoolEvents table not ready:", err);
                        return [];
                    }
                })()
            ]);

            const events = normalizeArray(eventsRaw);
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            return { 
                studentCount: safeNumber(students), 
                staffCount: safeNumber(teachers), 
                classCount: safeNumber(classes), 
                subjectCount: safeNumber(subjects),
                upcomingEvents: events
                    .filter((e: any) => e && e.startDate && new Date(e.startDate).getTime() >= startOfToday.getTime())
                    .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                    .slice(0, 3)
            };
        } catch (error) {
            console.error("Dashboard Stats Block Failed:", error);
            return { studentCount: 0, staffCount: 0, classCount: 0, subjectCount: 0, upcomingEvents: [] };
        }
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
            if (data) setAnnouncements(normalizeArray(data));
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
        { icon: 'fa-award', label: 'Graduates', color: 'bg-violet-500', action: () => setView('graduates') },
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
                            {/* Sync Status Alert */}
                            {syncStatus && syncStatus.pending > 0 && (
                                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 rounded-[2rem] p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                                    <div className="flex items-center gap-4 text-center md:text-left">
                                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-500 shadow-sm border border-amber-100 flex-shrink-0 relative">
                                            <i className={`fas fa-sync-alt ${isSyncing ? 'animate-spin' : 'animate-spin-slow'}`}></i>
                                            {isSyncing && <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white animate-pulse"></span>}
                                        </div>
                                        <div>
                                            <p className="text-amber-900 font-black text-xs uppercase tracking-widest">Pending Cloud Synchronization</p>
                                            <p className="text-amber-700/70 text-[10px] font-bold mt-0.5 uppercase tracking-tight">
                                                {syncStatus.pending} operations waiting for network connection.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleManualSync}
                                        disabled={isSyncing}
                                        className="w-full md:w-auto px-6 py-2.5 bg-white text-amber-600 border border-amber-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-amber-600 hover:text-white hover:border-amber-600 active:scale-95 disabled:opacity-50 shadow-sm"
                                    >
                                        {isSyncing ? 'Executing...' : 'Force Sync Now'}
                                    </button>
                                </div>
                            )}

                            {/* 1. Primary Stats Row */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                                {[
                                    { label: 'Learners', value: stats?.studentCount || 0, icon: 'fa-user-graduate', color: 'text-blue-600', bg: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-200' },
                                    { label: 'Staff', value: stats?.staffCount || 0, icon: 'fa-chalkboard-teacher', color: 'text-indigo-600', bg: 'from-indigo-500 to-indigo-600', shadow: 'shadow-indigo-200' },
                                    { label: 'Classes', value: stats?.classCount || 0, icon: 'fa-chalkboard', color: 'text-purple-600', bg: 'from-purple-500 to-purple-600', shadow: 'shadow-purple-200' },
                                    { label: 'Subjects', value: stats?.subjectCount || 0, icon: 'fa-book', color: 'text-emerald-600', bg: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-200' },
                                ].map((stat, idx) => (
                                    <div key={idx} className="bg-white p-5 md:p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                                        <div className="relative z-10">
                                            <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">{stat.label}</p>
                                            <h3 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">{stat.value}</h3>
                                        </div>
                                        <div className={`absolute -right-2 -bottom-2 w-16 h-16 bg-gradient-to-br ${stat.bg} rounded-3xl opacity-20 group-hover:opacity-40 group-hover:scale-125 transition-all flex items-center justify-center p-4`}>
                                            <i className={`fas ${stat.icon} text-3xl`}></i>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 2. Content Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                
                                {/* Quick Operations */}
                                <div className="lg:col-span-2 space-y-8">
                                    <div>
                                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                            <span className="w-8 h-px bg-slate-200"></span>
                                            Core Management
                                            <span className="flex-1 h-px bg-slate-200"></span>
                                        </h2>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-5">
                                            {quickActions.slice(0, 6).map((action, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={action.action}
                                                    className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm hover:border-primary hover:shadow-xl hover:shadow-blue-50 transition-all text-left flex flex-col items-start gap-4 active:scale-95 group relative overflow-hidden"
                                                >
                                                    <div className={`w-12 h-12 ${action.color} rounded-2xl flex items-center justify-center text-white shadow-lg shadow-current/20 group-hover:scale-110 group-hover:rotate-6 transition-all`}>
                                                        <i className={`fas ${action.icon} text-lg`}></i>
                                                    </div>
                                                    <span className="font-black text-[11px] md:text-xs uppercase tracking-widest text-slate-600 group-hover:text-primary transition-colors">
                                                        {action.label}
                                                    </span>
                                                    <i className="fas fa-chevron-right absolute top-6 right-6 text-slate-200 text-xs opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all"></i>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                            <span className="w-8 h-px bg-slate-200"></span>
                                            Strategic Operations
                                            <span className="flex-1 h-px bg-slate-200"></span>
                                        </h2>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                             {quickActions.slice(6).map((action, idx) => (
                                                 <button
                                                     key={idx + 6}
                                                     onClick={action.action}
                                                     className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 hover:bg-white hover:border-slate-300 hover:shadow-lg transition-all text-left flex items-center justify-between group active:scale-[0.98]"
                                                 >
                                                     <div className="flex items-center gap-4">
                                                         <div className={`w-10 h-10 ${action.color} rounded-xl flex items-center justify-center text-white text-sm flex-shrink-0 shadow-sm`}>
                                                             <i className={`fas ${action.icon}`}></i>
                                                         </div>
                                                         <span className="font-black text-xs uppercase tracking-widest text-slate-700">
                                                             {action.label}
                                                         </span>
                                                     </div>
                                                     <i className="fas fa-arrow-right text-slate-300 group-hover:text-slate-600 transition-colors"></i>
                                                 </button>
                                             ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Sidebar: Events & Insights */}
                                <div className="space-y-8">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em]">School Events</h2>
                                        <button onClick={() => setView('calendar')} className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">Full View</button>
                                    </div>
                                    
                                    <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col min-h-[400px]">
                                        <div className="space-y-6 flex-1">
                                            {stats?.upcomingEvents && stats.upcomingEvents.length > 0 ? stats.upcomingEvents.map((e: any) => (
                                                <div key={e.id} className="flex gap-4 group cursor-pointer" onClick={() => setView('calendar')}>
                                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-slate-600 border border-slate-100 flex-shrink-0 group-hover:bg-primary group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-200 transition-all duration-300">
                                                        <span className="text-[8px] font-black uppercase leading-none mb-1 opacity-60">{new Date(e.startDate).toLocaleString('default', { month: 'short' })}</span>
                                                        <span className="text-xl font-black leading-none">{new Date(e.startDate).getDate()}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0 pt-0.5">
                                                        <p className="text-sm font-black text-slate-800 leading-tight group-hover:text-primary transition-colors truncate uppercase tracking-tight">{e.title}</p>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[8px] font-black text-slate-500 uppercase tracking-widest">{e.type}</span>
                                                            <span className="text-[10px] font-bold text-slate-400">{new Date(e.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                                                    <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 text-slate-300 border border-slate-100 rotate-3">
                                                        <i className="fas fa-calendar-day text-3xl"></i>
                                                    </div>
                                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No Events Scheduled</p>
                                                    <p className="text-[10px] text-slate-300 mt-2 max-w-[200px] font-medium leading-relaxed uppercase tracking-tight">Your school calendar is currently empty. Start planning your term events today!</p>
                                                </div>
                                            )}
                                        </div>

                                        <button 
                                            onClick={() => setView('calendar')}
                                            className="w-full mt-10 py-4 text-[10px] font-black text-white bg-primary rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-3 uppercase tracking-[0.2em]"
                                        >
                                            <i className="fas fa-plus"></i>
                                            Add New Event
                                        </button>
                                    </div>

                                    {/* Analytics Insight Card */}
                                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden group cursor-pointer" onClick={() => setView('analytics')}>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-16 translate-x-16 group-hover:scale-150 transition-transform duration-700"></div>
                                        <div className="relative z-10">
                                            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-blue-400 mb-4 border border-white/10">
                                                <i className="fas fa-chart-line"></i>
                                            </div>
                                            <h3 className="text-white font-black text-sm uppercase tracking-widest mb-1">Academic Insights</h3>
                                            <p className="text-slate-400 text-xs font-medium leading-relaxed">Analyze performance trends and attendance patterns across all classes.</p>
                                            <div className="mt-6 flex items-center gap-2 text-blue-400 text-[10px] font-black uppercase tracking-widest">
                                                Go to Analytics <i className="fas fa-arrow-right ml-1 group-hover:translate-x-2 transition-transform"></i>
                                            </div>
                                        </div>
                                    </div>
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
            case 'analytics': return <SubscriptionGate><AcademicAnalytics /></SubscriptionGate>;
            case 'calendar': return <SubscriptionGate><CalendarManager /></SubscriptionGate>;
            case 'attendance': return <SubscriptionGate><AttendanceDashboard /></SubscriptionGate>;
            case 'promotions': return <SubscriptionGate><PromotionApprovals /></SubscriptionGate>;
            case 'graduates': return <SubscriptionGate><GraduatesManagement /></SubscriptionGate>;
            case 'payslip': return <TeacherPayslip />;
            case 'settings': return <Settings />;
            case 'subscription': return <SubscriptionPage />;
            default: return null;
        }
    };

    // Bottom nav: show first 4 tabs + a "Menu" approach
    const primaryKeys: ViewType[] = ['overview', 'staff', 'classes', 'students'];
    const primaryTabs = tabConfig.filter(t => primaryKeys.includes(t.key));
    const moreTabs = tabConfig.filter(t => !primaryKeys.includes(t.key));

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
            <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-900 shadow-2xl shadow-blue-900/20 border-b border-white/10">
                {/* Visual Elements */}
                <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="pointer-events-none absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>
                <div className="pointer-events-none absolute top-1/2 left-1/4 w-32 h-32 bg-blue-400/10 rounded-full blur-2xl animate-pulse"></div>

                {/* MOBILE header */}
                <div className="md:hidden px-6 py-6 relative z-10">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            {logoPreview ? (
                                <img src={logoPreview} alt="Logo" className="w-12 h-12 rounded-2xl object-cover border-2 border-white/20 shadow-lg flex-shrink-0" />
                            ) : (
                                <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/20 shadow-lg">
                                    <i className="fas fa-university text-white text-xl"></i>
                                </div>
                            )}
                            <div className="min-w-0">
                                <p className="text-white/40 text-[7px] font-black uppercase tracking-[0.2em] leading-none mb-1.5 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                                    Headteacher Portal
                                </p>
                                <h1 className="text-white font-black text-lg leading-tight truncate">
                                    {schoolData?.schoolName || 'Labour Edu'}
                                </h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowHelp(true)}
                                className="w-10 h-10 flex items-center justify-center bg-white/10 text-white rounded-xl border border-white/10 active:scale-90 transition-all"
                                title="Support"
                            >
                                <i className="fas fa-headset text-sm"></i>
                            </button>
                            <NotificationBell canCompose={true} />
                            <button
                                onClick={logout}
                                className="w-10 h-10 flex items-center justify-center bg-white/10 text-white rounded-xl border border-white/10 active:scale-90 transition-all"
                                title="Log Out"
                            >
                                <i className="fas fa-power-off text-sm"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-6 flex items-center justify-between bg-black/20 backdrop-blur-sm rounded-2xl p-3 border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-blue-300">
                                <i className="fas fa-fingerprint text-xs"></i>
                            </div>
                            <div>
                                <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">School Access ID</p>
                                <p className="text-[10px] font-black text-white uppercase tracking-wider">{schoolData?.schoolCode || user?.schoolId}</p>
                            </div>
                        </div>
                        <SubscriptionStatusIndicator isSubscribed={isSubscribed} isLoading={isSubLoading} className="scale-75 origin-right" />
                    </div>
                </div>

                {/* DESKTOP header */}
                <div className="hidden md:flex items-center justify-between gap-6 p-10 relative z-10">
                    <div className="flex items-center gap-6 min-w-0">
                        {logoPreview ? (
                            <img src={logoPreview} alt="School Logo" className="w-24 h-24 rounded-[2rem] object-cover shadow-2xl border-4 border-white/20 flex-shrink-0" />
                        ) : (
                            <div className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-[2rem] flex items-center justify-center text-white shadow-2xl border border-white/20 flex-shrink-0">
                                <i className="fas fa-university text-4xl"></i>
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-[9px] font-black text-blue-100 uppercase tracking-widest border border-white/10">
                                    Headteacher Portal
                                </span>
                                <span className="text-white/40 font-bold text-[10px] uppercase tracking-widest">ID: {schoolData?.schoolCode || user?.schoolId}</span>
                            </div>
                            <h1 className="text-white font-black text-4xl leading-none tracking-tight truncate pb-1">
                                {schoolData?.schoolName || 'Labour Edu'}
                            </h1>
                            <div className="flex items-center gap-4 mt-3">
                                <p className="text-blue-200/60 text-xs font-bold flex items-center gap-2 uppercase tracking-widest">
                                    <i className="fas fa-map-marker-alt text-red-400"></i>
                                    {schoolData?.district || 'District'} • {schoolData?.region || 'Region'}
                                </p>
                                <div className="h-4 w-px bg-white/10"></div>
                                <SubscriptionStatusIndicator isSubscribed={isSubscribed} isLoading={isSubLoading} />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                        <button
                            onClick={() => setShowHelp(true)}
                            className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-2xl text-white border border-white/10 transition-all active:scale-90"
                            title="Support"
                        >
                            <i className="fas fa-headset text-lg"></i>
                        </button>
                        <NotificationBell canCompose={true} />
                        <div className="w-px h-10 bg-white/10 mx-2"></div>
                        <button
                            onClick={logout}
                            className="flex items-center gap-3 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-900/20"
                        >
                            <i className="fas fa-power-off"></i> 
                            <span className="hidden lg:inline">Secure Logout</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Main Content Area ── */}
            <div className="premium-card mb-4 md:mb-8 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                {/* Desktop top tab bar */}
                <div className="hidden md:flex border-b border-gray-100 overflow-x-auto whitespace-nowrap bg-slate-50/50 scrollbar-hide">
                    {tabConfig.map(({ key, label, icon }) => (
                        <button
                            key={key}
                            onClick={() => setView(key)}
                            className={`flex flex-row items-center gap-3 flex-shrink-0 px-8 py-6 font-black text-[10px] uppercase tracking-[0.2em] transition-all relative group ${view === key ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <i className={`fas ${icon} text-sm transition-transform group-hover:scale-110 ${view === key ? 'text-primary' : 'text-gray-300'}`}></i>
                            {label}
                            {view === key && (
                                <span className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-full shadow-[0_-4px_10px_rgba(59,130,246,0.3)]"></span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-0 md:p-10 min-h-[600px]">
                    <div className="px-4 py-8 md:px-0 md:py-0">
                        {renderView()}
                    </div>
                </div>
            </div>

            {/* ── Mobile Fixed Bottom Navigation ── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-100 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
                <div className="flex items-center justify-around px-4">
                    {primaryTabs.map(({ key, shortLabel, icon }) => (
                        <button
                            key={key}
                            onClick={() => { setView(key); setShowMoreNav(false); }}
                            className={`relative flex-1 flex flex-col items-center pt-4 pb-6 gap-1.5 transition-all active:scale-90 ${view === key ? 'text-primary' : 'text-gray-400'}`}
                        >
                            {view === key && (
                                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-b-full shadow-[0_4px_10px_rgba(59,130,246,0.4)]"></span>
                            )}
                            <i className={`fas ${icon} text-lg transition-transform ${view === key ? 'scale-110' : ''}`}></i>
                            <span className="text-[8px] font-black uppercase tracking-widest leading-none">{shortLabel}</span>
                        </button>
                    ))}

                    <button
                        onClick={() => setShowMoreNav(prev => !prev)}
                        className={`relative flex-1 flex flex-col items-center pt-4 pb-6 gap-1.5 transition-all active:scale-90 ${moreTabs.some(t => t.key === view) || showMoreNav ? 'text-primary' : 'text-gray-400'}`}
                    >
                        {(moreTabs.some(t => t.key === view) || showMoreNav) && (
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-b-full shadow-[0_4px_10px_rgba(59,130,246,0.4)]"></span>
                        )}
                        <div className={`w-6 h-6 flex items-center justify-center transition-transform duration-500 ${showMoreNav ? 'rotate-90' : ''}`}>
                            <i className={`fas ${showMoreNav ? 'fa-times' : 'fa-grid-2'} text-lg`}></i>
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-widest leading-none">{showMoreNav ? 'Close' : 'More'}</span>
                    </button>
                </div>

                {/* Premium "More" Overlay */}
                {showMoreNav && (
                    <div className="absolute bottom-full left-0 right-0 p-6 animate-in slide-in-from-bottom duration-500">
                        <div className="bg-white/98 backdrop-blur-2xl rounded-[3rem] border border-gray-100 shadow-[0_-20px_60px_rgba(0,0,0,0.15)] overflow-hidden max-h-[75vh] flex flex-col">
                            <div className="p-8 border-b border-gray-100 bg-slate-50/50 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-3">
                                        <i className="fas fa-layer-group text-primary"></i>
                                        Portal Ops
                                    </h3>
                                    <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Management Suite</p>
                                </div>
                                <button onClick={() => setShowMoreNav(false)} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 border border-gray-100">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto grid grid-cols-3 gap-4">
                                {moreTabs.map(({ key, label, icon }) => (
                                    <button
                                        key={key}
                                        onClick={() => { setView(key); setShowMoreNav(false); }}
                                        className={`flex flex-col items-center justify-center p-5 rounded-3xl transition-all active:scale-95 gap-3 border ${view === key 
                                            ? 'bg-primary text-white border-primary shadow-xl shadow-blue-200' 
                                            : 'bg-slate-50 text-slate-500 border-slate-100'}`}
                                    >
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${view === key ? 'bg-white/20' : 'bg-white shadow-sm text-slate-400'}`}>
                                            <i className={`fas ${icon}`}></i>
                                        </div>
                                        <span className="text-[9px] font-black text-center leading-tight uppercase tracking-tight">{label}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="p-6 bg-slate-50/80 border-t border-gray-100 text-center">
                                <span className="text-[8px] text-slate-400 font-black uppercase tracking-[0.3em]">
                                    Labour Edu • School OS
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </nav>

            {showHelp && <ContactModal onClose={() => setShowHelp(false)} />}
        </div>
    );
};

export default HeadteacherDashboard;
