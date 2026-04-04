import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../hooks/useAuth';
import { dbService } from '../../services/dbService';
import { showToast } from '../Common/Toast';
import { showConfirm } from '../Common/ConfirmDialog';
import { showPromotionDialog } from '../Common/PromotionDialogs';
import { supabase } from '../../supabaseClient';
import { db } from '../../db';

const ClassManagement: React.FC = () => {
    const { user } = useAuth();
    const [isCreating, setIsCreating] = useState(false);
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
    const [isViewingRoster, setIsViewingRoster] = useState(false);
    const [newClass, setNewClass] = useState<{ name: string; level: string; teacherId: string; teachingMode: 'class_teacher' | 'subject_teacher' }>({
        name: '',
        level: 'Basic 1',
        teacherId: '',
        teachingMode: 'class_teacher'
    });

    const [isPromoting, setIsPromoting] = useState(false);
    const [promotionTargetClassId, setPromotionTargetClassId] = useState<number | null>(null);
    const [selectedStudentsForPromotion, setSelectedStudentsForPromotion] = useState<number[]>([]);

    // Class Name Edit State
    const [editingClassNameId, setEditingClassNameId] = useState<number | null>(null);
    const [editingClassNameValue, setEditingClassNameValue] = useState<string>('');

    // Subject Management State
    const [isManagingSubjects, setIsManagingSubjects] = useState(false);
    const [editingSubjectClassId, setEditingSubjectClassId] = useState<number | null>(null);
    // Map of subjectId to teacherId (empty string means unassigned)
    const [classSubjectsMap, setClassSubjectsMap] = useState<Record<number, string>>({});

    const classes = useLiveQuery(async () => {
        if (user?.schoolId) return await dbService.classes.getAll(user.schoolId);
        return [];
    }, [user?.schoolId]);

    // Auto-cleanup duplicate phantom classes in IndexedDB
    useEffect(() => {
        if (!classes || classes.length === 0 || !user?.schoolId) return;
        
        const cleanupDuplicates = async () => {
            const { eduDb } = await import('../../eduDb');
            const allActive = await eduDb.classes
                .where('schoolId').equals(user.schoolId)
                .filter(c => !c.isDeleted)
                .toArray();
            
            const groupByNameLevel = new Map<string, typeof allActive>();
            for (const c of allActive) {
                const key = `${c.name.toLowerCase()}-${c.level}`;
                if (!groupByNameLevel.has(key)) groupByNameLevel.set(key, []);
                groupByNameLevel.get(key)!.push(c);
            }

            for (const group of groupByNameLevel.values()) {
                if (group.length > 1) {
                    // Sort so the one WITH an idCloud comes first
                    group.sort((a, b) => {
                        if (a.idCloud && !b.idCloud) return -1;
                        if (!a.idCloud && b.idCloud) return 1;
                        return 0;
                    });
                    
                    // The first one is the keeper. Hard delete the rest.
                    const toDelete = group.slice(1);
                    for (const del of toDelete) {
                        console.warn('Auto-deleted local duplicate class:', del.name);
                        await eduDb.classes.delete(del.id!);
                    }
                }
            }
        };
        cleanupDuplicates();
    }, [classes?.length, user?.schoolId]);

    const teachers = useLiveQuery(() => {
        if (!user?.schoolId) return [];
        return db.users
            .where('schoolId')
            .equals(user.schoolId)
            .filter((u: any) => {
                const r = (u.role || '').toUpperCase();
                return (r === 'TEACHER' || r === 'STAFF' || r === 'HEADTEACHER') && !u.isDeleted;
            })
            .toArray();
    }, [user?.schoolId]);

    const subjects = useLiveQuery(async () => {
        if (user?.schoolId) return await dbService.subjects.getAll(user.schoolId);
        return [];
    }, [user?.schoolId]);

    const studentsInClass = useLiveQuery(async () => {
        if (user?.schoolId && selectedClassId) {
            return await dbService.students.getByClass(user.schoolId, selectedClassId);
        }
        return [];
    }, [user?.schoolId, selectedClassId]);

    const handleUpdateTeacher = async (classId: number, teacherUuid: string) => {
        if (!user?.schoolId) return;
        try {
            // Resolve the cloud UUID of the class
            const localClass = await (await import('../../eduDb')).eduDb.classes.get(classId);
            const classCloudId = (localClass as any)?.idCloud;

            if (!classCloudId) {
                showToast('Class has not synced to the cloud yet. Please sync first.', 'error');
                return;
            }

            // ── Online First ──────────────────────────────────────────
            const { error } = await supabase
                .from('classes')
                .update({ class_teacher_id: teacherUuid || null })
                .eq('id', classCloudId);

            if (error) throw new Error(error.message);

            // ── Mirror to IndexedDB ───────────────────────────────────
            await dbService.classes.update(classId, {
                classTeacherId: teacherUuid || undefined,
                syncStatus: 'synced'
            });

            // ── Auto-assign subjects in class_teacher mode ────────────
            if (localClass?.teachingMode === 'class_teacher') {
                await dbService.classSubjects.autoAssignClassTeacher(
                    user.schoolId, classId, teacherUuid || undefined
                );
            }

            showToast('Class teacher updated!', 'success');
        } catch (error: any) {
            console.error('Failed to update teacher', error);
            showToast(error.message || 'Failed to update teacher', 'error');
        }
    };

    const handleSaveClassName = async (classId: number) => {
        if (!user?.schoolId || !editingClassNameValue.trim()) {
            setEditingClassNameId(null);
            return;
        }

        const trimmedName = editingClassNameValue.trim();
        const currentClass = classes?.find(c => c.id === classId);
        
        if (currentClass?.name === trimmedName) {
            setEditingClassNameId(null);
            return; // No change
        }

        // Local pre-check to prevent duplicate conflict
        const isDuplicate = classes?.some(
            c => c.id !== classId && 
                 c.name.toLowerCase() === trimmedName.toLowerCase() && 
                 c.level === currentClass?.level && 
                 !c.isDeleted
        );
        
        if (isDuplicate) {
            showToast(`A class named "${trimmedName}" at level "${currentClass?.level}" already exists.`, 'error');
            return;
        }

        try {
            const classCloudId = (currentClass as any)?.idCloud;
            if (!classCloudId) {
                showToast('Class has not synced to the cloud yet. Please sync first.', 'error');
                return;
            }

            // Online update
            const { error } = await supabase
                .from('classes')
                .update({ name: trimmedName })
                .eq('id', classCloudId);

            if (error) throw new Error(error.message);

            // Local update
            await dbService.classes.update(classId, {
                name: trimmedName,
                syncStatus: 'synced'
            });

            showToast('Class name updated!', 'success');
            setEditingClassNameId(null);
        } catch (error: any) {
            console.error('Failed to update class name', error);
            showToast(error.message || 'Failed to update class name', 'error');
        }
    };

    const handleOpenSubjects = async (classId: number) => {
        if (!user?.schoolId) return;
        setEditingSubjectClassId(classId);

        // Load existing assignments from classSubjects
        const existingAssignments = await dbService.classSubjects.getByClass(user.schoolId, classId);

        const map: Record<number, string> = {};
        for (const assign of existingAssignments) {
            map[assign.subjectId] = assign.teacherId || '';
        }

        setClassSubjectsMap(map);
        setIsManagingSubjects(true);
    };

    const handleToggleSubject = (subjectId: number) => {
        setClassSubjectsMap((prev) => {
            const next = { ...prev };
            if (subjectId in next) {
                delete next[subjectId]; // Uncheck
            } else {
                next[subjectId] = ''; // Check (no teacher initially)
            }
            return next;
        });
    };

    const handleSubjectTeacherChange = (subjectId: number, teacherId: string) => {
        setClassSubjectsMap((prev) => ({
            ...prev,
            [subjectId]: teacherId
        }));
    };

    const handleSaveSubjects = async () => {
        if (!user?.schoolId || !editingSubjectClassId) return;

        try {
            const { eduDb } = await import('../../eduDb');
            const classId = editingSubjectClassId;

            // Resolve the class cloud UUID
            const localClass = await eduDb.classes.get(classId);
            const classCloudId = (localClass as any)?.idCloud;
            if (!classCloudId) {
                showToast('Class has not synced to the cloud yet.', 'error');
                return;
            }

            // Fetch ALL existing assignments including softly-deleted ones for resurrection
            const existingAssignments = await eduDb.classSubjects.where({ classId }).toArray();
            const existingMap = new Map(existingAssignments.map(a => [a.subjectId, a]));
            const currentSubjectIds = Object.keys(classSubjectsMap).map(Number);

            // 1. Process selected subjects (Adds / Updates) ── Upsert-first approach
            for (const subId of currentSubjectIds) {
                const newTeacherUuid = classSubjectsMap[subId] || null;

                // Resolve subject cloud UUID
                const localSubject = await eduDb.subjects.get(subId);
                const subjectCloudId = (localSubject as any)?.idCloud;
                if (!subjectCloudId) {
                    showToast(`Subject "${localSubject?.name}" is not synced yet. Skipping.`, 'error');
                    continue;
                }

                // ── Cloud: select ALL rows (incl. soft-deleted) then act ──────────────
                // Supabase upsert(onConflict) can't target partial indexes (WHERE is_deleted=false),
                // so we must select first, then UPDATE existing or INSERT new.
                const { data: foundList } = await supabase
                    .from('class_subjects')
                    .select('id, is_deleted')
                    .eq('class_id', classCloudId)
                    .eq('subject_id', subjectCloudId)
                    .limit(1);

                const found = foundList?.[0];
                let cloudId: string;

                if (found?.id) {
                    // Row exists (active or soft-deleted) — UPDATE it
                    const { error: updErr } = await supabase
                        .from('class_subjects')
                        .update({ teacher_id: newTeacherUuid, is_deleted: false })
                        .eq('id', found.id);
                    if (updErr) throw new Error(updErr.message);
                    cloudId = found.id;
                } else {
                    // Truly new — INSERT
                    const { data: ins, error: insErr } = await supabase
                        .from('class_subjects')
                        .insert({
                            school_id: user.schoolId,
                            class_id: classCloudId,
                            subject_id: subjectCloudId,
                            teacher_id: newTeacherUuid,
                            is_deleted: false
                        })
                        .select('id')
                        .single();
                    if (insErr) throw new Error(insErr.message);
                    cloudId = ins.id;
                }

                // ── Mirror to IndexedDB ────────────────────────────────────────────────
                const existing = existingMap.get(subId);
                if (existing) {
                    await eduDb.classSubjects.update(existing.id!, {
                        idCloud: cloudId,
                        isDeleted: false,
                        teacherId: newTeacherUuid ?? undefined,
                        syncStatus: 'synced'
                    } as any);
                } else {
                    // Check again in case another path added it
                    const existing2 = await eduDb.classSubjects
                        .where({ classId, subjectId: subId })
                        .first();

                    if (existing2) {
                        await eduDb.classSubjects.update(existing2.id!, {
                            idCloud: cloudId,
                            isDeleted: false,
                            teacherId: newTeacherUuid ?? undefined,
                            syncStatus: 'synced'
                        } as any);
                    } else {
                        await eduDb.classSubjects.add({
                            idCloud: cloudId,
                            schoolId: user.schoolId,
                            classId,
                            subjectId: subId,
                            teacherId: newTeacherUuid ?? undefined,
                            isDeleted: false,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            syncStatus: 'synced'
                        } as any);
                    }
                }
            }

            // 2. Process unchecked subjects (Soft Delete) ── Online First
            for (const existing of existingAssignments) {
                if (!currentSubjectIds.includes(existing.subjectId)) {
                    const existingCloudId = (existing as any).idCloud;
                    if (existingCloudId) {
                        const { error } = await supabase
                            .from('class_subjects')
                            .update({ is_deleted: true })
                            .eq('id', existingCloudId);
                        if (error) throw new Error(error.message);
                    }
                    await dbService.classSubjects.softDelete(existing.id!);
                }
            }

            setIsManagingSubjects(false);
            setEditingSubjectClassId(null);
            showToast('Subjects updated successfully!', 'success');
        } catch (error: any) {
            console.error('Failed to save subjects', error);
            showToast(error.message || 'Failed to save subjects', 'error');
        }
    };


    const handleDeleteClass = async (classId: number, className: string) => {
        if (!user?.schoolId) return;

        const resultsCount = await dbService.results.getByClass(user.schoolId, classId);
        if (resultsCount.length > 0) {
            showToast('This class has academic records and cannot be deleted.', 'error');
            return;
        }

        const studentCount = await dbService.students.getByClass(user.schoolId, classId);
        if (studentCount.length > 0) {
            showToast('This class has students and cannot be deleted.', 'error');
            return;
        }

        const confirmed = await showConfirm({
            title: 'Delete Class',
            message: `Are you sure you want to delete ${className}?`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'danger',
        });

        if (!confirmed) return;

        try {
            await dbService.classes.softDelete(classId);

            if (selectedClassId === classId) {
                setSelectedClassId(null);
                setIsViewingRoster(false);
                setSelectedStudentsForPromotion([]);
            }

            showToast('Class deleted successfully', 'info');
        } catch (error) {
            console.error('Failed to delete class', error);
            showToast('Failed to delete class', 'error');
        }
    };

    const handleCreateClass = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.schoolId) return;

        try {
            const trimmedName = newClass.name.trim();

            if (!trimmedName) {
                showToast('Class Name is required', 'error');
                return;
            }

            // Local pre-check to prevent duplicate conflict
            const isDuplicate = classes?.some(
                c => c.name.toLowerCase() === trimmedName.toLowerCase() && 
                     c.level === newClass.level && 
                     !c.isDeleted
            );
            
            if (isDuplicate) {
                showToast(`A class named "${trimmedName}" at level "${newClass.level}" already exists.`, 'error');
                return;
            }

            const supabasePayload = {
                school_id: user.schoolId,
                name: trimmedName,
                level: newClass.level,
                class_teacher_id: newClass.teacherId || null,
                teaching_mode: newClass.teachingMode,
                is_deleted: false
            };

            // Online Supabase Insert FIRST
            const { data, error } = await supabase
                .from('classes')
                .insert(supabasePayload)
                .select('id')
                .single();

            if (error) {
                if (error.code === '23505' || error.message?.includes('unique_active_class_name_level')) {
                    throw new Error(`A class named "${supabasePayload.name}" at level "${supabasePayload.level}" already exists.`);
                }
                throw new Error(`Cloud Sync Error: ${error.message}`);
            }

            // Mirror to IndexedDB cache
            await dbService.classes.add({
                schoolId: user.schoolId,
                idCloud: data.id, // Canonical Cloud Identity
                name: trimmedName,
                level: newClass.level,
                classTeacherId: newClass.teacherId || undefined,
                teachingMode: newClass.teachingMode,
                isDeleted: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'synced'
            });

            showToast('Class created successfully!', 'success');
            setIsCreating(false);
            setNewClass({ name: '', level: 'Basic 1', teacherId: '', teachingMode: 'class_teacher' });
        } catch (error: any) {
            console.error('Failed to create class', error);
            showToast(error.message || 'Failed to create class', 'error');
        }
    };

    const handlePromoteStudents = async () => {
        if (!promotionTargetClassId || selectedStudentsForPromotion.length === 0) return;

        const targetClass = classes?.find(c => c.id === promotionTargetClassId);

        const confirm = await showPromotionDialog({
            title: "Confirm Manual Move",
            message: `Are you sure you want to move ${selectedStudentsForPromotion.length} students to ${targetClass?.name || 'the target class'}?`,
            variant: 'promote',
            confirmText: "Move Now",
            cancelText: "Cancel"
        });

        if (!confirm.confirmed) return;

        try {
            await dbService.students.bulkUpdate(
                selectedStudentsForPromotion.map((id) => ({
                    key: id,
                    changes: { classId: promotionTargetClassId }
                }))
            );

            setIsPromoting(false);
            setSelectedStudentsForPromotion([]);
            setPromotionTargetClassId(null);
            showToast('Students moved successfully!', 'success');
        } catch (e) {
            console.error('Failed to promote', e);
            showToast('Failed to move students', 'error');
        }
    };

    const levels = ['Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'Basic 7', 'Basic 8', 'Basic 9'];

    return (
        <div className="mt-4 sm:mt-8 space-y-6 sm:space-y-8">
            <div className="flex flex-wrap gap-3 justify-between items-center">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <i className="fas fa-chalkboard text-primary"></i> Class Management
                </h2>
                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="px-4 sm:px-6 py-2 bg-primary text-white rounded-xl font-bold hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 flex items-center gap-2 text-sm sm:text-base"
                >
                    <i className={`fas ${isCreating ? 'fa-times' : 'fa-plus'}`}></i>
                    {isCreating ? 'Cancel' : 'New Class'}
                </button>
            </div>

            {isCreating && (
                <form onSubmit={handleCreateClass} className="premium-card p-5 sm:p-8 animate-slideDown">
                    <h3 className="text-lg font-bold text-gray-700 mb-5">Create New Class</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-gray-700">Class Name</label>
                            <input
                                type="text"
                                value={newClass.name}
                                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                                required
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="e.g. Basic 1A"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-gray-700">Level</label>
                            <select
                                value={newClass.level}
                                onChange={(e) => setNewClass({ ...newClass, level: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                {levels.map((l) => (
                                    <option key={l} value={l}>{l}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-gray-700">Teaching Mode</label>
                            <select
                                value={newClass.teachingMode}
                                onChange={(e) => setNewClass({ ...newClass, teachingMode: e.target.value as 'class_teacher' | 'subject_teacher' })}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value="class_teacher">Class Teacher Based</option>
                                <option value="subject_teacher">Subject Teaching</option>
                            </select>
                        </div>

                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                            <label className="text-sm font-bold text-gray-700">Class Teacher (Optional)</label>
                            <select
                                value={newClass.teacherId}
                                onChange={(e) => setNewClass({ ...newClass, teacherId: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value="">Select Teacher...</option>
                                {teachers?.map((t: any) => (
                                    <option key={t.id} value={t.idCloud || ''} disabled={!t.idCloud}>
                                        {t.fullName}{!t.idCloud ? ' (Not Synced)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button
                            type="submit"
                            className="px-6 sm:px-8 py-3 bg-primary text-white rounded-xl font-bold hover:bg-blue-600 transition-all shadow-md"
                        >
                            <i className="fas fa-save mr-2"></i>Save Class
                        </button>
                    </div>
                </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {classes?.map((cls) => (
                    <div key={cls.id} className="premium-card p-5 sm:p-6 relative group">
                        <button
                            onClick={() => handleDeleteClass(cls.id!, cls.name)}
                            className="absolute top-4 right-14 w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center transition-all hover:bg-red-100 sm:opacity-0 sm:group-hover:opacity-100 opacity-100"
                            title="Delete Class"
                        >
                            <i className="fas fa-trash-alt text-sm"></i>
                        </button>

                        <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 min-w-0 pr-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-black text-primary bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">
                                        {cls.level}
                                    </span>
                                    <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                                        cls.teachingMode === 'subject_teacher'
                                            ? 'bg-indigo-50 text-indigo-600'
                                            : 'bg-green-50 text-green-600'
                                    }`}>
                                        {cls.teachingMode === 'subject_teacher' ? 'Subject Teaching' : 'Class Teacher'}
                                    </span>
                                </div>
                                {editingClassNameId === cls.id ? (
                                    <div className="flex items-center gap-2 mt-3">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={editingClassNameValue}
                                            onChange={(e) => setEditingClassNameValue(e.target.value)}
                                            onBlur={() => handleSaveClassName(cls.id!)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveClassName(cls.id!);
                                                if (e.key === 'Escape') setEditingClassNameId(null);
                                            }}
                                            className="w-full px-2 py-1 rounded bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary text-xl font-black text-gray-800"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 mt-3 group/name">
                                        <h3 className="text-xl sm:text-2xl font-black text-gray-800 truncate">
                                            {cls.name}
                                        </h3>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingClassNameId(cls.id!);
                                                setEditingClassNameValue(cls.name);
                                            }}
                                            className="w-6 h-6 rounded-md hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors flex items-center justify-center sm:opacity-0 group-hover/name:opacity-100 opacity-100 shrink-0"
                                            title="Edit Class Name"
                                        >
                                            <i className="fas fa-pen text-xs"></i>
                                        </button>
                                    </div>
                                )}

                                <div className="mt-3">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                        <i className="fas fa-chalkboard-teacher text-indigo-400"></i> Class Teacher
                                    </p>
                                    <div className="relative">
                                        <select
                                            value={cls.classTeacherId || ''}
                                            onChange={(e) => handleUpdateTeacher(cls.id!, e.target.value)}
                                            className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl bg-indigo-50 border border-indigo-100 text-sm font-bold text-indigo-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300 hover:bg-indigo-100 transition-colors truncate"
                                        >
                                            <option value="">— Unassigned —</option>
                                            {teachers?.map((t: any) => (
                                                <option key={t.id} value={t.idCloud || ''} disabled={!t.idCloud}>
                                                    {t.fullName}{!t.idCloud ? ' (Not Synced)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                                            <i className="fas fa-chevron-down text-[10px] text-indigo-400"></i>
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                                    <button
                                        onClick={() => handleOpenSubjects(cls.id!)}
                                        className="text-xs font-bold text-primary hover:text-blue-600 transition-colors flex items-center gap-1.5"
                                    >
                                        <i className="fas fa-book-open"></i> Manage Subjects
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    if (selectedClassId === cls.id && isViewingRoster) {
                                        setIsViewingRoster(false);
                                        setSelectedClassId(null);
                                        setSelectedStudentsForPromotion([]);
                                    } else {
                                        setSelectedClassId(cls.id!);
                                        setSelectedStudentsForPromotion([]);
                                        setIsViewingRoster(true);
                                    }
                                }}
                                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all ${selectedClassId === cls.id && isViewingRoster
                                    ? 'bg-primary text-white shadow-lg shadow-blue-200'
                                    : 'bg-gray-50 text-gray-400 hover:bg-primary hover:text-white'
                                    }`}
                            >
                                <i className="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                ))}

                {classes?.length === 0 && !isCreating && (
                    <div className="col-span-full p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <i className="fas fa-chalkboard text-4xl text-gray-300 mb-3"></i>
                        <p className="text-gray-500 font-medium">
                            No classes found. Create your first class to get started.
                        </p>
                        <button
                            onClick={() => setIsCreating(true)}
                            className="mt-4 px-6 py-2 bg-white text-primary rounded-xl font-bold shadow-sm border border-gray-100 hover:bg-gray-50 transition-all"
                        >
                            Create Class
                        </button>
                    </div>
                )}
            </div>

            {isViewingRoster && selectedClassId && (
                <div className="fixed inset-0 bg-black/40 z-[var(--z-modal-backdrop)] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-scaleIn relative z-[var(--z-modal)] flex flex-col max-h-[92vh] sm:max-h-[88vh]">
                        <div className="bg-gray-50/50 px-5 sm:px-8 py-5 sm:py-8 border-b border-gray-100 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl sm:text-2xl font-black text-gray-800 tracking-tight">
                                    {classes?.find((c) => c.id === selectedClassId)?.name}
                                </h3>
                                <p className="text-sm text-gray-400 font-medium mt-1">Manage students and promotions</p>
                            </div>
                            <button
                                onClick={() => {
                                    setSelectedClassId(null);
                                    setIsViewingRoster(false);
                                    setSelectedStudentsForPromotion([]);
                                }}
                                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 hover:rotate-90 transition-all border border-gray-100"
                            >
                                <i className="fas fa-times text-lg sm:text-xl"></i>
                            </button>
                        </div>

                        <div className="px-5 sm:px-8 py-4 flex flex-wrap gap-3 justify-between items-center border-b border-gray-50 shrink-0">
                            <h4 className="text-base sm:text-lg font-bold text-gray-800">
                                Student Roster <span className="text-gray-400 font-normal">({studentsInClass?.length || 0})</span>
                            </h4>
                            <button
                                onClick={() => setIsPromoting(true)}
                                disabled={!selectedStudentsForPromotion.length}
                                className="px-4 sm:px-6 py-2.5 sm:py-3 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 shadow-lg shadow-purple-100 flex items-center gap-2 transition-all"
                            >
                                <i className="fas fa-exchange-alt"></i>
                                <span>
                                    Move {selectedStudentsForPromotion.length > 0 ? `(${selectedStudentsForPromotion.length})` : 'Selected'}
                                </span>
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left min-w-[400px]">
                                    <thead className="bg-gray-50/80 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 sm:px-6 py-4 w-12 text-center">
                                                <input
                                                    type="checkbox"
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedStudentsForPromotion(studentsInClass?.map((s) => s.id!) || []);
                                                        } else {
                                                            setSelectedStudentsForPromotion([]);
                                                        }
                                                    }}
                                                    checked={
                                                        (studentsInClass?.length || 0) > 0 &&
                                                        selectedStudentsForPromotion.length === studentsInClass?.length
                                                    }
                                                    className="w-5 h-5 rounded text-primary focus:ring-primary border-gray-300 transition-all"
                                                />
                                            </th>
                                            <th className="px-4 sm:px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                                            <th className="px-4 sm:px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">ID</th>
                                            <th className="px-4 sm:px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Gender</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {studentsInClass?.map((student) => (
                                            <tr key={student.id} className="hover:bg-blue-50/30 transition-colors group/row">
                                                <td className="px-4 sm:px-6 py-3 sm:py-4 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedStudentsForPromotion.includes(student.id!)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedStudentsForPromotion((prev) => [...prev, student.id!]);
                                                            } else {
                                                                setSelectedStudentsForPromotion((prev) =>
                                                                    prev.filter((id) => id !== student.id)
                                                                );
                                                            }
                                                        }}
                                                        className="w-5 h-5 rounded text-primary focus:ring-primary border-gray-300"
                                                    />
                                                </td>
                                                <td className="px-4 sm:px-6 py-3 sm:py-4">
                                                    <div className="font-bold text-gray-700 group-hover/row:text-primary transition-colors text-sm sm:text-base">
                                                        {student.fullName}
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-3 sm:py-4 text-center">
                                                    <span className="bg-gray-50 text-gray-500 px-2 sm:px-3 py-1 rounded-lg font-mono text-xs">
                                                        {student.studentIdString || '-'}
                                                    </span>
                                                </td>
                                                <td className="px-4 sm:px-6 py-3 sm:py-4 text-center">
                                                    <span
                                                        className={`inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${student.gender === 'male'
                                                            ? 'bg-blue-50 text-blue-500'
                                                            : 'bg-pink-50 text-pink-500'
                                                            }`}
                                                    >
                                                        {student.gender || '-'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}

                                        {studentsInClass?.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-16 text-center text-gray-400 italic font-medium">
                                                    No students in this class.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isPromoting && (
                <div className="fixed inset-0 bg-black/40 z-[var(--z-modal-backdrop)] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn z-[var(--z-modal)]">
                        <div className="p-5 sm:p-8 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-xl font-black text-gray-800">Move Students</h3>
                            <p className="text-sm text-gray-400 mt-1">
                                Moving {selectedStudentsForPromotion.length} selected students.
                            </p>
                        </div>

                        <div className="p-5 sm:p-8">
                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                                Select Target Class
                            </label>
                            <select
                                className="w-full px-4 py-4 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary font-bold text-gray-700"
                                onChange={(e) => setPromotionTargetClassId(Number(e.target.value))}
                                value={promotionTargetClassId || ''}
                            >
                                <option value="">Select target...</option>
                                {classes?.filter((c) => c.id !== selectedClassId).map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="p-5 sm:p-8 bg-gray-50/50 border-t border-gray-100 flex gap-3">
                            <button
                                onClick={() => setIsPromoting(false)}
                                className="flex-1 sm:flex-none px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePromoteStudents}
                                disabled={!promotionTargetClassId}
                                className="flex-1 sm:flex-none px-8 py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg hover:bg-purple-700 transition-all disabled:opacity-50"
                            >
                                Confirm Move
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isManagingSubjects && editingSubjectClassId && (
                <div className="fixed inset-0 bg-black/40 z-[var(--z-modal-backdrop)] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleIn z-[var(--z-modal)] flex flex-col max-h-[92vh] sm:max-h-[85vh]">
                        <div className="bg-gray-50/50 px-5 sm:px-8 py-5 sm:py-6 border-b border-gray-100 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl sm:text-2xl font-black text-gray-800 tracking-tight">
                                    Manage Subjects
                                </h3>
                                <p className="text-sm text-gray-400 font-medium mt-1">
                                    Assign subjects and subject teachers to {classes?.find(c => c.id === editingSubjectClassId)?.name}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsManagingSubjects(false);
                                    setEditingSubjectClassId(null);
                                    setClassSubjectsMap({});
                                }}
                                className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 transition-all border border-gray-100 shrink-0"
                            >
                                <i className="fas fa-times text-lg"></i>
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 bg-gray-50/30 p-5 sm:p-8">
                            <div className="space-y-3">
                                {subjects?.length === 0 ? (
                                    <div className="text-center py-10">
                                        <i className="fas fa-book-open text-3xl text-gray-300 mb-3"></i>
                                        <p className="text-gray-500 font-medium">No subjects available. Please create subjects first.</p>
                                    </div>
                                ) : (
                                    subjects?.map((subject) => {
                                        const isAssigned = subject.id! in classSubjectsMap;
                                        return (
                                            <div key={subject.id} className={`flex flex-col sm:flex-row gap-4 p-4 rounded-xl border transition-all ${isAssigned ? 'bg-white border-primary shadow-sm ring-1 ring-primary/20' : 'bg-transparent border-gray-200 hover:border-gray-300'}`}>
                                                <div className="flex items-center gap-4 flex-1">
                                                    <input
                                                        type="checkbox"
                                                        id={`subject-${subject.id}`}
                                                        checked={isAssigned}
                                                        onChange={() => handleToggleSubject(subject.id!)}
                                                        className="w-5 h-5 rounded text-primary focus:ring-primary border-gray-300 cursor-pointer"
                                                    />
                                                    <label htmlFor={`subject-${subject.id}`} className="cursor-pointer select-none">
                                                        <span className="block font-bold text-gray-800">{subject.name}</span>
                                                        {subject.code && <span className="text-xs text-gray-500 font-mono mt-0.5 block">{subject.code}</span>}
                                                    </label>
                                                </div>

                                                {isAssigned && (
                                                    <div className="flex-1 sm:max-w-xs animate-fadeIn text-sm">
                                                        <select
                                                            value={classSubjectsMap[subject.id!] || ''}
                                                            onChange={(e) => handleSubjectTeacherChange(subject.id!, e.target.value)}
                                                            className="w-full pl-3 pr-8 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium focus:outline-none focus:ring-2 focus:ring-primary hover:bg-indigo-100 transition-colors"
                                                        >
                                                            <option value="">— Unassigned Teacher —</option>
                                                            {teachers?.map((t: any) => (
                                                                <option key={t.id} value={t.idCloud || ''} disabled={!t.idCloud}>
                                                                    {t.fullName}{!t.idCloud ? ' ⚠ Not Synced' : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="p-5 sm:p-8 bg-white border-t border-gray-100 flex justify-end gap-3 shrink-0">
                            <button
                                onClick={() => {
                                    setIsManagingSubjects(false);
                                    setEditingSubjectClassId(null);
                                    setClassSubjectsMap({});
                                }}
                                className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveSubjects}
                                className="px-8 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-600 transition-all flex items-center gap-2"
                            >
                                <i className="fas fa-check"></i> Save Subjects
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClassManagement;
