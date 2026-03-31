import Dexie, { type EntityTable } from 'dexie';

export interface BaseEntity {
    id?: number;
    createdAt: number;
    updatedAt: number;
    syncStatus: 'pending' | 'synced' | 'failed';
    syncError?: string;
}

export interface Class extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    name: string;
    level: string;
    classTeacherId?: string;
    teachingMode?: 'class_teacher' | 'subject_teacher';
    isDeleted: boolean;
    deletedAt?: number;
}

export interface ClassSubject extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    classId: number;
    subjectId: number;
    teacherId?: string;
    isDeleted: boolean;
}

export interface Subject extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    name: string;
    code?: string;
    category?: string;
    isDeleted: boolean;
}

export interface Student extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    classId?: number | null; // Nullable when unassigned
    studentIdString?: string;
    fullName: string;
    gender?: 'male' | 'female';
    dateOfBirth?: number;
    photo?: Blob;
    religion?: string;
    residentialAddress?: string;
    guardianName?: string;
    guardianPrimaryContact?: string;
    guardianSecondaryContact?: string;
    guardianEmail?: string;
    guardianOccupation?: string;
    isBoarding?: boolean;
    arrears?: number;
    photoUrl?: string; // For cloud synced photo
    isDeleted?: boolean;
    deletedAt?: number;
}

export interface Result extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    studentId: number;
    subjectId: number;
    classId: number;
    classSubjectId: number;
    term: string;
    year: number;
    caScores?: {
        tests: number[];
        exercises: number[];
        assignments: number[];
        projects: number[];
    };
    caTotal: number;
    examScore: number;
    totalScore: number;
    grade?: string;
    remarks?: string;
    status?: 'draft' | 'submitted' | 'approved' | 'locked';
    enteredBy?: string;
    submittedAt?: number;
    approvedBy?: string;
    approvedAt?: number;
    lockedAt?: number;
    isDeleted?: boolean;
}

export interface Attendance extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    studentId: number;
    classId: number;
    date: number;
    status: 'present' | 'absent' | 'late';
    enteredBy?: string;
    isDeleted?: boolean;
}

export interface Setting extends BaseEntity {
    schoolId: string;
    key: string;
    value: any;
    isDeleted?: boolean;
}

export interface FeeStructure extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    classId: number;
    className: string;
    termFeeAmount: number;
    term: string;
    year: number;
    isDeleted?: boolean;
}

export interface FeePayment extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    studentId: number;
    studentName: string;
    classId: number;
    term: string;
    year: number;
    amountPaid: number;
    paymentMethod: 'Cash' | 'MoMo' | 'Bank';
    paymentDate: number;
    notes?: string;
    receiptNo: string;
    isVoided?: boolean;
    isDeleted?: boolean;
}

export interface PayrollRecord extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    staffId: number;
    staffName: string;
    staffRole: string;
    month: number;
    year: number;
    grossSalary: number;
    deductions: number;
    deductionNotes?: string;
    netPay: number;
    paymentMethod: 'Cash' | 'Bank Transfer' | 'MoMo';
    status: 'Paid' | 'Pending';
    paidAt?: number;
    isDeleted?: boolean;
    staffIdCloud?: string; // Resolved Supabase UUID for ownership
}

export interface Expense extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    category: string;
    description: string;
    amount: number;
    date: number;
    receiptNote?: string;
    addedBy?: string;
    voided?: boolean;
    voidReason?: string;
    voidedAt?: number;
    isDeleted?: boolean;
}

export interface Budget extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    category: string;
    term: string;
    year: number;
    targetAmount: number;
    notes?: string;
    isDeleted?: boolean;
}

export interface AssessmentConfig {
    id?: number;
    idCloud?: string;
    schoolId: string;
    year: number;
    term: string;
    numTests: number;
    numExercises: number;
    numAssignments: number;
    numProjects: number;
    testWeight: number;
    exerciseWeight: number;
    assignmentWeight: number;
    projectWeight: number;
    examWeight: number;
    testMaxScore: number;
    exerciseMaxScore: number;
    assignmentMaxScore: number;
    projectMaxScore: number;
    examMaxScore: number;
    caPercentage?: number;
    examPercentage?: number;
    resultsLocked?: boolean;
    caPolicy?: 'sum_all' | 'best_n';
    bestNCount?: number;
    isDeleted?: boolean;
    syncStatus: 'synced' | 'pending' | 'failed';
    createdAt: number;
    updatedAt: number;
}

