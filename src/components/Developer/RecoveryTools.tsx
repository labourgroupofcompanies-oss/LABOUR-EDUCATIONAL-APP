import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { getSupabaseEmail } from '../../utils/auth';

const RecoveryTools: React.FC = () => {
    const [searchSchoolId, setSearchSchoolId] = useState('');
    const [foundUsers, setFoundUsers] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [newPass, setNewPass] = useState('');
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [copied, setCopied] = useState(false);
    const [searchError, setSearchError] = useState('');

    const findAccounts = async () => {
        if (!searchSchoolId) return;
        setSearching(true);
        setSearchError('');
        try {
            const { data, error } = await supabase
                .from('staff_profiles')
                .select('*')
                .eq('school_id', searchSchoolId.toUpperCase());

            if (error) throw error;
            setFoundUsers(data || []);
            if (data?.length === 0) {
                setSearchError('No accounts found for that School ID.');
            }
        } catch (err) {
            console.error('Account search failed:', err);
            setSearchError('Failed to search accounts. Please try again.');
        } finally {
            setSearching(false);
        }
    };

    const handleCopy = async () => {
        if (!selectedUser) return;
        navigator.clipboard.writeText(generateSQL(selectedUser));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);

        // Log administrative action
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('developer_actions').insert([{
                admin_id: user.id,
                action: 'GENERATE_RESET_SQL',
                target_id: selectedUser.id,
                details: { 
                    target_school: selectedUser.school_id, 
                    target_email: selectedUser.email || selectedUser.username 
                }
            }]);
        }
    };

    const generateSQL = (u: any) => {
        const standardizedEmail = (u.email && u.email.includes('@')) ? u.email.toLowerCase() : getSupabaseEmail(u.username, u.school_id);
        const legacyEmail = (u.username + (u.school_id ? `.${u.school_id.toLowerCase().replace(/-/g, '')}` : '') + '@labourapp.com');

        return `-- Advanced Reset for ${u.full_name} (${u.role})
-- This script fixes both the password and the account's internal identity format.
UPDATE auth.users 
SET 
  encrypted_password = crypt('${newPass || 'NEW_PASSWORD'}', gen_salt('bf')),
  email = lower('${standardizedEmail}'), -- Forces standardize lowercase format
  email_confirmed_at = NOW(),
  updated_at = NOW()
WHERE 
  id IN (
    SELECT id FROM auth.users 
    WHERE lower(email) = lower('${standardizedEmail}') 
    OR lower(email) = lower('${legacyEmail}')
    OR lower(email) = lower('${u.username}@labourapp.com')
  );`;
    };

    return (
        <div className="space-y-6 lg:space-y-10 animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
                {/* Account Finder */}
                <div className="bg-white rounded-[2rem] lg:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 lg:p-10 space-y-6 lg:space-y-8">
                    <div>
                        <h4 className="text-lg lg:text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                            <i className="fas fa-user-shield text-blue-500"></i>
                            Account Finder
                        </h4>
                        <p className="text-slate-400 font-medium text-[10px] lg:text-xs mt-1 uppercase tracking-widest">Find active users by School ID</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            placeholder="Enter School ID..."
                            value={searchSchoolId}
                            onChange={(e) => setSearchSchoolId(e.target.value)}
                            className="flex-1 px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all font-bold text-slate-700 shadow-sm text-sm"
                        />
                        <button
                            onClick={findAccounts}
                            disabled={searching || !searchSchoolId}
                            className="w-full sm:w-auto px-8 py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-black transition-all active:scale-95 disabled:opacity-50 text-sm"
                        >
                            {searching ? <i className="fas fa-spinner animate-spin"></i> : 'Search'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        {searchError && (
                            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-[10px] font-bold flex items-center gap-2">
                                <i className="fas fa-exclamation-circle"></i>
                                {searchError}
                            </div>
                        )}

                        {foundUsers.length === 0 ? (
                            <div className="py-10 text-center bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-100">
                                <p className="text-slate-300 font-bold text-xs uppercase tracking-widest italic">No results yet</p>
                            </div>
                        ) : (
                            foundUsers.map((u, i) => (
                                <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 lg:p-5 bg-slate-50 rounded-2xl hover:bg-blue-50 transition-all group">
                                    <div className="min-w-0">
                                        <p className="font-black text-slate-800 text-sm lg:text-base truncate">{u.full_name}</p>
                                        <p className="text-[9px] lg:text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">{u.role} • {u.username}</p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedUser(u)}
                                        className="w-full sm:w-auto h-9 px-4 bg-white border border-slate-200 rounded-xl text-blue-600 font-black text-[10px] uppercase tracking-wider hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm"
                                    >
                                        Select Target
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Command Center for Reset */}
                <div className="bg-slate-900 rounded-[2rem] lg:rounded-[2.5rem] shadow-2xl p-6 lg:p-10 text-white space-y-6 lg:space-y-8">
                    <div>
                        <h4 className="text-lg lg:text-xl font-black tracking-tight flex items-center gap-3">
                            <i className="fas fa-terminal text-green-400"></i>
                            Override Script Forge
                        </h4>
                        <p className="text-slate-500 font-medium text-[10px] lg:text-xs mt-1 uppercase tracking-widest">Generate master reset commands</p>
                    </div>

                    {!selectedUser ? (
                        <div className="flex flex-col items-center justify-center py-16 lg:py-20 text-slate-700">
                            <i className="fas fa-bullseye text-4xl mb-4 opacity-10"></i>
                            <p className="font-bold text-[10px] uppercase tracking-widest">Select target to forge script</p>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="p-5 lg:p-6 bg-slate-800 rounded-2xl lg:rounded-3xl border border-white/5 shadow-inner">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Target Account</p>
                                <p className="font-black text-blue-400 text-sm truncate">{selectedUser.email || selectedUser.username + '@labourapp.com'}</p>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">New Master Password</label>
                                <input
                                    type="text"
                                    placeholder="Enter new password..."
                                    value={newPass}
                                    onChange={(e) => setNewPass(e.target.value)}
                                    className="w-full px-6 py-4 bg-slate-800 border-2 border-slate-700 rounded-2xl focus:border-green-500 focus:outline-none text-white font-bold transition-all text-sm"
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SQL Payload</span>
                                    <button
                                        onClick={handleCopy}
                                        className={`text-[9px] font-black uppercase tracking-widest transition-all ${copied ? 'text-green-400' : 'text-blue-400 hover:text-white'}`}
                                    >
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                                <pre className="p-4 lg:p-5 bg-black rounded-2xl lg:rounded-3xl text-[10px] font-mono text-green-400 overflow-x-auto border border-white/5 shadow-inner">
                                    {generateSQL(selectedUser)}
                                </pre>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => setSelectedUser(null)}
                                    className="w-full sm:flex-1 py-4 bg-slate-800 rounded-2xl font-black text-xs hover:bg-slate-700 transition-all border border-white/5"
                                >
                                    Clear Forge
                                </button>
                                <button
                                    onClick={handleCopy}
                                    className={`w-full sm:flex-1 py-4 rounded-2xl font-black text-xs transition-all shadow-lg ${copied ? 'bg-green-600 text-white shadow-green-600/20' : 'bg-green-500 text-slate-900 hover:bg-green-400 shadow-green-500/20'}`}
                                >
                                    {copied ? 'Payload Copied' : 'Copy Script'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Global Recovery Notice */}
            <div className="bg-amber-50 p-6 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] border border-amber-100 flex flex-col sm:flex-row gap-4 lg:gap-6 items-center shadow-xl shadow-amber-500/5">
                <div className="w-12 h-12 lg:w-16 lg:h-16 bg-amber-500 rounded-2xl lg:rounded-3xl flex items-center justify-center text-white text-xl lg:text-2xl shadow-lg shadow-amber-500/20 shrink-0">
                    <i className="fas fa-exclamation-triangle"></i>
                </div>
                <div className="text-center sm:text-left">
                    <h5 className="text-amber-900 font-black tracking-tight leading-none text-base lg:text-lg">Administrative Responsibility</h5>
                    <p className="text-amber-700/80 text-[11px] lg:text-sm font-medium mt-2 leading-relaxed max-w-4xl">
                        Recovery tools bypass standard school security. Always verify the identity of the target user before performing a manual password reset. All actions are logged at the database level by Supabase.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default RecoveryTools;
