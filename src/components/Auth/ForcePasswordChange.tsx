import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { showToast } from '../Common/Toast';

const ForcePasswordChange: React.FC = () => {
    const { user, logout, refreshProfile } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsRetrySync, setNeedsRetrySync] = useState(false);

    const handleSignOut = async () => {
        await logout();
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        // 1. Validation
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters long.');
            setIsLoading(false);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            setIsLoading(false);
            return;
        }

        try {
            // 2. Re-authenticate to ensure user knows current password
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user?.username + '@school.local', // The app uses dummy emails for staff login
                password: currentPassword
            });

            if (authError) {
                throw new Error('Incorrect current password. Please try again.');
            }

            // 3. Update Supabase Auth Password
            const { error: updateAuthError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (updateAuthError) {
                throw new Error(`Failed to update cloud password: ${updateAuthError.message}`);
            }

            // 4. Update Profile Flag (Critical Step)
            await syncProfileFlag();

        } catch (err: any) {
            setError(err.message);
            setIsLoading(false);
        }
    };

    const syncProfileFlag = async () => {
        setError(null);
        setIsLoading(true);
        try {
            const { error: profileError } = await supabase
                .from('staff_profiles')
                .update({ 
                    must_change_password: false,
                    password_changed_at: new Date().toISOString()
                })
                .eq('id', user?.id);

            if (profileError) {
                setNeedsRetrySync(true);
                throw new Error('Password updated, but system could not unlock your account. Please click "Retry Profile Sync".');
            }

            // 5. Success Feedback
            showToast('Password updated successfully! Unlocking your dashboard...', 'success');

            // 6. Final State Refresh
            await refreshProfile();
            setNeedsRetrySync(false);
            
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md animate-fadeIn">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl mb-4">
                        <i className="fas fa-shield-halved text-primary text-2xl"></i>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 mb-2">Secure Your Account</h1>
                    <p className="text-gray-500 font-medium">Your account was created with a temporary password. You must set a permanent one before continuing.</p>
                </div>

                <div className="bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 p-8 md:p-10 relative overflow-hidden">
                    {/* Error Display */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 text-sm font-bold animate-shake">
                            <i className="fas fa-circle-exclamation mt-0.5"></i>
                            <p>{error}</p>
                        </div>
                    )}

                    {needsRetrySync ? (
                        <div className="space-y-6">
                            <div className="text-center">
                                <i className="fas fa-cloud-arrow-up text-4xl text-blue-500 mb-4 animate-bounce"></i>
                                <h3 className="text-lg font-bold text-gray-800">Password Update Successful</h3>
                                <p className="text-sm text-gray-500 mt-2">Your password is updated, but we need to sync this with your profile to unlock the dashboard.</p>
                            </div>
                            <button
                                onClick={syncProfileFlag}
                                disabled={isLoading}
                                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                            >
                                {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <i className="fas fa-sync"></i>}
                                Retry Profile Sync
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleUpdatePassword} className="space-y-5">
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Current Password</label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold focus:border-primary focus:bg-white bg-gray-50 outline-none transition-all"
                                    required
                                />
                            </div>

                            <div className="pt-2 border-t border-gray-50">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">New Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Min. 8 characters"
                                    className="w-full border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold focus:border-primary focus:bg-white bg-gray-50 outline-none transition-all"
                                    required
                                    minLength={8}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Confirm New Password</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Match your new password"
                                    className="w-full border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold focus:border-primary focus:bg-white bg-gray-50 outline-none transition-all"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:shadow-xl hover:shadow-primary/30 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50 mt-4"
                            >
                                {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <i className="fas fa-check-circle"></i>}
                                Confirm Password Change
                            </button>
                        </form>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="mt-8 text-center">
                    <button
                        onClick={handleSignOut}
                        className="text-gray-400 hover:text-red-500 font-bold transition-colors flex items-center gap-2 mx-auto"
                    >
                        <i className="fas fa-power-off"></i>
                        Cancel and Sign Out
                    </button>
                    <p className="text-[10px] text-gray-300 font-medium uppercase tracking-widest mt-6">
                        Labour-App Security Protocol
                    </p>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
                .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
                .animate-shake { animation: shake 0.2s ease-in-out infinite; animation-iteration-count: 2; }
            `}</style>
        </div>
    );
};

export default ForcePasswordChange;
