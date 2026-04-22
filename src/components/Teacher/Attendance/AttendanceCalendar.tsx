import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../../hooks/useAuth';
import { attendanceService } from '../../../services/attendanceService';
import { dbService } from '../../../services/dbService';

const AttendanceCalendar: React.FC = () => {
    const { user } = useAuth();
    const [viewDate, setViewDate] = useState(new Date());
    const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();

    // Fetch Classes
    const assignedClasses = useLiveQuery(async () => {
        if (!user?.schoolId || !user?.id) return [];
        const classes = await dbService.classes.getAsClassTeacher(user.schoolId, user.id.toString());
        if (classes.length === 1 && !selectedClassId) {
            setSelectedClassId(classes[0].id!);
        }
        return classes;
    }, [user?.schoolId, user?.username]);

    // Fetch monthly history
    const history = useLiveQuery(async () => {
        if (!user?.schoolId || !selectedClassId) return {};
        return await attendanceService.getClassMonthlyHistory(user.schoolId, selectedClassId, month, year);
    }, [user?.schoolId, selectedClassId, month, year]);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const monthName = viewDate.toLocaleString('default', { month: 'long' });

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

    // Attendance Color Logic
    const getDayColor = (dateKey: string) => {
        const stats = history?.[dateKey];
        if (!stats) return 'bg-gray-50 text-gray-300';
        
        const percentage = (stats.present / stats.total) * 100;
        if (percentage >= 90) return 'bg-green-100 text-green-700 border-green-200';
        if (percentage >= 70) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        return 'bg-red-100 text-red-700 border-red-200';
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600 text-2xl shadow-sm">
                        <i className="fas fa-calendar-alt"></i>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-800 tracking-tight">Attendance History</h2>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Monthly class performance</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    <select
                        value={selectedClassId || ''}
                        onChange={(e) => setSelectedClassId(Number(e.target.value))}
                        className="w-full sm:w-auto bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-purple-500 transition-all"
                    >
                        <option value="">Select Class</option>
                        {assignedClasses?.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>

                    <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100 w-full sm:w-auto justify-between sm:justify-start">
                        <button onClick={prevMonth} className="px-3 py-1.5 hover:bg-white rounded-lg transition-all text-gray-500">
                            <i className="fas fa-chevron-left"></i>
                        </button>
                        <span className="px-4 text-xs md:text-sm font-black text-gray-700 min-w-[100px] md:min-w-[120px] text-center">
                            {monthName} {year}
                        </span>
                        <button onClick={nextMonth} className="px-3 py-1.5 hover:bg-white rounded-lg transition-all text-gray-500">
                            <i className="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>

            {selectedClassId ? (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                {day}
                            </div>
                        ))}
                        
                        {/* Empty slots for first week */}
                        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                            <div key={`empty-${i}`} className="h-16 md:h-32 rounded-lg md:rounded-2xl bg-gray-50/30"></div>
                        ))}

                        {/* Days of the month */}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const date = new Date(year, month, day);
                            const dateKey = date.toISOString().split('T')[0];
                            const stats = history?.[dateKey];
                            const isToday = new Date().toISOString().split('T')[0] === dateKey;

                            return (
                                <div 
                                    key={day} 
                                    className={`h-16 md:h-32 rounded-lg md:rounded-2xl border transition-all p-1.5 md:p-3 flex flex-col justify-between group cursor-default ${getDayColor(dateKey)} ${isToday ? 'ring-2 ring-purple-500 ring-offset-1' : ''}`}
                                >
                                    <span className="font-black text-[10px] md:text-sm">{day}</span>
                                    {stats ? (
                                        <div className="space-y-0.5 md:space-y-1 overflow-hidden">
                                            <p className="hidden md:block text-[8px] md:text-[10px] font-black uppercase tracking-tighter opacity-70">Present</p>
                                            <p className="text-xs md:text-lg font-black leading-none">{stats.present}<span className="text-[8px] md:text-[10px] opacity-40">/{stats.total}</span></p>
                                            <div className="w-full bg-black/5 h-1 md:h-1.5 rounded-full overflow-hidden mt-1 md:mt-2">
                                                <div 
                                                    className="h-full bg-current opacity-60" 
                                                    style={{ width: `${(stats.present / stats.total) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center flex-1 opacity-20">
                                            <i className="fas fa-minus text-[10px]"></i>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-8 flex flex-wrap items-center gap-6 justify-center border-t border-gray-50 pt-6">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-xs font-bold text-gray-500">90%+ Attendance</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <span className="text-xs font-bold text-gray-500">70-90% Attendance</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-xs font-bold text-gray-500">Below 70% Attendance</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-gray-200"></div>
                            <span className="text-xs font-bold text-gray-500">No Register</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white p-20 rounded-3xl border border-dashed border-gray-200 text-center">
                    <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 text-3xl mx-auto mb-6">
                        <i className="fas fa-arrow-up"></i>
                    </div>
                    <h3 className="text-xl font-black text-gray-800 mb-2">Select a Class</h3>
                    <p className="text-gray-400 font-medium max-w-xs mx-auto">Select a class to view attendance history and seasonal trends.</p>
                </div>
            )}
        </div>
    );
};

export default AttendanceCalendar;
