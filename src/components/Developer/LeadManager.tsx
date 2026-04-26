import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showToast } from '../Common/Toast';
import { showConfirm } from '../Common/ConfirmDialog';

interface Lead {
    id: string;
    created_at: string;
    full_name: string;
    position: string;
    active_contact: string;
    whatsapp_contact?: string;
    email_address: string;
    heard_about_us: string;
    referee_number?: string;
    is_read: boolean;
}

interface LeadManagerProps {
    onRefreshCount?: () => void;
}

const LeadManager: React.FC<LeadManagerProps> = ({ onRefreshCount }) => {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [fetching, setFetching] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

    useEffect(() => {
        fetchLeads();
    }, []);

    const fetchLeads = async () => {
        setFetching(true);
        try {
            console.log('Fetching leads from get_started_leads...');
            const { data, error } = await supabase
                .from('get_started_leads')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase error fetching leads:', error);
                throw error;
            }
            console.log('Leads fetched successfully:', data);
            setLeads(data || []);
        } catch (err) {
            console.error('Failed to fetch leads:', err);
            showToast('Failed to load leads', 'error');
        } finally {
            setFetching(false);
        }
    };

    const handleSelectLead = (lead: Lead) => {
        setSelectedLead(lead);
        if (!lead.is_read) {
            markAsRead(lead.id);
        }
    };

    const markAsRead = async (id: string) => {
        try {
            const { error } = await supabase
                .from('get_started_leads')
                .update({ is_read: true })
                .eq('id', id);

            if (error) throw error;

            setLeads(prev => prev.map(l => l.id === id ? { ...l, is_read: true } : l));
            if (onRefreshCount) onRefreshCount();
        } catch (err) {
            console.error('Failed to mark lead as read:', err);
        }
    };

    const deleteLead = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'Delete Lead',
            message: 'Are you sure you want to permanently delete this lead? This action cannot be undone.',
            confirmText: 'Delete Permanently',
            variant: 'danger'
        });
        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('get_started_leads')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showToast('Lead deleted successfully', 'success');
            setLeads(prev => prev.filter(l => l.id !== id));
            if (selectedLead?.id === id) setSelectedLead(null);
        } catch (err) {
            console.error('Failed to delete lead:', err);
            showToast('Delete failed', 'error');
        }
    };

    const filteredLeads = leads.filter(l => {
        const matchesSearch = 
            l.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.email_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.active_contact.includes(searchTerm);
        
        return matchesSearch;
    });

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Stats & Search */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex flex-col justify-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Leads</p>
                    <div className="flex items-center gap-3">
                        <span className="text-4xl font-black text-slate-800">{leads.length}</span>
                        <span className="px-2 py-1 bg-green-100 text-green-600 text-[10px] font-black rounded-lg">POTENTIALS</span>
                    </div>
                </div>

                <div className="lg:col-span-3 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-slate-200">
                        <i className="fas fa-search"></i>
                    </div>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search by name, email, position or contact..."
                        className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 placeholder:text-slate-300 text-lg"
                    />
                </div>
            </div>

            {/* Main Content: Two Columns */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
                {/* List Column */}
                <div className="xl:col-span-2 space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    {fetching ? (
                        [1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-24 bg-white rounded-3xl animate-pulse"></div>
                        ))
                    ) : filteredLeads.length === 0 ? (
                        <div className="py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100">
                            <i className="fas fa-users-slash text-4xl text-slate-100 mb-4"></i>
                            <p className="text-slate-300 font-black uppercase tracking-widest text-sm">No leads found</p>
                        </div>
                    ) : (
                        filteredLeads.map(lead => (
                            <div 
                                key={lead.id}
                                onClick={() => handleSelectLead(lead)}
                                className={`group p-5 rounded-3xl border transition-all cursor-pointer relative overflow-hidden ${selectedLead?.id === lead.id ? 'bg-blue-50 border-blue-200 shadow-lg' : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'}`}
                            >
                                {!lead.is_read && (
                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                                )}
                                <div className="flex justify-between items-start mb-2">
                                    <h5 className={`font-black text-sm truncate pr-4 ${lead.is_read ? 'text-slate-600' : 'text-slate-900'}`}>{lead.full_name}</h5>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">{new Date(lead.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate mb-2">{lead.position}</p>
                                <p className="text-xs text-slate-500 line-clamp-1 leading-relaxed italic">
                                    "{lead.heard_about_us}"
                                </p>
                            </div>
                        ))
                    )}
                </div>

                {/* Detail Column */}
                <div className="xl:col-span-3">
                    {selectedLead ? (
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden animate-slideInRight h-full flex flex-col">
                            {/* Detail Header */}
                            <div className="p-8 border-b border-slate-50 bg-gradient-to-r from-slate-50 to-white">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-xl">
                                            {selectedLead.full_name[0]}
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedLead.full_name}</h3>
                                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{selectedLead.position}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => deleteLead(selectedLead.id)}
                                            className="w-10 h-10 bg-red-50 text-red-400 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                            title="Delete Lead"
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                                            <i className="fas fa-at"></i>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                                            <p className="font-bold text-slate-700">{selectedLead.email_address}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                                            <i className="fas fa-phone"></i>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Contact</p>
                                            <p className="font-bold text-slate-700">{selectedLead.active_contact}</p>
                                        </div>
                                    </div>
                                    {selectedLead.whatsapp_contact && (
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-500">
                                                <i className="fab fa-whatsapp"></i>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">WhatsApp</p>
                                                <p className="font-bold text-slate-700">{selectedLead.whatsapp_contact}</p>
                                            </div>
                                        </div>
                                    )}
                                    {selectedLead.referee_number && (
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
                                                <i className="fas fa-user-friends"></i>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Referred By</p>
                                                <p className="font-bold text-slate-700">{selectedLead.referee_number}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Info Content */}
                            <div className="p-10 flex-1 bg-white relative">
                                <i className="fas fa-info-circle absolute top-8 left-8 text-slate-50 text-6xl -z-0"></i>
                                <div className="relative z-10 space-y-8">
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-4">How they heard about us</h4>
                                        <p className="text-slate-600 text-lg font-medium leading-[2] whitespace-pre-wrap">
                                            {selectedLead.heard_about_us}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acquired on {new Date(selectedLead.created_at).toLocaleString()}</p>
                                <div className="flex gap-4">
                                    <a 
                                        href={`mailto:${selectedLead.email_address}?subject=Regarding your interest in Labour Edu`}
                                        className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3"
                                    >
                                        <i className="fas fa-reply"></i>
                                        Email Lead
                                    </a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-12 bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-100 text-center">
                            <i className="fas fa-user-plus text-4xl text-slate-200 mb-6"></i>
                            <h4 className="text-xl font-black text-slate-400 tracking-tight">Select a Lead</h4>
                            <p className="text-slate-300 font-medium text-sm mt-1 max-w-xs">Review potential customers who have shown interest through the "Get Started" form.</p>
                        </div>
                    )}
                </div>
            </div>
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
            `}</style>
        </div>
    );
};

export default LeadManager;
