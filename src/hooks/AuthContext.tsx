import { createContext } from 'react';

// ── AuthUser: Supabase-native user shape ──────────────────────────────────────
// This replaces the old Dexie `User` type which used integer IDs and
// local-only fields like syncStatus, createdAt, etc.
// All data here comes directly from Supabase Auth + staff_profiles table.

export interface AuthUser {
    id: string;   // Supabase Auth UUID
    schoolId: string;   // UUID from schools.id
    username: string;
    fullName: string;
    email?: string; // Supabase Auth Email
    role: 'headteacher' | 'staff' | 'developer';  // matches staff_profiles.role values
    mustChangePassword: boolean; // Flag for first-login enforcement
}

export interface AuthContextType {
    user: AuthUser | null;
    isAuthenticated: boolean;
    login: (user: AuthUser) => void;
    logout: () => Promise<void>;
    refreshProfile: () => Promise<void>; // Direct reload of profile from Supabase
    isLoading: boolean;
    hasSchool: boolean | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
