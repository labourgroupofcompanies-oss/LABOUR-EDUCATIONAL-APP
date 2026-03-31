
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { eduDb } from '../../../eduDb';
import { useAuth } from '../../../hooks/useAuth';
import { showConfirm } from '../../Common/ConfirmDialog';
import { showToast } from '../../Common/Toast';
import { supabase } from '../../../supabaseClient';

interface StudentProfileProps {
    studentId: number;
    onBack: () => void;
    onEdit: () => void;
}

const StudentProfile: React.FC<StudentProfileProps> = ({ studentId, onBack, onEdit }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'details' | 'academic' | 'attendance'>('details');

    const student = useLiveQuery(() => eduDb.students.get(studentId), [studentId]);

    // Fetch related data
    const className = useLiveQuery(async () => {
        if (student?.classId) {
            const cls = await eduDb.classes.get(student.classId);
            return cls?.name;
        }
        return 'Unknown Class';
    }, [student?.classId]);

    const results = useLiveQuery(async () => {
        const currentStudent = await eduDb.students.get(studentId);
        if (!currentStudent) return [];
        return await eduDb.results
            .filter(r => {
                const matchId = r.studentId === studentId || (currentStudent.idCloud ? (r.studentId as any) === currentStudent.idCloud : false);
                return Boolean(matchId && !r.isDeleted);
            })
            .toArray();
    }, [studentId]);

    // Build a subjectId → name lookup map
    const subjectsMap = useLiveQuery(async () => {
        if (!user?.schoolId) return {};
        const allSubjects = await eduDb.subjects.where('schoolId').equals(user.schoolId).toArray();
        const map: Record<string | number, string> = {};
        allSubjects.forEach(s => {
            if (s.id) map[s.id] = s.name;
            if (s.idCloud) map[s.idCloud] = s.name;
        });
        return map;
    }, [user?.schoolId]);

    const attendanceRecords = useLiveQuery(async () => {
        const currentStudent = await eduDb.students.get(studentId);
        if (!currentStudent) return [];
        const rawRecords = await eduDb.attendance
            .filter(a => 
                !!((a.studentId === studentId || (currentStudent.idCloud && (a.studentId as any) === currentStudent.idCloud)) && !a.isDeleted)
            )
            .toArray();
            
        // Deduplicate by exact calendar day to handle sync timezone artifacts
        const uniqueMap = new Map<string, any>();
        rawRecords.forEach(r => {
            // Local date string ensures '2026-03-22 00:00:00' and '2026-03-21 20:00:00' don't artificially double-count if user hasn't wiped DB
            const localDate = new Date(r.date).toLocaleDateString('en-CA');
            // Keep the latest record if duplicates exist
            if (!uniqueMap.has(localDate) || uniqueMap.get(localDate).updatedAt < r.updatedAt) {
                uniqueMap.set(localDate, r);
            }
        });
        
        return Array.from(uniqueMap.values()).sort((a, b) => a.date - b.date);
    }, [studentId]);

    const attendanceStats = React.useMemo(() => {
        if (!attendanceRecords) return { total: 0, present: 0, absent: 0, late: 0, percent: 0 };
        const total = attendanceRecords.length;
        const present = attendanceRecords.filter(r => r.status === 'present').length;
        const absent = attendanceRecords.filter(r => r.status === 'absent').length;
        const late = attendanceRecords.filter(r => r.status === 'late').length;
        const percent = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
        return { total, present, absent, late, percent };
    }, [attendanceRecords]);

    const handleDelete = async () => {
        if (!student) return;

        const confirmed = await showConfirm({
            title: 'Delete Student',
            message: `Are you sure you want to permanently delete this student's record? This action cannot be undone.`,
            confirmText: 'Yes, Delete',
            cancelText: 'Cancel',
            variant: 'danger',
        });

        if (confirmed) {
            try {
                if (student.idCloud) {
                    const { error } = await supabase
                        .from('students')
                        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                        .eq('school_id', user?.schoolId)
                        .eq('student_id_string', student.studentIdString); // Use the unique constraint

                    // Fallback to id filter if student_id_string is missing
                    if (error) {
                        const { error: fallbackError } = await supabase
                            .from('students')
                            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                            .eq('id', student.idCloud);
                        
                        if (fallbackError) throw fallbackError;
                    }
                }

                await eduDb.students.update(studentId, {
                    isDeleted: true,
                    deletedAt: Date.now(),
                    updatedAt: Date.now(),
                    syncStatus: student.idCloud ? 'synced' : 'pending' // If successfully deleted online, mark synced
                } as any);

                showToast('Student record deleted', 'info');
                onBack();
            } catch (error) {
                console.error('Error deleting student:', error);
                showToast('Failed to delete student online. Please check connection and try again.', 'error');
            }
        }
    };

    if (!student) return <div className="p-8 text-center"><i className="fas fa-spinner animate-spin"></i> Loading...</div>;

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-gray-100 pb-6">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
                        <i className="fas fa-arrow-left text-gray-600"></i>
                    </button>
                    <h2 className="text-xl md:text-2xl font-bold text-gray-800">Student Profile</h2>
                </div>
                <div className="sm:ml-auto flex gap-2">
                    <button 
                        onClick={() => {
                            // Custom event to navigate to results/reportcards in HeadteacherDashboard
                            const event = new CustomEvent('navigate-to-report-cards', { 
                                detail: { studentId: studentId.toString(), classId: student?.classId?.toString() } 
                            });
                            window.dispatchEvent(event);
                        }}
                        className="flex-1 sm:flex-none px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-colors text-sm"
                    >
                        <i className="fas fa-file-invoice mr-2"></i> Report Card
                    </button>
                    <button onClick={onEdit} className="flex-1 sm:flex-none px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-colors text-sm">
                        <i className="fas fa-edit mr-2"></i> Edit
                    </button>
                    <button onClick={handleDelete} className="flex-1 sm:flex-none px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors text-sm">
                        <i className="fas fa-trash-alt mr-2"></i> Delete
                    </button>
                </div>
            </div>

            {/* Profile Overview Card */}
            <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-3xl p-5 md:p-8 text-white shadow-xl shadow-blue-200 flex flex-col md:flex-row items-center gap-6 md:gap-8">
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-white/30 shadow-lg overflow-hidden flex-shrink-0 bg-white/10 backdrop-blur-sm">
                    {student.photo ? (
                        <img src={URL.createObjectURL(student.photo)} alt={student.fullName} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/50 text-4xl">
                            <i className="fas fa-user"></i>
                        </div>
                    )}
                </div>
                <div className="text-center md:text-left">
                    <h1 className="text-3xl font-black mb-2">{student?.fullName}</h1>
                    <p className="text-blue-100 font-medium mb-1 flex items-center justify-center md:justify-start gap-2">
                        <i className="fas fa-id-card opacity-70"></i> {student?.studentIdString}
                    </p>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-4">
                        <span className="px-3 py-1 bg-white/20 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/10">
                            {className || 'No Class'}
                        </span>
                        <span className="px-3 py-1 bg-white/20 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/10 capitalize">
                            {student?.gender}
                        </span>
                        {student?.isBoarding && (
                            <span className="px-3 py-1 bg-yellow-400/20 text-yellow-200 rounded-lg text-sm font-bold backdrop-blur-sm border border-yellow-400/30">
                                <i className="fas fa-bed mr-1"></i> Boarding
                            </span>
                        )}
                        <span className={`px-3 py-1 rounded-lg text-sm font-bold backdrop-blur-sm border ${student?.syncStatus === 'synced' ? 'bg-green-400/20 text-green-200 border-green-400/30' :
                            student?.syncStatus === 'pending' ? 'bg-indigo-400/20 text-indigo-200 border-indigo-400/30' :
                                'bg-red-400/20 text-red-200 border-red-400/30'
                            } capitalize`}>
                            <i className={`fas ${student?.syncStatus === 'synced' ? 'fa-cloud-upload-alt' : student?.syncStatus === 'pending' ? 'fa-sync fa-spin' : 'fa-exclamation-triangle'} mr-1`}></i>
                            {student?.syncStatus || 'Pending'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="grid grid-cols-3 border-b border-gray-100 -mx-4 px-4 sm:mx-0 sm:px-0">
                {[
                    { id: 'details', icon: 'fa-user-circle' },
                    { id: 'academic', icon: 'fa-graduation-cap' },
                    { id: 'attendance', icon: 'fa-calendar-check' }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`py-4 font-bold text-xs sm:text-sm capitalize transition-all border-b-2 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 ${activeTab === tab.id ? 'text-blue-600 border-blue-600 bg-blue-50/50' : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'}`}
                    >
                        <i className={`fas ${tab.icon} text-base sm:text-sm`}></i>
                        <span>{tab.id}</span>
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[300px]">
                {activeTab === 'details' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fadeIn">
                        {/* Personal Info */}
                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-user-circle text-blue-500"></i> Personal Information
                            </h3>
                            <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-2 gap-1">
                                    <span className="text-gray-500 text-xs sm:text-sm">Date of Birth</span>
                                    <span className="font-bold text-gray-700">
                                        {student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-2 gap-1">
                                    <span className="text-gray-500 text-xs sm:text-sm">Religion</span>
                                    <span className="font-bold text-gray-700">{student.religion || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 text-sm block mb-1">Residential Address</span>
                                    <p className="font-bold text-gray-700">{student.residentialAddress || 'N/A'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Guardian Info */}
                        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-users text-purple-500"></i> Guardian Information
                            </h3>
                            {student.guardianName ? (
                                <div className="space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-2 gap-1">
                                        <span className="text-gray-500 text-xs sm:text-sm">Name</span>
                                        <span className="font-bold text-gray-700">{student.guardianName}</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-2 gap-1">
                                        <span className="text-gray-500 text-xs sm:text-sm">Primary Contact</span>
                                        <span className="font-bold text-gray-700">{student.guardianPrimaryContact}</span>
                                    </div>
                                    {student.guardianSecondaryContact && (
                                        <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-2 gap-1">
                                            <span className="text-gray-500 text-xs sm:text-sm">Secondary Contact</span>
                                            <span className="font-bold text-gray-700">{student.guardianSecondaryContact}</span>
                                        </div>
                                    )}
                                    <div className="flex flex-col sm:flex-row sm:justify-between border-b border-gray-200 pb-2 gap-1">
                                        <span className="text-gray-500 text-xs sm:text-sm">Email</span>
                                        <span className="font-bold text-gray-700">{student.guardianEmail || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                                        <span className="text-gray-500 text-xs sm:text-sm">Occupation</span>
                                        <span className="font-bold text-gray-700">{student.guardianOccupation || 'N/A'}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-400 italic">No guardian information available.</p>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'academic' && (
                    <div className="animate-fadeIn">
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                            {results?.length === 0 ? (
                                <div className="bg-white p-8 text-center text-gray-400 rounded-2xl border border-gray-100">
                                    No exam results recorded yet.
                                </div>
                            ) : (
                                results?.map((result) => (
                                    <div key={result.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-black text-gray-800 text-lg">{subjectsMap?.[result.subjectId] ?? `Subject #${result.subjectId}`}</h4>
                                                <p className="text-gray-500 text-xs">{result.term} {result.year}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-black ${result.totalScore >= 75 ? 'bg-green-100 text-green-700' :
                                                result.totalScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                Grade: {result.grade || (result.totalScore >= 75 ? 'A' : result.totalScore >= 50 ? 'C' : 'F')}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                                            <span className="text-gray-500 text-sm font-medium">Total Score</span>
                                            <span className="text-xl font-black text-blue-600">{Math.round(result.totalScore)}%</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Subject</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Term</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Score</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Grade</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {results?.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                                                No exam results recorded yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        results?.map((result) => (
                                            <tr key={result.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 text-sm font-bold text-gray-700">{subjectsMap?.[result.subjectId] ?? `Subject #${result.subjectId}`}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{result.term} {result.year}</td>
                                                <td className="px-6 py-4 text-sm font-bold text-blue-600">{Math.round(result.totalScore)}%</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${result.totalScore >= 75 ? 'bg-green-100 text-green-700' :
                                                        result.totalScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                        {result.grade || (result.totalScore >= 75 ? 'A' : result.totalScore >= 50 ? 'C' : 'F')}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'attendance' && (
                    <div className="animate-fadeIn space-y-6">
                        {/* Attendance Summary Dashboard */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                                <p className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">Total Days</p>
                                <p className="text-2xl font-black text-blue-900">{attendanceStats.total}</p>
                            </div>
                            <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                                <p className="text-green-600 text-xs font-bold uppercase tracking-wider mb-1">Attendance %</p>
                                <p className="text-2xl font-black text-green-900">{attendanceStats.percent}%</p>
                            </div>
                            <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-100">
                                <p className="text-yellow-600 text-xs font-bold uppercase tracking-wider mb-1">Late</p>
                                <p className="text-2xl font-black text-yellow-900">{attendanceStats.late}</p>
                            </div>
                            <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                                <p className="text-red-600 text-xs font-bold uppercase tracking-wider mb-1">Absences</p>
                                <p className="text-2xl font-black text-red-900">{attendanceStats.absent}</p>
                            </div>
                        </div>

                        {/* Attendance List */}
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                            <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                                <h4 className="font-bold text-gray-800">Recent Records</h4>
                                <span className="text-xs text-gray-500 font-medium">Last {Math.min(attendanceRecords?.length || 0, 30)} records</span>
                            </div>

                            {!attendanceRecords || attendanceRecords.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <i className="fas fa-calendar-alt text-4xl mb-4 opacity-50"></i>
                                    <p className="font-bold">No attendance records found</p>
                                    <p className="text-sm">Start marking attendance to see history here.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {[...attendanceRecords].reverse().slice(0, 30).map((record) => (
                                        <div key={record.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm ${record.status === 'present' ? 'bg-green-100 text-green-600' :
                                                    record.status === 'late' ? 'bg-yellow-100 text-yellow-600' :
                                                        'bg-red-100 text-red-600'
                                                    }`}>
                                                    <i className={`fas ${record.status === 'present' ? 'fa-check' : record.status === 'late' ? 'fa-clock' : 'fa-times'}`}></i>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-800">{new Date(record.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                                    <p className="text-xs text-gray-500 capitalize">{record.status}</p>
                                                </div>
                                            </div>
                                            <span className={`text-xs font-black uppercase px-2 py-1 rounded ${record.status === 'present' ? 'text-green-600' : record.status === 'late' ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {record.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentProfile;
