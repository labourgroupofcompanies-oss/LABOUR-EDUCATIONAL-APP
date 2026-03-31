import type { Result, AssessmentConfig } from '../eduDb';
import { eduDb } from '../eduDb';
import { calculateFinalScore, assignGrade } from '../utils/assessmentCalculator';

export const resultService = {
    /**
     * Checks if a user is allowed to enter results for a specific class and subject.
     * Checks the classSubjects table for the assignment.
     */
    async canTeacherModifyResult(schoolId: string, classId: number, subjectId: number, teacherId: string): Promise<boolean> {
        try {
            const assignment = await eduDb.classSubjects
                .where('[classId+subjectId]')
                .equals([classId, subjectId])
                .filter(cs => cs.schoolId === schoolId && cs.teacherId === teacherId && !cs.isDeleted)
                .first();

            return !!assignment;
        } catch (error) {
            console.error('Error validating teacher assignment:', error);
            return false;
        }
    },

    /**
     * Get Assessment Configuration for a given year/term
     */
    async getAssessmentConfig(schoolId: string, year: number, term: string): Promise<AssessmentConfig | undefined> {
        return await eduDb.assessmentConfigs
            .where('[schoolId+year+term]')
            .equals([schoolId, year, term])
            .filter(ac => !ac.isDeleted)
            .first();
    },

    /**
     * Get Grading System for the school
     */
    async getGradingSystem(schoolId: string): Promise<Array<{ grade: string; min: number; max: number; remark: string }> | undefined> {
        const setting = await eduDb.settings
            .where('[schoolId+key]')
            .equals([schoolId, 'gradingSystem'])
            .first();
        return setting?.value;
    },

    /**
     * Upsert a Result record locally
     */
    async saveResult(resultData: Omit<Result, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>, teacherAuthId?: string): Promise<number> {
        // Validation check if entered by a specific teacher
        if (teacherAuthId) {
            const isAuthorized = await this.canTeacherModifyResult(
                resultData.schoolId,
                resultData.classId,
                resultData.subjectId,
                teacherAuthId
            );

            if (!isAuthorized) {
                throw new Error("Unauthorized: You are not assigned to this class and subject.");
            }
        }

        const config = await this.getAssessmentConfig(resultData.schoolId, resultData.year, resultData.term);
        if (!config) {
            throw new Error(`Assessment Configuration is missing for ${resultData.term} ${resultData.year}. Please ask the Headteacher to configure it in Settings.`);
        }

        const gradingSystem = await this.getGradingSystem(resultData.schoolId);
        if (!gradingSystem || gradingSystem.length === 0) {
            throw new Error(`Grading System is missing. Please ask the Headteacher to configure it in Settings.`);
        }

        // Validate max scores
        const caInput = resultData.caTotal || 0;
        const examInput = resultData.examScore || 0;

        const caMax = config.caPercentage || 0;
        if (caInput > caMax) {
            throw new Error(`CA score (${caInput}) exceeds the maximum allowed (${caMax}).`);
        }
        if (examInput > (config.examMaxScore || 100)) {
            throw new Error(`Exam score (${examInput}) exceeds the maximum allowed (${config.examMaxScore || 100}).`);
        }

        const existing = await eduDb.results
            .where({
                schoolId: resultData.schoolId,
                studentId: resultData.studentId,
                classSubjectId: resultData.classSubjectId,
                year: resultData.year,
                term: resultData.term
            })
            .and(r => !r.isDeleted)
            .first();

        // One learner should only have one result record per classSubjectId, term, academicYear
        if (existing && existing.status === 'locked') {
            throw new Error("Cannot update a locked result.");
        }

        const totalScore = calculateFinalScore(caInput, examInput, config);
        const gradeAssignment = assignGrade(totalScore, gradingSystem);

        if (existing) {
            await eduDb.results.update(existing.id!, {
                ...resultData,
                totalScore,
                grade: gradeAssignment.grade,
                remarks: gradeAssignment.remark,
                updatedAt: Date.now(),
                syncStatus: 'pending'
            });
            return existing.id!;
        } else {
            return (await eduDb.results.add({
                ...resultData,
                totalScore,
                grade: gradeAssignment.grade,
                remarks: gradeAssignment.remark,
                status: resultData.status || 'draft',
                isDeleted: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                syncStatus: 'pending'
            })) as number;
        }
    },

    /**
     * Gets all results for a specific student, year, and term
     */
    async getStudentResults(schoolId: string, studentId: number, year: number, term: string): Promise<Result[]> {
        return await eduDb.results
            .where({ schoolId, studentId, year, term })
            .filter(r => !r.isDeleted)
            .toArray();
    },

    /**
     * Gets all results for a specific class-subject allocation
     */
    async getClassSubjectResults(schoolId: string, classSubjectId: number, year: number, term: string): Promise<Result[]> {
        return await eduDb.results
            .where({ schoolId, classSubjectId, year, term })
            .filter(r => !r.isDeleted)
            .toArray();
    },

    /**
     * Bulk approve results
     */
    async bulkApproveResults(resultIds: number[], approvedBy: string): Promise<void> {
        await eduDb.results.where('id').anyOf(resultIds).modify({
            status: 'approved',
            approvedBy,
            approvedAt: Date.now(),
            updatedAt: Date.now(),
            syncStatus: 'pending'
        });
    },

    /**
     * Bulk lock results
     */
    async bulkLockResults(resultIds: number[]): Promise<void> {
        await eduDb.results.where('id').anyOf(resultIds).modify({
            status: 'locked',
            lockedAt: Date.now(),
            updatedAt: Date.now(),
            syncStatus: 'pending'
        });
    },

    /**
     * Bulk unlock results (Headteacher only)
     */
    async bulkUnlockResults(resultIds: number[]): Promise<void> {
        await eduDb.results.where('id').anyOf(resultIds).modify({
            status: 'approved', // Back to approved state
            updatedAt: Date.now(),
            syncStatus: 'pending'
        });
    },

    /**
     * Delete a result (soft delete)
     */
    async deleteResult(id: number): Promise<void> {
        const result = await eduDb.results.get(id);
        if (result?.status === 'locked') {
            throw new Error("Cannot delete a locked result.");
        }
        await eduDb.results.update(id, {
            isDeleted: true,
            updatedAt: Date.now(),
            syncStatus: 'pending'
        });
    }
};
