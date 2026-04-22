import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useEffect } from 'react';
import { syncService } from '../../services/syncService';
import { useAuth } from '../../hooks/useAuth';
import { useAssetPreview } from '../../hooks/useAssetPreview';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { useSubscription } from '../../hooks/useSubscription';
import AccountantHome from './Overview/AccountantHome';
import FeeStructure from './FeeManagement/FeeStructure';
import StudentFeeList from './FeeManagement/StudentFeeList';
import PayrollDashboard from './Payroll/PayrollDashboard';
import PayrollHistory from './Payroll/PayrollHistory';
import ExpenseList from './Expenses/ExpenseList';
import FinancialReports from './Reports/FinancialReports';
import AccountantSettings from './Settings/AccountantSettings';
import SubscriptionGate from '../Subscription/SubscriptionGate';
import SubscriptionPage from '../Subscription/SubscriptionPage';
import SubscriptionStatusIndicator from '../Common/SubscriptionStatusIndicator';
import NotificationBell from '../Common/NotificationBell';
import ContactModal from '../Common/ContactModal';

type View = 'overview' | 'fees-structure' | 'fees-students' | 'payroll' | 'payroll-history' | 'expenses' | 'reports' | 'settings' | 'subscription';

const AccountantDashboard: React.FC = () => {
    const { user, logout } = useAuth();
    const { currentTerm, academicYear } = useAcademicSession();
    const { isSubscribed, subscription, isLoading: isSubLoading } = useSubscription(user?.schoolId, currentTerm, academicYear);
    
    const [view, setView] = useState<View>('overview');
    const [isSyncing, setIsSyncing] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showMoreNav, setShowMoreNav] = useState(false);

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
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const toHome = () => setView('overview');
        const toSub = () => setView('subscription');
        window.addEventListener('navigate-to-subscription', toSub);
        window.addEventListener('navigate-to-home', toHome);
        return () => {
            window.removeEventListener('navigate-to-subscription', toSub);
            window.removeEventListener('navigate-to-home', toHome);
        };
    }, []);

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

    const nav = [
        { id: 'overview', label: 'Overview', icon: 'fa-home', group: null },
        { id: 'fees-structure', label: 'Fee Structure', icon: 'fa-list-alt', group: 'Fee Management' },
        { id: 'fees-students', label: 'Student Fees', icon: 'fa-users', group: 'Fee Management' },
        { id: 'payroll', label: 'Payroll Run', icon: 'fa-money-bill-wave', group: 'Payroll' },
        { id: 'payroll-history', label: 'Pay History', icon: 'fa-history', group: 'Payroll' },
        { id: 'expenses', label: 'Expenses', icon: 'fa-receipt', group: 'Expenses' },
        { id: 'reports', label: 'Reports', icon: 'fa-chart-bar', group: 'Reports' },
        { id: 'subscription', label: 'Subscription', icon: 'fa-credit-card', group: 'System' },
        { id: 'settings', label: 'Settings', icon: 'fa-cog', group: null },
    ] as const;

    const tabIcons: Record<string, string> = {
        'overview': 'fa-home',
        'fees-structure': 'fa-list-alt',
        'fees-students': 'fa-users',
        'payroll': 'fa-money-bill-wave',
        'payroll-history': 'fa-history',
        'expenses': 'fa-receipt',
        'reports': 'fa-chart-bar',
        'subscription': 'fa-credit-card',
        'settings': 'fa-cog',
    };

    const tabLabels: Record<string, string> = {
        'overview': 'Home',
        'fees-structure': 'Fees',
        'fees-students': 'Students',
        'payroll': 'Payroll',
        'payroll-history': 'History',
        'expenses': 'Expenses',
        'reports': 'Reports',
        'subscription': 'Plan',
        'settings': 'Settings',
    };

    const currentLabel = nav.find(n => n.id === view)?.label || 'Overview';

    const renderView = () => {
        switch (view) {
            case 'overview': return <SubscriptionGate><AccountantHome onNavigate={(v) => setView(v as View)} /></SubscriptionGate>;
            case 'fees-structure': return <SubscriptionGate><FeeStructure /></SubscriptionGate>;
            case 'fees-students': return <SubscriptionGate><StudentFeeList /></SubscriptionGate>;
            case 'payroll': return <SubscriptionGate><PayrollDashboard /></SubscriptionGate>;
            case 'payroll-history': return <SubscriptionGate><PayrollHistory /></SubscriptionGate>;
            case 'expenses': return <SubscriptionGate><ExpenseList /></SubscriptionGate>;
            case 'reports': return <SubscriptionGate><FinancialReports /></SubscriptionGate>;
            case 'subscription': return <SubscriptionPage />;
            case 'settings': return <SubscriptionGate><AccountantSettings /></SubscriptionGate>;
            default: return null;
        }
    };

    const groups = ['Fee Management', 'Payroll', 'Expenses', 'System'];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* ── Top Header Bar ── */}
            <header className="sticky top-0 z-40 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-700 shadow-xl shadow-purple-300/30">
                <div className="flex items-center justify-between px-4 md:px-8 py-3 md:py-4">
                    {/* Left: hamburger (mobile) + logo + title (clickable → home) */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(s => !s)}
                            className="md:hidden w-9 h-9 flex items-center justify-center bg-white/10 rounded-xl text-white border border-white/20"
                        >
                            <i className={`fas ${sidebarOpen ? 'fa-times' : 'fa-bars'} text-sm`}></i>
                        </button>
                        <button
                            onClick={() => { setView('overview'); setSidebarOpen(false); }}
                            className="flex items-center gap-3 group"
                            title="Go to Overview"
                        >
                            {logoPreview ? (
                                <img src={logoPreview} alt="Logo" className="w-9 h-9 md:w-11 md:h-11 rounded-xl object-cover border-2 border-white/30 flex-shrink-0 group-hover:border-white/60 transition-all" />
                            ) : (
                                <div className="w-9 h-9 md:w-11 md:h-11 bg-white/20 group-hover:bg-white/30 rounded-xl flex items-center justify-center flex-shrink-0 transition-all">
                                    <i className="fas fa-calculator text-white text-base"></i>
                                </div>
                            )}
                            <div>
                                <div className="mt-1 transition-transform hover:scale-105 active:scale-95" title={isSubLoading ? 'Verifying...' : (isSubscribed ? (subscription?.status === 'trial' ? 'Trial Mode' : 'Account Active') : 'Inactive Plan')}>
                                    <SubscriptionStatusIndicator isSubscribed={isSubscribed} isLoading={isSubLoading} />
                                </div>
                                <p className="text-white font-black text-sm md:text-base leading-tight group-hover:text-white/80 transition-colors">
                                    {user?.fullName?.split(' ')[0] || 'Accountant'}
                                    <span className="hidden md:inline text-white/60 font-medium text-xs ml-2">— {currentLabel}</span>
                                </p>
                            </div>
                        </button>
                    </div>
                    {/* Right: Sync + Notifications + Logout */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleManualSync}
                            disabled={isSyncing}
                            className="w-9 h-9 md:w-11 md:h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-white border border-white/20 disabled:opacity-50 transition-all"
                            title="Force Sync"
                        >
                            <i className={`fas fa-sync-alt text-sm ${isSyncing ? 'animate-spin' : ''}`}></i>
                        </button>
                        <button
                            onClick={() => setShowHelp(true)}
                            className="w-9 h-9 md:w-11 md:h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-white border border-white/20 transition-all active:scale-90 flex-shrink-0"
                            title="Help & Support"
                        >
                            <i className="fas fa-question text-sm md:text-base"></i>
                        </button>
                        <NotificationBell />
                        <button
                            onClick={logout}
                            className="btn-danger flex items-center gap-2 px-3 md:px-5 py-2"
                        >
                            <i className="fas fa-sign-out-alt"></i>
                            <span className="hidden md:inline">Log Out</span>
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* ── Sidebar ── */}
                <aside className={`
                    hidden md:flex fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-100
                    flex-col pt-24 md:pt-0 transition-transform duration-300
                `}>
                    <div className="p-4 md:p-6 flex-1 overflow-y-auto space-y-1">
                        {/* Overview */}
                        <button
                            onClick={() => { setView('overview'); setSidebarOpen(false); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${view === 'overview' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'text-gray-500 hover:bg-gray-50 hover:text-purple-600'}`}
                        >
                            <i className="fas fa-home w-4 text-center"></i> Overview
                        </button>

                        {/* Grouped Nav */}
                        {groups.map(group => (
                            <div key={group} className="pt-4">
                                <p className="px-4 text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">{group}</p>
                                {nav.filter(n => n.group === group).map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => { setView(item.id as View); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${view === item.id ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'text-gray-500 hover:bg-gray-50 hover:text-purple-600'}`}
                                    >
                                        <i className={`fas ${item.icon} w-4 text-center`}></i> {item.label}
                                    </button>
                                ))}
                            </div>
                        ))}

                        {/* Reports */}
                        <div className="pt-4">
                            <p className="px-4 text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Reports</p>
                            <button
                                onClick={() => { setView('reports'); setSidebarOpen(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${view === 'reports' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'text-gray-500 hover:bg-gray-50 hover:text-purple-600'}`}
                            >
                                <i className="fas fa-chart-bar w-4 text-center"></i> Financial Reports
                            </button>
                        </div>

                        {/* Settings */}
                        <div className="pt-4 border-t border-gray-100 mt-4">
                            <button
                                onClick={() => { setView('settings'); setSidebarOpen(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all ${view === 'settings' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'text-gray-500 hover:bg-gray-50 hover:text-purple-600'}`}
                            >
                                <i className="fas fa-cog w-4 text-center"></i> Settings
                            </button>
                        </div>
                    </div>
                </aside>


                {/* ── Main Content ── */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
                    <div className="max-w-6xl mx-auto animate-fadeIn">
                        {renderView()}
                    </div>
                </main>
            </div>

            {/* ── Mobile Fixed Bottom Navigation Bar ── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-gray-100 z-50 shadow-[0_-8px_30px_rgb(0,0,0,0.12)]">
                <div className="flex items-center justify-around px-2">
                    {(() => {
                        const primaryTabs = ['overview', 'fees-students', 'payroll', 'expenses'] as const;
                        const moreTabs = ['fees-structure', 'payroll-history', 'reports', 'settings', 'subscription'] as const;
                        const isMoreActive = moreTabs.includes(view as any);

                        return (
                            <>
                                {primaryTabs.map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => { setView(tab); setSidebarOpen(false); setShowMoreNav(false); }}
                                        className={`relative flex-1 flex flex-col items-center pt-3 pb-4 gap-1 transition-all active:scale-95 ${view === tab ? 'text-purple-600' : 'text-gray-400'}`}
                                    >
                                        {view === tab && (
                                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-purple-600 rounded-b-full shadow-[0_2px_10px_rgba(147,51,234,0.5)] animate-slideDown"></span>
                                        )}
                                        <i className={`fas ${tabIcons[tab]} text-xl transition-colors ${view === tab ? 'scale-110' : ''}`}></i>
                                        <span className="text-[9px] font-black uppercase tracking-tight leading-none">
                                            {tabLabels[tab]}
                                        </span>
                                    </button>
                                ))}

                                <button
                                    onClick={() => setShowMoreNav(!showMoreNav)}
                                    className={`relative flex-1 flex flex-col items-center pt-3 pb-4 gap-1 transition-all active:scale-95 ${isMoreActive || showMoreNav ? 'text-purple-600' : 'text-gray-400'}`}
                                >
                                    {(isMoreActive || showMoreNav) && (
                                        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-purple-600 rounded-b-full shadow-[0_2px_10px_rgba(147,51,234,0.5)] animate-slideDown"></span>
                                    )}
                                    <div className={`w-6 h-6 flex items-center justify-center transition-transform duration-300 ${showMoreNav ? 'rotate-90' : ''}`}>
                                        <i className={`fas ${showMoreNav ? 'fa-times' : 'fa-th-large'} text-xl`}></i>
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-tight leading-none">{showMoreNav ? 'Close' : 'Menu'}</span>
                                </button>

                                {/* More Overlay for Accountant */}
                                {showMoreNav && (
                                    <div className="absolute bottom-full left-0 right-0 p-4 animate-in slide-in-from-bottom duration-300">
                                        <div className="bg-white/95 backdrop-blur-xl rounded-[2.5rem] border border-white/20 shadow-[0_-20px_50px_rgba(0,0,0,0.15)] overflow-hidden max-h-[70vh] flex flex-col">
                                            <div className="p-6 border-b border-gray-100/50 bg-gray-50/50 flex items-center justify-between">
                                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest flex items-center gap-2">
                                                    <i className="fas fa-calculator text-purple-600"></i>
                                                    Accountant Menu
                                                </h3>
                                                <div className="px-3 py-1 bg-purple-100 rounded-full">
                                                    <span className="text-[9px] font-black text-purple-600 uppercase tracking-tighter">Finance Hub</span>
                                                </div>
                                            </div>
                                            <div className="p-4 overflow-y-auto grid grid-cols-3 gap-3">
                                                {moreTabs.map((tab) => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => { setView(tab); setShowMoreNav(false); }}
                                                        className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all active:scale-95 gap-3 border ${view === tab 
                                                            ? 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-200' 
                                                            : 'bg-gray-50/50 text-gray-500 border-gray-100 hover:bg-gray-100'}`}
                                                    >
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${view === tab ? 'bg-white/20' : 'bg-white shadow-sm text-gray-400'}`}>
                                                            <i className={`fas ${tabIcons[tab]}`}></i>
                                                        </div>
                                                        <span className="text-[9px] font-bold text-center leading-tight uppercase tracking-tight">{tabLabels[tab]}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="p-4 bg-gray-50/80 border-t border-gray-100/50">
                                                <p className="text-[8px] text-center text-gray-400 font-black uppercase tracking-[0.2em]">
                                                    Labour Edu System • Accountant Terminal
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

            {showHelp && <ContactModal onClose={() => setShowHelp(false)} />}
        </div>
    );
};

export default AccountantDashboard;
