import React from 'react';
import { type FeePayment } from '../../../eduDb';

interface Props {
    payment: FeePayment;
    schoolName?: string;
    cashierName?: string;
    balance?: number; // The remaining balance after this payment
    totalDue?: number; // The total due before this payment
}

const FeeReceipt: React.FC<Props> = ({ payment, schoolName, cashierName, balance, totalDue }) => {
    return (
        <div className="print-a4-portrait p-10 space-y-8 font-sans">
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-gray-100 pb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tight">{schoolName || 'Official Receipt'}</h1>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Fee Payment Receipt</p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Receipt No</p>
                    <p className="text-lg font-black text-teal-600">{payment.receiptNo}</p>
                </div>
            </div>

            {/* Main Info */}
            <div className="grid grid-cols-2 gap-10">
                <div className="space-y-4">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Received From</p>
                        <p className="text-base font-black text-gray-800 mt-1">{payment.studentName}</p>
                        <p className="text-xs text-gray-500">Student ID: {payment.studentId}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Academic Session</p>
                        <p className="text-sm font-bold text-gray-700 mt-1">{payment.term} · {payment.year}</p>
                    </div>
                </div>
                <div className="space-y-4 text-right">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Date of Payment</p>
                        <p className="text-sm font-bold text-gray-700 mt-1">
                            {new Date(payment.paymentDate).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Method</p>
                        <p className="text-sm font-bold text-gray-700 mt-1">{payment.paymentMethod}</p>
                    </div>
                </div>
            </div>

            {/* Transaction Box */}
            <div className="bg-teal-50/50 rounded-2xl border-2 border-teal-100 p-6 relative overflow-hidden space-y-4">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <i className="fas fa-receipt text-6xl"></i>
                </div>
                <div className="text-center pb-4 border-b border-teal-100/50">
                    <p className="text-xs font-black text-teal-400 uppercase tracking-widest mb-1">Total Amount Paid</p>
                    <p className="text-4xl font-black text-teal-700">GHS {payment.amountPaid.toFixed(2)}</p>
                </div>
                
                {/* Ledger breakdown */}
                <div className="max-w-xs mx-auto space-y-1 text-xs">
                    {totalDue !== undefined && (
                        <div className="flex justify-between font-bold text-gray-500">
                            <span>Total Due this Term:</span>
                            <span>GHS {totalDue.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-teal-600">
                        <span>Amount Paid (This Tx):</span>
                        <span>GHS {payment.amountPaid.toFixed(2)}</span>
                    </div>
                    {balance !== undefined && (
                        <div className="flex justify-between font-black text-gray-800 border-t border-teal-100/50 pt-2 mt-1">
                            <span>Remaining Balance (Receivable):</span>
                            <span className={balance > 0 ? 'text-rose-600' : balance < 0 ? 'text-cyan-600' : 'text-emerald-600'}>
                                {balance > 0 ? `GHS ${balance.toFixed(2)}` : balance < 0 ? `GHS -${Math.abs(balance).toFixed(2)} (Credit)` : 'GHS 0.00'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Details Table */}
            <div className="space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment Description / Notes</p>
                <div className="min-h-[100px] border-2 border-gray-100 rounded-2xl p-6 text-gray-600 text-sm leading-relaxed">
                    {payment.notes || 'Full/Partial payment of school fees for the specified term.'}
                </div>
            </div>

            {/* Footer Signatures */}
            <div className="pt-24 flex justify-between items-end border-t border-dashed border-gray-200">
                <div className="text-center w-56 relative flex flex-col justify-end min-h-[4rem]">
                    {cashierName && (
                        <p className="text-lg font-[600] capitalize text-gray-800 absolute bottom-6 w-full text-center" style={{ fontFamily: "'Clicker Script', 'Dancing Script', cursive" }}>
                            {cashierName}
                        </p>
                    )}
                    <div className="border-b-2 border-gray-300 mb-2 w-full z-10"></div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest font-sans relative z-10">Accountant / Cashier</p>
                </div>
                <div className="text-center">
                    <div className="w-24 h-24 border-4 border-teal-100 rounded-full flex items-center justify-center mb-2 mx-auto opacity-20">
                        <i className="fas fa-stamp text-4xl text-teal-300"></i>
                    </div>
                    <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">School Stamp</p>
                </div>
                <div className="text-center w-56">
                    <div className="border-b-2 border-gray-300 mb-2"></div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payer's Signature</p>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="text-center space-y-2 pt-10">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Thank you for your payment!</p>
                <p className="text-[9px] text-gray-300 italic">
                    This receipt is automatically generated and serves as official proof of payment.
                    Please keep this document safe for future reference.
                </p>
            </div>
        </div>
    );
};

export default FeeReceipt;

