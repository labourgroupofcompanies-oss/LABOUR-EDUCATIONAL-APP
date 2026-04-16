// src/components/Common/NotificationBell.tsx
//
// LABOUR-APP SYSTEM — Notification Bell + Slide-in Panel
//
// Reusable across all portals. Shows unread count badge.
// On open, marks notifications as read.
// School-isolated: only fetches notifications for the user's school.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';
import NotificationComposer from '../Headteacher/NotificationComposer';

interface Notification {
    id: string;
    school_id: string;
    title: string;
    message: string;
    priority: 'normal' | 'important' | 'urgent';
    posted_by: string;
    created_at: string;
    is_read?: boolean;
}

// ── Time-ago helper ──────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    return new Date(dateStr).toLocaleDateString();
}

// ── Priority config ──────────────────────────────────────────────────────────
const priorityConfig = {
    urgent: { icon: 'fa-exclamation-circle', color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100', badge: 'bg-red-500', label: 'Urgent' },
    important: { icon: 'fa-exclamation-triangle', color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-100', badge: 'bg-amber-500', label: 'Important' },
    normal: { icon: 'fa-info-circle', color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-100', badge: 'bg-blue-500', label: 'Notice' },
};

interface NotificationBellProps {
    canCompose?: boolean; // Only true for headteachers
}

const NotificationBell: React.FC<NotificationBellProps> = ({ canCompose = false }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const [panelOpen, setPanelOpen] = useState(false);
    const [animatePanel, setAnimatePanel] = useState(false);
    const [showComposer, setShowComposer] = useState(false);
    const [loading, setLoading] = useState(false);
    const bellRef = useRef<HTMLButtonElement>(null);

    // ── Fetch notifications for this school ──────────────────────────────────
    const fetchNotifications = useCallback(async () => {
        if (!user?.schoolId) return;
        setLoading(true);
        try {
            // Fetch notifications (RLS ensures school isolation)
            const { data: notifs } = await supabase
                .from('school_notifications')
                .select('*')
                .eq('school_id', user.schoolId)
                .order('created_at', { ascending: false })
                .limit(50);

            // Fetch read records for this user
            const { data: reads } = await supabase
                .from('notification_reads')
                .select('notification_id')
                .eq('user_id', user.id);

            if (notifs) setNotifications(notifs);
            if (reads) setReadIds(new Set(reads.map(r => r.notification_id)));
        } catch (err) {
            console.error('[NotificationBell] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.schoolId, user?.id]);

    // Fetch on mount and periodically (every 60 seconds)
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    // ── Unread count ─────────────────────────────────────────────────────────
    const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

    // ── Open panel ───────────────────────────────────────────────────────────
    const openPanel = useCallback(() => {
        setPanelOpen(true);
        requestAnimationFrame(() => setAnimatePanel(true));
    }, []);

    // ── Close panel ──────────────────────────────────────────────────────────
    const closePanel = useCallback(() => {
        setAnimatePanel(false);
        setTimeout(() => setPanelOpen(false), 300);
    }, []);

    // ── Mark all as read when panel opens ────────────────────────────────────
    useEffect(() => {
        if (!panelOpen || !user?.id) return;

        const unreadNotifs = notifications.filter(n => !readIds.has(n.id));
        if (unreadNotifs.length === 0) return;

        // Batch insert read records (ignore duplicates via onConflict)
        const readRecords = unreadNotifs.map(n => ({
            notification_id: n.id,
            user_id: user.id,
        }));

        (async () => {
            try {
                await supabase
                    .from('notification_reads')
                    .upsert(readRecords, { onConflict: 'notification_id,user_id' });

                // Update local state immediately
                setReadIds(prev => {
                    const next = new Set(prev);
                    unreadNotifs.forEach(n => next.add(n.id));
                    return next;
                });
            } catch (err) {
                console.error('[NotificationBell] Mark read error:', err);
            }
        })();
    }, [panelOpen, notifications, readIds, user?.id]);

    // ── Delete notification (headteacher only) ───────────────────────────────
    const handleDelete = useCallback(async (notifId: string) => {
        const { error } = await supabase
            .from('school_notifications')
            .delete()
            .eq('id', notifId);

        if (!error) {
            setNotifications(prev => prev.filter(n => n.id !== notifId));
        }
    }, []);

    // ── After composing a new notification ───────────────────────────────────
    const handlePosted = useCallback(() => {
        setShowComposer(false);
        fetchNotifications();
    }, [fetchNotifications]);

    if (!user) return null;

    return (
        <>
            {/* ── Bell Button ── */}
            <button
                ref={bellRef}
                onClick={openPanel}
                className="relative w-9 h-9 md:w-11 md:h-11 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-xl text-white border border-white/20 transition-all active:scale-90"
                title={`Notifications${unreadCount > 0 ? ` (${unreadCount} new)` : ''}`}
            >
                <i className={`fas fa-bell text-sm md:text-base ${unreadCount > 0 ? 'animate-swing' : ''}`}></i>

                {/* Badge */}
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 shadow-lg shadow-red-300/50 animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* ── Panel Overlay ── */}
            {panelOpen && (
                <div className="fixed inset-0 z-[9997]" onClick={closePanel}>
                    {/* Backdrop */}
                    <div className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${animatePanel ? 'opacity-100' : 'opacity-0'}`} />

                    {/* Slide-in Panel */}
                    <div
                        onClick={e => e.stopPropagation()}
                        className={`absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out
                            ${animatePanel ? 'translate-x-0' : 'translate-x-full'}`}
                    >
                        {/* Panel Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                                    <i className="fas fa-bell text-lg"></i>
                                </div>
                                <div>
                                    <h2 className="font-black text-gray-800 text-base">Notifications</h2>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        {notifications.length} total · {unreadCount} unread
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {canCompose && (
                                    <button
                                        onClick={() => setShowComposer(true)}
                                        className="w-9 h-9 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all active:scale-90 shadow-lg shadow-indigo-200"
                                        title="Post New Notification"
                                    >
                                        <i className="fas fa-plus text-sm"></i>
                                    </button>
                                )}
                                <button
                                    onClick={closePanel}
                                    className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl transition-all active:scale-90"
                                >
                                    <i className="fas fa-times text-sm"></i>
                                </button>
                            </div>
                        </div>

                        {/* Notification List */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                            {loading && notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                                    <i className="fas fa-circle-notch fa-spin text-3xl mb-3"></i>
                                    <p className="text-xs font-bold uppercase tracking-widest">Loading...</p>
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                                    <i className="fas fa-bell-slash text-4xl mb-4"></i>
                                    <p className="font-bold text-sm text-gray-400">No notifications yet</p>
                                    <p className="text-xs text-gray-300 mt-1">
                                        {canCompose ? 'Post your first notification to staff!' : 'Your headteacher hasn\'t posted any updates.'}
                                    </p>
                                </div>
                            ) : (
                                notifications.map((notif) => {
                                    const isRead = readIds.has(notif.id);
                                    const pc = priorityConfig[notif.priority] || priorityConfig.normal;

                                    return (
                                        <div
                                            key={notif.id}
                                            className={`relative p-4 rounded-2xl border transition-all ${
                                                isRead
                                                    ? 'bg-white border-gray-100 opacity-70'
                                                    : `${pc.bg} ${pc.border} shadow-sm`
                                            }`}
                                        >
                                            {/* Unread indicator dot */}
                                            {!isRead && (
                                                <span className={`absolute top-4 right-4 w-2.5 h-2.5 rounded-full ${pc.badge} animate-pulse shadow-sm`}></span>
                                            )}

                                            {/* Priority badge */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${pc.color} ${pc.bg}`}>
                                                    <i className={`fas ${pc.icon} text-[8px]`}></i>
                                                    {pc.label}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-medium">
                                                    {timeAgo(notif.created_at)}
                                                </span>
                                            </div>

                                            {/* Content */}
                                            <h4 className="font-black text-sm text-gray-800 mb-1 pr-6">{notif.title}</h4>
                                            <p className="text-xs text-gray-600 font-medium leading-relaxed">{notif.message}</p>

                                            {/* Delete button (headteacher only) */}
                                            {canCompose && (
                                                <button
                                                    onClick={() => handleDelete(notif.id)}
                                                    className="absolute bottom-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                                    title="Delete notification"
                                                >
                                                    <i className="fas fa-trash-alt text-[10px]"></i>
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Panel Footer */}
                        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 text-center">
                            <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">
                                School Notifications • Powered by Labour Edu
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Composer Modal ── */}
            {showComposer && (
                <NotificationComposer
                    onClose={() => setShowComposer(false)}
                    onPosted={handlePosted}
                />
            )}

            {/* ── Bell swing animation (CSS) ── */}
            <style>{`
                @keyframes swing {
                    0%, 100% { transform: rotate(0deg); }
                    15% { transform: rotate(12deg); }
                    30% { transform: rotate(-10deg); }
                    45% { transform: rotate(8deg); }
                    60% { transform: rotate(-6deg); }
                    75% { transform: rotate(3deg); }
                }
                .animate-swing {
                    animation: swing 2s ease-in-out infinite;
                    transform-origin: top center;
                }
            `}</style>
        </>
    );
};

export default NotificationBell;
