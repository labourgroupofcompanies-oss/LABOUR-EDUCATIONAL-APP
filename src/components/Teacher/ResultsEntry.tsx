import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb, type ComponentScore } from '../../eduDb';
import { useAuth } from '../../hooks/useAuth';
import { showConfirm } from '../Common/ConfirmDialog';
import { calculateCA, calculateFinalScore, assignGrade } from '../../utils/assessmentCalculator';
import { showToast } from '../Common/Toast';

interface ResultsEntryProps {
    classId: number;
    className: string;
    subjectId: number;
    subjectName: string;
    classSubjectId: number;
}

interface StudentRow {
    studentId: number;
    studentName: string;

    // Component scores (raw inputs)
    tests: { [key: number]: number };        // { 1: 85, 2: 90, 3: 78 }
    exercises: { [key: number]: number };
    assignments: { [key: number]: number };
    projects: { [key: number]: number };
    exam: number;

    // Calculated values
    caTotal: number;
    finalScore: number;
    grade: string;
    remark: string;

    // Status
    status: 'draft' | 'submitted' | 'locked' | 'approved';
    isDirty: boolean;
}

const ResultsEntry: React.FC<ResultsEntryProps> = ({ classId, className, subjectId, subjectName, classSubjectId }) => {
    const { user } = useAuth();
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const [selectedTerm, setSelectedTerm] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

    // Load Settings
    const settings = useLiveQuery(async () => {
        try {
            if (user?.schoolId) {
                const allSettings = await eduDb.settings
                    .where('schoolId')
                    .equals(user.schoolId)
                    .toArray();

                return {
                    academicYear: allSettings.find(s => s.key === 'academicYear')?.value || new Date().getFullYear().toString(),
                    currentTerm: allSettings.find(s => s.key === 'currentTerm')?.value || 'Term 1',
                    gradingSystem: allSettings.find(s => s.key === 'gradingSystem')?.value || []
                };
            }
            return null;
        } catch (error) {
            console.error("Dexie Error (settings):", error);
            return null;
        }
    }, [user?.schoolId]);

    // settingsLoading handles the undefined state (loading)
    const settingsLoading = settings === undefined;

    // Load Assessment Configuration
    const assessmentConfig = useLiveQuery(async () => {
        try {
            if (user?.schoolId && settings) {
                const year = settings.academicYear ? (parseInt(settings.academicYear.split('/')[0]) || new Date().getFullYear()) : new Date().getFullYear();
                const term = settings.currentTerm || 'Term 1';

                const config = await eduDb.assessmentConfigs
                    .where('[schoolId+year+term]')
                    .equals([user.schoolId, year, term])
                    .first();
                return config || null;
            }
            return null;
        } catch (error) {
            console.error("Dexie Error (assessmentConfig):", error);
            return null;
        }
    }, [user?.schoolId, settings]); // Depend on pure 'settings' object for stability

    const configLoading = assessmentConfig === undefined;

    const settingsStr = JSON.stringify(settings);
    const configStr = JSON.stringify(assessmentConfig);

    // Load Students and Existing Scores
    useEffect(() => {
        const loadData = async () => {
            if (!user?.schoolId || !settings || !assessmentConfig) return;

            try {
                const yearStr = settings.academicYear || "";
                const year = selectedTerm ? selectedYear : parseInt(yearStr.split('/')[0]) || new Date().getFullYear();
                const currentTerm = selectedTerm || settings.currentTerm;

                if (!selectedTerm) {
                    setSelectedTerm(currentTerm);
                    setSelectedYear(year);
                }

                const numericClassId = Number(classId);


                // Load students
                const classStudentsRaw = await eduDb.students
                    .where('classId')
                    .equals(numericClassId)
                    .filter(s => s.schoolId === user.schoolId && !s.isDeleted)
                    .toArray();

                // Deduplicate by Full Name (case-insensitive) to prevent UI phantom clones
                const seenStudents = new Set<string>();
                const classStudents = classStudentsRaw.filter(s => {
                    if (!s.fullName) return true;
                    const name = s.fullName.trim().toLowerCase();
                    if (seenStudents.has(name)) return false;
                    seenStudents.add(name);
                    return true;
                });

                const targetClass = await eduDb.classes.get(numericClassId);
                const targetClassSubject = await eduDb.classSubjects.get(classSubjectId);

                // Load existing component scores resiliently
                const existingScoresRaw = await eduDb.componentScores.filter(s => s.schoolId === user.schoolId && s.year === year && s.term === currentTerm).toArray();
                const existingScores = existingScoresRaw.filter(s => 
                    (s.classId === numericClassId || (targetClass?.idCloud && (s.classId as any) === targetClass.idCloud)) &&
                    (s.classSubjectId === classSubjectId || (targetClassSubject?.idCloud && (s.classSubjectId as any) === targetClassSubject.idCloud))
                );

                // Load existing results (for status) resiliently
                const existingResultsRaw = await eduDb.results.filter(r => r.schoolId === user.schoolId && r.year === year && r.term === currentTerm && !r.isDeleted).toArray();
                const existingResults = existingResultsRaw.filter(r => 
                    (r.classId === numericClassId || (targetClass?.idCloud && (r.classId as any) === targetClass.idCloud)) &&
                    (r.classSubjectId === classSubjectId || (targetClassSubject?.idCloud && (r.classSubjectId as any) === targetClassSubject.idCloud))
                );

                // Build student rows
                const rows: StudentRow[] = classStudents.map(student => {
                    const studentScores = existingScores.filter(s => s.studentId === student.id || (student.idCloud && typeof s.studentId === 'string' && s.studentId === student.idCloud));
                    const result = existingResults.find(r => r.studentId === student.id || (student.idCloud && typeof r.studentId === 'string' && r.studentId === student.idCloud));

                    // Group scores by component type
                    const tests: { [key: number]: number } = {};
                    const exercises: { [key: number]: number } = {};
                    const assignments: { [key: number]: number } = {};
                    const projects: { [key: number]: number } = {};
                    let exam = 0;

                    studentScores.forEach(score => {
                        if (score.componentType === 'test') tests[score.componentNumber] = score.score;
                        else if (score.componentType === 'exercise') exercises[score.componentNumber] = score.score;
                        else if (score.componentType === 'assignment') assignments[score.componentNumber] = score.score;
                        else if (score.componentType === 'project') projects[score.componentNumber] = score.score;
                        else if (score.componentType === 'exam') exam = score.score;
                    });

                    return {
                        studentId: student.id!,
                        studentName: student.fullName,
                        tests,
                        exercises,
                        assignments,
                        projects,
                        exam,
                        caTotal: result?.caTotal || 0,
                        finalScore: result?.totalScore || 0,
                        grade: result?.grade || '',
                        remark: result?.remarks || '',
                        status: result?.status || 'draft',
                        isDirty: false
                    };
                });

                setStudents(rows);
            } catch (error) {
                console.error("Critical error loading results entry data:", error);
            }
        };

        loadData();
    }, [user?.schoolId, classId, subjectId, settingsStr, configStr, selectedTerm, selectedYear, classSubjectId]);

    const handleScoreChange = (
        studentId: number,
        componentType: 'test' | 'exercise' | 'assignment' | 'project' | 'exam',
        componentNumber: number,
        value: string
    ) => {
        const score = parseFloat(value) || 0;

        // Strict Max Score Restriction
        if (assessmentConfig && value !== '') {
            if (componentType === 'test' && score > assessmentConfig.testMaxScore) return;
            if (componentType === 'exercise' && score > assessmentConfig.exerciseMaxScore) return;
            if (componentType === 'assignment' && score > assessmentConfig.assignmentMaxScore) return;
            if (componentType === 'project' && score > assessmentConfig.projectMaxScore) return;
            if (componentType === 'exam' && score > assessmentConfig.examMaxScore) return;
        }

        setStudents(prev => prev.map(student => {
            if (student.studentId !== studentId) return student;
            if (student.status === 'submitted' || student.status === 'locked') return student; // Prevent editing

            const updated = { ...student, isDirty: true };

            if (componentType === 'exam') {
                updated.exam = score;
            } else {
                (updated[`${componentType}s` as keyof StudentRow] as any) = {
                    ...(student[`${componentType}s` as keyof StudentRow] as any),
                    [componentNumber]: score
                };
            }

            // Recalculate
            if (assessmentConfig && settings?.gradingSystem) {
                const allScores: ComponentScore[] = [];

                // Convert to ComponentScore format for calculation
                Object.entries(updated.tests).forEach(([num, val]) => {
                    allScores.push({ componentType: 'test', componentNumber: parseInt(num), score: val } as any);
                });
                Object.entries(updated.exercises).forEach(([num, val]) => {
                    allScores.push({ componentType: 'exercise', componentNumber: parseInt(num), score: val } as any);
                });
                Object.entries(updated.assignments).forEach(([num, val]) => {
                    allScores.push({ componentType: 'assignment', componentNumber: parseInt(num), score: val } as any);
                });
                Object.entries(updated.projects).forEach(([num, val]) => {
                    allScores.push({ componentType: 'project', componentNumber: parseInt(num), score: val } as any);
                });

                const caResult = calculateCA(allScores, assessmentConfig);
                updated.caTotal = caResult.total;
                updated.finalScore = calculateFinalScore(caResult.total, updated.exam, assessmentConfig);

                const gradeResult = assignGrade(updated.finalScore, settings.gradingSystem);
                updated.grade = gradeResult.grade;
                updated.remark = gradeResult.remark;
            }

            return updated;
        }));
    };

    // Save as Draft
    const handleSaveDraft = async () => {
        if (!user?.schoolId || !settings || !assessmentConfig) return;

        setIsSaving(true);
        try {
            const year = selectedYear || parseInt(settings.academicYear.split('/')[0]) || new Date().getFullYear();
            const currentTerm = selectedTerm || settings.currentTerm;
            const now = Date.now();

            for (const student of students.filter(s => s.isDirty)) {
                const existingForStudent = await eduDb.componentScores
                    .where('studentId')
                    .equals(student.studentId)
                    .filter(s => s.schoolId === user.schoolId && s.classSubjectId === classSubjectId && s.year === year && s.term === currentTerm)
                    .toArray();

                const existingMap = new Map();
                existingForStudent.forEach(s => {
                    existingMap.set(`${s.componentType}_${s.componentNumber}`, s);
                });

                const scoresToSave: Partial<ComponentScore>[] = [];

                const addScore = (score: number, type: 'test'|'exercise'|'assignment'|'project'|'exam', num: number) => {
                    const existing = existingMap.get(`${type}_${num}`);
                    const newScore: Partial<ComponentScore> = {
                        schoolId: user.schoolId!,
                        studentId: student.studentId,
                        subjectId,
                        classSubjectId,
                        classId,
                        year,
                        term: currentTerm,
                        componentType: type,
                        componentNumber: num,
                        score,
                        enteredBy: user.id,
                        status: 'draft',
                        syncStatus: 'pending',
                        createdAt: existing ? existing.createdAt : now,
                        updatedAt: now
                    };
                    if (existing) {
                        newScore.id = existing.id;
                        if (existing.idCloud) newScore.idCloud = existing.idCloud;
                    }
                    scoresToSave.push(newScore);
                };

                Object.entries(student.tests).forEach(([num, score]) => addScore(score, 'test', parseInt(num)));
                Object.entries(student.exercises).forEach(([num, score]) => addScore(score, 'exercise', parseInt(num)));
                Object.entries(student.assignments).forEach(([num, score]) => addScore(score, 'assignment', parseInt(num)));
                Object.entries(student.projects).forEach(([num, score]) => addScore(score, 'project', parseInt(num)));
                if (student.exam > 0) addScore(student.exam, 'exam', 1);

                await eduDb.componentScores.bulkPut(scoresToSave as any[]);

                // Update result record
                const existingResult = await eduDb.results
                    .where('[studentId+classSubjectId+term+year]')
                    .equals([student.studentId, classSubjectId, currentTerm, year])
                    .filter(r => r.schoolId === user.schoolId && !r.isDeleted)
                    .first();

                const resultData = {
                    schoolId: user.schoolId,
                    studentId: student.studentId,
                    subjectId,
                    classSubjectId,
                    classId,
                    year,
                    term: currentTerm,
                    caTotal: student.caTotal,
                    examScore: student.exam,
                    totalScore: student.finalScore,
                    grade: student.grade,
                    remarks: student.remark,
                    status: 'draft' as const,
                    enteredBy: user.id,
                    syncStatus: 'pending' as const,
                    updatedAt: now
                };

                if (existingResult) {
                    await eduDb.results.update(existingResult.id!, resultData);
                } else {
                    await eduDb.results.add({ ...resultData, createdAt: now } as any);
                }
            }

            // Mark all as not dirty
            setStudents(prev => prev.map(s => ({ ...s, isDirty: false })));

            showMessage('success', 'Draft saved successfully!');
        } catch (error) {
            console.error(error);
            showMessage('error', 'Failed to save draft.');
        } finally {
            setIsSaving(false);
        }
    };

    // Submit (Lock Editing)
    const handleSubmit = async () => {
        const confirmed = await showConfirm({
            title: 'Submit Results',
            message: 'Once submitted, you will not be able to edit these results. Are you ready to submit?',
            confirmText: 'Yes, Submit',
            cancelText: 'Not Yet',
            variant: 'warning',
        });
        if (!confirmed) return;

        await handleSaveDraft(); // Save first

        if (!user?.schoolId || !settings) return;

        try {
            const year = selectedYear || parseInt(settings.academicYear.split('/')[0]) || new Date().getFullYear();
            const currentTerm = selectedTerm || settings.currentTerm;
            const now = Date.now();

            // Update all component scores to submitted
            await eduDb.componentScores
                .where('classSubjectId')
                .equals(classSubjectId)
                .filter(s => s.schoolId === user.schoolId && s.year === year && s.term === currentTerm)
                .modify({ status: 'submitted', updatedAt: now });

            // Update all results to submitted
            await eduDb.results
                .where('classSubjectId')
                .equals(classSubjectId)
                .filter(r => r.schoolId === user.schoolId && r.year === year && r.term === currentTerm)
                .modify({ status: 'submitted', submittedAt: now, updatedAt: now });

            // Update local state
            setStudents(prev => prev.map(s => ({ ...s, status: 'submitted' })));

            showMessage('success', 'Results submitted successfully! Editing is now locked.');
        } catch (error) {
            console.error(error);
            showMessage('error', 'Failed to submit results.');
        }
    };

    const showMessage = (type: 'success' | 'error', text: string) => {
        showToast(text, type);
    };

    // Check if any student has submitted status
    const hasSubmittedResults = students.some(s => s.status === 'submitted' || s.status === 'locked');
    const allDraft = students.every(s => s.status === 'draft');

    if (settingsLoading || configLoading) {
        return (
            <div className="p-12 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 font-medium animate-pulse">Loading assessment data...</p>
            </div>
        );
    }

    if (!assessmentConfig) {
        return (
            <div className="p-8">
                <div className="max-w-2xl mx-auto bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-8 text-center">
                    <div className="text-6xl mb-4">⚙️</div>
                    <h3 className="text-2xl font-bold text-yellow-800 mb-3">Assessment Not Configured</h3>
                    <p className="text-yellow-700 mb-6">
                        The assessment structure for <strong>{settings?.currentTerm || 'Current Term'}</strong> ({settings?.academicYear || 'Current Year'})
                        has not been configured yet.
                    </p>
                    <div className="bg-white p-6 rounded-xl border border-yellow-200 text-left">
                        <p className="font-bold text-gray-800 mb-3">📋 What needs to be done:</p>
                        <ol className="space-y-2 text-gray-700 ml-4">
                            <li>1. Ask your <strong>Headteacher</strong> to log in</li>
                            <li>2. Go to <strong>Settings → Assessment Setup</strong></li>
                            <li>3. Configure the number of tests, exercises, assignments, and projects</li>
                            <li>4. Set the CA and Exam percentages</li>
                            <li>5. Save the configuration</li>
                        </ol>
                    </div>
                    <p className="text-sm text-yellow-600 mt-6">
                        Once configured, you'll be able to enter student results here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-24 md:pb-0">
            {/* Header */}
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm transition-all">
                <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight">{className}</h2>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 tracking-tight">{subjectName}</h2>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <p className="text-sm text-gray-400 font-medium whitespace-nowrap">Class: <span className="text-gray-800 font-bold">{className}</span> • </p>
                            <select
                                value={selectedTerm}
                                onChange={(e) => setSelectedTerm(e.target.value)}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-xs font-bold text-gray-700 w-auto"
                            >
                                <option value="Term 1">Term 1</option>
                                <option value="Term 2">Term 2</option>
                                <option value="Term 3">Term 3</option>
                            </select>

                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white text-xs font-bold text-gray-700 w-auto"
                            >
                                {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - 15 + i).map(y => (
                                    <option key={y} value={y}>{y} / {y + 1}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Policy Badge */}
                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-2xl">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs">
                            <i className={`fas ${(assessmentConfig.caPolicy as string) === 'weighted-recency' ? 'fa-chart-line' : (assessmentConfig.caPolicy as string) === 'sum_all' ? 'fa-divide' : (assessmentConfig.caPolicy as string) === 'total-points' ? 'fa-plus-circle' : 'fa-trophy'}`}></i>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-0.5">CA Selection Model</p>
                            <p className="text-xs font-black text-indigo-700 leading-none">
                                {(assessmentConfig.caPolicy as string) === 'best_n' ? `Best ${assessmentConfig.bestNCount || 2} Scores` :
                                    (assessmentConfig.caPolicy as string) === 'sum_all' ? 'Simple Mean' :
                                        (assessmentConfig.caPolicy as string) === 'weighted-recency' ? 'Growth Model (Weighted)' :
                                            (assessmentConfig.caPolicy as string) === 'total-points' ? 'Point Accumulation' : 'Simple Mean'}
                            </p>
                        </div>
                    </div>
                </div>

                {hasSubmittedResults && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-[11px] font-bold flex items-center gap-2">
                        <i className="fas fa-lock text-blue-400"></i>
                        <span>Results submitted. Editing locked. Contact Headteacher to unlock.</span>
                    </div>
                )}
            </div>


            {/* Results Display */}
            <div className="animate-fadeIn">
                {/* Desktop/Tablet Table View */}
                <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="p-3 text-left font-bold text-gray-700 sticky left-0 bg-gray-50 z-10">Student</th>
                                    {Array.from({ length: assessmentConfig.numTests }).map((_, i) => (
                                        <th key={`test-${i}`} className="p-3 text-center font-bold text-gray-700 min-w-[80px]">T{i + 1} <div className="text-[10px] text-gray-400 font-medium">/{assessmentConfig.testMaxScore}</div></th>
                                    ))}
                                    {Array.from({ length: assessmentConfig.numExercises }).map((_, i) => (
                                        <th key={`exercise-${i}`} className="p-3 text-center font-bold text-gray-700 min-w-[80px]">E{i + 1} <div className="text-[10px] text-gray-400 font-medium">/{assessmentConfig.exerciseMaxScore}</div></th>
                                    ))}
                                    {Array.from({ length: assessmentConfig.numAssignments }).map((_, i) => (
                                        <th key={`assignment-${i}`} className="p-3 text-center font-bold text-gray-700 min-w-[80px]">A{i + 1} <div className="text-[10px] text-gray-400 font-medium">/{assessmentConfig.assignmentMaxScore}</div></th>
                                    ))}
                                    {Array.from({ length: assessmentConfig.numProjects }).map((_, i) => (
                                        <th key={`project-${i}`} className="p-3 text-center font-bold text-gray-700 min-w-[80px]">P{i + 1} <div className="text-[10px] text-gray-400 font-medium">/{assessmentConfig.projectMaxScore}</div></th>
                                    ))}
                                    <th className="p-3 text-center font-bold text-blue-700 min-w-[80px] bg-blue-50">Exam <div className="text-[10px] text-blue-400 font-medium">/{assessmentConfig.examMaxScore}</div></th>
                                    <th className="p-3 text-center font-bold text-green-700 min-w-[80px] bg-green-50">CA</th>
                                    <th className="p-3 text-center font-bold text-purple-700 min-w-[80px] bg-purple-50">Total</th>
                                    <th className="p-3 text-center font-bold text-orange-700 min-w-[80px] bg-orange-50">Grade</th>
                                    <th className="p-3 text-left font-bold text-gray-700 min-w-[120px]">Remark</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student, idx) => {
                                    const isLocked = student.status === 'submitted' || student.status === 'locked';
                                    return (
                                        <tr key={student.studentId} className={`border - b border - gray - 100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} `}>
                                            <td className="p-3 font-bold text-gray-800 sticky left-0 bg-inherit z-10">{student.studentName}</td>
                                            {Array.from({ length: assessmentConfig.numTests }).map((_, i) => (
                                                <td key={`test-${i}`} className="p-2">
                                                    <input type="number" min="0" max={assessmentConfig.testMaxScore} value={student.tests[i + 1] || ''} onChange={(e) => handleScoreChange(student.studentId, 'test', i + 1, e.target.value)} disabled={isLocked} className={`w-full p-2 text-center rounded-lg border ${isLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white border-gray-200 focus:border-primary focus:outline-none'} `} placeholder="-" />
                                                </td>
                                            ))}
                                            {Array.from({ length: assessmentConfig.numExercises }).map((_, i) => (
                                                <td key={`exercise-${i}`} className="p-2">
                                                    <input type="number" min="0" max={assessmentConfig.exerciseMaxScore} value={student.exercises[i + 1] || ''} onChange={(e) => handleScoreChange(student.studentId, 'exercise', i + 1, e.target.value)} disabled={isLocked} className={`w-full p-2 text-center rounded-lg border ${isLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white border-gray-200 focus:border-primary focus:outline-none'} `} placeholder="-" />
                                                </td>
                                            ))}
                                            {Array.from({ length: assessmentConfig.numAssignments }).map((_, i) => (
                                                <td key={`assignment-${i}`} className="p-2">
                                                    <input type="number" min="0" max={assessmentConfig.assignmentMaxScore} value={student.assignments[i + 1] || ''} onChange={(e) => handleScoreChange(student.studentId, 'assignment', i + 1, e.target.value)} disabled={isLocked} className={`w-full p-2 text-center rounded-lg border ${isLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white border-gray-200 focus:border-primary focus:outline-none'} `} placeholder="-" />
                                                </td>
                                            ))}
                                            {Array.from({ length: assessmentConfig.numProjects }).map((_, i) => (
                                                <td key={`project-${i}`} className="p-2">
                                                    <input type="number" min="0" max={assessmentConfig.projectMaxScore} value={student.projects[i + 1] || ''} onChange={(e) => handleScoreChange(student.studentId, 'project', i + 1, e.target.value)} disabled={isLocked} className={`w-full p-2 text-center rounded-lg border ${isLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white border-gray-200 focus:border-primary focus:outline-none'} `} placeholder="-" />
                                                </td>
                                            ))}
                                            <td className="p-2 bg-blue-50">
                                                <input type="number" min="0" max={assessmentConfig.examMaxScore} value={student.exam || ''} onChange={(e) => handleScoreChange(student.studentId, 'exam', 1, e.target.value)} disabled={isLocked} className={`w-full p-2 text-center rounded-lg border ${isLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white border-blue-200 focus:border-blue-500 focus:outline-none'} `} placeholder="-" />
                                            </td>
                                            <td className="p-3 text-center font-bold text-green-700 bg-green-50">{student.caTotal}</td>
                                            <td className="p-3 text-center font-bold text-purple-700 bg-purple-50">{Math.round(student.finalScore)}</td>
                                            <td className="p-3 text-center font-bold text-orange-700 bg-orange-50">{student.grade}</td>
                                            <td className="p-3 text-gray-600">{student.remark}</td>
                                        </tr>
                                    );
                                })}
                                {students.length === 0 && (
                                    <tr>
                                        <td colSpan={100} className="px-6 py-12 text-center text-gray-400 italic">No students found in this class.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                    {students.map((student) => {
                        const isLocked = student.status === 'submitted' || student.status === 'locked';
                        return (
                            <div key={student.studentId} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm transition-all hover:border-primary/20">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-black text-gray-800 tracking-tight">{student.studentName}</h3>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Final Score</span>
                                        <span className="text-xl font-black text-primary leading-none">{Math.round(student.finalScore)}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-green-50/50 p-2 rounded-xl flex flex-col items-center">
                                        <span className="text-[8px] font-black uppercase text-green-600 tracking-tighter">CA Total</span>
                                        <span className="font-bold text-green-700">{student.caTotal}</span>
                                    </div>
                                    <div className="bg-orange-50/50 p-2 rounded-xl flex flex-col items-center">
                                        <span className="text-[8px] font-black uppercase text-orange-600 tracking-tighter">Grade</span>
                                        <span className="font-bold text-orange-700">{student.grade || '-'}</span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* Component Grid */}
                                    <div className="grid grid-cols-4 gap-2">
                                        {/* Tests */}
                                        {Array.from({ length: assessmentConfig.numTests }).map((_, i) => (
                                            <div key={`mob-t-${i}`} className="flex flex-col items-center">
                                                <span className="text-[7px] font-black uppercase text-gray-400 mb-1">T{i + 1} <span className="text-gray-300">/{assessmentConfig.testMaxScore}</span></span>
                                                <input type="number" min="0" max={assessmentConfig.testMaxScore} value={student.tests[i + 1] || ''} onChange={(e) => handleScoreChange(student.studentId, 'test', i + 1, e.target.value)} disabled={isLocked} className="w-full h-8 text-center text-xs rounded-lg border border-gray-100 focus:border-primary focus:outline-none" />
                                            </div>
                                        ))}
                                        {Array.from({ length: assessmentConfig.numExercises }).map((_, i) => (
                                            <div key={`mob-e-${i}`} className="flex flex-col items-center">
                                                <span className="text-[7px] font-black uppercase text-gray-400 mb-1">E{i + 1} <span className="text-gray-300">/{assessmentConfig.exerciseMaxScore}</span></span>
                                                <input type="number" min="0" max={assessmentConfig.exerciseMaxScore} value={student.exercises[i + 1] || ''} onChange={(e) => handleScoreChange(student.studentId, 'exercise', i + 1, e.target.value)} disabled={isLocked} className="w-full h-8 text-center text-xs rounded-lg border border-gray-100 focus:border-primary focus:outline-none" />
                                            </div>
                                        ))}
                                        {Array.from({ length: assessmentConfig.numAssignments }).map((_, i) => (
                                            <div key={`mob-a-${i}`} className="flex flex-col items-center">
                                                <span className="text-[7px] font-black uppercase text-gray-400 mb-1">A{i + 1} <span className="text-gray-300">/{assessmentConfig.assignmentMaxScore}</span></span>
                                                <input type="number" min="0" max={assessmentConfig.assignmentMaxScore} value={student.assignments[i + 1] || ''} onChange={(e) => handleScoreChange(student.studentId, 'assignment', i + 1, e.target.value)} disabled={isLocked} className="w-full h-8 text-center text-xs rounded-lg border border-gray-100 focus:border-primary focus:outline-none" />
                                            </div>
                                        ))}
                                        {/* Exam (Full width or separated) */}
                                        <div className="col-span-1 flex flex-col items-center">
                                            <span className="text-[7px] font-black uppercase text-blue-600 mb-1">EXAM <span className="text-blue-300">/{assessmentConfig.examMaxScore}</span></span>
                                            <input type="number" min="0" max={assessmentConfig.examMaxScore} value={student.exam || ''} onChange={(e) => handleScoreChange(student.studentId, 'exam', 1, e.target.value)} disabled={isLocked} className="w-full h-8 text-center text-xs rounded-lg border border-blue-100 bg-blue-50/30 focus:border-blue-500 focus:outline-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {students.length === 0 && (
                        <div className="bg-white p-12 rounded-2xl border-2 border-dashed border-gray-100 text-center text-gray-400 italic">No students found.</div>
                    )}
                </div>
            </div>

            {/* Action Buttons — sticky above bottom nav on mobile */}
            <div className="fixed bottom-16 left-0 right-0 px-4 py-3 bg-white/95 backdrop-blur-sm border-t-2 border-gray-100 flex gap-3 md:static md:px-0 md:py-0 md:bg-transparent md:border-0 md:backdrop-blur-none z-40 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] md:shadow-none transition-all">
                <button
                    onClick={handleSaveDraft}
                    disabled={isSaving || hasSubmittedResults}
                    className={`btn-primary flex-1 md:flex-none py-4 md:py-3 px-8 !text-sm ${isSaving || hasSubmittedResults
                        ? '!from-gray-100 !to-gray-100 !text-gray-400 !shadow-none !cursor-not-allowed'
                        : ''
                        }`}
                >
                    <i className={`fas ${isSaving ? 'fa-circle-notch fa-spin' : 'fa-save'} text-base`}></i>
                    <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
                </button>

                <button
                    onClick={handleSubmit}
                    disabled={isSaving || hasSubmittedResults || !allDraft}
                    className={`btn-primary !from-indigo-600 !to-indigo-700 flex-1 md:flex-none py-4 md:py-3 px-8 !text-sm ${isSaving || hasSubmittedResults || !allDraft
                        ? '!from-gray-100 !to-gray-100 !text-gray-400 !shadow-none !cursor-not-allowed'
                        : ''
                        }`}
                >
                    <i className={`fas ${hasSubmittedResults ? 'fa-check-circle' : 'fa-paper-plane'} text-base`}></i>
                    <span>{hasSubmittedResults ? 'Submitted ✓' : 'Final Submit'}</span>
                </button>
            </div>

            {/* Info */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
                <p className="font-bold mb-2"><i className="fas fa-info-circle mr-2"></i>How it works:</p>
                <ul className="space-y-1 ml-6">
                    <li>
                        • {assessmentConfig.caPolicy === 'best_n'
                            ? `System automatically picks best ${assessmentConfig.bestNCount || 2} scores from each component type`
                            : `System averages ALL scores equally (Simple Mean) for each component type`}
                    </li>
                    <li>• CA Total = Weighted average based on headteacher's configuration</li>
                    <li>• Final Score = (CA × {assessmentConfig.caPercentage}%) + (Exam × {assessmentConfig.examPercentage}%)</li>
                    <li>• Grades are auto-assigned based on the grading system</li>
                    <li>• After submission, editing is locked until headteacher unlocks</li>
                </ul>
            </div>
        </div>
    );
};

export default ResultsEntry;
