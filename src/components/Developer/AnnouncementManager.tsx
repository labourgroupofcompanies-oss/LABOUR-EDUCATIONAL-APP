import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showConfirm } from '../Common/ConfirmDialog';

interface Announcement {
    id: string;
    title: string;
    message: string;
    level: 'info' | 'warning' | 'critical';
    is_active: boolean;
    created_at: string;
}

const AnnouncementManager: React.FC = () => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [level, setLevel] = useState<'info' | 'warning' | 'critical'>('info');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [actionMessage, setActionMessage] = useState({ type: '', text: '' });

    const showMessage = (type: 'success' | 'error', text: string) => {
        setActionMessage({ type, text });
        setTimeout(() => setActionMessage({ type: '', text: '' }), 4000);
    };

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const fetchAnnouncements = async () => {
        setFetching(true);
        try {
            const { data, error } = await supabase
                .from('system_announcements')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAnnouncements(data || []);
        } catch (err) {
            console.error('Failed to fetch announcements:', err);
        } finally {
            setFetching(false);
        }
    };

    const postAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !message.trim()) return;
        setLoading(true);
        console.log('[DIAGNOSTIC] Starting Announcement Post...', { title, level });

        const safetyTimeout = setTimeout(() => {
            console.warn('[DIAGNOSTIC] Announcement Post timed out (15s fallback). Force-releasing loading state.');
            setLoading(false);
            showMessage('error', 'The request timed out. Please check your internet connection.');
        }, 15000);

        try {
            console.log('[DIAGNOSTIC] Calling Supabase insert for system_announcements...');
            const { error } = await supabase
                .from('system_announcements')
                .insert([{ title, message, level, is_active: true }]);

            if (error) {
                console.error('[DIAGNOSTIC] Supabase Insert Error:', error);
                throw error;
            }

            console.log('[DIAGNOSTIC] Post successful. Resetting form.');
            setTitle('');
            setMessage('');
            setLevel('info');
            showMessage('success', 'Announcement posted successfully!');
            fetchAnnouncements();
        } catch (err: any) {
            console.error('[DIAGNOSTIC] Failed to post announcement. Full error:', err);
            showMessage('error', `Failed to post announcement: ${err.message || 'Unknown error'}`);
        } finally {
            clearTimeout(safetyTimeout);
            setLoading(false);
            console.log('[DIAGNOSTIC] Post process finalized.');
        }
    };

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('system_announcements')
                .update({ is_active: !currentStatus })
                .eq('id', id);

            if (error) throw error;
            showMessage('success', `Announcement ${currentStatus ? 'deactivated' : 'activated'}.`);
            fetchAnnouncements();
        } catch (err) {
            console.error('Failed to toggle status:', err);
            showMessage('error', 'Failed to change announcement status.');
        }
    };

    const deleteAnnouncement = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'Delete Announcement',
            message: 'Are you sure you want to permanently delete this announcement? This will remove it from all portals immediately.',
            confirmText: 'Delete Now',
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            const { error } = await supabase
                .from('system_announcements')
                .delete()
                .eq('id', id);

            if (error) throw error;
            showMessage('success', 'Announcement deleted.');
            fetchAnnouncements();
        } catch (err) {
            console.error('Failed to delete:', err);
            showMessage('error', 'Failed to delete announcement.');
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10 animate-fadeIn">
            {/* Creator Form */}
            <div className="bg-white rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-10 h-fit space-y-6 lg:space-y-8 lg:sticky lg:top-24">
                <div>
                    <h4 className="text-lg lg:text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <i className="fas fa-edit text-blue-500"></i>
                        Broadcast Forge
                    </h4>
                    <p className="text-slate-400 font-medium text-[10px] lg:text-xs mt-1 uppercase tracking-widest">New System Announcement</p>
                </div>

                {actionMessage.text && (
                    <div className={`px-4 py-3 rounded-xl text-[10px] font-bold flex items-center gap-2 ${actionMessage.type === 'success' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        {actionMessage.type === 'success' ? <i className="fas fa-check-circle"></i> : <i className="fas fa-exclamation-circle"></i>}
                        {actionMessage.text}
                    </div>
                )}

                <form onSubmit={postAnnouncement} className="space-y-5 lg:space-y-6">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Title</label>
                        <input
                            required
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. System Maintenance"
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 text-sm"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Priority</label>
                        <div className="grid grid-cols-3 gap-2 lg:gap-3">
                            {(['info', 'warning', 'critical'] as const).map(l => (
                                <button
                                    key={l}
                                    type="button"
                                    onClick={() => setLevel(l)}
                                    className={`py-3 rounded-xl font-black text-[9px] lg:text-[10px] uppercase tracking-wider transition-all border-2 ${level === l
                                        ? l === 'info' ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20' : l === 'warning' ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-red-500 border-red-500 text-white shadow-lg shadow-red-500/20'
                                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                                        }`}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Message</label>
                        <textarea
                            required
                            rows={4}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Type message here..."
                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 resize-none text-sm"
                        ></textarea>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 lg:py-5 bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-slate-900/10 text-sm"
                    >
                        {loading ? 'Posting...' : 'Post Announcement'}
                    </button>
                </form>
            </div>

            {/* List View */}
            <div className="lg:col-span-2 space-y-4 lg:space-y-6">
                <div className="flex justify-between items-center mb-2 lg:mb-4 px-2 lg:px-4">
                    <h4 className="text-lg lg:text-xl font-black text-slate-800 tracking-tight">Active Transmissions</h4>
                    <button onClick={fetchAnnouncements} className="text-[10px] font-bold text-blue-500 uppercase tracking-widest hover:text-blue-600 transition-all">Refresh Feed</button>
                </div>

                {fetching ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-28 lg:h-32 bg-white rounded-2xl lg:rounded-3xl animate-pulse"></div>)}
                    </div>
                ) : announcements.length === 0 ? (
                    <div className="p-16 lg:p-20 text-center bg-white rounded-[2rem] lg:rounded-[2.5rem] border-2 border-dashed border-slate-100">
                        <i className="fas fa-bullhorn text-3xl lg:text-4xl text-slate-100 mb-4"></i>
                        <p className="text-slate-300 font-bold uppercase tracking-widest text-[10px] lg:text-xs">No active broadcasts</p>
                    </div>
                ) : (
                    announcements.map((a) => (
                        <div key={a.id} className={`p-6 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] bg-white border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group transition-all ${!a.is_active && 'opacity-60 grayscale'}`}>
                            <div className={`absolute top-0 left-0 w-1.5 lg:w-2 h-full ${a.level === 'critical' ? 'bg-red-500' : a.level === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`}></div>

                            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <h5 className="text-lg lg:text-xl font-black text-slate-800 truncate">{a.title}</h5>
                                        <span className={`px-2 py-0.5 rounded-lg text-[8px] lg:text-[9px] font-black uppercase tracking-widest ${a.level === 'critical' ? 'bg-red-50 text-red-600' : a.level === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                                            }`}>
                                            {a.level}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight">Posted: {new Date(a.created_at).toLocaleDateString()}</p>
                                </div>

                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={() => toggleStatus(a.id, a.is_active)}
                                        className={`flex-1 sm:flex-none w-10 h-10 rounded-xl flex items-center justify-center transition-all ${a.is_active ? 'bg-green-50 text-green-500 hover:bg-green-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                            }`}
                                        title={a.is_active ? 'Deactivate' : 'Activate'}
                                    >
                                        <i className={`fas ${a.is_active ? 'fa-eye' : 'fa-eye-slash'} text-xs`}></i>
                                    </button>
                                    <button
                                        onClick={() => deleteAnnouncement(a.id)}
                                        className="flex-1 sm:flex-none w-10 h-10 bg-red-50 text-red-400 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                        title="Delete"
                                    >
                                        <i className="fas fa-trash-alt text-xs"></i>
                                    </button>
                                </div>
                            </div>

                            <p className="text-slate-600 font-medium text-sm lg:text-base leading-relaxed line-clamp-4 lg:line-clamp-none">{a.message}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AnnouncementManager;
