import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';
import { showToast } from '../Common/Toast';
import { useAuth } from '../../hooks/useAuth';
import SchoolRegistry from './SchoolRegistry';
import SystemHealth from './SystemHealth';
import RecoveryTools from './RecoveryTools';
import AnnouncementManager from './AnnouncementManager';
import SubscriptionManager from './SubscriptionManager';
import SchoolInvites from './SchoolInvites';
import FAQManager from './FAQManager';
import RatingsManager from './RatingsManager';
import EnquiryManager from './EnquiryManager';
import LeadManager from './LeadManager';
import DeveloperOverview from './DeveloperOverview';
import SchoolNotificationTool from './SchoolNotificationTool';

const DeveloperPortal: React.FC = () => {
    const { user, logout } = useAuth();

    const [view, setView] = useState<'overview' | 'schools' | 'health' | 'recovery' | 'announcements' | 'dispatch' | 'subscriptions' | 'security' | 'invites' | 'faqs' | 'ratings' | 'enquiries' | 'leads'>('overview');
    const [unreadEnquiries, setUnreadEnquiries] = useState(0);
    const [unreadLeads, setUnreadLeads] = useState(0);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Security states
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    const menuItems = [
        { id: 'overview', label: 'Dashboard', icon: 'fa-th-large', category: 'Main' },
        
        { id: 'schools', label: 'School Registry', icon: 'fa-university', category: 'Institutions' },
        { id: 'invites', label: 'Onboarding Invites', icon: 'fa-ticket', category: 'Institutions' },
        { id: 'subscriptions', label: 'Subscriptions', icon: 'fa-crown', category: 'Institutions' },
        
        { id: 'leads', label: 'Get Started Leads', icon: 'fa-users-gear', category: 'CRM & Marketing' },
        { id: 'enquiries', label: 'Customer Enquiries', icon: 'fa-headset', category: 'CRM & Marketing' },
        { id: 'faqs', label: 'Global FAQs', icon: 'fa-question-circle', category: 'CRM & Marketing' },
        { id: 'ratings', label: 'User Ratings', icon: 'fa-star', category: 'CRM & Marketing' },
        
        { id: 'announcements', label: 'System Broadcast', icon: 'fa-bullhorn', category: 'Communications' },
        { id: 'dispatch', label: 'Direct Dispatch', icon: 'fa-paper-plane', category: 'Communications' },
        
        { id: 'health', label: 'System Health', icon: 'fa-heartbeat', category: 'System' },
        { id: 'recovery', label: 'Recovery Tools', icon: 'fa-key', category: 'System' },
        { id: 'security', label: 'Admin Security', icon: 'fa-shield-halved', category: 'System' },
    ] as const;

    const categories = ['Main', 'Institutions', 'CRM & Marketing', 'Communications', 'System'];

    const fetchUnreadEnquiries = async () => {
        try {
            const { count, error } = await supabase
                .from('customer_enquiries')
                .select('*', { count: 'exact', head: true })
                .eq('is_read', false);
            
            if (!error) setUnreadEnquiries(count || 0);
        } catch (err) {
            console.error('Failed to fetch unread enquiry count:', err);
        }
    };

    const fetchUnreadLeads = async () => {
        try {
            const { count, error } = await supabase
                .from('get_started_leads')
                .select('*', { count: 'exact', head: true })
                .eq('is_read', false);
            
            if (!error) setUnreadLeads(count || 0);
        } catch (err) {
            console.error('Failed to fetch unread lead count:', err);
        }
    };

    React.useEffect(() => {
        fetchUnreadEnquiries();
        fetchUnreadLeads();
        const interval = setInterval(() => {
            fetchUnreadEnquiries();
            fetchUnreadLeads();
        }, 60000); // Check every minute
        return () => clearInterval(interval);
    }, []);

    const handlePasswordChange = async () => {
        if (!user?.id) return;
        if (!currentPw || !newPw || !confirmPw) { showToast('Fill in all fields', 'error'); return; }
        if (newPw !== confirmPw) { showToast('Passwords do not match', 'error'); return; }
        if (newPw.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

        setIsUpdating(true);
        try {
            const dbUser = await db.users.where('idCloud').equals(user.id).first();
            if (!dbUser || !dbUser.id) { showToast('Account not found', 'error'); return; }

            const { hashPassword } = await import('../../utils/auth');
            const hashedCurrent = await hashPassword(currentPw);
            if (hashedCurrent !== dbUser.password) { showToast('Current password is incorrect', 'error'); return; }

            // 1. Update Supabase
            const { error: authError } = await supabase.auth.updateUser({ password: newPw });
            if (authError) {
                showToast(`Cloud update failed: ${authError.message}`, 'error');
                return;
            }

            // 2. Update local
            const hashedNew = await hashPassword(newPw);
            await db.users.update(dbUser.id, { password: hashedNew });

            showToast('Developer password updated successfully', 'success');
            setCurrentPw(''); setNewPw(''); setConfirmPw('');
        } catch (err) {
            console.error(err);
            showToast('Failed to update password', 'error');
        } finally {
            setIsUpdating(false);
        }
    };

    const SidebarContent = () => (
        <>
            <div className="flex items-center gap-4 mb-10 px-2 group cursor-pointer">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xl shadow-black/20 p-2 overflow-hidden border border-white/20 group-hover:scale-105 transition-transform">
                    <img src="/images/labour_logo.png" alt="Labour Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                    <h1 className="text-white font-black tracking-tighter leading-none text-xl">LABOUR <span className="text-blue-500">EDU</span> APP</h1>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1 shadow-sm">Global System Admin</p>
                </div>
            </div>

            <nav className="flex-1 space-y-8 overflow-y-auto pr-2 custom-nav-scrollbar py-4">
                {categories.map((cat) => (
                    <div key={cat} className="space-y-1">
                        <h3 className="px-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.25em] mb-2">{cat}</h3>
                        <div className="space-y-1">
                            {menuItems.filter(item => item.category === cat).map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        setView(item.id);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all group ${view === item.id 
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                                        : 'hover:bg-white/5 text-slate-500 hover:text-slate-300'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <i className={`fas ${item.icon} w-5 text-center text-xs ${view === item.id ? 'text-white' : 'text-slate-600 group-hover:text-blue-500'} transition-colors`}></i>
                                        <span className="text-xs font-bold tracking-tight">{item.label}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5">
                                        {item.id === 'enquiries' && unreadEnquiries > 0 && (
                                            <span className="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-black">
                                                {unreadEnquiries}
                                            </span>
                                        )}
                                        {item.id === 'leads' && unreadLeads > 0 && (
                                            <span className="bg-blue-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-black">
                                                {unreadLeads}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            <style>{`
                .custom-nav-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-nav-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-nav-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-nav-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); }
            `}</style>

            <div className="pt-6 border-t border-slate-800 space-y-4">
                <div className="px-4">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 text-center">Logged in as</p>
                    <p className="text-white font-black text-sm truncate text-center">{user?.fullName}</p>
                </div>
                <button
                    onClick={logout}
                    className="w-full py-3 bg-slate-800 hover:bg-red-500/10 hover:text-red-500 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                    <i className="fas fa-sign-out-alt"></i>
                    Sign Out
                </button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
            {/* Mobile Header */}
            <header className="lg:hidden bg-slate-900 px-6 py-4 flex items-center justify-between sticky top-0 z-[60] shadow-xl">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1.5 shadow-lg">
                        <img src="/images/labour_logo.png" alt="Labour Logo" className="w-full h-full object-contain" />
                    </div>
                    <span className="text-white font-black text-sm tracking-tighter uppercase">LABOUR <span className="text-blue-500 text-base">EDU</span> APP</span>
                </div>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-white transition-all"
                >
                    <i className={`fas ${isMobileMenuOpen ? 'fa-times' : 'fa-bars'} text-xl`}></i>
                </button>
            </header>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] lg:hidden animate-fadeIn"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Mobile Drawer Sidebar */}
            <aside className={`fixed inset-y-0 left-0 w-72 bg-slate-900 text-slate-300 flex flex-col p-8 z-[80] shadow-2xl transition-transform duration-300 lg:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <SidebarContent />
            </aside>

            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-300 flex flex-col p-6 shadow-2xl sticky top-0 h-screen">
                <SidebarContent />
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto px-6 py-8 lg:p-10">
                <header className="mb-8 lg:mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                        <h2 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight">
                            {view === 'schools' && 'School Registry'}
                            {view === 'invites' && 'School Invites'}
                            {view === 'announcements' && 'Global Announcements'}
                            {view === 'faqs' && 'Frequently Asked Questions'}
                            {view === 'ratings' && 'User Ratings & Stories'}
                            {view === 'enquiries' && 'Customer Enquiries'}
                            {view === 'leads' && 'Get Started Leads'}
                            {view === 'dispatch' && 'Direct School Dispatch'}
                            {view === 'health' && 'System Health'}
                            {view === 'recovery' && 'Recovery Tools'}
                            {view === 'subscriptions' && 'Subscriptions'}
                            {view === 'security' && 'System Security'}
                        </h2>
                        <p className="text-slate-400 font-medium mt-1 text-sm lg:text-base">
                            {view === 'schools' && 'Monitor and manage all onboarded educational institutions.'}
                            {view === 'invites' && 'Generate secure single-use links for onboarding new schools.'}
                            {view === 'announcements' && 'Broadcast important updates to all school administrators.'}
                            {view === 'faqs' && 'Manage system-wide FAQs for the platform and marketing site.'}
                            {view === 'ratings' && 'Monitor user sentiment and curate testimonials for marketing.'}
                            {view === 'enquiries' && 'Manage leads and enquiries from the marketing landing page.'}
                            {view === 'leads' && 'Review potential customers from the get-started form.'}
                            {view === 'dispatch' && 'Send private notifications and administrative alerts to specific school staff.'}
                            {view === 'health' && 'Global database performance and sync status overview.'}
                            {view === 'recovery' && 'Administrative overrides and account recovery operations.'}
                            {view === 'subscriptions' && 'Review MoMo payment references and activate school subscriptions.'}
                            {view === 'security' && 'Manage your master administrative credentials.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl shadow-sm border border-slate-100">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest whitespace-nowrap">Global Backend Live</span>
                    </div>
                </header>

                <div className="animate-fadeIn">
                    {view === 'overview' && <DeveloperOverview onNavigate={(v: any) => setView(v)} />}
                    {view === 'schools' && <SchoolRegistry />}
                    {view === 'invites' && <SchoolInvites />}
                    {view === 'announcements' && <AnnouncementManager />}
                    {view === 'dispatch' && <SchoolNotificationTool />}
                    {view === 'faqs' && <FAQManager />}
                    {view === 'ratings' && <RatingsManager />}
                    {view === 'enquiries' && <EnquiryManager onRefreshCount={fetchUnreadEnquiries} />}
                    {view === 'leads' && <LeadManager onRefreshCount={fetchUnreadLeads} />}
                    {view === 'health' && <SystemHealth />}
                    {view === 'recovery' && <RecoveryTools />}
                    {view === 'subscriptions' && <SubscriptionManager />}
                    {view === 'security' && (
                        <div className="max-w-xl space-y-8">
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <i className="fas fa-key text-blue-500"></i>
                                    Update Admin Password
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Current Master Password</label>
                                        <input
                                            type="password"
                                            value={currentPw}
                                            onChange={e => setCurrentPw(e.target.value)}
                                            className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700 transition-all"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">New Password</label>
                                        <input
                                            type="password"
                                            value={newPw}
                                            onChange={e => setNewPw(e.target.value)}
                                            className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700 transition-all"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-1.5">Confirm New Password</label>
                                        <input
                                            type="password"
                                            value={confirmPw}
                                            onChange={e => setConfirmPw(e.target.value)}
                                            className="w-full px-5 py-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-blue-500 outline-none font-bold text-slate-700 transition-all"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handlePasswordChange}
                                    disabled={isUpdating}
                                    className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {isUpdating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>}
                                    {isUpdating ? 'Sealing Cloud Identity...' : 'Confirm Identity Update'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default DeveloperPortal;
