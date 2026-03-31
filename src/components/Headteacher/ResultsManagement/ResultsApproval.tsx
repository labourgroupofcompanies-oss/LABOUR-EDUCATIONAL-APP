
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../../../eduDb';
import type { Result } from '../../../eduDb';

import { useAuth } from '../../../hooks/useAuth';
import { useAcademicSession } from '../../../hooks/useAcademicSession';
import { showToast } from '../../Common/Toast';
import { showConfirm } from '../../Common/ConfirmDialog';
import { resultService } from '../../../services/resultService';

const ResultsApproval: React.FC = () => {
    const { user } = useAuth();
    const { currentTerm, currentYear, isLoaded } = useAcademicSession();
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [loading, setLoading] = useState(false);

    // Default to the active term set by the headteacher
    useEffect(() => {
        if (isLoaded) {
            setSelectedTerm(currentTerm || 'Term 1');
            setSelectedYear(currentYear || new Date().getFullYear());
        }
    }, [isLoaded, currentTerm, currentYear]);

    const classes = useLiveQuery(() =>
        user?.schoolId ? eduDb.classes.where('schoolId').equals(user.schoolId).filter(c => !c.isDeleted).toArray() : []
        , [user?.schoolId]);

    const classSubjects = useLiveQuery(async () => {
        if (!user?.schoolId) return [];

        if (selectedClassId) {
            const numericClassId = parseInt(selectedClassId);
            const assignments = await eduDb.classSubjects.where('classId').equals(numericClassId).toArray();
            const subjectIds = [...new Set(assignments.map(a => a.subjectId))];
            return await eduDb.subjects.where('id').anyOf(subjectIds).filter(s => !s.isDeleted).toArray();
        }

        return await eduDb.subjects.where('schoolId').equals(user.schoolId).filter(s => !s.isDeleted).toArray();
    }, [user?.schoolId, selectedClassId]);

    const results = useLiveQuery(async () => {
        if (!user?.schoolId) return [];

        // 1. Fetch RAW unfiltered results directly from Dexie for this school
        const rawResults = await eduDb.results.where('schoolId').equals(user.schoolId).toArray();

        // 2. Pure JavaScript memory filtering (100% reliable)
        let allResults = rawResults.filter((r: Result) => {
            // Drop deleted records
            if (r.isDeleted) return false;
            
            // Term and Year exact-match logic with coercion
            if (selectedTerm && r.term?.trim() !== selectedTerm.trim()) return false;
            if (selectedYear && Number(r.year) !== selectedYear) return false;
            
            return true;
        });

        // 3. Optional relational filters
        if (selectedClassId) {
            const cId = parseInt(selectedClassId);
            allResults = allResults.filter(r => Number(r.classId) === cId);
        }

        if (selectedSubjectId) {
            const sId = parseInt(selectedSubjectId);
            allResults = allResults.filter(r => Number(r.subjectId) === sId);
        }

        return allResults;
    }, [user?.schoolId, selectedClassId, selectedSubjectId, selectedTerm, selectedYear]);

    const studentsMap = useLiveQuery(async () => {
        if (!user?.schoolId) return {};
        const students = await eduDb.students.where('schoolId').equals(user.schoolId).filter(s => !s.isDeleted).toArray();
        return students.reduce((acc, s) => ({ ...acc, [s.id!]: s }), {} as { [key: number]: any });
    }, [user?.schoolId]);

    const handleBulkAction = async (action: 'approve' | 'lock' | 'unlock') => {
        if (!results || results.length === 0) return;

        const title = action === 'approve' ? 'Approve Results' : action === 'lock' ? 'Lock Results' : 'Unlock Results';
        const message = action === 'approve'
            ? 'This will mark all displayed results as approved. Continue?'
            : action === 'lock'
                ? 'Locking will prevent any further edits by teachers. Continue?'
                : 'Unlocking will allow teachers to edit these results again. Continue?';

        const confirmed = await showConfirm({
            title,
            message,
            confirmText: `${action.charAt(0).toUpperCase() + action.slice(1)} All`,
            cancelText: 'Cancel',
            variant: action === 'lock' ? 'warning' : 'info',
        });

        if (!confirmed) return;
        setLoading(true);
        try {
            const ids = results.map((r: Result) => r.id!);
            if (action === 'approve') {
                await resultService.bulkApproveResults(ids, user?.id || '');
            } else if (action === 'lock') {
                await resultService.bulkLockResults(ids);
            } else {
                await resultService.bulkUnlockResults(ids);
            }
            showToast(`Results ${action === 'approve' ? 'approved' : action === 'lock' ? 'locked' : 'unlocked'} successfully!`, 'success');
        } catch (error) {
            console.error('Error updating results:', error);
            showToast('Failed to update results. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'locked': return 'bg-red-100 text-red-700 border-red-200';
            case 'approved': return 'bg-green-100 text-green-700 border-green-200';
            case 'submitted': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
            case 'draft': return 'bg-gray-100 text-gray-700 border-gray-200';
            default: return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        }
    };

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* ── Page Header ── */}
            <div className="border-b border-gray-100 pb-4">
                <h2 className="text-xl font-bold text-gray-800">Results Oversight</h2>
                <p className="text-gray-400 text-sm mt-0.5">Review, approve, and manage results across the school.</p>
            </div>

            {/* ── Filters ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <select
                    value={selectedClassId}
                    onChange={(e) => { setSelectedClassId(e.target.value); }}
                    className="px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-sm font-medium text-gray-700"
                >
                    <option value="">All Classes</option>
                    {classes?.map(cls => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                </select>

                <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-sm font-medium text-gray-700"
                >
                    <option value="">All Subjects</option>
                    {classSubjects?.map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                </select>

                <select
                    value={selectedTerm}
                    onChange={(e) => setSelectedTerm(e.target.value)}
                    className="px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-sm font-medium text-gray-700"
                >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                </select>

                <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-sm font-medium text-gray-700"
                >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                        <option key={y} value={y}>{y} / {y + 1}</option>
                    ))}
                </select>
            </div>

            {/* ── Results Panel ── */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                {/* Action Bar */}
                <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-3">
                        <span className="font-bold text-gray-600 text-sm">
                            <i className="fas fa-list-ul mr-2 text-primary opacity-50"></i>
                            {results?.length || 0} Records
                        </span>
                        {results && results.some(r => r.status === 'locked') && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                                Contains Locked
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => handleBulkAction('approve')}
                            disabled={loading || !results?.length}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-40"
                        >
                            <i className="fas fa-check-circle"></i>
                            <span>Approve All</span>
                        </button>
                        <button
                            onClick={() => handleBulkAction('lock')}
                            disabled={loading || !results?.length}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-40"
                        >
                            <i className="fas fa-lock"></i>
                            <span>Lock All</span>
                        </button>
                        {results && results.some(r => r.status === 'locked') && (
                            <button
                                onClick={() => handleBulkAction('unlock')}
                                disabled={loading}
                                className="flex-1 sm:flex-none px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-xl font-bold hover:bg-gray-50 transition-all text-sm flex items-center justify-center gap-2 shadow-sm"
                            >
                                <i className="fas fa-lock-open"></i>
                                <span>Unlock</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Desktop Table ── */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50/30 border-b border-gray-100 text-[11px] font-black text-gray-400 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 text-left">Student</th>
                                <th className="px-6 py-4 text-left">Class/Subject</th>
                                <th className="px-6 py-4 text-left">Score</th>
                                <th className="px-6 py-4 text-left">Status</th>
                                <th className="px-6 py-4 text-left">Sync</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {results?.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-gray-400 italic">
                                        No assessment records matching your filters.
                                    </td>
                                </tr>
                            ) : (
                                results?.map(result => (
                                    <tr key={result.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-800 text-sm">
                                                    {studentsMap?.[result.studentId]?.fullName || 'Unknown'}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-mono">
                                                    #{studentsMap?.[result.studentId]?.studentIdString || 'N/A'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-600 text-xs bg-gray-100 px-2 py-0.5 rounded">
                                                    {classes?.find(c => c.id === result.classId)?.name || 'Class'}
                                                </span>
                                                <span className="text-gray-400 text-xs">/</span>
                                                <span className="font-bold text-primary text-xs">
                                                    {classSubjects?.find(s => s.id === result.subjectId)?.name || 'Subject'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <span className="font-black text-gray-900 text-sm">
                                                    {Math.round(result.totalScore)}
                                                </span>
                                                <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                                                    {result.grade || '-'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-widest ${getStatusColor(result.status)}`}>
                                                {result.status || 'draft'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[10px] font-bold ${result.syncStatus === 'synced' ? 'text-green-500' : 'text-orange-400'}`}>
                                                <i className={`fas fa-${result.syncStatus === 'synced' ? 'check-circle' : 'clock'} mr-1`}></i>
                                                {result.syncStatus}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Mobile Card List ── */}
                <div className="sm:hidden divide-y divide-gray-50">
                    {results?.length === 0 ? (
                        <div className="py-16 text-center text-gray-400 italic text-sm">
                            No records found.
                        </div>
                    ) : (
                        results?.map(result => {
                            const student = studentsMap?.[result.studentId];
                            return (
                                <div key={result.id} className="p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-800 text-sm">{student?.fullName || 'Unknown'}</span>
                                            <span className="text-[10px] text-gray-400 font-mono italic">#{student?.studentIdString || 'N/A'}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border uppercase tracking-wider ${getStatusColor(result.status)}`}>
                                            {result.status || 'draft'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] bg-gray-50 p-2 rounded-xl border border-gray-100">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-gray-400 uppercase font-black tracking-tighter">Class/Sub</span>
                                            <span className="font-bold text-gray-700">
                                                {classes?.find(c => c.id === result.classId)?.name} / {classSubjects?.find(s => s.id === result.subjectId)?.name}
                                            </span>
                                        </div>
                                        <div className="text-right flex flex-col gap-0.5">
                                            <span className="text-gray-400 uppercase font-black tracking-tighter">Total Score</span>
                                            <span className="font-black text-primary text-sm">
                                                {Math.round(result.totalScore)} ({result.grade || '-'})
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-end pr-1 transition-opacity opacity-60">
                                        <span className={`text-[9px] font-bold uppercase ${result.syncStatus === 'synced' ? 'text-green-500' : 'text-orange-400'}`}>
                                            <i className={`fas fa-${result.syncStatus === 'synced' ? 'check-circle' : 'clock'} mr-1`}></i>
                                            Synced: {result.syncStatus}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResultsApproval;
