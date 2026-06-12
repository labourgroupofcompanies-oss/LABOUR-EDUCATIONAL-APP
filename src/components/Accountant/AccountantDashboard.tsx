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
        { id: 'overview', label: 'Home Dashboard', desc: 'Main summary of school money', icon: 'fa-home', group: null },
        { id: 'fees-structure', label: '1. Set School Fees', desc: 'Configure fee amounts for classes', icon: 'fa-list-alt', group: 'Fee Management' },
        { id: 'fees-students', label: '2. Collect Fees', desc: 'Record payments, print receipts', icon: 'fa-users', group: 'Fee Management' },
        { id: 'expenses', label: '3. School Expenses', desc: 'Record school buying & spending', icon: 'fa-receipt', group: 'Expenses' },
        { id: 'payroll', label: '4. Pay Salaries', desc: 'Pay monthly salaries to teachers', icon: 'fa-money-bill-wave', group: 'Payroll' },
        { id: 'payroll-history', label: '5. Salary History', desc: 'View past pay slips & totals', icon: 'fa-history', group: 'Payroll' },
        { id: 'reports', label: '6. Money Reports', desc: 'Total income, expenses & ledgers', icon: 'fa-chart-bar', group: 'Reports' },
        { id: 'subscription', label: 'Subscription Plan', desc: 'Renew or manage school license', icon: 'fa-credit-card', group: 'System' },
        { id: 'settings', label: 'Settings & Profile', desc: 'Update details and password', icon: 'fa-cog', group: null },
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
        'fees-structure': 'Set Fees',
        'fees-students': 'Collect',
        'payroll': 'Pay Staff',
        'payroll-history': 'Pay History',
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

    const groups = ['Fee Management', 'Expenses', 'Payroll', 'Reports', 'System'];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* ── Top Header Bar ── */}
            <header className="sticky top-0 z-40 bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 shadow-xl shadow-teal-900/10 border-b border-teal-850">
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
                    hidden md:flex fixed md:static inset-y-0 left-0 z-30 w-72 bg-gradient-to-b from-teal-800 via-teal-900 to-emerald-950 border-r border-teal-900/40
                    flex-col pt-24 md:pt-0 transition-transform duration-300
                `}>
                    <div className="py-6 pl-6 pr-0 flex-1 overflow-y-auto space-y-2.5">
                        {/* Overview */}
                        <button
                            onClick={() => { setView('overview'); setSidebarOpen(false); }}
                            className={`w-full flex items-start gap-3.5 px-4 py-3 transition-all duration-200 group relative ${view === 'overview' ? 'bg-gray-50 text-teal-800 rounded-l-2xl rounded-r-none mr-0 -mr-[2px] relative z-10 shadow-sm before:absolute before:right-0 before:-top-4 before:w-4 before:h-4 before:rounded-br-2xl before:shadow-[4px_4px_0_0_#f9fafb] before:pointer-events-none after:absolute after:right-0 after:-bottom-4 after:w-4 after:h-4 after:rounded-tr-2xl after:shadow-[4px_-4px_0_0_#f9fafb] after:pointer-events-none' : 'text-teal-100/90 hover:bg-white/10 hover:text-white rounded-xl mr-6'}`}
                        >
                            {view === 'overview' && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-teal-600 rounded-r-full"></span>
                            )}
                            <div className={`flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 group-hover:scale-105 transition-transform ${view === 'overview' ? 'bg-teal-50 text-teal-700 shadow-sm' : 'bg-white/10 text-teal-250 group-hover:text-white'}`}>
                                <i className="fas fa-home text-sm"></i>
                            </div>
                            <div className="text-left flex-1 min-w-0">
                                <p className={`font-black text-[12px] uppercase tracking-wide leading-tight ${view === 'overview' ? 'text-teal-950' : 'text-white'}`}>Home Dashboard</p>
                                <p className={`text-[9.5px] font-semibold leading-normal truncate mt-0.5 ${view === 'overview' ? 'text-teal-600/85' : 'text-teal-200/60'}`}>Main summary of school money</p>
                            </div>
                        </button>

                        {/* Grouped Nav */}
                        {groups.map(group => (
                            <div key={group} className="pt-4 space-y-1">
                                <p className="px-4 text-[9px] font-black text-teal-200/50 uppercase tracking-[0.2em] flex items-center gap-2 mb-2 mr-6">
                                    <span>{group}</span>
                                    <span className="flex-1 h-px bg-teal-500/20"></span>
                                </p>
                                {nav.filter(n => n.group === group).map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => { setView(item.id as View); setSidebarOpen(false); }}
                                        className={`w-full flex items-start gap-3.5 px-4 py-2.5 transition-all duration-200 group relative ${view === item.id ? 'bg-gray-50 text-teal-800 rounded-l-2xl rounded-r-none mr-0 -mr-[2px] relative z-10 shadow-sm before:absolute before:right-0 before:-top-4 before:w-4 before:h-4 before:rounded-br-2xl before:shadow-[4px_4px_0_0_#f9fafb] before:pointer-events-none after:absolute after:right-0 after:-bottom-4 after:w-4 after:h-4 after:rounded-tr-2xl after:shadow-[4px_-4px_0_0_#f9fafb] after:pointer-events-none' : 'text-teal-100/90 hover:bg-white/10 hover:text-white rounded-xl mr-6'}`}
                                    >
                                        {view === item.id && (
                                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-teal-600 rounded-r-full"></span>
                                        )}
                                        <div className={`flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 group-hover:scale-105 transition-transform ${view === item.id ? 'bg-teal-50 text-teal-700 shadow-sm' : 'bg-white/10 text-teal-250 group-hover:text-white'}`}>
                                            <i className={`fas ${item.icon} text-sm`}></i>
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <p className={`font-black text-[12px] uppercase tracking-wide leading-tight ${view === item.id ? 'text-teal-950' : 'text-white'}`}>{item.label}</p>
                                            <p className={`text-[9.5px] font-semibold leading-normal truncate mt-0.5 ${view === item.id ? 'text-teal-600/85' : 'text-teal-200/60'}`}>{item.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ))}

                        {/* Settings */}
                        <div className="pt-4 border-t border-teal-500/20 mt-5 mr-6"></div>
                        <button
                            onClick={() => { setView('settings'); setSidebarOpen(false); }}
                            className={`w-full flex items-start gap-3.5 px-4 py-2.5 transition-all duration-200 group relative ${view === 'settings' ? 'bg-gray-50 text-teal-800 rounded-l-2xl rounded-r-none mr-0 -mr-[2px] relative z-10 shadow-sm before:absolute before:right-0 before:-top-4 before:w-4 before:h-4 before:rounded-br-2xl before:shadow-[4px_4px_0_0_#f9fafb] before:pointer-events-none after:absolute after:right-0 after:-bottom-4 after:w-4 after:h-4 after:rounded-tr-2xl after:shadow-[4px_-4px_0_0_#f9fafb] after:pointer-events-none' : 'text-teal-100/90 hover:bg-white/10 hover:text-white rounded-xl mr-6'}`}
                        >
                            {view === 'settings' && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-teal-600 rounded-r-full"></span>
                            )}
                            <div className={`flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 group-hover:scale-105 transition-transform ${view === 'settings' ? 'bg-teal-50 text-teal-700 shadow-sm' : 'bg-white/10 text-teal-250 group-hover:text-white'}`}>
                                <i className="fas fa-cog text-sm"></i>
                            </div>
                            <div className="text-left flex-1 min-w-0">
                                <p className={`font-black text-[12px] uppercase tracking-wide leading-tight ${view === 'settings' ? 'text-teal-950' : 'text-white'}`}>Settings & Profile</p>
                                <p className={`text-[9.5px] font-semibold leading-normal truncate mt-0.5 ${view === 'settings' ? 'text-teal-600/85' : 'text-teal-200/60'}`}>Update details and password</p>
                            </div>
                        </button>
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
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gradient-to-r from-teal-800 via-teal-900 to-emerald-950 border-t border-teal-900/60 z-50 shadow-[0_-8px_30px_rgba(4,47,46,0.35)]">
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
                                        className={`relative flex-1 flex flex-col items-center pt-3 pb-4 gap-1 transition-all active:scale-95 ${view === tab ? 'text-white' : 'text-teal-200/60 hover:text-white'}`}
                                    >
                                        {view === tab && (
                                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-teal-400 rounded-b-full shadow-[0_2px_10px_rgba(20,184,166,0.4)] animate-slideDown"></span>
                                        )}
                                        <i className={`fas ${tabIcons[tab]} text-xl transition-all ${view === tab ? 'scale-110 text-white' : 'text-teal-200/60'}`}></i>
                                        <span className="text-[9px] font-black uppercase tracking-tight leading-none">
                                            {tabLabels[tab]}
                                        </span>
                                    </button>
                                ))}

                                <button
                                    onClick={() => setShowMoreNav(!showMoreNav)}
                                    className={`relative flex-1 flex flex-col items-center pt-3 pb-4 gap-1 transition-all active:scale-95 ${isMoreActive || showMoreNav ? 'text-white font-bold' : 'text-teal-200/60 hover:text-white'}`}
                                >
                                    {(isMoreActive || showMoreNav) && (
                                        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-teal-400 rounded-b-full shadow-[0_2px_10px_rgba(20,184,166,0.4)] animate-slideDown"></span>
                                    )}
                                    <div className={`w-6 h-6 flex items-center justify-center transition-transform duration-300 ${showMoreNav ? 'rotate-90' : ''}`}>
                                        <i className={`fas ${showMoreNav ? 'fa-times' : 'fa-th-large'} text-xl ${isMoreActive || showMoreNav ? 'text-white' : 'text-teal-200/60'}`}></i>
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-tight leading-none">{showMoreNav ? 'Close' : 'Menu'}</span>
                                </button>

                                {/* More Overlay for Accountant */}
                                {showMoreNav && (
                                    <div className="absolute bottom-full left-0 right-0 p-4 animate-in slide-in-from-bottom duration-300">
                                        <div className="bg-gradient-to-br from-teal-800 via-teal-900 to-emerald-950 rounded-[2.5rem] border border-teal-900/60 shadow-[0_-20px_50px_rgba(0,0,0,0.3)] overflow-hidden max-h-[70vh] flex flex-col">
                                            <div className="p-6 border-b border-teal-900/40 bg-teal-950/30 flex items-center justify-between">
                                                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                                    <i className="fas fa-calculator text-teal-300"></i>
                                                    Accountant Menu
                                                </h3>
                                                <div className="px-3 py-1 bg-white/10 border border-white/10 rounded-full">
                                                    <span className="text-[9px] font-black text-teal-200 uppercase tracking-tighter">Finance Hub</span>
                                                </div>
                                            </div>
                                            <div className="p-4 overflow-y-auto grid grid-cols-3 gap-3">
                                                {moreTabs.map((tab) => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => { setView(tab); setShowMoreNav(false); }}
                                                        className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all active:scale-95 gap-3 border ${view === tab 
                                                            ? 'bg-white text-teal-950 border-white shadow-lg shadow-teal-950/40' 
                                                            : 'bg-white/5 text-teal-100/80 border-white/5 hover:bg-white/10 hover:text-white'}`}
                                                    >
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${view === tab ? 'bg-teal-50 text-teal-800 shadow-sm' : 'bg-white/10 text-teal-200 group-hover:text-white'}`}>
                                                            <i className={`fas ${tabIcons[tab]}`}></i>
                                                        </div>
                                                        <span className={`text-[9px] font-black text-center leading-tight uppercase tracking-tight ${view === tab ? 'text-teal-950' : 'text-teal-100'}`}>{tabLabels[tab]}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="p-4 bg-teal-950/40 border-t border-white/5">
                                                <p className="text-[8px] text-center text-teal-300/40 font-black uppercase tracking-[0.2em]">
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

