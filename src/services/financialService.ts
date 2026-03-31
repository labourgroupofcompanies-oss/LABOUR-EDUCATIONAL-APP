import { eduDb } from '../eduDb';
import { supabase } from '../supabaseClient';

export interface FinancialKPIs {
    totalCollected: number;
    totalExpenses: number;
    totalManualExpenses: number;
    totalPayroll: number;
    netCashPosition: number;
    outstandingArrears: number;
    budgetTarget: number;
    actualSpent: number;
    budgetVariance: number;
    expenses: any[];
}

export const financialService = {
    /**
     * Centralized term-to-month and date range mapping.
     */
    getTermRange(term: string, year: number) {
        const t = term.toLowerCase();
        let months: number[] = [];
        let startTime = 0;
        let endTime = 0;
        let payrollYear = year;

        if (t.includes('1') || t.includes('first')) {
            months = [9, 10, 11, 12];
            startTime = new Date(year, 8, 1).getTime(); // Sep 1
            endTime = new Date(year, 11, 31, 23, 59, 59).getTime(); // Dec 31
            payrollYear = year;
        } else if (t.includes('2') || t.includes('second')) {
            months = [1, 2, 3, 4];
            startTime = new Date(year + 1, 0, 1).getTime(); // Jan 1
            endTime = new Date(year + 1, 3, 30, 23, 59, 59).getTime(); // Apr 30
            payrollYear = year + 1;
        } else if (t.includes('3') || t.includes('third')) {
            months = [5, 6, 7, 8];
            startTime = new Date(year + 1, 4, 1).getTime(); // May 1
            endTime = new Date(year + 1, 7, 31, 23, 59, 59).getTime(); // Aug 31
            payrollYear = year + 1;
        } else {
            // Broad Fallback: Full Academic Session (e.g. Sep 2025 - Aug 2026)
            months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
            startTime = new Date(year, 8, 1).getTime();
            endTime = new Date(year + 1, 7, 31, 23, 59, 59).getTime();
            payrollYear = year;
        }

        return { months, startTime, endTime, payrollYear };
    },

    /**
     * Calculates the primary financial KPIs for the school.
     * Integrates collections, expenses, and budgets.
     */
    async getFinancialKPIs(schoolId: string, term: string, year: number): Promise<FinancialKPIs> {
        // 1. Total Collections
        const payments = await eduDb.feePayments
            .where('schoolId')
            .equals(schoolId)
            .filter(p => p.term === term && p.year === year && !p.isDeleted)
            .toArray();
        const totalCollected = payments.reduce((sum, p) => sum + p.amountPaid, 0);

        // 2. Get Centralized Ranges
        const { months, startTime, endTime, payrollYear } = this.getTermRange(term, year);

        // 3. Manual Expenses
        const manualExpenses = await eduDb.expenses
            .where('schoolId')
            .equals(schoolId)
            .filter(e => !e.voided && !e.isDeleted && e.date >= startTime && e.date <= endTime)
            .toArray();

        // 4. Payroll Records (Paid Only)
        const payrollRecords = await eduDb.payrollRecords
            .where('schoolId')
            .equals(schoolId)
            .filter(p => !p.isDeleted && p.year === payrollYear && months.includes(p.month) && p.status === 'Paid')
            .toArray();

        const totalManualExpenses = manualExpenses.reduce((sum, e) => sum + e.amount, 0);
        const totalPayroll = payrollRecords.reduce((sum, p) => sum + p.netPay, 0);
        
        const totalExpenses = totalManualExpenses + totalPayroll;

        // Add payroll as a synthetic expense category for breakdown
        const expenses = [
            ...manualExpenses,
            {
                category: 'Staff Payroll',
                description: 'Aggregated Staff Salaries',
                amount: totalPayroll,
                date: endTime, // End of term
            }
        ];

        // 3. Outstanding Arrears
        const students = await eduDb.students
            .where('schoolId')
            .equals(schoolId)
            .filter(s => !s.isDeleted)
            .toArray();
        const outstandingArrears = students.reduce((sum, s) => sum + (s.arrears || 0), 0);

        // 4. Budgets
        const budgets = await eduDb.budgets
            .where('schoolId')
            .equals(schoolId)
            .filter(b => b.term === term && b.year === year && !b.isDeleted)
            .toArray();
        const budgetTarget = budgets.reduce((sum, b) => sum + b.targetAmount, 0);

        return {
            totalCollected,
            totalExpenses,
            totalManualExpenses,
            totalPayroll,
            netCashPosition: totalCollected - totalExpenses,
            outstandingArrears,
            budgetTarget,
            actualSpent: totalExpenses,
            budgetVariance: budgetTarget - totalExpenses,
            expenses
        };
    },

    /**
     * Applies a bulk discount or waiver to a list of students.
     * Safely updates student arrears without corrupting payment history.
     */
    async applyBulkDiscount(schoolId: string, studentIds: number[], amount: number, reason: string) {
        return await eduDb.transaction('rw', eduDb.students, async () => {
            for (const id of studentIds) {
                const student = await eduDb.students.get(id);
                if (student && student.schoolId === schoolId) {
                    const currentArrears = student.arrears || 0;
                    const newArrears = Math.max(0, currentArrears - amount);

                    await eduDb.students.update(id, {
                        arrears: newArrears,
                        updatedAt: Date.now(),
                        syncStatus: 'pending',
                        notes: (student as any).notes ? `${(student as any).notes}\n[Discount] ${reason}: -${amount}` : `[Discount] ${reason}: -${amount}`
                    } as any);
                }
            }
        });
    },

    /**
     * Set a budget for a category
     */
    async setBudget(budget: any) {
        const now = Date.now();
        const existing = await eduDb.budgets
            .where('[schoolId+category+term+year]')
            .equals([budget.schoolId, budget.category, budget.term, budget.year])
            .first();

        if (existing) {
            return await eduDb.budgets.update(existing.id!, {
                ...budget,
                updatedAt: now,
                syncStatus: 'pending'
            });
        }

        return await eduDb.budgets.add({
            ...budget,
            createdAt: now,
            updatedAt: now,
            syncStatus: 'pending',
            isDeleted: false
        });
    },

    /**
     * Synchronizes paid payroll records from Supabase for the given term.
     * Uses stable identity keyed by staff UUID, month, and year.
     */
    async syncCloudSalaries(schoolId: string, term: string, year: number) {
        const { months, payrollYear } = this.getTermRange(term, year);

        const { data, error } = await supabase
            .from('payroll_records')
            .select('*')
            .eq('school_id', schoolId)
            .eq('year', payrollYear)
            .in('month', months)
            .eq('status', 'Paid');

        if (error) throw error;
        if (!data || data.length === 0) return;

        for (const item of data) {
            const record: any = {
                schoolId: item.school_id,
                idCloud: item.id,
                staffIdCloud: item.staff_id,
                staffId: item.staff_id_local,
                staffName: item.staff_name,
                staffRole: item.staff_role,
                month: item.month,
                year: item.year,
                grossSalary: item.gross_salary,
                deductions: item.deductions,
                deductionNotes: item.deduction_notes,
                netPay: item.net_pay,
                paymentMethod: item.payment_method,
                status: item.status,
                paidAt: item.paid_at ? new Date(item.paid_at).getTime() : undefined,
                updatedAt: Date.now(),
                syncStatus: 'synced'
            };

            // Idempotent upsert by stable identity
            if (record.staffIdCloud) {
                const existing = await eduDb.payrollRecords
                    .where('[schoolId+staffIdCloud+month+year]')
                    .equals([record.schoolId, record.staffIdCloud, record.month, record.year])
                    .first();

                if (existing) {
                    await eduDb.payrollRecords.update(existing.id!, record);
                } else {
                    await eduDb.payrollRecords.add(record);
                }
            } else if (record.staffId) {
                // Compatibility fallback for records without UUIDs
                const existing = await eduDb.payrollRecords
                    .where('[schoolId+staffId+month+year]')
                    .equals([record.schoolId, record.staffId, record.month, record.year])
                    .first();

                if (existing) {
                    await eduDb.payrollRecords.update(existing.id!, record);
                } else {
                    await eduDb.payrollRecords.add(record);
                }
            }
        }
    }
}
