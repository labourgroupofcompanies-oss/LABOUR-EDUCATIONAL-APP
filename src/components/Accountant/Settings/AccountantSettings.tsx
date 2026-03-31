import React, { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { db } from '../../../db';
import { showToast } from '../../Common/Toast';
import { hashPassword } from '../../../utils/auth';
import { supabase } from '../../../supabaseClient';
import { useLiveQuery } from 'dexie-react-hooks';

const AccountantSettings: React.FC = () => {
    const { user } = useAuth();
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [saving, setSaving] = useState(false);

    const schoolData = useLiveQuery(async () => {
        if (user?.schoolId) {
            return await db.schools
                .where('schoolId').equals(user.schoolId)
                .or('idCloud').equals(user.schoolId)
                .first();
        }
        return null;
    }, [user?.schoolId]);

    const handleChangePassword = async () => {
        if (!user?.id) return;
        if (!currentPw || !newPw || !confirmPw) { showToast('Fill in all fields', 'error'); return; }
        if (newPw !== confirmPw) { showToast('New passwords do not match', 'error'); return; }
        if (newPw.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

        setSaving(true);
        try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData.session?.user?.email) {
                showToast('Session expired. Please log in again.', 'error');
                return;
            }

            // Verify current password via Supabase
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: sessionData.session.user.email,
                password: currentPw
            });

            if (signInError) {
                showToast('Current password is incorrect', 'error');
                return;
            }

            // 1. Update Supabase Auth first
            const { error: authError } = await supabase.auth.updateUser({
                password: newPw
            });

            if (authError) {
                console.error('Supabase Password Update Error:', authError.message);
                showToast(`Cloud update failed: ${authError.message}`, 'error');
                return;
            }

            // 2. Update local Dexie DB (optional)
            const dbUser = await db.users.where('idCloud').equals(user.id).first();
            if (dbUser) {
                const hashedNew = await hashPassword(newPw);
                await db.users.update(dbUser.id!, { password: hashedNew });
            }
            showToast('Password changed successfully', 'success');
            setCurrentPw(''); setNewPw(''); setConfirmPw('');
        } catch (err) {
            console.error('Password Change Error:', err);
            showToast('Failed to change password', 'error');
        }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-8 md:space-y-12 animate-fadeIn max-w-2xl pb-12">
            <div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight mb-1">Settings</h2>
                <p className="text-slate-400 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                    Manage your account preferences
                </p>
            </div>

            {/* Profile */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 md:p-10 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-bl-full -mr-8 -mt-8 opacity-50 pointer-events-none"></div>
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center text-xl shadow-sm">
                        <i className="fas fa-user-circle"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-slate-800 text-lg">Account Info</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personal Details</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 relative z-10">
                    {[
                        { label: 'Full Name', val: user?.fullName || user?.username, icon: 'fa-id-card' },
                        { label: 'Username', val: user?.username, icon: 'fa-at' },
                        { label: 'Role', val: user?.role, icon: 'fa-user-tag' },
                        { label: 'School ID', val: schoolData?.schoolCode || user?.schoolId, icon: 'fa-school' },
                    ].map(({ label, val, icon }) => (
                        <div key={label} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:bg-white hover:shadow-lg transition-all group">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-1.5">
                                <i className={`fas ${icon} text-slate-300 group-hover:text-purple-400 transition-colors`}></i>
                                {label}
                            </p>
                            <p className="font-black text-slate-800 text-sm tracking-tight">{val}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Change Password */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 md:p-10 space-y-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-bl-full -mr-8 -mt-8 opacity-50 pointer-events-none"></div>
                <div className="relative z-10 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl shadow-sm">
                        <i className="fas fa-key"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-slate-800 text-lg">Security & Access</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Change Password</p>
                    </div>
                </div>

                <div className="space-y-5 relative z-10">
                    {[
                        { label: 'Current Password', val: currentPw, set: setCurrentPw },
                        { label: 'New Password', val: newPw, set: setNewPw },
                        { label: 'Confirm New Password', val: confirmPw, set: setConfirmPw },
                    ].map(({ label, val, set }) => (
                        <div key={label}>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{label}</label>
                            <input
                                type="password"
                                value={val}
                                onChange={e => set(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-700 focus:bg-white focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none transition-all placeholder:text-slate-300"
                            />
                        </div>
                    ))}
                    
                    <div className="flex justify-end pt-4 border-t border-slate-50">
                        <button
                            onClick={handleChangePassword}
                            disabled={saving}
                            className="bg-amber-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-amber-200 flex items-center justify-center gap-3 w-full sm:w-auto"
                        >
                            {saving ? <><i className="fas fa-spinner fa-spin"></i> Saving...</> : <><i className="fas fa-lock"></i> Update Password</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountantSettings;
