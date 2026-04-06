import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb, type GraduateRecord, type Student } from '../../eduDb';
import { useAuth } from '../../hooks/useAuth';
import { showToast } from '../Common/Toast';

type SubView = 'academic' | 'financial' | 'notes';

const subTabs: { key: SubView; label: string; shortLabel: string; icon: string; color: string }[] = [
    { key: 'academic', label: 'Academic Records', shortLabel: 'Academic', icon: 'fa-graduation-cap', color: 'text-blue-600' },
    { key: 'financial', label: 'Financial Records', shortLabel: 'Financial', icon: 'fa-coins', color: 'text-green-600' },
    { key: 'notes', label: 'HT Review Notes', shortLabel: 'HT Notes', icon: 'fa-sticky-note', color: 'text-purple-600' },
];

const GraduatesManagement: React.FC = () => {
    const { user } = useAuth();
    const [subView, setSubView] = useState<SubView>('academic');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [showGraduateModal, setShowGraduateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState<GraduateRecord | null>(null);
    const [showNoteEditor, setShowNoteEditor] = useState<number | null>(null);
    const [noteText, setNoteText] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Graduate records from local DB
    const graduates = useLiveQuery(async () => {
        if (!user?.schoolId) return [];
        return await eduDb.graduateRecords
            .where('schoolId').equals(user.schoolId)
            .filter(g => !g.isDeleted)
            .toArray();
    }, [user?.schoolId]);

    const availableYears = useMemo(() => {
        const years = [...new Set((graduates || []).map(g => g.graduationYear))].sort((a, b) => b - a);
        return years;
    }, [graduates]);

    const filtered = useMemo(() => {
        let list = graduates || [];
        if (selectedYear !== 'all') list = list.filter(g => g.graduationYear === parseInt(selectedYear));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(g =>
                g.fullName.toLowerCase().includes(q) ||
                g.finalClass.toLowerCase().includes(q)
            );
        }
        return list;
    }, [graduates, selectedYear, searchQuery]);

    // Summary stats
    const stats = useMemo(() => {
        const total = filtered.length;
        const cleared = filtered.filter(g => g.feeStatus === 'cleared').length;
        const avgScore = total > 0
            ? Math.round(filtered.reduce((sum, g) => sum + (g.overallAverage || 0), 0) / total * 10) / 10
            : 0;
        const totalOwed = filtered.reduce((sum, g) => sum + (g.outstandingBalance || 0), 0);
        return { total, cleared, avgScore, totalOwed };
    }, [filtered]);

    // Save HT note
    const handleSaveNote = async (recordId: number) => {
        if (!user?.schoolId) return;
        setIsSaving(true);
        try {
            await eduDb.graduateRecords.update(recordId, {
                headteacherNote: noteText.trim(),
                notedBy: user.fullName || 'Headteacher',
                notedAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending',
            });
            showToast('Note saved successfully.', 'success');
            setShowNoteEditor(null);
            setNoteText('');
        } catch {
            showToast('Failed to save note.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteGraduate = async (id: number) => {
        if (!window.confirm('Remove this graduate record? This cannot be undone.')) return;
        try {
            await eduDb.graduateRecords.update(id, {
                isDeleted: true,
                updatedAt: Date.now(),
                syncStatus: 'pending',
            });
            showToast('Graduate record removed.', 'success');
        } catch {
            showToast('Failed to remove record.', 'error');
        }
    };

    const feeStatusBadge = (status?: GraduateRecord['feeStatus']) => {
        if (!status) return null;
        return status === 'cleared'
            ? <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-100 rounded-lg text-[9px] font-black uppercase tracking-widest">Cleared</span>
            : <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[9px] font-black uppercase tracking-widest">Outstanding</span>;
    };

    const gradeBadge = (grade?: string) => {
        if (!grade) return null;
        const colors: Record<string, string> = {
            A: 'bg-emerald-50 text-emerald-700 border-emerald-100',
            B: 'bg-blue-50 text-blue-700 border-blue-100',
            C: 'bg-amber-50 text-amber-700 border-amber-100',
            D: 'bg-orange-50 text-orange-700 border-orange-100',
            F: 'bg-red-50 text-red-700 border-red-100',
        };
        const key = grade.charAt(0).toUpperCase();
        const cls = colors[key] || 'bg-gray-50 text-gray-700 border-gray-100';
        return <span className={`px-2 py-0.5 border rounded-lg text-[9px] font-black uppercase tracking-widest ${cls}`}>{grade}</span>;
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                        <span className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                            <i className="fas fa-user-graduate text-sm" />
                        </span>
                        Graduates Directory
                    </h2>
                    <p className="text-gray-400 text-sm mt-1 ml-12">
                        {stats.total} graduate{stats.total !== 1 ? 's' : ''} on record
                    </p>
                </div>
                <button
                    onClick={() => setShowGraduateModal(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
                >
                    <i className="fas fa-plus" /> Graduate a Student
                </button>
            </div>

            {/* ── Stats Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Graduates', value: stats.total, icon: 'fa-users', color: 'text-violet-600', bg: 'bg-violet-50' },
                    { label: 'Fee Cleared', value: stats.cleared, icon: 'fa-check-circle', color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'Avg. Score', value: `${stats.avgScore}%`, icon: 'fa-chart-line', color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Total Debt', value: `GHS ${stats.totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: 'fa-hand-holding-dollar', color: 'text-red-600', bg: 'bg-red-50' },
                ].map((s, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                        <div className={`w-10 h-10 ${s.bg} ${s.color} rounded-xl flex items-center justify-center text-base shadow-sm flex-shrink-0`}>
                            <i className={`fas ${s.icon}`} />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{s.label}</p>
                            <p className="text-base font-black text-gray-800">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Filters ── */}
            <div className="flex flex-col md:flex-row gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="relative flex-1">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                        type="text"
                        placeholder="Search by name or class..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none text-sm font-medium"
                    />
                </div>
                <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-400 outline-none bg-white text-sm font-bold min-w-[140px]"
                >
                    <option value="all">All Years</option>
                    {availableYears.map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>
            </div>

            {/* ── Sub-tab Bar ── */}
            <div className="flex gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-100">
                {subTabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setSubView(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${subView === tab.key ? `bg-white shadow-sm ${tab.color} border border-gray-200` : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <i className={`fas ${tab.icon} text-sm`} />
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.shortLabel}</span>
                    </button>
                ))}
            </div>

            {/* ── Empty State ── */}
            {filtered.length === 0 && (
                <div className="py-16 flex flex-col items-center text-gray-400">
                    <div className="w-20 h-20 bg-gray-50 border border-gray-100 rounded-3xl flex items-center justify-center mb-4">
                        <i className="fas fa-user-graduate text-3xl opacity-30" />
                    </div>
                    <p className="font-black text-sm">No graduates found</p>
                    <p className="text-xs mt-1">
                        {searchQuery || selectedYear !== 'all'
                            ? 'Try adjusting your filters.'
                            : 'Click "Graduate a Student" to create the first record.'}
                    </p>
                </div>
            )}

            {/* ── ACADEMIC RECORDS TAB ── */}
            {subView === 'academic' && filtered.length > 0 && (
                <div className="space-y-4">
                    {filtered.map(grad => (
                        <div
                            key={grad.id}
                            onClick={() => setShowDetailModal(grad)}
                            className="bg-white border border-gray-100 rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-lg hover:border-indigo-100 transition-all cursor-pointer group"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    {/* Avatar */}
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-sm flex-shrink-0">
                                        {grad.fullName.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-800 text-sm uppercase group-hover:text-indigo-600 transition-colors">{grad.fullName}</h3>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                                {grad.finalClass}
                                            </span>
                                            <span className="px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-100 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                                {grad.graduationTerm} · {grad.graduationYear}
                                            </span>
                                            {grad.finalGrade && gradeBadge(grad.finalGrade)}
                                        </div>
                                    </div>
                                </div>
                                {/* Academic Stats */}
                                <div className="hidden md:flex items-center gap-6 flex-shrink-0 text-right">
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Avg. Score</p>
                                        <p className="text-xl font-black text-gray-800">{grad.overallAverage != null ? `${grad.overallAverage}%` : '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subjects Passed</p>
                                        <p className="text-xl font-black text-gray-800">
                                            {grad.passedSubjects ?? '—'}<span className="text-sm text-gray-400">/{grad.totalSubjects ?? '—'}</span>
                                        </p>
                                    </div>
                                    <i className="fas fa-chevron-right text-gray-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                                </div>
                            </div>
                            {/* Mobile stats */}
                            <div className="md:hidden flex gap-4 mt-3 pt-3 border-t border-gray-50">
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Avg</p>
                                    <p className="text-sm font-black text-gray-800">{grad.overallAverage != null ? `${grad.overallAverage}%` : '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Subjects</p>
                                    <p className="text-sm font-black text-gray-800">{grad.passedSubjects ?? '—'}/{grad.totalSubjects ?? '—'}</p>
                                </div>
                            </div>
                            {grad.academicSummary && (
                                <p className="text-xs text-gray-400 mt-3 italic border-t border-gray-50 pt-3 truncate">{grad.academicSummary}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── FINANCIAL RECORDS TAB ── */}
            {subView === 'financial' && filtered.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b-2 border-gray-50 bg-gray-50/50">
                                    {['Graduate', 'Class', 'Year', 'Fees Paid', 'Outstanding', 'Status'].map(col => (
                                        <th key={col} className="py-4 px-4 text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{col}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map(grad => (
                                    <tr
                                        key={grad.id}
                                        onClick={() => setShowDetailModal(grad)}
                                        className="hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                                    >
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0 shadow-sm">
                                                    {grad.fullName.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="font-bold text-gray-800 text-sm group-hover:text-indigo-600 transition-colors uppercase">{grad.fullName}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="text-xs font-bold text-gray-600">{grad.finalClass}</span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="text-xs font-bold text-gray-500">{grad.graduationYear}</span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="text-sm font-black text-green-700">
                                                GHS {(grad.totalFeesPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className={`text-sm font-black ${(grad.outstandingBalance || 0) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                GHS {(grad.outstandingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4">
                                            {feeStatusBadge(grad.feeStatus)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-100 bg-gray-50/50">
                                    <td colSpan={3} className="py-3 px-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Totals ({filtered.length} graduates)</td>
                                    <td className="py-3 px-4 text-sm font-black text-green-700">
                                        GHS {filtered.reduce((s, g) => s + (g.totalFeesPaid || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-3 px-4 text-sm font-black text-red-600">
                                        GHS {filtered.reduce((s, g) => s + (g.outstandingBalance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* ── HT REVIEW NOTES TAB ── */}
            {subView === 'notes' && filtered.length > 0 && (
                <div className="space-y-4">
                    {filtered.map(grad => (
                        <div key={grad.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                            {/* Card header */}
                            <div className="flex items-center justify-between gap-4 p-4 md:p-5 border-b border-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white font-black text-sm shadow-sm flex-shrink-0">
                                        {grad.fullName.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-800 text-sm uppercase">{grad.fullName}</p>
                                        <p className="text-[10px] text-gray-400 font-bold">{grad.finalClass} · {grad.graduationTerm} {grad.graduationYear}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowNoteEditor(grad.id!);
                                        setNoteText(grad.headteacherNote || '');
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                                >
                                    <i className={`fas ${grad.headteacherNote ? 'fa-pen' : 'fa-plus'} text-xs`} />
                                    {grad.headteacherNote ? 'Edit Note' : 'Add Note'}
                                </button>
                            </div>

                            {/* Note content or edit form */}
                            {showNoteEditor === grad.id ? (
                                <div className="p-4 md:p-5 space-y-3 bg-purple-50/30">
                                    <textarea
                                        value={noteText}
                                        onChange={e => setNoteText(e.target.value)}
                                        placeholder="Write your review note for this graduate... (academic performance, character, recommendations, etc.)"
                                        rows={5}
                                        className="w-full px-4 py-3 rounded-xl border border-purple-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-sm text-gray-700 resize-none bg-white"
                                    />
                                    <div className="flex gap-2 justify-end">
                                        <button
                                            onClick={() => { setShowNoteEditor(null); setNoteText(''); }}
                                            className="px-4 py-2 text-gray-500 font-bold text-xs hover:bg-gray-100 rounded-xl transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => handleSaveNote(grad.id!)}
                                            disabled={isSaving}
                                            className="px-5 py-2 bg-purple-600 text-white font-black text-xs rounded-xl uppercase tracking-widest shadow-sm shadow-purple-200 hover:bg-purple-700 transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            {isSaving ? <i className="fas fa-spinner animate-spin" /> : 'Save Note'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 md:p-5">
                                    {grad.headteacherNote ? (
                                        <>
                                            <div className="flex items-start gap-3">
                                                <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <i className="fas fa-quote-left text-[9px]" />
                                                </div>
                                                <p className="text-sm text-gray-700 leading-relaxed flex-1">{grad.headteacherNote}</p>
                                            </div>
                                            {grad.notedBy && (
                                                <p className="text-[10px] text-gray-400 font-bold mt-3 text-right">
                                                    — {grad.notedBy} · {grad.notedAt ? new Date(grad.notedAt).toLocaleDateString() : ''}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-sm text-gray-300 italic text-center py-4">
                                            <i className="fas fa-sticky-note mr-2" />
                                            No headteacher note yet. Click "Add Note" to write one.
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Detail Modal ── */}
            {showDetailModal && (
                <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowDetailModal(null)}>
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="bg-gradient-to-br from-violet-600 to-indigo-700 p-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-white font-black text-2xl shadow-sm">
                                        {showDetailModal.fullName.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-white font-black text-lg uppercase">{showDetailModal.fullName}</h3>
                                        <p className="text-indigo-200 text-xs font-bold">{showDetailModal.finalClass} · {showDetailModal.graduationTerm} {showDetailModal.graduationYear}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowDetailModal(null)} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all">
                                    <i className="fas fa-times" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
                            {/* Academic */}
                            <section>
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <i className="fas fa-graduation-cap text-blue-500" /> Academic Summary
                                </h4>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { label: 'Avg. Score', value: showDetailModal.overallAverage != null ? `${showDetailModal.overallAverage}%` : '—' },
                                        { label: 'Final Grade', value: showDetailModal.finalGrade || '—' },
                                        { label: 'Subjects', value: `${showDetailModal.passedSubjects ?? '—'}/${showDetailModal.totalSubjects ?? '—'}` },
                                    ].map((item, i) => (
                                        <div key={i} className="bg-blue-50 rounded-xl p-3 text-center">
                                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">{item.label}</p>
                                            <p className="text-base font-black text-blue-800 mt-1">{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                                {showDetailModal.academicSummary && (
                                    <p className="text-xs text-gray-500 mt-3 italic">{showDetailModal.academicSummary}</p>
                                )}
                            </section>

                            {/* Financial */}
                            <section>
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <i className="fas fa-coins text-green-500" /> Financial Summary
                                </h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-green-50 rounded-xl p-3">
                                        <p className="text-[9px] font-black text-green-400 uppercase tracking-widest">Total Paid</p>
                                        <p className="text-base font-black text-green-800 mt-1">GHS {(showDetailModal.totalFeesPaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    <div className={`rounded-xl p-3 ${(showDetailModal.outstandingBalance || 0) > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                                        <p className={`text-[9px] font-black uppercase tracking-widest ${(showDetailModal.outstandingBalance || 0) > 0 ? 'text-red-400' : 'text-gray-400'}`}>Outstanding</p>
                                        <p className={`text-base font-black mt-1 ${(showDetailModal.outstandingBalance || 0) > 0 ? 'text-red-700' : 'text-gray-600'}`}>
                                            GHS {(showDetailModal.outstandingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2">{feeStatusBadge(showDetailModal.feeStatus)}</div>
                            </section>

                            {/* HT Note */}
                            <section>
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <i className="fas fa-sticky-note text-purple-500" /> Headteacher's Note
                                </h4>
                                {showDetailModal.headteacherNote ? (
                                    <div className="bg-purple-50 rounded-xl p-4">
                                        <p className="text-sm text-gray-700 leading-relaxed">{showDetailModal.headteacherNote}</p>
                                        {showDetailModal.notedBy && (
                                            <p className="text-[10px] text-purple-400 font-bold mt-2 text-right">— {showDetailModal.notedBy}</p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">No headteacher note recorded.</p>
                                )}
                            </section>
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                            <button
                                onClick={() => { handleDeleteGraduate(showDetailModal.id!); setShowDetailModal(null); }}
                                className="px-4 py-2 text-red-500 hover:bg-red-50 font-black text-xs rounded-xl transition-all"
                            >
                                <i className="fas fa-trash-alt mr-1" /> Remove
                            </button>
                            <button
                                onClick={() => setShowDetailModal(null)}
                                className="px-5 py-2 bg-gray-800 text-white font-black text-xs rounded-xl uppercase tracking-widest"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Graduate a Student Modal ── */}
            {showGraduateModal && (
                <GraduateStudentModal
                    schoolId={user?.schoolId || ''}
                    userName={user?.fullName || 'Headteacher'}
                    onClose={() => setShowGraduateModal(false)}
                />
            )}
        </div>
    );
};

/* ───────────────────────────────────────── */
/*  Graduate a Student Modal                 */
/* ───────────────────────────────────────── */

interface GraduateStudentModalProps {
    schoolId: string;
    userName: string;
    onClose: () => void;
}

const GraduateStudentModal: React.FC<GraduateStudentModalProps> = ({ schoolId, userName, onClose }) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
    const [graduationYear, setGraduationYear] = useState<number>(new Date().getFullYear());
    const [graduationTerm, setGraduationTerm] = useState<string>('Term 3');
    const [headteacherNote, setHeadteacherNote] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [preview, setPreview] = useState<{
        student: Student;
        className: string;
        overallAverage: number;
        totalSubjects: number;
        passedSubjects: number;
        finalGrade: string;
        totalFeesPaid: number;
        outstandingBalance: number;
        feeStatus: 'cleared' | 'outstanding';
    } | null>(null);

    // All active classes for this school
    const classes = useLiveQuery(async () => {
        if (!schoolId) return [];
        return await eduDb.classes.where('schoolId').equals(schoolId).filter(c => !c.isDeleted).toArray();
    }, [schoolId]);

    // Only show Level 9 students in the graduation picker
    const activeStudents = useLiveQuery(async () => {
        if (!schoolId || !classes) return [];
        // Collect IDs of all Level 9 classes
        const level9ClassIds = new Set(
            classes
                .filter(c => c.level?.trim().toLowerCase() === 'level 9')
                .map(c => c.id!)
        );
        if (level9ClassIds.size === 0) return [];
        return await eduDb.students
            .where('schoolId').equals(schoolId)
            .filter(s => !s.isDeleted && s.classId != null && level9ClassIds.has(s.classId!))
            .toArray();
    }, [schoolId, classes]);

    const handleSelectAndPreview = async (studentId: number) => {
        setSelectedStudentId(studentId);
        const student = activeStudents?.find(s => s.id === studentId);
        if (!student) return;

        const className = classes?.find(c => c.id === student.classId)?.name || 'Unknown Class';

        // Compute academic snapshot from all results
        const allResults = await eduDb.results
            .where('schoolId').equals(schoolId)
            .filter(r => r.studentId === studentId && !r.isDeleted)
            .toArray();

        const totalSubjects = allResults.length;
        const passedSubjects = allResults.filter(r => (r.totalScore || 0) >= 50).length;
        const overallAverage = totalSubjects > 0
            ? Math.round((allResults.reduce((s, r) => s + (r.totalScore || 0), 0) / totalSubjects) * 10) / 10
            : 0;

        // Grade assignment from average
        let finalGrade = 'F';
        if (overallAverage >= 80) finalGrade = 'A';
        else if (overallAverage >= 70) finalGrade = 'B+';
        else if (overallAverage >= 60) finalGrade = 'B';
        else if (overallAverage >= 50) finalGrade = 'C';
        else if (overallAverage >= 40) finalGrade = 'D';

        // Compute financial snapshot
        const allPayments = await eduDb.feePayments
            .where('schoolId').equals(schoolId)
            .filter(p => p.studentId === studentId && !p.isDeleted)
            .toArray();

        const totalFeesPaid = allPayments.reduce((s, p) => s + (p.amountPaid || 0), 0);

        const allStructures = await eduDb.feeStructures
            .where('schoolId').equals(schoolId)
            .filter(f => !f.isDeleted && f.classId === student.classId)
            .toArray();

        const totalFeesDue = allStructures.reduce((s, f) => s + (f.termFeeAmount || 0), 0);
        const outstandingBalance = Math.max(0, totalFeesDue - totalFeesPaid + (student.arrears || 0));
        const feeStatus: 'cleared' | 'outstanding' = outstandingBalance <= 0 ? 'cleared' : 'outstanding';

        setPreview({ student, className, overallAverage, totalSubjects, passedSubjects, finalGrade, totalFeesPaid, outstandingBalance, feeStatus });
        setStep(2);
    };

    const handleGraduate = async () => {
        if (!preview || !selectedStudentId) return;
        setIsProcessing(true);
        try {
            // ── Duplicate guard ──────────────────────────────────────────
            const existing = await eduDb.graduateRecords
                .where('schoolId').equals(schoolId)
                .filter(g => g.studentId === selectedStudentId && !g.isDeleted)
                .first();
            if (existing) {
                showToast(`${preview.student.fullName} already has a graduate record.`, 'error');
                return;
            }

            const now = Date.now();
            await eduDb.graduateRecords.add({
                schoolId,
                studentId: selectedStudentId,
                studentIdCloud: preview.student.idCloud,
                fullName: preview.student.fullName,
                gender: preview.student.gender,
                graduationYear,
                graduationTerm,
                finalClass: preview.className,
                overallAverage: preview.overallAverage,
                totalSubjects: preview.totalSubjects,
                passedSubjects: preview.passedSubjects,
                finalGrade: preview.finalGrade,
                academicSummary: `${preview.passedSubjects}/${preview.totalSubjects} subjects passed with an overall average of ${preview.overallAverage}%.`,
                totalFeesPaid: preview.totalFeesPaid,
                outstandingBalance: preview.outstandingBalance,
                feeStatus: preview.feeStatus,
                headteacherNote: headteacherNote.trim() || undefined,
                notedBy: headteacherNote.trim() ? userName : undefined,
                notedAt: headteacherNote.trim() ? now : undefined,
                isDeleted: false,
                createdAt: now,
                updatedAt: now,
                syncStatus: 'pending',
            });

            // Soft-delete the student from the active student list so they
            // vanish from class rosters, teacher portals, and fee screens.
            await eduDb.students.update(selectedStudentId, {
                isDeleted: true,
                updatedAt: now,
                syncStatus: 'pending',
            });

            showToast(`${preview.student.fullName} has been graduated successfully!`, 'success');
            onClose();
        } catch (err: any) {
            showToast(err.message || 'Failed to graduate student.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden animate-scaleIn">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-6 py-5 flex items-center justify-between">
                    <div>
                        <h3 className="text-white font-black text-lg">
                            {step === 1 ? 'Select Student' : 'Confirm Graduation'}
                        </h3>
                        <p className="text-indigo-200 text-xs mt-0.5">Step {step} of 2</p>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all flex items-center justify-center">
                        <i className="fas fa-times" />
                    </button>
                </div>

                {/* Step 1 – Student Picker */}
                {step === 1 && (
                    <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                        <p className="text-sm text-gray-500 font-medium">Choose a student to graduate. Academic and financial data will be automatically captured.</p>
                        <div className="grid grid-cols-1 gap-2">
                            {activeStudents?.length === 0 && (
                                <div className="py-8 text-center">
                                    <i className="fas fa-filter text-3xl text-gray-200 mb-3 block" />
                                    <p className="text-sm font-black text-gray-400">No Level 9 students found</p>
                                    <p className="text-xs text-gray-300 mt-1">Only learners enrolled in a <strong>Level 9</strong> class are eligible for graduation.</p>
                                </div>
                            )}
                            {activeStudents?.map(s => {
                                const cls = classes?.find(c => c.id === s.classId);
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => s.id && handleSelectAndPreview(s.id)}
                                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all text-left group"
                                    >
                                        <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-500 rounded-xl flex items-center justify-center text-white font-black flex-shrink-0">
                                            {s.fullName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-black text-gray-800 text-sm uppercase truncate group-hover:text-indigo-600">{s.fullName}</p>
                                            <p className="text-[10px] text-gray-400 font-bold">{cls?.name || 'No Class'}</p>
                                        </div>
                                        <i className="fas fa-chevron-right text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Step 2 – Confirm & Details */}
                {step === 2 && preview && (
                    <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
                        {/* Student info */}
                        <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl">
                            <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-indigo-500 rounded-xl flex items-center justify-center text-white font-black">
                                {preview.student.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p className="font-black text-gray-800 uppercase">{preview.student.fullName}</p>
                                <p className="text-[10px] text-gray-500 font-bold">{preview.className}</p>
                            </div>
                        </div>

                        {/* Academic preview */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="bg-blue-50 rounded-xl p-3 text-center">
                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Avg</p>
                                <p className="font-black text-blue-800">{preview.overallAverage}%</p>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-3 text-center">
                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Grade</p>
                                <p className="font-black text-blue-800">{preview.finalGrade}</p>
                            </div>
                            <div className="bg-blue-50 rounded-xl p-3 text-center">
                                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Subjects</p>
                                <p className="font-black text-blue-800">{preview.passedSubjects}/{preview.totalSubjects}</p>
                            </div>
                        </div>

                        {/* Financial preview */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-green-50 rounded-xl p-3">
                                <p className="text-[9px] font-black text-green-400 uppercase tracking-widest">Fees Paid</p>
                                <p className="font-black text-green-800 text-sm">GHS {preview.totalFeesPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className={`rounded-xl p-3 ${preview.outstandingBalance > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                                <p className={`text-[9px] font-black uppercase tracking-widest ${preview.outstandingBalance > 0 ? 'text-red-400' : 'text-gray-400'}`}>Outstanding</p>
                                <p className={`font-black text-sm ${preview.outstandingBalance > 0 ? 'text-red-700' : 'text-gray-600'}`}>GHS {preview.outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                        </div>

                        {/* Graduation details */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-black text-gray-600 mb-1.5 uppercase tracking-wider">Graduation Year</label>
                                <input
                                    type="number"
                                    value={graduationYear}
                                    onChange={e => setGraduationYear(parseInt(e.target.value) || new Date().getFullYear())}
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-400 outline-none text-sm font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-600 mb-1.5 uppercase tracking-wider">Graduation Term</label>
                                <select
                                    value={graduationTerm}
                                    onChange={e => setGraduationTerm(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-400 outline-none text-sm font-bold bg-white"
                                >
                                    <option>Term 1</option>
                                    <option>Term 2</option>
                                    <option>Term 3</option>
                                </select>
                            </div>
                        </div>

                        {/* Optional HT Note */}
                        <div>
                            <label className="block text-xs font-black text-gray-600 mb-1.5 uppercase tracking-wider">
                                <i className="fas fa-sticky-note text-purple-500 mr-1" /> Headteacher's Note (Optional)
                            </label>
                            <textarea
                                value={headteacherNote}
                                onChange={e => setHeadteacherNote(e.target.value)}
                                placeholder="Add a review or recommendation note for this graduate..."
                                rows={3}
                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-sm resize-none"
                            />
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="p-5 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <button
                        onClick={() => step === 1 ? onClose() : setStep(1)}
                        className="px-5 py-2.5 text-gray-500 font-black text-xs hover:bg-gray-100 rounded-xl transition-all"
                    >
                        {step === 1 ? 'Cancel' : <><i className="fas fa-arrow-left mr-1" /> Back</>}
                    </button>
                    {step === 2 && (
                        <button
                            onClick={handleGraduate}
                            disabled={isProcessing}
                            className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-black text-xs rounded-xl uppercase tracking-widest shadow-lg shadow-indigo-200 hover:shadow-xl active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isProcessing
                                ? <><i className="fas fa-spinner animate-spin mr-2" />Processing...</>
                                : <><i className="fas fa-user-graduate mr-2" />Confirm Graduation</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GraduatesManagement;
