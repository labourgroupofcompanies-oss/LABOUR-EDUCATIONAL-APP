import React, { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { dbService } from '../../../services/dbService';
import { showToast } from '../../Common/Toast';
import { type FeePayment } from '../../../eduDb';
import PrintPortal from '../../Common/PrintPortal';
import FeeReceipt from './FeeReceipt';
import { db } from '../../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { syncService } from '../../../services/syncService';
import { supabase } from '../../../supabaseClient';

interface FeeRow {
    student: { id?: number; name: string; };
    feeAmount: number;
    amountPaid: number;
    balance: number;
    status: string;
    className: string;
}

interface Props {
    row: FeeRow;
    term: string;
    year: number;
    onClose: () => void;
}

const RecordPayment: React.FC<Props> = ({ row, term, year, onClose }) => {
    const { user } = useAuth();
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<FeePayment['paymentMethod']>('Cash');
    const [notes, setNotes] = useState('');
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [saving, setSaving] = useState(false);
    const [lastPayment, setLastPayment] = useState<FeePayment | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);

    const school = useLiveQuery(async () => {
        if (!user?.schoolId) return null;
        return await db.schools
            .where('schoolId').equals(user.schoolId)
            .or('idCloud').equals(user.schoolId)
            .first();
    }, [user?.schoolId]);

    const enteredAmt = parseFloat(amount) || 0;
    const wouldOverpay = enteredAmt > row.balance && row.balance > 0;

    const handleSubmit = async () => {
        if (!user?.schoolId || !row.student.id) return;
        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }

        setSaving(true);
        try {
            const receiptNo = `RCP-${Date.now().toString().slice(-8)}`;
            const paymentData: FeePayment = {
                schoolId: user.schoolId,
                studentId: row.student.id,
                studentName: row.student.name,
                classId: 0,
                term,
                year,
                amountPaid: amt,
                paymentMethod: method,
                paymentDate: new Date(date).getTime(),
                notes: notes || undefined,
                receiptNo,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending'
            };
            await dbService.fees.recordPayment(paymentData);
            setLastPayment(paymentData);
            showToast(`Payment of GHS ${amt.toFixed(2)} recorded for ${row.student.name} · ${receiptNo}`, 'success');
            
            // Instantly push the new payment up and broadcast reality update to all other devices globally
            syncService.syncAll(user.schoolId).then(() => {
                supabase.channel(`school_sync_${user.schoolId}`).send({
                    type: 'broadcast',
                    event: 'sync_needed',
                    payload: { source: 'payment_recorded' }
                }).catch(err => console.error('Broadcast failed:', err));
            }).catch(err => console.error('Sync failed post-payment:', err));

            // Don't close immediately if we want to allow printing
        } catch {
            showToast('Failed to record payment', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fadeIn my-auto sm:my-0 mt-4 sm:mt-0 mb-auto">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-gray-800">Record Payment</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">{row.student.name} · {row.className}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-400 transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Fee Summary */}
                <div className="mx-6 mt-5 grid grid-cols-3 gap-3">
                    {[
                        { label: 'Total Fee', val: `GHS ${row.feeAmount.toLocaleString()}`, color: 'text-gray-400', bg: 'bg-gray-50' },
                        { label: 'Paid', val: `GHS ${row.amountPaid.toLocaleString()}`, color: 'text-green-600', bg: 'bg-green-50/50' },
                        { label: 'Balance', val: row.balance > 0 ? `GHS ${row.balance.toLocaleString()}` : 'OVERPAID', color: row.balance > 0 ? 'text-red-500' : 'text-cyan-600', bg: row.balance > 0 ? 'bg-red-50/50' : 'bg-cyan-50/50' },
                    ].map(s => (
                        <div key={s.label} className={`${s.bg} p-3 rounded-2xl text-center border border-white/50 shadow-sm transition-transform hover:scale-105 flex flex-col justify-center`}>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{s.label}</p>
                            <p className={`font-black text-xs ${s.color} break-words`}>{s.val}</p>
                        </div>
                    ))}
                </div>

                {/* Form */}
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">Amount (GHS)</label>
                            {row.balance > 0 && (
                                <button
                                    onClick={() => setAmount(row.balance.toString())}
                                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest transition-colors flex items-center gap-1"
                                >
                                    <i className="fas fa-magic"></i> Pay Balance
                                </button>
                            )}
                        </div>
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="0.00"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="w-full border-2 border-gray-100 rounded-2xl px-5 py-4 font-black text-gray-800 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none text-2xl transition-all placeholder:text-gray-200"
                        />
                        {/* Overpayment warning */}
                        {wouldOverpay && (
                            <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 text-xs font-bold">
                                <i className="fas fa-triangle-exclamation"></i>
                                This will overpay by GHS {(enteredAmt - row.balance).toFixed(2)}. The excess will be recorded as a credit.
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Payment Method</label>
                            <select
                                value={method}
                                onChange={e => setMethod(e.target.value as FeePayment['paymentMethod'])}
                                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
                            >
                                <option>Cash</option>
                                <option>MoMo</option>
                                <option>Bank</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Notes (optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. First instalment"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 pb-6 space-y-3">
                    {lastPayment ? (
                        <div className="space-y-3 animate-slideDown">
                            <button
                                onClick={() => {
                                    setIsPrinting(true);
                                    setTimeout(() => {
                                        window.print();
                                        setIsPrinting(false);
                                    }, 100);
                                }}
                                className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black text-sm hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-file-pdf"></i> Download PDF / Print Receipt ({lastPayment.receiptNo})
                            </button>
                            <button onClick={onClose} className="w-full text-indigo-600 font-black text-xs uppercase tracking-widest py-2">
                                Done, close this window
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-500 py-3 rounded-xl font-black text-sm hover:bg-gray-50 transition-all">
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={saving}
                                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm hover:bg-indigo-700 transition-all disabled:opacity-50"
                            >
                                {saving ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving...</> : <><i className="fas fa-check mr-2"></i>Record Payment</>}
                            </button>
                        </div>
                    )}
                </div>

                {/* Print Portal */}
                {isPrinting && lastPayment && (
                    <PrintPortal>
                        <FeeReceipt payment={lastPayment} schoolName={school?.schoolName} cashierName={user?.fullName || 'Accountant'} />
                    </PrintPortal>
                )}
            </div>
        </div>
    );
};

export default RecordPayment;
