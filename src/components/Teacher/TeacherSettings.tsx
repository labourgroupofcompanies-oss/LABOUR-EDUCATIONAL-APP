import React, { useState } from 'react';
import { db } from '../../db';
import { useAuth } from '../../hooks/useAuth';
import { hashPassword } from '../../utils/auth';
import { supabase } from '../../supabaseClient';

const TeacherSettings: React.FC = () => {
    const { user } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (!user?.id) return;

        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        if (newPassword.length < 4) {
            setMessage({ type: 'error', text: 'Password must be at least 4 characters' });
            return;
        }

        setIsUpdating(true);
        try {
            // Verify current password via Supabase Auth
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData.session?.user?.email) {
                setMessage({ type: 'error', text: 'Session expired. Please log in again.' });
                setIsUpdating(false);
                return;
            }

            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: sessionData.session.user.email,
                password: currentPassword
            });

            if (signInError) {
                setMessage({ type: 'error', text: 'Incorrect current password' });
                setIsUpdating(false);
                return;
            }

            // 1. Update Supabase Auth first
            const { error: authError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (authError) {
                console.error('Supabase Password Update Error:', authError.message);
                setMessage({ type: 'error', text: `Cloud update failed: ${authError.message}` });
                setIsUpdating(false);
                return;
            }

            // 2. Hash and Update New Password locally (optional)
            try {
                const dbUser = await db.users.get(user.id as any as number);
                if (dbUser) {
                    const hashedNew = await hashPassword(newPassword);
                    await db.users.update(dbUser.id!, { password: hashedNew });
                }
            } catch (localErr) {
                console.warn('Local db update skipped:', localErr);
            }

            setMessage({ type: 'success', text: 'Password updated successfully!' });

            // Clear fields
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');

        } catch (error) {
            console.error(error);
            setMessage({ type: 'error', text: 'Failed to update password.' });
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="max-w-xl mx-auto px-2 md:px-0 animate-fadeIn">
            <h2 className="text-2xl md:text-3xl font-black text-gray-800 mb-6 tracking-tight">Account Settings</h2>

            <div className="bg-white p-5 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border border-gray-100 shadow-sm">
                <h3 className="text-sm md:text-lg font-black text-gray-500 uppercase tracking-widest mb-6 border-b border-gray-50 pb-4">Security: Change Password</h3>

                {message && (
                    <div className={`p-4 rounded-xl mb-4 flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-1">Current Password</label>
                        <input
                            type="password"
                            required
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-1">New Password</label>
                        <input
                            type="password"
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-600 mb-1">Confirm New Password</label>
                        <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isUpdating}
                        className={`btn-primary !from-indigo-600 !to-indigo-700 w-full py-4 md:py-3 !text-sm ${isUpdating ? '!from-gray-100 !to-gray-100 !text-gray-400 !shadow-none !cursor-not-allowed' : ''}`}
                    >
                        {isUpdating ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-key"></i>}
                        {isUpdating ? ' Executing Update...' : ' Commit New Password'}
                    </button>
                </form>

                <div className="mt-8 pt-4 border-t border-gray-100 text-center">
                    <p className="text-gray-400 text-sm">Need Help? Contact your Headteacher.</p>
                </div>
            </div>
        </div>
    );
};

export default TeacherSettings;
