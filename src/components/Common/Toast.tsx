import React, { useEffect, useState, useRef } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    message: string;
    type: ToastType;
    duration?: number;
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, duration = 5000, onClose }) => {
    const [visible, setVisible] = useState(false);
    const [progress, setProgress] = useState(100);
    const startTime = useRef(Date.now());
    const animFrame = useRef<number | undefined>(undefined);

    // Slide in on mount
    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
    }, []);

    // Shrinking progress bar + auto-close
    useEffect(() => {
        const tick = () => {
            const elapsed = Date.now() - startTime.current;
            const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
            setProgress(remaining);
            if (remaining > 0) {
                animFrame.current = requestAnimationFrame(tick);
            } else {
                setVisible(false);
                setTimeout(onClose, 350);
            }
        };
        animFrame.current = requestAnimationFrame(tick);
        return () => { if (animFrame.current) cancelAnimationFrame(animFrame.current); };
    }, [duration, onClose]);

    const dismiss = () => {
        if (animFrame.current) cancelAnimationFrame(animFrame.current);
        setVisible(false);
        setTimeout(onClose, 350);
    };

    const config = {
        success: {
            icon: 'fa-circle-check',
            bar: 'bg-emerald-400',
            bg: 'bg-white',
            iconBg: 'bg-emerald-50',
            iconColor: 'text-emerald-500',
            title: 'Success',
            titleColor: 'text-emerald-600',
        },
        error: {
            icon: 'fa-circle-xmark',
            bar: 'bg-red-400',
            bg: 'bg-white',
            iconBg: 'bg-red-50',
            iconColor: 'text-red-500',
            title: 'Error',
            titleColor: 'text-red-600',
        },
        info: {
            icon: 'fa-circle-info',
            bar: 'bg-blue-400',
            bg: 'bg-white',
            iconBg: 'bg-blue-50',
            iconColor: 'text-blue-500',
            title: 'Info',
            titleColor: 'text-blue-600',
        },
        warning: {
            icon: 'fa-triangle-exclamation',
            bar: 'bg-amber-400',
            bg: 'bg-white',
            iconBg: 'bg-amber-50',
            iconColor: 'text-amber-500',
            title: 'Warning',
            titleColor: 'text-amber-600',
        },
    };

    const c = config[type];

    return (
        <div
            className={`relative flex items-start gap-3 w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden px-4 py-3.5 transition-all duration-350
                ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
        >
            {/* Left icon */}
            <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${c.iconBg} flex items-center justify-center`}>
                <i className={`fas ${c.icon} ${c.iconColor} text-lg`}></i>
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0 pt-0.5">
                <p className={`text-xs font-black uppercase tracking-widest ${c.titleColor}`}>{c.title}</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5 leading-snug">{message}</p>
            </div>

            {/* Close button */}
            <button
                onClick={dismiss}
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors mt-0.5"
            >
                <i className="fas fa-xmark text-xs"></i>
            </button>

            {/* Progress bar at bottom */}
            <div className="absolute bottom-0 left-0 h-1 bg-gray-100 w-full">
                <div
                    className={`h-full ${c.bar} transition-none rounded-full`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
};

export const ToastContainer: React.FC = () => {
    const [toasts, setToasts] = useState<{ id: number; message: string; type: ToastType }[]>([]);

    useEffect(() => {
        const handleToast = (e: any) => {
            setToasts(prev => [...prev, { id: Date.now(), ...e.detail }]);
        };
        window.addEventListener('toast', handleToast);
        return () => window.removeEventListener('toast', handleToast);
    }, []);

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
            {toasts.map(toast => (
                <div key={toast.id} className="pointer-events-auto w-full max-w-sm">
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                    />
                </div>
            ))}
        </div>
    );
};

export const showToast = (message: string, type: ToastType = 'info') => {
    window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
};
