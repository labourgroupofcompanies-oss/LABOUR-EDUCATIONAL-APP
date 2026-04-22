import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { eduDb } from '../../eduDb';
import { useEffect } from 'react';
import { syncService } from '../../services/syncService';
import { useAuth } from '../../hooks/useAuth';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { useSubscription } from '../../hooks/useSubscription';
import { dbService } from '../../services/dbService';
import { useAssetPreview } from '../../hooks/useAssetPreview';
import { normalizeArray, safeString, safeNumber } from '../../utils/dataSafety';
import TeacherClassList from './TeacherClassList';
import TeacherSubjectList from './TeacherSubjectList';
import TeacherSettings from './TeacherSettings';
import TeacherPayslip from './TeacherPayslip';
import TeacherPromotions from './TeacherPromotions';
import AttendanceRegister from './Attendance/AttendanceRegister';
import AttendanceCalendar from './Attendance/AttendanceCalendar';
import SubscriptionGate from '../Subscription/SubscriptionGate';
import SubscriptionStatusIndicator from '../Common/SubscriptionStatusIndicator';
import NotificationBell from '../Common/NotificationBell';
import ContactModal from '../Common/ContactModal';

const TeacherDashboard: React.FC = () => {
    const { user, logout } = useAuth();
    const { currentTerm, academicYear } = useAcademicSession();
    const { isSubscribed, subscription, isLoading: isSubLoading } = useSubscription(user?.schoolId, currentTerm, academicYear);

    const [view, setView] = useState<'overview' | 'classes' | 'subjects' | 'attendance' | 'promotions' | 'payslip' | 'settings'>('overview');
    const [isSyncing, setIsSyncing] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showMoreNav, setShowMoreNav] = useState(false);
    const [attendanceMode, setAttendanceMode] = useState<'register' | 'history'>('register');

    useEffect(() => {
        const toHome = () => setView('overview');
        window.addEventListener('navigate-to-subscription', toHome);
        window.addEventListener('navigate-to-home', toHome);
        return () => {
            window.removeEventListener('navigate-to-subscription', toHome);
            window.removeEventListener('navigate-to-home', toHome);
        };
    }, []);

    const handleManualSync = async () => {
        if (!user?.schoolId || isSyncing) return;
        setIsSyncing(true);
        try {
            await syncService.pullAll(user.schoolId);
            await syncService.syncAll(user.schoolId);
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

    const tabIcons = {
        overview: 'fa-home',
        classes: 'fa-users',
        subjects: 'fa-book',
        attendance: 'fa-calendar-check',
        promotions: 'fa-level-up-alt',
        payslip: 'fa-file-invoice-dollar',
        settings: 'fa-cog'
    };

    // Fetch School Data for Header
    const schoolData = useLiveQuery(async () => {
        if (user?.schoolId) {
            return await db.schools
                .where('schoolId').equals(user.schoolId)
                .or('idCloud').equals(user.schoolId)
                .first();
        }
        return null;
    }, [user?.schoolId]);

    const logoPreview = useAssetPreview(schoolData?.logo);

    // Fetch Teacher Stats using dbService
    const stats = useLiveQuery(async () => {
        if (!user?.schoolId || !user?.id) return { classes: 0, subjects: 0, students: 0, className: 'None' };

        const teacherId = user.id;

        const [myClassesRaw, myAssignmentsRaw] = await Promise.all([
            dbService.classes.getTeacherClasses(user.schoolId, teacherId),
            dbService.staff.getSubjectAssignments(user.schoolId, teacherId)
        ]);

        const myClasses = normalizeArray(myClassesRaw);
        const myAssignments = normalizeArray(myAssignmentsRaw);

        let studentCount = 0;
        for (const cls of myClasses) {
            if (cls && cls.id) {
                const students = await dbService.students.getByClass(user.schoolId, cls.id);
                const count = normalizeArray(students).filter((s, i, arr) => 
                    s && s.fullName && arr.findIndex(t => t.fullName?.toLowerCase().trim() === s.fullName?.toLowerCase().trim()) === i
                ).length;
                studentCount += count;
            }
        }

        let upcomingEvents: any[] = [];
        try {
            const startOfToday = new Date().setHours(0, 0, 0, 0);
            const eventsRes = await eduDb.schoolEvents
                .where('schoolId').equals(user.schoolId)
                .toArray();
            
            upcomingEvents = normalizeArray(eventsRes)
                .filter((e: any) => e && e.startDate && new Date(e.startDate).getTime() >= startOfToday)
                .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        } catch (err) {
            console.warn("schoolEvents table not ready in teacher dashboard:", err);
        }

        const className = myClasses.length === 0 ? 'None'
            : myClasses.length === 1 ? myClasses[0].name
                : `${myClasses.length} Classes`;

        return {
            classes: myClasses.length,
            subjects: myAssignments.length,
            students: safeNumber(studentCount),
            className: safeString(className, 'None'),
            upcomingEvents: upcomingEvents.slice(0, 3)
        };
    }, [user?.schoolId, user?.id]);

    return (
        <div className="max-w-7xl mx-auto py-4 md:py-8 px-4 sm:px-6 lg:px-8 space-y-6 md:space-y-8 relative z-10 pb-24 md:pb-0">
            {/* ── Header Section ── */}
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-700 via-indigo-600 to-purple-700 shadow-2xl shadow-indigo-300/40">
                {/* Decorative blobs (shared) */}
                <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
                <div className="pointer-events-none absolute bottom-0 left-1/3 w-40 h-40 bg-purple-400/20 rounded-full blur-2xl"></div>

                {/* ── MOBILE header (hidden on md+) ── */}
                <div className="md:hidden px-5 py-4 relative z-10">
                    {/* Row 1: avatar + name + logout */}
                    <div className="flex items-center gap-3">
                        {logoPreview ? (
                            <img src={logoPreview} alt="Logo" className="w-10 h-10 rounded-xl object-cover border-2 border-white/30 flex-shrink-0" />
                        ) : (
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0 border border-white/20">
                                <i className="fas fa-chalkboard-teacher text-white text-base"></i>
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-white/50 text-[8px] font-black uppercase tracking-[0.18em] leading-none">
                                    Teacher Portal
                                </p>
                                <SubscriptionStatusIndicator isSubscribed={isSubscribed} isLoading={isSubLoading} className="scale-75 origin-left" />
                            </div>
                            <p className="text-white font-black text-base leading-tight truncate">
                                {user?.fullName?.split(' ')[0] || 'Teacher'}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowHelp(true)}
                            className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-white border border-white/20 transition-all active:scale-90 flex-shrink-0"
                            title="Help & Support"
                        >
                            <i className="fas fa-question text-sm"></i>
                        </button>
                        <NotificationBell />
                        <button
                            onClick={logout}
                            className="w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-red-500/70 rounded-xl text-white border border-white/20 transition-all active:scale-90 flex-shrink-0"
                            title="Log Out"
                        >
                            <i className="fas fa-sign-out-alt text-sm"></i>
                        </button>
                    </div>
                    {/* Row 2: greeting strip */}
                    <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2">
                        <p className="text-indigo-200 text-xs font-medium">👋 Good to see you today!</p>
                        <button
                            onClick={handleManualSync}
                            disabled={isSyncing}
                            className="w-6 h-6 flex items-center justify-center bg-white/10 rounded-lg text-white/70 hover:bg-white/20 disabled:opacity-50 transition-all"
                            title="Force Sync"
                        >
                            <i className={`fas fa-sync-alt text-[10px] ${isSyncing ? 'animate-spin' : ''}`}></i>
                        </button>
                    </div>
                </div>

                {/* ── DESKTOP/TABLET header (hidden on mobile) ── */}
                <div className="hidden md:flex items-center justify-between gap-6 p-8 relative z-10">
                    {/* Left: Logo + Info */}
                    <div className="flex items-center gap-5 min-w-0">
                        {logoPreview ? (
                            <img src={logoPreview} alt="School Logo" className="w-20 h-20 rounded-2xl object-cover shadow-xl border-2 border-white/30 flex-shrink-0" />
                        ) : (
                            <div className="w-20 h-20 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white shadow-xl border border-white/20 flex-shrink-0">
                                <i className="fas fa-chalkboard-teacher text-3xl"></i>
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-white/60 font-black text-[9px] uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
                                <i className="fas fa-circle text-green-400 text-[6px] animate-pulse"></i>
                                Teacher Portal — Active Session
                            </p>
                            <h1 className="text-white font-black text-3xl leading-tight tracking-tight truncate">
                                {user?.fullName || 'Teacher'}
                            </h1>
                            <p className="text-indigo-200 text-sm font-medium mt-1">
                                Welcome back — have a great session! 👋
                            </p>
                        </div>
                    </div>
                    {/* Right: Status + Logout */}
                    <div className="flex flex-col flex-wrap md:flex-row items-end md:items-center gap-3 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowHelp(true)}
                                className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-white border border-white/20 transition-all active:scale-90 flex-shrink-0"
                                title="Help & Support"
                            >
                                <i className="fas fa-question text-sm"></i>
                            </button>
                            <NotificationBell />
                        </div>
                        <div className="hover:scale-110 transition-transform active:scale-95 ml-2" title={isSubscribed ? (subscription?.status === 'trial' ? 'Trial Mode' : 'Account Active') : 'Inactive Plan'}>
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

            {/* Main Content Area */}
            <div className="premium-card overflow-hidden mb-4 md:mb-8">
                {/* Desktop/Tablet Top Tab Bar — HIDDEN on mobile */}
                <div className="hidden md:flex border-b border-gray-100 overflow-x-auto whitespace-nowrap pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] bg-gray-50/30">
                    {(['overview', 'classes', 'subjects', 'attendance', 'promotions', 'payslip', 'settings'] as const).map((tab) => {
                        if ((tab === 'classes' || tab === 'attendance' || tab === 'promotions') && stats?.classes === 0) return null;
                        return (
                            <button
                                key={tab}
                                onClick={() => setView(tab)}
                                className={`flex flex-row items-center gap-2 flex-shrink-0 px-8 py-5 font-black text-[10px] uppercase tracking-widest transition-all ${view === tab ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                            >
                                <i className={`fas ${tabIcons[tab]} text-base ${view === tab ? 'text-indigo-600' : 'text-gray-300'}`}></i>
                                <span>{tab === 'classes' ? 'My Classes' : tab === 'subjects' ? 'My Subjects' : tab === 'attendance' ? 'Attendance' : tab === 'promotions' ? 'Promotions' : tab === 'payslip' ? 'Payslip' : tab === 'settings' ? 'Settings' : 'Overview'}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="p-4 md:p-8 min-h-[500px] overflow-x-auto">
                    {view === 'overview' && (
                        <SubscriptionGate>
                            <div className="space-y-8 md:space-y-12 animate-fadeIn">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
                                    {[
                                        { label: 'My Class', value: stats?.className || 'None', icon: 'fa-users', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                                        { label: 'My Subjects', value: stats?.subjects || 0, icon: 'fa-book-reader', color: 'text-purple-600', bg: 'bg-purple-50' },
                                        { label: 'My Students', value: stats?.students || 0, icon: 'fa-user-graduate', color: 'text-green-600', bg: 'bg-green-50' },
                                    ].map((stat, idx) => (
                                        <div key={idx} className="bg-white p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
                                            <div className={`w-10 h-10 md:w-14 md:h-14 ${stat.bg} ${stat.color} rounded-xl md:rounded-2xl flex items-center justify-center text-lg md:text-2xl mb-4 md:mb-6 group-hover:scale-110 transition-transform shadow-sm`}>
                                                <i className={`fas ${stat.icon}`}></i>
                                            </div>
                                            <h3 className="text-2xl md:text-4xl font-black text-gray-800 mb-1">{stat.value}</h3>
                                            <p className="text-[9px] md:text-[10px] text-gray-400 font-black uppercase tracking-widest">{stat.label}</p>
                                        </div>
                                    ))}
                                </div>

                                                         {/* Main Content Grid: Strategic Operations & Upcoming Events */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                    
                                    {/* Operations (Left) */}
                                    <div className="lg:col-span-8 space-y-8">
                                        <h2 className="text-xl font-black text-gray-800 flex items-center gap-3">
                                            <span className="w-8 h-8 rounded-lg bg-yellow-400 text-white flex items-center justify-center text-sm shadow-sm">
                                                <i className="fas fa-bolt"></i>
                                            </span>
                                            Strategic Operations
                                        </h2>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                            {(stats?.classes ?? 0) > 0 && (
                                                <button
                                                    onClick={() => setView('attendance')}
                                                    className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all text-left flex flex-col gap-6 group hover:border-indigo-100 active:scale-95"
                                                >
                                                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                                        <i className="fas fa-calendar-check text-xl"></i>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-black text-[10px] uppercase tracking-widest text-gray-500 group-hover:text-indigo-600 transition-colors">Mark Attendance</span>
                                                        {!isSubscribed && <span className="text-[8px] font-bold text-orange-500 flex items-center gap-1"><i className="fas fa-lock"></i> Premium</span>}
                                                    </div>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setView('subjects')}
                                                className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all text-left flex flex-col gap-6 group hover:border-purple-100 active:scale-95"
                                            >
                                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-sm">
                                                    <i className="fas fa-star text-xl"></i>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-black text-[10px] uppercase tracking-widest text-gray-500 group-hover:text-purple-600 transition-colors">Enter Results</span>
                                                    {!isSubscribed && <span className="text-[8px] font-bold text-orange-500 flex items-center gap-1"><i className="fas fa-lock"></i> Premium</span>}
                                                </div>
                                            </button>
                                            {(stats?.classes ?? 0) > 0 && (
                                                <button
                                                    onClick={() => setView('promotions')}
                                                    className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all text-left flex flex-col gap-6 group hover:border-pink-100 active:scale-95"
                                                >
                                                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-pink-600 group-hover:text-white transition-all shadow-sm">
                                                        <i className="fas fa-level-up-alt text-xl"></i>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-black text-[10px] uppercase tracking-widest text-gray-500 group-hover:text-pink-600 transition-colors">Promotions</span>
                                                        <span className="text-[8px] font-bold text-gray-400 transition-colors group-hover:text-pink-400">Term 3 Only</span>
                                                    </div>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Upcoming Events (Right) */}
                                    <div className="lg:col-span-4 space-y-8">
                                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-3">
                                            <span className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center text-sm shadow-sm ring-4 ring-indigo-50">
                                                <i className="fas fa-calendar-alt"></i>
                                            </span>
                                            School Events
                                        </h2>
                                        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col min-h-[300px]">
                                            <div className="space-y-6 flex-1">
                                                {stats?.upcomingEvents && stats.upcomingEvents.length > 0 ? stats.upcomingEvents.map((e: any) => (
                                                    <div key={e.id} className="flex gap-4 group">
                                                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex flex-col items-center justify-center text-indigo-900 border border-indigo-100/50 flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                                                            <span className="text-[9px] font-black uppercase tracking-widest leading-none mb-1 opacity-70">{new Date(e.startDate).toLocaleString('default', { month: 'short' })}</span>
                                                            <span className="text-xl font-black leading-none">{new Date(e.startDate).getDate()}</span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-black text-slate-800 truncate uppercase tracking-tight">{e.title}</p>
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">{e.type}</p>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                                                        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                                                            <i className="fas fa-calendar-times"></i>
                                                        </div>
                                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Events Posted</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </SubscriptionGate>
                    )}

                    {view === 'classes' && <SubscriptionGate><TeacherClassList /></SubscriptionGate>}
                    {view === 'subjects' && <SubscriptionGate><TeacherSubjectList /></SubscriptionGate>}
                    {view === 'promotions' && <SubscriptionGate><TeacherPromotions /></SubscriptionGate>}

                    {view === 'attendance' && (
                        <SubscriptionGate>
                            <div className="space-y-6">
                                <div className="flex justify-center md:justify-end">
                                    <div className="inline-flex bg-gray-100 p-1 rounded-xl shadow-inner">
                                        <button 
                                            onClick={() => setAttendanceMode('register')}
                                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${attendanceMode === 'register' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            Daily Register
                                        </button>
                                        <button 
                                            onClick={() => setAttendanceMode('history')}
                                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${attendanceMode === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            History View
                                        </button>
                                    </div>
                                </div>
                                {attendanceMode === 'register' ? <AttendanceRegister /> : <AttendanceCalendar />}
                            </div>
                        </SubscriptionGate>
                    )}

                    {view === 'payslip' && <SubscriptionGate><TeacherPayslip /></SubscriptionGate>}
                    {view === 'settings' && <SubscriptionGate><TeacherSettings /></SubscriptionGate>}
                </div>
            </div>

            {/* ── Mobile Fixed Bottom Navigation Bar ── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-gray-100 z-50 shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
                <div className="flex items-center justify-around px-2">
                    {(() => {
                        const primaryTabs = ['overview', 'classes', 'subjects', 'attendance'] as const;
                        const moreTabs = ['promotions', 'payslip', 'settings'] as const;
                        const isMoreActive = moreTabs.includes(view as any);

                        const getLabel = (tab: string) => {
                            switch(tab) {
                                case 'overview': return 'Home';
                                case 'classes': return 'Classes';
                                case 'subjects': return 'Subjects';
                                case 'attendance': return 'Attend.';
                                case 'promotions': return 'Promos';
                                case 'payslip': return 'Payslip';
                                case 'settings': return 'Settings';
                                default: return tab;
                            }
                        };

                        return (
                            <>
                                {primaryTabs.map((tab) => {
                                    if ((tab === 'classes' || tab === 'attendance') && stats?.classes === 0) return null;
                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => { setView(tab); setShowMoreNav(false); }}
                                            className={`relative flex-1 flex flex-col items-center pt-3 pb-4 gap-1 transition-all active:scale-95 ${view === tab ? 'text-indigo-600' : 'text-gray-400'}`}
                                        >
                                            {view === tab && (
                                                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-indigo-600 rounded-b-full shadow-[0_2px_10px_rgba(79,70,229,0.5)] animate-slideDown"></span>
                                            )}
                                            <i className={`fas ${tabIcons[tab]} text-xl transition-colors ${view === tab ? 'scale-110' : ''}`}></i>
                                            <span className="text-[9px] font-black uppercase tracking-tight leading-none">
                                                {getLabel(tab)}
                                            </span>
                                        </button>
                                    );
                                })}

                                <button
                                    onClick={() => setShowMoreNav(!showMoreNav)}
                                    className={`relative flex-1 flex flex-col items-center pt-3 pb-4 gap-1 transition-all active:scale-95 ${isMoreActive || showMoreNav ? 'text-indigo-600' : 'text-gray-400'}`}
                                >
                                    {(isMoreActive || showMoreNav) && (
                                        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-indigo-600 rounded-b-full shadow-[0_2px_10px_rgba(79,70,229,0.5)] animate-slideDown"></span>
                                    )}
                                    <div className={`w-6 h-6 flex items-center justify-center transition-transform duration-300 ${showMoreNav ? 'rotate-90' : ''}`}>
                                        <i className={`fas ${showMoreNav ? 'fa-times' : 'fa-th-large'} text-xl`}></i>
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-tight leading-none">{showMoreNav ? 'Close' : 'Menu'}</span>
                                </button>

                                {/* More Overlay for Teacher */}
                                {showMoreNav && (
                                    <div className="absolute bottom-full left-0 right-0 p-4 animate-in slide-in-from-bottom duration-300">
                                        <div className="bg-white/95 backdrop-blur-xl rounded-[2.5rem] border border-white/20 shadow-[0_-20px_50px_rgba(0,0,0,0.15)] overflow-hidden max-h-[70vh] flex flex-col">
                                            <div className="p-6 border-b border-gray-100/50 bg-gray-50/50 flex items-center justify-between">
                                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
                                                    <i className="fas fa-chalkboard-teacher text-indigo-600"></i>
                                                    Teacher Menu
                                                </h3>
                                                <div className="px-3 py-1 bg-indigo-100 rounded-full">
                                                    <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter">Academic Tools</span>
                                                </div>
                                            </div>
                                            <div className="p-4 overflow-y-auto grid grid-cols-3 gap-3">
                                                {moreTabs.map((tab) => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => { setView(tab); setShowMoreNav(false); }}
                                                        className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all active:scale-95 gap-3 border ${view === tab 
                                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200' 
                                                            : 'bg-gray-50/50 text-gray-500 border-gray-100 hover:bg-gray-100'}`}
                                                    >
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${view === tab ? 'bg-white/20' : 'bg-white shadow-sm text-gray-400'}`}>
                                                            <i className={`fas ${tabIcons[tab]}`}></i>
                                                        </div>
                                                        <span className="text-[9px] font-bold text-center leading-tight uppercase tracking-tight">{getLabel(tab)}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="p-4 bg-gray-50/80 border-t border-gray-100/50">
                                                <p className="text-[8px] text-center text-gray-400 font-black uppercase tracking-[0.2em]">
                                                    Labour Edu System • Teacher Terminal
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            </nav>

            <div className="text-center pt-8 text-gray-300 text-[10px] font-black uppercase tracking-[0.2em]">
                <p>Labour Edu App System • Teacher Terminal v1.1 • Reliability: Optimal</p>
            </div>

            {showHelp && <ContactModal onClose={() => setShowHelp(false)} />}
        </div>
    );
};

export default TeacherDashboard;
