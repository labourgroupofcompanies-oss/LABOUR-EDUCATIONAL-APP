// src/hooks/useAuth.tsx
//
// LABOUR-APP SYSTEM — Auth Provider & Hook
//
// Manages session state using Supabase Auth as the single source of truth.
// No Dexie/local DB — all user data comes from staff_profiles via Supabase.

import React, { useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext, type AuthUser } from './AuthContext';

// ── Session helpers (sessionStorage for fast page reloads) ────────────────────
const SESSION_KEY = 'labour_auth_user';

function loadSession(): AuthUser | null {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
        return null;
    }
}

function saveSession(user: AuthUser) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
}

// ── AuthProvider ──────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(loadSession);
    const [isLoading, setIsLoading] = useState(true);
    const [hasSchool, setHasSchool] = useState<boolean | null>(null);

    useEffect(() => {
        let mounted = true;

        const initialize = async () => {
            // Check for an existing Supabase session
            const { data: { session } } = await supabase.auth.getSession();

            // If we have a session, a school must exist (users can only exist with a school)
            // If no session, show login. We no longer query the schools table here
            // because the anon role has no SELECT access (security patch).
            if (mounted) setHasSchool(session ? true : false);

            // Listen to Supabase Auth state changes
            const { data: { subscription } = {} } = supabase.auth.onAuthStateChange(
                async (event, session) => {
                    if (!mounted) return;

                    if (session?.user) {
                        // Fetch the full staff profile to get authoritative role + school info
                        const { data: profile } = await supabase
                            .from('staff_profiles')
                            .select('id, school_id, username, full_name, role')
                            .eq('id', session.user.id)
                            .single();

                        if (profile && mounted) {
                            const authUser: AuthUser = {
                                id: profile.id,
                                schoolId: profile.school_id,
                                username: profile.username,
                                fullName: profile.full_name,
                                role: profile.role,
                                mustChangePassword: false, // Force-password-change feature is disabled
                            };
                            setUser(authUser);
                            saveSession(authUser);
                            setHasSchool(true);
                        }
                    } else if (event === 'SIGNED_OUT') {
                        if (mounted) {
                            setUser(null);
                            clearSession();
                            setHasSchool(false);
                        }
                    }
                }
            );

            if (mounted) setIsLoading(false);

            return () => {
                mounted = false;
                subscription?.unsubscribe();
            };
        };

        initialize();

        return () => { mounted = false; };
    }, []);

    // ── login: called directly from LoginPage after successful sign-in ──────────
    const login = (userData: AuthUser) => {
        setUser(userData);
        saveSession(userData);
        setHasSchool(true);
    };

    // ── refreshProfile: re-fetch from Supabase to sync local state ──────────────
    const refreshProfile = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data: profile } = await supabase
            .from('staff_profiles')
            .select('id, school_id, username, full_name, role')
            .eq('id', session.user.id)
            .single();

        if (profile) {
            const authUser: AuthUser = {
                id: profile.id,
                schoolId: profile.school_id,
                username: profile.username,
                fullName: profile.full_name,
                role: profile.role,
                mustChangePassword: false, // Force-password-change feature is disabled
            };
            setUser(authUser);
            saveSession(authUser);
        }
    };

    // ── logout: sign out from Supabase Auth + clear local session ───────────────
    const logout = async () => {
        // Instant optimistic UI update
        setUser(null);
        clearSession();
        setHasSchool(false);
        
        // Background network invalidation without blocking the thread
        supabase.auth.signOut().catch(e => console.warn('Background logout', e));
    };

    const value = useMemo(() => ({
        user,
        isAuthenticated: !!user,
        login,
        logout,
        refreshProfile,
        isLoading,
        hasSchool,
    }), [user, isLoading, hasSchool]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// ── useAuth hook ──────────────────────────────────────────────────────────────
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
