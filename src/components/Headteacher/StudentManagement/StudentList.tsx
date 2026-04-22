
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb, type Student } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import { useAcademicSession } from '../../../hooks/useAcademicSession';
import { dbService } from '../../../services/dbService';
import { showToast } from '../../Common/Toast';
import { supabase } from '../../../supabaseClient';

interface StudentListProps {
    onAdd: () => void;
    onView: (id: number) => void;
}

interface StudentWithBalance extends Student {
    feeStatus?: 'paid' | 'partial' | 'unpaid' | 'overpaid' | 'no-fee';
    balance?: number;
}

const StudentList: React.FC<StudentListProps> = ({ onAdd, onView }) => {
    const { user } = useAuth();
    const { currentTerm: term, currentYear: year } = useAcademicSession();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClass, setSelectedClass] = useState<string>('all');
    const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
    const [financialFilter, setFinancialFilter] = useState<'all' | 'debtors' | 'paid'>('all');
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [targetClassId, setTargetClassId] = useState<number | null>(null);
    const [isMoving, setIsMoving] = useState(false);

    const students = useLiveQuery(async (): Promise<StudentWithBalance[]> => {
        if (!user?.schoolId) return [];

        const [allStudents, structures, allPayments] = await Promise.all([
            eduDb.students.where('schoolId').equals(user.schoolId).filter(s => !s.isDeleted).toArray(),
            dbService.fees.getAllStructures(user.schoolId, term, year),
            dbService.fees.getPaymentsByTerm(user.schoolId, term, year),
        ]);

        const result: StudentWithBalance[] = [];
        for (const student of allStudents) {
            const structure = structures.find(s => s.classId === student.classId);
            const payments = allPayments.filter(p => p.studentId === student.id);
            const amountPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
            const termFeeAmount = structure?.termFeeAmount ?? 0;

            // Compute residual arrears: subtract payments from PREVIOUS terms so the
            // new-term balance correctly reflects what was actually left unpaid.
            const rawArrears = student.arrears || 0;
            const residualArrears = student.id
                ? await dbService.fees.getArrearsBalance(user.schoolId, student.id, term, year, rawArrears)
                : rawArrears;

            const feeAmount = termFeeAmount + residualArrears;
            const balance = feeAmount - amountPaid;

            let feeStatus: StudentWithBalance['feeStatus'] = 'no-fee';
            if (termFeeAmount > 0 || (residualArrears !== 0)) {
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

            result.push({ ...student, feeStatus, balance });
        }
        return result;
    }, [user?.schoolId, term, year]);

    const classes = useLiveQuery(() =>
        user?.schoolId ? eduDb.classes.where('schoolId').equals(user.schoolId).filter(c => !c.isDeleted).toArray() : []
        , [user?.schoolId]);

    // Filter Students
    const filteredStudents = students?.filter(student => {
        const matchesClass = selectedClass === 'all' || student.classId?.toString() === selectedClass;
        const matchesSearch = student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            student.studentIdString?.toLowerCase().includes(searchQuery.toLowerCase());

        let matchesFinancial = true;
        if (financialFilter === 'debtors') matchesFinancial = (student.balance || 0) > 0;
        if (financialFilter === 'paid') matchesFinancial = (student.balance || 0) <= 0 && student.feeStatus !== 'no-fee';

        return matchesClass && matchesSearch && matchesFinancial;
    });

    const totalDebt = filteredStudents?.reduce((sum, s) => sum + Math.max(0, s.balance || 0), 0) || 0;
    const paidCount = filteredStudents?.filter(s => s.feeStatus === 'paid' || s.feeStatus === 'overpaid').length || 0;

    const getClassName = (classId: number) => {
        return classes?.find(c => c.id === classId)?.name || 'Unknown Class';
    };

    const handleSelectStudent = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setSelectedStudentIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const handleMoveStudents = async () => {
        if (!targetClassId || selectedStudentIds.length === 0) return;
        setIsMoving(true);
        try {
            // Online-first: Update in Supabase first to guarantee it sticks
            const targetClass = await eduDb.classes.get(targetClassId);
            const classCloudId = targetClass?.idCloud;

            const selectedStudents = await eduDb.students.where('id').anyOf(selectedStudentIds).toArray();
            const cloudIdsToUpdate = selectedStudents.map(s => s.idCloud).filter(Boolean);

            if (classCloudId && cloudIdsToUpdate.length > 0) {
                const { error } = await supabase
                    .from('students')
                    .update({ class_id: classCloudId, updated_at: new Date().toISOString() })
                    .in('id', cloudIdsToUpdate as string[]);

                if (error) {
                    throw new Error(`Cloud Update Error: ${error.message}`);
                }
            }

            // Sync successfully online, or mark pending if they exist only offline
            await eduDb.students.bulkUpdate(
                selectedStudents.map(student => ({
                    key: student.id!,
                    changes: { 
                        classId: targetClassId, 
                        updatedAt: Date.now(), 
                        syncStatus: (classCloudId && student.idCloud) ? 'synced' : 'pending' 
                    }
                }))
            );

            showToast(`Successfully moved ${selectedStudentIds.length} student${selectedStudentIds.length > 1 ? 's' : ''} to new class.`, 'success');
            setSelectedStudentIds([]);
            setIsMoveModalOpen(false);
        } catch (error) {
            console.error('Error moving students:', error);
            showToast('Failed to move students. Please try again.', 'error');
        } finally {
            setIsMoving(false);
        }
    };

    const statusBadge = (status?: StudentWithBalance['feeStatus']) => {
        if (!status || status === 'no-fee') return null;

        const config = {
            paid: { label: 'Fully Paid', class: 'bg-green-50 text-green-600 border-green-100' },
            overpaid: { label: 'Overpaid', class: 'bg-cyan-50 text-cyan-600 border-cyan-100' },
            partial: { label: 'Partial Payment', class: 'bg-amber-50 text-amber-600 border-amber-100' },
            unpaid: { label: 'Unpaid', class: 'bg-red-50 text-red-600 border-red-100' },
        };

        const item = config[status as keyof typeof config];
        return (
            <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter border ${item.class}`}>
                {item.label}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Students Directory</h2>
                    <p className="text-gray-400 text-sm">Manage {students?.length || 0} students and their financial status</p>
                </div>
                <div className="flex gap-3">
                    {selectedStudentIds.length > 0 && (
                        <button
                            onClick={() => setIsMoveModalOpen(true)}
                            className="btn-primary !from-indigo-600 !to-indigo-700 px-6 py-3"
                        >
                            <i className="fas fa-exchange-alt"></i> Move ({selectedStudentIds.length})
                        </button>
                    )}
                    <button
                        onClick={onAdd}
                        className="btn-primary px-6 py-3"
                    >
                        <i className="fas fa-plus"></i> Add Student
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="relative flex-1">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                    <input
                        type="text"
                        placeholder="Search by name or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all placeholder:text-gray-400"
                    />
                </div>
                <select
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white min-w-[150px] font-bold text-sm"
                >
                    <option value="all">All Classes</option>
                    {classes?.map(cls => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                </select>
                <select
                    value={financialFilter}
                    onChange={(e) => setFinancialFilter(e.target.value as any)}
                    className="px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white min-w-[150px] font-bold text-sm"
                >
                    <option value="all">All Statuses</option>
                    <option value="debtors">Debtors Only</option>
                    <option value="paid">Fully Paid Only</option>
                </select>
            </div>

            {/* Financial Summary Banner */}
            {filteredStudents && filteredStudents.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                            <i className="fas fa-users text-sm"></i>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Students</p>
                            <p className="text-sm font-black text-indigo-900">{filteredStudents.length} {financialFilter !== 'all' ? financialFilter : 'Total'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                            <i className="fas fa-check-circle text-sm"></i>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-green-400 uppercase tracking-widest">Fully Paid</p>
                            <p className="text-sm font-black text-green-900">{paidCount} Students</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                            <i className="fas fa-hand-holding-dollar text-sm"></i>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Remaining Debt</p>
                            <p className="text-sm font-black text-red-900">GHS {totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Student List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredStudents?.map(student => (
                    <div
                        key={student.id}
                        onClick={() => student.id && onView(student.id)}
                        className={`group bg-white p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 relative overflow-hidden ${selectedStudentIds.includes(student.id!) ? 'border-indigo-500 ring-2 ring-indigo-50 shadow-md' : 'border-gray-100 hover:border-blue-200 hover:shadow-lg'}`}
                    >
                        {/* Checkbox Overlay */}
                        <div
                            onClick={(e) => student.id && handleSelectStudent(e, student.id)}
                            className="absolute top-2 left-2 z-10 w-6 h-6 rounded-lg bg-white/80 border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <input
                                type="checkbox"
                                checked={selectedStudentIds.includes(student.id!)}
                                readOnly
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 pointer-events-none"
                            />
                        </div>

                        {/* Avatar */}
                        <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 shadow-sm flex-shrink-0 overflow-hidden relative group-hover:shadow-md transition-shadow">
                            {student.photo ? (
                                <img src={URL.createObjectURL(student.photo)} alt={student.fullName} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                    <i className="fas fa-user text-2xl"></i>
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-gray-800 truncate group-hover:text-blue-600 transition-colors uppercase">{student.fullName}</h3>
                            <p className="text-[10px] text-gray-400 font-black mb-1 tracking-widest">{student.studentIdString || 'NO ID'}</p>

                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="inline-block px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[9px] font-black rounded border border-gray-100 uppercase tracking-tighter">
                                    {student.classId ? getClassName(student.classId) : 'No Class'}
                                </span>
                                {statusBadge(student.feeStatus)}
                            </div>

                            {typeof student.balance === 'number' && (
                                <p className={`text-[10px] font-black mt-2 ${student.balance > 0 ? 'text-red-500' : student.balance < 0 ? 'text-cyan-600' : 'text-green-600'}`}>
                                    {student.balance > 0 
                                        ? `DEBT: GHS ${student.balance.toFixed(2)}` 
                                        : student.balance < 0 
                                            ? `CREDIT: GHS ${Math.abs(student.balance).toFixed(2)}` 
                                            : `CLEARED: GHS 0.00`}
                                </p>
                            )}
                        </div>

                        {/* Arrow Icon */}
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                            <i className="fas fa-chevron-right"></i>
                        </div>
                    </div>
                ))}

                {filteredStudents?.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-400">
                        <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-100">
                            <i className="fas fa-user-slash text-3xl opacity-50"></i>
                        </div>
                        <p className="font-bold">No students found.</p>
                        <p className="text-sm">Try adjusting your filters or add a new student.</p>
                    </div>
                )}
            </div>

            {/* Move Students Modal */}
            {isMoveModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="text-xl font-bold text-gray-800">Move Students</h3>
                            <p className="text-sm text-gray-500 mt-1">Reassign {selectedStudentIds.length} students to a new class.</p>
                        </div>
                        <div className="p-6">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Target Class</label>
                            <select
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                onChange={(e) => setTargetClassId(Number(e.target.value))}
                                value={targetClassId || ''}
                            >
                                <option value="">Select Class...</option>
                                {classes?.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                onClick={() => setIsMoveModalOpen(false)}
                                className="btn-secondary px-4 py-2"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMoveStudents}
                                disabled={!targetClassId || isMoving}
                                className="btn-primary !from-indigo-600 !to-indigo-700 px-6 py-2"
                            >
                                {isMoving ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-exchange-alt mr-2"></i>}
                                Confirm Move
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentList;
