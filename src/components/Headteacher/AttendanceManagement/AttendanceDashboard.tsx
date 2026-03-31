import React, { useState } from 'react';
import MarkAttendance from './MarkAttendance';
import AttendanceReports from './AttendanceReports';

const AttendanceDashboard: React.FC = () => {
    const [view, setView] = useState<'overview' | 'mark' | 'report'>('overview');

    if (view === 'mark') {
        return <MarkAttendance onBack={() => setView('overview')} />;
    }

    if (view === 'report') {
        return <AttendanceReports onBack={() => setView('overview')} />;
    }

    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 text-2xl">
                    <i className="fas fa-calendar-check"></i>
                </div>
                <div>
                    <h2 className="text-2xl font-black text-gray-800">Attendance Management</h2>
                    <p className="text-gray-500 font-medium">Track daily attendance and view reports</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Mark Attendance Card */}
                <div
                    onClick={() => setView('mark')}
                    className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-orange-50 border border-orange-50 hover:shadow-2xl hover:scale-[1.02] transition-all cursor-pointer group relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-[100%] transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-16 h-16 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-3xl mb-6 shadow-lg shadow-orange-200">
                            <i className="fas fa-edit"></i>
                        </div>
                        <h3 className="text-2xl font-black text-gray-800 mb-2">Mark Attendance</h3>
                        <p className="text-gray-500 font-medium">Daily register for all classes.</p>

                        <div className="mt-8 flex items-center text-orange-600 font-bold gap-2 group-hover:gap-4 transition-all">
                            <span>Start Marking</span>
                            <i className="fas fa-arrow-right"></i>
                        </div>
                    </div>
                </div>

                {/* View Reports Card */}
                <div
                    onClick={() => setView('report')}
                    className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-blue-50 border border-blue-50 hover:shadow-2xl hover:scale-[1.02] transition-all cursor-pointer group relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-[100%] transition-transform group-hover:scale-110"></div>
                    <div className="relative z-10">
                        <div className="w-16 h-16 rounded-2xl bg-blue-500 text-white flex items-center justify-center text-3xl mb-6 shadow-lg shadow-blue-200">
                            <i className="fas fa-chart-pie"></i>
                        </div>
                        <h3 className="text-2xl font-black text-gray-800 mb-2">View Reports</h3>
                        <p className="text-gray-500 font-medium">Monthly summaries and percentages.</p>

                        <div className="mt-8 flex items-center text-blue-600 font-bold gap-2 group-hover:gap-4 transition-all">
                            <span>View Analytics</span>
                            <i className="fas fa-arrow-right"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity or Quick Stats (Placeholder for future) */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10">
                    <h3 className="text-xl font-bold mb-2">Did you know?</h3>
                    <p className="text-gray-300">Regular attendance tracking improves student performance by 20%.</p>
                </div>
                <i className="fas fa-lightbulb absolute -bottom-4 -right-4 text-9xl text-white opacity-5 rotate-12"></i>
            </div>
        </div>
    );
};

export default AttendanceDashboard;
