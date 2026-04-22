import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import { attendanceService } from '../../../services/attendanceService';
import { dbService } from '../../../services/dbService';
import { showToast } from '../../Common/Toast';

const AttendanceRegister: React.FC = () => {
    const { user } = useAuth();
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [attendanceData, setAttendanceData] = useState<Record<number, 'present' | 'absent' | 'late'>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch Classes assigned to this teacher
    const assignedClasses = useLiveQuery(async () => {
        if (!user?.schoolId || !user?.id) return [];
        const classes = await dbService.classes.getAsClassTeacher(user.schoolId, user.id.toString());

        // Auto-select if only one class
        if (classes.length === 1 && !selectedClassId) {
            setSelectedClassId(classes[0].id!);
        }
        return classes;
    }, [user?.schoolId, user?.id]);

    // Fetch Students and existing attendance
    const students = useLiveQuery(async () => {
        if (!user?.schoolId || !selectedClassId) return [];
        const raw = await eduDb.students
            .where({ schoolId: user.schoolId, classId: selectedClassId })
            .filter(s => !s.isDeleted)
            .toArray();
            
        // Deduplicate
        const seen = new Set<string>();
        return raw.filter(s => {
            if (!s.fullName) return true;
            const name = s.fullName.trim().toLowerCase();
            if (seen.has(name)) return false;
            seen.add(name);
            return true;
        });
    }, [user?.schoolId, selectedClassId]);

    useEffect(() => {
        const loadExisting = async () => {
            if (!user?.schoolId || !selectedClassId || !selectedDate) return;
            setIsLoading(true);
            try {
                const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);
                const data = await attendanceService.getClassAttendance(user.schoolId, selectedClassId, dayStart);

                const map: Record<number, 'present' | 'absent' | 'late'> = {};
                data.forEach(item => {
                    if (item.status && !item.isDeleted) {
                        map[item.studentId] = item.status as 'present' | 'absent' | 'late';
                    }
                });
                setAttendanceData(map);
            } finally {
                setIsLoading(false);
            }
        };
        loadExisting();
    }, [user?.schoolId, selectedClassId, selectedDate]);

    // Filter students by search term
    const filteredStudents = useMemo(() => {
        if (!students) return [];
        return students.filter(s =>
            s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.studentIdString?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [students, searchTerm]);

    const stats = useMemo(() => {
        const counts = { present: 0, late: 0, absent: 0, unmarked: 0 };
        students?.forEach(s => {
            const status = attendanceData[s.id!];
            if (status === 'present') counts.present++;
            else if (status === 'late') counts.late++;
            else if (status === 'absent') counts.absent++;
            else counts.unmarked++;
        });
        return counts;
    }, [students, attendanceData]);

    const handleStatusChange = (studentId: number, status: 'present' | 'absent' | 'late') => {
        setAttendanceData(prev => ({ ...prev, [studentId]: status }));
    };

    const markAllPresent = () => {
        const newMap = { ...attendanceData };
        students?.forEach(s => {
            newMap[s.id!] = 'present';
        });
        setAttendanceData(newMap);
    };

    const handleSave = async () => {
        if (!user?.schoolId || !selectedClassId || !selectedDate) return;

        setIsSaving(true);
        try {
            const dayStart = new Date(selectedDate).setHours(0, 0, 0, 0);
            
            // Save records for all currently fetched students to ensure no one is left implicitly unmarked
            const records = students!.map(student => ({
                studentId: student.id!,
                status: attendanceData[student.id!] || 'present'
            }));

            if (records.length === 0) {
                showToast('No attendance data to save', 'info');
                return;
            }

            await attendanceService.saveClassAttendance(
                user.schoolId,
                selectedClassId,
                dayStart,
                records,
                user.id
            );

            showToast('Attendance saved successfully', 'success');
        } catch (error: any) {
            console.error('Failed to save attendance:', error);
            showToast(error.message || 'Failed to save attendance', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header / Selection */}
            <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 text-2xl shadow-sm">
                            <i className="fas fa-calendar-check"></i>
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-800 tracking-tight">Daily Register</h2>
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Mark attendance for your class</p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        <div className="w-full sm:min-w-[140px]">
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1 ml-1">Class</label>
                            <select
                                value={selectedClassId || ''}
                                onChange={(e) => setSelectedClassId(Number(e.target.value))}
                                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                            >
                                <option value="">Select Class</option>
                                {assignedClasses?.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="w-full sm:min-w-[140px]">
                            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1 ml-1">Date</label>
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                            />
                        </div>
                    </div>
                </div>

                {selectedClassId && (
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-50">
                        <div className="flex gap-2 md:gap-4 overflow-x-auto pb-1 md:pb-0 w-full sm:w-auto">
                            <div className="bg-green-50 px-2.5 py-1.5 rounded-lg border border-green-100 flex-shrink-0 min-w-[60px]">
                                <p className="text-[7px] md:text-[8px] font-black text-green-600 uppercase tracking-widest mb-0.5">Present</p>
                                <p className="text-sm md:text-lg font-black text-green-700 leading-none">{stats.present}</p>
                            </div>
                            <div className="bg-yellow-50 px-2.5 py-1.5 rounded-lg border border-yellow-100 flex-shrink-0 min-w-[60px]">
                                <p className="text-[7px] md:text-[8px] font-black text-yellow-600 uppercase tracking-widest mb-0.5">Late</p>
                                <p className="text-sm md:text-lg font-black text-yellow-700 leading-none">{stats.late}</p>
                            </div>
                            <div className="bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-100 flex-shrink-0 min-w-[60px]">
                                <p className="text-[7px] md:text-[8px] font-black text-red-600 uppercase tracking-widest mb-0.5">Absent</p>
                                <p className="text-sm md:text-lg font-black text-red-700 leading-none">{stats.absent}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto">
                            <div className="relative flex-1 sm:w-48">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-[10px]"></i>
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-bold w-full focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                            </div>
                            <button
                                onClick={markAllPresent}
                                className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                            >
                                <i className="fas fa-check-double mr-1.5"></i>
                                All Present
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Student List */}
            {selectedClassId ? (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden pb-40 md:pb-32">
                    {isLoading ? (
                        <div className="p-20 flex flex-col items-center justify-center gap-4">
                            <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Loading records...</p>
                        </div>
                    ) : filteredStudents.length > 0 ? (
                        <div className="divide-y divide-gray-50">
                            {filteredStudents.map((student, idx) => {
                                const status = attendanceData[student.id!];
                                return (
                                    <div key={student.id} className={`flex items-center justify-between p-4 md:px-8 hover:bg-gray-50/50 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/20' : ''}`}>
                                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center font-bold text-xs md:text-sm border-2 border-white shadow-sm overflow-hidden flex-shrink-0">
                                                {student.photo ? (
                                                    <img src={URL.createObjectURL(student.photo)} className="w-full h-full object-cover" />
                                                ) : (
                                                    student.fullName.charAt(0)
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-800 leading-tight text-xs md:text-sm truncate">{student.fullName}</p>
                                                <p className="text-[9px] md:text-[10px] text-gray-400 font-medium uppercase tracking-wider truncate">{student.studentIdString || 'No ID'}</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <AttendanceButton
                                                active={status === 'present'}
                                                type="present"
                                                onClick={() => handleStatusChange(student.id!, 'present')}
                                            />
                                            <AttendanceButton
                                                active={status === 'late'}
                                                type="late"
                                                onClick={() => handleStatusChange(student.id!, 'late')}
                                            />
                                            <AttendanceButton
                                                active={status === 'absent'}
                                                type="absent"
                                                onClick={() => handleStatusChange(student.id!, 'absent')}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-20 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 text-2xl mx-auto mb-4">
                                <i className="fas fa-user-slash"></i>
                            </div>
                            <p className="text-gray-400 font-bold">No students found</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-white p-20 rounded-3xl border border-dashed border-gray-200 text-center">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 text-3xl mx-auto mb-6">
                        <i className="fas fa-arrow-up"></i>
                    </div>
                    <h3 className="text-xl font-black text-gray-800 mb-2">Select a Class</h3>
                    <p className="text-gray-400 font-medium max-w-xs mx-auto">Please select a class and date above to begin marking attendance.</p>
                </div>
            )}

            {/* Bottom Floating Action Bar */}
            {selectedClassId && filteredStudents.length > 0 && (
                <div className="fixed bottom-24 md:bottom-8 right-6 z-50">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-indigo-600 text-white px-5 py-3 rounded-xl shadow-2xl shadow-indigo-300 hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:scale-100"
                    >
                        {isSaving ? (
                            <i className="fas fa-spinner fa-spin text-lg"></i>
                        ) : (
                            <i className="fas fa-save text-lg"></i>
                        )}
                        <span className="font-black text-[10px] uppercase tracking-[0.2em]">Save Register</span>
                    </button>
                </div>
            )}
        </div>
    );
};

const AttendanceButton: React.FC<{ active: boolean; type: 'present' | 'late' | 'absent'; onClick: () => void }> = ({ active, type, onClick }) => {
    const config = {
        present: { icon: 'fa-check', label: 'Present', color: 'bg-green-500', hover: 'hover:bg-green-50 hover:text-green-600', active: 'bg-green-500 text-white shadow-green-100' },
        late: { icon: 'fa-clock', label: 'Late', color: 'bg-yellow-500', hover: 'hover:bg-yellow-50 hover:text-yellow-600', active: 'bg-yellow-500 text-white shadow-yellow-100' },
        absent: { icon: 'fa-times', label: 'Absent', color: 'bg-red-500', hover: 'hover:bg-red-50 hover:text-red-600', active: 'bg-red-500 text-white shadow-red-100' },
    };

    const { icon, label, active: activeClass, hover } = config[type];

    return (
        <button
            onClick={onClick}
            title={label}
            className={`w-10 h-10 md:w-auto md:px-4 flex items-center justify-center gap-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${active ? activeClass + ' shadow-lg scale-110' : 'bg-gray-100 text-gray-400 ' + hover
                }`}
        >
            <i className={`fas ${icon}`}></i>
            <span className="hidden md:inline">{label}</span>
        </button>
    );
};

export default AttendanceRegister;
