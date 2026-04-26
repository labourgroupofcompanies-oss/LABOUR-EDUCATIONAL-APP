import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { showToast } from '../Common/Toast';

const SchoolNotificationTool: React.FC = () => {
    const [schoolId, setSchoolId] = useState('');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');
    const [sending, setSending] = useState(false);

    const sendNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!schoolId.trim() || !title.trim() || !message.trim()) return;

        setSending(true);
        try {
            // 1. Find the school UUID from the human-readable school_code
            const { data: school, error: schoolError } = await supabase
                .from('schools')
                .select('id')
                .eq('school_code', schoolId.trim().toUpperCase())
                .single();

            if (schoolError || !school) {
                showToast('School ID not found. Please verify the ID.', 'error');
                return;
            }

            // 2. Post to school_notifications
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { error: postError } = await supabase
                .from('school_notifications')
                .insert([{
                    school_id: school.id,
                    title,
                    message,
                    priority,
                    posted_by: user.id
                }]);

            if (postError) throw postError;

            showToast('Notification sent successfully to ' + schoolId, 'success');
            setTitle('');
            setMessage('');
            setSchoolId('');
        } catch (err: any) {
            console.error('Failed to send notification:', err);
            showToast('Failed to send notification: ' + (err.message || 'Unknown error'), 'error');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto animate-fadeIn">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-8 lg:p-12 space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h4 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <i className="fas fa-paper-plane text-blue-500"></i>
                            Direct School Dispatch
                        </h4>
                        <p className="text-slate-400 font-medium text-sm mt-1 uppercase tracking-widest">Send private notifications to specific schools</p>
                    </div>
                    <div className="bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Master Override Active</p>
                    </div>
                </div>

                <form onSubmit={sendNotification} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target School ID</label>
                            <input
                                required
                                type="text"
                                value={schoolId}
                                onChange={(e) => setSchoolId(e.target.value)}
                                placeholder="e.g. GHS-001"
                                className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-black text-slate-700 text-sm placeholder:font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Priority Level</label>
                            <select
                                value={priority}
                                onChange={(e: any) => setPriority(e.target.value)}
                                className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-black text-slate-700 text-sm appearance-none"
                            >
                                <option value="normal">Normal Priority</option>
                                <option value="important">Important (Amber)</option>
                                <option value="urgent">Urgent (Red)</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Message Title</label>
                        <input
                            required
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="What is this regarding?"
                            className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-bold text-slate-700 text-sm"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notification Body</label>
                        <textarea
                            required
                            rows={6}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Enter the detailed message for the school staff..."
                            className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none transition-all font-medium text-slate-700 resize-none text-sm leading-relaxed"
                        ></textarea>
                    </div>

                    <button
                        type="submit"
                        disabled={sending}
                        className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-900/10 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
                    >
                        {sending ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-paper-plane"></i>}
                        {sending ? 'Dispatching Message...' : 'Broadcast to School'}
                    </button>
                </form>

                <div className="pt-8 border-t border-slate-50 flex items-center gap-4 text-slate-400">
                    <i className="fas fa-info-circle"></i>
                    <p className="text-[10px] font-bold uppercase tracking-tight">This message will appear in the internal notification centers of all staff members within the target school.</p>
                </div>
            </div>
        </div>
    );
};

export default SchoolNotificationTool;
