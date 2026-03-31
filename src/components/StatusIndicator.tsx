import React, { useState, useEffect } from 'react';

export const StatusIndicator: React.FC = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg transition-all transform ${isOnline ? 'bg-green-500' : 'bg-red-500 animate-pulse'
            }`}>
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full bg-white ${!isOnline && 'animate-ping'}`} />
                {isOnline ? 'Online' : 'Offline Mode'}
            </div>
        </div>
    );
};
