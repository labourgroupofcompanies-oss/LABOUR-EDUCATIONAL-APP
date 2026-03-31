import React, { useEffect, useState } from 'react';

export type PromotionDialogVariant = 'success' | 'warning' | 'error' | 'promote' | 'repeat' | 'reject';

interface PromotionDialogOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: PromotionDialogVariant;
    showInput?: boolean;
    inputPlaceholder?: string;
    studentName?: string;
}

interface PromotionDialogState extends PromotionDialogOptions {
    id: number;
    resolve: (value: { confirmed: boolean; reason?: string }) => void;
}

// ─── Global dispatcher ───────────────────────────────────────────────────────
export function showPromotionDialog(options: PromotionDialogOptions): Promise<{ confirmed: boolean; reason?: string }> {
    return new Promise((resolve) => {
        window.dispatchEvent(
            new CustomEvent('promotion-dialog', {
                detail: { ...options, resolve, id: Date.now() },
            })
        );
    });
}

// ─── Single dialog UI ────────────────────────────────────────────────────────
const DialogModal: React.FC<{ state: PromotionDialogState; onClose: () => void }> = ({ state, onClose }) => {
    const [visible, setVisible] = useState(false);
    const [reason, setReason] = useState('');

    useEffect(() => {
        const timer = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(timer);
    }, []);

    const dismiss = (confirmed: boolean) => {
        setVisible(false);
        setTimeout(() => {
            state.resolve({ confirmed, reason: state.showInput ? reason : undefined });
            onClose();
        }, 250);
    };

    const variants: Record<PromotionDialogVariant, any> = {
        success: {
            iconBg: 'bg-emerald-100',
            iconColor: 'text-emerald-600',
            icon: 'fa-check-circle',
            confirmBg: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
            titleColor: 'text-emerald-900',
        },
        warning: {
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            icon: 'fa-exclamation-triangle',
            confirmBg: 'bg-amber-500 hover:bg-amber-600 shadow-amber-200',
            titleColor: 'text-amber-900',
        },
        error: {
            iconBg: 'bg-rose-100',
            iconColor: 'text-rose-600',
            icon: 'fa-times-circle',
            confirmBg: 'bg-rose-600 hover:bg-rose-700 shadow-rose-200',
            titleColor: 'text-rose-900',
        },
        promote: {
            iconBg: 'bg-indigo-100',
            iconColor: 'text-indigo-600',
            icon: 'fa-level-up-alt',
            confirmBg: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200',
            titleColor: 'text-indigo-900',
        },
        repeat: {
            iconBg: 'bg-purple-100',
            iconColor: 'text-purple-600',
            icon: 'fa-redo-alt',
            confirmBg: 'bg-purple-600 hover:bg-purple-700 shadow-purple-200',
            titleColor: 'text-purple-900',
        },
        reject: {
            iconBg: 'bg-orange-100',
            iconColor: 'text-orange-600',
            icon: 'fa-ban',
            confirmBg: 'bg-orange-600 hover:bg-orange-700 shadow-orange-200',
            titleColor: 'text-orange-900',
        },
    };

    const v = variants[state.variant ?? 'promote'];

    return (
        <div
            className={`fixed inset-0 z-[100000] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-slate-900/60 backdrop-blur-md' : 'bg-transparent'}`}
            onClick={() => dismiss(false)}
        >
            <div
                className={`w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden transition-all duration-300 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-8'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Visual Header */}
                <div className={`h-24 w-full relative flex items-center justify-center ${v.iconBg.replace('100', '50')}`}>
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-current via-transparent to-transparent"></div>
                    <div className={`w-16 h-16 ${v.iconBg} rounded-2xl flex items-center justify-center shadow-lg transform rotate-3`}>
                        <i className={`fas ${v.icon} ${v.iconColor} text-2xl`}></i>
                    </div>
                </div>

                <div className="p-8 pt-6">
                    <div className="text-center mb-6">
                        <h3 className={`text-2xl font-black ${v.titleColor} mb-2 tracking-tight leading-tight`}>{state.title}</h3>
                        <p className="text-slate-500 text-sm font-medium leading-relaxed">{state.message}</p>
                    </div>

                    {state.showInput && (
                        <div className="mb-6 animate-fadeIn">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                                {state.inputPlaceholder || 'Additional Note'}
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                autoFocus
                                className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 focus:bg-white rounded-2xl text-sm font-bold text-slate-700 transition-all outline-none resize-none"
                                placeholder="Enter reason here..."
                            />
                        </div>
                    )}

                    {state.studentName && (
                        <div className="bg-slate-50 rounded-2xl p-4 mb-6 flex items-center gap-4 border border-slate-100">
                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-600 font-black text-sm shadow-sm">
                                {state.studentName.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Learner</p>
                                <p className="text-sm font-bold text-slate-800">{state.studentName}</p>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={() => dismiss(false)}
                            className="flex-1 order-2 sm:order-1 py-4 bg-slate-100 text-slate-600 rounded-[1.25rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                        >
                            {state.cancelText ?? 'Cancel'}
                        </button>
                        <button
                            onClick={() => dismiss(true)}
                            className={`flex-[1.5] order-1 sm:order-2 py-4 text-white rounded-[1.25rem] font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${v.confirmBg}`}
                        >
                            <i className={`fas ${v.icon} text-sm opacity-50`}></i>
                            {state.confirmText ?? 'Proceed'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Container ───────────────────────────────────────────────────────────────
export const PromotionDialogContainer: React.FC = () => {
    const [dialogs, setDialogs] = useState<PromotionDialogState[]>([]);

    useEffect(() => {
        const handler = (e: any) => {
            setDialogs(prev => [...prev, e.detail as PromotionDialogState]);
        };
        window.addEventListener('promotion-dialog', handler);
        return () => window.removeEventListener('promotion-dialog', handler);
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