export interface PromotionRequest {
    id?: number;
    idCloud?: string;
    schoolId: string;
    studentId: number;
    fromClassId: number;
    toClassId: number;
    requestedBy: string; // auth.uid
    reviewedBy?: string;
    status: 'pending' | 'approved' | 'rejected';
    reason?: string;
    reviewNote?: string;
    isDeleted?: boolean;
    syncStatus: 'synced' | 'pending' | 'failed';
    createdAt: number;
    updatedAt: number;
    reviewedAt?: number;
}

export interface ComponentScore extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    studentId: number;
    subjectId: number;
    classId: number;
    classSubjectId: number;
    year: number;
    term: string;
    componentType: 'test' | 'exercise' | 'assignment' | 'project' | 'exam';
    componentNumber: number;
    score: number;
    enteredBy: string;
    status: 'draft' | 'submitted';
    isDeleted?: boolean;
}

export interface Subscription extends BaseEntity {
    schoolId: string;
    idCloud?: string;
    term: string;
    academicYear: string;
    status: string;
    provider?: string;
    paymentReference?: string;
    amountPaid?: number;
    currency?: string;
    paidAt?: number;
    verifiedAt?: number;
    isDeleted?: boolean;
}

const eduDb = new Dexie('LabourEduDB') as Dexie & {
    classes: EntityTable<Class, 'id'>;
    classSubjects: EntityTable<ClassSubject, 'id'>;
    subjects: EntityTable<Subject, 'id'>;
    students: EntityTable<Student, 'id'>;
    results: EntityTable<Result, 'id'>;
    attendance: EntityTable<Attendance, 'id'>;
    settings: EntityTable<Setting, 'id'>;
    assessmentConfigs: EntityTable<AssessmentConfig, 'id'>;
    componentScores: EntityTable<ComponentScore, 'id'>;
    feeStructures: EntityTable<FeeStructure, 'id'>;
    feePayments: EntityTable<FeePayment, 'id'>;
    payrollRecords: EntityTable<PayrollRecord, 'id'>;
    expenses: EntityTable<Expense, 'id'>;
    budgets: EntityTable<Budget, 'id'>;
    subscriptions: EntityTable<Subscription, 'id'>;
    promotionRequests: EntityTable<PromotionRequest, 'id'>;
};

// Older schemas kept for safe upgrades
eduDb.version(7).stores({
    classes: '++id, schoolId, teacherId, name, *subjects, syncStatus',
    subjects: '++id, schoolId, name, code, syncStatus',
    students: '++id, schoolId, classId, studentIdString, fullName, syncStatus',
    results: '++id, schoolId, studentId, subjectId, classId, year, term, syncStatus',
    attendance: '++id, schoolId, studentId, classId, date, syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, schoolId, year, term, [schoolId+year+term], syncStatus',
    componentScores: '++id, schoolId, studentId, subjectId, classId, year, term, componentType, status, syncStatus',
    feeStructures: '++id, schoolId, classId, term, year, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, schoolId, studentId, classId, term, year, syncStatus',
    payrollRecords: '++id, schoolId, staffId, month, year, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, schoolId, category, date, syncStatus'
});

eduDb.version(8).stores({
    classes: '++id, schoolId, teacherId, name, *subjects, syncStatus',
    subjects: '++id, schoolId, name, code, syncStatus',
    students: '++id, schoolId, classId, studentIdString, fullName, syncStatus',
    results: '++id, schoolId, studentId, subjectId, classId, year, term, syncStatus',
    attendance: '++id, schoolId, studentId, classId, date, syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, schoolId, year, term, [schoolId+year+term], syncStatus',
    componentScores: '++id, schoolId, studentId, subjectId, classId, year, term, componentType, status, syncStatus',
    feeStructures: '++id, schoolId, classId, term, year, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, schoolId, studentId, classId, term, year, syncStatus',
    payrollRecords: '++id, schoolId, staffId, month, year, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, schoolId, category, date, syncStatus'
});

