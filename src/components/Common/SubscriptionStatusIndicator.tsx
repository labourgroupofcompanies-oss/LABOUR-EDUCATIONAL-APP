import React from 'react';

interface SubscriptionStatusIndicatorProps {
    isSubscribed: boolean;
    isLoading?: boolean;
    className?: string;
}

/**
 * A premium "Two Light" LED indicator for subscription status.
 * Green LED glows when active/trial. Red LED glows when expired/none.
 */
const SubscriptionStatusIndicator: React.FC<SubscriptionStatusIndicatorProps> = ({ 
    isSubscribed, 
    isLoading = false,
    className = "" 
}) => {
    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 bg-black/20 backdrop-blur-md rounded-full border border-white/10 shadow-inner flex-shrink-0 ${className}`}>
            {/* Green LED (Active) */}
            <div className="relative flex items-center justify-center">
                {isLoading && (
                    <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping scale-150 blur-sm"></div>
                )}
                <div 
                    className={`w-3 h-3 rounded-full transition-all duration-700 ${
                        isSubscribed 
                            ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,1),0_0_24px_rgba(34,197,94,0.6)] animate-pulse' 
                            : 'bg-green-950/40 opacity-20'
                    }`}
                />
            </div>

            {/* Separator / Panel Line */}
            <div className="w-[1px] h-4 bg-white/10 mx-0.5"></div>

            {/* Red LED (Inactive) */}
            <div className="relative flex items-center justify-center">
                {isLoading && (
                    <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping scale-150 blur-sm"></div>
                )}
                <div 
                    className={`w-3 h-3 rounded-full transition-all duration-700 ${
                        !isSubscribed && !isLoading
                            ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1),0_0_24px_rgba(239,68,68,0.6)] animate-pulse' 
                            : 'bg-red-950/40 opacity-20'
                    }`}
                />
            </div>
        </div>
    );
};

export default SubscriptionStatusIndicator;
