import React, { useState } from 'react';
import { type School } from '../../db';
import { getSupabaseEmail } from '../../utils/auth';
import DeveloperModal from './DeveloperModal';

interface PasswordResetToolProps {
    school: School;
    onClose: () => void;
}

const PasswordResetTool: React.FC<PasswordResetToolProps> = ({ school, onClose }) => {
    const [newPassword, setNewPassword] = useState('');
    const [copied, setCopied] = useState(false);

    const defaultUsername = (school as any).school_code || school.schoolCode || 'admin';
    const username = school.username || (school as any).username || defaultUsername;
    const email = school.email || getSupabaseEmail(username, school.schoolId || (school as any).school_id || school.id);
    const legacyEmail = (username + ((school.schoolId || (school as any).school_id || school.id) ? `.${(school.schoolId || (school as any).school_id || school.id).toLowerCase().replace(/-/g, '')}` : '') + '@labourapp.com');

    const simpleSQL = `-- Advanced Reset for ${(school as any).school_name || school.schoolName}
-- This script fixes both the password and the account's internal identity format.
UPDATE auth.users 
SET 
  encrypted_password = crypt('${newPassword || 'NEW_PASSWORD'}', gen_salt('bf')),
  email = lower('${email}'), -- Forces standardize lowercase format
  email_confirmed_at = NOW(),
  updated_at = NOW()
WHERE 
  id IN (
    SELECT id FROM auth.users 
    WHERE lower(email) = lower('${email}') 
    OR lower(email) = lower('${legacyEmail}')
    OR lower(email) = lower('${username}@labourapp.com')
  );`;

    const handleCopy = () => {
        navigator.clipboard.writeText(simpleSQL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <DeveloperModal
            isOpen={true}
            onClose={onClose}
            title="Master Reset"
            subtitle="Administrative Override"
            icon="fa-key"
            iconBg="bg-amber-500"
            width="max-w-lg"
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 px-6 rounded-2xl bg-slate-100 text-slate-500 font-black text-sm hover:bg-slate-200 transition-all active:scale-95"
                    >
                        Dismiss
                    </button>
                    <button
                        onClick={handleCopy}
                        disabled={!newPassword}
                        className="flex-1 py-4 px-6 rounded-2xl bg-amber-500 text-white font-black text-sm shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
                    >
                        Copy SQL Code
                    </button>
                </>
            }
        >
            <div className="space-y-6">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Account Email</label>
                    <div className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 border-2 border-slate-100 text-slate-500 font-bold overflow-hidden truncate text-sm">
                        {email}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">New Password</label>
                    <div className="relative">
                        <i className="fas fa-shield-alt absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 text-sm"></i>
                        <input
                            type="text"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter secure password..."
                            className="w-full pl-12 pr-6 py-3.5 rounded-2xl bg-white border-2 border-slate-100 focus:border-amber-500 focus:outline-none transition-all font-bold text-slate-800 text-sm"
                        />
                    </div>
                </div>

                <div className="p-5 bg-slate-900 rounded-3xl space-y-3 border-2 border-slate-800">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SQL Snippet</span>
                        <button
                            onClick={handleCopy}
                            className={`text-[9px] font-black uppercase tracking-widest transition-all ${copied ? 'text-green-400' : 'text-blue-400 hover:text-white'}`}
                        >
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <pre className="text-[11px] text-blue-300 font-mono leading-relaxed bg-slate-800/50 p-4 rounded-xl border border-white/5 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto custom-scrollbar">
                        {simpleSQL}
                    </pre>
                </div>

                <p className="text-center text-[10px] text-slate-400 font-medium">
                    <i className="fas fa-info-circle mr-1"></i>
                    Run this code in your Supabase SQL Editor to finalize the reset.
                </p>
            </div>
        </DeveloperModal>
    );
};

export default PasswordResetTool;
