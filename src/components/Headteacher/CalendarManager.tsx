import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb, type SchoolEvent } from '../../eduDb';
import { useAuth } from '../../hooks/useAuth';
import { syncManager } from '../../services/syncManager';
import { createPortal } from 'react-dom';

/* ── UI HELPERS ── */
const EVENT_TYPES = {
    Holiday: { icon: 'fa-umbrella-beach', color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    Exam: { icon: 'fa-file-signature', color: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
    Meeting: { icon: 'fa-users', color: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
    Sports: { icon: 'fa-running', color: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
    Event: { icon: 'fa-star', color: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' },
    Other: { icon: 'fa-calendar-alt', color: 'bg-slate-500', bg: 'bg-slate-50', text: 'text-slate-700' },
};

const CalendarManager: React.FC = () => {
    const { user } = useAuth();
    const [viewDate, setViewDate] = useState(new Date());
    const [editingEvent, setEditingEvent] = useState<Partial<SchoolEvent> | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // ── DATA FETCHING ──
    const events = useLiveQuery(() => 
        user?.schoolId ? eduDb.schoolEvents.where('schoolId').equals(user.schoolId).filter(e => !e.isDeleted).toArray() : []
    , [user?.schoolId]);

    // ── CALENDAR LOGIC ──
    const monthData = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const days = [];
        // Pad previous month
        for (let i = 0; i < firstDay; i++) days.push({ day: null });
        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            const dayEvents = events?.filter(e => {
                const start = new Date(e.startDate);
                return start.getDate() === i && start.getMonth() === month && start.getFullYear() === year;
            }) || [];
            days.push({ day: i, date, events: dayEvents });
        }
        return days;
    }, [viewDate, events]);

    const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.schoolId || !editingEvent?.title || !editingEvent?.startDate) return;
        setIsSaving(true);
        try {
            const payload: SchoolEvent = {
                ...editingEvent as SchoolEvent,
                idCloud: editingEvent.idCloud || (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : ''),
                schoolId: user.schoolId,
                createdBy: user.id || '',
                isPublic: true,
                createdAt: editingEvent.id ? editingEvent.createdAt! : Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending'
            };

            if (editingEvent.id) {
                await eduDb.schoolEvents.update(editingEvent.id, payload);
            } else {
                await eduDb.schoolEvents.add(payload);
            }
            setEditingEvent(null);
            
            // Trigger immediate sync
            syncManager.triggerSync(true);
        } catch (err) {
            console.error('Failed to save event:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this event?')) return;
        await eduDb.schoolEvents.update(id, { isDeleted: true, syncStatus: 'pending', updatedAt: Date.now() });
        setEditingEvent(null);
        
        // Trigger immediate sync
        syncManager.triggerSync(true);
    };

    return (
        <div className="space-y-6 lg:space-y-8 animate-fadeIn">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/60 backdrop-blur-xl border border-white p-6 rounded-[2.5rem] shadow-xl shadow-blue-900/5">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl shadow-lg shadow-indigo-200">
                        <i className="fas fa-calendar-alt"></i>
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 leading-none">School Calendar</h2>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1.5 flex items-center gap-2">
                           <i className="fas fa-circle text-[6px] text-emerald-500"></i>
                           Manage events & planning
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200/50">
                        <button onClick={handlePrevMonth} className="w-10 h-10 rounded-xl hover:bg-white text-slate-500 hover:text-indigo-600 transition-all">
                            <i className="fas fa-chevron-left"></i>
                        </button>
                        <div className="px-6 font-black text-slate-700 min-w-[140px] text-center">
                            {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </div>
                        <button onClick={handleNextMonth} className="w-10 h-10 rounded-xl hover:bg-white text-slate-500 hover:text-indigo-600 transition-all">
                            <i className="fas fa-chevron-right"></i>
                        </button>
                    </div>
                    <button 
                        onClick={() => setEditingEvent({ startDate: Date.now(), type: 'Event' })}
                        className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95 transition-all"
                    >
                        <i className="fas fa-plus"></i>
                    </button>
                </div>
            </div>

            {/* ── Calendar Grid ── */}
            <div className="grid grid-cols-7 gap-2 sm:gap-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} className="text-center py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        {d}
                    </div>
                ))}
                {monthData.map((d, i) => (
                    <div 
                        key={i} 
                        className={`min-h-[100px] sm:min-h-[140px] rounded-[1.5rem] border ${d.day ? 'bg-white/40 border-white hover:bg-white/80' : 'bg-transparent border-transparent'} transition-all p-3 group relative overflow-hidden`}
                        onClick={() => d.day && setEditingEvent({ startDate: d.date?.getTime(), type: 'Event' })}
                    >
                        {d.day && (
                            <>
                                <span className={`text-sm font-black ${d.date?.toDateString() === new Date().toDateString() ? 'text-indigo-600 w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center -mt-1 -ml-1' : 'text-slate-400'}`}>
                                    {d.day}
                                </span>
                                <div className="mt-2 space-y-1">
                                    {d.events?.map(e => (
                                        <div 
                                            key={e.id}
                                            onClick={(ev) => { ev.stopPropagation(); setEditingEvent(e); }}
                                            className={`px-2 py-1 rounded-lg text-[9px] font-black truncate border cursor-pointer ${EVENT_TYPES[e.type]?.bg} ${EVENT_TYPES[e.type]?.text} border-current/20 hover:scale-105 transition-transform`}
                                        >
                                            <i className={`fas ${EVENT_TYPES[e.type]?.icon} mr-1`}></i>
                                            {e.title}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {/* ── Legend ── */}
            <div className="flex flex-wrap items-center justify-center gap-6 py-4">
                {Object.entries(EVENT_TYPES).map(([type, cfg]) => (
                    <div key={type} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <div className={`w-3 h-3 rounded-full ${cfg.color}`}></div>
                        {type}
                    </div>
                ))}
            </div>

            {/* ── Add/Edit Modal (Portal) ── */}
            {editingEvent && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 sm:p-0">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingEvent(null)}></div>
                    <form 
                        onSubmit={handleSave}
                        className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-zoomIn border border-white"
                    >
                        <div className="p-8 space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-black text-slate-800">
                                    {editingEvent.id ? 'Edit Event' : 'New Event'}
                                </h3>
                                <button type="button" onClick={() => setEditingEvent(null)} className="text-slate-400 hover:text-slate-600">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Event Title</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={editingEvent.title || ''}
                                        onChange={e => setEditingEvent({...editingEvent, title: e.target.value})}
                                        placeholder="e.g. End of Term Exams"
                                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-100 font-bold text-slate-700 placeholder:text-slate-300"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Category</label>
                                        <select 
                                            value={editingEvent.type}
                                            onChange={e => setEditingEvent({...editingEvent, type: e.target.value as any})}
                                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-100 font-bold text-slate-700"
                                        >
                                            {Object.keys(EVENT_TYPES).map(t => <option key={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Date</label>
                                        <input 
                                            type="date" 
                                            required
                                            value={editingEvent.startDate ? new Date(editingEvent.startDate).toISOString().split('T')[0] : ''}
                                            onChange={e => setEditingEvent({...editingEvent, startDate: new Date(e.target.value).getTime()})}
                                            className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-100 font-bold text-slate-700"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Description (Optional)</label>
                                    <textarea 
                                        rows={3}
                                        value={editingEvent.description || ''}
                                        onChange={e => setEditingEvent({...editingEvent, description: e.target.value})}
                                        placeholder="Describe the activity..."
                                        className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-100 font-bold text-slate-700 placeholder:text-slate-300 resize-none"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-4">
                                {editingEvent.id && (
                                    <button 
                                        type="button"
                                        onClick={() => handleDelete(editingEvent.id!)}
                                        className="h-14 px-6 rounded-2xl bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors"
                                    >
                                        <i className="fas fa-trash"></i>
                                    </button>
                                )}
                                <button 
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 h-14 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
                                >
                                    {isSaving ? <i className="fas fa-spinner fa-spin"></i> : (editingEvent.id ? 'Update Event' : 'Save Event')}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>,
                document.body
            )}
        </div>
    );
};

export default CalendarManager;