eduDb.version(9).stores({
    classes: '++id, schoolId, teacherId, name, *subjects, syncStatus',
    subjects: '++id, schoolId, name, code, syncStatus',
    students: '++id, schoolId, classId, studentIdString, fullName, syncStatus',
    results: '++id, schoolId, studentId, subjectId, classId, year, term, syncStatus',
    attendance: '++id, schoolId, studentId, classId, date, [schoolId+classId+date], syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, schoolId, year, term, [schoolId+year+term], syncStatus',
    componentScores: '++id, schoolId, studentId, subjectId, classId, year, term, componentType, status, syncStatus',
    feeStructures: '++id, schoolId, classId, term, year, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, schoolId, studentId, classId, term, year, syncStatus',
    payrollRecords: '++id, schoolId, staffId, month, year, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, schoolId, category, date, syncStatus'
});

eduDb.version(11).stores({
    classes: '++id, schoolId, teacherId, name, *subjects, syncStatus',
    subjects: '++id, schoolId, name, code, syncStatus',
    students: '++id, schoolId, classId, studentIdString, fullName, syncStatus',
    results: '++id, schoolId, studentId, subjectId, classId, year, term, syncStatus',
    attendance: '++id, schoolId, studentId, classId, date, [schoolId+classId+date], syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, schoolId, year, term, [schoolId+year+term], syncStatus',
    componentScores: '++id, schoolId, studentId, subjectId, classId, year, term, componentType, status, syncStatus',
    feeStructures: '++id, schoolId, classId, term, year, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, schoolId, studentId, classId, term, year, syncStatus',
    payrollRecords: '++id, schoolId, staffId, month, year, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, schoolId, category, date, syncStatus',
    subscriptions: '++id, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
});

// Version 12: normalized class system
eduDb.version(12).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, schoolId, classId, studentIdString, fullName, syncStatus',
    results: '++id, schoolId, studentId, subjectId, classId, year, term, syncStatus',
    attendance: '++id, schoolId, studentId, classId, date, [schoolId+classId+date], syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, schoolId, year, term, [schoolId+year+term], syncStatus',
    componentScores: '++id, schoolId, studentId, subjectId, classId, year, term, componentType, status, syncStatus',
    feeStructures: '++id, schoolId, classId, term, year, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, schoolId, studentId, classId, term, year, syncStatus',
    payrollRecords: '++id, schoolId, staffId, month, year, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, schoolId, category, date, syncStatus',
    subscriptions: '++id, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
}).upgrade(tx => {
    tx.table('classes').toCollection().modify((cls: any) => {
        if (cls.teacherId !== undefined) {
            cls.classTeacherId = cls.teacherId;
            delete cls.teacherId;
        }
        if (cls.isDeleted === undefined) {
            cls.isDeleted = false;
        }
        if (!cls.syncStatus) {
            cls.syncStatus = 'pending';
        }
        if (!cls.level) {
            cls.level = '';
        }
        if (!cls.createdAt) {
            cls.createdAt = Date.now();
        }
        cls.updatedAt = Date.now();
    });

    tx.table('subjects').toCollection().modify((sub: any) => {
        if (sub.isDeleted === undefined) {
            sub.isDeleted = false;
        }
        if (!sub.syncStatus) {
            sub.syncStatus = 'pending';
        }
        if (!sub.createdAt) {
            sub.createdAt = Date.now();
        }
        sub.updatedAt = Date.now();
    });
});

