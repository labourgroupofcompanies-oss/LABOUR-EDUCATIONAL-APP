import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { dbService } from '../../../services/dbService';
import { showToast } from '../../Common/Toast';
import { type Expense } from '../../../eduDb';

const CATEGORIES = ['Stationery', 'Maintenance', 'Utilities', 'Food/Catering', 'Transport', 'Events', 'Equipment', 'Other'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ExpenseList: React.FC = () => {
    const { user } = useAuth();
    const now = new Date();
    const [showForm, setShowForm] = useState(false);
    const [monthFilter, setMonthFilter] = useState<number | 'all'>('all');
    const [yearFilter, setYearFilter] = useState(now.getFullYear());
    const [showVoided, setShowVoided] = useState(false);

    // Form state
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [receiptNote, setReceiptNote] = useState('');
    const [saving, setSaving] = useState(false);

    // Detail / void modal state
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    const [voidMode, setVoidMode] = useState(false);
    const [voidReason, setVoidReason] = useState('');
    const [voiding, setVoiding] = useState(false);

    const allExpenses = useLiveQuery(async () => {
        if (!user?.schoolId) return [];
        const all = await dbService.expenses.getAll(user.schoolId, true); // always fetch all (incl. voided) for filter
        return all.filter(e => {
            const d = new Date(e.date);
            if (d.getFullYear() !== yearFilter) return false;
            if (monthFilter !== 'all' && (d.getMonth() + 1) !== monthFilter) return false;
            return true;
        });
    }, [user?.schoolId, monthFilter, yearFilter]);

    // Only active records counted in totals
    const activeExpenses = allExpenses?.filter(e => !e.voided) || [];
    const voidedExpenses = allExpenses?.filter(e => e.voided) || [];
    const total = activeExpenses.reduce((sum, e) => sum + e.amount, 0);

    const byCategory: Record<string, number> = {};
    activeExpenses.forEach(e => {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    const handleAdd = async () => {
        if (!user?.schoolId) return;
        if (!description.trim() || !amount) { showToast('Fill in all required fields', 'error'); return; }
        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
        setSaving(true);
        try {
            await dbService.expenses.add({
                schoolId: user.schoolId,
                category,
                description: description.trim(),
                amount: amt,
                date: new Date(date).getTime(),
                receiptNote: receiptNote.trim() || undefined,
                addedBy: user.id,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending',
            });
            showToast('Expense recorded', 'success');
            setDescription(''); setAmount(''); setReceiptNote('');
            setShowForm(false);
        } catch { showToast('Failed to save expense', 'error'); }
        finally { setSaving(false); }
    };

    const handleVoid = async () => {
        if (!selectedExpense?.id) return;
        if (!voidReason.trim()) { showToast('Please enter a reason for voiding', 'error'); return; }
        setVoiding(true);
        try {
            await dbService.expenses.voidExpense(selectedExpense.id, voidReason.trim());
            showToast('Expense voided', 'info');
            setSelectedExpense(null);
            setVoidMode(false);
            setVoidReason('');
        } catch { showToast('Failed to void expense', 'error'); }
        finally { setVoiding(false); }
    };

    const openDetail = (e: Expense) => {
        setSelectedExpense(e);
        setVoidMode(false);
        setVoidReason('');
    };

    const closeModal = () => {
        setSelectedExpense(null);
        setVoidMode(false);
        setVoidReason('');
    };

    // Decide which records to show in the list
    const displayedExpenses = showVoided ? allExpenses || [] : activeExpenses;

    const fmt = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

    return (
        <div className="space-y-8 md:space-y-12 animate-fadeIn pb-12">
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight mb-1">Expenses</h2>
                    <p className="text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2">
                        Track all school expenditures
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(s => !s)}
                    className={`${showForm ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-slate-800 text-white hover:bg-slate-900'} px-6 py-3.5 rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg ${showForm ? 'shadow-none' : 'shadow-slate-300'} w-full sm:w-auto`}
                >
                    <i className={`fas ${showForm ? 'fa-times' : 'fa-plus text-purple-400'}`}></i>
                    {showForm ? 'Cancel' : 'Record Expense'}
                </button>
            </div>

            {/* Add Expense Form */}
            {showForm && (
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 md:p-10 space-y-6">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center text-xl">
                            <i className="fas fa-receipt"></i>
                        </div>
                        <div>
                            <h3 className="font-black text-slate-800 text-lg">New Expense</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enter details below</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                            <select value={category} onChange={e => setCategory(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-700 focus:bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none transition-all cursor-pointer">
                                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Amount (GHS) <span className="text-red-400">*</span></label>
                            <input type="number" min="0" step="0.01" placeholder="0.00"
                                value={amount} onChange={e => setAmount(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-700 focus:bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none transition-all" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description <span className="text-red-400">*</span></label>
                            <input type="text" placeholder="e.g. Chalk and markers for classrooms"
                                value={description} onChange={e => setDescription(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none transition-all" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Date</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none transition-all" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Receipt / Note (Optional)</label>
                            <input type="text" placeholder="Receipt #, vendor name..."
                                value={receiptNote} onChange={e => setReceiptNote(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-purple-400 focus:border-transparent outline-none transition-all" />
                        </div>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-slate-100">
                        <button onClick={handleAdd} disabled={saving}
                            className="bg-purple-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-purple-200 flex items-center justify-center gap-2 w-full sm:w-auto">
                            {saving ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-check"></i> Save Expense</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Filters & Totals */}
            <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30 flex flex-col xl:flex-row gap-4 justify-between items-center">
                <div className="flex flex-wrap gap-3 w-full xl:w-auto justify-center xl:justify-start">
                    <select value={monthFilter as any} onChange={e => setMonthFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                        className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-xs font-black text-slate-600 focus:bg-white focus:ring-2 focus:ring-purple-400 outline-none transition-all cursor-pointer">
                        <option value="all">All Months</option>
                        {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <select value={yearFilter} onChange={e => setYearFilter(parseInt(e.target.value))}
                        className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-xs font-black text-slate-600 focus:bg-white focus:ring-2 focus:ring-purple-400 outline-none transition-all cursor-pointer">
                        {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y}>{y}</option>)}
                    </select>
                    
                    {voidedExpenses.length > 0 && (
                        <button
                            onClick={() => setShowVoided(v => !v)}
                            className={`px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${showVoided ? 'bg-slate-800 text-white border-slate-800 shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                        >
                            <i className={`fas ${showVoided ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            {showVoided ? 'Hide Voided' : `Show Voided (${voidedExpenses.length})`}
                        </button>
                    )}
                </div>

                <div className="bg-rose-50 text-rose-600 px-6 py-4 rounded-[1.5rem] flex flex-col items-center xl:items-end w-full xl:w-auto">
                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-1">Total Period Expenses</span>
                    <span className="text-xl md:text-2xl font-black leading-none">{fmt(total)}</span>
                </div>
            </div>

            {/* By Category Chips */}
            {Object.keys(byCategory).length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {Object.entries(byCategory).map(([cat, amt]) => (
                        <span key={cat} className="bg-white border border-slate-100 shadow-sm text-slate-600 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                            {cat}: <span className="text-slate-800">{fmt(amt)}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Expense List */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                {!displayedExpenses.length ? (
                    <div className="px-6 py-24 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fas fa-receipt text-2xl text-slate-300"></i>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No expenses for this period</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {displayedExpenses.map((e, i) => (
                            <div
                                key={i}
                                onClick={() => openDetail(e)}
                                className={`px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors cursor-pointer group ${e.voided ? 'bg-slate-50/80 hover:bg-slate-100/60 opacity-60' : 'hover:bg-purple-50/40'}`}
                            >
                                <div className="flex items-start sm:items-center gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 transition-colors ${e.voided ? 'bg-slate-100 text-slate-400' : 'bg-purple-50 text-purple-500 group-hover:bg-purple-100'}`}>
                                        <i className={`fas ${e.voided ? 'fa-ban' : 'fa-receipt'}`}></i>
                                    </div>
                                    <div>
                                        <p className={`font-black text-sm sm:text-base leading-tight mb-1 ${e.voided ? 'line-through text-slate-400' : 'text-slate-800 group-hover:text-purple-700 transition-colors'}`}>
                                            {e.description}
                                        </p>
                                        <p className="text-[10px] font-bold text-slate-400 flex flex-wrap items-center gap-2 uppercase tracking-widest">
                                            <span className={`px-2 py-0.5 rounded-md ${e.voided ? 'bg-slate-100 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{e.category}</span>
                                            <span>{new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})}</span>
                                            {e.voided && <span className="bg-rose-50 text-rose-500 px-2 py-0.5 rounded-md">VOIDED</span>}
                                            {e.receiptNote && <span className="text-slate-300 flex items-center gap-1"><i className="fas fa-paperclip"></i> {e.receiptNote}</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center self-end sm:self-center">
                                    <span className={`text-lg font-black ${e.voided ? 'text-slate-300 line-through' : 'text-rose-500'}`}>
                                        {fmt(e.amount)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Expense Detail / Void Modal ── */}
            {selectedExpense && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn"
                    onClick={closeModal}
                >
                    <div
                        className="bg-white w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-slideUp"
                        onClick={ev => ev.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-50 bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${selectedExpense.voided ? 'bg-slate-200 text-slate-500' : 'bg-purple-100 text-purple-600'}`}>
                                    <i className={`fas ${selectedExpense.voided ? 'fa-ban' : 'fa-receipt'}`}></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg">Expense Detail</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] font-black bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md uppercase tracking-widest">
                                            {selectedExpense.category}
                                        </span>
                                        {selectedExpense.voided && (
                                            <span className="text-[9px] font-black bg-rose-50 text-rose-500 px-2 py-0.5 rounded-md uppercase tracking-widest">Voided</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button onClick={closeModal} className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 hover:bg-slate-100 text-slate-400 transition-colors shadow-sm">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Detail rows */}
                        <div className="px-8 py-6 space-y-6">
                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Description</p>
                                <p className={`text-base font-bold leading-tight ${selectedExpense.voided ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                    {selectedExpense.description}
                                </p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50">
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount</p>
                                    <p className={`text-2xl tracking-tight font-black ${selectedExpense.voided ? 'line-through text-slate-300' : 'text-rose-500'}`}>
                                        {fmt(selectedExpense.amount)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Date</p>
                                    <p className="text-sm font-black text-slate-700">
                                        {new Date(selectedExpense.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>

                            {selectedExpense.receiptNote ? (
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Receipt / Note</p>
                                    <p className="text-sm font-bold text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 flex items-start gap-3">
                                        <i className="fas fa-paperclip text-slate-400 mt-1"></i>
                                        <span>{selectedExpense.receiptNote}</span>
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Receipt / Note</p>
                                    <p className="text-xs font-bold text-slate-300 italic">No receipt note added</p>
                                </div>
                            )}

                            {/* Void reason (if already voided) */}
                            {selectedExpense.voided && (
                                <div className="bg-rose-50 rounded-2xl p-4 border border-rose-100">
                                    <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1.5">Void Reason</p>
                                    <p className="text-sm font-black text-rose-700">{selectedExpense.voidReason}</p>
                                    {selectedExpense.voidedAt && (
                                        <p className="text-[10px] font-bold text-rose-400 mt-2">
                                            Voided on {new Date(selectedExpense.voidedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Void reason input (when initiating void) */}
                            {voidMode && !selectedExpense.voided && (
                                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 space-y-3 animate-fadeIn">
                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                                        <i className="fas fa-exclamation-triangle"></i>
                                        Confirm Void — this cannot be undone
                                    </p>
                                    <input
                                        type="text"
                                        placeholder="Reason for voiding (required)..."
                                        value={voidReason}
                                        onChange={e => setVoidReason(e.target.value)}
                                        className="w-full border border-amber-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 outline-none bg-white placeholder:text-slate-300"
                                        autoFocus
                                    />
                                </div>
                            )}

                            <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">System Record</p>
                                <p className="text-[10px] font-bold text-slate-400">
                                    Created {new Date(selectedExpense.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div className="px-8 pb-8 flex flex-col sm:flex-row gap-3">
                            {selectedExpense.voided ? (
                                // Already voided — just close
                                <button onClick={closeModal} className="w-full bg-slate-800 text-white py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-slate-200">
                                    Close
                                </button>
                            ) : voidMode ? (
                                // Void confirmation row
                                <>
                                    <button onClick={() => setVoidMode(false)} className="flex-1 border bg-white border-slate-200 text-slate-600 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all">
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleVoid}
                                        disabled={voiding || !voidReason.trim()}
                                        className="flex-1 bg-rose-500 text-white py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-rose-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-rose-200"
                                    >
                                        {voiding ? <><i className="fas fa-spinner fa-spin"></i> Voiding...</> : <><i className="fas fa-ban"></i> Confirm Void</>}
                                    </button>
                                </>
                            ) : (
                                // Normal detail row
                                <>
                                    <button onClick={closeModal} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all">
                                        Close
                                    </button>
                                    <button
                                        onClick={() => setVoidMode(true)}
                                        className="flex-1 bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                    >
                                        <i className="fas fa-ban"></i> Void Record
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpenseList;
