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
    const { currentTerm, currentYear } = useAcademicSession();
    const [term, setTerm] = useState(currentTerm || 'Term 1');
    const [year, setYear] = useState(currentYear || new Date().getFullYear());
    const [isPrinting, setIsPrinting] = useState(false);
    // Bumped after syncCloudSalaries completes so the useLiveQuery below
    // re-runs and picks up any newly-pulled payroll records.
    const [syncedAt, setSyncedAt] = useState(0);

    const [subTab, setSubTab] = useState<'financial' | 'payments'>('financial');
    const [paymentSearch, setPaymentSearch] = useState('');
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<'All' | 'Cash' | 'MoMo' | 'Bank'>('All');
    const [paymentTimeFilter, setPaymentTimeFilter] = useState<'All' | 'Today' | 'Yesterday' | 'Last 3 Days' | 'Last 7 Days' | 'Term'>('Term');
    const [isPrintingDailySummary, setIsPrintingDailySummary] = useState(false);
    const [isPrintingPaymentsList, setIsPrintingPaymentsList] = useState(false);

    useEffect(() => {
        // Always sync term and year from the academic session once it resolves
        // (it is async, so on first render currentTerm/currentYear may be defaults).
        if (currentTerm) setTerm(currentTerm);
        if (currentYear) setYear(currentYear);
    }, [currentTerm, currentYear]);
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

        // ── Reactive sentinel ──────────────────────────────────────────────────
        // Dexie's observable zone only tracks IndexedDB reads made directly in
        // this async callback chain. Because the heavy lifting is delegated to
        // financialService.getFinancialKPIs (an external function), Dexie may
        // NOT reliably track the payrollRecords table through that call boundary.
        // Reading the table here explicitly guarantees a re-run whenever any
        // payroll record changes locally (e.g., confirmPayout sets status → 'Paid').
        await eduDb.payrollRecords
            .where('schoolId').equals(user.schoolId)
            .count();
        // ──────────────────────────────────────────────────────────────────────

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
    }, [user?.schoolId, term, year, syncedAt]);

    useEffect(() => {
        if (user?.schoolId && term && year) {
            const verifySalaries = async () => {
                setVerificationStatus('checking');
                try {
                    await financialService.syncCloudSalaries(user.schoolId, term, year);
                    setVerificationStatus('verified');
                    setVerifiedAt(Date.now());
                    // Signal the report live-query to re-run with fresh payroll data
                    setSyncedAt(Date.now());
                } catch (err) {
                    console.error('Cloud salary verification failed:', err);
                    setVerificationStatus('failed');
                }
            };
            verifySalaries();
        }
    }, [user?.schoolId, term, year]);

    const fmt = (n: number) => `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`;

    // Fetch payments, students and classes for reporting
    const paymentReportData = useLiveQuery(async () => {
        if (!user?.schoolId) return { payments: [], students: [], classes: [] };

        const [payments, students, classes] = await Promise.all([
            eduDb.feePayments.where('schoolId').equals(user.schoolId).filter(p => !p.isDeleted).toArray(),
            eduDb.students.where('schoolId').equals(user.schoolId).filter(s => !s.isDeleted).toArray(),
            eduDb.classes.where('schoolId').equals(user.schoolId).filter(c => !c.isDeleted).toArray()
        ]);

        return {
            payments,
            students,
            classes
        };
    }, [user?.schoolId, syncedAt]);

    const paymentsList = paymentReportData?.payments || [];
    const studentsList = paymentReportData?.students || [];
    const classesList = paymentReportData?.classes || [];

    // Helper to resolve student details
    const studentMap = React.useMemo(() => {
        const map = new Map<number, { fullName: string; classId?: number }>();
        studentsList.forEach(s => {
            if (s.id) map.set(s.id, { fullName: s.fullName, classId: s.classId || undefined });
        });
        return map;
    }, [studentsList]);

    const classMap = React.useMemo(() => {
        const map = new Map<number, string>();
        classesList.forEach(c => {
            if (c.id) map.set(c.id, c.name);
        });
        return map;
    }, [classesList]);

    // Let's resolve class name and true class ID for each payment
    const resolvedPayments = React.useMemo(() => {
        return paymentsList.map(p => {
            const studentInfo = studentMap.get(p.studentId);
            const resolvedClassId = studentInfo?.classId || p.classId;
            const className = resolvedClassId ? classMap.get(resolvedClassId) : 'Unknown';
            return {
                ...p,
                className,
                studentName: studentInfo?.fullName || p.studentName
            };
        });
    }, [paymentsList, studentMap, classMap]);

    const dailyStats = React.useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

        const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
        const endOfYesterday = startOfToday - 1;

        const startOf3DaysAgo = startOfToday - 2 * 24 * 60 * 60 * 1000;
        const startOf7DaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;

        const getStatsForRange = (start: number, end: number) => {
            const rangePayments = resolvedPayments.filter(p => !p.isVoided && p.paymentDate >= start && p.paymentDate <= end);
            const count = rangePayments.length;
            const amount = rangePayments.reduce((sum, p) => sum + p.amountPaid, 0);
            
            const cash = rangePayments.filter(p => p.paymentMethod === 'Cash').reduce((sum, p) => sum + p.amountPaid, 0);
            const momo = rangePayments.filter(p => p.paymentMethod === 'MoMo').reduce((sum, p) => sum + p.amountPaid, 0);
            const bank = rangePayments.filter(p => p.paymentMethod === 'Bank').reduce((sum, p) => sum + p.amountPaid, 0);

            return { count, amount, cash, momo, bank };
        };

        return {
            today: getStatsForRange(startOfToday, endOfToday),
            yesterday: getStatsForRange(startOfYesterday, endOfYesterday),
            last3Days: getStatsForRange(startOf3DaysAgo, endOfToday),
            last7Days: getStatsForRange(startOf7DaysAgo, endOfToday)
        };
    }, [resolvedPayments]);

    const filteredPayments = React.useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

        const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
        const endOfYesterday = startOfToday - 1;

        const startOf3DaysAgo = startOfToday - 2 * 24 * 60 * 60 * 1000;
        const startOf7DaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;

        let list = resolvedPayments;

        if (paymentSearch.trim()) {
            const s = paymentSearch.toLowerCase();
            list = list.filter(p => 
                p.studentName.toLowerCase().includes(s) || 
                p.receiptNo.toLowerCase().includes(s)
            );
        }

        if (paymentMethodFilter !== 'All') {
            list = list.filter(p => p.paymentMethod === paymentMethodFilter);
        }

        if (paymentTimeFilter === 'Term') {
            list = list.filter(p => p.term === term && p.year === year);
        } else if (paymentTimeFilter === 'Today') {
            list = list.filter(p => p.paymentDate >= startOfToday && p.paymentDate <= endOfToday);
        } else if (paymentTimeFilter === 'Yesterday') {
            list = list.filter(p => p.paymentDate >= startOfYesterday && p.paymentDate <= endOfYesterday);
        } else if (paymentTimeFilter === 'Last 3 Days') {
            list = list.filter(p => p.paymentDate >= startOf3DaysAgo && p.paymentDate <= endOfToday);
        } else if (paymentTimeFilter === 'Last 7 Days') {
            list = list.filter(p => p.paymentDate >= startOf7DaysAgo && p.paymentDate <= endOfToday);
        }

        return list.sort((a, b) => b.paymentDate - a.paymentDate);
    }, [resolvedPayments, paymentSearch, paymentMethodFilter, paymentTimeFilter, term, year]);

    const filteredStats = React.useMemo(() => {
        const active = filteredPayments.filter(p => !p.isVoided);
        const total = active.reduce((sum, p) => sum + p.amountPaid, 0);
        const cash = active.filter(p => p.paymentMethod === 'Cash').reduce((sum, p) => sum + p.amountPaid, 0);
        const momo = active.filter(p => p.paymentMethod === 'MoMo').reduce((sum, p) => sum + p.amountPaid, 0);
        const bank = active.filter(p => p.paymentMethod === 'Bank').reduce((sum, p) => sum + p.amountPaid, 0);
        const transactionCount = active.length;
        const voidedCount = filteredPayments.filter(p => p.isVoided).length;

        return {
            total,
            cash,
            momo,
            bank,
            transactionCount,
            voidedCount
        };
    }, [filteredPayments]);

    const handlePrint = () => {
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 1000);
    };

    const handlePrintDailySummary = () => {
        setIsPrintingDailySummary(true);
        setTimeout(() => {
            window.print();
            setIsPrintingDailySummary(false);
        }, 1000);
    };

    const handlePrintPaymentsList = () => {
        setIsPrintingPaymentsList(true);
        setTimeout(() => {
            window.print();
            setIsPrintingPaymentsList(false);
        }, 1000);
    };

    return (
        <div className="space-y-8 animate-fadeIn pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Financial Reports</h2>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">{term} · {year} Term Analysis</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-slate-100 gap-2 w-full sm:w-auto">
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
                            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                {report && subTab === 'financial' && (
                    <div className="flex gap-3 no-print w-full sm:w-auto">
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
            </div>

            {/* Sub-tabs Selection */}
            <div className="flex bg-slate-100/80 p-1 rounded-2xl w-full max-w-sm gap-1 no-print">
                <button
                    onClick={() => setSubTab('financial')}
                    className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${subTab === 'financial' ? 'bg-white text-slate-800 shadow-md shadow-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <i className="fas fa-chart-pie mr-1.5"></i> Financials
                </button>
                <button
                    onClick={() => setSubTab('payments')}
                    className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${subTab === 'payments' ? 'bg-white text-slate-800 shadow-md shadow-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <i className="fas fa-money-bill-wave mr-1.5"></i> Payment Reports
                </button>
            </div>

            {subTab === 'financial' ? (
                <>
                    {/* Main Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                        <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/20">
                            <p className="text-[8px] md:text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 md:mb-1.5">Collections</p>
                            <p className="text-lg md:text-2xl font-black text-slate-800 tracking-tighter truncate">{(report?.totalCollected || 0).toLocaleString()}</p>
                            <p className="hidden md:block text-[10px] text-slate-400 font-bold mt-2">Fees recorded this term</p>
                        </div>
                        <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/20 text-center">
                            <p className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 md:mb-1.5">Net Position</p>
                            <p className="text-xl md:text-3xl font-black text-slate-800 tracking-tighter truncate">{(report?.netCashPosition || 0).toLocaleString()}</p>
                            <div className="hidden md:block mt-2 text-[8px] font-black text-slate-300 uppercase underline decoration-blue-200">Income - Expenditure</div>
                        </div>
                        <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/20 text-right col-span-2 md:col-span-1">
                            <p className="text-[8px] md:text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1 md:mb-1.5">Outstanding Debt</p>
                            <p className="text-lg md:text-2xl font-black text-slate-800 tracking-tighter truncate">{(report?.outstandingArrears || 0).toLocaleString()}</p>
                            <p className="hidden md:block text-[10px] text-slate-400 font-bold mt-2 italic">Student arrears total</p>
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
                </>
            ) : (
                <>
                    {/* Summary Cards by Medium */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                        <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/20">
                            <p className="text-[8px] md:text-[10px] font-black text-teal-500 uppercase tracking-widest mb-1 md:mb-1.5">Cash Collections</p>
                            <p className="text-lg md:text-2xl font-black text-slate-800 tracking-tighter truncate">{fmt(filteredStats.cash)}</p>
                            <p className="hidden md:block text-[10px] text-slate-400 font-bold mt-2">Physical cash deposits</p>
                        </div>
                        <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/20">
                            <p className="text-[8px] md:text-[10px] font-black text-teal-500 uppercase tracking-widest mb-1 md:mb-1.5">MoMo Collections</p>
                            <p className="text-lg md:text-2xl font-black text-slate-800 tracking-tighter truncate">{fmt(filteredStats.momo)}</p>
                            <p className="hidden md:block text-[10px] text-slate-400 font-bold mt-2">Mobile money payments</p>
                        </div>
                        <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/20">
                            <p className="text-[8px] md:text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 md:mb-1.5">Bank Collections</p>
                            <p className="text-lg md:text-2xl font-black text-slate-800 tracking-tighter truncate">{fmt(filteredStats.bank)}</p>
                            <p className="hidden md:block text-[10px] text-slate-400 font-bold mt-2">Direct bank deposits</p>
                        </div>
                        <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/20 bg-gradient-to-br from-slate-50 to-slate-100">
                            <p className="text-[8px] md:text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 md:mb-1.5">Total Filtered</p>
                            <p className="text-lg md:text-2xl font-black text-emerald-600 tracking-tighter truncate">{fmt(filteredStats.total)}</p>
                            <p className="hidden md:block text-[10px] text-slate-400 font-bold mt-2">{filteredStats.transactionCount} active transactions</p>
                        </div>
                    </div>

                    {/* Daily activity and payments table grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Daily Activity Summary */}
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden lg:col-span-1">
                            <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                                <div>
                                    <h3 className="font-black text-slate-800">Daily Summaries</h3>
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Activity tracking</p>
                                </div>
                                <button
                                    onClick={handlePrintDailySummary}
                                    className="bg-slate-100 text-slate-600 hover:bg-slate-200 p-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5"
                                    title="Print Daily Summary"
                                >
                                    <i className="fas fa-print"></i> Print
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                {[
                                    { name: 'Today', stats: dailyStats.today, color: 'border-emerald-500 bg-emerald-50/10' },
                                    { name: 'Yesterday', stats: dailyStats.yesterday, color: 'border-slate-300 bg-slate-50/20' },
                                    { name: 'Last 3 Days', stats: dailyStats.last3Days, color: 'border-teal-300 bg-teal-50/10' },
                                    { name: 'Last 7 Days (Week)', stats: dailyStats.last7Days, color: 'border-teal-300 bg-teal-50/10' }
                                ].map(row => (
                                    <div key={row.name} className={`p-4 rounded-2xl border-l-4 ${row.color} shadow-sm space-y-2`}>
                                        <div className="flex justify-between items-center">
                                            <p className="font-black text-xs text-slate-800 uppercase tracking-tight">{row.name}</p>
                                            <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-black text-slate-500 uppercase tracking-wider">{row.stats.count} Payees</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                            <div>
                                                <span className="text-slate-400">Cash:</span> <span className="font-bold text-slate-700">{fmt(row.stats.cash)}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400">MoMo:</span> <span className="font-bold text-slate-700">{fmt(row.stats.momo)}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400">Bank:</span> <span className="font-bold text-slate-700">{fmt(row.stats.bank)}</span>
                                            </div>
                                            <div className="col-span-2 pt-1 border-t border-slate-100/50 mt-1 flex justify-between">
                                                <span className="text-slate-400 font-bold">Total Collected:</span>
                                                <span className="font-black text-emerald-600">{fmt(row.stats.amount)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Payments List Ledger */}
                        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden lg:col-span-2 flex flex-col">
                            <div className="px-8 py-6 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <h3 className="font-black text-slate-800">Transaction Ledger</h3>
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">Detailed audit trail</p>
                                </div>
                                <button
                                    onClick={handlePrintPaymentsList}
                                    disabled={filteredPayments.length === 0}
                                    className="bg-slate-900 text-white hover:bg-slate-800 px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    <i className="fas fa-file-pdf text-rose-400"></i> Export Ledger
                                </button>
                            </div>

                            {/* Filters row inside Ledger card */}
                            <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
                                    <input
                                        type="text"
                                        placeholder="Search student or receipt..."
                                        value={paymentSearch}
                                        onChange={e => setPaymentSearch(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-black text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-50 transition-all placeholder:text-slate-300"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        value={paymentMethodFilter}
                                        onChange={e => setPaymentMethodFilter(e.target.value as any)}
                                        className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-600 outline-none focus:border-teal-400 cursor-pointer min-w-[100px]"
                                    >
                                        <option value="All">All Mediums</option>
                                        <option value="Cash">Cash Only</option>
                                        <option value="MoMo">MoMo Only</option>
                                        <option value="Bank">Bank Only</option>
                                    </select>
                                    <select
                                        value={paymentTimeFilter}
                                        onChange={e => setPaymentTimeFilter(e.target.value as any)}
                                        className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-600 outline-none focus:border-teal-400 cursor-pointer min-w-[110px]"
                                    >
                                        <option value="Term">Selected Term</option>
                                        <option value="Today">Today</option>
                                        <option value="Yesterday">Yesterday</option>
                                        <option value="Last 3 Days">3 Days</option>
                                        <option value="Last 7 Days">7 Days (Week)</option>
                                        <option value="All">All History</option>
                                    </select>
                                </div>
                            </div>

                            {/* Ledger Table */}
                            <div className="overflow-x-auto flex-1">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/50 border-b border-slate-100">
                                            {['Receipt No', 'Date', 'Payee Details', 'Medium', 'Amount', 'Status'].map(h => (
                                                <th key={h} className="px-6 py-4 text-[8px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredPayments.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-16 text-center text-slate-400 italic text-xs">
                                                    No payments matches your criteria.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredPayments.map((p, idx) => (
                                                <tr key={p.id || idx} className={`group hover:bg-slate-50/40 transition-colors ${p.isVoided ? 'opacity-50 line-through' : ''}`}>
                                                    <td className="px-6 py-4">
                                                        <span className="font-black text-xs text-slate-700 bg-slate-100 group-hover:bg-teal-50 px-2 py-1 rounded-md uppercase tracking-wider">{p.receiptNo}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-[11px] text-slate-500 whitespace-nowrap">
                                                        {new Date(p.paymentDate).toLocaleDateString('en-GH')}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <p className="font-black text-slate-800 text-xs">{p.studentName}</p>
                                                        <p className="text-[9px] font-bold text-slate-400">{p.className}</p>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-bold whitespace-nowrap uppercase tracking-wider text-slate-600">
                                                        {p.paymentMethod === 'Cash' && <span className="text-teal-600"><i className="fas fa-wallet mr-1"></i> Cash</span>}
                                                        {p.paymentMethod === 'MoMo' && <span className="text-teal-600"><i className="fas fa-mobile-alt mr-1"></i> MoMo</span>}
                                                        {p.paymentMethod === 'Bank' && <span className="text-blue-600"><i className="fas fa-university mr-1"></i> Bank</span>}
                                                    </td>
                                                    <td className="px-6 py-4 font-black text-slate-800 text-xs whitespace-nowrap">
                                                        {fmt(p.amountPaid)}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {p.isVoided ? (
                                                            <span className="inline-flex px-1.5 py-0.5 bg-red-100 rounded text-[7px] font-black text-red-600 uppercase tracking-widest">Voided</span>
                                                        ) : (
                                                            <span className="inline-flex px-1.5 py-0.5 bg-emerald-100 rounded text-[7px] font-black text-emerald-600 uppercase tracking-widest">Active</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Print Portal - Financial Overview */}
            {isPrinting && report && (
                <PrintPortal>
                    <div className="print-a4-portrait p-10 space-y-8 bg-white">
                        <div className="flex justify-between items-start border-b-2 border-slate-100 pb-8">
                            <div>
                                <h1 className="text-3xl font-black text-slate-900">{school?.schoolName || 'School Name'}</h1>
                                <p className="text-[9px] font-black text-teal-600 uppercase tracking-[0.3em] mt-2">Executive Financial Report</p>
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

            {/* Print Portal - Daily Payments Summary */}
            {isPrintingDailySummary && (
                <PrintPortal>
                    <div className="print-a4-portrait p-10 space-y-8 bg-white text-slate-800">
                        <div className="flex justify-between items-start border-b-2 border-slate-100 pb-6">
                            <div>
                                <h1 className="text-3xl font-black text-slate-900">{school?.schoolName || 'School Name'}</h1>
                                <p className="text-[9px] font-black text-teal-600 uppercase tracking-[0.3em] mt-2">Daily Payments Summary Report</p>
                                <p className="text-xs font-bold text-slate-400 mt-1 italic">Generated On: {new Date().toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Academic Period</p>
                                <p className="text-sm font-black text-slate-800">{term} · {year}</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.15em] border-b pb-2 mb-4">Daily Activity Breakdowns</h3>
                            <table className="w-full text-left border-collapse text-slate-800">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Period</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">Transactions</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Cash</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">MoMo</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Bank</th>
                                        <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Total (GHS)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {[
                                        { name: 'Today', data: dailyStats.today },
                                        { name: 'Yesterday', data: dailyStats.yesterday },
                                        { name: 'Last 3 Days', data: dailyStats.last3Days },
                                        { name: 'Last 7 Days (Week)', data: dailyStats.last7Days }
                                    ].map(row => (
                                        <tr key={row.name} className="hover:bg-slate-50/50">
                                            <td className="px-4 py-4 font-bold text-slate-800">{row.name}</td>
                                            <td className="px-4 py-4 text-center font-bold text-slate-600">{row.data.count}</td>
                                            <td className="px-4 py-4 text-right text-slate-600">{fmt(row.data.cash)}</td>
                                            <td className="px-4 py-4 text-right text-slate-600">{fmt(row.data.momo)}</td>
                                            <td className="px-4 py-4 text-right text-slate-600">{fmt(row.data.bank)}</td>
                                            <td className="px-4 py-4 text-right font-black text-emerald-600">{fmt(row.data.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-20 grid grid-cols-2 gap-20">
                            <div className="text-center">
                                <p className="text-sm font-black text-slate-800 leading-none">{user?.fullName || 'Accountant'}</p>
                                <div className="border-b border-slate-200 pb-1 mb-1 mt-6"></div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Accountant / Cashier Signature</p>
                            </div>
                            <div className="text-center flex flex-col justify-end">
                                <div className="border-b border-slate-200 pb-1 mb-1"></div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Approved / Verified By</p>
                            </div>
                        </div>
                    </div>
                </PrintPortal>
            )}

            {/* Print Portal - Detailed Payments List */}
            {isPrintingPaymentsList && (
                <PrintPortal>
                    <div className="print-a4-portrait p-10 space-y-8 bg-white text-slate-800">
                        <div className="flex justify-between items-start border-b-2 border-slate-100 pb-6">
                            <div>
                                <h1 className="text-3xl font-black text-slate-900">{school?.schoolName || 'School Name'}</h1>
                                <p className="text-[9px] font-black text-teal-600 uppercase tracking-[0.3em] mt-2">Detailed Fee Payments List</p>
                                <p className="text-xs font-bold text-slate-400 mt-1 italic">Generated On: {new Date().toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Period / Method / Time</p>
                                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{term} · {paymentMethodFilter} · {paymentTimeFilter}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 ring-1 ring-slate-100 p-4 rounded-xl text-center bg-slate-50/50">
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase">Cash Collected</p>
                                <p className="text-xs font-black text-slate-700">{fmt(filteredStats.cash)}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase">MoMo Collected</p>
                                <p className="text-xs font-black text-slate-700">{fmt(filteredStats.momo)}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-slate-400 uppercase">Bank Collected</p>
                                <p className="text-xs font-black text-slate-700">{fmt(filteredStats.bank)}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-teal-600 uppercase">Total Collected</p>
                                <p className="text-sm font-black text-emerald-600">{fmt(filteredStats.total)}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Transaction Ledger ({filteredPayments.length} rows)</h3>
                            <table className="w-full text-left border-collapse text-slate-800">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                        <th className="px-2 py-3 text-[8px] font-black text-slate-500 uppercase tracking-wider w-8">S/N</th>
                                        <th className="px-2 py-3 text-[8px] font-black text-slate-500 uppercase tracking-wider">Receipt No</th>
                                        <th className="px-2 py-3 text-[8px] font-black text-slate-500 uppercase tracking-wider">Date</th>
                                        <th className="px-2 py-3 text-[8px] font-black text-slate-500 uppercase tracking-wider">Student Name</th>
                                        <th className="px-2 py-3 text-[8px] font-black text-slate-500 uppercase tracking-wider">Class</th>
                                        <th className="px-2 py-3 text-[8px] font-black text-slate-500 uppercase tracking-wider">Method</th>
                                        <th className="px-2 py-3 text-[8px] font-black text-slate-500 uppercase tracking-wider text-right">Amount</th>
                                        <th className="px-2 py-3 text-[8px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-[10px]">
                                    {filteredPayments.map((p, idx) => (
                                        <tr key={p.id || idx} className={p.isVoided ? 'bg-rose-50/30 line-through text-slate-400' : 'hover:bg-slate-50/30'}>
                                            <td className="px-2 py-2.5 font-bold">{idx + 1}</td>
                                            <td className="px-2 py-2.5 font-bold uppercase">{p.receiptNo}</td>
                                            <td className="px-2 py-2.5">{new Date(p.paymentDate).toLocaleDateString('en-GH')}</td>
                                            <td className="px-2 py-2.5 font-black">{p.studentName}</td>
                                            <td className="px-2 py-2.5">{p.className}</td>
                                            <td className="px-2 py-2.5 font-bold uppercase">{p.paymentMethod}</td>
                                            <td className="px-2 py-2.5 text-right font-black">{fmt(p.amountPaid)}</td>
                                            <td className="px-2 py-2.5 font-black uppercase text-[8px]">{p.isVoided ? 'Voided' : 'Active'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-20 grid grid-cols-2 gap-20">
                            <div className="text-center">
                                <p className="text-sm font-black text-slate-800 leading-none">{user?.fullName || 'Accountant'}</p>
                                <div className="border-b border-slate-200 pb-1 mb-1 mt-6"></div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Accountant / Cashier Signature</p>
                            </div>
                            <div className="text-center flex flex-col justify-end">
                                <div className="border-b border-slate-200 pb-1 mb-1"></div>
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Approved / Verified By</p>
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