// Version 13: Added idCloud and isDeleted to students
eduDb.version(13).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, schoolId, studentId, subjectId, classId, year, term, syncStatus',
    attendance: '++id, schoolId, studentId, classId, date, [schoolId+classId+date], syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, schoolId, year, term, [schoolId+year+term], syncStatus',
    componentScores: '++id, schoolId, studentId, subjectId, classId, year, term, componentType, status, syncStatus',
    feeStructures: '++id, schoolId, classId, term, year, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, schoolId, studentId, classId, term, year, syncStatus',
    payrollRecords: '++id, schoolId, staffId, month, year, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, schoolId, category, date, syncStatus',
    subscriptions: '++id, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
}).upgrade(tx => {
    tx.table('students').toCollection().modify((student: any) => {
        if (student.name && !student.fullName) student.fullName = student.name;
        if (student.studentId && !student.studentIdString) student.studentIdString = student.studentId;
        if (student.guardian) {
            if (!student.guardianName && student.guardian.name) student.guardianName = student.guardian.name;
            if (!student.guardianPrimaryContact && student.guardian.contact1) student.guardianPrimaryContact = student.guardian.contact1;
            if (!student.guardianSecondaryContact && student.guardian.contact2) student.guardianSecondaryContact = student.guardian.contact2;
            if (!student.guardianEmail && student.guardian.email) student.guardianEmail = student.guardian.email;
            if (!student.guardianOccupation && student.guardian.work) student.guardianOccupation = student.guardian.work;
            delete student.guardian;
        }
        delete student.name;
        delete student.studentId;

        if (student.isDeleted === undefined) {
            student.isDeleted = false;
        }
        if (!student.createdAt) {
            student.createdAt = Date.now();
        }
    });
});


// Version 14: Added idCloud and isDeleted to results and scores
eduDb.version(14).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, year, term, isDeleted, syncStatus, [classId+subjectId]',
    attendance: '++id, schoolId, studentId, classId, date, [schoolId+classId+date], syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, schoolId, classId, term, year, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, schoolId, studentId, classId, term, year, syncStatus',
    payrollRecords: '++id, schoolId, staffId, month, year, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, schoolId, category, date, syncStatus',
    subscriptions: '++id, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
}).upgrade(tx => {
    tx.table('results').toCollection().modify((result: any) => {
        if (result.isDeleted === undefined) {
            result.isDeleted = false;
        }
        if (typeof result.enteredBy === 'number') {
            result.enteredBy = result.enteredBy.toString();
        }
    });

    tx.table('componentScores').toCollection().modify((score: any) => {
        if (score.isDeleted === undefined) {
            score.isDeleted = false;
        }
        if (typeof score.enteredBy === 'number') {
            score.enteredBy = score.enteredBy.toString();
        }
    });

    tx.table('assessmentConfigs').toCollection().modify((config: any) => {
        if (config.isDeleted === undefined) {
            config.isDeleted = false;
        }
    });
});

// Version 16: Enhanced attendance tracking
eduDb.version(16).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, schoolId, classId, term, year, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, schoolId, studentId, classId, term, year, syncStatus',
    payrollRecords: '++id, schoolId, staffId, month, year, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, schoolId, category, date, syncStatus',
    subscriptions: '++id, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
}).upgrade(tx => {
    // Migration logic for classSubjectId
    tx.table('results').toCollection().modify(async (result: any) => {
        if (!result.classSubjectId) {
            const cs = await eduDb.classSubjects.where({
                classId: result.classId,
                subjectId: result.subjectId
            }).first();
            if (cs) result.classSubjectId = cs.id;
        }
    });
    tx.table('componentScores').toCollection().modify(async (score: any) => {
        if (!score.classSubjectId) {
            const cs = await eduDb.classSubjects.where({
                classId: score.classId,
                subjectId: score.subjectId
            }).first();
            if (cs) score.classSubjectId = cs.id;
        }
    });
});

// Version 17: Financial Enhancements & Budgeting
eduDb.version(17).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, idCloud, schoolId, classId, term, year, isDeleted, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, idCloud, schoolId, studentId, classId, term, year, isDeleted, syncStatus',
    payrollRecords: '++id, idCloud, schoolId, staffId, month, year, isDeleted, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, idCloud, schoolId, category, date, isDeleted, syncStatus',
    budgets: '++id, idCloud, schoolId, category, term, year, isDeleted, [schoolId+category+term+year], syncStatus',
    subscriptions: '++id, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
}).upgrade(tx => {
    // Add isDeleted to financial tables if missing
    tx.table('feeStructures').toCollection().modify(f => { if (f.isDeleted === undefined) f.isDeleted = false; });
    tx.table('feePayments').toCollection().modify(f => { if (f.isDeleted === undefined) f.isDeleted = false; });
    tx.table('payrollRecords').toCollection().modify(f => { if (f.isDeleted === undefined) f.isDeleted = false; });
    tx.table('expenses').toCollection().modify(f => { if (f.isDeleted === undefined) f.isDeleted = false; });
});

