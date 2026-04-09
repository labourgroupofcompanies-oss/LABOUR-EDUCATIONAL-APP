import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { dbService } from '../../../services/dbService';
import { eduDb, type PayrollRecord } from '../../../eduDb';
import { db } from '../../../db';
import Payslip from './Payslip';
import PrintPortal from '../../Common/PrintPortal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const PayrollHistory: React.FC = () => {
    const { user } = useAuth();
    const [selected, setSelected] = React.useState<PayrollRecord | null>(null);
    const [search, setSearch] = React.useState('');
    const [isPrinting, setIsPrinting] = React.useState(false);

    const school = useLiveQuery(async () => {
        if (!user?.schoolId) return null;
        return await db.schools
            .where('schoolId').equals(user.schoolId)
            .or('idCloud').equals(user.schoolId)
            .first();
    }, [user?.schoolId]);

    const handlePrint = () => {
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 100);
    };

    const allStaff = useLiveQuery(() =>
        user?.schoolId ? dbService.staff.getAll(user.schoolId) : [], [user?.schoolId]);

    const allRecords = useLiveQuery(async () => {
        if (!user?.schoolId) return [];
        const records = await eduDb.payrollRecords
            .where('schoolId')
            .equals(user.schoolId)
            .toArray();

        return records.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return b.month - a.month;
        });
    }, [user?.schoolId, allStaff]);

    const filtered = allRecords?.filter(r =>
        r.staffName.toLowerCase().includes(search.toLowerCase())
    ) || [];

    return (
        <div className="space-y-6 animate-fadeIn">
            <div>
                <h2 className="text-xl font-black text-gray-800">Pay History</h2>
                <p className="text-gray-400 text-sm">All past payroll records</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <input
                    type="text"
                    placeholder="Search by staff name..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full sm:max-w-xs border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-purple-400 outline-none"
                />
                <button
                    onClick={handlePrint}
                    className="w-full sm:w-auto bg-slate-800 text-white hover:bg-slate-900 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2"
                >
                    <i className="fas fa-print"></i> Print History
                </button>
            </div>

            {/* ── Desktop Table (hidden on mobile) ── */}
            <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                {['S/N', 'Month', 'Staff', 'Role', 'Gross', 'Deductions', 'Net Pay', 'Method', 'Status', ''].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={10} className="px-6 py-16 text-center text-gray-300 text-sm">No payroll records yet</td></tr>
                            ) : filtered.map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-4 py-3 text-[10px] font-black text-gray-400">{i + 1}</td>
                                    <td className="px-4 py-3 font-bold text-gray-700 text-sm whitespace-nowrap">{MONTHS[r.month - 1]} {r.year}</td>
                                    <td className="px-4 py-3 font-bold text-gray-800 text-sm whitespace-nowrap">{r.staffName}</td>
                                    <td className="px-4 py-3">
                                        <span className="text-[10px] font-black bg-purple-50 text-purple-600 px-2.5 py-1 rounded-full uppercase tracking-wider">{r.staffRole}</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">GHS {r.grossSalary.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-sm text-red-400">GHS {r.deductions.toFixed(2)}</td>
                                    <td className="px-4 py-3 font-black text-indigo-700 text-sm">GHS {r.netPay.toFixed(2)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{r.paymentMethod}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full uppercase ${r.status === 'Paid' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {r.status}
                                        </span>
                                        {r.syncStatus === 'failed' && (
                                            <span className="block mt-1 text-[9px] text-red-500 font-bold" title={r.syncError}>
                                                <i className="fas fa-exclamation-triangle mr-1"></i> Sync Failed
                                            </span>
                                        )}
                                        {r.syncStatus === 'pending' && (
                                            <span className="block mt-1 text-[9px] text-amber-500 font-bold">
                                                <i className="fas fa-sync fa-spin mr-1"></i> Pending Sync
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => setSelected(r)}
                                            className="bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase transition-all"
                                        >
                                            <i className="fas fa-file-invoice mr-1"></i>Slip
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Mobile Card List (shown only on xs) ── */}
            <div className="sm:hidden space-y-3">
                {filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-14 text-center text-gray-300 text-sm">
                        No payroll records yet
                    </div>
                ) : filtered.map((r, i) => (
                    <div key={i} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${r.status === 'Paid' ? 'border-green-100' : 'border-amber-100'}`}>
                        {/* Card header: month + status */}
                        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-gray-50">
                            <div>
                                <p className="text-xs font-black text-gray-500 uppercase tracking-widest">
                                    {MONTHS[r.month - 1]} {r.year}
                                </p>
                                <p className="font-black text-gray-800 text-sm leading-tight mt-0.5">{r.staffName}</p>
                                <span className="inline-block mt-1 text-[10px] font-black bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                    {r.staffRole}
                                </span>
                            </div>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full uppercase shrink-0 ${r.status === 'Paid' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                                <i className={`fas ${r.status === 'Paid' ? 'fa-check-circle' : 'fa-clock'}`}></i>
                                {r.status}
                            </span>
                        </div>

                        {/* Figures: 3-column grid */}
                        <div className="grid grid-cols-3 divide-x divide-gray-50">
                            <div className="px-4 py-3 text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Gross</p>
                                <p className="text-sm font-bold text-gray-700">GHS {r.grossSalary.toFixed(2)}</p>
                            </div>
                            <div className="px-4 py-3 text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Deductions</p>
                                <p className="text-sm font-bold text-red-400">GHS {r.deductions.toFixed(2)}</p>
                            </div>
                            <div className="px-4 py-3 text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Net Pay</p>
                                <p className="text-sm font-black text-indigo-700">GHS {r.netPay.toFixed(2)}</p>
                            </div>
                        </div>

                        {/* Footer: method + payslip button */}
                        <div className="flex items-center justify-between gap-2 px-4 pb-4 pt-1 border-t border-gray-50 mt-2">
                            <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-bold text-gray-400">
                                    <i className="fas fa-credit-card mr-1"></i>{r.paymentMethod}
                                </span>
                                {r.syncStatus === 'failed' && (
                                    <span className="text-[9px] text-red-500 font-bold" title={r.syncError}>
                                        <i className="fas fa-exclamation-triangle mr-1"></i> Sync Failed
                                    </span>
                                )}
                                {r.syncStatus === 'pending' && (
                                    <span className="text-[9px] text-amber-500 font-bold">
                                        <i className="fas fa-sync fa-spin mr-1"></i> Pending
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setSelected(r)}
                                className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-1.5"
                            >
                                <i className="fas fa-file-invoice"></i> View Payslip
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {selected && <Payslip record={selected} onClose={() => setSelected(null)} />}

            {isPrinting && (
                <PrintPortal>
                    <div className="print-a4-landscape p-10 space-y-8">
                        <div className="text-center border-b-2 border-gray-100 pb-6">
                            <h1 className="text-2xl font-black text-gray-800">{school?.schoolName || 'School Name'}</h1>
                            <p className="text-sm text-gray-500 mt-1 uppercase tracking-[0.2em] font-bold">Payroll History Report</p>
                            <p className="text-xs text-gray-400 mt-2">Generated on {new Date().toLocaleDateString()}</p>
                        </div>

                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-y border-gray-200">
                                    {['S/N', 'Period', 'Staff Name', 'Role', 'Gross (GHS)', 'Deductions', 'Net Pay', 'Method', 'Status'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((r, i) => (
                                    <tr key={i}>
                                        <td className="px-4 py-3 text-xs font-bold text-gray-500">{i + 1}</td>
                                        <td className="px-4 py-3 text-sm font-bold text-gray-700">{MONTHS[r.month - 1]} {r.year}</td>
                                        <td className="px-4 py-3 text-sm font-bold text-gray-800">{r.staffName}</td>
                                        <td className="px-4 py-3 text-[10px] font-black text-purple-600 uppercase">{r.staffRole}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600 font-medium">{r.grossSalary.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-sm text-red-500 font-medium">{r.deductions.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-sm text-indigo-700 font-bold">{r.netPay.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-xs text-gray-500">{r.paymentMethod}</td>
                                        <td className="px-4 py-3 text-[10px] font-black uppercase text-green-600">{r.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="pt-20 flex justify-between items-end border-t border-dashed border-gray-200">
                            <div className="text-center w-64 border-t border-gray-300 pt-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Accountant's Final Signature</p>
                            </div>
                            <div className="text-center w-64 border-t border-gray-300 pt-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Headmaster's Approval</p>
                            </div>
                        </div>
                    </div>
                </PrintPortal>
            )}
        </div>
    );
};

export default PayrollHistory;
