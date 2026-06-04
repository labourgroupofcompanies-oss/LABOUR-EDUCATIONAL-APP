// src/components/ParentPortal/ParentLogin.tsx
//
// LABOUR-APP SYSTEM — Parent Portal Activation & Login
//
// A high-fidelity, premium glassmorphism interface for parents.
// Automatically transitions between number lookup, account activation, and login.

import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showToast } from '../Common/Toast';
import { useParentAuth } from '../../hooks/useParentAuth';

interface ChildInfo {
    full_name: string;
    school_name: string;
    class_name: string;
}

interface ActivationDetails {
    exists: boolean;
    is_active: boolean;
    guardian_name: string | null;
    children: ChildInfo[];
}

const ParentLogin: React.FC = () => {
    const { loginParent } = useParentAuth();

    // UI States
    const [phoneNumber, setPhoneNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    
    const [checkingPhone, setCheckingPhone] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Dynamic Flow State
    // 'input_phone' -> 'enter_password' (login) | 'activate_portal' (register)
    const [flowStep, setFlowStep] = useState<'input_phone' | 'enter_password' | 'activate_portal'>('input_phone');
    const [activationDetails, setActivationDetails] = useState<ActivationDetails | null>(null);

    // Animations
    const [animateIn, setAnimateIn] = useState(false);
    useEffect(() => {
        setAnimateIn(true);
    }, []);

    // Clean phone number input
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, ''); // Numeric only
        setPhoneNumber(val);
        
        // Reset states if they edit the phone number
        if (flowStep !== 'input_phone') {
            setFlowStep('input_phone');
            setActivationDetails(null);
            setPassword('');
            setConfirmPassword('');
        }
    };

    // Step 1: Verify contact with background check
    const handleCheckContact = async (e: React.FormEvent) => {
        e.preventDefault();
        if (phoneNumber.length < 8) {
            return showToast('Please enter a valid phone number', 'warning');
        }

        setCheckingPhone(true);
        try {
            // Trigger Postgres RPC check
            const { data, error } = await supabase.rpc('check_parent_activation_status', {
                phone_input: phoneNumber.trim()
            });

            if (error) throw error;

            const res = data as ActivationDetails;

            if (!res.exists) {
                showToast('This number is not registered with any student. Please contact your school headteacher.', 'error');
                return;
            }

            setActivationDetails(res);

            // Auto-transition based on activation status
            if (res.is_active) {
                // Pre-activated: Dynamic password field slide-down
                setFlowStep('enter_password');
                showToast('Welcome back! Please enter your password to login.', 'info');
            } else {
                // Not yet activated: Seamless slide-in of registration details
                setFlowStep('activate_portal');
                showToast(`Primary contact match found! Let's activate your portal.`, 'success');
            }
        } catch (err: any) {
            console.error('[ParentLogin] Check failed:', err);
            showToast('Unable to reach server. Please check your connection.', 'error');
        } finally {
            setCheckingPhone(false);
        }
    };

    // Step 2A: Handle Login for pre-activated account
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return showToast('Password is required', 'warning');

        setSubmitting(true);
        try {
            const { data, error } = await supabase.rpc('login_parent_portal', {
                phone_input: phoneNumber.trim(),
                password_input: password
            });

            if (error) throw error;
            if (!data.success) {
                throw new Error(data.message || 'Incorrect password.');
            }

            showToast('Logged in successfully!', 'success');
            
            const parentUser = {
                ...data.parent,
                password: password
            };
            
            loginParent(parentUser);
        } catch (err: any) {
            console.error('[ParentLogin] Login failed:', err);
            showToast(err.message || 'Login failed. Please verify your credentials.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Step 2B: Handle Activation (Signup) for new account
    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) {
            return showToast('Password must be at least 6 characters long', 'warning');
        }
        if (password !== confirmPassword) {
            return showToast('Passwords do not match', 'error');
        }

        setSubmitting(true);
        try {
            // 1. Activate parent portal via custom RPC
            const { data: actData, error: actError } = await supabase.rpc('activate_parent_portal', {
                phone_input: phoneNumber.trim(),
                password_input: password
            });

            if (actError) throw actError;
            if (!actData.success) {
                throw new Error(actData.message || 'Portal activation failed.');
            }

            showToast('Portal activated successfully! Logging you in...', 'success');
            
            // 2. Log in using custom RPC
            const { data: loginData, error: loginError } = await supabase.rpc('login_parent_portal', {
                phone_input: phoneNumber.trim(),
                password_input: password
            });

            if (loginError) throw loginError;
            if (!loginData.success) {
                throw new Error(loginData.message || 'Login failed.');
            }

            const parentUser = {
                ...loginData.parent,
                password: password
            };
            
            loginParent(parentUser);
        } catch (err: any) {
            console.error('[ParentLogin] Activation failed:', err);
            showToast(err.message || 'Portal activation failed. Contact support.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Password strength check
    const getPasswordStrength = () => {
        if (!password) return { label: '', color: 'bg-gray-200', width: 'w-0' };
        if (password.length < 6) return { label: 'Too short', color: 'bg-red-400', width: 'w-1/3' };
        
        const hasLetters = /[a-zA-Z]/.test(password);
        const hasNumbers = /\d/.test(password);
        
        if (hasLetters && hasNumbers && password.length >= 8) {
            return { label: 'Strong', color: 'bg-green-500', width: 'w-full' };
        }
        return { label: 'Moderate', color: 'bg-amber-400', width: 'w-2/3' };
    };

    const strength = getPasswordStrength();

    return (
        <div className={`min-h-screen flex items-center justify-center p-4 md:p-8 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 transition-all duration-700 ${animateIn ? 'opacity-100' : 'opacity-0'}`}>
            {/* Background glowing circles */}
            <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow"></div>

            <div 
                className="w-full max-w-lg bg-white/5 backdrop-blur-2xl rounded-[3rem] border border-white/10 shadow-2xl p-8 md:p-10 text-white relative z-10 transition-all duration-500"
                style={{ boxShadow: '0 32px 64px -12px rgba(0,0,0,0.5)' }}
            >
                {/* Header */}
                <div className="text-center space-y-3 mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[1.5rem] flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/30">
                        <i className="fas fa-user-shield text-2xl"></i>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black uppercase tracking-widest text-white leading-none">Parent Portal</h2>
                        <p className="text-[10px] text-blue-300 font-bold uppercase tracking-[0.2em] mt-1.5">Activation & Secured Entry</p>
                    </div>
                </div>

                {/* FLOW STEP 1: Phone Lookup */}
                {flowStep === 'input_phone' && (
                    <form onSubmit={handleCheckContact} className="space-y-6 animate-fadeIn">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-blue-200/60 uppercase tracking-widest block">Primary Contact Number</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-300/50">
                                    <i className="fas fa-phone-alt"></i>
                                </div>
                                <input
                                    type="tel"
                                    required
                                    value={phoneNumber}
                                    onChange={handlePhoneChange}
                                    placeholder="Enter registered contact, e.g. 0241234567"
                                    className="w-full pl-11 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-all text-sm font-bold tracking-wider"
                                />
                            </div>
                            <p className="text-[9px] text-white/40 font-medium leading-relaxed uppercase tracking-tight">
                                *Input the exact primary contact you registered for your children during their admission.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={checkingPhone}
                            className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            {checkingPhone ? (
                                <>
                                    <i className="fas fa-circle-notch fa-spin"></i> Checking Records...
                                </>
                            ) : (
                                <>
                                    Verify & Proceed <i className="fas fa-arrow-right"></i>
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* FLOW STEP 2A: Login View (Activated Account) */}
                {flowStep === 'enter_password' && (
                    <form onSubmit={handleLogin} className="space-y-6 animate-slideDown">
                        <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-300">
                                <i className="fas fa-check-circle"></i>
                            </div>
                            <div>
                                <p className="text-[8px] font-black text-blue-300/60 uppercase tracking-wider">Verified Contact</p>
                                <p className="text-sm font-black tracking-widest">{phoneNumber}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-blue-200/60 uppercase tracking-widest block">Access Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-300/50">
                                    <i className="fas fa-lock"></i>
                                </div>
                                <input
                                    type="password"
                                    required
                                    autoFocus
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter your secret password"
                                    className="w-full pl-11 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-all text-sm font-bold"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => {
                                    setFlowStep('input_phone');
                                    setPassword('');
                                }}
                                className="text-[9px] font-black text-blue-300/60 hover:text-white uppercase tracking-widest transition-all"
                            >
                                <i className="fas fa-chevron-left mr-1"></i> Change Phone
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            {submitting ? (
                                <>
                                    <i className="fas fa-circle-notch fa-spin"></i> Authenticating...
                                </>
                            ) : (
                                <>
                                    Access Dashboard <i className="fas fa-sign-in-alt"></i>
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* FLOW STEP 2B: Activate View (Unactivated Account) */}
                {flowStep === 'activate_portal' && activationDetails && (
                    <form onSubmit={handleActivate} className="space-y-6 animate-slideDown">
                        {/* Match Banner */}
                        <div className="bg-gradient-to-br from-indigo-900/40 to-blue-900/40 border border-indigo-500/20 p-5 rounded-3xl space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300">
                                    <i className="fas fa-user-check"></i>
                                </div>
                                <div>
                                    <p className="text-[7px] font-black text-indigo-300/60 uppercase tracking-widest leading-none mb-1">Guardian Registered Name</p>
                                    <h4 className="text-sm font-black text-white leading-none uppercase tracking-wide">{activationDetails.guardian_name}</h4>
                                </div>
                            </div>

                            <div className="h-px bg-white/5"></div>

                            {/* Children grid */}
                            <div className="space-y-2.5">
                                <p className="text-[8px] font-black text-indigo-300/60 uppercase tracking-widest leading-none mb-1.5">Linked Children</p>
                                <div className="space-y-2">
                                    {activationDetails.children.map((c, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-white/5 px-3.5 py-2.5 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-6 h-6 rounded-md bg-blue-500/20 flex items-center justify-center text-blue-300 text-[10px] font-bold">
                                                    {c.full_name.charAt(0)}
                                                </div>
                                                <span className="text-xs font-bold text-white uppercase tracking-tight">{c.full_name}</span>
                                            </div>
                                            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/10 rounded-md text-[8px] font-black uppercase tracking-wider">
                                                {c.class_name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Password creation inputs */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-blue-200/60 uppercase tracking-widest block">Create Access Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-300/50">
                                        <i className="fas fa-lock"></i>
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        autoFocus
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="Minimum 6 characters"
                                        className="w-full pl-11 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-all text-sm font-bold"
                                    />
                                </div>
                                
                                {/* Dynamic Password Strength Bar */}
                                {password && (
                                    <div className="space-y-1">
                                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div className={`h-full transition-all duration-300 ${strength.color} ${strength.width}`}></div>
                                        </div>
                                        <p className="text-right text-[8px] font-black uppercase tracking-widest text-white/40">
                                            Strength: <span className="text-blue-300">{strength.label}</span>
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-blue-200/60 uppercase tracking-widest block">Confirm Access Password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-blue-300/50">
                                        <i className="fas fa-lock-open"></i>
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="Re-type password to verify"
                                        className="w-full pl-11 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 focus:bg-white/10 transition-all text-sm font-bold"
                                    />
                                </div>
                                {confirmPassword && password !== confirmPassword && (
                                    <p className="text-[8px] font-black uppercase tracking-widest text-red-400">Passwords do not match</p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => {
                                    setFlowStep('input_phone');
                                    setActivationDetails(null);
                                    setPassword('');
                                    setConfirmPassword('');
                                }}
                                className="text-[9px] font-black text-blue-300/60 hover:text-white uppercase tracking-widest transition-all"
                            >
                                <i className="fas fa-chevron-left mr-1"></i> Cancel Activation
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || password !== confirmPassword || password.length < 6}
                            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2
                                ${password === confirmPassword && password.length >= 6
                                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700'
                                    : 'bg-white/10 text-white/30 cursor-not-allowed shadow-none'}`}
                        >
                            {submitting ? (
                                <>
                                    <i className="fas fa-circle-notch fa-spin"></i> Activating Portal...
                                </>
                            ) : (
                                <>
                                    Activate & Launch <i className="fas fa-rocket"></i>
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ParentLogin;
