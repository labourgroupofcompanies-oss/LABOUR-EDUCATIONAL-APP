// src/hooks/useParentAuth.tsx
//
// LABOUR-APP SYSTEM — Parent Auth Provider & Hook
//
// Manages Parent Portal authentication state using Supabase Auth (phone auth).
// Leverages localStorage to cache student details for instantaneous offline load times.

import React, { useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import { ParentAuthContext, type ParentUser } from './ParentAuthContext';

const PARENT_SESSION_KEY = 'labour_parent_user';
const PARENT_PWD_KEY    = 'labour_parent_pwd'; // sessionStorage: auto-cleared on browser/tab close

function loadParentSession(): ParentUser | null {
    try {
        const raw = localStorage.getItem(PARENT_SESSION_KEY);
        if (!raw) return null;
        const user = JSON.parse(raw) as ParentUser;
        // Reattach password from sessionStorage (not persisted across browser restarts)
        const pwd = sessionStorage.getItem(PARENT_PWD_KEY);
        if (pwd) user.password = pwd;
        return user;
    } catch {
        return null;
    }
}

function saveParentSession(parent: ParentUser) {
    // Store profile data (name, children, arrears, etc.) in localStorage for offline-first
    const { password, ...profileData } = parent;
    localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify(profileData));
    // Store password separately in sessionStorage — cleared when tab/browser closes
    if (password) {
        sessionStorage.setItem(PARENT_PWD_KEY, password);
    }
}

function clearParentSession() {
    localStorage.removeItem(PARENT_SESSION_KEY);
    sessionStorage.removeItem(PARENT_PWD_KEY);
}

export const ParentAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const cachedParent = loadParentSession();
    
    const [parent, setParent] = useState<ParentUser | null>(cachedParent);
    const [isLoading, setIsLoading] = useState(!cachedParent);

    useEffect(() => {
        let mounted = true;

        const initialize = async () => {
            // STEP 1: Quick cache load
            const currentCache = loadParentSession();
            if (currentCache && mounted) {
                setParent(currentCache);
                setIsLoading(false);
            }

            // STEP 2: Background Session verification (only if online and credentials exist)
            if (currentCache?.phoneNumber && currentCache?.password && navigator.onLine) {
                try {
                    const { data, error } = await supabase.rpc('login_parent_portal', {
                        phone_input: currentCache.phoneNumber.trim(),
                        password_input: currentCache.password
                    });

                    if (!error && data?.success && mounted) {
                        const updatedDetails = {
                            ...data.parent,
                            password: currentCache.password
                        };
                        setParent(updatedDetails);
                        saveParentSession(updatedDetails);
                    } else if (data && !data.success && mounted) {
                        // Deactivated or incorrect credentials -> log out
                        console.warn('[useParentAuth] Background verification failed:', data.message);
                        setParent(null);
                        clearParentSession();
                    }
                } catch (err) {
                    console.info('[parent-auth:offline] Background verification skipped due to network/error.');
                }
            }
            
            if (mounted) setIsLoading(false);
        };

        initialize();

        return () => {
            mounted = false;
        };
    }, []);

    const loginParent = (parentData: ParentUser) => {
        setParent(parentData);
        saveParentSession(parentData);
    };

    const refreshParentProfile = async () => {
        if (!parent?.phoneNumber || !parent?.password) return;

        try {
            const { data, error } = await supabase.rpc('login_parent_portal', {
                phone_input: parent.phoneNumber.trim(),
                password_input: parent.password
            });

            if (!error && data?.success) {
                const updatedDetails = {
                    ...data.parent,
                    password: parent.password
                };
                setParent(updatedDetails);
                saveParentSession(updatedDetails);
            }
        } catch (err) {
            console.error('[useParentAuth] Profile refresh failed:', err);
        }
    };

    const logoutParent = async () => {
        setParent(null);
        clearParentSession();
    };

    const value = useMemo(() => ({
        parent,
        isAuthenticated: !!parent,
        loginParent,
        logoutParent,
        refreshParentProfile,
        isLoading
    }), [parent, isLoading]);

    return (
        <ParentAuthContext.Provider value={value}>
            {children}
        </ParentAuthContext.Provider>
    );
};

export const useParentAuth = () => {
    const context = useContext(ParentAuthContext);
    if (context === undefined) {
        throw new Error('useParentAuth must be used within a ParentAuthProvider');
    }
    return context;
};
