// src/hooks/useAuth.tsx
//
// LABOUR-APP SYSTEM — Auth Provider & Hook
//
// Manages session state using Supabase Auth as the single source of truth.
// No Dexie/local DB — all user data comes from staff_profiles via Supabase.

import React, { useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext, type AuthUser } from './AuthContext';

// ── Session helpers (localStorage for offline persistence) ────────────────────
const SESSION_KEY = 'labour_auth_user';

function loadSession(): AuthUser | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
        return null;
    }
}

function saveSession(user: AuthUser) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// ── AuthProvider ──────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Sync-initialization: read from cache immediately for instant first render
    const cachedUser = loadSession();
    
    const [user, setUser] = useState<AuthUser | null>(cachedUser);
    const [isLoading, setIsLoading] = useState(!cachedUser); 
    const [hasSchool, setHasSchool] = useState<boolean | null>(cachedUser ? true : null);

    useEffect(() => {
        let mounted = true;
        let authSubscription: any = null;

        const initialize = async () => {
            // STEP 1: Fast-track initialization check (redundant but safe for effect re-runs)
            const currentCache = loadSession();
            if (currentCache && !user) {
                if (mounted) {
                    setUser(currentCache);
                    setHasSchool(true);
                    setIsLoading(false);
                }
            }

            // STEP 2: Background Session Verification
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (mounted) setHasSchool(session ? true : false);

                if (!session && mounted) {
                    setUser(null);
                    clearSession();
                    setHasSchool(false);
                }
            } catch (err) {
                console.info('[auth:offline] Supabase session check skipped or failed.');
            }
            
            if (mounted) setIsLoading(false);

            // Listen to Supabase Auth state changes AFTER initial getSession to prevent lock contention
            const { data: { subscription } } = supabase.auth.onAuthStateChange(
                async (event, session) => {
                    if (!mounted) return;

                    if (session?.user) {
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
                                email: session.user.email,
                                role: profile.role,
                                mustChangePassword: false, 
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
            authSubscription = subscription;
        };

        initialize();

        return () => { 
            mounted = false; 
            if (authSubscription) {
                authSubscription.unsubscribe();
            }
        };
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
                email: session.user.email,
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
