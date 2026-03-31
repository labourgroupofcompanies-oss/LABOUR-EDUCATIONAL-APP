/**
 * Assessment Calculation Utilities
 * Handles best-2 selection, CA calculation, and final score computation
 */

import type { ComponentScore, AssessmentConfig } from '../eduDb';

/**
 * Selects the best N scores from an array
 */
export function calculateBestN(scores: number[], n: number = 2): number[] {
    if (scores.length === 0) return Array(n).fill(0);
    const sorted = [...scores].sort((a, b) => b - a);
    return sorted.slice(0, n);
}

/**
 * Calculates average of non-zero scores
 */
export function average(scores: number[]): number {
    const validScores = scores.filter(s => s > 0);
    if (validScores.length === 0) return 0;
    return validScores.reduce((a, b) => a + b, 0) / validScores.length;
}


/**
 * Calculates Continuous Assessment (CA) total based on the selected policy
 */
export function calculateCA(
    componentScores: ComponentScore[],
    config: AssessmentConfig
): { total: number; breakdown: { tests: number[]; exercises: number[]; assignments: number[]; projects: number[] } } {
    const policy = config.caPolicy || 'best_n';
    const n = config.bestNCount || 2;

    // Group by component type
    const tests = componentScores.filter(s => s.componentType === 'test').map(s => s.score);
    const exercises = componentScores.filter(s => s.componentType === 'exercise').map(s => s.score);
    const assignments = componentScores.filter(s => s.componentType === 'assignment').map(s => s.score);
    const projects = componentScores.filter(s => s.componentType === 'project').map(s => s.score);

    let testAvg = 0, exerciseAvg = 0, assignmentAvg = 0, projectAvg = 0;
    let bTests: number[] = [], bExercises: number[] = [], bAssignments: number[] = [], bProjects: number[] = [];

    if (policy === 'best_n') {
        bTests = calculateBestN(tests, n);
        bExercises = calculateBestN(exercises, n);
        bAssignments = calculateBestN(assignments, n);
        bProjects = calculateBestN(projects, n);
        testAvg = average(bTests);
        exerciseAvg = average(bExercises);
        assignmentAvg = average(bAssignments);
        projectAvg = average(bProjects);
    } else {
        // Default: Simple Mean
        testAvg = average(tests);
        exerciseAvg = average(exercises);
        assignmentAvg = average(assignments);
        projectAvg = average(projects);
        bTests = tests; bExercises = exercises; bAssignments = assignments; bProjects = projects;
    }

    // Apply weights (Normalized by max scores)
    const caTotal =
        (config.testMaxScore > 0 ? (testAvg / config.testMaxScore) * config.testWeight : 0) +
        (config.exerciseMaxScore > 0 ? (exerciseAvg / config.exerciseMaxScore) * config.exerciseWeight : 0) +
        (config.assignmentMaxScore > 0 ? (assignmentAvg / config.assignmentMaxScore) * config.assignmentWeight : 0) +
        (config.projectMaxScore > 0 ? (projectAvg / config.projectMaxScore) * config.projectWeight : 0);

    return {
        total: Math.round(caTotal),
        breakdown: {
            tests: bTests,
            exercises: bExercises,
            assignments: bAssignments,
            projects: bProjects
        }
    };
}

/**
 * Calculates final score (CA + Exam)
 * - CA total is already the absolute points contribution (e.g. 25/30)
 * - Applies exam normalization: (examScore / examMaxScore) * Exam Percentage
 * - Returns sum rounded to 2 decimals
 */
export function calculateFinalScore(
    caTotal: number,
    examScore: number,
    config: AssessmentConfig
): number {
    const defaultExamPct = config.examMaxScore > 0 ? 100 - (config.caPercentage || 0) : 100;
    const examWeighted = config.examMaxScore > 0
        ? (examScore / config.examMaxScore) * (config.examPercentage ?? defaultExamPct)
        : 0;
    const total = caTotal + examWeighted;
    return Math.round(total);
}

/**
 * Assigns grade based on total score and grading system
 */
export function assignGrade(
    totalScore: number,
    gradingSystem?: Array<{ grade: string; min: number; max: number; remark: string }>
): { grade: string; remark: string } {
    // Ensure we are strictly comparing integers to avoid decimal gaps
    const roundedScore = Math.round(totalScore);

    const defaultGrading = [
        { min: 80, max: 100, grade: 'A', remark: 'Excellent' },
        { min: 70, max: 79, grade: 'B', remark: 'Very Good' },
        { min: 60, max: 69, grade: 'C', remark: 'Good' },
        { min: 50, max: 59, grade: 'D', remark: 'Credit' },
        { min: 0, max: 49, grade: 'F', remark: 'Fail' },
    ];

    const activeSystem = (gradingSystem && gradingSystem.length > 0) ? gradingSystem : defaultGrading;

    const found = activeSystem.find(g => roundedScore >= g.min && roundedScore <= g.max);
    return found
        ? { grade: found.grade, remark: found.remark }
        : { grade: 'N/A', remark: 'Pending' };
}
