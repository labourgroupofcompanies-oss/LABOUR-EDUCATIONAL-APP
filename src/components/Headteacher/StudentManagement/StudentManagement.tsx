
import React, { useState } from 'react';
import StudentList from './StudentList';
import AddStudentForm from './AddStudentForm';
import StudentProfile from './StudentProfile';

const StudentManagement: React.FC = () => {
    const [view, setView] = useState<'list' | 'add' | 'profile'>('list');
    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

    const handleViewProfile = (id: number) => {
        setSelectedStudentId(id);
        setView('profile');
    };

    const handleEditStudent = (id: number) => {
        setSelectedStudentId(id);
        setView('add'); // Re-use add form for editing
    };

    return (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-8 min-h-[600px]">
            {view === 'list' && (
                <div className="animate-fadeIn">
                    <StudentList
                        onAdd={() => { setSelectedStudentId(null); setView('add'); }}
                        onView={handleViewProfile}
                    />
                </div>
            )}

            {view === 'add' && (
                <div className="animate-fadeIn">
                    <AddStudentForm
                        studentId={selectedStudentId}
                        onCancel={() => setView('list')}
                        onSave={() => setView('list')}
                    />
                </div>
            )}

            {view === 'profile' && selectedStudentId && (
                <div className="animate-fadeIn">
                    <StudentProfile
                        studentId={selectedStudentId}
                        onBack={() => setView('list')}
                        onEdit={() => handleEditStudent(selectedStudentId)}
                    />
                </div>
            )}
        </div>
    );
};

export default StudentManagement;
