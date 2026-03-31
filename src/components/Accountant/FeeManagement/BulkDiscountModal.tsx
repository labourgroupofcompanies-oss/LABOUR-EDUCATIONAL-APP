import React, { useState } from 'react';
import { financialService } from '../../../services/financialService';
import { showToast } from '../../Common/Toast';
import { type Class } from '../../../eduDb';

interface Props {
    schoolId: string;
    classes: Class[];
    studentsWithArrears: { id: number; name: string; arrears: number; classId?: number }[];
    onClose: () => void;
    onSuccess: () => void;
}

const BulkDiscountModal: React.FC<Props> = ({ schoolId, classes, studentsWithArrears, onClose, onSuccess }) => {
    const [selectedClassId, setSelectedClassId] = useState<number | 'all'>('all');
    const [discountAmount, setDiscountAmount] = useState('');
    const [reason, setReason] = useState('');
    const [applying, setApplying] = useState(false);

    const targetStudents = selectedClassId === 'all'
        ? studentsWithArrears
        : studentsWithArrears.filter(s => s.classId === selectedClassId);

    const handleApply = async () => {
        const amount = parseFloat(discountAmount);
        if (isNaN(amount) || amount <= 0) {
            showToast('Please enter a valid discount amount', 'error');
            return;
        }
        if (!reason.trim()) {
            showToast('Please provide a reason for the discount', 'error');
            return;
        }
        if (targetStudents.length === 0) {
            showToast('No students selected to apply discount', 'error');
            return;
        }

        if (!confirm(`Apply GHS ${amount.toFixed(2)} discount to ${targetStudents.length} students?`)) return;

        setApplying(true);
        try {
            await financialService.applyBulkDiscount(
                schoolId,
                targetStudents.map(s => s.id),
                amount,
                reason
            );
            showToast(`Successfully applied discount to ${targetStudents.length} students`, 'success');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Bulk discount failed:', error);
            showToast('Failed to apply bulk discount', 'error');
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
                {/* Header */}
                <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight">Bulk Discount / Waiver</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Global Fee Adjustments</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {/* Class Selector */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Target Group</label>
                        <select
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all cursor-pointer"
                        >
                            <option value="all">All Students with Arrears ({studentsWithArrears.length})</option>
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({studentsWithArrears.filter(s => s.classId === c.id).length} students)
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Amount */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Discount Amount (GHS)</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                value={discountAmount}
                                onChange={(e) => setDiscountAmount(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-base font-black text-slate-800 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-300"
                            />
                        </div>
                        {/* Summary Box */}
                        <div className="bg-indigo-50/50 rounded-2xl p-4 flex flex-col justify-center border border-indigo-100/50">
                            <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Selected Students</p>
                            <p className="text-2xl font-black text-indigo-600 tracking-tighter">{targetStudents.length}</p>
                        </div>
                    </div>

                    {/* Reason */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Reason / Description</label>
                        <input
                            type="text"
                            placeholder="e.g. End of term waiver, PTA adjustment"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                        />
                    </div>

                    <div className="bg-amber-50 rounded-2xl p-4 flex gap-4 border border-amber-100">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-amber-200">
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Safe Operation Warning</p>
                            <p className="text-[11px] text-amber-700 font-bold mt-1 leading-relaxed">
                                This will reduce the recorded arrears for selected students. This action is irreversible and will be logged in their individual financial records.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 bg-white border border-slate-200 text-slate-500 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={applying || targetStudents.length === 0}
                        className="flex-1 bg-slate-800 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200 disabled:opacity-50"
                    >
                        {applying ? (
                            <><i className="fas fa-circle-notch fa-spin"></i> Processing...</>
                        ) : (
                            <><i className="fas fa-magic"></i> Apply Waiver</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BulkDiscountModal;
