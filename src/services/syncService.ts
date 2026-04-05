import { supabase } from '../supabaseClient';
import { db } from '../db';
import { eduDb } from '../eduDb';
import { dbService } from './dbService';
import { storageService } from './storageService';

type SyncResult = {
    success: boolean;
    synced?: number;
    pending?: number;
    error?: string | null;
};

export const syncService = {
    lastError: null as string | null,
    _syncLock: false,
    _pullLock: false,

    async isOnline() {
        return window.navigator.onLine;
    },

    toIso(value?: number | null) {
        if (!value) return null;
        try {
            return new Date(value).toISOString();
        } catch {
            return null;
        }
    },

    async syncAll(schoolId: string): Promise<SyncResult> {
        if (!(await this.isOnline())) {
            this.lastError = 'No internet connection.';
            return { success: false, pending: 0, error: this.lastError };
        }

        if (this._syncLock) return { success: false, pending: 0, error: 'Sync in progress' };
        this._syncLock = true;
        this.lastError = null;
        let totalSynced = 0;

        try {
            console.log('[syncService] Starting sync...');

            // Custom sync for normalized class system
            // Results-related sync respects relational order
            // 1. Establish Identities First (Required for UUID resolution)
            totalSynced += await this.syncEntity(schoolId, db.schools, 'schools', 'schoolId');
            totalSynced += await this.syncEntity(schoolId, db.users, 'staff_profiles', 'id');

            // 2. Academic Core
            totalSynced += await this.syncAssessmentConfigs(schoolId);
            totalSynced += await this.syncSubjects(schoolId);
            totalSynced += await this.syncClasses(schoolId);
            totalSynced += await this.syncStudents(schoolId);
            totalSynced += await this.syncClassSubjects(schoolId);

            // 3. Activity & Financials (Dependent on Identities)
            totalSynced += await this.syncComponentScores(schoolId);
            totalSynced += await this.syncResults(schoolId);
            totalSynced += await this.syncAttendance(schoolId);
            totalSynced += await this.syncFeeStructures(schoolId);
            totalSynced += await this.syncPayrollRecords(schoolId);

            // 4. Remaining Simpler Tables
            totalSynced += await this.syncEntity(schoolId, eduDb.feePayments, 'fee_payments', 'id');
            totalSynced += await this.syncEntity(schoolId, eduDb.expenses, 'expenses', 'id');
            totalSynced += await this.syncEntity(schoolId, eduDb.budgets, 'budgets', 'id');
            totalSynced += await this.syncEntity(schoolId, eduDb.settings, 'settings', 'key');
            totalSynced += await this.syncPromotionRequests(schoolId);
            totalSynced += await this.syncEntity(schoolId, eduDb.graduateRecords, 'graduate_records', 'id');

            console.log('[syncService] Sync completed.');

            // Mark the school's last_sync_at timestamp
            await supabase.rpc('update_school_sync_time', { p_school_id: schoolId });

            // 5. Broadcast to notify other portals to pull the latest changes
            if (totalSynced > 0) {
                console.log(`[syncService] syncAll finished. Total entities pushed: ${totalSynced}`);
            }

            // BI-DIRECTIONAL SYNC: After pushing local changes, pull any new data from the cloud
            // This ensures heartbeats and broadcasts keep the local device up-to-date.
            await this.pullAll(schoolId);

            // 5. Broadcast to notify other portals to pull the latest changes
            // Only broadcast if we actually pushed something (changed the cloud state)
            if (totalSynced > 0) {
                await this.broadcastSyncNeeded(schoolId);
            }

            return { success: true, synced: totalSynced, error: null };
        } catch (error: any) {
            this.lastError = error?.message || 'Synchronization failed';
            return { success: false, synced: 0, error: this.lastError };
        } finally {
            this._syncLock = false;
        }
    },

    async broadcastSyncNeeded(schoolId: string) {
        try {
            const user = (await supabase.auth.getUser()).data.user;
            await supabase.channel(`school_sync_${schoolId}`).send({
                type: 'broadcast',
                event: 'sync_needed',
                payload: { sender: user?.id }
            });
            console.log('[syncService] Realtime sync broadcast sent.');
        } catch (broadcastErr) {
            console.warn('[syncService] Realtime broadcast failed:', broadcastErr);
        }
    },


    async pullAll(schoolId: string): Promise<SyncResult> {
        if (!(await this.isOnline())) return { success: false, error: 'Offline' };
        
        if (this._pullLock) return { success: false, error: 'Pull in progress' };
        this._pullLock = true;

        try {
            console.log('[syncService] Starting cloud pull...');

            await this.pullEntity(schoolId, db.schools, 'schools');
            await this.pullEntity(schoolId, db.users, 'staff_profiles');

            await this.pullEntity(schoolId, eduDb.assessmentConfigs, 'assessment_configs');
            const subjectsResult = await this.pullEntity(schoolId, eduDb.subjects, 'subjects');
            const classesResult = await this.pullEntity(schoolId, eduDb.classes, 'classes');
            
            // CRITICAL: If classes or subjects pull failed, students/results cannot be reliably mapped.
            // We should stop here and retry later to avoid orphaning records.
            if (!classesResult.success || !subjectsResult.success) {
                console.warn('[syncService] Dependency pull (classes/subjects) failed. Skipping dependent entities to avoid orphaning.');
                this._pullLock = false;
                return { success: false, error: 'Dependency pull failed' };
            }

            await this.pullEntity(schoolId, eduDb.students, 'students');
            await this.pullEntity(schoolId, eduDb.classSubjects, 'class_subjects');
            await this.pullEntity(schoolId, eduDb.results, 'results');
            await this.pullEntity(schoolId, eduDb.attendance, 'attendance');
            await this.pullEntity(schoolId, eduDb.componentScores as any, 'component_scores');
            await this.pullEntity(schoolId, eduDb.promotionRequests, 'promotion_requests');

            // HEAL: Attempt to resolve any orphaned IDs from previously failed mappings
            await this.healOrphanedEntities(schoolId);

            await this.pullEntity(schoolId, eduDb.feeStructures, 'fee_structures');
            await this.pullEntity(schoolId, eduDb.feePayments, 'fee_payments');
            await this.pullEntity(schoolId, eduDb.payrollRecords, 'payroll_records');
            await this.pullEntity(schoolId, eduDb.expenses, 'expenses');
            await this.pullEntity(schoolId, eduDb.budgets, 'budgets');
            await this.pullEntity(schoolId, eduDb.subscriptions, 'school_subscriptions');

            await this.pullEntity(schoolId, eduDb.settings, 'settings');
            await this.pullEntity(schoolId, eduDb.promotionRequests, 'promotion_requests');
            await this.pullEntity(schoolId, eduDb.graduateRecords, 'graduate_records');

            // Cleanup duplicate settings to prevent stale reads
            try {
                const allSettings = await eduDb.settings.where('schoolId').equals(schoolId).toArray();
                const keys = new Set();
                for (let i = allSettings.length - 1; i >= 0; i--) {
                    const s = allSettings[i];
                    if (keys.has(s.key)) {
                        await eduDb.settings.delete(s.id!);
                    } else {
                        keys.add(s.key);
                    }
                }
            } catch (e) {
                console.error('[syncService] Settings deduplication failed:', e);
            }

            console.log('[syncService] Pull completed.');

            // Mark the school's last_sync_at timestamp
            await supabase.rpc('update_school_sync_time', { p_school_id: schoolId });

            return { success: true };
        } catch (error: any) {
            return { success: false, error: 'Cloud data retrieval failed.' };
        } finally {
            this._pullLock = false;
        }
    },

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────
    async resolveCloudId(table: any, localId: number | string | undefined): Promise<string | null> {
        if (!localId) return null;
        if (typeof localId === 'string' && localId.length > 20) return localId; // Likely already a UUID

        const record = await table.get(Number(localId));
        return (record as any)?.idCloud ?? null;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: subjects
    // ─────────────────────────────────────────────────────────────
    async syncSubjects(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.subjects
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                const payload = {
                    school_id: item.schoolId,
                    name: item.name,
                    code: item.code ?? null,
                    category: item.category ?? 'General',
                    is_deleted: item.isDeleted ?? false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                let cloudId = (item as any).idCloud;

                if (cloudId) {
                    const { error } = await supabase
                        .from('subjects')
                        .update(payload)
                        .eq('id', cloudId);
                    if (error) throw error;
                } else {
                    const { data, error } = await supabase
                        .from('subjects')
                        .insert(payload)
                        .select('id')
                        .single();
                    if (error) throw error;
                    cloudId = data.id;
                }

                await eduDb.subjects.update(item.id!, {
                    idCloud: cloudId,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                } as any);

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] Subject sync failed:', error);
                this.lastError = error?.message || 'Subject sync failed';
                await eduDb.subjects.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                } as any);
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: classes
    // ─────────────────────────────────────────────────────────────
    async syncClasses(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.classes
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                const teacherCloudId = await this.resolveCloudId(db.users, item.classTeacherId);

                const payload = {
                    school_id: item.schoolId,
                    name: item.name,
                    level: item.level,
                    class_teacher_id: teacherCloudId,
                    teaching_mode: item.teachingMode || 'class_teacher',
                    is_deleted: item.isDeleted ?? false,
                    deleted_at: this.toIso(item.deletedAt),
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                let cloudId = (item as any).idCloud;

                if (cloudId) {
                    const { error } = await supabase
                        .from('classes')
                        .update(payload)
                        .eq('id', cloudId);
                    if (error) throw error;
                } else {
                    const { data, error } = await supabase
                        .from('classes')
                        .insert(payload)
                        .select('id')
                        .single();
                    if (error) throw error;
                    cloudId = data.id;
                }

                await eduDb.classes.update(item.id!, {
                    idCloud: cloudId,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                } as any);

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] Class sync failed:', error);
                this.lastError = error?.message || 'Class sync failed';
                await eduDb.classes.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                } as any);
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: class_subjects
    // ─────────────────────────────────────────────────────────────
    async syncClassSubjects(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.classSubjects
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                const localClass = await eduDb.classes.get(item.classId);
                const localSubject = await eduDb.subjects.get(item.subjectId);

                const classCloudId = (localClass as any)?.idCloud;
                const subjectCloudId = (localSubject as any)?.idCloud;

                // Parent records must exist in cloud first
                if (!classCloudId || !subjectCloudId) {
                    continue;
                }

                const teacherCloudId = await this.resolveCloudId(db.users, item.teacherId);

                const payload = {
                    school_id: item.schoolId,
                    class_id: classCloudId,
                    subject_id: subjectCloudId,
                    teacher_id: teacherCloudId,
                    is_deleted: item.isDeleted ?? false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                let cloudId = (item as any).idCloud;

                if (cloudId) {
                    const { error } = await supabase
                        .from('class_subjects')
                        .update(payload)
                        .eq('id', cloudId)
                        .select('id')
                        .single();

                    if (error) throw error;
                } else {
                    const { data, error } = await supabase
                        .from('class_subjects')
                        .insert(payload)
                        .select('id')
                        .single();

                    if (error) throw error;

                    cloudId = data.id;
                }

                await eduDb.classSubjects.update(item.id!, {
                    idCloud: cloudId,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                } as any);

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] ClassSubject sync failed:', error);
                this.lastError = error?.message || 'ClassSubject sync failed';
                await eduDb.classSubjects.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                } as any);
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: students
    // ─────────────────────────────────────────────────────────────
    async syncStudents(schoolId: string): Promise<number> {
        // Read pending items
        const pendingItems = await eduDb.students
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                // If it's deleted locally but we haven't synced it, we'll push the soft delete
                let classCloudId: string | null = null;

                if (item.classId !== undefined && item.classId !== null) {
                    const localClass = await eduDb.classes.get(item.classId);
                    classCloudId = (localClass as any)?.idCloud ?? null;

                    // If local class exists but hasn't synced to cloud, skip student for now
                    if (!classCloudId) {
                        continue;
                    }
                }

                const payload: any = this.mapStudentForSync(item, schoolId, classCloudId);
                
                // Handle photo uploading manually because strict mapper omits Blobs
                if (item.photo instanceof Blob) {
                    const filename = `${item.studentIdString || item.idCloud || item.id || Date.now()}.png`;
                    const result = await storageService.uploadAsset(schoolId, 'students', filename, item.photo);
                    if (result && result.path) {
                        payload.photo_url = result.path;
                    } else {
                        payload.photo_url = await this.blobToBase64(item.photo);
                    }
                }

                if (!this.isUuid(payload.school_id)) {
                    console.error(`[syncService] Invalid UUID format in student payload. school_id: ${payload.school_id}`, item);
                    await eduDb.students.update(item.id!, {
                        syncStatus: 'pending',
                        syncError: 'Invalid UUID format for school_id.',
                        updatedAt: Date.now()
                    } as any);
                    continue;
                }

                console.log('[sync] table: students', payload);

                // Upsert to Supabase
                // Resolves insert vs update automatically, relies on unique `school_id, student_id_string`
                const { data, error } = await supabase
                    .from('students')
                    .upsert(payload, { onConflict: 'school_id,student_id_string' })
                    .select('id')
                    .single();

                if (error) {
                    throw error;
                }

                // Mark local as synced
                await eduDb.students.update(item.id!, {
                    idCloud: data.id,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                } as any);

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] Student sync failed:', error);
                this.lastError = error?.message || 'Student sync failed';

                // Do not stop the whole loop; keep status pending so we can retry on next offline-online boundary or mark as failed
                await eduDb.students.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                } as any);
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: results
    // ─────────────────────────────────────────────────────────────
    async syncResults(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.results
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                // Resolve Cloud UUIDs before push
                const classCloudId = await this.resolveCloudId(eduDb.classes, item.classId);
                const subjectCloudId = await this.resolveCloudId(eduDb.subjects, item.subjectId);
                const studentCloudId = await this.resolveCloudId(eduDb.students, item.studentId);
                const classSubjectCloudId = await this.resolveCloudId(eduDb.classSubjects, item.classSubjectId);

                // Skip if any required UUID is missing (parent not synced yet)
                if (!classCloudId || !subjectCloudId || !studentCloudId || !classSubjectCloudId) {
                    console.log(`[syncService] Skipping result ${item.id} - missing dependencies`);
                    continue;
                }

                const enteredByCloudId = await this.resolveCloudId(db.users, item.enteredBy);
                const approvedByCloudId = await this.resolveCloudId(db.users, item.approvedBy);

                const payload = {
                    school_id: item.schoolId,
                    student_id: studentCloudId,
                    subject_id: subjectCloudId,
                    class_id: classCloudId,
                    class_subject_id: classSubjectCloudId,
                    year: item.year,
                    term: item.term,
                    ca_total: item.caTotal ?? 0,
                    exam_score: item.examScore ?? 0,
                    total_score: item.totalScore ?? 0,
                    grade: item.grade ?? null,
                    remarks: item.remarks ?? null,
                    status: item.status ?? 'draft',
                    entered_by: enteredByCloudId,
                    submitted_at: this.toIso(item.submittedAt),
                    approved_by: approvedByCloudId,
                    approved_at: this.toIso(item.approvedAt),
                    locked_at: this.toIso(item.lockedAt),
                    is_deleted: item.isDeleted ?? false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                if (item.idCloud) (payload as any).id = item.idCloud;

                // Upsert with conflict resolution
                const { data, error } = await supabase
                    .from('results')
                    .upsert(payload, { onConflict: 'student_id,class_subject_id,term,year' })
                    .select('id')
                    .single();

                if (error) throw error;

                await eduDb.results.update(item.id!, {
                    idCloud: data.id,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                });

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] Result sync failed:', error);
                this.lastError = error?.message || 'Result sync failed';
                await eduDb.results.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                });
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: componentScores
    // ─────────────────────────────────────────────────────────────
    async syncComponentScores(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.componentScores
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                // Resolve dependencies
                const studentCloudId = await this.resolveCloudId(eduDb.students, item.studentId);
                const classSubjectCloudId = await this.resolveCloudId(eduDb.classSubjects, item.classSubjectId);

                // Skip if not synced yet
                if (!studentCloudId || !classSubjectCloudId) {
                    console.log(`[syncService] Skipping score ${item.id} - missing dependencies`);
                    continue;
                }

                const enteredByCloudId = await this.resolveCloudId(db.users, item.enteredBy);

                const payload = {
                    school_id: item.schoolId,
                    student_id: studentCloudId,
                    class_subject_id: classSubjectCloudId,
                    year: item.year,
                    term: item.term,
                    component_type: item.componentType,
                    component_number: item.componentNumber,
                    score: item.score,
                    entered_by: enteredByCloudId,
                    status: item.status ?? 'draft',
                    is_deleted: item.isDeleted ?? false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                if (item.idCloud) (payload as any).id = item.idCloud;

                // Upsert with composite key
                const { data, error } = await supabase
                    .from('component_scores')
                    .upsert(payload, {
                        onConflict: 'student_id,class_subject_id,year,term,component_type,component_number'
                    })
                    .select('id')
                    .single();

                if (error) throw error;

                await eduDb.componentScores.update(item.id!, {
                    idCloud: data.id,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                });

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] ComponentScore sync failed:', error);
                this.lastError = error?.message || 'ComponentScore sync failed';
                await eduDb.componentScores.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                });
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: promotion_requests
    // ─────────────────────────────────────────────────────────────
    async syncPromotionRequests(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.promotionRequests
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                // Resolve dependencies
                const studentCloudId = await this.resolveCloudId(eduDb.students, item.studentId);
                const fromClassCloudId = await this.resolveCloudId(eduDb.classes, item.fromClassId);
                const toClassCloudId = await this.resolveCloudId(eduDb.classes, item.toClassId);
                
                if (!studentCloudId || !fromClassCloudId || !toClassCloudId) {
                    console.log(`[syncService] Skipping promotion request ${item.id} - missing dependencies`);
                    continue;
                }

                const payload = {
                    school_id: item.schoolId,
                    student_id: studentCloudId,
                    from_class_id: fromClassCloudId,
                    to_class_id: toClassCloudId,
                    requested_by: item.requestedBy,
                    status: item.status,
                    reason: item.reason,
                    review_note: item.reviewNote,
                    is_deleted: item.isDeleted || false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };
                if (item.reviewedBy) (payload as any).reviewed_by = item.reviewedBy;
                if (item.reviewedAt) (payload as any).reviewed_at = this.toIso(item.reviewedAt);

                if (item.idCloud) {
                    (payload as any).id = item.idCloud;
                    const { error } = await supabase.from('promotion_requests').update(payload).eq('id', item.idCloud);
                    if (error) throw error;
                } else {
                    const { data, error } = await supabase.from('promotion_requests').insert(payload).select('id').single();
                    if (error) throw error;
                    item.idCloud = data.id;
                }

                await eduDb.promotionRequests.update(item.id!, {
                    idCloud: item.idCloud,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                });

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] Promotion request sync failed:', error);
                this.lastError = error?.message || 'Promotion request sync failed';
                await eduDb.promotionRequests.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                });
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: assessmentConfigs
    // ─────────────────────────────────────────────────────────────
    async syncAssessmentConfigs(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.assessmentConfigs
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                const payload = {
                    school_id: item.schoolId,
                    year: item.year,
                    term: item.term,
                    num_tests: item.numTests,
                    num_exercises: item.numExercises,
                    num_assignments: item.numAssignments,
                    num_projects: item.numProjects,
                    ca_percentage: item.caPercentage,
                    exam_percentage: item.examPercentage,
                    test_weight: item.testWeight,
                    exercise_weight: item.exerciseWeight,
                    assignment_weight: item.assignmentWeight,
                    project_weight: item.projectWeight,
                    test_max_score: item.testMaxScore,
                    exercise_max_score: item.exerciseMaxScore,
                    assignment_max_score: item.assignmentMaxScore,
                    project_max_score: item.projectMaxScore,
                    exam_max_score: item.examMaxScore,
                    results_locked: item.resultsLocked ?? false,
                    ca_policy: item.caPolicy === 'best_n' ? 'best_n' : (item.caPolicy === 'sum_all' ? 'sum_all' : 'best_n'),
                    best_n_count: item.bestNCount ?? 2,
                    is_deleted: item.isDeleted ?? false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                if (item.idCloud) (payload as any).id = item.idCloud;

                const { data, error } = await supabase
                    .from('assessment_configs')
                    .upsert(payload, { onConflict: 'school_id,year,term' })
                    .select('id')
                    .single();

                if (error) throw error;

                await eduDb.assessmentConfigs.update(item.id!, {
                    idCloud: data.id,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                });

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] AssessmentConfig sync failed:', error);
                await eduDb.assessmentConfigs.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                });
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: feeStructures
    // ─────────────────────────────────────────────────────────────
    async syncFeeStructures(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.feeStructures
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                const payload = {
                    school_id: item.schoolId,
                    class_id_local: item.classId,
                    term: item.term,
                    year: item.year,
                    term_fee_amount: item.termFeeAmount,
                    is_deleted: item.isDeleted ?? false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                let cloudId = (item as any).idCloud;

                if (cloudId) {
                    const { error } = await supabase
                        .from('fee_structures')
                        .update(payload)
                        .eq('id', cloudId);
                    if (error) throw error;
                } else {
                    const { data, error } = await supabase
                        .from('fee_structures')
                        .insert(payload)
                        .select('id')
                        .single();
                    if (error) throw error;
                    cloudId = data.id;
                }

                await eduDb.feeStructures.update(item.id!, {
                    idCloud: cloudId,
                    syncStatus: 'synced',
                    updatedAt: Date.now()
                });

                syncedCount++;
            } catch (error: any) {
                console.error('[syncService] FeeStructure sync failed:', error);
                this.lastError = error?.message || 'FeeStructure sync failed';
                await eduDb.feeStructures.update(item.id!, {
                    syncStatus: 'pending',
                    updatedAt: Date.now()
                });
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Custom sync: payrollRecords
    // ─────────────────────────────────────────────────────────────
    async syncPayrollRecords(schoolId: string): Promise<number> {
        const db = await import('../db').then(m => m.db);
        const { eduDb } = await import('../eduDb');

        const pendingItems = await eduDb.payrollRecords
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                // 1. Resolve Cloud Staff Identity (Stable ownership)
                let cloudStaffId = (item as any).staffIdCloud;

                if (!cloudStaffId && item.staffId) {
                    console.log(`[payroll resolve staff] attempting resolution for local staff ref: ${item.staffId}`);
                    cloudStaffId = await this.resolveCloudId(db.users, item.staffId);
                    
                    if (cloudStaffId) {
                        console.log(`[payroll resolve staff] resolved cloud staff id: ${cloudStaffId}`);
                        // PERSIST: Save the resolved identity back to local Dexie for stable portal filtering
                        await eduDb.payrollRecords.update(item.id!, { staffIdCloud: cloudStaffId });
                    }
                }

                if (!cloudStaffId) {
                    console.warn(`[payroll resolve staff] unresolved for local ref ${item.staffId}, keeping pending sync.`);
                    await eduDb.payrollRecords.update(item.id!, { 
                        syncStatus: 'pending', 
                        syncError: 'Staff profile not yet synced to cloud. Waiting for identity resolution.',
                        updatedAt: Date.now()
                    } as any);
                    continue;
                }
                
                // 2. Build Payroll Payload (Strict Cloud Schema)
                const payload = {
                    id_local: item.id,             // Technical ID for sync mapping
                    school_id: item.schoolId,
                    staff_id: cloudStaffId,        // Primary identity/ownership
                    staff_id_local: item.staffId,  // Snapshot for historical traceability
                    staff_name: item.staffName,    // Snapshot for display
                    staff_role: item.staffRole,    // Snapshot for reporting
                    month: item.month,
                    year: item.year,
                    gross_salary: item.grossSalary,
                    deductions: item.deductions,
                    deduction_notes: item.deductionNotes,
                    net_pay: item.netPay,
                    payment_method: item.paymentMethod,
                    status: item.status || 'Pending',
                    collection_code: item.collectionCode || null,
                    notified_at: this.toIso(item.notifiedAt),
                    paid_at: this.toIso(item.paidAt),
                    is_deleted: item.isDeleted ?? false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                console.log('[payroll sync payload]', payload);
                console.log('[payroll sync conflict key] school_id,staff_id,month,year');

                const { data, error } = await supabase
                    .from('payroll_records')
                    .upsert(payload, { onConflict: 'school_id,staff_id,month,year' })
                    .select('id')
                    .single();

                if (error) {
                    console.error('[payroll sync supabase error]', error);
                    throw new Error(`Cloud rejection: ${error.message} (${error.code})`);
                }

                console.log('[payroll sync success]', data.id);

                await eduDb.payrollRecords.update(item.id!, {
                    idCloud: data.id,
                    syncStatus: 'synced',
                    syncError: undefined,
                    updatedAt: Date.now()
                });

                syncedCount++;
            } catch (error: any) {
                console.error('[payroll sync failed] detailed error:', {
                    itemId: item.id,
                    staff: item.staffName,
                    error: error
                });
                this.lastError = error?.message || 'PayrollRecord sync failed';
                await eduDb.payrollRecords.update(item.id!, {
                    syncStatus: 'failed',
                    syncError: this.lastError,
                    updatedAt: Date.now()
                } as any);
            }
        }

        return syncedCount;
    },

    async syncAttendance(schoolId: string): Promise<number> {
        const pendingItems = await eduDb.attendance
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item) => item.schoolId === schoolId)
            .toArray();

        let syncedCount = 0;

        for (const item of pendingItems) {
            try {
                // Resolve student_id and class_id UUIDs
                const studentCloudId = await this.resolveCloudId(eduDb.students, item.studentId);
                const classCloudId = await this.resolveCloudId(eduDb.classes, item.classId);

                if (!studentCloudId || !classCloudId) {
                    console.log(`[syncService] Skipping attendance row due to missing dependencies. Student: ${studentCloudId}, Class: ${classCloudId}`);
                    continue;
                }

                const enteredByCloudId = await this.resolveCloudId(db.users, item.enteredBy);

                const d = new Date(item.date);
                const localDateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                
                const payload = {
                    school_id: item.schoolId,
                    student_id: studentCloudId,
                    class_id: classCloudId,
                    date: localDateString,
                    status: item.status,
                    entered_by: enteredByCloudId,
                    is_deleted: item.isDeleted ?? false,
                    created_at: this.toIso(item.createdAt),
                    updated_at: this.toIso(item.updatedAt)
                };

                const { data, error } = await supabase
                    .from('attendance')
                    .upsert(payload, {
                        onConflict: 'school_id,student_id,date'
                    })
                    .select('id')
                    .single();

                if (error) throw error;

                if (data?.id) {
                    await eduDb.attendance.update(item.id!, {
                        idCloud: data.id,
                        syncStatus: 'synced'
                    });
                    syncedCount++;
                }
            } catch (error) {
                console.error('[syncService] Error syncing attendance row:', error);
                this.lastError = `[Attendance] ${error instanceof Error ? error.message : String(error)}`;
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Generic sync for simpler tables
    // ─────────────────────────────────────────────────────────────
    isUuid(value: any): boolean {
        if (!value || typeof value !== 'string') return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(value);
    },

    mapStaffProfileForSync(row: any) {
        let mappedGender = row.gender ?? null;
        if (mappedGender && mappedGender.toLowerCase) {
            mappedGender = mappedGender.charAt(0).toUpperCase() + mappedGender.slice(1).toLowerCase();
        }
        
        const payload: any = {
            id: row.idCloud || undefined,
            school_id: this.isUuid(row.schoolId) ? row.schoolId : null,
            username: row.username ?? null,
            full_name: row.fullName ?? null,
            contact_email: row.contactEmail ?? row.email ?? null,
            phone: row.phoneNumber ?? row.phone ?? null,
            specialization: row.specialization ?? null,
            qualification: row.qualification ?? null,
            role: row.role ? row.role.toLowerCase().trim() : 'staff',
            gender: mappedGender,
            address: row.address ?? row.residentialAddress ?? null,
            updated_at: new Date().toISOString()
        };

        // Remove undefined
        Object.keys(payload).forEach(key => {
            if (payload[key] === undefined) {
                delete payload[key];
            }
        });

        if (this.isUuid(row.idCloud)) {
            payload.id = row.idCloud;
        }

        return payload;
    },

    mapStudentForSync(row: any, schoolId: string, classCloudId: string | null) {
        const payload: any = {
            school_id: schoolId,
            class_id: this.isUuid(classCloudId) ? classCloudId : null,
            student_id_string: row.studentIdString ?? null,
            full_name: row.fullName ?? null,
            gender: row.gender ?? null,
            date_of_birth: this.toIso(row.dateOfBirth),
            guardian_name: row.guardianName || 'Unknown',
            guardian_primary_contact: row.guardianPrimaryContact ?? null,
            guardian_secondary_contact: row.guardianSecondaryContact ?? null,
            guardian_email: row.guardianEmail ?? null,
            guardian_occupation: row.guardianOccupation ?? null,
            religion: row.religion ?? null,
            residential_address: row.residentialAddress ?? null,
            is_boarding: row.isBoarding ?? false,
            arrears: row.arrears ?? 0,
            is_deleted: row.isDeleted ?? false,
            created_at: this.toIso(row.createdAt),
            updated_at: this.toIso(row.updatedAt)
            // No offline fields mapping
        };

        if (this.isUuid(row.idCloud)) {
            payload.id = row.idCloud;
        }

        return payload;
    },

    async syncEntity(schoolId: string, table: any, supabaseTable: string, matchKey: string): Promise<number> {
        const pendingItems = await table
            .where('syncStatus')
            .anyOf('pending', 'failed')
            .filter((item: any) => {
                if (supabaseTable === 'schools') {
                    return item.idCloud === schoolId || item.schoolId === schoolId || item.schoolCode === schoolId;
                }
                return item.schoolId === schoolId || item.school_id === schoolId || item.idCloud === schoolId;
            })
            .toArray();

        if (pendingItems.length === 0) return 0;

        let syncedCount = 0;
        const BATCH_SIZE = 50;

        for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
            const batch = pendingItems.slice(i, i + BATCH_SIZE);

            const mappedBatch = await Promise.all(
                batch.map(async (item: any) => {
                    let mapped: any;

                    if (supabaseTable === 'staff_profiles') {
                        mapped = this.mapStaffProfileForSync(item);
                        // Validate UUIDs
                        if ((mapped.id && !this.isUuid(mapped.id)) || !this.isUuid(mapped.school_id)) {
                            console.error(`[syncService] Invalid UUID format in staff profile. id: ${mapped.id}, school_id: ${mapped.school_id}`, item);
                            await table.update(item.id, { syncStatus: 'pending', syncError: 'Invalid UUID format.' });
                            return null;
                        }
                        if (!mapped.id) {
                            console.warn('[syncService] Skipping offline staff profile. Staff must be created online first.');
                            await table.update(item.id, { syncStatus: 'pending', syncError: 'Offline creation not allowed. Canonical ID missing.' });
                            return null;
                        }
                    } else {
                        mapped = await this.mapToSnakeCase(item, supabaseTable);
                        // Fix for 'Error syncing schools' (400 Bad Request)
                        // The schools table in Supabase doesn't have username, school_id, id_local, or is_deleted
                        if (supabaseTable === 'schools') {
                            // Ensure the record has the correct UUID as the primary ID
                            if (item.idCloud) {
                                mapped.id = item.idCloud;
                            }
                            delete mapped.username;
                            delete mapped.school_id;
                            delete mapped.is_deleted;
                            delete mapped.id_local;
                        }

                        delete mapped.sync_status;
                        delete mapped.sync_error;
                        delete mapped.sync_status_local;
                        delete mapped.sync_error_local;
                        if ('profile_id' in mapped) delete mapped.profile_id;
                        if ('id_cloud' in mapped) delete mapped.id_cloud;
                        if ('idCloud' in mapped) delete mapped.idCloud;

                        // CRITICAL: Ensure we never send "id": null or empty string to Supabase.
                        // PostgREST will try to insert literal NULL into the PK column, which violates 
                        // the NOT NULL constraint even if there is a DEFAULT gen_random_uuid().
                        if ('id' in mapped && !mapped.id) {
                            delete mapped.id;
                        }
                        
                        // Prevent NOT NULL constraint violations globally
                        if (supabaseTable !== 'schools') {
                            mapped.is_deleted = mapped.is_deleted ?? false;
                        }

                        // IMPORTANT: Map integer foreign keys to UUIDs for Cloud Uploads
                        if (supabaseTable === 'fee_payments' && item.studentId) {
                            const cloudStudentId = await this.resolveCloudId(eduDb.students, item.studentId);
                            if (!cloudStudentId) {
                                console.warn(`[syncService] Skipping fee_payments sync: no cloud ID for student ${item.studentId}`);
                                return null;
                            }
                            mapped.student_id = cloudStudentId;
                            delete mapped.student_id_local;
                            delete mapped.student_id_string;
                            
                            // Strip strictly-offline UI assistance fields
                            delete mapped.student_name;
                            delete mapped.class_id_local;
                            delete mapped.class_id;
                            delete mapped.className;
                        }

                        if (supabaseTable === 'graduate_records' && item.studentId) {
                            const cloudStudentId = await this.resolveCloudId(eduDb.students, item.studentId);
                            if (!cloudStudentId) {
                                console.warn(`[syncService] Skipping graduate_records sync: no cloud ID for student ${item.studentId}`);
                                return null;
                            }
                            mapped.student_id = cloudStudentId;
                            // Strip local-only fields that don't exist in the cloud schema
                            delete mapped.student_id_local;
                            delete mapped.student_id_string;
                            delete mapped.student_id_cloud;
                        }
                    }

                    if (!mapped) return null;

                    const row = { ...mapped };
                    
                    // Strip any stray _local fields that weren't explicitly handled
                    // These are often added by mapToSnakeCase for internal tracking but fail in Supabase if no column exists
                    Object.keys(row).forEach(key => {
                        const isStudentIdLocal = key === 'student_id_local';
                        const isStaffIdLocal = key === 'staff_id_local';
                        const isClassIdLocal = key === 'class_id_local';
                        
                        const isIdLocal = key === 'id_local';
                        
                        if (key.endsWith('_local') && !isStudentIdLocal && !isStaffIdLocal && !isClassIdLocal && !isIdLocal) {
                            delete row[key];
                        }
                        
                        // Always strip id_local for cloud sync as it's not in the schema
                        if (key === 'id_local') {
                            delete row[key];
                        }
                    });

                    if (supabaseTable !== 'schools' && schoolId) {
                        row.school_id = schoolId;
                    }
                    return row;
                })
            );

            const conflictKey = this.getConflictKeys(supabaseTable, matchKey);
            const conflictCols = conflictKey.split(',').map((c) => c.trim());

            const seen = new Map<string, any>();
            for (const row of mappedBatch) {
                if (!row) continue;
                const key = conflictCols.map((col) => row[col] || '').join('|');
                seen.set(key, row);
            }

            const dedupedBatch = Array.from(seen.values());
            if (dedupedBatch.length === 0) continue;

            if (supabaseTable === 'staff_profiles') {
                console.log(`[sync] table: ${supabaseTable}`, dedupedBatch);
                for (const item of batch) {
                    const row = mappedBatch.find((r: any) => r && r.username === item.username);
                    if (!row) continue;

                    // Exclude root identifiers to purely fire an UPDATE on editable fields
                    const { id, school_id, username, ...updatePayload } = row;
                    
                    const { error } = await supabase
                        .from(supabaseTable)
                        .update(updatePayload)
                        .eq('id', id);

                    if (error) {
                        console.error(`[syncService] Error syncing ${supabaseTable} record ${id}:`, error);
                        if (error.code === '42501') {
                            console.error('[RLS BLOCKED] staff_profiles update rejected');
                        }
                        this.lastError = `[Table ${supabaseTable}] ${error.message}`;
                        await table.update(item.id, { syncStatus: 'pending', syncError: error.message });
                    } else {
                        await table.update(item.id, { syncStatus: 'synced', syncError: null });
                        syncedCount++;
                    }
                }
            } else {
                // Split batch to prevent PostgREST from filling missing IDs with NULL
                const withId = dedupedBatch.filter(r => r.id);
                const withoutId = dedupedBatch.filter(r => !r.id);

                const subBatches = [
                    { data: withId, type: 'update' },
                    { data: withoutId, type: 'insert' }
                ];

                for (const subBatch of subBatches) {
                    if (subBatch.data.length === 0) continue;

                    const selectCols = ['id', ...conflictCols];
                    // Skip id_local as it's not in the Supabase schema

                    const { data, error } = await supabase
                        .from(supabaseTable)
                        .upsert(subBatch.data, { onConflict: conflictKey })
                        .select(selectCols.join(', '));

                    if (error) {
                        console.error(`[syncService] Error syncing ${supabaseTable} (${subBatch.type} batch):`, error);
                        this.lastError = `[Table ${supabaseTable}] ${error.message}`;
                        await Promise.all(batch.map((item: any) => table.update(item.id, { syncStatus: 'pending', syncError: error.message })));
                    } else if (data) {
                        // Success: Match returned cloud records back to local records to persist the UUID
                        for (const cloudItem of data) {
                            const localMatch = batch.find((localItem: any) => {
                                // Fallback to matching by conflict columns (natural keys) as id_local is not in schema
                                return conflictCols.every(col => {
                                    const camelCol = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                                    const localVal = localItem[camelCol] ?? localItem[col] ?? null;
                                    const cloudVal = (cloudItem as any)[col] ?? null;
                                    
                                    // Soft string matching for ID comparisons (UUIDs)
                                    if (localVal === null || cloudVal === null) return localVal === cloudVal;
                                    return String(localVal).toLowerCase() === String(cloudVal).toLowerCase();
                                });
                            });

                            if (localMatch) {
                                await table.update(localMatch.id, { 
                                    idCloud: (cloudItem as any).id, 
                                    syncStatus: 'synced',
                                    syncError: null,
                                    updatedAt: Date.now()
                                });
                                syncedCount++;
                            }
                        }
                    }
                }
            }
        }

        return syncedCount;
    },

    // ─────────────────────────────────────────────────────────────
    // Pull from Supabase
    // ─────────────────────────────────────────────────────────────
    async pullEntity(schoolId: string, table: any, supabaseTable: string): Promise<SyncResult> {
        const eqColumn = supabaseTable === 'schools' ? 'id' : 'school_id';

        const { data, error } = await supabase
            .from(supabaseTable)
            .select('*')
            .eq(eqColumn, schoolId);

        if (error) {
            console.error(`[syncService] Error pulling ${supabaseTable}:`, error);
            return { success: false, error: error.message };
        }

        // Empty table is NOT an error — the school may just have no data yet.
        if (!data?.length) return { success: true };

        for (const item of data) {
            let match: any = null;
            const mapped = await this.mapToCamelCase(item, supabaseTable);

            if (supabaseTable === 'schools') {
                match = await table.where({ schoolCode: mapped.schoolCode }).first();
                if (!match && mapped.idCloud) {
                    match = await table.where({ idCloud: mapped.idCloud }).first();
                }
                if (!match && mapped.schoolId) {
                    match = await table.where({ schoolId: mapped.schoolId }).first();
                }
            } else if (['subjects', 'classes', 'class_subjects', 'students', 'results', 'component_scores', 'assessment_configs', 'fee_structures', 'fee_payments', 'payroll_records', 'expenses', 'budgets', 'staff_profiles', 'settings', 'school_subscriptions', 'promotion_requests'].includes(supabaseTable)) {
                if ((mapped as any).idCloud) {
                    match = await table.where({ idCloud: (mapped as any).idCloud }).first();
                }

                if (!match && supabaseTable === 'assessment_configs') {
                    match = await table.where({
                        schoolId: schoolId,
                        year: mapped.year,
                        term: mapped.term
                    }).first();
                }

                if (!match && supabaseTable === 'settings') {
                    match = await table.where({
                        schoolId: schoolId,
                        key: mapped.key
                    }).first();
                }

                if (!match && supabaseTable === 'subjects') {
                    match = await table.where({ schoolId, name: mapped.name }).first();
                }

                if (!match && supabaseTable === 'classes') {
                    match = await table
                        .where('[schoolId+name+level]')
                        .equals([schoolId, mapped.name || '', mapped.level || ''])
                        .first();
                }

                if (!match && supabaseTable === 'fee_structures') {
                    const mappedClassId = this.isUuid(mapped.classId) 
                        ? (await eduDb.classes.where({ idCloud: mapped.classId }).first())?.id 
                        : mapped.classId;
                        
                    if (mappedClassId) {
                        match = await table.where({
                            schoolId: schoolId,
                            classId: mappedClassId,
                            term: mapped.term,
                            year: mapped.year
                        }).first();
                    }
                }

                if (!match && supabaseTable === 'fee_payments') {
                    match = await table.where({
                        schoolId: schoolId,
                        receiptNo: mapped.receiptNo
                    }).first();
                }

                if (!match && supabaseTable === 'payroll_records') {
                    match = await table.where({
                        schoolId: schoolId,
                        staffId: mapped.staffId,
                        month: mapped.month,
                        year: mapped.year
                    }).first();
                }

                if (!match && supabaseTable === 'expenses') {
                    match = await table.where({
                        schoolId: schoolId,
                        category: mapped.category,
                        description: mapped.description,
                        date: mapped.date,
                        amount: mapped.amount
                    }).first();
                }

                if (!match && supabaseTable === 'budgets') {
                    match = await table.where({
                        schoolId: schoolId,
                        category: mapped.category,
                        term: mapped.term,
                        year: mapped.year
                    }).first();
                }

                if (!match && supabaseTable === 'class_subjects') {
                    const localClassId = (await eduDb.classes.where({ idCloud: (mapped as any).classId }).first())?.id;
                    const localSubjectId = (await eduDb.subjects.where({ idCloud: (mapped as any).subjectId }).first())?.id;

                    if (localClassId && localSubjectId) {
                        match = await table.where({ classId: localClassId, subjectId: localSubjectId }).first();
                    }
                }

                if (!match && supabaseTable === 'school_subscriptions') {
                    match = await table.where({
                        schoolId: schoolId,
                        term: mapped.term,
                        academicYear: mapped.academicYear
                    }).first();
                }


                // Unconditionally map foreign key UUIDs to their local integer IDs for related tables
                if (['class_subjects', 'fee_structures', 'fee_payments'].includes(supabaseTable)) {
                    if (this.isUuid((mapped as any).classId)) {
                        const localClass = await eduDb.classes.where({ idCloud: (mapped as any).classId }).first();
                        (mapped as any).classId = localClass?.id ?? null;
                    }
                    if (supabaseTable === 'class_subjects' && this.isUuid((mapped as any).subjectId)) {
                        const localSubject = await eduDb.subjects.where({ idCloud: (mapped as any).subjectId }).first();
                        (mapped as any).subjectId = localSubject?.id ?? null;
                    }
                    if (supabaseTable === 'fee_payments' && this.isUuid((mapped as any).studentId)) {
                        const localStudent = await eduDb.students.where({ idCloud: (mapped as any).studentId }).first();
                        (mapped as any).studentId = localStudent?.id ?? null;
                    }
                }

                if (!match && supabaseTable === 'students') {
                    if ((mapped as any).studentIdString && (mapped as any).studentIdString.trim() && (mapped as any).studentIdString !== 'undefined') {
                        // Strict check by studentIdString ONLY if it's a valid stable business key
                        const localMatches = await table.where({ schoolId }).toArray();
                        match = localMatches.find((s: any) => s.studentIdString?.trim().toLowerCase() === (mapped as any).studentIdString.trim().toLowerCase());
                    }
                }

                // Resolve classId for students regardless of match, because we need the integer ID
                if (supabaseTable === 'students' && (mapped as any).classId) {
                    if (this.isUuid((mapped as any).classId)) {
                        const localClass = await eduDb.classes.where({ idCloud: (mapped as any).classId }).first();
                        
                        if (!localClass) {
                            // Soft-failure: Save the student with classId = null instead of skipping.
                            // The healOrphanedEntities() call later in pullAll() will resolve the link
                            // once the class record has been pulled from the cloud.
                            console.warn(`[syncService] Student "${mapped.name}" saved with null classId (Class UUID ${(mapped as any).classId} not yet local). Will be healed.`);
                            (mapped as any).classId = null;
                        } else {
                            (mapped as any).classId = localClass.id ?? null;
                        }
                    }
                }

                // ALWAYS resolve foreign keys from Cloud UUIDs back to Local Integer IDs
                if (supabaseTable === 'results') {
                    const localStudentId = (await eduDb.students.where({ idCloud: (mapped as any).studentId }).first())?.id;
                    const localClassSubjectId = (await eduDb.classSubjects.where({ idCloud: (mapped as any).classSubjectId }).first())?.id;
                    const localClassId = (await eduDb.classes.where({ idCloud: (mapped as any).classId }).first())?.id;
                    const localSubjectId = (await eduDb.subjects.where({ idCloud: (mapped as any).subjectId }).first())?.id;

                    if (localStudentId) (mapped as any).studentId = localStudentId;
                    if (localClassSubjectId) (mapped as any).classSubjectId = localClassSubjectId;
                    if (localClassId) (mapped as any).classId = localClassId;
                    if (localSubjectId) (mapped as any).subjectId = localSubjectId;

                    if (!match && localStudentId && localClassSubjectId) {
                        match = await table.where({
                            studentId: localStudentId,
                            classSubjectId: localClassSubjectId,
                            term: mapped.term,
                            year: mapped.year
                        }).first();
                    }
                }

                if (supabaseTable === 'component_scores') {
                    const localStudentId = (await eduDb.students.where({ idCloud: (mapped as any).studentId }).first())?.id;
                    const localClassSubjectId = (await eduDb.classSubjects.where({ idCloud: (mapped as any).classSubjectId }).first())?.id;
                    
                    if (localStudentId) (mapped as any).studentId = localStudentId;
                    if (localClassSubjectId) (mapped as any).classSubjectId = localClassSubjectId;

                    if (!match && localStudentId && localClassSubjectId) {
                        match = await table.where({
                            studentId: localStudentId,
                            classSubjectId: localClassSubjectId,
                            term: mapped.term,
                            year: mapped.year,
                            componentType: mapped.componentType,
                            componentNumber: mapped.componentNumber
                        }).first();
                    }
                }

                if (supabaseTable === 'promotion_requests') {
                    const localStudentId = (await eduDb.students.where({ idCloud: (mapped as any).studentId }).first())?.id;
                    const localFromClassId = (await eduDb.classes.where({ idCloud: (mapped as any).fromClassId }).first())?.id;
                    const localToClassId = (await eduDb.classes.where({ idCloud: (mapped as any).toClassId }).first())?.id;

                    if (localStudentId) (mapped as any).studentId = localStudentId;
                    if (localFromClassId) (mapped as any).fromClassId = localFromClassId;
                    if (localToClassId) (mapped as any).toClassId = localToClassId;

                    if (!localStudentId || !localFromClassId || !localToClassId) {
                        console.warn(`[syncService] Skipping promotion request: dependencies not resolved yet.`);
                        continue;
                    }

                    if (!match && localStudentId) {
                        match = await table.where({
                            studentId: localStudentId,
                            status: 'pending'
                        }).first();
                    }
                }

                if (supabaseTable === 'attendance') {
                    const localStudentId = (await eduDb.students.where({ idCloud: (mapped as any).studentId }).first())?.id;
                    const localClassId = (await eduDb.classes.where({ idCloud: (mapped as any).classId }).first())?.id;

                    if (localStudentId) (mapped as any).studentId = localStudentId;
                    if (localClassId) (mapped as any).classId = localClassId;

                    if (!match && localStudentId) {
                        match = await table.where({
                            studentId: localStudentId,
                            date: mapped.date
                        }).first();
                    }
                }

                if (supabaseTable === 'graduate_records') {
                    const localStudentId = (await eduDb.students.where({ idCloud: (mapped as any).studentId }).first())?.id;
                    if (localStudentId) (mapped as any).studentId = localStudentId;

                    if (!match && localStudentId) {
                        match = await table.where({
                            schoolId: mapped.schoolId,
                            studentId: localStudentId
                        }).first();
                    }
                }

                if (supabaseTable === 'payroll_records') {
                    // The cloud 'staff_id' is a UUID. Locally we store this in 'staffIdCloud'.
                    const cloudStaffUuid = (mapped as any).staffId;
                    delete (mapped as any).staffId;
                    mapped.staffIdCloud = cloudStaffUuid;

                    let localStaffId = null;
                    
                    // 1. Resolve local integer staffId using the Cloud UUID
                    if (cloudStaffUuid) {
                        const localUser = await db.users.where({ idCloud: cloudStaffUuid }).first();
                        localStaffId = localUser?.id;
                    }

                    // 2. Fallback to existing staffIdLocal if provided by cloud (legacy/snapshot)
                    if (!localStaffId && (mapped as any).staffIdLocal) {
                        localStaffId = (mapped as any).staffIdLocal;
                    }

                    // 3. Last resort fallback Match via Offline String Signatures
                    if (!localStaffId && mapped.staffName) {
                        const foundStaff = await db.users
                            .where('schoolId')
                            .equals(mapped.schoolId)
                            .filter(u => u.fullName === mapped.staffName || u.username === mapped.staffName)
                            .first();
                        
                        localStaffId = foundStaff?.id;
                    }

                    if (localStaffId) {
                        mapped.staffId = localStaffId;
                    }
                    
                    if (!match) {
                        // Prefer matching by Cloud UUID + Month + Year for final identity stability
                        if (cloudStaffUuid) {
                            match = await table.where({
                                schoolId: mapped.schoolId,
                                staffIdCloud: cloudStaffUuid,
                                month: mapped.month,
                                year: mapped.year
                            }).first();
                        }
                        
                        // Fallback match by local integer if UUID match failed (during migration)
                        if (!match && localStaffId) {
                            match = await table.where({
                                schoolId: mapped.schoolId,
                                staffId: localStaffId,
                                month: mapped.month,
                                year: mapped.year
                            }).first();
                        }
                    }
                }
            } else if (supabaseTable === 'school_subscriptions') {
                match = await table.where({
                    schoolId,
                    term: mapped.term,
                    academicYear: mapped.academicYear
                }).first();
            }

            if (match) {
                mapped.id = match.id;
                if (match.syncStatus === 'pending') continue;
            }

            if (mapped.id === null || mapped.id === undefined) delete mapped.id;

            if (supabaseTable === 'schools' && match) {
                // METADATA PRESERVATION: Prevent cloud pulls from wiping local onboarding facts
                if (!mapped.onboardingTerm && match.onboardingTerm) mapped.onboardingTerm = match.onboardingTerm;
                if (!mapped.onboardingAcademicYear && match.onboardingAcademicYear) mapped.onboardingAcademicYear = match.onboardingAcademicYear;
            }

            if (supabaseTable === 'students') {
                await dbService.students.save({ ...match, ...mapped, syncStatus: 'synced' } as any);
            } else {
                await table.put({ ...match, ...mapped, syncStatus: 'synced' });
            }
        }

        // Server Authority Sweep: Hard-Delete local rows that have been erased from the Cloud
        // Skip metadata tables where local states are heavily autonomous or handled differently
        if (!['schools', 'staff_profiles', 'settings'].includes(supabaseTable)) {
            try {
                const cloudIds = new Set(data.map((item: any) => item.id));
                const localRows = await table.where('schoolId').equals(schoolId).toArray();
                
                const toDelete = localRows.filter((local: any) => local.idCloud && !cloudIds.has(local.idCloud));
                if (toDelete.length > 0) {
                    console.warn(`[syncService] Cloud-authoritative sweep: Removing ${toDelete.length} local ${supabaseTable} records that were hard-deleted online.`);
                    await table.bulkDelete(toDelete.map((t: any) => t.id));
                }
            } catch (err) {
                console.warn(`[syncService] Cloud sweep skipped for ${supabaseTable}`, err);
            }
        }
        return { success: true };
    },

    async blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    base64ToBlob(base64: string): Blob {
        const parts = base64.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);

        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }

        return new Blob([uInt8Array], { type: contentType });
    },

    async mapToSnakeCase(obj: any, supabaseTable?: string): Promise<any> {
        const newObj: any = {};
        const dateFields = [
            'createdAt',
            'updatedAt',
            'dateOfBirth',
            'paymentDate',
            'paidAt',
            'date',
            'voidedAt',
            'submittedAt',
            'approvedAt',
            'lockedAt',
            'lastSyncAt',
            'deletedAt',
            'notedAt'
        ];

        for (const key in obj) {
            if (key === 'password' || key === 'syncStatus' || key === 'syncError') continue;

            const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

            if (obj[key] instanceof Blob) {
                const schoolId = obj.schoolId || obj.school_id;
                if (schoolId) {
                    let type: 'logos' | 'students' = 'students';
                    let filename = `${Date.now()}.png`;

                    if (supabaseTable === 'schools') {
                        // For schools, always use Base64 as preferred by the user
                        const targetKey = snakeKey;
                        newObj[targetKey] = await this.blobToBase64(obj[key]);
                        continue;
                    } else if (supabaseTable === 'students') {
                        type = 'students';
                        filename = `${obj.studentIdString || obj.idCloud || obj.id || Date.now()}.png`;
                    }

                    const result = await storageService.uploadAsset(schoolId, type, filename, obj[key]);
                    if (result && result.path) {
                        const targetKey = (supabaseTable === 'students' && key === 'photo') ? 'photo_url' : snakeKey;
                        newObj[targetKey] = result.path;
                        continue;
                    }
                }
                // Fallback to Base64 if storage fails or no schoolId
                const targetKey = (supabaseTable === 'students' && key === 'photo') ? 'photo_url' : snakeKey;
                newObj[targetKey] = await this.blobToBase64(obj[key]);
                continue;
            }

            if (key === 'id') {
                if (supabaseTable === 'staff_profiles') {
                    newObj['profile_id'] = obj[key];
                }
                continue;
            }

            if (supabaseTable === 'schools' && key === 'schoolCode') {
                newObj['school_code'] = obj[key];
                continue;
            }

            if (key === 'idCloud' || (supabaseTable === 'staff_profiles' && key === 'idCloud')) {
                if (obj[key]) {
                    newObj['id'] = obj[key];
                }
                continue;
            }

            if (key === 'studentId' && typeof obj[key] === 'string') {
                newObj['student_id_string'] = obj[key];
            } else if (key === 'studentId' && typeof obj[key] === 'number') {
                newObj['student_id_local'] = obj[key];
            } else if (['enteredBy', 'addedBy', 'approvedBy'].includes(key)) {
                if (this.isUuid(obj[key])) {
                    newObj[snakeKey] = obj[key];
                } else {
                    newObj[`${snakeKey}_local`] = obj[key];
                }
            } else if (key === 'classTeacherId' || key === 'teacherId') {
                if (obj[key] !== undefined) newObj[snakeKey] = obj[key];
            } else if (key.endsWith('Id') && key !== 'schoolId' && typeof obj[key] === 'number') {
                newObj[`${snakeKey}_local`] = obj[key];
            } else if (dateFields.includes(key) && typeof obj[key] === 'number') {
                newObj[snakeKey] = obj[key] > 0 ? this.toIso(obj[key]) : null;
            } else if (key === 'isDeleted') {
                newObj['is_deleted'] = !!obj[key];
            } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                newObj[snakeKey] = await this.mapToSnakeCase(obj[key], supabaseTable);
            } else {
                newObj[snakeKey] = obj[key];
            }
        }

        return newObj;
    },

    async mapToCamelCase(obj: any, supabaseTable?: string) {
        const newObj: any = {};

        for (const key in obj) {
            const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

            // Handle Storage Paths (stored as strings in DB)
            if (typeof obj[key] === 'string' && (key === 'logo' || key === 'photo_url' || key === 'photo')) {
                const val = obj[key].trim();

                if (val.startsWith('http://') || val.startsWith('https://')) {
                    newObj[camelKey] = val;
                    continue;
                }

                if (val.startsWith('data:image/')) {
                    // Let the block below handle base64 strings
                } else if (val.includes('/') && !val.includes(' ') && val.length > 5) {
                    try {
                        const blob = await storageService.downloadAsset(val);
                        if (blob) {
                            const targetKey = (key === 'photo_url') ? 'photo' : camelKey;
                            newObj[targetKey] = blob;
                            continue;
                        } else {
                            newObj[camelKey] = val;
                            continue;
                        }
                    } catch (e) {
                        console.warn(`[syncService] Download failed gracefully during mapToCamelCase for ${key}:`, e);
                        newObj[camelKey] = val;
                        continue;
                    }
                }
            }

            if (typeof obj[key] === 'string' && obj[key].startsWith('data:image/')) {
                newObj[camelKey] = this.base64ToBlob(obj[key].trim());
                continue;
            }

            if (key === 'profile_id') {
                newObj['id'] = obj[key];
                continue;
            }

            if (key === 'id') {
                if (supabaseTable === 'schools' || supabaseTable === 'staff_profiles') {
                    newObj['idCloud'] = obj[key];
                } else {
                    newObj['idCloud'] = obj[key];
                }
                continue;
            }

            if (supabaseTable === 'schools' && key === 'school_code') {
                newObj['schoolCode'] = obj[key];
                continue;
            }

            if (key === 'school_id') {
                newObj['schoolId'] = obj[key];
                continue;
            }

            if (key === 'student_id_string') {
                if (supabaseTable === 'students') {
                    newObj['studentIdString'] = obj[key];
                } else {
                    newObj['studentId'] = obj[key];
                }
            } else if (key === 'student_id_local') {
                newObj['studentId'] = obj[key];
            } else if (key.endsWith('_local')) {
                const baseKey = key.replace('_local', '');
                const baseCamelKey = baseKey.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                newObj[baseCamelKey] = obj[key];
            } else if (
                [
                    'created_at',
                    'updated_at',
                    'date_of_birth',
                    'payment_date',
                    'voided_at',
                    'submitted_at',
                    'approved_at',
                    'deleted_at',
                    'noted_at'
                ].includes(key)
            ) {
                newObj[camelKey] = obj[key] ? new Date(obj[key]).getTime() : 0;
            } else if (key === 'date') {
                if (obj[key] && typeof obj[key] === 'string' && obj[key].includes('-')) {
                    const [y, m, d] = obj[key].split('T')[0].split('-').map(Number);
                    newObj[camelKey] = new Date(y, m - 1, d).setHours(0, 0, 0, 0);
                } else {
                    newObj[camelKey] = obj[key] ? new Date(obj[key]).getTime() : 0;
                }
            } else if (key === 'is_deleted') {
                newObj['isDeleted'] = !!obj[key];
            } else if ((key === 'logo' || key === 'photo' || key === 'photo_url') && typeof obj[key] === 'string' && obj[key].startsWith('data:image/')) {
                // Convert Base64 back to Blob
                newObj[camelKey] = this.base64ToBlob(obj[key]);
            } else {
                newObj[camelKey] = obj[key];
            }
        }

        return newObj;
    },

    getConflictKeys(table: string, defaultKey: string) {
        if (table === 'schools') return 'school_code';
        if (table === 'users' || table === 'staff_profiles') return 'school_id,username';
        if (table === 'students') return 'school_id,student_id_string';
        if (table === 'settings') return 'school_id,key';
        if (table === 'assessment_configs') return 'school_id,year,term';
        if (table === 'school_subscriptions') return 'school_id,term,academic_year';
        if (table === 'results') return 'student_id,class_subject_id,term,year';
        if (table === 'attendance') return 'school_id,student_id,date';
        if (table === 'component_scores') return 'student_id,class_subject_id,year,term,component_type,component_number';
        if (table === 'fee_structures') return 'school_id,class_id_local,term,year';
        if (table === 'fee_payments') return 'school_id,receipt_no';
        if (table === 'payroll_records') return 'school_id,staff_id_local,month,year';
        if (table === 'expenses') return 'school_id,category,description,date,amount';
        if (table === 'budgets') return 'school_id,category,term,year';
        if (table === 'promotion_requests') return 'student_id,from_class_id,to_class_id,created_at';
        if (table === 'graduate_records') return 'id';

        return defaultKey;
    },

    /**
     * Attempts to resolve local integer IDs for orphaned records that were saved
     * when their dependencies (classes, students, etc.) hadn't been pulled yet.
     */
    async healOrphanedEntities(schoolId: string) {
        try {
            // 1. Heal Students with classId = null (that have idCloud)
            const orphans = await eduDb.students
                .where('schoolId').equals(schoolId)
                .filter(s => s.classId === null && !!s.idCloud)
                .toArray();

            if (orphans.length > 0) {
                console.log(`[syncService] Healing ${orphans.length} orphaned student records...`);
                for (const student of orphans) {
                    // Pull the fresh record from Supabase to get its class_id UUID
                    const { data: cloudStudent } = await supabase
                        .from('students')
                        .select('class_id')
                        .eq('id', student.idCloud)
                        .single();

                    if (cloudStudent?.class_id) {
                        const localClass = await eduDb.classes.where({ idCloud: cloudStudent.class_id }).first();
                        if (localClass) {
                            await eduDb.students.update(student.id!, { 
                                classId: localClass.id,
                                updatedAt: Date.now() 
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[syncService] Healing failed:', err);
        }
    }
};