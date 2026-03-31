import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { useAcademicSession } from '../../../hooks/useAcademicSession';
import { dbService } from '../../../services/dbService';
import { showToast } from '../../Common/Toast';

const FeeStructure: React.FC = () => {
    const { user } = useAuth();
    const { currentTerm, currentYear } = useAcademicSession();
    const [term, setTerm] = useState<string>(currentTerm || 'Term 1');
    const [year, setYear] = useState<number>(currentYear || new Date().getFullYear());

    React.useEffect(() => {
        if (currentTerm && term === 'Term 1') setTerm(currentTerm);
        if (currentYear && year === new Date().getFullYear()) setYear(currentYear);
    }, [currentTerm, currentYear]);

    const classes = useLiveQuery(() =>
        user?.schoolId ? dbService.classes.getAll(user.schoolId) : []
        , [user?.schoolId]);

    const structures = useLiveQuery(() =>
        user?.schoolId ? dbService.fees.getAllStructures(user.schoolId, term, year) : []
        , [user?.schoolId, term, year]);

    const [fees, setFees] = useState<Record<number, string>>({});

    // Pre-fill existing fee structures
    useEffect(() => {
        if (structures && structures.length > 0) {
            const m: Record<number, string> = {};
            for (const s of structures) {
                m[s.classId] = s.termFeeAmount.toString();
            }
            setFees(m);
        }
    }, [structures]);

    const handleSave = async (classId: number, className: string) => {
        if (!user?.schoolId) return;
        const amount = parseFloat(fees[classId] || '0');
        if (isNaN(amount) || amount < 0) {
            showToast('Enter a valid fee amount', 'error'); return;
        }
        await dbService.fees.setStructure({
            schoolId: user.schoolId,
            classId,
            className,
            termFeeAmount: amount,
            term,
            year,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            syncStatus: 'pending'
        });
        showToast(`Fee set for ${className}: GHS ${amount.toFixed(2)}`, 'success');
    };

    return (
        <div className="space-y-8 md:space-y-12 animate-fadeIn pb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <p className="text-emerald-600 font-black text-[10px] uppercase tracking-[0.3em] mb-1">Tuition & Fees</p>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Fee Structure</h2>
                    <p className="text-slate-400 font-bold text-xs mt-1">Set the term fee amount per class</p>
                </div>
                
                <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-100 gap-2">
                    <select
                        value={term}
                        onChange={e => setTerm(e.target.value)}
                        className="border-none bg-slate-50 rounded-xl px-4 py-2.5 text-xs font-black text-slate-700 focus:ring-2 focus:ring-emerald-400 outline-none w-full sm:w-auto cursor-pointer"
                    >
                        <option value="Term 1">Term 1</option>
                        <option value="Term 2">Term 2</option>
                        <option value="Term 3">Term 3</option>
                    </select>
                    <select
                        value={year}
                        onChange={e => setYear(parseInt(e.target.value))}
                        className="border-none bg-slate-50 rounded-xl px-4 py-2.5 text-xs font-black text-slate-700 focus:ring-2 focus:ring-emerald-400 outline-none w-full sm:w-auto cursor-pointer"
                    >
                        {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - 15 + i).map(y => (
                            <option key={y} value={y}>{y} / {y + 1}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                {/* Header */}
                <div className="px-6 md:px-10 py-6 md:py-8 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 bg-emerald-500 rounded-xl md:rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-emerald-200">
                        <i className="fas fa-list-alt"></i>
                    </div>
                    <div>
                        <p className="font-black text-slate-800 text-lg md:text-xl tracking-tight leading-tight">{term} · {year}</p>
                        <p className="text-[10px] md:text-xs text-emerald-600 font-black uppercase tracking-widest mt-0.5">{classes?.length || 0} active classes</p>
                    </div>
                </div>

                {!classes?.length ? (
                    <div className="px-6 py-24 flex flex-col items-center justify-center text-slate-300">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <i className="fas fa-chalkboard text-3xl opacity-30"></i>
                        </div>
                        <p className="font-black text-xs uppercase tracking-widest">No classes found</p>
                        <p className="text-sm font-medium mt-2 max-w-xs text-center">Ask the Headteacher to create classes first.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="px-6 md:px-10 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Class</th>
                                    <th className="px-6 md:px-10 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Term Fee Target</th>
                                    <th className="px-6 md:px-10 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                    <th className="px-6 md:px-10 py-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {classes.map(cls => {
                                    const existing = structures?.find(s => s.classId === cls.id);
                                    return (
                                        <tr key={cls.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-6 md:px-10 py-5">
                                                <p className="font-black text-slate-800 text-sm md:text-base group-hover:text-emerald-600 transition-colors">{cls.name}</p>
                                            </td>
                                            <td className="px-6 md:px-10 py-5">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-slate-400 font-black text-sm">GHS</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="0.00"
                                                        value={fees[cls.id!] ?? ''}
                                                        onChange={e => setFees(prev => ({ ...prev, [cls.id!]: e.target.value }))}
                                                        className="w-32 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-400 focus:border-transparent outline-none transition-all shadow-inner"
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-6 md:px-10 py-5">
                                                {existing ? (
                                                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest">
                                                        <i className="fas fa-check-circle"></i> Configured
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-500 text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest">
                                                        <i className="fas fa-clock"></i> Not Set
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 md:px-10 py-5 text-right">
                                                <button
                                                    onClick={() => handleSave(cls.id!, cls.name)}
                                                    className="bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm group-hover:shadow-md"
                                                >
                                                    <i className="fas fa-save mr-1.5"></i> Save
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FeeStructure;
