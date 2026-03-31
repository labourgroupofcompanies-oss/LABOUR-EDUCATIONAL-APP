import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db';
import { type PayrollRecord } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import PrintPortal from '../../Common/PrintPortal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

interface Props {
    record: PayrollRecord;
    onClose: () => void;
}

const Payslip: React.FC<Props> = ({ record, onClose }) => {
    const { user } = useAuth();
    const [isPrinting, setIsPrinting] = useState(false);

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

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-start sm:items-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fadeIn my-auto">
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-black text-gray-800">Payslip</h3>
                    <div className="flex gap-2">
                        <button
                            onClick={handlePrint}
                            className="bg-slate-800 text-white hover:bg-slate-900 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md"
                        >
                            <i className="fas fa-file-pdf mr-1.5"></i>Download PDF / Print
                        </button>
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-400">
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div className="px-6 py-6 space-y-6">
                    {/* School Header */}
                    <div className="text-center border-b border-gray-100 pb-5">
                        <h1 className="text-xl font-black text-gray-800">{school?.schoolName || 'School Name'}</h1>
                        <p className="text-xs text-gray-400 mt-1">Official Payslip</p>
                        <p className="text-sm font-bold text-indigo-600 mt-2">
                            {MONTHS[record.month - 1]} {record.year}
                        </p>
                    </div>

                    {/* Staff Info */}
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4">
                        {[
                            { label: 'Staff Name', val: record.staffName },
                            { label: 'Role', val: record.staffRole },
                            { label: 'Payment Method', val: record.paymentMethod },
                            { label: 'Status', val: record.status },
                        ].map(({ label, val }) => (
                            <div key={label}>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                                <p className="font-bold text-gray-700 text-sm mt-0.5">{val}</p>
                            </div>
                        ))}
                    </div>

                    {/* Earnings & Deductions */}
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest rounded-l-xl">Description</th>
                                <th className="px-4 py-2 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest rounded-r-xl">Amount (GHS)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-700 text-sm">Gross Salary</td>
                                <td className="px-4 py-3 font-bold text-gray-800 text-sm text-right">{record.grossSalary.toFixed(2)}</td>
                            </tr>
                            <tr className="border-b border-gray-50">
                                <td className="px-4 py-3 font-medium text-gray-700 text-sm">
                                    Deductions {record.deductionNotes && <span className="text-gray-400 text-xs ml-1">({record.deductionNotes})</span>}
                                </td>
                                <td className="px-4 py-3 font-bold text-red-500 text-sm text-right">- {record.deductions.toFixed(2)}</td>
                            </tr>
                            <tr className="bg-indigo-50">
                                <td className="px-4 py-3 font-black text-indigo-700 text-sm rounded-l-xl">Net Pay</td>
                                <td className="px-4 py-3 font-black text-indigo-700 text-lg text-right rounded-r-xl">GHS {record.netPay.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>

                    {record.paidAt && (
                        <p className="text-center text-xs text-gray-400">
                            Paid on {new Date(record.paidAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    )}
                </div>

                {/* Print Portal */}
                {isPrinting && (
                    <PrintPortal>
                        <div className="print-a4-portrait p-10 space-y-8">
                            {/* School Header */}
                            <div className="text-center border-b-2 border-gray-100 pb-6">
                                <h1 className="text-2xl font-black text-gray-800">{school?.schoolName || 'School Name'}</h1>
                                <p className="text-sm text-gray-400 mt-1">Official Staff Payslip</p>
                                <p className="text-lg font-bold text-indigo-600 mt-3">
                                    {MONTHS[record.month - 1]} {record.year}
                                </p>
                            </div>

                            {/* Staff Info */}
                            <div className="grid grid-cols-2 gap-8 bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                {[
                                    { label: 'Staff Name', val: record.staffName },
                                    { label: 'Role', val: record.staffRole },
                                    { label: 'Payment Method', val: record.paymentMethod },
                                    { label: 'Status', val: record.status },
                                ].map(({ label, val }) => (
                                    <div key={label}>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                                        <p className="font-bold text-gray-800 text-base mt-1">{val}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Earnings & Deductions */}
                            <table className="w-full border-collapse border-2 border-gray-100 rounded-2xl overflow-hidden">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Description</th>
                                        <th className="px-6 py-4 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Amount (GHS)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-b border-gray-100">
                                        <td className="px-6 py-5 font-medium text-gray-700">Gross Salary</td>
                                        <td className="px-6 py-5 font-bold text-gray-800 text-right">{record.grossSalary.toFixed(2)}</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                        <td className="px-6 py-5 font-medium text-gray-700">
                                            Deductions {record.deductionNotes && <span className="text-gray-400 text-xs ml-1">({record.deductionNotes})</span>}
                                        </td>
                                        <td className="px-6 py-5 font-bold text-red-500 text-right">- {record.deductions.toFixed(2)}</td>
                                    </tr>
                                    <tr className="bg-indigo-50/50">
                                        <td className="px-6 py-5 font-black text-indigo-700">Net Pay</td>
                                        <td className="px-6 py-5 font-black text-indigo-700 text-2xl text-right">GHS {record.netPay.toFixed(2)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="pt-20 flex justify-between items-end border-t border-dashed border-gray-200">
                                <div className="text-center w-48">
                                    <div className="border-b border-gray-400 mb-2"></div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Accountant's Signature</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Date Issued</p>
                                    <p className="font-bold text-gray-800">{new Date().toLocaleDateString('en-GH')}</p>
                                </div>
                                <div className="text-center w-48">
                                    <div className="border-b border-gray-400 mb-2"></div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Staff's Acknowledgement</p>
                                </div>
                            </div>

                            <p className="text-center text-[10px] text-gray-300 italic pt-10">
                                This is an electronically generated payslip from {school?.schoolName || 'the school'}.
                            </p>
                        </div>
                    </PrintPortal>
                )}
            </div>
        </div>
    );
};

export default Payslip;
