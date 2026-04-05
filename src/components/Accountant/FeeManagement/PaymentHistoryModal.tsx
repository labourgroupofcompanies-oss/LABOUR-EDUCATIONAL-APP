import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { dbService } from '../../../services/dbService';
import { showConfirm } from '../../Common/ConfirmDialog';
import { showToast } from '../../Common/Toast';
import { syncService } from '../../../services/syncService';
import { supabase } from '../../../supabaseClient';
import { type FeePayment } from '../../../eduDb';

interface Props {
    studentId: number;
    studentName: string;
    className: string;
    onClose: () => void;
}

const PaymentHistoryModal: React.FC<Props> = ({ studentId, studentName, className, onClose }) => {
    const { user } = useAuth();
    
    const [isVoiding, setIsVoiding] = useState<number | null>(null);

    // Fetch ALL payments for this student across all terms (including voided for audit)
    const payments = useLiveQuery(async () => {
        if (!user?.schoolId) return [];
        const { eduDb } = await import('../../../eduDb');
        const all = await eduDb.feePayments
            .where('schoolId')
            .equals(user.schoolId)
            .filter(p => p.studentId === studentId)
            .toArray();
            
        // Sort newest first
        return all.sort((a, b) => b.paymentDate - a.paymentDate);
    }, [user?.schoolId, studentId]);

    const handleVoid = async (paymentId: number, receiptNo: string) => {
        const confirmed = await showConfirm({
            title: 'Reconcile Payment?',
            message: `Are you sure you want to void receipt ${receiptNo}? This will revert the student's balance. This action is tracked for audit purposes.`,
            confirmText: 'Yes, Void It',
            cancelText: 'No, Keep It',
            variant: 'danger'
        });

        if (!confirmed) return;

        setIsVoiding(paymentId);
        try {
            await dbService.fees.voidPayment(paymentId);
            showToast(`Payment ${receiptNo} voided successfully`, 'success');
            
            // Sync up the void status
            if (user?.schoolId) {
                syncService.syncAll(user.schoolId).then(() => {
                    supabase.channel(`school_sync_${user.schoolId}`).send({
                        type: 'broadcast',
                        event: 'sync_needed',
                        payload: { source: 'payment_voided', paymentId }
                    }).catch(err => console.error('Broadcast failed:', err));
                }).catch(err => console.error('Sync failed post-void:', err));
            }
        } catch (error) {
            console.error('Void failed:', error);
            showToast('Failed to void payment', 'error');
        } finally {
            setIsVoiding(null);
        }
    };

    const fmt = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;
    const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-GH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-fadeIn">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="font-black text-gray-800 text-lg">Payment History</h3>
                        <p className="text-[11px] font-bold text-gray-400 mt-0.5">{studentName} · {className}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-400 transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto bg-slate-50/50 flex-1">
                    {payments === undefined ? (
                        <div className="flex justify-center items-center py-12">
                            <i className="fas fa-circle-notch fa-spin text-3xl text-indigo-200"></i>
                        </div>
                    ) : payments.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-white rounded-full flex flex-col items-center justify-center mx-auto mb-3 shadow-sm border border-slate-100">
                                <i className="fas fa-receipt text-2xl text-slate-200"></i>
                            </div>
                            <h4 className="font-black text-slate-700">No Payments Found</h4>
                            <p className="text-[11px] font-bold text-slate-400 mt-1">This learner has not made any recorded fee payments yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {payments.map(p => (
                                <div key={p.id} className={`bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-4 sm:justify-between sm:items-center transition-all ${p.isVoided ? 'opacity-60 bg-slate-50 grayscale' : ''}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${p.isVoided ? 'bg-slate-200' : 'bg-emerald-50'}`}>
                                            <i className={`fas ${p.isVoided ? 'fa-ban text-slate-400' : 'fa-check text-emerald-500'}`}></i>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className={`font-black text-sm ${p.isVoided ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{fmt(p.amountPaid)}</p>
                                                {p.isVoided && <span className="text-[8px] font-black uppercase tracking-tighter bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded leading-none">Voided</span>}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                                    {p.paymentMethod}
                                                </span>
                                                <span className="text-[9px] font-bold text-slate-400">
                                                    {p.term} {p.year}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 justify-between sm:justify-end">
                                        <div className="text-left sm:text-right">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{p.receiptNo}</p>
                                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{fmtDate(p.paymentDate)}</p>
                                        </div>
                                        {!p.isVoided && (
                                            <button
                                                onClick={() => handleVoid(p.id!, p.receiptNo)}
                                                disabled={isVoiding === p.id}
                                                className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all flex items-center gap-2 border border-rose-100"
                                                title="Reconcile / Void"
                                            >
                                                {isVoiding === p.id ? (
                                                    <i className="fas fa-spinner fa-spin text-[10px]"></i>
                                                ) : (
                                                    <i className="fas fa-rotate-left text-[10px]"></i>
                                                )}
                                                <span className="text-[10px] font-black uppercase tracking-wider">Void</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Footer Summary */}
                {payments && payments.length > 0 && (
                    <div className="px-6 py-4 border-t border-gray-100 bg-white shrink-0 flex justify-between items-center rounded-b-2xl">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Historical Payments</p>
                        <p className="font-black text-emerald-600 text-lg">{fmt(payments.reduce((s, p) => s + p.amountPaid, 0))}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PaymentHistoryModal;
