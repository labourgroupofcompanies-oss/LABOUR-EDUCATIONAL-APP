import React, { useState } from 'react';
import ResultsApproval from './ResultsApproval';
import ReportCardGenerator from '../ReportCards/ReportCardGenerator';

type SubView = 'approval' | 'reportcards';

const tabs: { key: SubView; label: string; icon: string }[] = [
    { key: 'approval', label: 'Results Approval', icon: 'fa-check-double' },
    { key: 'reportcards', label: 'Report Cards', icon: 'fa-id-card' },
];

interface Props {
    initialSelection?: { studentId?: string; classId?: string } | null;
}

const ResultsManagement: React.FC<Props> = ({ initialSelection }) => {
    const [view, setView] = useState<SubView>(initialSelection ? 'reportcards' : 'approval');

    return (
        <div className="space-y-5 animate-fadeIn">
            {/* Sub-tab Bar */}
            <div className="flex gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-100">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setView(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${view === tab.key ? 'bg-white shadow-sm text-blue-700 border border-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <i className={`fas ${tab.icon} text-sm`} />
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.key === 'approval' ? 'Approval' : 'Reports'}</span>
                    </button>
                ))}
            </div>

            {view === 'approval' && <ResultsApproval />}
            {view === 'reportcards' && (
                <ReportCardGenerator 
                    initialClassId={initialSelection?.classId} 
                    initialStudentId={initialSelection?.studentId} 
                />
            )}
        </div>
    );
};

export default ResultsManagement;
