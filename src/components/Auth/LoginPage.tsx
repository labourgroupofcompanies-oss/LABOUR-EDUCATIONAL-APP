// src/components/Auth/LoginPage.tsx
//
// LABOUR-APP SYSTEM — Staff Login Page
//
// Login flow for staff (teachers / general staff):
//   1. Staff enters: School Code + Username + Password
//   2. We query staff_profiles for auth_email using school_code + username
//   3. We call supabase.auth.signInWithPassword(auth_email, password)
//   4. Supabase returns a session → user is redirected to their dashboard
//
// Security features:
//   - Brute-force protection (5 attempts → 60s lockout, persisted in sessionStorage)
//   - All errors are user-friendly and never leak internal emails

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../hooks/useAuth';

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000; // 60 seconds
const LOCKOUT_KEY = 'labour_lockout';

// ── Types ──────────────────────────────────────────────────────────────────────
interface LoginPageProps {
    onOnboardingStart: () => void;
    showRegisterLink?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Step 1 of the login flow.
 * Looks up the internal auth_email from staff_profiles using school_code + username.
 * Returns the auth_email string, or throws a user-friendly Error.
 */
async function resolveAuthEmail(schoolCode: string, username: string): Promise<string> {
    // Call the server-side SECURITY DEFINER function instead of querying tables directly.
    // This prevents anonymous users from enumerating staff data via the anon key.
    const { data, error } = await supabase
        .rpc('resolve_auth_email', {
            p_school_code: schoolCode.trim().toUpperCase(),
            p_username: username.trim().toLowerCase(),
        });

    if (error || !data) {
        // Log locally for debugging, but don't leak specifics to the throw
        console.error('[Login] resolve_auth_email failure');
        throw new Error('Access Denied: Invalid credentials or account status.');
    }

    return data as string;
}


// ── Component ──────────────────────────────────────────────────────────────────
const LoginPage: React.FC<LoginPageProps> = ({ onOnboardingStart, showRegisterLink = true }) => {
    const { login } = useAuth();
    const usernameRef = useRef<HTMLInputElement>(null);

    const [credentials, setCredentials] = useState({
        schoolCode: '',
        username: '',
        password: '',
    });
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPw, setShowPw] = useState(false);

