
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb, type Student } from '../../../eduDb';
import { ExcelImportModal } from './ExcelImportModal';
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
    const [selectedLevel, setSelectedLevel] = useState<string>('all');
    const [selectedClass, setSelectedClass] = useState<string>('all');
    const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
    const [financialFilter, setFinancialFilter] = useState<'all' | 'debtors' | 'paid'>('all');
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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
        const studentClass = classes?.find(c => c.id === student.classId);
        
        // Level Filter
        const matchesLevel = selectedLevel === 'all' || studentClass?.level === selectedLevel;
        
        // Class Filter
        let matchesClass = true;
        if (selectedClass === 'all') {
            matchesClass = true;
        } else if (selectedClass === 'unassigned') {
            matchesClass = !student.classId;
        } else {
            matchesClass = student.classId?.toString() === selectedClass;
        }

        const matchesSearch = student.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            student.studentIdString?.toLowerCase().includes(searchQuery.toLowerCase());

        let matchesFinancial = true;
        if (financialFilter === 'debtors') matchesFinancial = (student.balance || 0) > 0;
        if (financialFilter === 'paid') matchesFinancial = (student.balance || 0) <= 0 && student.feeStatus !== 'no-fee';

        return matchesLevel && matchesClass && matchesSearch && matchesFinancial;
    })?.sort((a, b) => a.fullName.localeCompare(b.fullName));

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

    const exportToSpreadsheet = () => {
        if (!filteredStudents || filteredStudents.length === 0) {
            showToast('No students to export.', 'warning');
            return;
        }

        const headers = [
            'Student ID',
            'Full Name',
            'Class',
            'Gender',
            'Date of Birth',
            'Type',
            'Guardian Name',
            'Guardian Contact',
            'Secondary Contact',
            'Outstanding Balance (GHS)',
            'Status'
        ];

        const rows = filteredStudents.map(student => [
            student.studentIdString || '',
            student.fullName || '',
            getClassName(student.classId || 0),
            student.gender || '',
            student.dateOfBirth || '',
            student.isBoarding ? 'Boarding' : 'Day',
            student.guardianName || '',
            student.guardianPrimaryContact || '',
            student.guardianSecondaryContact || '',
            (student.balance ?? 0).toFixed(2),
            student.feeStatus || 'no-fee'
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => 
                row.map(val => {
                    const stringVal = String(val);
                    if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
                        return `"${stringVal.replace(/"/g, '""')}"`;
                    }
                    return stringVal;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `students_directory_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Students list exported successfully.', 'success');
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
                        onClick={exportToSpreadsheet}
                        className="bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 px-6 py-3 rounded-2xl flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                    >
                        <i className="fas fa-file-excel text-emerald-600"></i> Export CSV
                    </button>
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-white hover:bg-slate-50 text-slate-700 font-bold border border-slate-200 px-6 py-3 rounded-2xl flex items-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                    >
                        <i className="fas fa-file-import text-indigo-600"></i> Import Excel
                    </button>
                    <button
                        onClick={onAdd}
                        className="btn-primary px-6 py-3"
                    >
                        <i className="fas fa-plus"></i> Add Student
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1 group">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:text-gray-400 font-medium text-sm"
                        />
                    </div>
                    
                    <div className="flex flex-wrap md:flex-nowrap gap-3">
                        {/* Level Filter */}
                        <div className="relative min-w-[140px]">
                            <select
                                value={selectedLevel}
                                onChange={(e) => {
                                    setSelectedLevel(e.target.value);
                                    setSelectedClass('all'); // Reset class when level changes
                                }}
                                className="w-full pl-10 pr-10 py-3.5 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold text-xs uppercase tracking-widest appearance-none text-gray-600"
                            >
                                <option value="all">All Levels</option>
                                {[...new Set(classes?.map(c => c.level))].sort().map(level => (
                                    <option key={level} value={level}>{level}</option>
                                ))}
                            </select>
                            <i className="fas fa-layer-group absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                        </div>

                        {/* Class Filter */}
                        <div className="relative min-w-[160px]">
                            <select
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                                className="w-full pl-10 pr-10 py-3.5 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold text-xs uppercase tracking-widest appearance-none text-gray-600"
                            >
                                <option value="all">All Classes</option>
                                <option value="unassigned">Unassigned</option>
                                {classes
                                    ?.filter(cls => selectedLevel === 'all' || cls.level === selectedLevel)
                                    .map(cls => {
                                        const count = students?.filter(s => s.classId === cls.id).length || 0;
                                        return (
                                            <option key={cls.id} value={cls.id}>
                                                {cls.name} ({count})
                                            </option>
                                        );
                                    })}
                            </select>
                            <i className="fas fa-chalkboard absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                        </div>

                        {/* Financial Filter */}
                        <div className="relative min-w-[160px]">
                            <select
                                value={financialFilter}
                                onChange={(e) => setFinancialFilter(e.target.value as any)}
                                className="w-full pl-10 pr-10 py-3.5 rounded-2xl bg-gray-50 border-none focus:ring-2 focus:ring-blue-100 outline-none transition-all font-bold text-xs uppercase tracking-widest appearance-none text-gray-600"
                            >
                                <option value="all">Financial Status</option>
                                <option value="debtors">Debtors Only</option>
                                <option value="paid">Fully Paid Only</option>
                            </select>
                            <i className="fas fa-hand-holding-dollar absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                            <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                        </div>
                    </div>
                </div>

                {/* Active Filter Badges */}
                {(selectedLevel !== 'all' || selectedClass !== 'all' || financialFilter !== 'all' || searchQuery) && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-50">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Active Filters:</span>
                        {selectedLevel !== 'all' && (
                            <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                {selectedLevel}
                                <button onClick={() => setSelectedLevel('all')}><i className="fas fa-times"></i></button>
                            </span>
                        )}
                        {selectedClass !== 'all' && (
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                {selectedClass === 'unassigned' ? 'Unassigned' : getClassName(parseInt(selectedClass))}
                                <button onClick={() => setSelectedClass('all')}><i className="fas fa-times"></i></button>
                            </span>
                        )}
                        {financialFilter !== 'all' && (
                            <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                {financialFilter === 'debtors' ? 'Debtors' : 'Paid'}
                                <button onClick={() => setFinancialFilter('all')}><i className="fas fa-times"></i></button>
                            </span>
                        )}
                        {searchQuery && (
                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                "{searchQuery}"
                                <button onClick={() => setSearchQuery('')}><i className="fas fa-times"></i></button>
                            </span>
                        )}
                        <button 
                            onClick={() => {
                                setSelectedLevel('all');
                                setSelectedClass('all');
                                setFinancialFilter('all');
                                setSearchQuery('');
                            }}
                            className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline ml-auto"
                        >
                            Clear All
                        </button>
                    </div>
                )}
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

            {isImportModalOpen && (
                <ExcelImportModal
                    isOpen={isImportModalOpen}
                    onClose={() => setIsImportModalOpen(false)}
                    onImportSuccess={() => {
                        // Live query updates directory list automatically
                    }}
                />
            )}
        </div>
    );
};

export default StudentList;
