// src/components/Headteacher/NotificationComposer.tsx
//
// LABOUR-APP SYSTEM — Compose & Post Notifications (Headteacher only)
//
// Modal form with title, message, and priority selector.
// Inserts into school_notifications table (school-scoped via RLS).

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';
import { showToast } from '../Common/Toast';

interface Props {
    onClose: () => void;
    onPosted: () => void;
}

const NotificationComposer: React.FC<Props> = ({ onClose, onPosted }) => {
    const { user } = useAuth();
    const [animateIn, setAnimateIn] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('normal');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setAnimateIn(true));
    }, []);

    const handleClose = () => {
        setAnimateIn(false);
        setTimeout(onClose, 300);
    };

    const handleSubmit = async () => {
        if (!user?.schoolId || !title.trim() || !message.trim()) return;

        setSubmitting(true);
        try {
            const { error } = await supabase.from('school_notifications').insert({
                school_id: user.schoolId,
                title: title.trim(),
                message: message.trim(),
                priority,
                posted_by: user.id,
            });

            if (error) throw error;

            showToast('Notification sent to all staff!', 'success');
            setAnimateIn(false);
            setTimeout(onPosted, 300);
        } catch (err: any) {
            console.error('[NotificationComposer] Error:', err);
            showToast(err.message || 'Failed to post notification. Check your connection.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const priorities = [
        { key: 'normal' as const, label: 'Notice', icon: 'fa-info-circle', color: 'text-blue-500', bg: 'bg-blue-50', activeBg: 'bg-blue-600', desc: 'General update' },
        { key: 'important' as const, label: 'Important', icon: 'fa-exclamation-triangle', color: 'text-amber-500', bg: 'bg-amber-50', activeBg: 'bg-amber-500', desc: 'Needs attention' },
        { key: 'urgent' as const, label: 'Urgent', icon: 'fa-exclamation-circle', color: 'text-red-500', bg: 'bg-red-50', activeBg: 'bg-red-600', desc: 'Immediate action' },
    ];

    return (
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300
                ${animateIn ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent'}`}
            onClick={handleClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                className={`w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden transition-all duration-400 ease-out
                    ${animateIn ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-6'}`}
                style={{ boxShadow: '0 32px 64px -12px rgba(0,0,0,0.25)' }}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-7 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            <i className="fas fa-bullhorn text-white text-lg"></i>
                        </div>
                        <div>
                            <h2 className="text-white font-black text-lg">Post Notification</h2>
                            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">All staff will see this</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-8 h-8 bg-white/15 hover:bg-white/30 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all"
                    >
                        <i className="fas fa-xmark text-sm"></i>
                    </button>
                </div>

                {/* Form */}
                <div className="px-7 py-6 space-y-5">
                    {/* Title */}
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="e.g. Staff Meeting Tomorrow"
                            maxLength={100}
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border-2 border-gray-100 focus:border-indigo-400 focus:bg-white focus:outline-none transition-all text-sm font-bold text-gray-800 placeholder:text-gray-300"
                        />
                    </div>

                    {/* Message */}
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Message</label>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Write the details of your notification..."
                            rows={4}
                            maxLength={500}
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border-2 border-gray-100 focus:border-indigo-400 focus:bg-white focus:outline-none transition-all text-sm font-medium text-gray-700 placeholder:text-gray-300 resize-none"
                        />
                        <p className="text-right text-[10px] text-gray-300 font-bold mt-1">
                            {message.length}/500
                        </p>
                    </div>

                    {/* Priority Selector */}
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Priority</label>
                        <div className="grid grid-cols-3 gap-2">
                            {priorities.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => setPriority(p.key)}
                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all active:scale-95
                                        ${priority === p.key
                                            ? `${p.activeBg} text-white border-transparent shadow-lg`
                                            : `${p.bg} ${p.color} border-transparent hover:border-gray-200`
                                        }`}
                                >
                                    <i className={`fas ${p.icon} text-lg ${priority === p.key ? 'text-white' : ''}`}></i>
                                    <span className="text-[9px] font-black uppercase tracking-widest">{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-7 pb-7 flex gap-3">
                    <button
                        onClick={handleClose}
                        className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 transition-all active:scale-[0.98]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!title.trim() || !message.trim() || submitting}
                        className={`flex-[2] py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg active:scale-[0.98]
                            ${title.trim() && message.trim()
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-xl hover:shadow-indigo-200'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'}`}
                    >
                        {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                                <i className="fas fa-circle-notch fa-spin"></i> Sending...
                            </span>
                        ) : (
                            <span className="flex items-center justify-center gap-2">
                                <i className="fas fa-paper-plane"></i> Send to All Staff
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificationComposer;