    // ── Brute-force protection ──────────────────────────────────────────────────
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockedUntil, setLockedUntil] = useState<number | null>(() => {
        const stored = sessionStorage.getItem(LOCKOUT_KEY);
        if (stored) {
            const until = parseInt(stored, 10);
            if (Date.now() < until) return until;
            sessionStorage.removeItem(LOCKOUT_KEY);
        }
        return null;
    });
    const [countdown, setCountdown] = useState(0);

    const isLockedOut = lockedUntil !== null && Date.now() < lockedUntil;

    // Countdown ticker
    useEffect(() => {
        if (!lockedUntil) return;
        const tick = setInterval(() => {
            const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
            if (remaining <= 0) {
                setLockedUntil(null);
                setFailedAttempts(0);
                setCountdown(0);
                setError(null);
                sessionStorage.removeItem(LOCKOUT_KEY);
            } else {
                setCountdown(remaining);
            }
        }, 500);
        return () => clearInterval(tick);
    }, [lockedUntil]);

    const recordFailedAttempt = useCallback(() => {
        setFailedAttempts(prev => {
            const next = prev + 1;
            if (next >= MAX_ATTEMPTS) {
                const until = Date.now() + LOCKOUT_MS;
                setLockedUntil(until);
                setCountdown(Math.ceil(LOCKOUT_MS / 1000));
                setError(`Too many failed attempts. Please wait ${Math.ceil(LOCKOUT_MS / 1000)} seconds.`);
                sessionStorage.setItem(LOCKOUT_KEY, String(until));
            }
            return next;
        });
    }, []);

    // Auto-focus on mount
    useEffect(() => { usernameRef.current?.focus(); }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCredentials(prev => ({ ...prev, [name]: value }));
        if (error && !isLockedOut) setError(null);
    };

    // ── Submit Handler ────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLockedOut) return;

        const { schoolCode, username, password } = credentials;

        if (!schoolCode.trim() || !username.trim() || !password) {
            setError('Please fill in all three fields.');
            return;
        }

        setError(null);
        setIsLoading(true);

        try {
            // ── Step 1: Resolve the internal auth email ───────────────────────────
            let authEmail: string;
            try {
                authEmail = await resolveAuthEmail(schoolCode, username);
            } catch (lookupErr: unknown) {
                setError('Access Denied: Invalid credentials or account status.');
                recordFailedAttempt();
                return;
            }

            // ── Step 2: Sign in with Supabase Auth ───────────────────────────────
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email: authEmail,
                password: password,
            });

            if (signInError || !data.session || !data.user) {
                recordFailedAttempt();
                setError('Access Denied: Invalid credentials or account status.');
                return;
            }

            // ── Step 3: Fetch the staff profile (role, name, etc.) ───────────────
            const { data: profile, error: profileError } = await supabase
                .from('staff_profiles')
                .select('id, school_id, username, full_name, role')
                .eq('id', data.user.id)
                .single();

            if (profileError || !profile) {
                await supabase.auth.signOut();
                setError('System unavailable. Please contact support.');
                return;
            }

            // ── Step 4: Hand off to auth context → triggers redirect ─────────────
            setFailedAttempts(0);
            setLockedUntil(null);
            login({
                id: profile.id,
                schoolId: profile.school_id,
                username: profile.username,
                fullName: profile.full_name,
                role: profile.role,
                mustChangePassword: false, // Force-password-change feature is disabled
            });

        } catch (err: unknown) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────────
    return (
        <div className="max-w-md mx-auto mt-10 p-4 md:p-0 relative z-50">
            <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-blue-200 border border-gray-200 overflow-hidden">

                {/* Header */}
                <div className="bg-primary p-8 text-white relative overflow-hidden text-center">
                    <div className="relative z-10">
                        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30">
                            <i className="fas fa-lock-open text-3xl" />
                        </div>
                        <h1 className="text-4xl font-black tracking-tighter mb-2">Welcome Back.</h1>
                        <p className="text-white/80 font-bold uppercase text-[10px] tracking-[0.2em]">
                            Enter your credentials to access your dashboard
                        </p>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-8 space-y-5 bg-white">

                    {/* School Code */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">
                            School ID
                        </label>
                        <div className="relative group">
                            <i className="fas fa-school absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                name="schoolCode"
                                value={credentials.schoolCode}
                                onChange={handleChange}
                                required
                                disabled={isLockedOut}
                                autoComplete="organization"
                                placeholder="e.g. GHS-001"
                                className="w-full pl-12 pr-5 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-primary/20 focus:bg-white focus:outline-none transition-all font-bold text-gray-700 placeholder:text-gray-300 uppercase disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Username */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">
                            Username
                        </label>
                        <div className="relative group">
                            <i className="fas fa-user absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-primary transition-colors" />
                            <input
                                ref={usernameRef}
                                type="text"
                                name="username"
                                value={credentials.username}
                                onChange={handleChange}
                                required
                                disabled={isLockedOut}
                                autoComplete="username"
                                placeholder="e.g. aserwaa"
                                className="w-full pl-12 pr-5 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-primary/20 focus:bg-white focus:outline-none transition-all font-bold text-gray-700 placeholder:text-gray-300 disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">
                            Password
                        </label>
                        <div className="relative group">
                            <i className="fas fa-key absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-primary transition-colors" />
                            <input
                                type={showPw ? 'text' : 'password'}
                                name="password"
                                value={credentials.password}
                                onChange={handleChange}
                                required
                                disabled={isLockedOut}
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className="w-full pl-12 pr-14 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-primary/20 focus:bg-white focus:outline-none transition-all font-bold text-gray-700 placeholder:text-gray-300 disabled:opacity-50"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPw(v => !v)}
                                className="btn-icon absolute right-2 top-1/2 -translate-y-1/2 !bg-transparent !w-12 !h-12"
                                aria-label={showPw ? 'Hide password' : 'Show password'}
                                tabIndex={-1}
                            >
                                <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'} text-sm`} />
                            </button>
                        </div>
                    </div>

                    {/* Attempts warning */}
                    {!isLockedOut && failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS && (
                        <div className="bg-amber-50 border-2 border-amber-100 p-3 rounded-2xl flex items-center gap-3 text-amber-600 text-[11px] font-black">
                            <i className="fas fa-triangle-exclamation text-lg" />
                            {MAX_ATTEMPTS - failedAttempts} attempt{MAX_ATTEMPTS - failedAttempts !== 1 ? 's' : ''} remaining before lockout
                        </div>
                    )}

                    {/* Error / Lockout message */}
                    {error && (
                        <div className={`border-2 p-4 rounded-2xl flex items-center gap-3 text-[11px] font-black animate-shake ${isLockedOut
                            ? 'bg-red-100 border-red-200 text-red-700'
                            : 'bg-red-50 border-red-100 text-red-600'
                            }`}>
                            <i className={`text-lg ${isLockedOut ? 'fas fa-lock' : 'fas fa-exclamation-circle'}`} />
                            <span>
                                {isLockedOut ? `Account locked. Try again in ${countdown}s` : error}
                            </span>
                        </div>
                    )}

                    {/* Submit button */}
                    <button
                        type="submit"
                        disabled={isLoading || isLockedOut}
                        className="btn-primary w-full py-5 !text-lg"
                    >
                        {isLoading ? (
                            <><i className="fas fa-circle-notch fa-spin" /> Verifying…</>
                        ) : isLockedOut ? (
                            <><i className="fas fa-lock" /> Locked ({countdown}s)</>
                        ) : (
                            <><i className="fas fa-bolt-lightning" /> Unlock Dashboard</>
                        )}
                    </button>

                    {/* Footer link */}
                    {showRegisterLink && (
                        <div className="pt-4 text-center border-t border-gray-100">
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">
                                Need a new school setup?{' '}
                                <button
                                    type="button"
                                    onClick={onOnboardingStart}
                                    className="text-primary hover:underline ml-1 font-black btn-ghost !inline-flex !px-2 !py-1 !rounded-lg !text-[10px]"
                                >
                                    Register Now
                                </button>
                            </p>
                        </div>
                    )}
                </form>
            </div>

            {/* Security badge */}
            <div className="mt-8 text-center">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                    <i className="fas fa-shield-alt mr-2" />
                    End-to-end encrypted
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
