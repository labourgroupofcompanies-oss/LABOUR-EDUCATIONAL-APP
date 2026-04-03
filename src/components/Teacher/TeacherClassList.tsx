import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { type Class, type Student, eduDb } from '../../eduDb';
import { useAuth } from '../../hooks/useAuth';
import { dbService } from '../../services/dbService';
import { useAssetPreview } from '../../hooks/useAssetPreview';
import { useAcademicSession } from '../../hooks/useAcademicSession';
import { showToast } from '../Common/Toast';

/* ── helper to compute the Setting key for a student remark ── */
const remarkKey = (studentId: number, term: string, year: number) =>
    `teacher_remark__${studentId}__${term}__${year}`;

/* ── Student card (read-only list) ── */
interface StudentCardProps {
    student: Student & { feeStatus?: string; balance?: number };
}

const StudentCard: React.FC<StudentCardProps> = ({ student }) => {
    const photoUrl = useAssetPreview(student.photo);

    const statusBadge = (status?: string) => {
        if (!status || status === 'no-fee') return null;
        const config: Record<string, string> = {
            paid: 'bg-green-50 text-green-600 border-green-100',
            overpaid: 'bg-cyan-50 text-cyan-600 border-cyan-100',
            partial: 'bg-amber-50 text-amber-600 border-amber-100',
            unpaid: 'bg-red-50 text-red-600 border-red-100',
        };
        const labels: Record<string, string> = {
            paid: 'Paid', overpaid: 'Credit', partial: 'Partial', unpaid: 'Owing'
        };

        return (
            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-tighter border ${config[status] || 'bg-gray-50 text-gray-400'}`}>
                {labels[status] || status}
            </span>
        );
    };

    return (
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all flex items-start gap-4 md:gap-5 group">
            <div className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl overflow-hidden shadow-sm flex-shrink-0 group-hover:scale-110 transition-transform ${!photoUrl ? 'bg-indigo-50 text-indigo-300 flex items-center justify-center text-xl md:text-2xl font-black' : ''}`}>
                {photoUrl ? (
                    <img src={photoUrl} alt={student.fullName} className="w-full h-full object-cover" />
                ) : (
                    student.fullName.charAt(0)
                )}
            </div>
            <div className="flex-1">
                <div className="flex justify-between items-start gap-2">
                    <h3 className="font-black text-gray-800 group-hover:text-primary transition-colors leading-tight">{student.fullName}</h3>
                    {statusBadge(student.feeStatus)}
                </div>

                <div className="space-y-2 mt-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            {student.studentIdString || 'NO ID'}
                        </span>
                        {typeof student.balance === 'number' && (
                            <span className={`text-[10px] font-black ${student.balance > 0 ? 'text-red-500' : student.balance < 0 ? 'text-cyan-600' : 'text-green-600'}`}>
                                {student.balance > 0 
                                    ? `DEBT: GHS ${student.balance.toFixed(2)}` 
                                    : student.balance < 0 
                                        ? `CREDIT: GHS ${Math.abs(student.balance).toFixed(2)}` 
                                        : `CLEARED: GHS 0.00`}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${student.gender === 'male' ? 'bg-blue-50 text-blue-500 border border-blue-100' : 'bg-pink-50 text-pink-500 border border-pink-100'}`}>
                            {student.gender || 'Unknown'}
                        </span>
                        {student.isBoarding && (
                            <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-yellow-50 text-yellow-600 border border-yellow-100">
                                Boarding
                            </span>
                        )}
                    </div>
                </div>
                {student.guardianPrimaryContact && (
                    <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-2 text-xs font-bold text-indigo-600">
                        <i className="fas fa-phone-alt" />
                        <span>{student.guardianPrimaryContact}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ── Remark row for a single student ── */
const RemarkRow: React.FC<{
    student: Student;
    term: string;
    year: number;
    schoolId: string;
}> = ({ student, term, year, schoolId }) => {
    const key = remarkKey(student.id!, term, year);
    const photoUrl = useAssetPreview(student.photo);

    const savedRemark = useLiveQuery(async () => {
        const setting = await eduDb.settings
            .where('[schoolId+key]')
            .equals([schoolId, key])
            .first();
        return setting?.value ?? '';
    }, [schoolId, key]);

    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    // Sync fetched value into local state (only when it first arrives)
    useEffect(() => {
        if (savedRemark !== undefined && !dirty) {
            setText(savedRemark);
        }
    }, [savedRemark, dirty]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const existing = await eduDb.settings
                .where('[schoolId+key]')
                .equals([schoolId, key])
                .first();
            if (existing?.id) {
                await eduDb.settings.update(existing.id, {
                    value: text,
                    updatedAt: Date.now(),
                    syncStatus: 'pending',
                });
            } else {
                await eduDb.settings.add({
                    schoolId,
                    key,
                    value: text,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    syncStatus: 'pending',
                });
            }
            setDirty(false);
            showToast('Remark saved!', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to save remark.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row gap-4 items-start">
            {/* Avatar */}
            <div className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 ${!photoUrl ? 'bg-indigo-50 text-indigo-300 flex items-center justify-center font-black text-lg' : ''}`}>
                {photoUrl
                    ? <img src={photoUrl} alt={student.fullName} className="w-full h-full object-cover" />
                    : student.fullName.charAt(0)
                }
            </div>

            {/* Name + inputs */}
            <div className="flex-1 w-full space-y-2">
                <p className="font-black text-gray-800 text-sm">{student.fullName}
                    <span className="ml-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{student.studentIdString}</span>
                </p>
                <div className="flex gap-2 items-center">
                    <textarea
                        rows={2}
                        value={text}
                        onChange={e => { setText(e.target.value); setDirty(true); }}
                        placeholder="Enter teacher's remark for this learner…"
                        className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none text-gray-700 placeholder-gray-300"
                    />
                    <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5 flex-shrink-0"
                    >
                        {saving
                            ? <i className="fas fa-spinner fa-spin" />
                            : <i className="fas fa-save" />
                        }
                        Save
                    </button>
                </div>
                {!dirty && savedRemark && (
                    <p className="text-[10px] text-green-600 font-bold flex items-center gap-1">
                        <i className="fas fa-check-circle" /> Saved
                    </p>
                )}
            </div>
        </div>
    );
};

/* ── Main component ── */
type ClassView = 'roster' | 'remarks' | 'subjects';

const TeacherClassList: React.FC = () => {
    const { user } = useAuth();
    const { currentTerm, currentYear, academicYear, isLoaded } = useAcademicSession();
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);
    const [classView, setClassView] = useState<ClassView>('roster');
    const [remarksTerm, setRemarksTerm] = useState('Term 1');
    const [remarksYear, setRemarksYear] = useState(new Date().getFullYear());

    // Default the remarks selectors to the active academic session
    useEffect(() => {
        if (isLoaded) {
            setRemarksTerm(currentTerm);
            setRemarksYear(currentYear);
        }
    }, [isLoaded, currentTerm, currentYear]);

    const classes = useLiveQuery(async () => {
        if (user?.schoolId && user?.id) {
            return await dbService.classes.getTeacherClasses(user.schoolId, user.id.toString());
        }
        return [];
    }, [user?.schoolId, user?.id]);

    // Track which classes the teacher is a class teacher for
    const classTeacherIds = useLiveQuery(async () => {
        if (user?.schoolId && user?.id) {
            const ctClasses = await dbService.classes.getAsClassTeacher(user.schoolId, user.id.toString());
            return new Set(ctClasses.map(c => c.id!));
        }
        return new Set<number>();
    }, [user?.schoolId, user?.id]);

    const isCurrentClassTeacher = selectedClass ? classTeacherIds?.has(selectedClass.id!) ?? false : false;

    const students = useLiveQuery(async () => {
        if (!selectedClass?.id || !user?.schoolId) return [];

        const [allStudents, structures, allPayments] = await Promise.all([
            dbService.students.getByClass(user.schoolId, selectedClass.id),
            dbService.fees.getAllStructures(user.schoolId, currentTerm, currentYear),
            dbService.fees.getPaymentsByTerm(user.schoolId, currentTerm, currentYear),
        ]);

        const enriched: (Student & { feeStatus: string; balance: number })[] = [];
        for (const student of allStudents) {
            const structure = structures.find(s => s.classId === student.classId);
            const payments = allPayments.filter(p => p.studentId === student.id);
            const amountPaid = payments.reduce((sum, p) => sum + p.amountPaid, 0);
            const termFeeAmount = structure?.termFeeAmount ?? 0;

            // Compute residual arrears: subtract payments from PREVIOUS terms so the
            // new-term balance correctly reflects what was actually left unpaid.
            const rawArrears = student.arrears || 0;
            const residualArrears = student.id
                ? await dbService.fees.getArrearsBalance(user.schoolId, student.id, currentTerm, currentYear, rawArrears)
                : rawArrears;

            const feeAmount = termFeeAmount + residualArrears;
            const balance = feeAmount - amountPaid;

            let feeStatus = 'no-fee';
            if (termFeeAmount > 0 || residualArrears !== 0) {
                if (amountPaid > feeAmount) feeStatus = 'overpaid';
                else if (amountPaid >= feeAmount || feeAmount <= 0) feeStatus = 'paid';
                else if (amountPaid > 0) feeStatus = 'partial';
                else feeStatus = 'unpaid';
            }

            enriched.push({ ...student, feeStatus, balance });
        }
        return enriched;
    }, [selectedClass, user?.schoolId, currentTerm, currentYear]);

    const allocatedSubjects = useLiveQuery(async () => {
        if (!selectedClass?.id || !user?.schoolId) return [];
        
        const [classSubjects, staff] = await Promise.all([
            dbService.classSubjects.getByClass(user.schoolId, selectedClass.id),
            dbService.staff.getAll(user.schoolId)
        ]);
        
        const subjectTeachers: { subjectName: string; teacherName: string; teacherId?: string }[] = [];
        
        for (const cs of classSubjects) {
            const subject = await eduDb.subjects.get(cs.subjectId);
            let teacherName = 'Unassigned';
            
            if (cs.teacherId) {
                const teacherIds = await dbService.staff.resolveTeacherIds(cs.teacherId);
                const found = staff.find(t => teacherIds.includes(t.id?.toString() || (t as any).idCloud || ''));
                if (found) {
                    teacherName = found.fullName || found.username || 'Unknown Teacher';
                }
            }
            
            if (subject) {
                subjectTeachers.push({
                    subjectName: subject.name,
                    teacherName,
                    teacherId: cs.teacherId
                });
            }
        }
        return subjectTeachers;
    }, [selectedClass, user?.schoolId]);

    const classStats = React.useMemo(() => {
        if (!students) return null;
        const total = students.length;
        const paid = students.filter(s => s.feeStatus === 'paid' || s.feeStatus === 'overpaid').length;
        const debt = students.reduce((sum, s) => sum + Math.max(0, s.balance || 0), 0);
        return { total, paid, debt };
    }, [students]);

    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

    if (selectedClass) {
        return (
            <div className="space-y-6 md:space-y-8 animate-fadeIn">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 border-b border-gray-100 pb-6 md:pb-8">
                    <div>
                        <button
                            onClick={() => { setSelectedClass(null); setClassView('roster'); }}
                            className="flex items-center text-gray-400 hover:text-indigo-600 font-black text-[9px] md:text-[10px] uppercase tracking-[0.2em] transition-all mb-4"
                        >
                            <i className="fas fa-chevron-left mr-2" /> My Classes
                        </button>
                        <h2 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">{selectedClass.name}</h2>
                        <p className="text-xs md:text-sm text-gray-400 font-medium">Population: {students?.length || 0} Learners</p>
                    </div>
                    <div className="flex gap-4">
                        <div className={`px-6 py-3 rounded-2xl border ${isCurrentClassTeacher ? 'bg-green-50 border-green-100' : 'bg-indigo-50 border-indigo-100'}`}>
                            <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isCurrentClassTeacher ? 'text-green-400' : 'text-indigo-400'}`}>Designation</div>
                            <div className={`font-black text-sm uppercase tracking-widest ${isCurrentClassTeacher ? 'text-green-700' : 'text-indigo-700'}`}>
                                {isCurrentClassTeacher ? 'Class Teacher' : 'Subject Teacher'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Class Snapshot Banner */}
                {classStats && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm animate-slideDown">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-xl">
                                <i className="fas fa-users-viewfinder"></i>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Population</p>
                                <p className="text-lg font-black text-gray-800 leading-none">{classStats.total} Learners</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 px-0 sm:px-6 sm:border-x border-gray-50">
                            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center text-xl">
                                <i className="fas fa-check-double"></i>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Paid Status</p>
                                <p className="text-lg font-black text-gray-800 leading-none">{classStats.paid} / {classStats.total} <span className="text-[10px] text-green-500 ml-1">PAID</span></p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center text-xl">
                                <i className="fas fa-sack-xmark"></i>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Total Debt</p>
                                <p className="text-lg font-black text-red-500 leading-none">GHS {classStats.debt.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Sub-tab selector */}
                <div className="flex gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-100 w-full sm:w-auto sm:inline-flex">
                    {([
                        { key: 'roster', label: 'Learner Roster', icon: 'fa-users' },
                        ...(isCurrentClassTeacher
                            ? [
                                { key: 'remarks', label: 'Term Remarks', icon: 'fa-comment-dots' },
                                { key: 'subjects', label: 'Allocated Subjects', icon: 'fa-book' }
                              ]
                            : []
                        ),
                    ] as { key: ClassView; label: string; icon: string }[]).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setClassView(tab.key)}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${classView === tab.key ? 'bg-white shadow-sm text-indigo-600 border border-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <i className={`fas ${tab.icon}`} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── ROSTER ── */}
                {classView === 'roster' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                        {students?.map(student => (
                            <StudentCard key={student.id} student={student} />
                        ))}
                        {students?.length === 0 && (
                            <div className="col-span-full py-20 text-center bg-gray-50/50 rounded-[3rem] border-2 border-dashed border-gray-100">
                                <i className="fas fa-user-graduate text-5xl mb-6 text-gray-200" />
                                <h3 className="text-xl font-bold text-gray-400">Roster Depleted</h3>
                                <p className="text-gray-400 mt-2 font-medium">No students assigned yet.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── REMARKS ── */}
                {classView === 'remarks' && (
                    <div className="space-y-5">
                        {/* Active session notice */}
                        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-2.5 rounded-xl text-xs font-black text-indigo-700">
                            <i className="fas fa-calendar-alt text-indigo-400" />
                            Active Session: <span className="text-indigo-900">{academicYear} &bull; {currentTerm}</span>
                            <span className="text-indigo-400 font-medium ml-1">(remarking below)</span>
                        </div>

                        {/* Info banner */}
                        <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-800">
                            <i className="fas fa-info-circle text-amber-500 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-black">Term Remarks</p>
                                <p className="text-xs mt-0.5 text-amber-700">Write a short remark for each learner. These appear on the printed report card under <strong>Class Teacher's Remarks</strong>.</p>
                            </div>
                        </div>

                        {/* Term/Year selectors */}
                        <div className="flex flex-wrap gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <div className="flex-1 min-w-[130px] space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Term</label>
                                <select
                                    value={remarksTerm}
                                    onChange={e => setRemarksTerm(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white text-sm font-medium text-gray-700"
                                >
                                    <option>Term 1</option>
                                    <option>Term 2</option>
                                    <option>Term 3</option>
                                </select>
                            </div>
                            <div className="flex-1 min-w-[110px] space-y-1">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Year</label>
                                <select
                                    value={remarksYear}
                                    onChange={e => setRemarksYear(parseInt(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white text-sm font-medium text-gray-700"
                                >
                                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Remark rows */}
                        {students?.length === 0 ? (
                            <div className="py-12 text-center text-gray-400">
                                <i className="fas fa-user-graduate text-4xl mb-3 opacity-40" />
                                <p className="font-bold">No students in this class yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {students?.map(student => (
                                    <RemarkRow
                                        key={student.id}
                                        student={student}
                                        term={remarksTerm}
                                        year={remarksYear}
                                        schoolId={user!.schoolId}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── SUBJECTS ── */}
                {classView === 'subjects' && (
                    <div className="space-y-4 animate-fadeIn">
                        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-sm text-indigo-800 mb-6">
                            <i className="fas fa-book-open text-indigo-500 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-black">Subject Allocations</p>
                                <p className="text-xs mt-0.5 text-indigo-700">The current subjects assigned to this class and the designated subject teachers.</p>
                            </div>
                        </div>

                        {allocatedSubjects && allocatedSubjects.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {allocatedSubjects.map((sub, idx) => (
                                    <div key={idx} className="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-col gap-3 group hover:shadow-md transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-lg flex-shrink-0 group-hover:scale-110 transition-transform">
                                                <i className="fas fa-book"></i>
                                            </div>
                                            <div>
                                                <h4 className="font-black text-gray-800 leading-tight group-hover:text-purple-600 transition-colors">{sub.subjectName}</h4>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Subject</p>
                                            </div>
                                        </div>
                                        <div className="pt-3 border-t border-gray-50 flex items-center gap-2">
                                            <i className="fas fa-chalkboard-teacher text-indigo-400 text-xs" />
                                            <span className="text-xs font-bold text-gray-600 truncate">{sub.teacherName}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 text-center bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100">
                                <i className="fas fa-book text-4xl mb-4 text-gray-200" />
                                <h3 className="text-lg font-bold text-gray-400">No Subjects Allocated</h3>
                                <p className="text-gray-400 text-sm mt-1 font-medium">Subjects have not yet been assigned to this sector.</p>
                            </div>
                        )}
                    </div>
                )}
            </div >
        );
    }

    /* ── Class list (no class selected) ── */
    return (
        <div className="space-y-6 md:space-y-8 animate-fadeIn">
            <div>
                <h2 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">Assigned Classes</h2>
                <p className="text-xs md:text-sm text-gray-400 font-medium mt-1">Sectors where you hold Class Teacher authorization.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                {classes?.map(cls => (
                    <div
                        key={cls.id}
                        className="premium-card p-6 md:p-8 group cursor-pointer relative overflow-hidden"
                        onClick={() => { setSelectedClass(cls); setClassView('roster'); }}
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-full translate-x-12 -translate-y-12 transition-transform group-hover:scale-150" />

                        <div className="flex justify-between items-start mb-8 relative z-10">
                            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm group-hover:bg-primary group-hover:text-white transition-all">
                                <i className="fas fa-chalkboard" />
                            </div>
                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${
                                classTeacherIds?.has(cls.id!)
                                    ? 'bg-green-50 text-green-600 border-green-100'
                                    : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                            }`}>
                                {classTeacherIds?.has(cls.id!) ? 'Class Teacher' : 'Subject Teacher'}
                            </span>
                        </div>

                        <div className="relative z-10">
                            <h3 className="text-2xl font-black text-gray-800 mb-2 group-hover:text-primary transition-colors">{cls.name}</h3>
                            <div className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                                {cls.level} Sector
                            </div>
                        </div>

                        <div className="mt-8 pt-8 border-t border-gray-50 flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest">
                                Manage Roster
                                <i className="fas fa-arrow-right ml-1 transition-transform group-hover:translate-x-2" />
                            </div>
                        </div>
                    </div>
                ))}
                {classes?.length === 0 && (
                    <div className="col-span-full py-24 text-center bg-gray-50/50 rounded-[3rem] border-2 border-dashed border-gray-100">
                        <div className="w-24 h-24 bg-white shadow-xl rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-gray-200">
                            <i className="fas fa-chalkboard-teacher text-4xl" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-400">Access Denied</h3>
                        <p className="text-gray-400 mt-3 font-medium max-w-sm mx-auto">No class teacher assignments detected. Please contact the Headteacher for authorization.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeacherClassList;