// Version 18: Added idCloud index to settings and subscriptions
eduDb.version(18).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, idCloud, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, idCloud, schoolId, classId, term, year, isDeleted, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, idCloud, schoolId, studentId, classId, term, year, isDeleted, syncStatus',
    payrollRecords: '++id, idCloud, schoolId, staffId, month, year, isDeleted, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, idCloud, schoolId, category, date, isDeleted, syncStatus',
    budgets: '++id, idCloud, schoolId, category, term, year, isDeleted, [schoolId+category+term+year], syncStatus',
    subscriptions: '++id, idCloud, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
});

// Version 19: Added teachingMode to classes
eduDb.version(19).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, teachingMode, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, idCloud, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, idCloud, schoolId, classId, term, year, isDeleted, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, idCloud, schoolId, studentId, classId, term, year, isDeleted, syncStatus',
    payrollRecords: '++id, idCloud, schoolId, staffId, month, year, isDeleted, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, idCloud, schoolId, category, date, isDeleted, syncStatus',
    budgets: '++id, idCloud, schoolId, category, term, year, isDeleted, [schoolId+category+term+year], syncStatus',
    subscriptions: '++id, idCloud, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
}).upgrade(tx => {
    tx.table('classes').toCollection().modify((cls: any) => {
        if (!cls.teachingMode) {
            cls.teachingMode = 'class_teacher';
        }
    });
});

// Version 20: Deduplicate Students
eduDb.version(20).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, teachingMode, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, idCloud, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, idCloud, schoolId, classId, term, year, isDeleted, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, idCloud, schoolId, studentId, classId, term, year, isDeleted, syncStatus',
    payrollRecords: '++id, idCloud, schoolId, staffId, month, year, isDeleted, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, idCloud, schoolId, category, date, isDeleted, syncStatus',
    budgets: '++id, idCloud, schoolId, category, term, year, isDeleted, [schoolId+category+term+year], syncStatus',
    subscriptions: '++id, idCloud, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
}).upgrade(async tx => {
    const students = await tx.table('students').toArray();
    const seenIds = new Set<string>();
    const toDelete: number[] = [];

    // Sort by descending last updated so we keep the newest record
    students.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    for (const st of students) {
        let isDuplicate = false;
        
        if (st.idCloud) {
            if (seenIds.has(st.idCloud)) isDuplicate = true;
            else seenIds.add(st.idCloud);
        }
        
        if (st.studentIdString && !isDuplicate) {
            if (seenIds.has(st.studentIdString)) isDuplicate = true;
            else seenIds.add(st.studentIdString);
        }

        if (isDuplicate) {
            toDelete.push(st.id!);
        }
    }

    if (toDelete.length > 0) {
        console.log(`[db] Schema v20: Deduplicating ${toDelete.length} students.`);
        await tx.table('students').bulkDelete(toDelete);
    }
});

// Version 21: Force Student Deduplication cleanup again
eduDb.version(21).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, teachingMode, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, idCloud, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, idCloud, schoolId, classId, term, year, isDeleted, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, idCloud, schoolId, studentId, classId, term, year, isDeleted, syncStatus',
    payrollRecords: '++id, idCloud, schoolId, staffId, month, year, isDeleted, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, idCloud, schoolId, category, date, isDeleted, syncStatus',
    budgets: '++id, idCloud, schoolId, category, term, year, isDeleted, [schoolId+category+term+year], syncStatus',
    subscriptions: '++id, idCloud, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus'
}).upgrade(async tx => {
    const students = await tx.table('students').toArray();
    const seenNames = new Set<string>();
    const toDelete: number[] = [];

    // Sort by descending last updated so we keep the newest record
    students.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    for (const st of students) {
        let isDuplicate = false;
        
        // Match strictly by unique generated cloud ID
        if (st.idCloud) {
            if (seenNames.has(st.idCloud)) isDuplicate = true;
            else seenNames.add(st.idCloud);
        } else if (st.fullName) {
            // Aggressive fallback to wipe name duplicates (for safety)
            const nameKey = `${st.schoolId}-${st.fullName.toLowerCase().trim()}`;
            if (seenNames.has(nameKey)) isDuplicate = true;
            else seenNames.add(nameKey);
        }

        if (isDuplicate) {
            toDelete.push(st.id!);
        }
    }

    if (toDelete.length > 0) {
        console.log(`[db] Schema v21: Deduplicating ${toDelete.length} students.`);
        await tx.table('students').bulkDelete(toDelete);
    }
});

