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
                    className={`${showForm ? 'btn-secondary' : 'btn-primary !from-slate-800 !to-slate-900 shadow-slate-300'} w-full sm:w-auto`}
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
                            className="btn-primary !from-purple-600 !to-purple-700 shadow-purple-200 w-full sm:w-auto">
                            {saving ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-check"></i> Save Expense</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Filters & Totals */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Search & Filters Card */}
                <div className="flex-1 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 flex-1 min-w-[200px]">
                        <i className="fas fa-filter text-slate-400 text-xs"></i>
                        <select value={monthFilter as any} onChange={e => setMonthFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                            className="bg-transparent border-none py-3 text-xs font-black text-slate-600 focus:ring-0 outline-none transition-all cursor-pointer flex-1">
                            <option value="all">All Months</option>
                            {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-1 w-full sm:w-auto">
                        <i className="fas fa-calendar-alt text-slate-400 text-xs"></i>
                        <select value={yearFilter} onChange={e => setYearFilter(parseInt(e.target.value))}
                            className="bg-transparent border-none py-3 text-xs font-black text-slate-600 focus:ring-0 outline-none transition-all cursor-pointer">
                            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y}>{y}</option>)}
                        </select>
                    </div>
                    
                    {voidedExpenses.length > 0 && (
                        <button
                            onClick={() => setShowVoided(v => !v)}
                            className={`btn-sm !h-[46px] flex items-center gap-2 ${showVoided ? 'btn-primary !from-slate-800 !to-slate-900 shadow-lg' : 'btn-outline'}`}
                        >
                            <i className={`fas ${showVoided ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            {showVoided ? 'Hide Void' : `Voided (${voidedExpenses.length})`}
                        </button>
                    )}
                </div>

                {/* Totals Card - Premium Look */}
                <div className="lg:w-80 bg-gradient-to-br from-rose-500 to-rose-600 p-6 rounded-[2rem] shadow-xl shadow-rose-200 text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-125 transition-transform duration-500"></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-100 mb-2">Total Expenditures</p>
                        <div className="flex items-end justify-between gap-2">
                            <h3 className="text-2xl font-black tracking-tight">{fmt(total)}</h3>
                            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20">
                                <i className="fas fa-chart-line"></i>
                            </div>
                        </div>
                    </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {!displayedExpenses.length ? (
                    <div className="md:col-span-2 lg:col-span-3 bg-white px-6 py-24 text-center rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fas fa-receipt text-2xl text-slate-300"></i>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No expenses for this period</p>
                    </div>
                ) : (
                    displayedExpenses.map((e, i) => (
                        <div
                            key={i}
                            onClick={() => openDetail(e)}
                            className={`bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden flex flex-col gap-5 ${e.voided ? 'opacity-60 grayscale' : 'hover:border-purple-200'}`}
                        >
                            {/* Category Badge - Floating top right */}
                            <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${e.voided ? 'bg-slate-100 text-slate-400' : 'bg-purple-50 text-purple-600'}`}>
                                {e.category}
                            </div>

                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 transition-all ${e.voided ? 'bg-slate-100 text-slate-400' : 'bg-purple-50 text-purple-500 group-hover:bg-purple-600 group-hover:text-white shadow-sm'}`}>
                                    <i className={`fas ${e.voided ? 'fa-ban' : 'fa-receipt'}`}></i>
                                </div>
                                <div className="min-w-0">
                                    <p className={`font-black text-sm leading-tight truncate ${e.voided ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                        {e.description}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                                        <i className="far fa-calendar-alt"></i>
                                        {new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-50 flex items-center justify-between mt-auto">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-0.5">Amount Paid</span>
                                    <span className={`text-lg font-black ${e.voided ? 'text-slate-300 line-through' : 'text-rose-500'}`}>
                                        {fmt(e.amount)}
                                    </span>
                                </div>
                                {e.receiptNote && (
                                    <div className="flex items-center gap-1.5 text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100/50">
                                        <i className="fas fa-paperclip text-[10px]"></i>
                                        <span className="text-[9px] font-bold truncate max-w-[80px]">{e.receiptNote}</span>
                                    </div>
                                )}
                            </div>
                            
                            {e.voided && (
                                <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px]">
                                    <span className="bg-rose-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] rotate-[-12deg] shadow-lg">VOIDED</span>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* ── Expense Detail / Void Modal ── */}
            {selectedExpense && (
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn"
                    onClick={closeModal}
                >
                    <div
                        className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-zoomIn border border-white/20"
                        onClick={ev => ev.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="relative px-8 pt-10 pb-6 border-b border-slate-50 bg-slate-50/30">
                            <div className="flex items-center gap-6">
                                <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-2xl shadow-sm ${selectedExpense.voided ? 'bg-slate-200 text-slate-500' : 'bg-purple-600 text-white shadow-purple-200'}`}>
                                    <i className={`fas ${selectedExpense.voided ? 'fa-ban' : 'fa-receipt'}`}></i>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Expense Transaction</p>
                                    <h3 className="font-black text-slate-800 text-xl leading-tight truncate">
                                        {selectedExpense.description}
                                    </h3>
                                </div>
                            </div>
                            <button onClick={closeModal} className="btn-icon absolute top-8 right-8 shadow-sm">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Detail content */}
                        <div className="px-10 py-8 space-y-8">
                            {/* Primary Info Row */}
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount Paid</p>
                                    <p className={`text-2xl font-black tracking-tight ${selectedExpense.voided ? 'line-through text-slate-300' : 'text-rose-500'}`}>
                                        {fmt(selectedExpense.amount)}
                                    </p>
                                </div>
                                <div className="space-y-1 text-right">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transaction Date</p>
                                    <p className="text-sm font-black text-slate-700">
                                        {new Date(selectedExpense.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>

                            {/* Meta Info Grid */}
                            <div className="grid grid-cols-2 gap-6 p-6 rounded-[2rem] bg-slate-50/50 border border-slate-100">
                                <div className="space-y-1.5">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</p>
                                    <div className="flex">
                                        <span className="px-3 py-1 bg-white border border-slate-200 text-slate-600 text-[10px] font-black rounded-lg uppercase tracking-wider">
                                            {selectedExpense.category}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Receipt / Note</p>
                                    {selectedExpense.receiptNote ? (
                                        <p className="text-[10px] font-bold text-slate-600 flex items-center gap-2 truncate">
                                            <i className="fas fa-paperclip text-slate-400"></i>
                                            {selectedExpense.receiptNote}
                                        </p>
                                    ) : (
                                        <p className="text-[10px] font-bold text-slate-300 italic">No notes attached</p>
                                    )}
                                </div>
                            </div>

                            {/* Status Section */}
                            {selectedExpense.voided ? (
                                <div className="bg-rose-50 rounded-[1.5rem] p-5 border border-rose-100 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-10">
                                        <i className="fas fa-ban text-4xl text-rose-900"></i>
                                    </div>
                                    <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <i className="fas fa-exclamation-circle"></i>
                                        Voided Record Detail
                                    </p>
                                    <p className="text-sm font-black text-rose-700 leading-relaxed mb-3">"{selectedExpense.voidReason}"</p>
                                    <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">
                                        Voided on {new Date(selectedExpense.voidedAt || 0).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            ) : voidMode ? (
                                <div className="bg-amber-50 rounded-[1.5rem] p-5 border border-amber-100 space-y-4 animate-fadeIn">
                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                                        <i className="fas fa-exclamation-triangle"></i>
                                        Confirm Action: Void Transaction
                                    </p>
                                    <input
                                        type="text"
                                        placeholder="Reason for voiding (required)..."
                                        value={voidReason}
                                        onChange={e => setVoidReason(e.target.value)}
                                        className="w-full bg-white border border-amber-200 rounded-xl px-5 py-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 outline-none transition-all placeholder:text-slate-300 shadow-inner"
                                        autoFocus
                                    />
                                    <p className="text-[9px] font-bold text-amber-500/70 leading-normal">
                                        * Voiding will remove this amount from school totals and cannot be undone.
                                    </p>
                                </div>
                            ) : null}

                            <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">System Authenticated</p>
                                </div>
                                <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                                    Ref: {String(selectedExpense.id).slice(-8).toUpperCase()}
                                </p>
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div className="px-10 pb-10 flex gap-4">
                            {selectedExpense.voided ? (
                                <button onClick={closeModal} className="btn-primary w-full shadow-slate-200 !from-slate-800 !to-slate-900">
                                    Close Detail
                                </button>
                            ) : voidMode ? (
                                <>
                                    <button onClick={() => setVoidMode(false)} className="flex-1 bg-white border border-slate-200 text-slate-500 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all">
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleVoid}
                                        disabled={voiding || !voidReason.trim()}
                                        className="btn-primary flex-[1.5] !from-rose-500 !to-rose-600 shadow-rose-200"
                                    >
                                        {voiding ? <><i className="fas fa-spinner fa-spin"></i> Voiding...</> : <><i className="fas fa-ban"></i> Confirm Void</>}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button onClick={closeModal} className="flex-1 bg-white border border-slate-200 text-slate-500 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all">
                                        Back
                                    </button>
                                    <button
                                        onClick={() => setVoidMode(true)}
                                        className="btn-outline flex-1 border-rose-100 text-rose-500 hover:!border-rose-500 hover:!text-white hover:bg-rose-500 group"
                                    >
                                        <i className="fas fa-ban group-hover:rotate-90 transition-transform"></i> Void Record
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
