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
                            className="flex items-center gap-2 bg-white/10 hover:bg-red-500/80 border border-white/20 text-white px-3 md:px-5 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
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
                    fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-100 shadow-xl md:shadow-none
                    flex flex-col pt-24 md:pt-0 transition-transform duration-300
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
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

                {/* Sidebar overlay (mobile) */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/40 z-20 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* ── Main Content ── */}
                <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
                    <div className="max-w-6xl mx-auto animate-fadeIn">
                        {renderView()}
                    </div>
                </main>
            </div>

            {/* ── Mobile Fixed Bottom Navigation Bar ── */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-around">
                    {(['overview', 'subscription', 'fees-students', 'payroll', 'expenses', 'reports', 'settings'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => { setView(tab); setSidebarOpen(false); }}
                            className={`relative flex-1 flex flex-col items-center pt-2 pb-3 gap-1 transition-all active:scale-95 ${view === tab ? 'text-purple-600' : 'text-gray-400'
                                }`}
                        >
                            {view === tab && (
                                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-purple-600 rounded-full"></span>
                            )}
                            <i className={`fas ${tabIcons[tab]} text-xl transition-colors`}></i>
                            <span className={`text-[8px] font-black uppercase tracking-tight leading-none ${view === tab ? 'text-purple-600' : 'text-gray-400'
                                }`}>
                                {tabLabels[tab]}
                            </span>
                        </button>
                    ))}
                </div>
            </nav>

            {showHelp && <ContactModal onClose={() => setShowHelp(false)} />}
        </div>
    );
};

export default AccountantDashboard;
