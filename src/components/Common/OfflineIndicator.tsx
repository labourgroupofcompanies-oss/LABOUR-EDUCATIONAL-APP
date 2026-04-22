import React, { useState, useEffect } from 'react';

const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { transform: translate(-50%, 100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        .offline-indicator {
          position: fixed;
          left: 50%;
          bottom: 80px; /* default: above mobile bottom nav (~65px) */
          transform: translateX(-50%);
          background-color: #1e293b;
          color: white;
          padding: 10px 20px;
          border-radius: 50px;
          z-index: 9999;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 600;
          border: 1px solid #334155;
          animation: slideUp 0.3s ease-out;
          white-space: nowrap;
        }
        @media (min-width: 768px) {
          /* On tablet/desktop there is no bottom nav bar */
          .offline-indicator {
            bottom: 20px;
          }
        }
      `}</style>
      <div className="offline-indicator">
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#f59e0b',
            boxShadow: '0 0 8px #f59e0b',
            flexShrink: 0,
          }}
        />
        Working Offline
      </div>
    </>
  );
};

export default OfflineIndicator;
