import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showToast } from '../Common/Toast';
import { showConfirm } from '../Common/ConfirmDialog';

interface CustomerInquiry {
    id: string;
    created_at: string;
    full_name: string;
    email_address: string;
    question: string;
    is_resolved: boolean;
    is_read: boolean;
}

interface InquiryManagerProps {
    onRefreshCount?: () => void;
}

const InquiryManager: React.FC<InquiryManagerProps> = ({ onRefreshCount }) => {
    const [inquiries, setInquiries] = useState<CustomerInquiry[]>([]);
    const [fetching, setFetching] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<'all' | 'new' | 'read'>('all');
    const [selectedInquiry, setSelectedInquiry] = useState<CustomerInquiry | null>(null);

    useEffect(() => {
        fetchInquiries();
    }, []);

    const fetchInquiries = async () => {
        setFetching(true);
        try {
            const { data, error } = await supabase
                .from('customer_inquiries')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setInquiries(data || []);
        } catch (err) {
            console.error('Failed to fetch inquiries:', err);
            showToast('Failed to load inquiries', 'error');
        } finally {
            setFetching(false);
        }
    };

    const handleSelectInquiry = (inquiry: CustomerInquiry) => {
        setSelectedInquiry(inquiry);
        if (!inquiry.is_read) {
            markAsRead(inquiry.id);
        }
    };

    const markAsRead = async (id: string) => {
        try {
            const { error } = await supabase
                .from('customer_inquiries')
                .update({ is_read: true })
                .eq('id', id);

            if (error) throw error;

            setInquiries(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i));
            if (onRefreshCount) onRefreshCount();
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const toggleRead = async (inquiry: CustomerInquiry) => {
        try {
            const newReadStatus = !inquiry.is_read;
            const { error } = await supabase
                .from('customer_inquiries')
                .update({ is_read: newReadStatus })
                .eq('id', inquiry.id);

            if (error) throw error;

            setInquiries(prev => prev.map(i => i.id === inquiry.id ? { ...i, is_read: newReadStatus } : i));
            if (selectedInquiry?.id === inquiry.id) {
                setSelectedInquiry({ ...selectedInquiry, is_read: newReadStatus });
            }
            if (onRefreshCount) onRefreshCount();
        } catch (err) {
            console.error('Failed to update inquiry read status:', err);
            showToast('Status update failed', 'error');
        }
    };

    const toggleResolved = async (inquiry: CustomerInquiry) => {
        try {
            const newResolvedStatus = !inquiry.is_resolved;
            const { error } = await supabase
                .from('customer_inquiries')
                .update({ is_resolved: newResolvedStatus })
                .eq('id', inquiry.id);

            if (error) throw error;

            setInquiries(prev => prev.map(i => i.id === inquiry.id ? { ...i, is_resolved: newResolvedStatus } : i));
            if (selectedInquiry?.id === inquiry.id) {
                setSelectedInquiry({ ...selectedInquiry, is_resolved: newResolvedStatus });
            }
        } catch (err) {
            console.error('Failed to update inquiry resolved status:', err);
            showToast('Status update failed', 'error');
        }
    };

    const deleteInquiry = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'Delete Inquiry',
            message: 'Are you sure you want to permanently delete this inquiry? This action cannot be undone.',
            confirmText: 'Delete Permanently',
            variant: 'danger'
        });
        if (!confirmed) return;

        try {
            const { error } = await supabase
                .from('customer_inquiries')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showToast('Inquiry deleted successfully', 'success');
            setInquiries(prev => prev.filter(i => i.id !== id));
            if (selectedInquiry?.id === id) setSelectedInquiry(null);
            if (onRefreshCount) onRefreshCount();
        } catch (err) {
            console.error('Failed to delete inquiry:', err);
            showToast('Delete failed', 'error');
        }
    };

    const filteredInquiries = inquiries.filter(i => {
        const matchesSearch = 
            i.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.email_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.question.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (filter === 'new') return matchesSearch && !i.is_read;
        if (filter === 'read') return matchesSearch && i.is_read;
        return matchesSearch;
    });

    const unreadCount = inquiries.filter(i => !i.is_read).length;

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header Stats & Search */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-1 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex flex-col justify-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">New Inquiries</p>
                    <div className="flex items-center gap-3">
                        <span className="text-4xl font-black text-slate-800">{unreadCount}</span>
                        {unreadCount > 0 && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-600 text-[10px] font-black rounded-lg animate-pulse">ACTION REQ</span>
                        )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight">Out of {inquiries.length} total</p>
                </div>

                <div className="lg:col-span-3 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-slate-200">
                        <i className="fas fa-search"></i>
                    </div>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search by name, email, or question..."
                        className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 placeholder:text-slate-300 text-lg"
                    />
                    <div className="flex gap-2">
                        {(['all', 'new', 'read'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
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
                    ) : filteredInquiries.length === 0 ? (
                        <div className="py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100">
                            <i className="fas fa-inbox text-4xl text-slate-100 mb-4"></i>
                            <p className="text-slate-300 font-black uppercase tracking-widest text-sm">No inquiries found</p>
                        </div>
                    ) : (
                        filteredInquiries.map(inquiry => (
                            <div 
                                key={inquiry.id}
                                onClick={() => handleSelectInquiry(inquiry)}
                                className={`group p-5 rounded-3xl border transition-all cursor-pointer relative overflow-hidden ${selectedInquiry?.id === inquiry.id ? 'bg-blue-50 border-blue-200 shadow-lg' : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'}`}
                            >
                                {!inquiry.is_read && (
                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                                )}
                                <div className="flex justify-between items-start mb-2">
                                    <h5 className={`font-black text-sm truncate pr-4 ${inquiry.is_read ? 'text-slate-600' : 'text-slate-900'}`}>{inquiry.full_name}</h5>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">{new Date(inquiry.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate">{inquiry.email_address}</p>
                                    {inquiry.is_resolved && (
                                        <span className="text-[8px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">Resolved</span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                    {inquiry.question}
                                </p>
                            </div>
                        ))
                    )}
                </div>

                {/* Detail Column */}
                <div className="xl:col-span-3">
                    {selectedInquiry ? (
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden animate-slideInRight h-full flex flex-col">
                            {/* Detail Header */}
                            <div className="p-8 border-b border-slate-50 bg-gradient-to-r from-slate-50 to-white">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-2xl font-black shadow-xl">
                                            {selectedInquiry.full_name[0]}
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedInquiry.full_name}</h3>
                                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{selectedInquiry.email_address}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => toggleResolved(selectedInquiry)}
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${selectedInquiry.is_resolved ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-slate-100 text-slate-400 hover:text-green-500'}`}
                                            title={selectedInquiry.is_resolved ? 'Mark as Unresolved' : 'Mark as Resolved'}
                                        >
                                            <i className={`fas ${selectedInquiry.is_resolved ? 'fa-check-circle' : 'fa-circle'}`}></i>
                                        </button>
                                        <button 
                                            onClick={() => toggleRead(selectedInquiry)}
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${selectedInquiry.is_read ? 'bg-slate-100 text-slate-400 hover:text-blue-500' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'}`}
                                            title={selectedInquiry.is_read ? 'Mark as Unread' : 'Mark as Read'}
                                        >
                                            <i className={`fas ${selectedInquiry.is_read ? 'fa-envelope-open' : 'fa-envelope'}`}></i>
                                        </button>
                                        <button 
                                            onClick={() => deleteInquiry(selectedInquiry.id)}
                                            className="w-10 h-10 bg-red-50 text-red-400 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                            title="Delete Inquiry"
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Message Content */}
                            <div className="p-10 flex-1 bg-white relative">
                                <i className="fas fa-quote-left absolute top-8 left-8 text-slate-50 text-6xl -z-0"></i>
                                <div className="relative z-10">
                                    <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-4">Question Body</h4>
                                    <p className="text-slate-600 text-lg font-medium leading-[2] whitespace-pre-wrap">
                                        {selectedInquiry.question}
                                    </p>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Submitted on {new Date(selectedInquiry.created_at).toLocaleString()}</p>
                                <div className="flex gap-4">
                                    <a 
                                        href={`mailto:${selectedInquiry.email_address}?subject=Regarding your question to Labour Edu`}
                                        className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3"
                                    >
                                        <i className="fas fa-reply"></i>
                                        Reply via Email
                                    </a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-12 bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-100 text-center">
                            <i className="fas fa-mouse-pointer text-4xl text-slate-200 mb-6"></i>
                            <h4 className="text-xl font-black text-slate-400 tracking-tight">Select an Inquiry</h4>
                            <p className="text-slate-300 font-medium text-sm mt-1 max-w-xs">Choose an inquiry from the list to view their question details and contact them.</p>
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

export default InquiryManager;
