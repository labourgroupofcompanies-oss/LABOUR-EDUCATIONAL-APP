import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbService } from '../../services/dbService';
import { useAuth } from '../../hooks/useAuth';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { eduDb } from '../../eduDb';
import ResultsEntry from './ResultsEntry';

interface SubjectAssignment {
    classId: number;
    className: string;
    subjectId: number;
    subjectName: string;
    classSubjectId: number;
}

const TeacherSubjectList: React.FC = () => {
    const { user } = useAuth();
    const [selectedAssignment, setSelectedAssignment] = useState<SubjectAssignment | null>(null);

    // Fetch Assigned Subjects
    const assignments = useLiveQuery(async () => {
        if (!user?.schoolId || !user?.id) return [];
        return await dbService.staff.getSubjectAssignments(user.schoolId, user.id.toString()) as SubjectAssignment[];
    }, [user?.schoolId, user?.id]);

    const classTeacherIds = useLiveQuery(async () => {
        if (user?.schoolId && user?.id) {
            const ctClasses = await dbService.classes.getAsClassTeacher(user.schoolId, user.id.toString());
            return new Set(ctClasses.map(c => c.id!));
        }
        return new Set<number>();
    }, [user?.schoolId, user?.id]);

    const { currentTerm, currentYear } = useAcademicSession();

    const submissionStatus = useLiveQuery(async () => {
        if (!assignments || assignments.length === 0) return {};
        const statusMap: Record<number, 'submitted' | 'draft' | 'none'> = {};
        for (const assign of assignments) {
            const results = await eduDb.results
                .where('classSubjectId').equals(assign.classSubjectId)
                .filter(r => r.term === currentTerm && r.year === currentYear)
                .toArray();
            
            const isSubmitted = results.some(r => r.status === 'submitted' || r.status === 'locked');
            const isDraft = results.some(r => r.status === 'draft' || (r.caTotal > 0 || r.examScore > 0));
            
            if (isSubmitted) {
                statusMap[assign.classSubjectId] = 'submitted';
            } else if (isDraft) {
                statusMap[assign.classSubjectId] = 'draft';
            } else {
                statusMap[assign.classSubjectId] = 'none';
            }
        }
        return statusMap;
    }, [assignments, currentTerm, currentYear]);

    if (selectedAssignment) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => setSelectedAssignment(null)}
                    className="flex items-center text-gray-500 hover:text-indigo-600 font-black text-[9px] md:text-[10px] uppercase tracking-[0.2em] transition-all"
                >
                    <i className="fas fa-arrow-left mr-2"></i> Back to Subjects
                </button>

                <ResultsEntry
                    classId={selectedAssignment.classId}
                    className={selectedAssignment.className}
                    subjectId={selectedAssignment.subjectId}
                    subjectName={selectedAssignment.subjectName}
                    classSubjectId={selectedAssignment.classSubjectId}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4 md:space-y-6 animate-fadeIn">
            <div>
                <h2 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">My Assigned Subjects</h2>
                <p className="text-xs md:text-sm text-gray-400 font-medium mt-1">Subjects you are assigned to teach and grade.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {assignments?.map((assign: SubjectAssignment, idx: number) => {
                    const reqStatus = submissionStatus?.[assign.classSubjectId] || 'none';
                    const isSubmitted = reqStatus === 'submitted';
                    const isDraft = reqStatus === 'draft';
                    
                    return (
                    <div key={idx} className={`p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border shadow-sm hover:shadow-xl transition-all group cursor-pointer ${isSubmitted ? 'bg-emerald-50/50 border-emerald-100' : isDraft ? 'bg-amber-50/50 border-amber-100' : 'bg-white border-gray-100'}`} onClick={() => setSelectedAssignment(assign)}>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${isSubmitted ? 'bg-emerald-50 text-emerald-600' : isDraft ? 'bg-amber-50 text-amber-600' : 'bg-purple-50 text-purple-600'}`}>
                                <i className={`fas ${isSubmitted ? 'fa-check-double' : isDraft ? 'fa-pencil-alt' : 'fa-book-open'}`}></i>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                                <span className={`${isDraft ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'} px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider`}>
                                    {classTeacherIds?.has(assign.classId) ? 'Class Teacher' : 'Subject Teacher'}
                                </span>
                                {isSubmitted && (
                                    <span className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">
                                        <i className="fas fa-check-circle mr-1"></i> Completed
                                    </span>
                                )}
                                {isDraft && (
                                    <span className="bg-amber-500 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">
                                        <i className="fas fa-save mr-1"></i> Draft Saved
                                    </span>
                                )}
                            </div>
                        </div>
                        <h3 className="text-lg md:text-xl font-bold text-gray-800 mb-1">{assign.subjectName}</h3>
                        <p className="text-gray-400 font-bold text-xs md:text-sm mb-4">Class: <span className="text-gray-600">{assign.className}</span></p>

                        <div className="flex items-center text-gray-400 text-sm font-bold gap-4">
                            <span className={`${isSubmitted ? 'text-emerald-600' : isDraft ? 'text-amber-600' : 'text-purple-500'} group-hover:underline`}>
                                {isSubmitted ? 'View Results' : isDraft ? 'Continue Grading' : 'Enter Results'} <i className="fas fa-arrow-right ml-1"></i>
                            </span>
                        </div>
                    </div>
                );
                })}
                {assignments?.length === 0 && (
                    <div className="col-span-full py-16 text-center">
                        <div className="w-20 h-20 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fas fa-book text-3xl"></i>
                        </div>
                        <h3 className="text-xl font-bold text-gray-400">No Assigned Subjects</h3>
                        <p className="text-gray-400 mt-2">You haven't been assigned to teach any subjects yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeacherSubjectList;