// Version 22: Add Promotion Requests
eduDb.version(22).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, teachingMode, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, idCloud, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, idCloud, schoolId, classId, term, year, isDeleted, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, idCloud, schoolId, studentId, classId, term, year, isDeleted, syncStatus',
    payrollRecords: '++id, idCloud, schoolId, staffId, month, year, isDeleted, [schoolId+staffId+month+year], status, syncStatus',
    expenses: '++id, idCloud, schoolId, category, date, isDeleted, syncStatus',
    budgets: '++id, idCloud, schoolId, category, term, year, isDeleted, [schoolId+category+term+year], syncStatus',
    subscriptions: '++id, idCloud, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus',
    promotionRequests: '++id, idCloud, schoolId, studentId, fromClassId, toClassId, status, syncStatus, isDeleted'
});

// Version 23: Strict Permanent Student Deduplication (No fullName fallback)
eduDb.version(23).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, teachingMode, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, idCloud, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, idCloud, schoolId, classId, term, year, isDeleted, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, idCloud, schoolId, studentId, classId, term, year, isDeleted, syncStatus',
    payrollRecords: '++id, idCloud, schoolId, staffId, staffIdCloud, month, year, isDeleted, [schoolId+staffId+month+year], [schoolId+staffIdCloud+month+year], status, syncStatus',
    expenses: '++id, idCloud, schoolId, category, date, isDeleted, syncStatus',
    budgets: '++id, idCloud, schoolId, category, term, year, isDeleted, [schoolId+category+term+year], syncStatus',
    subscriptions: '++id, idCloud, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus',
    promotionRequests: '++id, idCloud, schoolId, studentId, fromClassId, toClassId, status, syncStatus, isDeleted'
}).upgrade(async tx => {
    const students = await tx.table('students').toArray();
    
    // Group by idCloud OR normalized studentIdString (if valid)
    const groups = new Map<string, any[]>();

    for (const st of students) {
        let key = null;
        if (st.idCloud && st.idCloud.trim()) {
            key = `cloud_${st.idCloud.trim()}`;
        } else if (st.studentIdString && st.studentIdString.trim() && st.studentIdString !== 'undefined') {
            key = `local_${st.schoolId}_${st.studentIdString.trim().toLowerCase()}`;
        }
        
        if (key) {
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(st);
        }
    }

    const toDelete: number[] = [];
    let mergedCount = 0;

    for (const [key, group] of groups.entries()) {
        if (group.length <= 1) continue;

        console.log(`[db:migration:v23] Found ${group.length} duplicates for key ${key}. Canonical selection started.`);

        // Sort the group by our priority rules:
        // 1. Has idCloud (1) over no idCloud (0)
        // 2. Not deleted (1) over deleted (0)
        // 3. Rich metadata points (count of optional fields like photo, arrears, contact)
        // 4. Most recent updatedAt
        group.sort((a, b) => {
            const aCloud = a.idCloud ? 1 : 0;
            const bCloud = b.idCloud ? 1 : 0;
            if (aCloud !== bCloud) return bCloud - aCloud;

            const aActive = !a.isDeleted ? 1 : 0;
            const bActive = !b.isDeleted ? 1 : 0;
            if (aActive !== bActive) return bActive - aActive;

            const aRichness = (a.photo ? 1 : 0) + (a.arrears ? 1 : 0) + (a.guardianPrimaryContact ? 1 : 0);
            const bRichness = (b.photo ? 1 : 0) + (b.arrears ? 1 : 0) + (b.guardianPrimaryContact ? 1 : 0);
            if (aRichness !== bRichness) return bRichness - aRichness;

            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });

        const canonical = group[0];
        const duplicates = group.slice(1);
        
        let needsUpdate = false;

        // Safely merge missing fields from duplicates into canonical
        for (const duplicate of duplicates) {
            if (!canonical.photo && duplicate.photo) { canonical.photo = duplicate.photo; needsUpdate = true; }
            if (!canonical.photoUrl && duplicate.photoUrl) { canonical.photoUrl = duplicate.photoUrl; needsUpdate = true; }
            if ((canonical.arrears === undefined || canonical.arrears === 0) && duplicate.arrears) { canonical.arrears = duplicate.arrears; needsUpdate = true; }
            if (!canonical.guardianPrimaryContact && duplicate.guardianPrimaryContact) { canonical.guardianPrimaryContact = duplicate.guardianPrimaryContact; needsUpdate = true; }
            
            toDelete.push(duplicate.id!);
            console.log(`[db:migration:v23]   -> Deleting local duplicate ID: ${duplicate.id} (${duplicate.fullName}). Merged into Canonical ID: ${canonical.id}.`);
        }

        if (needsUpdate) {
            canonical.updatedAt = Date.now();
            await tx.table('students').put(canonical);
            mergedCount++;
        }
    }

    if (toDelete.length > 0) {
        console.log(`[db:migration:v23] Complete. Safely merged ${mergedCount} canonicals. Removing ${toDelete.length} redundant duplicate records.`);
        await tx.table('students').bulkDelete(toDelete);
    } else {
        console.log(`[db:migration:v23] No valid duplicates found requiring cleanup.`);
    }
});

