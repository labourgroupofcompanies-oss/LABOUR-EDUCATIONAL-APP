import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { dbService } from '../../../services/dbService';
import { syncManager } from '../../../services/syncManager';
import { showToast } from '../../Common/Toast';
import { type PayrollRecord } from '../../../eduDb';
import Payslip from './Payslip';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

interface PayrollRow {
    staffId: number;
    staffIdCloud?: string;
    name: string;
    role: string;
    record?: PayrollRecord;
    grossInput: string;
    deductionInput: string;
    deductionNotes: string;
    methodInput: PayrollRecord['paymentMethod'];
}

const PayrollDashboard: React.FC = () => {
    const { user } = useAuth();
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [rows, setRows] = useState<PayrollRow[]>([]);
    const [saving, setSaving] = useState<number | null>(null);
    const [viewPayslip, setViewPayslip] = useState<PayrollRecord | null>(null);
    const [confirmingCodeFor, setConfirmingCodeFor] = useState<PayrollRow | null>(null);
    const [codeEntry, setCodeEntry] = useState('');

    const allStaff = useLiveQuery(() =>
        user?.schoolId ? dbService.staff.getAll(user.schoolId) : [], [user?.schoolId]);

    const payrollRecords = useLiveQuery(() =>
        user?.schoolId ? dbService.payroll.getByMonth(user.schoolId, month, year) : [],
        [user?.schoolId, month, year]);

    const prevPeriod = React.useRef({ month, year });

    // Build or Update rows when data results change
    React.useEffect(() => {
        if (!allStaff) return;
        
        const isNewPeriod = prevPeriod.current.month !== month || prevPeriod.current.year !== year;
        prevPeriod.current = { month, year };

        setRows(prev => {
            // Map over all staff to create/update rows
            return allStaff.map(s => {
                const dbRecord = payrollRecords?.find(r => 
                    (r.staffIdCloud && s.idCloud && r.staffIdCloud === s.idCloud) ||
                    (!r.staffIdCloud && r.staffId === s.id)
                );

                // Find existing row to see if we should preserve user input
                const existing = isNewPeriod ? null : prev.find(r => r.staffId === s.id);

                if (existing) {
                    // Check if the user has modified the UI fields from the last known DB state
                    const grossModified = existing.grossInput !== (existing.record?.grossSalary.toString() || '');
                    const deductionsModified = existing.deductionInput !== (existing.record?.deductions.toString() || '0');
                    const notesModified = existing.deductionNotes !== (existing.record?.deductionNotes || '');
                    const methodModified = existing.methodInput !== (existing.record?.paymentMethod || 'Cash');

                    // Smart update: Only keep user's current input if they've explicitly changed it.
                    // Otherwise, allow the database value (e.g. from cloud pull) to reflect in the UI.
                    return {
                        ...existing,
                        staffIdCloud: s.idCloud,
                        name: s.fullName || s.username,
                        role: s.role,
                        record: dbRecord,
                        grossInput: grossModified ? existing.grossInput : (dbRecord?.grossSalary ? dbRecord.grossSalary.toString() : ''),
                        deductionInput: deductionsModified ? existing.deductionInput : (dbRecord?.deductions ? dbRecord.deductions.toString() : ''),
                        deductionNotes: notesModified ? existing.deductionNotes : (dbRecord?.deductionNotes || ''),
                        methodInput: methodModified ? existing.methodInput : (dbRecord?.paymentMethod || 'Cash'),
                    };
                } else {
                    // Initial load or new period: Populate from database
                    return {
                        staffId: s.id!,
                        staffIdCloud: s.idCloud,
                        name: s.fullName || s.username,
                        role: s.role,
                        record: dbRecord,
                        grossInput: dbRecord?.grossSalary ? dbRecord.grossSalary.toString() : '',
                        deductionInput: dbRecord?.deductions ? dbRecord.deductions.toString() : '',
                        deductionNotes: dbRecord?.deductionNotes || '',
                        methodInput: dbRecord?.paymentMethod || 'Cash',
                    };
                }
            });
        });
    }, [allStaff, payrollRecords, month, year]);

    const updateRow = (i: number, changes: Partial<PayrollRow>) => {
        setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...changes } : r));
    };

    const handleSave = async (row: PayrollRow, i: number) => {
        if (!user?.schoolId) return;
        const gross = parseFloat(row.grossInput);
        const deductions = parseFloat(row.deductionInput || '0');
        if (isNaN(gross) || gross < 0) { showToast('Enter a valid gross salary', 'error'); return; }
        setSaving(i);
        try {
            await dbService.payroll.upsert({
                schoolId: user.schoolId,
                staffId: row.staffId,
                staffIdCloud: row.staffIdCloud,
                staffName: row.name,
                staffRole: row.role,
                month,
                year,
                grossSalary: gross,
                deductions: isNaN(deductions) ? 0 : deductions,
                deductionNotes: row.deductionNotes || undefined,
                netPay: gross - (isNaN(deductions) ? 0 : deductions),
                paymentMethod: row.methodInput,
                status: row.record?.status || 'Pending',
                paidAt: row.record?.paidAt,
                createdAt: row.record?.createdAt || Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending',
            });
            showToast(`Payroll saved for ${row.name}`, 'success');
            syncManager.triggerSync(true);
        } catch { showToast('Failed to save', 'error'); }
        finally { setSaving(null); }
    };

    const handleSignalReady = async (row: PayrollRow) => {
        if (!user?.schoolId) return;
        const gross = parseFloat(row.grossInput);
        const deductions = parseFloat(row.deductionInput || '0');
        if (isNaN(gross) || gross < 0) { showToast('Enter a valid gross salary', 'error'); return; }

        try {
            const savedId = await dbService.payroll.upsert({
                ...(row.record || {}),
                schoolId: user.schoolId,
                staffId: row.staffId,
                staffIdCloud: row.staffIdCloud,
                staffName: row.name,
                staffRole: row.role,
                month,
                year,
                grossSalary: gross,
                deductions: isNaN(deductions) ? 0 : deductions,
                deductionNotes: row.deductionNotes || undefined,
                netPay: gross - (isNaN(deductions) ? 0 : deductions),
                paymentMethod: row.methodInput,
                status: row.record?.status || 'Pending', 
                paidAt: row.record?.paidAt,
                createdAt: row.record?.createdAt || Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending',
            } as any);
            
            const rId = typeof savedId === 'number' ? savedId : row.record?.id;
            if (rId) {
                await dbService.payroll.signalReady(rId);
                showToast(`Signaled ${row.name} for collection`, 'success');
                syncManager.triggerSync(true);
            }
        } catch { showToast('Failed to signal ready', 'error'); }
    };

    const totalNet = rows.reduce((sum, r) => {
        const g = parseFloat(r.grossInput || '0');
        const d = parseFloat(r.deductionInput || '0');
        return sum + (g - d);
    }, 0);

    const paidCount = rows.filter(r => r.record?.status === 'Paid').length;

    return (
        <div className="space-y-8 md:space-y-12 animate-fadeIn pb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight mb-1">Payroll Run</h2>
                    <p className="text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2">
                        Assign salaries and mark staff as paid
                    </p>
                </div>
                <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-100 gap-2 w-full sm:w-auto">
                    <select
                        value={month}
                        onChange={e => setMonth(parseInt(e.target.value))}
                        className="border-none bg-slate-50 rounded-xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-indigo-400 outline-none w-full sm:w-auto cursor-pointer"
                    >
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <select
                        value={year}
                        onChange={e => setYear(parseInt(e.target.value))}
                        className="border-none bg-slate-50 rounded-xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-indigo-400 outline-none w-full sm:w-auto cursor-pointer"
                    >
                        {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - 15 + i).map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {/* ── Summary bar ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {[
                    { label: 'Net Pay', val: `GHS ${totalNet.toLocaleString()}`, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
                    { label: 'Staff Paid', val: `${paidCount}/${rows.length}`, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                    { label: 'Period', val: `${MONTHS[month - 1].slice(0, 3)} ${year}`, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100' },
                ].map((s, idx) => (
                    <div key={s.label} className={`px-4 py-4 md:px-6 md:py-5 rounded-[1.25rem] md:rounded-[2rem] border ${s.border} ${s.bg} flex flex-col justify-center ${idx === 2 ? 'col-span-2 md:col-span-1' : 'col-span-1'}`}>
                        <p className={`text-base md:text-2xl font-black ${s.color} leading-none mb-1 md:mb-1.5`}>{s.val}</p>
                        <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Desktop Table (hidden on mobile) ── */}
            <div className="hidden lg:block bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                {['S/N', 'Staff', 'Role', 'Gross (GHS)', 'Deductions', 'Notes', 'Net Pay', 'Method', 'Status', ''].map(h => (
                                    <th key={h} className="px-6 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-24 text-center">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <i className="fas fa-users text-2xl text-slate-300"></i>
                                        </div>
                                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No staff found</p>
                                    </td>
                                </tr>
                            ) : rows.map((row, i) => {
                                const gross = parseFloat(row.grossInput || '0');
                                const ded = parseFloat(row.deductionInput || '0');
                                const net = gross - ded;
                                return (
                                    <tr key={row.staffId} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-5 font-black text-slate-400 text-sm whitespace-nowrap">{i + 1}</td>
                                        <td className="px-6 py-5 font-black text-slate-800 text-sm whitespace-nowrap group-hover:text-indigo-600 transition-colors">{row.name}</td>
                                        <td className="px-6 py-5">
                                            <span className="text-[9px] font-black bg-purple-50 text-purple-600 px-2.5 py-1 rounded-md uppercase tracking-widest">{row.role}</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <input
                                                type="number" min="0" step="0.01" placeholder="0.00"
                                                value={row.grossInput}
                                                onChange={e => updateRow(i, { grossInput: e.target.value })}
                                                disabled={row.record?.status === 'Paid' || row.record?.status === 'Ready'}
                                                className="w-28 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none disabled:bg-slate-50 disabled:text-slate-400 transition-all shadow-inner"
                                            />
                                        </td>
                                        <td className="px-6 py-5">
                                            <input
                                                type="number" min="0" step="0.01" placeholder="0.00"
                                                 value={row.deductionInput}
                                                onChange={e => updateRow(i, { deductionInput: e.target.value })}
                                                disabled={row.record?.status === 'Paid' || row.record?.status === 'Ready'}
                                                className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50 disabled:text-slate-400 transition-all shadow-inner"
                                            />
                                        </td>
                                        <td className="px-6 py-5">
                                            <input
                                                type="text" placeholder="Reason..."
                                                value={row.deductionNotes}
                                                onChange={e => updateRow(i, { deductionNotes: e.target.value })}
                                                disabled={row.record?.status === 'Paid' || row.record?.status === 'Ready'}
                                                className="w-32 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-600 focus:bg-white focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50 disabled:text-slate-300 transition-all shadow-inner placeholder:text-slate-300"
                                            />
                                        </td>
                                        <td className="px-6 py-5 font-black text-indigo-700 text-base">
                                            GHS {isNaN(net) ? '0.00' : net.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-5">
                                            <select
                                                 value={row.methodInput}
                                                onChange={e => updateRow(i, { methodInput: e.target.value as any })}
                                                className="border border-slate-200 rounded-xl px-3 py-2 text-[10px] uppercase tracking-widest font-black bg-white focus:ring-2 focus:ring-indigo-400 outline-none cursor-pointer"
                                            >
                                                <option>Cash</option>
                                                <option>Bank Transfer</option>
                                                <option>MoMo</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-5">
                                            {row.record?.status === 'Paid' ? (
                                                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest">
                                                    <i className="fas fa-check-circle"></i> Paid
                                                </span>
                                            ) : row.record?.status === 'Ready' ? (
                                                <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-600 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest animate-pulse">
                                                    <i className="fas fa-bell"></i> Ready
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest">
                                                    <i className="fas fa-clock"></i> Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex gap-2 justify-end">
                                                {(!row.record || row.record.status === 'Pending') && (
                                                    <>
                                                        <button
                                                            onClick={() => handleSave(row, i)}
                                                            disabled={saving === i}
                                                            className="bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-100 hover:border-indigo-200 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all disabled:opacity-50 shadow-sm"
                                                        >
                                                            {saving === i ? <i className="fas fa-spinner fa-spin"></i> : 'Save'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleSignalReady(row)}
                                                            className="bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-sm"
                                                        >
                                                            Signal Ready
                                                        </button>
                                                    </>
                                                )}
                                                {row.record?.status === 'Ready' && (
                                                    <button
                                                        onClick={() => setConfirmingCodeFor(row)}
                                                        className="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-sm"
                                                    >
                                                        Disburse
                                                    </button>
                                                )}
                                                {row.record && (
                                                    <button
                                                        onClick={() => setViewPayslip(row.record!)}
                                                        className="bg-slate-50 text-slate-500 hover:bg-slate-800 hover:text-white border border-slate-200 hover:border-transparent px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-sm"
                                                    >
                                                        <i className="fas fa-file-invoice mr-1.5"></i> Slip
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Mobile Card List (shown only on lg down) ── */}
            <div className="lg:hidden space-y-4">
                {rows.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-14 text-center text-slate-300 text-sm">
                        No staff found
                    </div>
                ) : rows.map((row, i) => {
                    const gross = parseFloat(row.grossInput || '0');
                    const ded = parseFloat(row.deductionInput || '0');
                    const net = gross - ded;
                    return (
                        <div key={row.staffId} className={`bg-white rounded-[2rem] border shadow-xl overflow-hidden ${row.record?.status === 'Paid' ? 'border-emerald-100 shadow-emerald-100/20' : row.record?.status === 'Ready' ? 'border-amber-200 shadow-amber-200/40' : 'border-slate-100 shadow-slate-200/40'}`}>
                            {/* Card header */}
                            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-50">
                                <div>
                                    <p className="font-black text-slate-800 text-base leading-tight">{row.name}</p>
                                    <span className="inline-block mt-2 text-[9px] font-black bg-purple-50 text-purple-600 px-2 py-0.5 rounded-md uppercase tracking-widest">
                                        {row.role}
                                    </span>
                                </div>
                                {row.record?.status === 'Paid' ? (
                                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest shrink-0">
                                        <i className="fas fa-check-circle"></i> Paid
                                    </span>
                                ) : row.record?.status === 'Ready' ? (
                                    <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-600 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest shrink-0 animate-pulse">
                                        <i className="fas fa-bell"></i> Ready
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest shrink-0">
                                        <i className="fas fa-clock"></i> Pending
                                    </span>
                                )}
                            </div>

                            {/* Input fields in 2-col grid */}
                            <div className="p-6 pb-4 space-y-4 bg-slate-50/50">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Gross (GHS)</label>
                                        <input
                                            type="number" min="0" step="0.01" placeholder="0.00"
                                            value={row.grossInput}
                                            onChange={e => updateRow(i, { grossInput: e.target.value })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-400 outline-none shadow-sm"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Deductions</label>
                                            <input
                                                type="number" min="0" step="0.01" placeholder="0.00"
                                                value={row.deductionInput}
                                                onChange={e => updateRow(i, { deductionInput: e.target.value })}
                                                disabled={row.record?.status === 'Paid' || row.record?.status === 'Ready'}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black focus:ring-2 focus:ring-indigo-400 outline-none shadow-sm disabled:bg-slate-50 disabled:text-slate-400"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Reason/Note</label>
                                            <input
                                                type="text" placeholder="Note..."
                                                value={row.deductionNotes}
                                                onChange={e => updateRow(i, { deductionNotes: e.target.value })}
                                                disabled={row.record?.status === 'Paid' || row.record?.status === 'Ready'}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-400 outline-none shadow-sm disabled:bg-slate-50 disabled:text-slate-300 placeholder:text-slate-300"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 items-end border-t border-slate-100 pt-4">
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Pay</label>
                                        <p className="text-xl font-black text-indigo-700 tracking-tight">GHS {isNaN(net) ? '0.00' : net.toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Method</label>
                                        <select
                                            value={row.methodInput}
                                            onChange={e => updateRow(i, { methodInput: e.target.value as any })}
                                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-400 outline-none"
                                        >
                                            <option>Cash</option>
                                            <option>Bank Transfer</option>
                                            <option>MoMo</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 pt-0 space-y-3 bg-slate-50/50">
                                {(!row.record || row.record.status === 'Pending') && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => handleSave(row, i)}
                                            disabled={saving === i}
                                            className="bg-indigo-600 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                                        >
                                            {saving === i ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-save"></i> Save</>}
                                        </button>
                                        <button
                                            onClick={() => handleSignalReady(row)}
                                            className="bg-amber-500 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-600 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-200"
                                        >
                                            <i className="fas fa-bell"></i> Signal Ready
                                        </button>
                                    </div>
                                )}
                                {row.record?.status === 'Ready' && (
                                    <button
                                        onClick={() => setConfirmingCodeFor(row)}
                                        className="w-full bg-emerald-500 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                                    >
                                        <i className="fas fa-handshake"></i> Disburse Funds
                                    </button>
                                )}
                                {row.record && (
                                    <button
                                        onClick={() => setViewPayslip(row.record!)}
                                        className="w-full bg-slate-800 text-white hover:bg-slate-900 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-300"
                                    >
                                        <i className="fas fa-file-invoice"></i> View Payslip
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {viewPayslip && <Payslip record={viewPayslip} onClose={() => setViewPayslip(null)} />}

            {confirmingCodeFor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
                        <div className="p-6 text-center border-b border-slate-100">
                            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <i className="fas fa-lock text-indigo-400 text-2xl"></i>
                            </div>
                            <h3 className="text-xl font-black text-slate-800">Enter Collection Code</h3>
                            <p className="text-sm font-bold text-slate-400 mt-1">Get this code from {confirmingCodeFor.name}</p>
                        </div>
                        <div className="p-6 bg-slate-50/50">
                            <input
                                type="text" autoFocus
                                maxLength={4}
                                value={codeEntry}
                                onChange={e => setCodeEntry(e.target.value.replace(/\D/g, ''))}
                                placeholder="0000"
                                className="w-full text-center text-3xl tracking-[0.5em] font-black bg-white border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all shadow-sm"
                            />
                        </div>
                        <div className="p-6 grid grid-cols-2 gap-3 pt-0 bg-slate-50/50">
                            <button
                                onClick={() => { setConfirmingCodeFor(null); setCodeEntry(''); }}
                                className="px-4 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                     try {
                                         await dbService.payroll.confirmPayout(confirmingCodeFor.record!.id!, codeEntry);
                                         showToast('Payment confirmed and finalized!', 'success');
                                         syncManager.triggerSync(true);
                                         setConfirmingCodeFor(null);
                                         setCodeEntry('');
                                     } catch (e: any) {
                                         showToast(e.message || 'Invalid code', 'error');
                                     }
                                }}
                                disabled={codeEntry.length !== 4}
                                className="px-4 py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest text-white bg-indigo-600 shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                            >
                                Confirm Code
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollDashboard;
