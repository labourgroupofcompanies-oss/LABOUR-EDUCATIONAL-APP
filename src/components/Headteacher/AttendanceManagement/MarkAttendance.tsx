import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import { dbService } from '../../../services/dbService';
import { attendanceService } from '../../../services/attendanceService';
import { showToast } from '../../Common/Toast';

const MarkAttendance: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { user } = useAuth();
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [attendanceData, setAttendanceData] = useState<Record<number, 'present' | 'absent' | 'late'>>({});
    const [saving, setSaving] = useState(false);

    // Fetch Classes
    const classes = useLiveQuery(async () => {
        if (user?.schoolId && user.id) {
            if ((user.role as string) === 'staff') {
                return await dbService.classes.getAsClassTeacher(user.schoolId, user.id.toString());
            }
            return await dbService.classes.getAll(user.schoolId);
        }
        return [];
    }, [user?.schoolId, user?.role, user?.id]);

    // Fetch Students for selected class
    const students = useLiveQuery(async () => {
        if (user?.schoolId && selectedClassId) {
            const raw = await eduDb.students.where({ schoolId: user.schoolId, classId: selectedClassId }).filter(s => !s.isDeleted).toArray();
            const seen = new Set<string>();
            return raw.filter(s => {
                if (!s.fullName) return true;
                const name = s.fullName.trim().toLowerCase();
                if (seen.has(name)) return false;
                seen.add(name);
                return true;
            });
        }
        return [];
    }, [user?.schoolId, selectedClassId]);

    // Fetch existing attendance for selected date and class
    useEffect(() => {
        const loadAttendance = async () => {
            if (user?.schoolId && selectedClassId && selectedDate) {
                // We need to query range for the day, or just store date as YYYY-MM-DD string or midnight timestamp?
                // The schema says 'date: number'. Let's assume it's a timestamp.
                // To match "the day", we should probably query by range or just exact timestamp if we normalize to midnight.
                // For simplicity in this implementation, let's normalize the selected date to midnight UTC or Local.
                // Let's stick to storing the timestamp of 00:00:00 of that day.

                const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);

                const existing = await eduDb.attendance
                    .where({ schoolId: user.schoolId, classId: selectedClassId, date: dayStart })
                    .filter(a => !a.isDeleted)
                    .toArray();

                const map: Record<number, 'present' | 'absent' | 'late'> = {};
                existing.forEach(a => {
                    map[a.studentId] = a.status;
                });
                setAttendanceData(map);
            }
        };
        loadAttendance();
    }, [user?.schoolId, selectedClassId, selectedDate]);

    // Initialize attendance data with 'present' for new students if no record exists
    useEffect(() => {
        if (students && Object.keys(attendanceData).length === 0) {
            const initial: Record<number, 'present' | 'absent' | 'late'> = {};
            students.forEach(s => {
                if (s.id) initial[s.id] = 'present';
            });
            // Only set if we really want to default to all present immediately, or wait for user interaction.
            // Let's set it to persist defaults visually.
            setAttendanceData(prev => ({ ...initial, ...prev }));
        }
    }, [students]);


    const handleStatusChange = (studentId: number, status: 'present' | 'absent' | 'late') => {
        setAttendanceData(prev => ({ ...prev, [studentId]: status }));
    };

    const handleSave = async () => {
        if (!user?.schoolId || !selectedClassId) return;
        setSaving(true);
        try {
            const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);

            // Prepare records and use the proper service which handles upsert correctly
            const records = students?.map(student => ({
                studentId: student.id!,
                status: (attendanceData[student.id!] || 'present') as 'present' | 'absent' | 'late'
            })) || [];

            const enteredBy = user.id ? user.id.toString() : 'admin';
            
            await attendanceService.saveClassAttendance(
                user.schoolId,
                selectedClassId,
                dayStart,
                records,
                enteredBy
            );

            showToast('Attendance saved successfully!', 'success');
            setTimeout(onBack, 800);
        } catch (e) {
            console.error(e);
            showToast('Failed to save attendance. Please try again.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-[2rem] p-5 md:p-8 shadow-sm border border-gray-50 animate-fadeIn pb-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 md:mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-indigo-600 font-black text-[9px] uppercase tracking-widest transition-all">
                    <i className="fas fa-arrow-left"></i>
                    <span className="hidden sm:inline">Back</span>
                </button>
                <h2 className="text-lg md:text-2xl font-black text-gray-800 tracking-tight">Mark Attendance</h2>
                <div className="w-10"></div>{/* Spacer to center heading */}
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 md:mb-8">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Class</label>
                    <select
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm font-medium"
                        value={selectedClassId || ''}
                        onChange={(e) => setSelectedClassId(Number(e.target.value))}
                    >
                        <option value="">Choose a class...</option>
                        {classes?.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm"
                    />
                </div>
            </div>

            {selectedClassId && students && (
                <div className="space-y-4 md:space-y-6">
                    {/* Summary bar */}
                    <div className="flex flex-wrap justify-between items-center bg-gray-50 px-4 py-3 rounded-xl gap-3">
                        <span className="font-black text-gray-700 text-sm">{students.length} Students</span>
                        <div className="flex gap-3 text-xs font-black uppercase tracking-wide">
                            <span className="text-green-600 flex items-center gap-1"><i className="fas fa-check-circle"></i> Present</span>
                            <span className="text-red-500 flex items-center gap-1"><i className="fas fa-times-circle"></i> Absent</span>
                            <span className="text-orange-500 flex items-center gap-1"><i className="fas fa-clock"></i> Late</span>
                        </div>
                    </div>

                    {/* === MOBILE: Card layout (hidden on md+) === */}
                    <div className="md:hidden space-y-3">
                        {students.map(student => {
                            const status = attendanceData[student.id!] || 'present';
                            return (
                                <div key={student.id} className={`bg-white rounded-2xl border-2 p-4 transition-all ${status === 'present' ? 'border-green-200 bg-green-50/30' :
                                    status === 'absent' ? 'border-red-200 bg-red-50/30' :
                                        'border-orange-200 bg-orange-50/30'
                                    }`}>
                                     <p className="font-black text-gray-800 mb-3 text-sm">{student.fullName}</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {/* Present */}
                                        <button
                                            onClick={() => handleStatusChange(student.id!, 'present')}
                                            className={`flex flex-col items-center justify-center py-3 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all active:scale-95 gap-1 ${status === 'present'
                                                ? 'bg-green-500 text-white shadow-lg shadow-green-200'
                                                : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'
                                                }`}
                                        >
                                            <i className="fas fa-check-circle text-lg"></i>
                                            Present
                                        </button>
                                        {/* Absent */}
                                        <button
                                            onClick={() => handleStatusChange(student.id!, 'absent')}
                                            className={`flex flex-col items-center justify-center py-3 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all active:scale-95 gap-1 ${status === 'absent'
                                                ? 'bg-red-500 text-white shadow-lg shadow-red-200'
                                                : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-500'
                                                }`}
                                        >
                                            <i className="fas fa-times-circle text-lg"></i>
                                            Absent
                                        </button>
                                        {/* Late */}
                                        <button
                                            onClick={() => handleStatusChange(student.id!, 'late')}
                                            className={`flex flex-col items-center justify-center py-3 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all active:scale-95 gap-1 ${status === 'late'
                                                ? 'bg-orange-400 text-white shadow-lg shadow-orange-200'
                                                : 'bg-gray-100 text-gray-400 hover:bg-orange-50 hover:text-orange-500'
                                                }`}
                                        >
                                            <i className="fas fa-clock text-lg"></i>
                                            Late
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {students.length === 0 && (
                            <p className="text-center text-gray-400 italic py-8">No students found in this class.</p>
                        )}
                    </div>

                    {/* === DESKTOP: Table layout (hidden on mobile) === */}
                    <div className="hidden md:block overflow-hidden border border-gray-100 rounded-xl">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 text-gray-400 text-xs uppercase font-bold">
                                <tr>
                                    <th className="px-6 py-4">Student Name</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {students.map(student => (
                                    <tr key={student.id} className="hover:bg-gray-50/30 transition-colors">
                                         <td className="px-6 py-4 font-bold text-gray-700">{student.fullName}</td>
                                        <td className="px-6 py-4 flex justify-center gap-4">
                                            <label className="cursor-pointer flex items-center gap-2">
                                                <input type="radio" name={`status-${student.id}`} checked={attendanceData[student.id!] === 'present'} onChange={() => handleStatusChange(student.id!, 'present')} className="w-5 h-5 text-green-500 focus:ring-green-500" />
                                                <span className="text-sm font-medium text-gray-600">Present</span>
                                            </label>
                                            <label className="cursor-pointer flex items-center gap-2">
                                                <input type="radio" name={`status-${student.id}`} checked={attendanceData[student.id!] === 'absent'} onChange={() => handleStatusChange(student.id!, 'absent')} className="w-5 h-5 text-red-500 focus:ring-red-500" />
                                                <span className="text-sm font-medium text-gray-600">Absent</span>
                                            </label>
                                            <label className="cursor-pointer flex items-center gap-2">
                                                <input type="radio" name={`status-${student.id}`} checked={attendanceData[student.id!] === 'late'} onChange={() => handleStatusChange(student.id!, 'late')} className="w-5 h-5 text-orange-500 focus:ring-orange-500" />
                                                <span className="text-sm font-medium text-gray-600">Late</span>
                                            </label>
                                        </td>
                                    </tr>
                                ))}
                                {students.length === 0 && (
                                    <tr>
                                        <td colSpan={2} className="px-6 py-8 text-center text-gray-400 italic">No students found in this class.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-2">
                        <button
                            onClick={handleSave}
                            disabled={saving || students.length === 0}
                            className="w-full md:w-auto px-8 py-4 md:py-3 bg-indigo-600 text-white rounded-2xl md:rounded-xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none active:scale-95"
                        >
                            {saving ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-save"></i> Save Attendance</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarkAttendance;