// Version 24: Paystack verification fields
eduDb.version(24).stores({
    classes: '++id, idCloud, schoolId, classTeacherId, name, level, teachingMode, isDeleted, syncStatus, [schoolId+name+level]',
    classSubjects: '++id, idCloud, schoolId, classId, subjectId, teacherId, isDeleted, syncStatus, [classId+subjectId]',
    subjects: '++id, idCloud, schoolId, name, code, isDeleted, syncStatus, [schoolId+name]',
    students: '++id, idCloud, schoolId, classId, studentIdString, fullName, isDeleted, syncStatus, [schoolId+studentIdString]',
    results: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, isDeleted, syncStatus, [classId+subjectId], [studentId+classSubjectId+term+year]',
    attendance: '++id, idCloud, schoolId, studentId, classId, date, [schoolId+classId+date], [schoolId+studentId+date], syncStatus',
    settings: '++id, idCloud, schoolId, key, [schoolId+key], syncStatus',
    assessmentConfigs: '++id, idCloud, schoolId, year, term, isDeleted, [schoolId+year+term], syncStatus',
    componentScores: '++id, idCloud, schoolId, studentId, subjectId, classId, classSubjectId, year, term, componentType, status, isDeleted, syncStatus',
    feeStructures: '++id, idCloud, schoolId, classId, term, year, isDeleted, [schoolId+classId+term+year], syncStatus',
    feePayments: '++id, idCloud, schoolId, studentId, classId, term, year, isDeleted, syncStatus',
    payrollRecords: '++id, idCloud, schoolId, staffId, staffIdCloud, month, year, isDeleted, [schoolId+staffId+month+year], [schoolId+staffIdCloud+month+year], status, syncStatus', // idCloud included for staffIdCloud in v23+
    expenses: '++id, idCloud, schoolId, category, date, isDeleted, syncStatus',
    budgets: '++id, idCloud, schoolId, category, term, year, isDeleted, [schoolId+category+term+year], syncStatus',
    subscriptions: '++id, idCloud, schoolId, term, academicYear, status, verifiedAt, [schoolId+term+academicYear], syncStatus',
    promotionRequests: '++id, idCloud, schoolId, studentId, fromClassId, toClassId, status, syncStatus, isDeleted'
});

export { eduDb };

