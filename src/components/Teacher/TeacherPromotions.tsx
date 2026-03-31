import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../../eduDb';
import { dbService } from '../../services/dbService';
import { useAuth } from '../../hooks/useAuth';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { showPromotionDialog } from '../Common/PromotionDialogs';
import { showToast } from '../Common/Toast';

export default function TeacherPromotions() {
    const { user } = useAuth();
    const { currentTerm } = useAcademicSession();

    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
    const [targetClassId, setTargetClassId] = useState<number | null>(null);
    const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Is it Term 3?
    const isTerm3 = currentTerm?.toLowerCase().includes('term 3');

    // Fetch teacher's classes
    const myClasses = useLiveQuery(async () => {
        if (!user?.schoolId || !user.id) return [];
        return await dbService.classes.getAsClassTeacher(user.schoolId, user.id);
    }, [user?.schoolId, user?.id]);

    // Auto-select first class
    React.useEffect(() => {
        if (myClasses && myClasses.length > 0 && !selectedClassId) {
            setSelectedClassId(myClasses[0].id!);
        }
    }, [myClasses, selectedClassId]);

    // Fetch students in selected class
    const students = useLiveQuery(async () => {
        if (!selectedClassId || !user?.schoolId) return [];
        return (await dbService.students.getByClass(user.schoolId, selectedClassId))
            .filter((s: any) => !s.isDeleted)
            .sort((a: any, b: any) => (a.fullName || '').localeCompare(b.fullName || ''));
    }, [selectedClassId, user?.schoolId]);

    // Fetch all school classes for target dropdown
    const allClasses = useLiveQuery(async () => {
        if (!user?.schoolId) return [];
        return await eduDb.classes
            .where('schoolId').equals(user.schoolId)
            .filter((c: any) => !c.isDeleted)
            .toArray();
    }, [user?.schoolId]);

    // Fetch my existing promotion requests
    const myRequests = useLiveQuery(async () => {
        if (!user?.schoolId || !user?.id) return [];
        const reqs = await eduDb.promotionRequests
            .where('schoolId').equals(user.schoolId)
            .filter((r: any) => r.requestedBy === user.id && !r.isDeleted)
            .toArray();

        // Enhance with names
        return Promise.all(reqs.map(async (r: any) => {
            const student = await eduDb.students.get(r.studentId);
            const fromClass = await eduDb.classes.get(r.fromClassId);
            const toClass = await eduDb.classes.get(r.toClassId);
            return {
                ...r,
                studentName: student?.fullName || 'Unknown Student',
                fromClassName: fromClass?.name || 'Unknown',
                toClassName: toClass?.name || 'Unknown'
            };
        }));
    }, [user?.schoolId, user?.id]);

    const toggleStudent = (id: number) => {
        setSelectedStudents(prev => 
            prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (!students) return;
        if (selectedStudents.length === students.length) {
            setSelectedStudents([]);
        } else {
            setSelectedStudents(students.map((s: any) => s.id!));
        }
    };

    const handleSubmit = async (mode: 'promote' | 'repeat' = 'promote') => {
        if (!isTerm3) {
            await showPromotionDialog({
                title: "Promotion Locked",
                message: "Promotions and repetitions can only be requested during Term 3 (Promotion Season).",
                variant: 'warning',
                confirmText: "Understood"
            });
            return;
        }

        const effectiveTargetId = mode === 'repeat' ? selectedClassId : targetClassId;

        if (!selectedClassId || !effectiveTargetId) {
            await showPromotionDialog({
                title: "Selection Required",
                message: mode === 'repeat' ? "Please select your current class." : "Please select both current and target classes.",
                variant: 'warning',
                confirmText: "Okay"
            });
            return;
        }

        if (mode === 'promote' && selectedClassId === effectiveTargetId) {
            await showPromotionDialog({
                title: "Invalid Target",
                message: "For promotions, the target class must be different from the current class. If you want them to stay in this class, use the 'Propose Repeat' button instead.",
                variant: 'warning',
                confirmText: "I'll fix it"
            });
            return;
        }

        if (selectedStudents.length === 0) {
            await showPromotionDialog({
                title: "No Students Selected",
                message: "Please select at least one student from the list to proceed.",
                variant: 'warning',
                confirmText: "Oops, sorry"
            });
            return;
        }

        if (!user?.schoolId || !user?.id) return;

        const confirm = await showPromotionDialog({
            title: mode === 'promote' ? "Confirm Promotion Request" : "Confirm Repeat Request",
            message: mode === 'promote' 
                ? `You are proposing to promote ${selectedStudents.length} students to the next class. Are you sure?`
                : `You are proposing that ${selectedStudents.length} students stay in their current class for another year. Are you sure?`,
            variant: mode === 'promote' ? 'promote' : 'repeat',
            confirmText: "Yes, Propose",
            cancelText: "Cancel"
        });

        if (!confirm.confirmed) return;

        setIsSubmitting(true);
        try {
            const now = Date.now();
            const requestsPattern: any[] = [];
            
            const existingPending = await eduDb.promotionRequests
                .where('schoolId').equals(user.schoolId)
                .filter((r: any) => r.status === 'pending')
                .toArray();

            for (const studentId of selectedStudents) {
                if (existingPending.some((r: any) => r.studentId === studentId)) continue;
                
                requestsPattern.push({
                    schoolId: user.schoolId,
                    studentId,
                    fromClassId: selectedClassId,
                    toClassId: effectiveTargetId,
                    requestedBy: user.id,
                    status: 'pending',
                    reason: (reason.trim() || (mode === 'repeat' ? 'Repeating current level' : 'Promotion candidates')).trim(),
                    syncStatus: 'pending',
                    createdAt: now,
                    updatedAt: now,
                    isDeleted: false
                });
            }

            if (requestsPattern.length > 0) {
                await eduDb.promotionRequests.bulkAdd(requestsPattern);
                showToast(`Successfully submitted ${requestsPattern.length} requests.`, 'success');
            } else {
                showToast("All selected students already have pending requests.", "info");
            }
            
            setSelectedStudents([]);
            setReason('');
        } catch (error) {
            console.error("Submission failed:", error);
            showToast("An error occurred while submitting the requests.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!myClasses || myClasses.length === 0) {
        return (
            <div className="bg-white rounded-[2rem] p-12 text-center border border-gray-100 shadow-sm animate-fadeIn">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i className="fas fa-exclamation-triangle text-3xl text-gray-400"></i>
                </div>
                <h3 className="text-xl font-black text-gray-800 tracking-tight">No Classes Assigned</h3>
                <p className="text-gray-500 mt-2 text-sm font-medium">You must be assigned as a form master to a class to request promotions.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* ── Status Banner ── */}
            <div className={`p-6 rounded-[2rem] border shadow-sm ${isTerm3 ? 'bg-indigo-50 border-indigo-100' : 'bg-orange-50 border-orange-100'}`}>
                <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isTerm3 ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-100 text-orange-600'}`}>
                        <i className={`fas ${isTerm3 ? 'fa-level-up-alt' : 'fa-lock'} text-xl`}></i>
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-gray-800 tracking-tight">Student Promotions</h2>
                        <p className={`text-sm font-medium mt-1 ${isTerm3 ? 'text-indigo-600/80' : 'text-orange-600/80'}`}>
                            {isTerm3 
                                ? "Term 3 Configuration Active. You may select students below and propose them for promotion. The Headteacher will review and approve these requests."
                                : "Promotion requests are restricted. You can only submit promotion proposals during the Third Term. To prepare for the next academic year, please wait until Term 3 begins."
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Submission Form ── */}
            {isTerm3 && (
                <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl shadow-slate-200/40 p-6 md:p-8">
                    <h3 className="text-xl font-black text-gray-800 tracking-tight mb-6">Propose Promotions</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">My Class</label>
                            <select 
                                value={selectedClassId || ''}
                                onChange={e => setSelectedClassId(Number(e.target.value))}
                                className="w-full bg-gray-50 border-0 text-gray-800 text-sm font-bold rounded-2xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"
                            >
                                {myClasses.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Target Class</label>
                            <select 
                                value={targetClassId || ''}
                                onChange={e => setTargetClassId(Number(e.target.value))}
                                className="w-full bg-indigo-50 border-0 text-indigo-900 text-sm font-bold rounded-2xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">-- Select Target Class --</option>
                                {allClasses?.filter((c: any) => c.id !== selectedClassId).map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Students</label>
                            <button 
                                onClick={toggleAll}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                            >
                                {students?.length === selectedStudents.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>
                        
                        <div className="bg-gray-50 rounded-[1.5rem] border border-gray-100 max-h-64 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-200">
                            {students?.length === 0 ? (
                                <p className="text-center text-sm font-medium text-gray-400 py-8">No active students found in this class.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {students?.map((s: any) => {
                                        // Check if they already have a pending request
                                        const hasPending = myRequests?.some((r: any) => r.studentId === s.id && r.status === 'pending');
                                        
                                        return (
                                            <label 
                                                key={s.id} 
                                                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${hasPending ? 'opacity-50 cursor-not-allowed bg-gray-100' : selectedStudents.includes(s.id!) ? 'bg-indigo-100/50' : 'hover:bg-white'}`}
                                            >
                                                <div className="relative flex items-center justify-center">
                                                    <input 
                                                        type="checkbox" 
                                                        disabled={hasPending}
                                                        checked={selectedStudents.includes(s.id!)}
                                                        onChange={() => toggleStudent(s.id!)}
                                                        className="w-5 h-5 rounded-md border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-800 truncate">{s.fullName}</p>
                                                    {hasPending && <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mt-0.5">Pending Request</p>}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mb-8">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Optional Note / Reason</label>
                        <input 
                            type="text"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="e.g. Passed all core subjects with distinction"
                            className="w-full bg-gray-50 border-0 text-gray-800 text-sm font-medium rounded-2xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-end gap-3">
                        <button
                            onClick={() => handleSubmit('repeat')}
                            disabled={isSubmitting || selectedStudents.length === 0}
                            className="bg-slate-800 hover:bg-slate-900 disabled:bg-gray-200 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-redo-alt"></i>}
                            Propose Repeat
                        </button>
                        <button
                            onClick={() => handleSubmit('promote')}
                            disabled={isSubmitting || selectedStudents.length === 0 || !targetClassId}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-indigo-200/50 active:scale-95 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
                            Propose Promotion
                        </button>
                    </div>
                </div>
            )}

            {/* ── My Requests History ── */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 md:p-8">
                <h3 className="text-xl font-black text-gray-800 tracking-tight mb-6 flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-50 text-gray-400 rounded-lg flex items-center justify-center text-sm">
                        <i className="fas fa-history"></i>
                    </div>
                    Request History
                </h3>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b-2 border-slate-100">
                                <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Student</th>
                                <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Movement</th>
                                <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {myRequests?.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-slate-400 font-medium text-sm">No promotion requests found.</td>
                                </tr>
                            ) : (
                                myRequests?.sort((a: any, b: any) => b.createdAt - a.createdAt).map((req: any) => (
                                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="py-4 px-2">
                                            <p className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors">{req.studentName}</p>
                                        </td>
                                        <td className="py-4 px-2">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                                <span>{req.fromClassName}</span>
                                                <i className="fas fa-arrow-right text-slate-300"></i>
                                                <span className="text-indigo-600">{req.toClassName}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-2">
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                req.status === 'pending' ? 'bg-orange-100 text-orange-600' :
                                                req.status === 'approved' ? 'bg-green-100 text-green-600' :
                                                'bg-red-100 text-red-600'
                                            }`}>
                                                <i className={`fas ${
                                                    req.status === 'pending' ? 'fa-clock' :
                                                    req.status === 'approved' ? 'fa-check' :
                                                    'fa-times'
                                                }`}></i>
                                                {req.status}
                                            </div>
                                        </td>
                                        <td className="py-4 px-2">
                                            <p className="text-xs font-bold text-slate-500">
                                                {new Date(req.createdAt).toLocaleDateString()}
                                            </p>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
