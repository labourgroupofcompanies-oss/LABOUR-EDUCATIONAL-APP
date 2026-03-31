import React, { useState, useEffect } from 'react';
import { dbService } from '../../../services/dbService';
import { showToast } from '../../Common/Toast';
import { type Budget } from '../../../eduDb';

interface BudgetModalProps {
    schoolId: string;
    term: string;
    year: number;
    onClose: () => void;
    onSaved: () => void;
}

const CATEGORIES = ['Staff Payroll', 'Stationery', 'Maintenance', 'Utilities', 'Food/Catering', 'Transport', 'Events', 'Equipment', 'Other'];

const BudgetModal: React.FC<BudgetModalProps> = ({ schoolId, term, year, onClose, onSaved }) => {
    const [budgets, setBudgets] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const existing = await dbService.budgets.getAll(schoolId, term, year);
                const m: Record<string, string> = {};
                existing.forEach(b => {
                    m[b.category] = b.targetAmount.toString();
                });
                setBudgets(m);
            } catch (err) {
                console.error('Failed to load budgets', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [schoolId, term, year]);

    const handleSave = async () => {
        setSaving(true);
        try {
            for (const cat of CATEGORIES) {
                const amount = parseFloat(budgets[cat] || '0');
                if (amount > 0 || budgets[cat] === '0') {
                    await dbService.budgets.set({
                        schoolId,
                        category: cat,
                        term,
                        year,
                        targetAmount: amount,
                        updatedAt: Date.now(),
                        syncStatus: 'pending'
                    } as Budget);
                }
            }
            showToast('Budget targets updated', 'success');
            onSaved();
            onClose();
        } catch (err) {
            showToast('Failed to save budget', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-fadeIn">
                <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-black text-slate-800">Budget Planning</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                            {term} · {year}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="p-8 max-h-[60vh] overflow-y-auto space-y-4">
                    {loading ? (
                        <div className="py-12 text-center text-slate-300">
                            <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                            <p className="text-sm font-bold">Loading targets...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {CATEGORIES.map(cat => (
                                <div key={cat} className="space-y-1.5 p-4 rounded-3xl border border-slate-100 bg-slate-50/30">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">
                                        {cat}
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs italic">GHS</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={budgets[cat] || ''}
                                            onChange={e => setBudgets(prev => ({ ...prev, [cat]: e.target.value }))}
                                            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-800 focus:ring-4 focus:ring-slate-100 focus:border-slate-300 outline-none transition-all tracking-tight"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-8 border-t border-slate-50 bg-slate-50/30 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-slate-400 hover:bg-slate-100 transition-all border border-transparent shadow-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="flex-1 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-200 transition-all disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Set Targets'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BudgetModal;
