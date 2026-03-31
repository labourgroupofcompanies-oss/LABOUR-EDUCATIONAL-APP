import React from 'react';

interface SyncStatusBadgeProps {
    status: 'pending' | 'synced';
    showLabel?: boolean;
}

const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ status, showLabel = true }) => {
    const isPending = status === 'pending';

    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all ${isPending
                ? 'bg-amber-50 text-amber-600 border border-amber-100'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isPending ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                }`} />
            {showLabel && (
                <span className="text-[10px] font-black uppercase tracking-wider">
                    {isPending ? 'Pending' : 'Synced'}
                </span>
            )}
        </div>
    );
};

export default SyncStatusBadge;
