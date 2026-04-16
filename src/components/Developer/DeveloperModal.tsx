import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface DeveloperModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    icon?: string;
    iconBg?: string;
    width?: string; // e.g. 'max-w-2xl'
    children: React.ReactNode;
    footer?: React.ReactNode;
}

const DeveloperModal: React.FC<DeveloperModalProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    icon = 'fa-window-maximize',
    iconBg = 'bg-blue-600',
    width = 'max-w-2xl',
    children,
    footer
}) => {
    const [mounted, setMounted] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setMounted(true);
            // Small delay to trigger animation
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setVisible(true));
            });
            document.body.style.overflow = 'hidden';
        } else {
            setVisible(false);
            const timer = setTimeout(() => {
                setMounted(false);
                document.body.style.overflow = 'auto';
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!mounted) return null;

    return createPortal(
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8 transition-all duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
            {/* Backdrop */}
            <div 
                className={`absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            {/* Modal Card */}
            <div className={`relative w-full ${width} bg-white rounded-[2rem] lg:rounded-[3rem] shadow-2xl shadow-slate-900/20 flex flex-col max-h-[90vh] overflow-hidden transition-all duration-300 transform ${visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-8'}`}>
                
                {/* Header */}
                <div className="shrink-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 lg:p-10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                    
                    <div className="relative z-10 flex items-start justify-between gap-6">
                        <div className="flex items-center gap-4 lg:gap-6">
                            <div className={`w-12 h-12 lg:w-16 lg:h-16 ${iconBg} rounded-2xl lg:rounded-3xl flex items-center justify-center shadow-lg shadow-black/20 shrink-0 group-hover:scale-110 transition-transform`}>
                                <i className={`fas ${icon} text-lg lg:text-2xl`}></i>
                            </div>
                            <div>
                                <h3 className="text-xl lg:text-3xl font-black tracking-tighter leading-tight">{title}</h3>
                                {subtitle && (
                                    <p className="text-slate-400 text-[10px] lg:text-xs font-black uppercase tracking-[0.2em] mt-1 lg:mt-2 opacity-80">{subtitle}</p>
                                )}
                            </div>
                        </div>
                        <button 
                            onClick={onClose}
                            className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all shrink-0 group active:scale-95"
                        >
                            <i className="fas fa-times text-sm lg:text-base group-hover:rotate-90 transition-transform"></i>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
                    {children}
                </div>

                {/* Footer */}
                {footer ? (
                    <div className="shrink-0 p-6 lg:p-10 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-3 lg:gap-4">
                        {footer}
                    </div>
                ) : (
                    <div className="shrink-0 py-4 px-10 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Administrative View Only</p>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default DeveloperModal;
