
import React, { useState } from 'react';
import SubjectList from './SubjectList';
import SubjectAllocation from './SubjectAllocation';

const SubjectManagement: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'subjects' | 'allocation'>('subjects');

    return (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-gray-100">
                <button
                    onClick={() => setActiveTab('subjects')}
                    className={`flex-1 py-4 font-bold text-sm transition-all ${activeTab === 'subjects' ? 'text-primary border-b-2 border-primary bg-blue-50/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                >
                    <i className="fas fa-book mr-2"></i> Manage Subjects
                </button>
                <button
                    onClick={() => setActiveTab('allocation')}
                    className={`flex-1 py-4 font-bold text-sm transition-all ${activeTab === 'allocation' ? 'text-primary border-b-2 border-primary bg-blue-50/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
                >
                    <i className="fas fa-chalkboard-teacher mr-2"></i> Subject Allocation
                </button>
            </div>

            <div className="p-8">
                {activeTab === 'subjects' && <SubjectList />}
                {activeTab === 'allocation' && <SubjectAllocation />}
            </div>
        </div>
    );
};

export default SubjectManagement;
