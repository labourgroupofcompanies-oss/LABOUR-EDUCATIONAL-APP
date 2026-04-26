import React from 'react';

interface SyncStatusBadgeProps {
    status: 'pending' | 'synced' | 'failed';
    showLabel?: boolean;
}

const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ status, showLabel = true }) => {
    const isPending = status === 'pending';
    const isFailed = status === 'failed';

    const getColors = () => {
        if (isFailed) return 'bg-rose-50 text-rose-600 border-rose-100';
        if (isPending) return 'bg-amber-50 text-amber-600 border-amber-100';
        return 'bg-emerald-50 text-emerald-600 border-emerald-100';
    };

    const getDotColor = () => {
        if (isFailed) return 'bg-rose-500';
        if (isPending) return 'bg-amber-500 animate-pulse';
        return 'bg-emerald-500';
    };

    const getLabel = () => {
        if (isFailed) return 'Failed';
        if (isPending) return 'Pending';
        return 'Synced';
    };

    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-all ${getColors()}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${getDotColor()}`} />
            {showLabel && (
                <span className="text-[10px] font-black uppercase tracking-wider">
                    {getLabel()}
                </span>
            )}
        </div>
    );
};

export default SyncStatusBadge;
