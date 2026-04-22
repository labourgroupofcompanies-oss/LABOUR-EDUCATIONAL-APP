import { db, type User } from '../db';
import {
    eduDb,
    type Student,
    type Class,
    type FeeStructure,
    type FeePayment,
    type PayrollRecord,
    type Expense,
    type Budget
} from '../eduDb';
import { getMovementType } from '../utils/levelUtils';
import type { StudentMovementType } from '../utils/levelUtils';

export const dbService = {
    // Student Operations
    students: {
        async getAll(schoolId: string) {
            return await eduDb.students
                .where('schoolId').equals(schoolId)
                .filter(s => !s.isDeleted)
                .toArray();
        },

        async getByClass(schoolId: string, classId: number) {
            return await eduDb.students
                .where('schoolId').equals(schoolId)
                .filter(s => !s.isDeleted && s.classId === classId)
                .toArray();
        },

        async getByIdCloud(idCloud: string) {
            return await eduDb.students.where({ idCloud }).first();
        },

        async getById(id: number) {
            return await eduDb.students.get(id);
        },

        async add(student: Student) {
            return await this.save(student);
        },

        async update(id: number, changes: Partial<Student>) {
            return await eduDb.transaction('rw', eduDb.students, async () => {
                const existing = await eduDb.students.get(id);
                if (!existing) throw new Error(`Student ${id} not found`);
                
                // If the update includes an idCloud, verify we aren't creating a conflict
                if (changes.idCloud && changes.idCloud !== existing.idCloud) {
                    const conflict = await eduDb.students.where({ idCloud: changes.idCloud }).first();
                    if (conflict && conflict.id !== id) {
                        console.warn(`[dbService] Update on ${id} blocked. Conflicting idCloud with ${conflict.id}`);
                        return id;
                    }
                }

                await eduDb.students.update(id, {
                    ...changes,
                    updatedAt: Date.now(),
                    syncStatus: changes.syncStatus || 'pending'
                });
                return id;
            });
        },

        async save(student: Student) {
            const now = Date.now();
            return await eduDb.transaction('rw', eduDb.students, async () => {
                let match = null;

                if (student.id) {
                    match = await eduDb.students.get(student.id);
                }

                if (!match && student.idCloud) {
                    match = await eduDb.students.where({ idCloud: student.idCloud }).first();
                }

                if (!match && student.studentIdString && student.studentIdString.trim() && student.studentIdString !== 'undefined') {
                    // Try to match by studentIdString as last resort (has to match schoolId too)
                    const localMatches = await eduDb.students.where('schoolId').equals(student.schoolId).toArray();
                    match = localMatches.find(s => s.studentIdString?.trim().toLowerCase() === student.studentIdString!.trim().toLowerCase());
                }

                if (match) {
                    const id = match.id!;
                    const changes = { ...student, updatedAt: now };
                    delete changes.id; // Protect primary key
                    
                    await eduDb.students.update(id, changes);
                    return id;
                } else {
                    return await eduDb.students.add({
                        ...student,
                        createdAt: student.createdAt || now,
                        updatedAt: now,
                        syncStatus: student.syncStatus || 'pending'
                    });
                }
            });
        },

        async bulkUpdate(updates: { key: number; changes: Partial<Student> }[]) {
            return await eduDb.students.bulkUpdate(
                updates.map((u) => ({
                    ...u,
                    changes: {
                        ...u.changes,
                        updatedAt: Date.now(),
                        syncStatus: 'pending'
                    }
                }))
            );
        },

        /**
         * Safely moves students while validating academic level progression
         */
        async moveStudents(
            schoolId: string, 
            studentIds: number[], 
            targetClassId: number, 
            intendedAction: StudentMovementType
        ) {
            return await eduDb.transaction('rw', [eduDb.students, eduDb.classes], async () => {
                const targetClass = await eduDb.classes.get(targetClassId);
                if (!targetClass) throw new Error("Target class not found");

                const updates = [];
                for (const studentId of studentIds) {
                    const student = await eduDb.students.get(studentId);
                    if (!student || student.schoolId !== schoolId) continue;

                    const sourceClass = await eduDb.classes.get(student.classId!);
                    if (!sourceClass) {
                        // If student has no class, any move is fine (initial placement)
                        updates.push({ key: studentId, changes: { classId: targetClassId }});
                        continue;
                    }

                    const actualType = getMovementType(sourceClass.level, targetClass.level);
                    
                    // Critical Validation:
                    if (intendedAction === 'promotion' && actualType !== 'promotion') {
                        throw new Error(`Invalid Promotion: Moving from ${sourceClass.name} (${sourceClass.level}) to ${targetClass.name} (${targetClass.level}) is a ${actualType}.`);
                    }
                    if (intendedAction === 'transfer' && actualType !== 'transfer') {
                        throw new Error(`Invalid Transfer: Moving from ${sourceClass.name} to ${targetClass.name} is a ${actualType}.`);
                    }

                    updates.push({ key: studentId, changes: { classId: targetClassId }});
                }

                return await this.bulkUpdate(updates);
            });
        }
    },

    // Class Operations
    classes: {
        async getAll(schoolId: string) {
            return await eduDb.classes
                .where('schoolId')
                .equals(schoolId)
                .filter((c) => !c.isDeleted)
                .toArray();
        },

        async add(cls: Class) {
            const now = Date.now();

            const exists = await eduDb.classes
                .where('[schoolId+name+level]')
                .equals([cls.schoolId, cls.name, cls.level])
                .first();

            if (exists && !exists.isDeleted) {
                throw new Error(`A class named ${cls.name} at ${cls.level} already exists.`);
            }

            if (exists && exists.isDeleted) {
                await eduDb.classes.update(exists.id!, {
                    ...cls,
                    isDeleted: false,
                    deletedAt: undefined,
                    updatedAt: now,
                    syncStatus: 'pending'
                });
                return exists.id!;
            }

            return await eduDb.classes.add({
                ...cls,
                isDeleted: false,
                createdAt: cls.createdAt || now,
                updatedAt: now,
                syncStatus: 'pending'
            });
        },

        async update(id: number, changes: Partial<Class>) {
            return await eduDb.classes.update(id, {
                ...changes,
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async softDelete(id: number) {
            const now = Date.now();
            const cls = await eduDb.classes.get(id);
            if (!cls) return;

            await eduDb.classes.update(id, {
                isDeleted: true,
                deletedAt: now,
                updatedAt: now,
                syncStatus: 'pending'
            });

            const studentsInClass = await eduDb.students
                .where('schoolId').equals(cls.schoolId)
                .filter(s => s.classId === id)
                .toArray();

            if (studentsInClass.length > 0) {
                await eduDb.students.bulkUpdate(
                    studentsInClass.map((s) => ({
                        key: s.id!,
                        changes: {
                            classId: null,
                            updatedAt: now,
                            syncStatus: 'pending'
                        }
                    }))
                );
            }
        },

        async getAsClassTeacher(schoolId: string, teacherId: string) {
            const teacherIds = await dbService.staff.resolveTeacherIds(teacherId);
            return await eduDb.classes
                .where('schoolId')
                .equals(schoolId)
                .filter((c) => teacherIds.includes(c.classTeacherId ?? '') && !c.isDeleted)
                .toArray();
        },

        async getTeacherClasses(schoolId: string, teacherId: string) {
            const teacherIds = await dbService.staff.resolveTeacherIds(teacherId);

            const allClasses = await eduDb.classes
                .where('schoolId')
                .equals(schoolId)
                .filter((c) => !c.isDeleted)
                .toArray();

            const classSubjects = await eduDb.classSubjects
                .where('schoolId')
                .equals(schoolId)
                .filter((cs) => !cs.isDeleted && teacherIds.includes(cs.teacherId ?? ''))
                .toArray();

            const subjectClassIds = new Set(classSubjects.map((cs) => cs.classId));

            return allClasses.filter((cls) => {
                const isClassTeacher = teacherIds.includes(cls.classTeacherId ?? '');
                const isSubjectTeacher = subjectClassIds.has(cls.id!);
                return isClassTeacher || isSubjectTeacher;
            });
        }
    },

    // Staff Operations
    staff: {
        async getAll(schoolId: string) {
            return await db.users.where('schoolId').equals(schoolId).filter(u => !u.isDeleted).toArray();
        },

        async getAllNonHeadteachers(schoolId: string) {
            return await db.users
                .where('schoolId')
                .equals(schoolId)
                .filter((u) => u.role !== 'HEADTEACHER' && !u.isDeleted)
                .toArray();
        },

        async getTeachers(schoolId: string) {
            return await db.users
                .where('schoolId')
                .equals(schoolId)
                .filter(u => {
                    const r = (u.role || '').toUpperCase();
                    return (r === 'TEACHER' || r === 'STAFF') && !u.isDeleted;
                })
                .toArray();
        },

        async add(user: User) {
            const now = Date.now();
            return await db.users.add({
                ...user,
                createdAt: user.createdAt || now,
                updatedAt: (user as any).updatedAt || now,
                syncStatus: user.syncStatus || 'pending'
            });
        },

        async update(id: number, changes: Partial<User>) {
            return await db.users.update(id, {
                ...changes,
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async checkUsername(username: string) {
            return await db.users.where('username').equals(username).first();
        },

        /**
         * Resolves all possible string representations a teacher's ID may be
         * stored as in local IndexedDB:
         *  - The Supabase UUID (canonical, post-sync)
         *  - The local integer string e.g. "1" (pre-sync legacy)
         *  - The username string (old migration legacy)
         */
        async resolveTeacherIds(userUuid: string): Promise<string[]> {
            const ids = new Set<string>([userUuid]);

            // Check if userUuid is a local ID (numeric)
            const asNumber = parseInt(userUuid, 10);
            if (!isNaN(asNumber) && asNumber.toString() === userUuid) {
                const localUser = await db.users.get(asNumber);
                if (localUser) {
                    if ((localUser as any).idCloud) {
                        ids.add((localUser as any).idCloud);
                    }
                    if (localUser.username) {
                        ids.add(localUser.username);
                    }
                }
            } else {
                // Look up in local users table by idCloud (UUID match)
                const byCloud = await db.users.filter(u => (u as any).idCloud === userUuid).first();
                if (byCloud) {
                    if (byCloud.id) ids.add(byCloud.id.toString());
                    if (byCloud.username) ids.add(byCloud.username);
                }

                // Also try matching by UUID as username (edge case)
                const byUsername = await db.users.where('username').equals(userUuid).first();
                if (byUsername) {
                    if (byUsername.id) ids.add(byUsername.id.toString());
                    if ((byUsername as any).idCloud) ids.add((byUsername as any).idCloud);
                }
            }

            return Array.from(ids);
        },

        async getSubjectAssignments(schoolId: string, teacherId: string) {
            const assignments: { classId: number; className: string; subjectId: number; subjectName: string; classSubjectId: number }[] = [];

            const teacherIds = await this.resolveTeacherIds(teacherId);

            const allClassSubjects = await eduDb.classSubjects
                .where('schoolId')
                .equals(schoolId)
                .filter((cs) => !cs.isDeleted)
                .toArray();

            const seen = new Set<string>();

            for (const cs of allClassSubjects) {
                const cls = await eduDb.classes.get(cs.classId);
                const sub = await eduDb.subjects.get(cs.subjectId);

                if (cls && !cls.isDeleted && sub && !sub.isDeleted) {
                    const isDirectlyAssigned = teacherIds.includes(cs.teacherId ?? '');
                    const isImplicitlyAssigned = cls.teachingMode === 'class_teacher' && teacherIds.includes(cls.classTeacherId ?? '');

                    if (isDirectlyAssigned || isImplicitlyAssigned) {
                        const uniqueKey = `${cls.id}-${sub.id}`;
                        if (!seen.has(uniqueKey)) {
                            seen.add(uniqueKey);
                            assignments.push({
                                classSubjectId: cs.id!,
                                classId: cls.id!,
                                className: cls.name,
                                subjectId: sub.id!,
                                subjectName: sub.name
                            });
                        }
                    }
                }
            }

            return assignments;
        },

        async isTeacherAssigned(schoolId: string, teacherId: string) {
            const asClassTeacher = await eduDb.classes
                .where('schoolId')
                .equals(schoolId)
                .filter((c) => c.classTeacherId === teacherId && !c.isDeleted)
                .first();

            if (asClassTeacher) return true;

            const asSubjectTeacher = await eduDb.classSubjects
                .where('schoolId')
                .equals(schoolId)
                .filter((cs) => cs.teacherId === teacherId && !cs.isDeleted)
                .first();

            return !!asSubjectTeacher;
        },

        async delete(schoolId: string, userId: number) {
            const user = await db.users.get(userId);
            if (!user || user.schoolId !== schoolId) return;

            const now = Date.now();

            // Perform soft delete locally
            await db.users.update(userId, {
                isDeleted: true,
                deletedAt: now,
                updatedAt: now,
                syncStatus: 'pending'
            });

            if (user.role?.toUpperCase() === 'TEACHER') {
                const teacherIdStr = user.id?.toString() || (user as any).idCloud || '';

                const classAssigned = await eduDb.classes
                    .where('schoolId')
                    .equals(schoolId)
                    .filter((c) => c.classTeacherId === teacherIdStr && !c.isDeleted)
                    .toArray();

                for (const cls of classAssigned) {
                    await eduDb.classes.update(cls.id!, {
                        classTeacherId: undefined,
                        updatedAt: Date.now(),
                        syncStatus: 'pending'
                    });
                }

                const subjectAssigned = await eduDb.classSubjects
                    .where('schoolId')
                    .equals(schoolId)
                    .filter((cs) => cs.teacherId === teacherIdStr && !cs.isDeleted)
                    .toArray();

                for (const cs of subjectAssigned) {
                    await eduDb.classSubjects.update(cs.id!, {
                        teacherId: undefined,
                        updatedAt: Date.now(),
                        syncStatus: 'pending'
                    });
                }
            }
        }
    },

    // Subject Operations
    subjects: {
        async getAll(schoolId: string) {
            return await eduDb.subjects
                .where('schoolId')
                .equals(schoolId)
                .filter((s) => !s.isDeleted)
                .toArray();
        }
    },

    // Result Operations
    results: {
        async getByClass(schoolId: string, classId: number) {
            return await eduDb.results
                .where('schoolId')
                .equals(schoolId)
                .filter((r) => r.classId === classId)
                .toArray();
        }
    },

    // Class Subject Assignments
    classSubjects: {
        async getByClass(schoolId: string, classId: number) {
            return await eduDb.classSubjects
                .where('schoolId')
                .equals(schoolId)
                .filter((cs) => cs.classId === classId && !cs.isDeleted)
                .toArray();
        },

        async add(assignment: { schoolId: string; classId: number; subjectId: number; teacherId?: string }) {
            const now = Date.now();

            const exists = await eduDb.classSubjects
                .where('schoolId')
                .equals(assignment.schoolId)
                .filter((cs) => cs.classId === assignment.classId && cs.subjectId === assignment.subjectId)
                .first();

            if (exists) {
                if (exists.isDeleted) {
                    await eduDb.classSubjects.update(exists.id!, {
                        ...assignment,
                        isDeleted: false,
                        updatedAt: now,
                        syncStatus: 'pending'
                    });
                    return exists.id!;
                }

                return exists.id!;
            }

            return await eduDb.classSubjects.add({
                ...assignment,
                isDeleted: false,
                createdAt: now,
                updatedAt: now,
                syncStatus: 'pending'
            });
        },

        async update(id: number, changes: { teacherId?: string; syncStatus?: string }) {
            return await eduDb.classSubjects.update(id, {
                ...changes,
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async softDelete(id: number) {
            return await eduDb.classSubjects.update(id, {
                isDeleted: true,
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        /**
         * Sets teacherId on ALL active ClassSubject rows for a class.
         * Used when a class is in class_teacher mode and the class teacher changes.
         */
        async autoAssignClassTeacher(schoolId: string, classId: number, teacherId: string | undefined) {
            const active = await eduDb.classSubjects
                .where('schoolId')
                .equals(schoolId)
                .filter((cs) => cs.classId === classId && !cs.isDeleted)
                .toArray();

            const now = Date.now();
            for (const cs of active) {
                await eduDb.classSubjects.update(cs.id!, {
                    teacherId: teacherId,
                    updatedAt: now,
                    syncStatus: 'pending'
                });
            }
        }
    },

    // Fee Management
    fees: {
        async setStructure(structure: FeeStructure) {
            const existing = await eduDb.feeStructures
                .where('[schoolId+classId+term+year]')
                .equals([structure.schoolId, structure.classId, structure.term, structure.year])
                .first();

            if (existing?.id) {
                return await eduDb.feeStructures.update(existing.id, {
                    ...structure,
                    updatedAt: Date.now(),
                    syncStatus: 'pending'
                });
            }

            return await eduDb.feeStructures.add({
                ...structure,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async getStructure(schoolId: string, classId: number, term: string, year: number) {
            return await eduDb.feeStructures
                .where('[schoolId+classId+term+year]')
                .equals([schoolId, classId, term, year])
                .first();
        },

        async getAllStructures(schoolId: string, term: string, year: number) {
            return await eduDb.feeStructures
                .where('schoolId')
                .equals(schoolId)
                .filter((f) => f.term === term && f.year === year)
                .toArray();
        },

        async recordPayment(payment: FeePayment) {
            return await eduDb.feePayments.add({
                ...payment,
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async getPaymentsByStudent(schoolId: string, studentId: number, term: string, year: number) {
            return await eduDb.feePayments
                .where('schoolId')
                .equals(schoolId)
                .filter((p) => p.studentId === studentId && p.term === term && p.year === year)
                .toArray();
        },

        async getPaymentsByTerm(schoolId: string, term: string, year: number, includeVoided = false) {
            const all = await eduDb.feePayments
                .where('schoolId')
                .equals(schoolId)
                .filter((p) => p.term === term && p.year === year)
                .toArray();
            
            return includeVoided ? all : all.filter(p => !p.isVoided);
        },

        async getTermTotalCollected(schoolId: string, term: string, year: number) {
            const payments = await eduDb.feePayments
                .where('schoolId')
                .equals(schoolId)
                .filter((p) => !p.isVoided && p.term === term && p.year === year)
                .toArray();

            return payments.reduce((sum, p) => sum + p.amountPaid, 0);
        },

        async voidPayment(id: number, reason?: string) {
            return await eduDb.feePayments.update(id, {
                isVoided: true,
                notes: reason ? `VOIDED: ${reason}` : 'VOIDED (User initiated)',
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        /**
         * Computes the RESIDUAL arrears a student still owes after accounting for
         * all payments made in PREVIOUS terms.
         *
         * arrears on the student record = the total historic debt brought forward
         * at the time they were enrolled / last updated.
         *
         * When a new term starts, payments made in prior terms have already reduced
         * that arrears figure. This function subtracts those prior-term payments so
         * the current-term balance reflects reality.
         *
         * Returns: max(0, arrears - sumOfPreviousTermPayments)
         */
        async getArrearsBalance(
            schoolId: string,
            studentId: number,
            currentTerm: string,
            currentYear: number,
            rawArrears: number
        ): Promise<number> {
            // Fetch all payments for this student that are NOT in the current term
            // and are NOT voided. 
            const previousPayments = await eduDb.feePayments
                .where('schoolId')
                .equals(schoolId)
                .filter(
                    (p) =>
                        !p.isVoided &&
                        p.studentId === studentId &&
                        !(p.term === currentTerm && p.year === currentYear)
                )
                .toArray();

            const previousTotal = previousPayments.reduce((sum, p) => sum + p.amountPaid, 0);

            // Returns the residual debt (or negative credit if overpaid)
            return rawArrears - previousTotal;
        }
    },

    // Payroll
    payroll: {
        async upsert(record: PayrollRecord) {
            let existing = null;

            if (record.staffIdCloud) {
                existing = await eduDb.payrollRecords
                    .where('[schoolId+staffIdCloud+month+year]')
                    .equals([record.schoolId, record.staffIdCloud, record.month, record.year])
                    .first();
            }

            if (!existing && record.staffId) {
                existing = await eduDb.payrollRecords
                    .where('[schoolId+staffId+month+year]')
                    .equals([record.schoolId, record.staffId, record.month, record.year])
                    .first();
            }

            if (existing?.id) {
                await eduDb.payrollRecords.update(existing.id, {
                    ...record,
                    updatedAt: Date.now(),
                    syncStatus: 'pending'
                });
                return existing.id;
            }

            return await eduDb.payrollRecords.add({
                ...record,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async getByMonth(schoolId: string, month: number, year: number) {
            return await eduDb.payrollRecords
                .where('schoolId')
                .equals(schoolId)
                .filter((r) => r.month === month && r.year === year)
                .toArray();
        },

        async signalReady(id: number) {
            const record = await eduDb.payrollRecords.get(id);
            if (!record) throw new Error("Payroll record not found");
            
            // Generate a random 4-digit code
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            
            return await eduDb.payrollRecords.update(id, {
                status: 'Ready',
                collectionCode: code,
                notifiedAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async confirmPayout(id: number, providedCode: string) {
            const record = await eduDb.payrollRecords.get(id);
            if (!record) throw new Error("Payroll record not found");
            if (record.status !== 'Ready') throw new Error("Record is not ready for collection");
            if (!record.collectionCode || record.collectionCode !== providedCode.trim()) {
                throw new Error("Invalid collection code");
            }
            
            return await eduDb.payrollRecords.update(id, {
                status: 'Paid',
                paidAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async getByStaff(schoolId: string, staffIdUuid: string) {
            // Strict query by Cloud UUID (identity ownership)
            // This ensures same-name staff members remain separated
            return await eduDb.payrollRecords
                .where('staffIdCloud')
                .equals(staffIdUuid)
                .filter((r) => r.schoolId === schoolId)
                .sortBy('year')
                .then((arr) => arr.reverse());
        },

        async getTermTotal(schoolId: string, month: number, year: number) {
            const records = await eduDb.payrollRecords
                .where('schoolId')
                .equals(schoolId)
                .filter((r) => r.month === month && r.year === year && r.status === 'Paid')
                .toArray();

            return records.reduce((sum, r) => sum + r.netPay, 0);
        }
    },

    // Expenses
    expenses: {
        async add(expense: Expense) {
            return await eduDb.expenses.add({
                ...expense,
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        },

        async getAll(schoolId: string, includeVoided = false) {
            const all = await eduDb.expenses.where('schoolId').equals(schoolId).reverse().sortBy('date');
            return includeVoided ? all : all.filter((e) => !e.voided);
        },

        async getByMonth(schoolId: string, month: number, year: number) {
            const start = new Date(year, month - 1, 1).getTime();
            const end = new Date(year, month, 0, 23, 59, 59).getTime();

            return await eduDb.expenses
                .where('schoolId')
                .equals(schoolId)
                .filter((e) => !e.voided && e.date >= start && e.date <= end)
                .toArray();
        },

        async getTermTotal(schoolId: string, term: string, year: number) {
            const termMonths: Record<string, number[]> = {
                'Term 1': [9, 10, 11, 12],
                'Term 2': [1, 2, 3, 4],
                'Term 3': [4, 5, 6, 7, 8]
            };

            const months = termMonths[term] || [];
            const all = await eduDb.expenses.where('schoolId').equals(schoolId).toArray();

            const filtered = all.filter((e) => {
                const d = new Date(e.date);
                return !e.voided && d.getFullYear() === year && months.includes(d.getMonth() + 1);
            });

            return filtered.reduce((sum, e) => sum + e.amount, 0);
        },

        async voidExpense(id: number, reason: string) {
            return await eduDb.expenses.update(id, {
                voided: true,
                voidReason: reason,
                voidedAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
        }
    },

    // Budgets
    budgets: {
        async set(budget: Budget) {
            const existing = await eduDb.budgets
                .where('[schoolId+category+term+year]')
                .equals([budget.schoolId, budget.category || '', budget.term || '', budget.year || 0])
                .first();

            if (existing?.id) {
                return await eduDb.budgets.update(existing.id, {
                    ...budget,
                    updatedAt: Date.now(),
                    syncStatus: 'pending'
                });
            }

            return await eduDb.budgets.add({
                ...budget,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                isDeleted: false,
                syncStatus: 'pending'
            });
        },

        async getAll(schoolId: string, term: string, year: number) {
            return await eduDb.budgets
                .where('schoolId')
                .equals(schoolId)
                .filter((b) => b.term === term && b.year === year && !b.isDeleted)
                .toArray();
        }
    }
};
