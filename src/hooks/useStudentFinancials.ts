import { useLiveQuery } from 'dexie-react-hooks';
import { dbService } from '../services/dbService';
import { type Student } from '../eduDb';

export interface StudentFinancials {
    feeStatus: 'paid' | 'overpaid' | 'partial' | 'unpaid' | 'no-fee';
    balance: number;
    amountPaid: number;
    feeAmount: number;
}

export const useStudentFinancials = (
    students: Student[] | undefined,
    schoolId: string | undefined,
    term: string,
    year: number
): Record<number, StudentFinancials> => {
    return useLiveQuery(async () => {
        const result: Record<number, StudentFinancials> = {};
        if (!students || students.length === 0 || !schoolId) return result;

        const structures = await dbService.fees.getAllStructures(schoolId, term, year);
        const allPayments = await dbService.fees.getPaymentsByTerm(schoolId, term, year);

        for (const student of students) {
            if (!student.id) continue;
            
            const structure = structures.find(s => s.classId === student.classId);
            const payments = allPayments.filter(p => p.studentId === student.id);
            
            const amountPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
            const termFeeAmount = structure?.termFeeAmount ?? 0;

            // Compute residual arrears: subtract payments from PREVIOUS terms so the
            // new-term balance correctly reflects what was actually left unpaid.
            const rawArrears = student.arrears || 0;
            const residualArrears = await dbService.fees.getArrearsBalance(
                schoolId, student.id, term, year, rawArrears
            );

            const feeAmount = termFeeAmount + residualArrears;
            const balance = feeAmount - amountPaid;

            let feeStatus: StudentFinancials['feeStatus'] = 'no-fee';
            if (termFeeAmount > 0 || residualArrears !== 0) {
                if (amountPaid > feeAmount) {
                    feeStatus = 'overpaid';
                } else if (amountPaid >= feeAmount || feeAmount <= 0) {
                    feeStatus = 'paid';
                } else if (amountPaid > 0) {
                    feeStatus = 'partial';
                } else {
                    feeStatus = 'unpaid';
                }
            }

            result[student.id] = {
                feeStatus,
                balance,
                amountPaid,
                feeAmount
            };
        }

        return result;
    }, [students, schoolId, term, year]) || {};
};
