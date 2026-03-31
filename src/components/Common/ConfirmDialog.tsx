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
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            icon: 'fa-triangle-exclamation',
            confirmBg: 'bg-red-600 hover:bg-red-700 shadow-red-200',
            titleColor: 'text-red-700',
        },
        warning: {
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            icon: 'fa-circle-exclamation',
            confirmBg: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200',
            titleColor: 'text-amber-700',
        },
        info: {
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            icon: 'fa-circle-question',
            confirmBg: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
            titleColor: 'text-blue-700',
        },
    };

    const v = variants[state.variant ?? 'info'];

    return (
        /* Backdrop */
        <div
            className={`fixed inset-0 z-[99999] flex items-center justify-center p-4 transition-all duration-250 ${visible ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent'}`}
            onClick={() => dismiss(false)}
        >
            {/* Card */}
            <div
                className={`w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden transition-all duration-250 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-4'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Top accent strip */}
                <div className={`h-1.5 w-full ${state.variant === 'danger' ? 'bg-gradient-to-r from-red-500 to-rose-500' :
                        state.variant === 'warning' ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
                            'bg-gradient-to-r from-blue-500 to-indigo-500'
                    }`} />

                <div className="p-8 text-center">
                    {/* Icon */}
                    <div className={`w-16 h-16 ${v.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-5`}>
                        <i className={`fas ${v.icon} ${v.iconColor} text-2xl`}></i>
                    </div>

                    {/* Title */}
                    <h3 className={`text-xl font-black ${v.titleColor} mb-2 tracking-tight`}>{state.title}</h3>

                    {/* Message */}
                    <p className="text-gray-500 text-sm leading-relaxed font-medium">{state.message}</p>
                </div>

                {/* Action Buttons */}
                <div className="px-6 pb-6 flex gap-3">
                    <button
                        onClick={() => dismiss(false)}
                        className="flex-1 py-3.5 bg-gray-100 text-gray-600 rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-gray-200 transition-all active:scale-95"
                    >
                        {state.cancelText ?? 'Cancel'}
                    </button>
                    <button
                        onClick={() => dismiss(true)}
                        className={`flex-[1.5] py-3.5 text-white rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg transition-all active:scale-95 ${v.confirmBg}`}
                    >
                        {state.confirmText ?? 'Confirm'}
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
