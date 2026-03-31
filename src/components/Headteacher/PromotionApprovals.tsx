import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../../eduDb';
import { useAuth } from '../../hooks/useAuth';
import { showToast } from '../Common/Toast';
import { showPromotionDialog } from '../Common/PromotionDialogs';

export default function PromotionApprovals() {
    const { user } = useAuth();
    const [isProcessing, setIsProcessing] = useState<number | null>(null);

    // Fetch pending requests with joined data
    const pendingRequests = useLiveQuery(async () => {
        if (!user?.schoolId) return [];
        const reqs = await eduDb.promotionRequests
            .where('schoolId').equals(user.schoolId)
            .filter((r: any) => r.status === 'pending' && !r.isDeleted)
            .toArray();

        return Promise.all(reqs.map(async (r: any) => {
            const student = await eduDb.students.get(r.studentId);
            const fromClass = await eduDb.classes.get(r.fromClassId);
            const toClass = await eduDb.classes.get(r.toClassId);
            const requestedByStaff = await (await import('../../db')).db.users.get(r.requestedBy); // from users table

            return {
                ...r,
                studentName: student?.fullName || 'Unknown Student',
                fromClassName: fromClass?.name || 'Unknown',
                toClassName: toClass?.name || 'Unknown',
                requestedByName: requestedByStaff?.fullName || 'Teacher',
                currentStudentClassId: student?.classId
            };
        }));
    }, [user?.schoolId]);

    const handleApprove = async (req: any) => {
        if (!user?.schoolId || !user?.id) return;
        
        // Anti-conflict check
        if (req.currentStudentClassId !== req.fromClassId) {
            showToast("Conflict: Student has already been moved to a different class.", "error");
            return;
        }

        const confirm = await showPromotionDialog({
            title: req.fromClassId === req.toClassId ? "Approve Repetition" : "Approve Promotion",
            message: `Are you sure you want to approve this request?`,
            studentName: req.studentName,
            variant: req.fromClassId === req.toClassId ? 'repeat' : 'promote',
            confirmText: "Approve Now",
            cancelText: "Cancel"
        });
        if (!confirm.confirmed) return;

        setIsProcessing(req.id!);
        try {
            await eduDb.transaction('rw', [eduDb.students, eduDb.promotionRequests], async () => {
                const now = Date.now();
                // 1. Move student
                await eduDb.students.update(req.studentId, {
                    classId: req.toClassId,
                    syncStatus: 'pending',
                    updatedAt: now
                });

                // 2. Mark request as approved
                await eduDb.promotionRequests.update(req.id, {
                    status: 'approved',
                    reviewedBy: user.id,
                    reviewedAt: now,
                    syncStatus: 'pending',
                    updatedAt: now
                });
            });
            showToast('Promotion approved successfully.', 'success');
        } catch (error) {
            console.error(error);
            showToast('Failed to approve promotion.', 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    const handleReject = async (req: any) => {
        if (!user?.schoolId || !user?.id) return;

        const result = await showPromotionDialog({
            title: "Reject Promotion Request",
            message: `Please provide a reason for rejecting this request for ${req.studentName}.`,
            variant: 'reject',
            showInput: true,
            inputPlaceholder: "Rejection Reason",
            confirmText: "Reject Request",
            cancelText: "Go Back"
        });
        
        if (!result.confirmed) return;
        const reason = result.reason;

        setIsProcessing(req.id!);
        try {
            const now = Date.now();
            await eduDb.promotionRequests.update(req.id, {
                status: 'rejected',
                reviewedBy: user.id,
                reviewedAt: now,
                reviewNote: reason.trim() || undefined,
                syncStatus: 'pending',
                updatedAt: now
            });
            showToast('Promotion request rejected.', 'success');
        } catch (error) {
            console.error(error);
            showToast('Failed to reject promotion.', 'error');
        } finally {
            setIsProcessing(null);
        }
    };

    return (
        <div className="mt-4 sm:mt-8 space-y-6 sm:space-y-8 animate-fadeIn">
            <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <i className="fas fa-level-up-alt text-indigo-600"></i> Promotion Approvals
                </h2>
            </div>

            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                        <i className="fas fa-inbox text-lg"></i>
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-800 tracking-tight">Pending Teacher Requests</h3>
                        <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">
                            {pendingRequests?.length || 0} Awaiting Review
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b-2 border-slate-100">
                                <th className="py-4 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Student</th>
                                <th className="py-4 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Movement</th>
                                <th className="py-4 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Requested By</th>
                                <th className="py-4 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap hidden sm:table-cell">Date</th>
                                <th className="py-4 px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {(!pendingRequests || pendingRequests.length === 0) ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-slate-400 font-medium text-sm">
                                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <i className="fas fa-check-double text-2xl text-slate-300"></i>
                                        </div>
                                        No pending promotion requests.
                                    </td>
                                </tr>
                            ) : (
                                pendingRequests.map(req => (
                                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="py-4 px-3">
                                            <p className="font-bold text-slate-800 text-sm">{req.studentName}</p>
                                            {req.reason && (
                                                <p className="text-[10px] text-slate-500 mt-1 italic max-w-xs truncate" title={req.reason}>
                                                    "{req.reason}"
                                                </p>
                                            )}
                                        </td>
                                        <td className="py-4 px-3">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 w-max px-3 py-1.5 rounded-lg border border-slate-200">
                                                <span>{req.fromClassName}</span>
                                                <i className="fas fa-arrow-right text-indigo-400"></i>
                                                <span className={req.fromClassId === req.toClassId ? "text-orange-600" : "text-indigo-700"}>
                                                    {req.toClassName}
                                                </span>
                                            </div>
                                            {req.fromClassId === req.toClassId && (
                                                <span className="inline-block mt-1.5 px-2 py-0.5 bg-orange-100 text-orange-600 text-[9px] font-black uppercase tracking-widest rounded-md">
                                                    <i className="fas fa-redo-alt mr-1"></i> Repeating
                                                </span>
                                            )}
                                            {req.currentStudentClassId !== req.fromClassId && (
                                                <p className="text-[9px] font-bold text-red-500 mt-1 uppercase tracking-widest">
                                                    <i className="fas fa-exclamation-triangle"></i> Conflict: Class Changed
                                                </p>
                                            )}
                                        </td>
                                        <td className="py-4 px-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-black shrink-0">
                                                    {req.requestedByName.charAt(0)}
                                                </div>
                                                <span className="text-xs font-bold text-slate-600">{req.requestedByName}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-3 hidden sm:table-cell">
                                            <p className="text-[11px] font-bold text-slate-500">
                                                {new Date(req.createdAt).toLocaleDateString()}
                                            </p>
                                        </td>
                                        <td className="py-4 px-3 text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                <button
                                                    onClick={() => handleReject(req)}
                                                    disabled={isProcessing === req.id}
                                                    className="w-8 h-8 md:w-auto md:px-4 md:py-1.5 rounded-lg md:rounded-xl text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                                    title="Reject Request"
                                                >
                                                    <i className="fas fa-times"></i>
                                                    <span className="hidden md:inline">Reject</span>
                                                </button>
                                                <button
                                                    onClick={() => handleApprove(req)}
                                                    disabled={isProcessing === req.id || req.currentStudentClassId !== req.fromClassId}
                                                    className="w-8 h-8 md:w-auto md:px-4 md:py-1.5 rounded-lg md:rounded-xl text-[10px] font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all active:scale-95 disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none flex items-center justify-center gap-2"
                                                    title="Approve Request"
                                                >
                                                    {isProcessing === req.id ? (
                                                        <i className="fas fa-spinner fa-spin"></i>
                                                    ) : (
                                                        <i className="fas fa-check"></i>
                                                    )}
                                                    <span className="hidden md:inline">Approve</span>
                                                </button>
                                            </div>
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
