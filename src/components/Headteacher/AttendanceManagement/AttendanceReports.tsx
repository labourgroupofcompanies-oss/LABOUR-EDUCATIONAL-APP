import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb, type Attendance } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import { dbService } from '../../../services/dbService';
import PrintPortal from '../../Common/PrintPortal';
import { db } from '../../../db';

const AttendanceReports: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { user } = useAuth();
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
    const [attendanceData, setAttendanceData] = useState<Attendance[]>([]);
    const [isPrinting, setIsPrinting] = useState(false);

    // Fetch Classes
    const classes = useLiveQuery(async () => {
        if (user?.schoolId && user.id) {
            if (user.role?.toUpperCase() === 'TEACHER') {
                return await dbService.classes.getTeacherClasses(user.schoolId, user.id.toString());
            }
            return await dbService.classes.getAll(user.schoolId);
        }
        return [];
    }, [user?.schoolId, user?.role, user?.id]);

    const schoolData = useLiveQuery(async () => {
        if (user?.schoolId) {
            return await db.schools
                .where('schoolId').equals(user.schoolId)
                .or('idCloud').equals(user.schoolId)
                .first();
        }
        return null;
    }, [user?.schoolId]);

    // Fetch Students
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

    // Fetch Attendance for the month
    useEffect(() => {
        const loadData = async () => {
            if (user?.schoolId && selectedClassId && selectedMonth) {
                const [year, month] = selectedMonth.split('-').map(Number);
                const startDate = new Date(year, month - 1, 1).getTime();
                const endDate = new Date(year, month, 0, 23, 59, 59).getTime();
                const targetClass = await eduDb.classes.get(selectedClassId);
                const classCloudId = targetClass?.idCloud;

                const records = await eduDb.attendance
                    .where('schoolId').equals(user.schoolId)
                    .filter(a => 
                        !!((a.classId === selectedClassId || (classCloudId && (a.classId as any) === classCloudId)) && 
                        a.date >= startDate && 
                        a.date <= endDate && 
                        !a.isDeleted)
                    )
                    .toArray();

                // Deduplicate by student and exact calendar day
                const uniqueMap = new Map<string, any>();
                records.forEach(r => {
                    const localDate = new Date(r.date).toLocaleDateString('en-CA');
                    const key = `${r.studentId}_${localDate}`;
                    if (!uniqueMap.has(key) || uniqueMap.get(key).updatedAt < r.updatedAt) {
                        uniqueMap.set(key, r);
                    }
                });
                
                setAttendanceData(Array.from(uniqueMap.values()));
            }
        };
        loadData();
    }, [user?.schoolId, selectedClassId, selectedMonth]);

    // Helpers
    const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
    const days = selectedMonth
        ? Array.from({ length: getDaysInMonth(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1])) }, (_, i) => i + 1)
        : [];

    const getStatusForDay = (student: any, day: number) =>
        attendanceData.find(a => (a.studentId === student.id || (a.studentId as any) === student.idCloud) && new Date(a.date).getDate() === day)?.status;

    const schoolDays = new Set(attendanceData.map(a => new Date(a.date).getDate())).size;

    const calculatePercentage = (student: any) => {
        if (schoolDays === 0) return 0;
        const studentRecords = attendanceData.filter(a => a.studentId === student.id || (a.studentId as any) === student.idCloud);
        const present = studentRecords.filter(a => a.status === 'present' || a.status === 'late').length;
        return Math.round((present / schoolDays) * 100);
    };

    const getMonthLabel = () => {
        if (!selectedMonth) return '';
        const [year, month] = selectedMonth.split('-').map(Number);
        return new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    };

    const statusDotClass = (status: string | undefined) => {
        if (status === 'present') return 'bg-green-500';
        if (status === 'absent') return 'bg-red-400';
        if (status === 'late') return 'bg-orange-400';
        return 'bg-gray-100';
    };

    const percentColor = (pct: number) => {
        if (pct >= 80) return 'text-green-600 bg-green-50 border-green-200';
        if (pct >= 60) return 'text-orange-500 bg-orange-50 border-orange-200';
        return 'text-red-500 bg-red-50 border-red-200';
    };

    const handlePrint = () => {
        setIsPrinting(true);
        setTimeout(() => {
            window.print();
            setIsPrinting(false);
        }, 100);
    };

    return (
        <div className="bg-white rounded-[2rem] p-5 md:p-8 shadow-sm border border-gray-50 animate-fadeIn">

            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-6 md:mb-8">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-gray-400 hover:text-indigo-600 font-black text-[9px] uppercase tracking-widest transition-all"
                >
                    <i className="fas fa-arrow-left"></i>
                    <span className="hidden sm:inline">Back</span>
                </button>
                <div className="text-center">
                    <h2 className="text-lg md:text-2xl font-black text-gray-800 tracking-tight">Attendance Report</h2>
                    {selectedClassId && (
                        <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mt-0.5">{getMonthLabel()}</p>
                    )}
                </div>
                <div className="flex justify-end">
                    {selectedClassId && students && students.length > 0 && (
                        <button
                            onClick={handlePrint}
                            className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                            <i className="fas fa-print"></i> Print
                        </button>
                    )}
                </div>
            </div>

            {/* ── Filters ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 md:mb-8 bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
                <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Class</label>
                    <select
                        className="w-full bg-white px-3 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-gray-700 text-sm"
                        value={selectedClassId || ''}
                        onChange={(e) => setSelectedClassId(Number(e.target.value))}
                    >
                        <option value="">Select Class...</option>
                        {classes?.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Month</label>
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full bg-white px-3 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-gray-700 text-sm"
                    />
                </div>
            </div>

            {selectedClassId && students && (
                <>
                    {/* ── Summary Stats ── */}
                    {students.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-center">
                                <p className="text-green-600 font-black text-xl md:text-2xl">{students.filter(s => calculatePercentage(s) >= 80).length}</p>
                                <p className="text-green-700 text-[8px] md:text-[9px] font-black uppercase tracking-wide mt-0.5">Good<br />≥80%</p>
                            </div>
                            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 text-center">
                                <p className="text-orange-500 font-black text-xl md:text-2xl">{students.filter(s => { const p = calculatePercentage(s); return p >= 60 && p < 80; }).length}</p>
                                <p className="text-orange-600 text-[8px] md:text-[9px] font-black uppercase tracking-wide mt-0.5">Fair<br />60–79%</p>
                            </div>
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-center">
                                <p className="text-red-500 font-black text-xl md:text-2xl">{students.filter(s => calculatePercentage(s) < 60).length}</p>
                                <p className="text-red-600 text-[8px] md:text-[9px] font-black uppercase tracking-wide mt-0.5">Poor<br />&lt;60%</p>
                            </div>
                        </div>
                    )}

                    {/* ── MOBILE: Card per student (hidden on md+) ── */}
                    <div className="md:hidden space-y-4">
                        {students.map(student => {
                            const pct = calculatePercentage(student);
                            return (
                                <div key={student.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    {/* Student header row */}
                                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50 border-b border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                                <i className="fas fa-user-graduate text-indigo-500 text-xs"></i>
                                            </div>
                                             <p className="font-black text-gray-800 text-sm truncate max-w-[160px]">{student.fullName}</p>
                                        </div>
                                        <div className={`px-3 py-1 rounded-full border font-black text-sm ${percentColor(pct)}`}>
                                            {pct}%
                                        </div>
                                    </div>

                                    {/* Day dot grid */}
                                    <div className="px-4 py-3">
                                        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-2">Daily Record — {getMonthLabel()}</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {days.map(day => {
                                                const status = getStatusForDay(student, day);
                                                return (
                                                    <div key={day} className="flex flex-col items-center gap-0.5">
                                                        <span className="text-[7px] text-gray-300 font-bold leading-none">{day}</span>
                                                        <div className={`w-4 h-4 rounded-sm ${statusDotClass(status)}`} title={status || 'no record'}></div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {/* Legend */}
                                        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-gray-50">
                                            <span className="flex items-center gap-1 text-[8px] text-gray-400 font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block"></span>Present</span>
                                            <span className="flex items-center gap-1 text-[8px] text-gray-400 font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block"></span>Absent</span>
                                            <span className="flex items-center gap-1 text-[8px] text-gray-400 font-bold"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block"></span>Late</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {students.length === 0 && (
                            <div className="py-12 text-center text-gray-400">
                                <i className="fas fa-users text-4xl mb-3 block opacity-30"></i>
                                <p className="italic text-sm">No students in this class.</p>
                            </div>
                        )}
                    </div>

                    {/* ── DESKTOP: Wide scrollable table (hidden on mobile) ── */}
                    <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    <th className="text-left px-4 py-3 bg-gray-50 font-black text-gray-500 text-xs uppercase tracking-widest rounded-tl-xl sticky left-0 z-10">Student</th>
                                    <th className="text-center px-4 py-3 bg-indigo-50 text-indigo-600 font-black text-xs uppercase tracking-widest">Total %</th>
                                    {days.map(day => (
                                        <th key={day} className="px-2 py-3 text-xs font-bold text-gray-400 border-l border-gray-100 min-w-[30px] text-center">{day}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {students.map(student => {
                                    return (
                                        <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-3 border-b border-gray-50 bg-white sticky left-0 z-10 w-[200px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                <p className="font-bold text-gray-800 text-xs truncate" title={student.fullName}>{student.fullName}</p>
                                                <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wider">{student.studentIdString}</p>
                                            </td>
                                            <td className="px-4 py-3 border-b border-l border-gray-50 text-center bg-indigo-50/30">
                                                <span className={`px-2 py-0.5 rounded-md font-black text-xs border ${percentColor(calculatePercentage(student))}`}>
                                                    {calculatePercentage(student)}%
                                                </span>
                                            </td>
                                            {days.map(day => {
                                                const status = getStatusForDay(student, day);
                                                return (
                                                    <td key={day} className="text-center border-l border-dashed border-gray-100 py-3">
                                                        {status === 'present' && <i className="fas fa-check text-green-500 text-xs"></i>}
                                                        {status === 'absent' && <i className="fas fa-times text-red-400 text-xs"></i>}
                                                        {status === 'late' && <i className="fas fa-clock text-orange-400 text-xs"></i>}
                                                        {!status && <span className="text-gray-200 text-xs">·</span>}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {students.length === 0 && (
                            <div className="p-8 text-center text-gray-400 italic">No students in this class.</div>
                        )}
                    </div>
                </>
            )}

            {!selectedClassId && (
                <div className="py-16 text-center text-gray-300">
                    <i className="fas fa-chart-pie text-6xl mb-4 block"></i>
                    <p className="font-black text-sm uppercase tracking-widest">Select a class to view report</p>
                </div>
            )}

            {/* Print Portal */}
            {isPrinting && selectedClassId && students && (
                <PrintPortal>
                    <div className="print-a4-landscape p-8 space-y-6">
                        <div className="flex justify-between items-start border-b-2 border-gray-100 pb-4">
                            <div>
                                 <h1 className="text-2xl font-black text-gray-800">{schoolData?.schoolName || 'School Name'}</h1>
                                <p className="text-xs font-black text-indigo-500 uppercase tracking-widest mt-1">
                                    Monthly Attendance Record · {getMonthLabel()}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Class</p>
                                <p className="text-sm font-black text-gray-800">{classes?.find(c => c.id === selectedClassId)?.name}</p>
                            </div>
                        </div>

                        <table className="w-full border-collapse border border-gray-200">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="border border-gray-200 text-left px-3 py-2 font-black text-[10px] uppercase tracking-widest text-gray-600">Student Name</th>
                                    <th className="border border-gray-200 text-center px-1 py-2 font-black text-[10px] uppercase tracking-widest text-indigo-600">Total %</th>
                                    {days.map(day => (
                                        <th key={day} className="border border-gray-200 px-0.5 py-1 text-[8px] font-bold text-gray-400 text-center min-w-[18px]">{day}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {students.map(student => {
                                    const pct = calculatePercentage(student.id!);
                                    return (
                                        <tr key={student.id}>
                                             <td className="border border-gray-200 px-3 py-1.5 font-bold text-gray-700 text-xs min-w-[150px]">{student.fullName}</td>
                                            <td className={`border border-gray-200 px-1 py-1 text-center font-black text-xs ${pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-orange-500' : 'text-red-500'}`}>
                                                {pct}%
                                            </td>
                                            {days.map(day => {
                                                const status = getStatusForDay(student.id!, day);
                                                return (
                                                    <td key={day} className="border border-gray-100 text-center px-0.5 py-1">
                                                        {status === 'present' && <span className="text-green-500 text-[10px]">●</span>}
                                                        {status === 'absent' && <span className="text-red-400 text-[10px]">○</span>}
                                                        {status === 'late' && <span className="text-orange-400 text-[10px]">△</span>}
                                                        {!status && <span className="text-gray-100 text-[8px]">·</span>}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div className="grid grid-cols-3 gap-6 pt-10 border-t border-dashed border-gray-200">
                            <div className="text-[10px] text-gray-400 font-bold space-y-1">
                                <p className="text-gray-600 uppercase tracking-widest">Legend:</p>
                                <p><span className="text-green-500 mr-2 text-base leading-none">●</span> Present</p>
                                <p><span className="text-red-400 mr-2 text-base leading-none">○</span> Absent</p>
                                <p><span className="text-orange-400 mr-2 text-base leading-none">△</span> Late</p>
                            </div>
                            <div className="text-center">
                                <div className="border-b border-gray-300 w-48 mx-auto mb-2"></div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Class Teacher Signature</p>
                            </div>
                            <div className="text-center">
                                <div className="border-b border-gray-300 w-48 mx-auto mb-2"></div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Headteacher's Review</p>
                            </div>
                        </div>

                        <p className="text-center text-[9px] text-gray-300 italic pt-6">
                            Monthly attendance summary generated on {new Date().toLocaleDateString('en-GH')}.
                        </p>
                    </div>
                </PrintPortal>
            )}
        </div>
    );
};

export default AttendanceReports;
