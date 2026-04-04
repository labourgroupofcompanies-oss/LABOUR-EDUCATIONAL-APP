import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../hooks/useAuth';
import { dbService } from '../../services/dbService';
import { type PayrollRecord } from '../../eduDb';
import { db } from '../../db';
import PrintPortal from '../Common/PrintPortal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const TeacherPayslip: React.FC = () => {
    const { user } = useAuth();
    const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);

    const payslips = useLiveQuery(async () => {
        if (!user?.schoolId || !user?.id) return [];
        return await dbService.payroll.getByStaff(user.schoolId, user.id);
    }, [user?.schoolId, user?.id]);

    const school = useLiveQuery(async () => {
        if (!user?.schoolId) return null;
        return await db.schools
            .where('schoolId').equals(user.schoolId)
            .or('idCloud').equals(user.schoolId)
            .first();
    }, [user?.schoolId]);
    const [isPrinting, setIsPrinting] = useState(false);

    const handlePrint = () => {
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 100);
    };

    if (selectedRecord) {
        // Payslip detail view
        return (
            <div className="p-4 md:p-6 space-y-6 animate-fadeIn">
                <button
                    onClick={() => setSelectedRecord(null)}
                    className="flex items-center gap-2 text-gray-400 hover:text-gray-700 font-bold text-sm transition-colors"
                >
                    <i className="fas fa-arrow-left"></i> Back to Payslips
                </button>
                <div className="flex justify-center">
                    <button
                        onClick={handlePrint}
                        className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-6 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2"
                    >
                        <i className="fas fa-print"></i> Print Payslip
                    </button>
                </div>

                {selectedRecord.status === 'Ready' && selectedRecord.collectionCode && (
                    <div className="bg-indigo-600 rounded-3xl p-6 text-center text-white shadow-xl shadow-indigo-200/50 max-w-lg mx-auto relative overflow-hidden">
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-purple-500/20 rounded-full blur-2xl"></div>
                        <div className="relative z-10 w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
                            <i className="fas fa-handshake text-2xl text-indigo-200"></i>
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-indigo-200 mb-1">Action Required</h3>
                        <p className="text-base font-bold text-white mb-6 leading-tight">Your salary is ready for collection! Provide this code to the Accountant.</p>
                        
                        <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 inline-block">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-200 mb-2">Collection Code</p>
                            <p className="text-4xl tracking-[0.3em] font-black text-white">{selectedRecord.collectionCode}</p>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden max-w-lg mx-auto">
                    {/* Header */}
                    <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-center">
                        <p className="text-white/70 text-xs font-black uppercase tracking-widest">Official Payslip</p>
                        <h2 className="font-black text-xl mt-1">{school?.schoolName || 'School'}</h2>
                        <p className="text-white/80 text-sm mt-1 font-bold">
                            {MONTHS[selectedRecord.month - 1]} {selectedRecord.year}
                        </p>
                    </div>
                    {/* Staff Info */}
                    <div className="grid grid-cols-2 gap-4 px-6 py-5 bg-gray-50 border-b border-gray-100">
                        {[
                            { label: 'Name', val: selectedRecord.staffName },
                            { label: 'Role', val: selectedRecord.staffRole },
                            { label: 'Method', val: selectedRecord.paymentMethod },
                            { label: 'Status', val: selectedRecord.status },
                        ].map(({ label, val }) => (
                            <div key={label}>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                                <p className="font-bold text-gray-700 text-sm mt-0.5">{val}</p>
                            </div>
                        ))}
                    </div>
                    {/* Earnings */}
                    <div className="px-6 py-5 space-y-3">
                        {[
                            { label: 'Gross Salary', val: `GHS ${selectedRecord.grossSalary.toFixed(2)}`, color: 'text-gray-700' },
                            {
                                label: `Deductions${selectedRecord.deductionNotes ? ` (${selectedRecord.deductionNotes})` : ''}`,
                                val: `- GHS ${selectedRecord.deductions.toFixed(2)}`, color: 'text-red-500'
                            },
                        ].map(({ label, val, color }) => (
                            <div key={label} className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">{label}</span>
                                <span className={`font-bold ${color}`}>{val}</span>
                            </div>
                        ))}
                        <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-3 mt-2">
                            <span className="font-black text-indigo-700 text-sm">Net Pay</span>
                            <span className="font-black text-indigo-700 text-xl">GHS {selectedRecord.netPay.toFixed(2)}</span>
                        </div>
                    </div>
                    {selectedRecord.paidAt && (
                        <p className="text-center text-xs text-gray-400 pb-5">
                            Paid on {new Date(selectedRecord.paidAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    )}
                </div>

                {/* Print Portal */}
                {isPrinting && selectedRecord && (
                    <PrintPortal>
                        <div className="print-a4-portrait p-10 space-y-8">
                            {/* School Header */}
                            <div className="text-center border-b-2 border-gray-100 pb-6">
                                <h1 className="text-2xl font-black text-gray-800">{school?.schoolName || 'School Name'}</h1>
                                <p className="text-sm text-gray-400 mt-1">Official Staff Payslip</p>
                                <p className="text-lg font-bold text-indigo-600 mt-3">
                                    {MONTHS[selectedRecord.month - 1]} {selectedRecord.year}
                                </p>
                            </div>

                            {/* Staff Info */}
                            <div className="grid grid-cols-2 gap-8 bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                {[
                                    { label: 'Staff Name', val: selectedRecord.staffName },
                                    { label: 'Role', val: selectedRecord.staffRole },
                                    { label: 'Payment Method', val: selectedRecord.paymentMethod },
                                    { label: 'Status', val: selectedRecord.status },
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
                                        <td className="px-6 py-5 font-bold text-gray-800 text-right">{selectedRecord.grossSalary.toFixed(2)}</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                        <td className="px-6 py-5 font-medium text-gray-700">
                                            Deductions {selectedRecord.deductionNotes && <span className="text-gray-400 text-xs ml-1">({selectedRecord.deductionNotes})</span>}
                                        </td>
                                        <td className="px-6 py-5 font-bold text-red-500 text-right">- {selectedRecord.deductions.toFixed(2)}</td>
                                    </tr>
                                    <tr className="bg-indigo-50/50">
                                        <td className="px-6 py-5 font-black text-indigo-700">Net Pay</td>
                                        <td className="px-6 py-5 font-black text-indigo-700 text-2xl text-right">GHS {selectedRecord.netPay.toFixed(2)}</td>
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
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 animate-fadeIn">
            <div>
                <h2 className="text-xl font-black text-gray-800">My Payslips</h2>
                <p className="text-gray-400 text-sm">Your salary payment records</p>
            </div>

            {!payslips?.length ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center shadow-sm">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <i className="fas fa-file-invoice-dollar text-indigo-400 text-2xl"></i>
                    </div>
                    <p className="font-black text-gray-500 text-sm">No payslips yet</p>
                    <p className="text-gray-300 text-xs mt-1 max-w-xs mx-auto">
                        Your monthly payslips will appear here once the school accountant processes your salary payment.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {payslips.map((rec, i) => (
                        <button
                            key={i}
                            onClick={() => setSelectedRecord(rec)}
                            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between hover:shadow-md hover:border-indigo-200 transition-all group text-left"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm ${rec.status === 'Paid' ? 'bg-green-50 text-green-500' : rec.status === 'Ready' ? 'bg-indigo-50 text-indigo-500' : 'bg-amber-50 text-amber-500'}`}>
                                    <i className="fas fa-file-invoice-dollar"></i>
                                </div>
                                <div>
                                    <p className="font-black text-gray-800 text-sm">{MONTHS[rec.month - 1]} {rec.year}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        <span className={`font-black px-2 py-0.5 rounded-full ${rec.status === 'Paid' ? 'bg-green-50 text-green-600' : rec.status === 'Ready' ? 'bg-indigo-50 text-indigo-600 animate-pulse' : 'bg-amber-50 text-amber-600'}`}>
                                            {rec.status === 'Ready' ? 'Ready for Collection' : rec.status}
                                        </span>
                                        <span className="ml-2">{rec.paymentMethod}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-black text-lg text-indigo-700">GHS {rec.netPay.toFixed(2)}</p>
                                <p className="text-[10px] text-gray-400">Net Pay</p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TeacherPayslip;
