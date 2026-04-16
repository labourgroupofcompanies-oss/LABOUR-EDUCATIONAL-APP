import React, { useEffect, useState } from 'react';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: ConfirmVariant;
}

interface ConfirmState extends ConfirmOptions {
    id: number;
    resolve: (value: boolean) => void;
}

// ─── Global dispatcher ───────────────────────────────────────────────────────
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
        window.dispatchEvent(
            new CustomEvent('confirm-dialog', {
                detail: { ...options, resolve, id: Date.now() },
            })
        );
    });
}

// ─── Single dialog UI ────────────────────────────────────────────────────────
const DialogModal: React.FC<{ state: ConfirmState; onClose: () => void }> = ({ state, onClose }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
    }, []);

    const dismiss = (result: boolean) => {
        setVisible(false);
        setTimeout(() => {
            state.resolve(result);
            onClose();
        }, 250);
    };

    const variants = {
        danger: {
            iconBg: 'bg-red-500',
            iconColor: 'text-white',
            icon: 'fa-triangle-exclamation',
            confirmBg: 'bg-red-600 hover:bg-red-700 shadow-red-200',
            titleColor: 'text-slate-900',
            accent: 'from-red-500 to-rose-600'
        },
        warning: {
            iconBg: 'bg-amber-500',
            iconColor: 'text-white',
            icon: 'fa-circle-exclamation',
            confirmBg: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200',
            titleColor: 'text-slate-900',
            accent: 'from-amber-400 to-orange-500'
        },
        info: {
            iconBg: 'bg-blue-600',
            iconColor: 'text-white',
            icon: 'fa-circle-question',
            confirmBg: 'bg-slate-900 hover:bg-black shadow-slate-200',
            titleColor: 'text-slate-900',
            accent: 'from-blue-600 to-indigo-600'
        },
    };

    const v = variants[state.variant ?? 'info'];

    return (
        /* Backdrop */
        <div
            className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 lg:p-6 transition-all duration-300 ${visible ? 'bg-slate-900/40 backdrop-blur-md' : 'bg-transparent'}`}
            onClick={() => dismiss(false)}
        >
            {/* Card */}
            <div
                className={`w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl shadow-black/20 overflow-hidden transition-all duration-300 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-8'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Accent */}
                <div className={`h-24 lg:h-28 bg-gradient-to-br ${v.accent} relative flex items-center justify-center overflow-hidden`}>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                    <div className={`w-14 h-14 lg:w-16 lg:h-16 ${v.iconBg} rounded-2xl lg:rounded-3xl flex items-center justify-center shadow-xl shadow-black/20 z-10`}>
                        <i className={`fas ${v.icon} ${v.iconColor} text-2xl lg:text-3xl`}></i>
                    </div>
                </div>

                <div className="p-8 lg:p-10 text-center">
                    {/* Title */}
                    <h3 className={`text-xl lg:text-2xl font-black ${v.titleColor} mb-3 tracking-tighter`}>{state.title}</h3>

                    {/* Message */}
                    <p className="text-slate-500 text-sm lg:text-base leading-relaxed font-medium">{state.message}</p>
                </div>

                {/* Action Buttons */}
                <div className="px-8 lg:px-10 pb-8 lg:pb-10 flex flex-col gap-3">
                    <button
                        onClick={() => dismiss(true)}
                        className={`w-full py-4 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg transition-all active:scale-95 ${v.confirmBg}`}
                    >
                        {state.confirmText ?? 'Confirm Action'}
                    </button>
                    <button
                        onClick={() => dismiss(false)}
                        className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                    >
                        {state.cancelText ?? 'Cancel'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Container (mount once in App.tsx) ───────────────────────────────────────
export const ConfirmDialogContainer: React.FC = () => {
    const [dialogs, setDialogs] = useState<ConfirmState[]>([]);

    useEffect(() => {
        const handler = (e: any) => {
            setDialogs(prev => [...prev, e.detail as ConfirmState]);
        };
        window.addEventListener('confirm-dialog', handler);
        return () => window.removeEventListener('confirm-dialog', handler);
    }, []);

    return (
        <>
            {dialogs.map(dialog => (
                <DialogModal
                    key={dialog.id}
                    state={dialog}
                    onClose={() => setDialogs(prev => prev.filter(d => d.id !== dialog.id))}
                />
            ))}
        </>
    );
};
