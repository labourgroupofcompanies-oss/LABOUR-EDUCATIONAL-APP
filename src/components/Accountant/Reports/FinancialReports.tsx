import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { useAcademicSession } from '../../../hooks/useAcademicSession';
import { financialService } from '../../../services/financialService';
import { eduDb } from '../../../eduDb';
import PrintPortal from '../../Common/PrintPortal';
import { db } from '../../../db';
import BudgetModal from './BudgetModal';

const FinancialReports: React.FC = () => {
    const { user } = useAuth();
    const { currentTerm: term, currentYear: year } = useAcademicSession();
    const [isPrinting, setIsPrinting] = useState(false);
    const [showBudgetModal, setShowBudgetModal] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'checking' | 'verified' | 'failed'>('idle');
    const [verifiedAt, setVerifiedAt] = useState<number | null>(null);

    const school = useLiveQuery(async () => {
        if (user?.schoolId) {
            return await db.schools
                .where('schoolId').equals(user.schoolId)
                .or('idCloud').equals(user.schoolId)
                .first();
        }
        return null;
    }, [user?.schoolId]);

    const report = useLiveQuery(async () => {
        if (!user?.schoolId) return null;

        const kpis = await financialService.getFinancialKPIs(user.schoolId, term, year);
        const budgets = await eduDb.budgets.where('schoolId').equals(user.schoolId).filter(b => b.term === term && b.year === year && !b.isDeleted).toArray();

        const expenses = kpis.expenses;

        // Expenses by category
        const expensesByCategory: Record<string, number> = {};
        expenses.forEach(e => {
            expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount;
        });

        // Budget analysis by category
        const budgetByCategory: Record<string, number> = {};
        budgets.forEach(b => {
            budgetByCategory[b.category] = (budgetByCategory[b.category] || 0) + b.targetAmount;
        });

        return {
            ...kpis,
            expensesByCategory,
            budgetByCategory,
        };
    }, [user?.schoolId, term, year]);

    useEffect(() => {
        if (user?.schoolId && term && year) {
            const verifySalaries = async () => {
                setVerificationStatus('checking');
                try {
                    await financialService.syncCloudSalaries(user.schoolId, term, year);
                    setVerificationStatus('verified');
                    setVerifiedAt(Date.now());
                } catch (err) {
                    console.error('Cloud salary verification failed:', err);
                    setVerificationStatus('failed');
                }
            };
            verifySalaries();
        }
    }, [user?.schoolId, term, year]);

    const fmt = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

    const handlePrint = () => {
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 1000);
    };

    return (
        <div className="space-y-8 animate-fadeIn pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Financial Reports</h2>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">{term} · {year} Term Analysis</p>
                </div>
                {report && (
                    <div className="flex gap-3 no-print">
                        <button
                            onClick={() => setShowBudgetModal(true)}
                            className="bg-slate-900 text-white hover:bg-slate-800 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center gap-3 shadow-xl shadow-slate-200"
                        >
                            <i className="fas fa-bullseye text-emerald-400"></i> Plan Budget
                        </button>
                        <button
                            onClick={handlePrint}
                            className="bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center gap-3 shadow-sm"
                        >
                            <i className="fas fa-file-pdf text-rose-500"></i> Export Report
                        </button>
                    </div>
                )}
            </div>

            {/* Main Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Total Collections</p>
                    <p className="text-2xl font-black text-slate-800 tracking-tighter">{fmt(report?.totalCollected || 0)}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-2">Fees recorded this term</p>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 text-center">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Net Cash Position</p>
                    <p className="text-3xl font-black text-slate-800 tracking-tighter">{fmt(report?.netCashPosition || 0)}</p>
                    <div className="mt-2 text-[8px] font-black text-slate-300 uppercase underline decoration-blue-200">Income - Expenditure</div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 text-right">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Outstanding Debt</p>
                    <p className="text-2xl font-black text-slate-800 tracking-tighter">{fmt(report?.outstandingArrears || 0)}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-2 italic">Student arrears total</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Expenditure by Category */}
                <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-50">
                        <h3 className="font-black text-slate-800">Categorical Spending</h3>
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Expense Allocation</p>
                    </div>
                    <div className="p-8 space-y-5">
                        {Object.entries(report?.expensesByCategory || {}).length === 0 ? (
                            <div className="py-10 text-center text-slate-300 text-xs italic">No expenses recorded</div>
                        ) : (
                            Object.entries(report?.expensesByCategory || {}).map(([cat, amt]) => {
                                const percentage = report?.totalExpenses ? (amt / report.totalExpenses) * 100 : 0;
                                return (
                                    <div key={cat} className="space-y-1.5 focus-within:translate-x-1 transition-transform">
                                        <div className="flex justify-between text-[11px] font-black uppercase tracking-tight">
                                            <span className="text-slate-600">{cat}</span>
                                            <span className="text-slate-800">{fmt(amt)}</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-slate-800 rounded-full transition-all duration-1000"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                        <p className="text-[8px] text-right font-bold text-slate-300 tracking-widest">{percentage.toFixed(1)}% of total</p>
                                    </div>
                                );
                            })
                        )}
                        <div className="pt-4 border-t border-slate-50 space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                <span>Operational Expenses</span>
                                <span className="text-slate-600">{fmt(report?.totalManualExpenses || 0)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                <div className="flex items-center gap-2">
                                    <span>Salaries (Paid Only)</span>
                                    {verificationStatus === 'checking' && (
                                        <i className="fas fa-spinner fa-spin text-blue-400" title="Verifying with cloud..."></i>
                                    )}
                                    {verificationStatus === 'verified' && (
                                        <i className="fas fa-check-circle text-emerald-500" title={`Cloud Verified at ${new Date(verifiedAt!).toLocaleTimeString()}`}></i>
                                    )}
                                    {verificationStatus === 'failed' && (
                                        <i className="fas fa-history text-slate-300" title="No connection: Using local cached data"></i>
                                    )}
                                </div>
                                <span className={verificationStatus === 'verified' ? 'text-emerald-500' : 'text-slate-500'}>
                                    {fmt(report?.totalPayroll || 0)}
                                </span>
                            </div>
                            <div className="pt-2 flex justify-between items-center">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Total Term Costs</span>
                                <span className="text-lg font-black text-rose-500 tracking-tighter">{fmt(report?.totalExpenses || 0)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Budget vs Actual */}
                <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden text-white border border-slate-800">
                    <div className="px-8 py-6 border-b border-white/5">
                        <h3 className="font-black">Budget vs. Actual</h3>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Spending Efficiency</p>
                    </div>
                    <div className="p-8 space-y-8">
                        {Object.keys(report?.budgetByCategory || {}).length === 0 ? (
                            <div className="py-10 text-center text-slate-600 text-xs italic">No budget targets set for this term</div>
                        ) : (
                            Object.entries(report?.budgetByCategory || {}).map(([cat, target]) => {
                                const spent = report?.expensesByCategory[cat] || 0;
                                const remaining = target - spent;
                                const percentage = (spent / target) * 100;
                                const isOver = spent > target;

                                return (
                                    <div key={cat} className="space-y-3">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-500 uppercase mb-0.5">{cat}</p>
                                                <p className="text-sm font-black">{fmt(spent)} <span className="text-[10px] font-bold text-slate-600 italic">spent</span></p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-slate-500 uppercase mb-0.5">Limit: {fmt(target)}</p>
                                                <p className={`text-xs font-black ${isOver ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {isOver ? `Over by ${fmt(Math.abs(remaining))}` : `${fmt(remaining)} left`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 ${isOver ? 'bg-rose-500' : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'}`}
                                                style={{ width: `${Math.min(100, percentage)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        <div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between">
                            <div>
                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">Overall Variance</p>
                                <p className={`text-xl font-black ${(report?.budgetVariance || 0) < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {fmt(report?.budgetVariance || 0)}
                                </p>
                            </div>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs ${(report?.budgetVariance || 0) < 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                <i className={`fas ${(report?.budgetVariance || 0) < 0 ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Portal */}
            {isPrinting && report && (
                <PrintPortal>
                    <div className="print-a4-portrait p-10 space-y-8 bg-white">
                        <div className="flex justify-between items-start border-b-2 border-slate-100 pb-8">
                            <div>
                                <h1 className="text-3xl font-black text-slate-900">{school?.schoolName || 'School Name'}</h1>
                                <p className="text-[9px] font-black text-purple-600 uppercase tracking-[0.3em] mt-2">Executive Financial Report</p>
                                <p className="text-xs font-bold text-slate-400 mt-1 italic">{term} · {year} Academic Year</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Generated On</p>
                                <p className="text-sm font-black text-slate-800">{new Date().toLocaleDateString('en-GH')}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 ring-1 ring-slate-100 p-8 rounded-[2.5rem]">
                            <div>
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] border-b border-slate-50 pb-2 mb-4">Term Collections</h3>
                                <p className="text-4xl font-black text-slate-900 tracking-tighter">{fmt(report.totalCollected)}</p>
                                <p className="text-xs text-slate-400 font-bold mt-2 italic">Total school fee income processed</p>
                            </div>
                            <div className="text-right">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] border-b border-slate-50 pb-2 mb-4">Total Expenditure</h3>
                                <p className="text-4xl font-black text-rose-500 tracking-tighter">{fmt(report.totalExpenses)}</p>
                                <p className="text-xs text-slate-400 font-bold mt-2 italic">Operating costs and staff payroll</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] px-2 italic">Category Analysis</h3>
                            <table className="w-full">
                                <thead className="bg-slate-50 rounded-xl overflow-hidden">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                                        <th className="px-6 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Budget Limit</th>
                                        <th className="px-6 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Actual Spent</th>
                                        <th className="px-6 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-widest">Variance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 italic">
                                    {Object.entries(report.budgetByCategory).map(([cat, target]) => {
                                        const spent = report.expensesByCategory[cat] || 0;
                                        const varAmt = target - spent;
                                        return (
                                            <tr key={cat}>
                                                <td className="px-6 py-4 text-xs font-black text-slate-700">{cat}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-500 text-right">{fmt(target)}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-900 text-right">{fmt(spent)}</td>
                                                <td className={`px-6 py-4 text-xs font-black text-right ${varAmt < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                    {fmt(varAmt)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-24 grid grid-cols-2 gap-20">
                            <div className="text-center">
                                <p className="text-base font-black text-slate-800 leading-none">{user?.fullName || user?.username || 'Accountant'}</p>
                                <div className="border-b-2 border-slate-200 pb-2 mb-2 mt-2"></div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Financial Controller</p>
                            </div>
                            <div className="text-center flex flex-col justify-end">
                                <div className="border-b-2 border-slate-200 pb-2 mb-2"></div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Executive Director</p>
                            </div>
                        </div>
                    </div>
                </PrintPortal>
            )}

            {showBudgetModal && user?.schoolId && (
                <BudgetModal
                    schoolId={user.schoolId}
                    term={term}
                    year={year}
                    onClose={() => setShowBudgetModal(false)}
                    onSaved={() => {
                        // useLiveQuery will handle the refresh
                    }}
                />
            )}
        </div>
    );
};

export default FinancialReports;
