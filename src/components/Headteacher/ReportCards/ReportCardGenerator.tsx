import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db';
import type { FeeStructure, FeePayment } from '../../../eduDb';
import { eduDb } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import { useAcademicSession } from '../../../hooks/useAcademicSession';
import { assignGrade } from '../../../utils/assessmentCalculator';
import ReportCardTemplate, { type ReportCardData } from './ReportCardTemplate';
import { attendanceService } from '../../../services/attendanceService';

/* ─── helpers ─── */
const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.readAsDataURL(blob);
    });


interface Props {
    initialClassId?: string;
    initialStudentId?: string;
}

/* ─── component ─── */
const ReportCardGenerator: React.FC<Props> = ({ initialClassId, initialStudentId }) => {
    const { user } = useAuth();
    const { currentTerm, currentYear, academicYear, isLoaded } = useAcademicSession();
    const printRef = useRef<HTMLDivElement>(null);

    const [selectedClassId, setSelectedClassId] = useState(initialClassId || '');
    const [selectedTerm, setSelectedTerm] = useState('Term 1');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [mode, setMode] = useState<'all' | 'individual'>(initialStudentId ? 'individual' : 'all');
    const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId || '');
    const [isBuilding, setIsBuilding] = useState(false);
    const [cards, setCards] = useState<ReportCardData[]>([]);
    const [previewing, setPreviewing] = useState(false);

    // Sync to headteacher's active session once loaded
    useEffect(() => {
        if (isLoaded) {
            setSelectedTerm(currentTerm);
            setSelectedYear(currentYear);
        }
    }, [isLoaded, currentTerm, currentYear]);

    // Handle deep-link prop changes
    useEffect(() => {
        if (initialClassId) setSelectedClassId(initialClassId);
        if (initialStudentId) {
            setSelectedStudentId(initialStudentId);
            setMode('individual');
        }
    }, [initialClassId, initialStudentId]);

    /* live data */
    const classes = useLiveQuery(() =>
        user?.schoolId ? eduDb.classes.where('schoolId').equals(user.schoolId).filter(c => !(c as any).isDeleted).toArray() : []
        , [user?.schoolId]);

    const selectedClass = classes?.find(c => c.id === parseInt(selectedClassId));

    const studentsInClass = useLiveQuery(async () => {
        if (!selectedClassId || !user?.schoolId) return [];
        const raw = await eduDb.students
            .where('classId').anyOf([Number(selectedClassId), String(selectedClassId)])
            .and(s => s.schoolId === user.schoolId! && !s.isDeleted)
            .toArray();
            
        const seen = new Set<string>();
        return raw.filter(s => {
            if (!s.fullName) return true;
            // Robust deduplication: prioritize records that have an idCloud or studentIdString
            const name = s.fullName.trim().toLowerCase();
            if (seen.has(name)) return false;
            
            // If there's another record with the same name, we keep this one if it looks "newer" 
            // or more likely to be the "real" one (has cloud ID).
            const isDuplicate = raw.some(other => 
                other.id !== s.id && 
                other.fullName?.trim().toLowerCase() === name &&
                (other.idCloud || other.studentIdString) && 
                !(s.idCloud || s.studentIdString)
            );
            
            if (isDuplicate) return false;

            seen.add(name);
            return true;
        });
    }, [selectedClassId, user?.schoolId]);

    const schoolData = useLiveQuery(async () => {
        if (!user?.schoolId) return null;
        return await db.schools
            .where('schoolId').equals(user.schoolId)
            .or('idCloud').equals(user.schoolId)
            .first();
    }, [user?.schoolId]);

    const headteacher = useLiveQuery(async () => {
        if (!user?.schoolId) return null;
        return await db.users.where({ schoolId: user.schoolId, role: 'HEADTEACHER' }).first();
    }, [user?.schoolId]);

    const classTeacher = useLiveQuery(async () => {
        if (!selectedClass) return null;

        // 1. Priority: Use the official classTeacherId if assigned to the class record
        if (selectedClass.classTeacherId) {
            const officialTeacher = await db.users.where('idCloud').equals(selectedClass.classTeacherId).first() || 
                                   await db.users.where('username').equals(selectedClass.classTeacherId).first();
            if (officialTeacher) return officialTeacher;
        }

        // 2. Fallback: Find teacher assignment from any subject in this class
        const assignments = await eduDb.classSubjects
            .where('classId')
            .equals(selectedClass.id!)
            .toArray();

        if (assignments.length === 0) return null;

        const teacherId = assignments[0].teacherId;
        if (!teacherId) return null;
        return await db.users.where('idCloud').equals(teacherId).first() || await db.users.where('username').equals(teacherId).first();
    }, [selectedClass?.id, selectedClass?.classTeacherId]);

    const globalTermDates = useLiveQuery(() => 
        user?.schoolId ? eduDb.settings
            .where('schoolId').equals(user.schoolId)
            .and(s => s.key === 'vacationDate' || s.key === 'termStartDate' || s.key === 'nextTermBegins')
            .toArray() : []
    , [user?.schoolId]);

    const termStartDateVal = globalTermDates?.find(d => d.key === 'termStartDate')?.value;
    const vacationDateVal = globalTermDates?.find(d => d.key === 'vacationDate')?.value;
    const nextTermBeginsVal = globalTermDates?.find(d => d.key === 'nextTermBegins')?.value;

    /* ── build report card data ── */
    const buildCards = async () => {
        if (!user?.schoolId || !selectedClassId || !studentsInClass || studentsInClass.length === 0) return;
        setIsBuilding(true);
        try {
            // School logo
            let schoolLogoUrl: string | undefined;
            if (schoolData?.logo) schoolLogoUrl = await blobToDataUrl(schoolData.logo);

            // Fetch Grading System
            const gradingSetting = await eduDb.settings
                .where('[schoolId+key]')
                .equals([user.schoolId, 'gradingSystem'])
                .first();
            const gradingSystem = gradingSetting?.value || [];

            if (gradingSystem.length === 0) {
                console.warn("No grading system found in settings.");
            }

            // Fetch Report Customization Config
            const reportConfigSetting = await eduDb.settings
                .where('[schoolId+key]')
                .equals([user.schoolId, 'report_config'])
                .first();
            const reportConfig = reportConfigSetting?.value;

            // Subjects for the class (from classSubjects)
            const classAssignments = selectedClass ? await eduDb.classSubjects
                .where('classId')
                .equals(selectedClass.id!)
                .toArray() : [];

            const subIds = [...new Set(classAssignments.map(a => a.subjectId))];
            const subjects = subIds.length > 0 ? await eduDb.subjects.where('id').anyOf(subIds).toArray() : [];

            // All results for this class/term/year
            const allStudentIds = studentsInClass.map(s => s.id!);
            const allResults = await eduDb.results
                .where('schoolId').equals(user.schoolId)
                .and(r =>
                    allStudentIds.includes(r.studentId) &&
                    r.term === selectedTerm &&
                    r.year === selectedYear &&
                    (r.status === 'approved' || r.status === 'locked')
                )
                .toArray();

            // Fee structure for this class/term/year
            const feeStructure: FeeStructure | undefined = await eduDb.feeStructures
                .where('schoolId').equals(user.schoolId)
                .and(f => f.classId === parseInt(selectedClassId) && f.term === selectedTerm && f.year === selectedYear)
                .first();

            // All fee payments for these students this term/year
            const allFeePayments: FeePayment[] = feeStructure
                ? await eduDb.feePayments
                    .where('schoolId').equals(user.schoolId)
                    .and(p => allStudentIds.includes(p.studentId) && p.term === selectedTerm && p.year === selectedYear)
                    .toArray()
                : [];

            // Which students to render
            const targetStudents = mode === 'individual' && selectedStudentId
                ? studentsInClass.filter(s => s.id === parseInt(selectedStudentId))
                : studentsInClass;

            // Compute grand totals per student for ranking
            const studentTotals: { id: number; total: number }[] = targetStudents.map(s => {
                const sResults = allResults.filter(r => r.studentId === s.id);
                return { id: s.id!, total: sResults.reduce((sum, r) => sum + (r.totalScore ?? 0), 0) };
            });
            studentTotals.sort((a, b) => b.total - a.total);

            // Load teacher remarks for target students
            const remarkKeyFor = (studentId: number) =>
                `teacher_remark__${studentId}__${selectedTerm}__${selectedYear}`;
            const remarkKeys = targetStudents.map(s => remarkKeyFor(s.id!));
            const remarkSettings = await eduDb.settings
                .where('schoolId').equals(user.schoolId)
                .and(s => remarkKeys.includes(s.key))
                .toArray();
            const remarksMap: Record<number, string> = {};
            for (const s of targetStudents) {
                const setting = remarkSettings.find(r => r.key === remarkKeyFor(s.id!));
                if (setting?.value) remarksMap[s.id!] = setting.value;
            }

            // Fetch dates for vacation and next term starts
            const termDates = await eduDb.settings
                .where('schoolId').equals(user.schoolId)
                .and(s => s.key === 'vacationDate' || s.key === 'nextTermBegins' || s.key === 'termStartDate')
                .toArray();
            const vacationDateVal = termDates.find(d => d.key === 'vacationDate')?.value;
            const nextTermBeginsVal = termDates.find(d => d.key === 'nextTermBegins')?.value;
            // Fetch Term 3 Promotion Requests to attach status to the report cards
            let approvedPromotions: any[] = [];
            if (selectedTerm.toLowerCase().includes('term 3')) {
                approvedPromotions = await eduDb.promotionRequests
                    .where('schoolId').equals(user.schoolId)
                    .filter(pr => pr.status === 'approved' && !pr.isDeleted)
                    .toArray();
            }
            const allClassesMap = Object.fromEntries((classes || []).map(c => [c.id, c.name]));

            const built: ReportCardData[] = [];

            for (const student of targetStudents) {
                // Photo
                let photoUrl: string | undefined;
                if (student.photo) {
                    photoUrl = await blobToDataUrl(student.photo);
                }

                // Map results to subject rows
                const subjectRows = subjects.map(sub => {
                    const result = allResults.find(r => r.studentId === student.id && r.subjectId === sub.id);
                    const caTotal = result?.caTotal ?? 0;
                    const examScore = result?.examScore ?? 0;
                    const totalScore = result?.totalScore ?? 0;

                    // Use saved grade/remark if present, otherwise calculate
                    const gradeInfo = assignGrade(totalScore, gradingSystem);
                    const grade = result?.grade ?? gradeInfo.grade;
                    const remarks = result?.remarks ?? gradeInfo.remark;

                    return { subjectName: sub.name, caTotal, examScore, totalScore, grade, remarks };
                });

                const totalScoreSum = subjectRows.reduce((sum, r) => sum + r.totalScore, 0);
                const rank = studentTotals.findIndex(t => t.id === student.id) + 1;
                const avgScore = subjects.length > 0 ? totalScoreSum / subjects.length : 0;

                const overallPerformance = assignGrade(avgScore, gradingSystem);
                const overallGrade = overallPerformance.grade;

                // Teacher remark: use saved one if exists, otherwise fall back to auto remark
                const teacherRemark = remarksMap[student.id!] || overallPerformance.remark;

                // Attendance calculation using service
                let attendance: ReportCardData['attendance'] | undefined;
                if (termStartDateVal && vacationDateVal) {
                    // Normalize to UTC-like comparison or start-of-day absolute timestamps
                    // We use the 'YYYY-MM-DD' parser from syncService logic to be consistent
                    const parseLocalDate = (dateStr: string) => {
                        if (!dateStr) return 0;
                        const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
                        return new Date(y, m - 1, d).setHours(0, 0, 0, 0);
                    };

                    const startTs = parseLocalDate(termStartDateVal);
                    const endTs = parseLocalDate(vacationDateVal) + (24 * 60 * 60 * 1000 - 1); // include full end day
                    
                    const stats = await attendanceService.getStudentStats(student.id!, startTs, endTs);
                    
                    attendance = { 
                        present: stats.present, 
                        late: stats.late, 
                        absent: stats.absent, 
                        total: stats.total, 
                        percentage: stats.attendancePercentage 
                    };
                }

                // Financial info
                let feeInfo: ReportCardData['feeInfo'] | undefined;
                if (feeStructure) {
                    const studentPayments = allFeePayments
                        .filter(p => p.studentId === student.id)
                        .sort((a, b) => b.paymentDate - a.paymentDate);
                    const feeDue = feeStructure.termFeeAmount;
                    const feePaid = studentPayments.reduce((sum, p) => sum + p.amountPaid, 0);
                    const feeBalance = feeDue - feePaid;
                    const status: 'Paid' | 'Partial' | 'Unpaid' | 'Overpaid' =
                        feePaid === 0 ? 'Unpaid'
                            : feeBalance < 0 ? 'Overpaid'
                                : feeBalance === 0 ? 'Paid'
                                    : 'Partial';
                    feeInfo = {
                        feeDue,
                        feePaid,
                        feeBalance,
                        status,
                        lastPaymentMethod: studentPayments[0]?.paymentMethod,
                    };
                } else {
                    feeInfo = {
                        feeDue: 0,
                        feePaid: 0,
                        feeBalance: 0,
                        status: 'Unpaid',
                    };
                }

                // Promotion formatting
                let promotionStatus: string | undefined;
                if (selectedTerm.toLowerCase().includes('term 3')) {
                    // Check if they had an approved promotion from this class
                    const promo = approvedPromotions.find(pr => pr.studentId === student.id && pr.fromClassId === parseInt(selectedClassId));
                    if (promo) {
                        promotionStatus = `Promoted to: ${allClassesMap[promo.toClassId] || 'Next Class'}`;
                    } else {
                        promotionStatus = `To continue in: ${selectedClass?.name || 'Same Class'}`;
                    }
                }

                built.push({
                    schoolName: schoolData?.schoolName ?? 'School',
                    schoolLogo: schoolLogoUrl,
                    motto: schoolData?.motto,
                    district: schoolData?.district ?? '',
                    region: schoolData?.region ?? '',
                    schoolType: schoolData?.schoolType ?? 'Basic School',
                    term: selectedTerm,
                    year: selectedYear,
                    studentName: student.fullName,
                    studentId: student.studentIdString || student.idCloud || `STU-${student.id}`,
                    className: selectedClass?.name ?? '',
                    studentPhoto: photoUrl,
                    subjects: subjectRows,
                    totalScoreSum,
                    position: rank,
                    totalStudents: targetStudents.length,
                    overallGrade,
                    overallRemarks: teacherRemark,
                    headteacherName: headteacher?.fullName ?? schoolData?.headteacherName ?? 'Headteacher',
                    classTeacherName: classTeacher?.fullName ?? 'Class Teacher',
                    nextTermStarts: nextTermBeginsVal,
                    vacationDate: vacationDateVal,
                    attendance,
                    feeInfo,
                    promotionStatus,
                    config: reportConfig,
                });
            }

            setCards(built);
            setPreviewing(true);
        } catch (err) {
            console.error('Error building report cards:', err);
        } finally {
            setIsBuilding(false);
        }
    };

    /* ── print ── */
    const handlePrint = () => {
        window.print();
    };

    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

    const isReady = selectedClassId && (mode === 'all' || selectedStudentId);

    /* ── render ── */
    return (
        <div className="space-y-5 animate-fadeIn">
            {/* Print styles (only visible during window.print) */}
            <style>{`
                @media print {
                    /* Final Strategy: Hide the entire app root and show ONLY the portal content */
                    #root {
                        display: none !important;
                    }

                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        height: auto !important;
                        background: white !important;
                        overflow: visible !important;
                    }

                    /* 
                       THE PORTAL BREAK-OUT:
                       Since the print area is now at the document root (outside #root),
                       we can show it exclusively while hiding the entire app.
                    */
                    #report-print-area {
                        display: block !important;
                        visibility: visible !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 210mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        z-index: 999999 !important;
                        background: white !important;
                        opacity: 1 !important;
                        transform: none !important;
                    }

                    #report-print-area * {
                        visibility: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    .report-card-page {
                        width: 210mm !important;
                        min-height: 297mm !important;
                        page-break-after: always !important;
                        page-break-inside: avoid !important;
                        display: flex !important;
                        flex-direction: column !important;
                        box-sizing: border-box !important;
                        padding: 6mm 10mm !important;
                        overflow: visible !important;
                        background: white !important;
                    }

                    .report-card-page:last-child {
                        page-break-after: auto !important;
                    }

                    @page {
                        size: A4 portrait;
                        margin: 0; 
                    }
                }
            `}</style>

            {/* ── Page Header ── */}
            <div className="border-b border-gray-100 pb-4 flex items-start justify-between gap-4 no-print">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <i className="fas fa-id-card text-blue-500" />
                        Report Cards
                    </h2>
                    <p className="text-gray-400 text-sm mt-0.5">Generate printable academic report cards for learners.</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Active session badge */}
                    <div className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-black">
                        <i className="fas fa-calendar-alt text-indigo-400" />
                        {academicYear} &bull; {currentTerm}
                    </div>
                    {previewing && (
                        <button
                            onClick={() => { setPreviewing(false); setCards([]); }}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                        >
                            <i className="fas fa-arrow-left" /> Back
                        </button>
                    )}
                </div>
            </div>

            {!previewing ? (
                /* ── Selection Form ── */
                <div className="space-y-4 no-print">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        {/* Class */}
                        <div className="space-y-1">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Class</label>
                            <select
                                value={selectedClassId}
                                onChange={e => { setSelectedClassId(e.target.value); setSelectedStudentId(''); setCards([]); }}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-sm font-medium text-gray-700"
                            >
                                <option value="">Select Class</option>
                                {classes?.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                            </select>
                        </div>

                        {/* Term */}
                        <div className="space-y-1">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Term</label>
                            <select
                                value={selectedTerm}
                                onChange={e => setSelectedTerm(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-sm font-medium text-gray-700"
                            >
                                <option>Term 1</option>
                                <option>Term 2</option>
                                <option>Term 3</option>
                            </select>
                        </div>

                        {/* Year */}
                        <div className="space-y-1">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Year</label>
                            <select
                                value={selectedYear}
                                onChange={e => setSelectedYear(parseInt(e.target.value))}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-sm font-medium text-gray-700"
                            >
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Mode toggle */}
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Generate For</p>
                        <div className="flex gap-3">
                            {[
                                { key: 'all', label: 'All Learners', icon: 'fa-users' },
                                { key: 'individual', label: 'Individual', icon: 'fa-user' },
                            ].map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => { setMode(opt.key as 'all' | 'individual'); setSelectedStudentId(''); }}
                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-bold text-sm transition-all ${mode === opt.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}
                                >
                                    <i className={`fas ${opt.icon}`} />
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Individual student picker */}
                        {mode === 'individual' && (
                            <select
                                value={selectedStudentId}
                                onChange={e => setSelectedStudentId(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-sm font-medium text-gray-700 disabled:opacity-50"
                                disabled={!selectedClassId}
                            >
                                <option value="">Select Student</option>
                                {studentsInClass?.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                            </select>
                        )}
                    </div>

                    {/* Info strip */}
                    {selectedClassId && studentsInClass && (
                        <div className="space-y-2">
                             {/* Warning if term dates are missing */}
                            {(!termStartDateVal || !vacationDateVal) && (
                                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 font-semibold animate-pulse">
                                    <i className="fas fa-exclamation-triangle text-red-400 mt-0.5" />
                                    <div>
                                        <p className="font-bold">Missing Term Dates!</p>
                                        <p className="font-normal opacity-80">Attendance cannot be calculated. Please set "Term Start" and "Vacation" dates in Settings &gt; General Info first.</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 font-semibold">
                                <i className="fas fa-info-circle text-blue-400" />
                                {mode === 'all'
                                    ? `${studentsInClass.length} learner${studentsInClass.length !== 1 ? 's' : ''} will be included in the print.`
                                    : selectedStudentId ? 'Individual report card selected.' : 'Please select a student above.'
                                }
                            </div>
                        </div>
                    )}

                    {/* Generate button */}
                    <button
                        onClick={buildCards}
                        disabled={!isReady || isBuilding}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                        {isBuilding ? (
                            <><i className="fas fa-spinner fa-spin" /> Building Report Cards...</>
                        ) : (
                            <><i className="fas fa-eye" /> Preview Report Cards</>
                        )}
                    </button>
                </div>
            ) : (
                /* ── Preview + Print ── */
                <div className="space-y-4">
                    {/* Print action bar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-green-50 border border-green-100 rounded-2xl no-print">
                        <div>
                            <p className="font-black text-green-800 text-sm flex items-center gap-2">
                                <i className="fas fa-check-circle text-green-600" />
                                {cards.length} report card{cards.length !== 1 ? 's' : ''} ready
                            </p>
                            <p className="text-green-600 text-xs mt-0.5">Review the preview below, then click Print.</p>
                        </div>
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-black text-sm rounded-xl transition-all active:scale-95 shadow-lg shadow-green-200"
                        >
                            <i className="fas fa-print" /> Print Report Cards
                        </button>
                    </div>

                    {/* Screen preview (scrollable, scaled down) */}
                    <div className="overflow-auto max-h-[600px] border border-gray-200 rounded-2xl bg-gray-100 p-4 no-print">
                        <div style={{ transform: 'scale(0.65)', transformOrigin: 'top center' }}>
                            {cards.map((card, i) => (
                                <ReportCardTemplate key={i} data={card} isLastCard={i === cards.length - 1} />
                            ))}
                        </div>
                    </div>

                    {/* Full-size print area: rendered at document root via Portal to avoid CSS constraints */}
                    {cards.length > 0 && createPortal(
                        <div
                            id="report-print-area"
                            ref={printRef}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: '-9999px',
                                width: '210mm',
                                pointerEvents: 'none',
                                opacity: 0,
                                backgroundColor: '#fff',
                            }}
                            aria-hidden="true"
                        >
                            {cards.map((card, i) => (
                                <ReportCardTemplate key={i} data={card} isLastCard={i === cards.length - 1} />
                            ))}
                        </div>,
                        document.body
                    )}
                </div>
            )}
        </div>
    );
};

export default ReportCardGenerator;
