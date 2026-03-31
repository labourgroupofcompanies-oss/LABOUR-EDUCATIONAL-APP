import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { useAcademicSession } from '../../../hooks/useAcademicSession';
import { financialService } from '../../../services/financialService';
import { eduDb } from '../../../eduDb';

interface Props {
    onNavigate: (view: string) => void;
}

const AccountantHome: React.FC<Props> = ({ onNavigate }) => {
    const { user } = useAuth();
    const { currentTerm: term, currentYear: year } = useAcademicSession();

    const stats = useLiveQuery(async () => {
        if (!user?.schoolId) return null;

        const kpis = await financialService.getFinancialKPIs(user.schoolId, term, year);
        const recentExpenses = await eduDb.expenses
            .where('schoolId')
            .equals(user.schoolId)
            .reverse()
            .limit(5)
            .toArray();

        return { ...kpis, recentExpenses };
    }, [user?.schoolId, term, year]);

    const kpiCards = [
        {
            label: 'Total Collected',
            value: `GHS ${(stats?.totalCollected || 0).toLocaleString()}`,
            icon: 'fa-coins',
            trend: 'This Term',
            textColor: 'text-emerald-600',
            bgColor: 'bg-emerald-50',
            action: () => onNavigate('fees-students')
        },
        {
            label: 'Net Cash Position',
            value: `GHS ${(stats?.netCashPosition || 0).toLocaleString()}`,
            icon: 'fa-wallet',
            trend: 'Income - Expense',
            textColor: 'text-blue-600',
            bgColor: 'bg-blue-50',
            action: () => onNavigate('reports')
        },
        {
            label: 'Outstanding Arrears',
            value: `GHS ${(stats?.outstandingArrears || 0).toLocaleString()}`,
            icon: 'fa-clock',
            trend: 'Debt to school',
            textColor: 'text-rose-600',
            bgColor: 'bg-rose-50',
            action: () => onNavigate('fees-students')
        },
        {
            label: 'Budget Variance',
            value: `GHS ${(stats?.budgetVariance || 0).toLocaleString()}`,
            icon: 'fa-chart-pie',
            trend: stats && stats.budgetVariance < 0 ? 'Over Budget' : 'Within Budget',
            textColor: stats && stats.budgetVariance < 0 ? 'text-amber-600' : 'text-purple-600',
            bgColor: stats && stats.budgetVariance < 0 ? 'bg-amber-50' : 'bg-purple-50',
            action: () => onNavigate('reports')
        }
    ];

    const quickActions = [
        { label: 'Set Fee Structure', icon: 'fa-list-alt', color: 'bg-emerald-500', action: () => onNavigate('fees-structure') },
        { label: 'Record Payment', icon: 'fa-plus-circle', color: 'bg-blue-500', action: () => onNavigate('fees-students') },
        { label: 'Run Payroll', icon: 'fa-money-bill-wave', color: 'bg-indigo-500', action: () => onNavigate('payroll') },
        { label: 'Add Expense', icon: 'fa-receipt', color: 'bg-purple-500', action: () => onNavigate('expenses') },
        { label: 'View Reports', icon: 'fa-chart-bar', color: 'bg-rose-500', action: () => onNavigate('reports') },
        { label: 'Fee Arrears', icon: 'fa-exclamation-triangle', color: 'bg-amber-500', action: () => onNavigate('fees-students') },
    ];

    return (
        <div className="space-y-8 md:space-y-12 animate-fadeIn pb-12">
            {/* ── Header / Greeting ── */}
            <div className="relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem] bg-gradient-to-br from-purple-700 via-purple-600 to-indigo-700 p-8 md:p-12 shadow-2xl shadow-purple-300/40 text-left">
                {/* Decorative Blobs */}
                <div className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
                <div className="pointer-events-none absolute bottom-0 right-1/4 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <p className="text-white/60 font-black text-[10px] uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                            <i className="fas fa-circle text-green-400 text-[6px] animate-pulse"></i>
                            Financial Overview
                        </p>
                        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight mb-2">
                            Hello, {user?.fullName?.split(' ')[0] || 'Accountant'} 👋
                        </h1>
                        <p className="text-blue-200 font-bold text-sm md:text-base flex items-center gap-2">
                            <i className="fas fa-calendar-alt text-purple-300"></i>
                            Viewing <span className="text-white">{term}</span>, <span className="text-white">{year}</span> Academic Year
                        </p>
                    </div>

                    {/* Status Badge */}
                    <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md rounded-2xl px-5 py-4 border border-white/20 shadow-lg w-max">
                        <div className="w-10 h-10 rounded-xl bg-green-400/20 flex items-center justify-center text-green-400 shadow-sm border border-green-400/30">
                            <i className="fas fa-check-circle text-lg"></i>
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none mb-1">Status</p>
                            <p className="text-sm font-black text-white leading-tight">Term Active</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Premium Stat Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                {kpiCards.map((card, i) => (
                    <button
                        key={i}
                        onClick={card.action}
                        className="bg-white p-5 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all group text-left w-full h-full flex flex-col justify-between"
                    >
                        <div>
                            <div className={`w-12 h-12 md:w-14 md:h-14 ${card.bgColor} ${card.textColor} rounded-xl md:rounded-2xl flex items-center justify-center text-xl md:text-2xl mb-4 group-hover:scale-110 transition-transform shadow-sm`}>
                                <i className={`fas ${card.icon}`}></i>
                            </div>
                            <h3 className="text-2xl md:text-3xl font-black text-slate-800 mb-1">{card.value}</h3>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{card.label}</p>
                        </div>
                        <div className="mt-5 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{card.trend}</p>
                        </div>
                    </button>
                ))}
            </div>

            {/* ── Quick Actions Grid ── */}
            <div className="space-y-4 md:space-y-6">
                <h2 className="text-lg md:text-xl font-black text-slate-800 flex items-center gap-3 px-1">
                    <span className="w-8 h-8 rounded-lg bg-amber-400 text-white flex items-center justify-center text-sm shadow-sm">
                        <i className="fas fa-bolt"></i>
                    </span>
                    Quick Actions
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-6">
                    {quickActions.map((a, i) => (
                        <button
                            key={i}
                            onClick={a.action}
                            className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col items-center gap-3 md:gap-4 group hover:border-purple-200 active:scale-95"
                        >
                            <div className={`w-12 h-12 md:w-14 md:h-14 ${a.color} rounded-xl md:rounded-2xl flex items-center justify-center text-white flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform`}>
                                <i className={`fas ${a.icon} text-lg md:text-xl`}></i>
                            </div>
                            <span className="font-black text-[10px] md:text-[11px] uppercase tracking-wider text-slate-600 group-hover:text-purple-600 transition-colors text-center leading-tight">
                                {a.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Recent Expenditure Table ── */}
            <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="px-6 md:px-10 py-6 md:py-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Recent Expenditure</h2>
                        <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Latest School Outgoings</p>
                    </div>
                    <button onClick={() => onNavigate('expenses')} className="w-full md:w-auto px-6 py-3 rounded-xl bg-purple-50 text-purple-600 font-black text-xs uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all shadow-sm">
                        View All <i className="fas fa-arrow-right ml-2 opacity-70"></i>
                    </button>
                </div>

                {!stats?.recentExpenses?.length ? (
                    <div className="py-24 flex flex-col items-center justify-center text-slate-300">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <i className="fas fa-receipt text-3xl opacity-30"></i>
                        </div>
                        <p className="font-black text-xs uppercase tracking-widest">No Activity This Term</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {stats.recentExpenses.map((expense, i) => (
                            <div key={i} className="px-6 md:px-10 py-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors group">
                                <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex flex-shrink-0 items-center justify-center text-slate-400 group-hover:bg-purple-100 group-hover:text-purple-600 transition-all font-black text-sm shadow-sm">
                                        {expense.category.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-800 text-sm md:text-base tracking-tight">{expense.description}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] md:text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md uppercase tracking-widest">
                                                {expense.category}
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-slate-200 hidden md:block"></span>
                                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                <i className="far fa-calendar-alt opacity-70"></i>
                                                {new Date(expense.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-black text-rose-600 text-base md:text-lg tracking-tight">
                                        -GHS {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                    <div className="flex items-center justify-end gap-1 mt-1">
                                        <i className="fas fa-check-circle text-green-500 text-[8px]"></i>
                                        <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">Logged</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountantHome;

