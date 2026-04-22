import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { useAcademicSession } from '../../../hooks/useAcademicSession';
import { dbService } from '../../../services/dbService';
import { type Student } from '../../../eduDb';
import RecordPayment from './RecordPayment';
import BulkDiscountModal from './BulkDiscountModal';
import PaymentHistoryModal from './PaymentHistoryModal';
import { normalizeArray } from '../../../utils/dataSafety';

type FilterStatus = 'all' | 'paid' | 'partial' | 'unpaid' | 'overpaid';

interface StudentFeeRow {
    student: Student;
    feeAmount: number;
    amountPaid: number;
    balance: number;       // negative = overpaid (credit amount)
    status: 'paid' | 'partial' | 'unpaid' | 'no-fee' | 'overpaid';
    className: string;
}

const StudentFeeList: React.FC = () => {
    const { user } = useAuth();
    const { currentTerm, currentYear } = useAcademicSession();
    const [term, setTerm] = useState(currentTerm || 'Term 1');
    const [year, setYear] = useState(currentYear || new Date().getFullYear());

    React.useEffect(() => {
        if (currentTerm && term === 'Term 1') setTerm(currentTerm);
        if (currentYear && year === new Date().getFullYear()) setYear(currentYear);
    }, [currentTerm, currentYear]);

    const [filter, setFilter] = useState<FilterStatus>('all');
    const [classFilter, setClassFilter] = useState<number | 'all'>('all');
    const [search, setSearch] = useState('');
    const [payingStudent, setPayingStudent] = useState<StudentFeeRow | null>(null);
    const [historyStudent, setHistoryStudent] = useState<StudentFeeRow | null>(null);
    const [showBulkModal, setShowBulkModal] = useState(false);

    const classes = useLiveQuery(() =>
        user?.schoolId ? dbService.classes.getAll(user.schoolId) : [], [user?.schoolId]);

    const rows = useLiveQuery(async (): Promise<StudentFeeRow[]> => {
        if (!user?.schoolId) return [];
        const [studentsRaw, structuresRaw, allPaymentsRaw] = await Promise.all([
            dbService.students.getAll(user.schoolId),
            dbService.fees.getAllStructures(user.schoolId, term, year),
            dbService.fees.getPaymentsByTerm(user.schoolId, term, year, false), // Exclude voided
        ]);
        
        const students = normalizeArray<any>(studentsRaw);
        const structures = normalizeArray<any>(structuresRaw);
        const allPayments = normalizeArray<any>(allPaymentsRaw).filter(p => p && !p.isVoided);
        const classesRaw = await dbService.classes.getAll(user.schoolId);
        const allClasses = normalizeArray<any>(classesRaw);

        const rows: StudentFeeRow[] = [];
        for (const student of students) {
            const structure = structures.find((s: any) => s.classId === student.classId);
            const payments = allPayments.filter((p: any) => p.studentId === student.id);
            const amountPaid = (payments as any[]).reduce((sum, p) => sum + p.amountPaid, 0);
            const termFeeAmount = (structure as any)?.termFeeAmount ?? 0;

            // Compute residual arrears: subtract payments from PREVIOUS terms so the
            // new-term balance correctly reflects what was actually left unpaid.
            const rawArrears = student.arrears || 0;
            const residualArrears = student.id
                ? await dbService.fees.getArrearsBalance(user.schoolId, student.id, term, year, rawArrears)
                : rawArrears;

            const feeAmount = termFeeAmount + residualArrears; // Total Due this term
            const balance = feeAmount - amountPaid;             // can be negative (overpaid)
            const cls = allClasses.find((c: any) => c.id === student.classId);

            let status: StudentFeeRow['status'] = 'no-fee';
            if (termFeeAmount > 0 || residualArrears !== 0) {
                if (amountPaid > feeAmount) status = 'overpaid';
                else if (amountPaid >= feeAmount || feeAmount <= 0) status = 'paid';
                else if (amountPaid > 0) status = 'partial';
                else status = 'unpaid';
            }

            rows.push({ student: student as any, feeAmount: feeAmount as any, amountPaid: amountPaid as any, balance, status, className: (cls as any)?.name || 'Unknown' });
        }
        return rows;
    }, [user?.schoolId, term, year]);

    const filtered = (rows as any[])?.filter((r: any) => {
        if (filter !== 'all' && r.status !== filter) return false;
        if (classFilter !== 'all' && r.student.classId !== classFilter) return false;
        if (search && !r.student.fullName.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    }) || [];

    const statusBadge = (status: StudentFeeRow['status']) => {
        const map: Record<string, string> = {
            paid: 'bg-emerald-50 text-emerald-600',
            overpaid: 'bg-cyan-50 text-cyan-600',
            partial: 'bg-amber-50 text-amber-600',
            unpaid: 'bg-rose-50 text-rose-600',
            'no-fee': 'bg-slate-100 text-slate-500',
        };
        const label: Record<string, string> = {
            paid: 'Fully Paid', overpaid: 'Overpaid ↑', partial: 'Partial', unpaid: 'Unpaid', 'no-fee': 'No Target'
        };
        return (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest ${map[status]}`}>
                {status === 'paid' && <i className="fas fa-check-circle"></i>}
                {status === 'unpaid' && <i className="fas fa-exclamation-circle"></i>}
                {status === 'partial' && <i className="fas fa-adjust"></i>}
                {label[status]}
            </span>
        );
    };

    const summary = rows ? {
        total: rows.length,
        paid: rows.filter(r => r.status === 'paid').length,
        overpaid: rows.filter(r => r.status === 'overpaid').length,
        partial: rows.filter(r => r.status === 'partial').length,
        unpaid: rows.filter(r => r.status === 'unpaid').length,
    } : { total: 0, paid: 0, overpaid: 0, partial: 0, unpaid: 0 };

    const fmt = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

    return (
        <div className="space-y-8 md:space-y-12 animate-fadeIn pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight mb-1">Student Fees</h2>
                    <p className="text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2">
                        {term} <span className="w-1 h-1 rounded-full bg-slate-300"></span> {year} Term Status
                    </p>
                </div>
                <button
                    onClick={() => setShowBulkModal(true)}
                    className="btn-primary !bg-slate-800 hover:!bg-slate-900 !from-slate-800 !to-slate-900 px-6 py-3.5 !text-[10px] md:!text-xs w-full sm:w-auto"
                >
                    <i className="fas fa-magic text-amber-400"></i> Bulk Discounts
                </button>
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                {[
                    { label: 'Total', val: summary.total, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100' },
                    { label: 'Paid', val: summary.paid, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                    { label: 'Overpaid', val: summary.overpaid, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
                    { label: 'Partial', val: summary.partial, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                    { label: 'Unpaid', val: summary.unpaid, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
                ].map((s, idx) => (
                    <div key={s.label} className={`px-4 py-4 md:px-5 md:py-4 rounded-[1.25rem] md:rounded-[1.5rem] border ${s.border} ${s.bg} flex flex-col justify-center ${idx === 4 ? 'col-span-2 md:col-span-1' : 'col-span-1'}`}>
                        <p className={`text-xl md:text-2xl font-black ${s.color} leading-none mb-1`}>{s.val}</p>
                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Filter Bar ── */}
            <div className="flex flex-col xl:flex-row flex-wrap gap-4 bg-white p-4 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30">
                <div className="relative flex-1 min-w-[200px]">
                    <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
                    <input
                        type="text"
                        placeholder="Search student name..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-5 py-3.5 text-sm font-black text-slate-700 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all outline-none placeholder:text-slate-400 placeholder:font-bold"
                    />
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                    <select
                        value={classFilter as any}
                        onChange={e => setClassFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                        className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-xs font-black text-slate-600 outline-none focus:bg-white focus:border-indigo-400 transition-all cursor-pointer min-w-[140px]"
                    >
                        <option value="all">All Classes</option>
                        {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select
                        value={filter}
                        onChange={e => setFilter(e.target.value as FilterStatus)}
                        className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-xs font-black text-slate-600 outline-none focus:bg-white focus:border-indigo-400 transition-all cursor-pointer min-w-[140px]"
                    >
                        <option value="all">All Statuses</option>
                        <option value="paid">Fully Paid</option>
                        <option value="overpaid">Overpaid</option>
                        <option value="partial">Partial</option>
                        <option value="unpaid">Unpaid</option>
                    </select>
                    <div className="flex gap-2">
                        <select
                            value={term}
                            onChange={e => setTerm(e.target.value)}
                            className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-xs font-black text-slate-600 outline-none focus:bg-white focus:border-indigo-400 transition-all cursor-pointer w-full sm:w-auto"
                        >
                            <option value="Term 1">Term 1</option>
                            <option value="Term 2">Term 2</option>
                            <option value="Term 3">Term 3</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Desktop Table ── */}
            <div className="hidden lg:block bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                {['S/N', 'Student Info', 'Fee Target', 'Collected', 'Balance', 'Status', ''].map(h => (
                                    <th key={h} className="px-8 py-5 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-8 py-24 text-center">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <i className="fas fa-search text-2xl text-slate-300"></i>
                                        </div>
                                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No students match filter</p>
                                    </td>
                                </tr>
                            ) : filtered.map((row, i) => (
                                <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-5 font-black text-slate-400 text-sm whitespace-nowrap">{i + 1}</td>
                                    <td className="px-8 py-5">
                                        <p className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">{row.student.fullName}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-widest">{row.className}</span>
                                            {row.student.studentIdString && <span className="text-[9px] font-bold text-slate-300">{row.student.studentIdString}</span>}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 font-black text-slate-600 text-sm">{fmt(row.feeAmount)}</td>
                                    <td className="px-8 py-5 font-black text-emerald-600 text-sm">{fmt(row.amountPaid)}</td>
                                    <td className="px-8 py-5 font-black text-sm">
                                        {row.status === 'overpaid'
                                            ? <span className="text-cyan-600">+{fmt(Math.abs(row.balance))} <span className="text-[8px] font-black uppercase ml-1 opacity-50 bg-cyan-100 px-1 py-0.5 rounded">Credit</span></span>
                                            : <span className="text-rose-600">{fmt(row.balance)}</span>
                                        }
                                    </td>
                                    <td className="px-8 py-5">{statusBadge(row.status)}</td>
                                    <td className="px-8 py-5 text-right flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => setHistoryStudent(row)}
                                            className="btn-icon !w-10 !h-10 !rounded-xl !bg-white !text-slate-500 border border-slate-200"
                                            title="View Payment History"
                                        >
                                            <i className="fas fa-history"></i>
                                        </button>
                                        {row.status !== 'no-fee' && (
                                            <button
                                                onClick={() => setPayingStudent(row)}
                                                className="btn-primary px-5 py-2.5 !text-[10px]"
                                            >
                                                Pay
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Mobile Card List ── */}
            <div className="lg:hidden space-y-4">
                {filtered.map((row, i) => (
                    <div key={i} className="bg-white rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/40 overflow-hidden">
                        <div className="p-6 border-b border-slate-50 flex justify-between items-start gap-4">
                            <div>
                                <p className="font-black text-slate-800 text-base leading-tight">{row.student.fullName}</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-widest">{row.className}</span>
                                </div>
                            </div>
                            <div className="flex-shrink-0">
                                {statusBadge(row.status)}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 p-6 bg-slate-50/50">
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Fee Target</p>
                                <p className="text-sm font-black text-slate-700">{fmt(row.feeAmount)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Collected</p>
                                <p className="text-sm font-black text-emerald-600">{fmt(row.amountPaid)}</p>
                            </div>
                            <div className="col-span-2 pt-3 border-t border-slate-100">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                    {row.status === 'overpaid' ? 'Credit Amount' : 'Outstanding Balance'}
                                </p>
                                <p className={`text-xl font-black tracking-tight ${row.status === 'overpaid' ? 'text-cyan-600' : 'text-rose-600'}`}>
                                    {fmt(Math.abs(row.balance))}
                                </p>
                            </div>
                        </div>
                        <div className="p-6 pt-0 bg-slate-50/50 flex gap-3">
                            <button
                                onClick={() => setHistoryStudent(row)}
                                className="btn-secondary px-5 py-4 !rounded-2xl !text-[11px]"
                            >
                                <i className="fas fa-history"></i> Log
                            </button>
                            {row.status !== 'no-fee' && (
                                <button
                                    onClick={() => setPayingStudent(row)}
                                    className="btn-primary flex-1 py-4 !rounded-2xl !text-[11px]"
                                >
                                    Record Payment
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Record Payment Modal */}
            {payingStudent && (
                <RecordPayment
                    row={{
                        ...payingStudent,
                        student: {
                            id: payingStudent.student.id,
                            name: payingStudent.student.fullName
                        }
                    } as any}
                    term={term}
                    year={year}
                    onClose={() => setPayingStudent(null)}
                />
            )}

            {/* Payment History Modal */}
            {historyStudent && historyStudent.student.id && (
                <PaymentHistoryModal
                    studentId={historyStudent.student.id}
                    studentName={historyStudent.student.fullName}
                    className={historyStudent.className}
                    onClose={() => setHistoryStudent(null)}
                />
            )}

            {/* Bulk Discount Modal */}
            {showBulkModal && user?.schoolId && (
                <BulkDiscountModal
                    schoolId={user.schoolId}
                    classes={classes || []}
                    studentsWithArrears={rows?.filter(r => r.student.arrears && r.student.arrears > 0).map(r => ({
                        id: r.student.id!,
                        name: r.student.fullName,
                        arrears: r.student.arrears!,
                        classId: r.student.classId || undefined
                    })) || []}
                    onClose={() => setShowBulkModal(false)}
                    onSuccess={() => { }}
                />
            )}
        </div>
    );
};

export default StudentFeeList;
