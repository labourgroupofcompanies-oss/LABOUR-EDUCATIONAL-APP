import { eduDb, type Attendance } from '../eduDb';

export const attendanceService = {
    /**
     * Saves or updates attendance records for an entire class on a specific date.
     * This is designed for the Daily Register UI.
     */
    async saveClassAttendance(
        schoolId: string, 
        classId: number, 
        date: number, 
        records: { studentId: number; status: 'present' | 'absent' | 'late' }[],
        enteredBy?: string
    ) {
        // Start of the day timestamp to ensure consistency
        const startOfDay = new Date(date).setHours(0, 0, 0, 0);

        const attendanceData: Attendance[] = records.map(r => ({
            schoolId,
            classId,
            studentId: r.studentId,
            date: startOfDay,
            status: r.status,
            enteredBy,
            syncStatus: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isDeleted: false
        }));

        try {
            await eduDb.transaction('rw', eduDb.attendance, async () => {
                for (const record of attendanceData) {
                    // Check if record already exists for this student and date
                    const existing = await eduDb.attendance
                        .where({ schoolId, studentId: record.studentId, date: startOfDay })
                        .first();

                    if (existing) {
                        await eduDb.attendance.update(existing.id!, {
                            status: record.status,
                            updatedAt: Date.now(),
                            syncStatus: 'pending'
                        });
                    } else {
                        await eduDb.attendance.add(record);
                    }
                }
            });
            return { success: true };
        } catch (error) {
            console.error('[attendanceService] Error saving class attendance:', error);
            throw error;
        }
    },

    /**
     * Fetches attendance records for a class on a specific date.
     */
    async getClassAttendance(schoolId: string, classId: number, date: number) {
        const startOfDay = new Date(date).setHours(0, 0, 0, 0);
        const rawRecords = await eduDb.attendance
            .where({ schoolId, classId, date: startOfDay })
            .filter(a => !a.isDeleted)
            .toArray();
            
        // Deduplicate in case of sync timezone shift overlaps
        const uniqueMap = new Map<number, any>();
        rawRecords.forEach(r => {
            if (!uniqueMap.has(r.studentId) || uniqueMap.get(r.studentId).updatedAt < r.updatedAt) {
                uniqueMap.set(r.studentId, r);
            }
        });
        return Array.from(uniqueMap.values());
    },

    /**
     * Calculates attendance statistics for a student over a specific period.
     * Useful for Report Cards.
     */
    async getStudentStats(studentId: number, startDate: number, endDate: number) {
        const student = await eduDb.students.get(studentId);
        if (!student) return { total: 0, present: 0, absent: 0, late: 0, attendancePercentage: 0 };

        const rawRecords = await eduDb.attendance
            .filter(r => 
                !!((r.studentId === studentId || (student.idCloud && String(r.studentId) === student.idCloud) || (student.studentIdString && String(r.studentId) === student.studentIdString)) && r.date >= startDate && r.date <= endDate && !r.isDeleted)
            )
            .toArray();

        // Deduplicate records that point to the same calendar date to prevent double-counting syncing artifacts
        const uniqueMap = new Map<string, any>();
        rawRecords.forEach(r => {
            const localDate = new Date(r.date).toLocaleDateString('en-CA');
            if (!uniqueMap.has(localDate) || uniqueMap.get(localDate).updatedAt < r.updatedAt) {
                uniqueMap.set(localDate, r);
            }
        });
        const records = Array.from(uniqueMap.values());

        const present = records.filter(r => r.status === 'present').length;
        const absent = records.filter(r => r.status === 'absent').length;
        const late = records.filter(r => r.status === 'late').length;
        const total = records.length;
        const attendancePercentage = total > 0 ? ((present + late) / total) * 100 : 0;

        return {
            total,
            present,
            absent,
            late,
            attendancePercentage: Math.round(attendancePercentage)
        };
    },

    /**
     * Provides data for a class attendance heatmap.
     */
    async getClassMonthlyHistory(schoolId: string, classId: number, month: number, year: number) {
        const startDate = new Date(year, month, 1).getTime();
        const endDate = new Date(year, month + 1, 0).getTime();

        const records = await eduDb.attendance
            .where({ schoolId, classId })
            .filter(r => r.date >= startDate && r.date <= endDate && !r.isDeleted)
            .toArray();

        // Group by date to see completion status
        const history: Record<string, { present: number; total: number }> = {};
        
        records.forEach(r => {
            const dateKey = new Date(r.date).toISOString().split('T')[0];
            if (!history[dateKey]) history[dateKey] = { present: 0, total: 0 };
            
            history[dateKey].total++;
            if (r.status === 'present' || r.status === 'late') history[dateKey].present++;
        });

        return history;
    }
};
