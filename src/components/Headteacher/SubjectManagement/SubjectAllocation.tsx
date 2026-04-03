
import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../../../eduDb';
import { db } from '../../../db';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../hooks/useAuth';
import { showToast } from '../../Common/Toast';

const SubjectAllocation: React.FC = () => {
    const { user } = useAuth();
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const classes = useLiveQuery(() =>
        user?.schoolId ? eduDb.classes.where('schoolId').equals(user.schoolId).filter(c => !c.isDeleted).toArray() : []
        , [user?.schoolId]);

    const subjects = useLiveQuery(() =>
        user?.schoolId ? eduDb.subjects.where('schoolId').equals(user.schoolId).toArray() : []
        , [user?.schoolId]);

    const teachers = useLiveQuery(() => {
        if (!user?.schoolId) return [];
        return db.users
            .where('schoolId')
            .equals(user.schoolId)
            .filter(u => {
                const r = (u.role || '').toUpperCase();
                return (r === 'TEACHER' || r === 'STAFF' || r === 'HEADTEACHER') && !u.isDeleted;
            })
            .toArray();
    }, [user?.schoolId]);

    const classSubjectsRecord = useLiveQuery(() =>
        user?.schoolId ? eduDb.classSubjects.where('schoolId').equals(user.schoolId).toArray() : []
        , [user?.schoolId]);

    const [allocations, setAllocations] = useState<{ [subjectId: number]: string }>({});
    const [selectedSubjects, setSelectedSubjects] = useState<Set<number>>(new Set());

    // Derived: teaching mode and class teacher for the selected class
    const selectedClassObj = selectedClassId
        ? classes?.find(c => c.id === parseInt(selectedClassId))
        : undefined;
    const isClassTeacherMode = selectedClassObj?.teachingMode === 'class_teacher';
    const classTeacherId = selectedClassObj?.classTeacherId;

    const lastLoadedClassIdRef = useRef<string>('');

    useEffect(() => {
        // Only reload from DB when the user selects a different class.
        // Ignore re-renders triggered by useLiveQuery DB updates (e.g. after Save).
        if (selectedClassId === lastLoadedClassIdRef.current || !classSubjectsRecord) return;
        lastLoadedClassIdRef.current = selectedClassId;

        if (selectedClassId) {
            const classIdNum = parseInt(selectedClassId);
            const related = classSubjectsRecord.filter(cs => cs.classId === classIdNum && !cs.isDeleted);

            const newSelectedSubjects = new Set<number>();
            const newAllocations: { [key: number]: string } = {};

            related.forEach(cs => {
                newSelectedSubjects.add(cs.subjectId);
                if (cs.teacherId) {
                    newAllocations[cs.subjectId] = cs.teacherId;
                }
            });

            setSelectedSubjects(newSelectedSubjects);
            setAllocations(newAllocations);
        } else {
            setSelectedSubjects(new Set());
            setAllocations({});
        }
    }, [selectedClassId, classSubjectsRecord]);

    const handleSubjectToggle = (subjectId: number) => {
        const newSelected = new Set(selectedSubjects);
        if (newSelected.has(subjectId)) {
            newSelected.delete(subjectId);
            const newAllocations = { ...allocations };
            delete newAllocations[subjectId];
            setAllocations(newAllocations);
        } else {
            newSelected.add(subjectId);
            // Auto-assign class teacher in class_teacher mode
            if (isClassTeacherMode && classTeacherId) {
                setAllocations(prev => ({ ...prev, [subjectId]: classTeacherId }));
            }
        }
        setSelectedSubjects(newSelected);
    };

    const handleTeacherChange = (subjectId: number, teacherId: string) => {
        setAllocations(prev => ({ ...prev, [subjectId]: teacherId }));
    };

    const handleSave = async () => {
        if (!selectedClassId || !user?.schoolId) return;
        setLoading(true);
        try {
            const classIdNum = parseInt(selectedClassId);

            // Resolve class cloud UUID
            const localClass = await eduDb.classes.get(classIdNum);
            const classCloudId = (localClass as any)?.idCloud;
            if (!classCloudId) {
                showToast('This class has not synced to the cloud yet. Please sync first.', 'error');
                return;
            }

            // Load existing local assignments (INCLUDING deleted ones to resurrect)
            const existingRecords = await eduDb.classSubjects
                .where({ classId: classIdNum })
                .toArray();
            const existingMap = new Map(existingRecords.map(cs => [cs.subjectId, cs]));

            const selectedSubjectIds = Array.from(selectedSubjects);

            // 1. Save selected subjects ── Online First (select → insert or update)
            for (const sId of selectedSubjectIds) {
                let teacherUuid = allocations[sId] || null;
                if (isClassTeacherMode && classTeacherId) {
                    // Try to resolve the classTeacher's cloud UUID directly if it exists
                    const asNum = parseInt(classTeacherId);
                    const teacherRecord = await db.users.where({ idCloud: classTeacherId }).first() 
                        || (!isNaN(asNum) ? await db.users.get(asNum) : null);
                    teacherUuid = (teacherRecord as any)?.idCloud || classTeacherId;
                }

                const localSubject = await eduDb.subjects.get(sId);
                const subjectCloudId = (localSubject as any)?.idCloud;
                if (!subjectCloudId) {
                    showToast(`Subject "${localSubject?.name}" is not synced yet. Skipping.`, 'error');
                    continue;
                }

                // SELECT first — avoids ON CONFLICT issue with partial unique index
                const { data: existingCloud } = await supabase
                    .from('class_subjects')
                    .select('id')
                    .eq('class_id', classCloudId)
                    .eq('subject_id', subjectCloudId)
                    .maybeSingle();

                let cloudId: string;
                if (existingCloud?.id) {
                    const { error } = await supabase
                        .from('class_subjects')
                        .update({ teacher_id: teacherUuid, is_deleted: false })
                        .eq('id', existingCloud.id)
                        .select('id')
                        .single();
                    if (error) throw new Error(error.message);
                    cloudId = existingCloud.id;
                } else {
                    const { data: inserted, error } = await supabase
                        .from('class_subjects')
                        .insert({
                            school_id: user.schoolId,
                            class_id: classCloudId,
                            subject_id: subjectCloudId,
                            teacher_id: teacherUuid,
                            is_deleted: false
                        })
                        .select('id')
                        .single();
                    if (error) throw new Error(error.message);
                    cloudId = inserted.id;
                }

                // Mirror to IndexedDB
                const localExisting = existingMap.get(sId);
                if (localExisting) {
                    await eduDb.classSubjects.update(localExisting.id!, {
                        idCloud: cloudId, isDeleted: false,
                        teacherId: teacherUuid ?? undefined, syncStatus: 'synced'
                    } as any);
                } else {
                    await eduDb.classSubjects.add({
                        idCloud: cloudId, schoolId: user.schoolId,
                        classId: classIdNum, subjectId: sId,
                        teacherId: teacherUuid ?? undefined, isDeleted: false,
                        createdAt: Date.now(), updatedAt: Date.now(), syncStatus: 'synced'
                    } as any);
                }
            }

            // 2. Soft-delete removed subjects ─────────────────────────────
            for (const existing of existingRecords) {
                if (!selectedSubjects.has(existing.subjectId)) {
                    const cloudId = (existing as any).idCloud;
                    if (cloudId) {
                        const { error } = await supabase
                            .from('class_subjects')
                            .update({ is_deleted: true })
                            .eq('id', cloudId);
                        if (error) throw new Error(error.message);
                    }
                    await eduDb.classSubjects.update(existing.id!, {
                        isDeleted: true, updatedAt: Date.now(), syncStatus: 'synced'
                    } as any);
                }
            }

            showToast('Subject allocations saved successfully!', 'success');
        } catch (error: any) {
            console.error('Error saving allocation:', error);
            showToast(error.message || 'Failed to save allocations. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const selectedCount = selectedSubjects.size;

    return (
        <div className="space-y-5">
            {/* ── Page Header ── */}
            <div>
                <h3 className="text-xl font-bold text-gray-800">Subject Allocation</h3>
                <p className="text-gray-400 text-sm mt-0.5">Assign subjects to classes and appoint teachers.</p>
            </div>

            {/* ── Class Selector ── */}
            <div className="bg-blue-50 p-4 sm:p-6 rounded-2xl border border-blue-100">
                <label className="block text-sm font-bold text-blue-900 mb-2">Select Class to Manage</label>
                <div className="relative">
                    <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="w-full sm:w-1/2 lg:w-1/3 appearance-none px-4 py-3 pr-10 rounded-xl border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white font-bold text-gray-700"
                    >
                        <option value="">-- Choose Class --</option>
                        {classes?.map(cls => (
                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                        ))}
                    </select>
                    <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 left-[calc(100%_-_2.5rem)] sm:left-auto sm:right-[calc(50%_+_0.75rem)] lg:right-[calc(67%_+_0.75rem)] hidden sm:flex items-center text-blue-400">
                        <i className="fas fa-chevron-down text-xs"></i>
                    </span>
                </div>
            </div>

            {/* ── Subject List (shown after a class is selected) ── */}
            {selectedClassId && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-fadeIn">

                    {/* ── Class Teacher Mode Banner ── */}
                    {isClassTeacherMode && (
                        <div className="px-4 sm:px-6 py-3 bg-green-50 border-b border-green-100 flex items-start gap-3">
                            <i className="fas fa-info-circle text-green-500 mt-0.5 flex-shrink-0"></i>
                            <div>
                                <p className="text-sm font-bold text-green-800">Class Teacher Based Mode</p>
                                <p className="text-xs text-green-700 mt-0.5">
                                    {classTeacherId
                                        ? 'All subjects in this class are taught by the class teacher. Teacher assignments are locked.'
                                        : 'Please assign a class teacher to this class first before enabling subjects.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Stats bar ── */}
                    <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
                            <i className="fas fa-book text-primary"></i>
                            <span>{subjects?.length || 0} subjects</span>
                            {selectedCount > 0 && (
                                <span className="ml-2 px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-black">
                                    {selectedCount} active
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-gray-400 font-medium hidden sm:block">Toggle to enable · pick a teacher per subject</p>
                    </div>

                    {/* ── Desktop table header (hidden on mobile) ── */}
                    <div className="hidden sm:grid grid-cols-12 bg-gray-50/60 border-b border-gray-100 px-4 py-3 text-[11px] font-black text-gray-400 uppercase tracking-widest">
                        <div className="col-span-1 text-center">Active</div>
                        <div className="col-span-5">Subject</div>
                        <div className="col-span-6">Assigned Teacher</div>
                    </div>

                    {/* ── Rows ── */}
                    <div className="divide-y divide-gray-50">
                        {subjects?.length === 0 && (
                            <div className="py-16 text-center text-gray-400 italic font-medium">
                                No subjects defined yet.
                            </div>
                        )}

                        {subjects?.map(subject => {
                            const isActive = selectedSubjects.has(subject.id!);
                            return (
                                <div
                                    key={subject.id}
                                    className={`transition-colors ${isActive ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}
                                >
                                    {/* ── Mobile card layout ── */}
                                    <div className="sm:hidden p-4 space-y-3">
                                        {/* Top row: checkbox + subject name */}
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => subject.id && handleSubjectToggle(subject.id)}
                                                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${isActive ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white text-transparent'}`}
                                            >
                                                <i className="fas fa-check text-[10px]"></i>
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <span className={`font-bold text-sm ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                                                    {subject.name}
                                                </span>
                                                {subject.code && (
                                                    <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">
                                                        {subject.code}
                                                    </span>
                                                )}
                                            </div>
                                            {isActive && (
                                                <span className="text-[10px] font-black text-primary bg-blue-100 px-2 py-0.5 rounded-full uppercase tracking-widest flex-shrink-0">
                                                    Active
                                                </span>
                                            )}
                                        </div>

                                        {/* Teacher selector — only shown when subject is active */}
                                        {isActive && (
                                            <div className="ml-9">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">
                                                    <i className="fas fa-user-tie mr-1 text-indigo-400"></i>Assigned Teacher
                                                </label>
                                                <div className="relative">
                                                    <select
                                                        value={isClassTeacherMode ? (classTeacherId || '') : (allocations[subject.id!] || '')}
                                                        onChange={(e) => subject.id && handleTeacherChange(subject.id, e.target.value)}
                                                        disabled={isClassTeacherMode}
                                                        className={`w-full appearance-none pl-3 pr-8 py-2.5 rounded-xl border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors ${
                                                            isClassTeacherMode
                                                                ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed'
                                                                : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100'
                                                        }`}
                                                    >
                                                        <option value="">— No Teacher —</option>
                                                    {teachers?.map((teacher: any) => (
                                                        <option key={teacher.id} value={teacher.idCloud || ''} disabled={!teacher.idCloud}>
                                                            {teacher.fullName || teacher.username}{!teacher.idCloud ? ' (Not Synced)' : ''}
                                                        </option>
                                                    ))}
                                                    </select>
                                                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                                                        <i className="fas fa-chevron-down text-[10px] text-indigo-400"></i>
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Desktop row layout ── */}
                                    <div className="hidden sm:grid grid-cols-12 items-center px-4 py-3 gap-3">
                                        <div className="col-span-1 flex justify-center">
                                            <input
                                                type="checkbox"
                                                checked={isActive}
                                                onChange={() => subject.id && handleSubjectToggle(subject.id)}
                                                className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                            />
                                        </div>
                                        <div className="col-span-5">
                                            <span className={`font-bold text-sm ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                                                {subject.name}
                                            </span>
                                            {subject.code && (
                                                <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">
                                                    {subject.code}
                                                </span>
                                            )}
                                        </div>
                                        <div className="col-span-6">
                                            <div className="relative">
                                                <select
                                                    disabled={!isActive || isClassTeacherMode}
                                                    value={isClassTeacherMode ? (classTeacherId || '') : (allocations[subject.id!] || '')}
                                                    onChange={(e) => subject.id && handleTeacherChange(subject.id, e.target.value)}
                                                    className={`w-full appearance-none pl-3 pr-8 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors
                                                        ${!isActive || isClassTeacherMode
                                                            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                                                            : 'bg-indigo-50 border-indigo-100 text-indigo-700 font-bold hover:bg-indigo-100 focus:ring-indigo-300 cursor-pointer'
                                                        }`}
                                                >
                                                    <option value="">— No Teacher Assigned —</option>
                                                    {teachers?.map((teacher: any) => (
                                                        <option key={teacher.id} value={teacher.idCloud || ''} disabled={!teacher.idCloud}>
                                                            {teacher.fullName || teacher.username}{!teacher.idCloud ? ' (Not Synced)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                {isActive && (
                                                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                                                        <i className="fas fa-chevron-down text-[10px] text-indigo-400"></i>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Footer / Save ── */}
                    <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <p className="text-xs text-gray-400 font-medium text-center sm:text-left">
                            {selectedCount} of {subjects?.length || 0} subjects active for this class
                        </p>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:scale-100"
                        >
                            {loading ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-save"></i>}
                            Save Changes
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubjectAllocation;
