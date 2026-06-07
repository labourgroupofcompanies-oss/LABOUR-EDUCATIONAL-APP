import { syncService } from './syncService';
import { supabase } from '../supabaseClient';

export const syncManager = {
    schoolId: null as string | null,
    isSyncing: false,
    lastSyncTime: 0,
    handleOnlineEvent: null as EventListener | null,
    channel: null as any,
    pollInterval: null as any,
    syncQueued: false,

    init(schoolId: string) {
        this.schoolId = schoolId;

        // Auto-repair patches — always deferred so they NEVER race with the startup sync.
        // Each patch runs its DB mutations first, then queues a sync via setTimeout (non-blocking).
        (async () => {
            if (!localStorage.getItem('fee_sync_patch_v2')) {
                try {
                    const { eduDb } = await import('../eduDb');
                    await eduDb.feePayments.toCollection().modify({ syncStatus: 'pending' });
                    await eduDb.feeStructures.toCollection().modify({ syncStatus: 'pending' });
                    localStorage.setItem('fee_sync_patch_v2', 'true');
                    console.log('[syncManager] Auto-repair v2: stranded fee payments and structures marked pending.');
                    // Defer so startup sync finishes first
                    setTimeout(() => this.triggerSync(), 5000);
                } catch (e) {
                    console.error('[syncManager] Auto-repair v2 failed:', e);
                }
            }

            // V3 Repair: Rescue permanently 'failed' records
            if (!localStorage.getItem('fee_sync_patch_v3_1')) {
                try {
                    const { eduDb } = await import('../eduDb');
                    const failedFeesCount = await eduDb.feePayments.where('syncStatus').equals('failed').modify({ syncStatus: 'pending', syncError: undefined });
                    const failedPayrollCount = await eduDb.payrollRecords.where('syncStatus').equals('failed').modify({ syncStatus: 'pending', syncError: undefined });
                    localStorage.setItem('fee_sync_patch_v3_1', 'applied');
                    if (failedFeesCount > 0 || failedPayrollCount > 0) {
                        console.log(`[syncManager] V3.1 Repair: Rescued ${failedFeesCount} fee payments and ${failedPayrollCount} payroll records.`);
                        setTimeout(() => this.triggerSync(true), 6000);
                    }
                } catch (e) {
                    console.error('[syncManager] Auto-repair V3.1 failed:', e);
                }
            }

            // V4: Repair orphaned Payroll Records stored locally without staffId
            if (localStorage.getItem('payroll_sync_patch_v4') !== 'applied_v3') {
                try {
                    const { eduDb } = await import('../eduDb'); 
                    const { db } = await import('../db');
                    const allPayroll = await eduDb.payrollRecords.toArray();
                    const orphaned = allPayroll.filter(r => !r.staffId && r.staffName);
                    
                    if (orphaned.length > 0) {
                        for (const r of orphaned) {
                            const found = await db.users
                                .where('schoolId')
                                .equals(r.schoolId)
                                .filter(u => u.fullName === r.staffName || u.username === r.staffName)
                                .first();
                            
                            if (found && found.id) {
                                await eduDb.payrollRecords.update(r.id!, { staffId: found.id });
                            }
                        }
                    }
                    localStorage.setItem('payroll_sync_patch_v4', 'applied_v3');
                } catch (e) {
                    console.error('[syncManager] Auto-repair V4 failed:', e);
                }
            }

            // V5: Retroactive cascading soft-delete of associated records for already-deleted learners
            if (!localStorage.getItem('deleted_learners_cascade_patch_v5')) {
                try {
                    const { eduDb } = await import('../eduDb');
                    const { supabase } = await import('../supabaseClient');
                    const now = Date.now();
                    const deletedAtStr = new Date().toISOString();

                    // Find all deleted students for this school
                    const deletedStudents = (await eduDb.students
                        .where('schoolId')
                        .equals(schoolId)
                        .toArray())
                        .filter(s => s.isDeleted);

                    if (deletedStudents.length > 0) {
                        console.log(`[syncManager] V5 Repair: Found ${deletedStudents.length} already-deleted students. Cleaning up associated records...`);
                        
                        let totalCleanedLocal = 0;
                        
                        // We will group table updates in a transaction
                        await eduDb.transaction('rw', [
                            eduDb.results,
                            eduDb.attendance,
                            eduDb.feePayments,
                            eduDb.promotionRequests,
                            eduDb.componentScores,
                            eduDb.graduateRecords
                        ], async () => {
                            const softDeleteRelated = async (table: any, studentIds: number[]) => {
                                const records = await table.toArray();
                                const activeRecords = records.filter((r: any) => studentIds.includes(r.studentId) && !r.isDeleted);
                                if (activeRecords.length > 0) {
                                    const updates = activeRecords.map((r: any) => ({
                                        key: r.id!,
                                        changes: {
                                            isDeleted: true,
                                            updatedAt: now,
                                            syncStatus: 'pending'
                                        }
                                    }));
                                    await table.bulkUpdate(updates);
                                    totalCleanedLocal += activeRecords.length;
                                }
                            };

                            const studentIds = deletedStudents.map(s => s.id!).filter(Boolean);
                            if (studentIds.length > 0) {
                                await softDeleteRelated(eduDb.results, studentIds);
                                await softDeleteRelated(eduDb.attendance, studentIds);
                                await softDeleteRelated(eduDb.feePayments, studentIds);
                                await softDeleteRelated(eduDb.promotionRequests, studentIds);
                                await softDeleteRelated(eduDb.componentScores, studentIds);
                                await softDeleteRelated(eduDb.graduateRecords, studentIds);
                            }
                        });

                        console.log(`[syncManager] V5 Repair: Soft-deleted ${totalCleanedLocal} associated local records.`);

                        // Also try to update Supabase directly for any synced deleted students
                        const cloudStudentIds = deletedStudents.map(s => s.idCloud).filter(Boolean);
                        if (cloudStudentIds.length > 0 && window.navigator.onLine) {
                            try {
                                // We do a batch of updates in Supabase in parallel
                                await Promise.all([
                                    supabase.from('results').update({ is_deleted: true, updated_at: deletedAtStr }).in('student_id', cloudStudentIds),
                                    supabase.from('attendance').update({ is_deleted: true, updated_at: deletedAtStr }).in('student_id', cloudStudentIds),
                                    supabase.from('component_scores').update({ is_deleted: true, updated_at: deletedAtStr }).in('student_id', cloudStudentIds),
                                    supabase.from('fee_payments').update({ is_deleted: true, updated_at: deletedAtStr }).in('student_id', cloudStudentIds),
                                    supabase.from('promotion_requests').update({ is_deleted: true, updated_at: deletedAtStr }).in('student_id', cloudStudentIds),
                                    supabase.from('graduate_records').update({ is_deleted: true, updated_at: deletedAtStr }).in('student_id', cloudStudentIds)
                                ]);
                                console.log(`[syncManager] V5 Repair: Online cascading soft-deletes pushed to Supabase.`);
                            } catch (supabaseErr) {
                                console.error('[syncManager] V5 Repair: Online cascading soft-delete failed:', supabaseErr);
                            }
                        }
                    }

                    localStorage.setItem('deleted_learners_cascade_patch_v5', 'applied');
                    if (deletedStudents.length > 0) {
                        setTimeout(() => this.triggerSync(true), 7000);
                    }
                } catch (e) {
                    console.error('[syncManager] Auto-repair V5 failed:', e);
                }
            }
        })();

        // Initial sync on startup if online
        if (window.navigator.onLine) {
            this.triggerSync();
        }

        // Listen for "online" event
        if (!this.handleOnlineEvent) {
            this.handleOnlineEvent = () => {
                console.log('[syncManager] Network online detected. Triggering sync...');
                this.triggerSync();
            };
            window.addEventListener('online', this.handleOnlineEvent);
        }

        // Initialize Supabase cross-device broadcast listener for instant updates
        if (!this.channel) {
            this.channel = supabase.channel(`school_sync_${schoolId}`)
                .on('broadcast', { event: 'sync_needed' }, async (payload) => {
                    const currentUser = (await supabase.auth.getUser()).data.user;
                    if (payload.payload?.sender === currentUser?.id) {
                        return; // Ignore our own broadcast
                    }
                    console.log('[syncManager] Broadcast received from another portal, forcing immediate urgent sync...');
                    this.triggerSync(true);
                })
                .subscribe();
        }

        // Continual safety heartbeat to instantly capture offline-burst data uploaded silently
        if (!this.pollInterval) {
            this.pollInterval = setInterval(() => {
                if (window.navigator.onLine) {
                    this.triggerSync(false);
                }
            }, 45000); // Poll every 45 seconds quietly
        }
    },

    stop() {
        if (this.handleOnlineEvent) {
            window.removeEventListener('online', this.handleOnlineEvent);
            this.handleOnlineEvent = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
        this.schoolId = null;
    },

    async triggerSync(urgent: boolean = false) {
        if (!this.schoolId) return;

        // If syncManager thinks it's running, check if the inner lock is actually
        // still set. If syncService._syncLock is false, a previous run finished
        // without clearing isSyncing (crash / edge-case). Auto-heal.
        if (this.isSyncing) {
            if (!syncService._syncLock) {
                console.warn('[syncManager] isSyncing was stuck true but _syncLock is free — auto-healing.');
                this.isSyncing = false;
            } else {
                if (urgent) {
                    console.log('[syncManager] Sync is locked. Queuing urgent broadcast for next cycle.');
                    this.syncQueued = true;
                }
                return;
            }
        }

        // Debounce: sync cannot run more than once every 30 seconds unless urgent
        const now = Date.now();
        if (!urgent && now - this.lastSyncTime < 30000) {
            console.log('[syncManager] Skipping sync: debounce window (30s)');
            return;
        }

        this.isSyncing = true;

        // Safety: if the sync hangs for > 90 seconds, force-release both locks
        const lockTimeout = setTimeout(() => {
            if (this.isSyncing) {
                console.warn('[syncManager] Sync lock timeout (90s) — force-releasing locks.');
                syncService._syncLock = false;
                this.isSyncing = false;
            }
        }, 90000);

        try {
            const result = await syncService.syncAll(this.schoolId);
            this.lastSyncTime = Date.now();
            
            if (!result.success && result.error && result.error !== 'Sync in progress') {
                console.error('[syncManager] Background sync encountered an error:', result.error);
            }
        } catch (error) {
            console.error('[syncManager] Background sync crashed:', error);
        } finally {
            clearTimeout(lockTimeout);
            this.isSyncing = false;
            if (this.syncQueued) {
                this.syncQueued = false;
                setTimeout(() => this.triggerSync(true), 1000);
            }
        }
    }
};
