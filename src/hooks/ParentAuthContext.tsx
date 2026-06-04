import { createContext } from 'react';

export interface ParentChild {
    id: string;          // Cloud Student UUID
    fullName: string;
    gender?: 'male' | 'female';
    classId?: string;    // Cloud Class UUID
    className?: string;
    schoolId: string;
    schoolName?: string;
    arrears: number;
    photoUrl?: string;
}

export interface ParentUser {
    id: string;          // Supabase Auth User UUID or phone serves as parent ID in custom auth
    phoneNumber: string; // Primary contact registered
    guardianName: string;
    children: ParentChild[];
    password?: string;   // Secret password stored securely in session
}

export interface ParentAuthContextType {
    parent: ParentUser | null;
    isAuthenticated: boolean;
    loginParent: (parentData: ParentUser) => void;
    logoutParent: () => Promise<void>;
    refreshParentProfile: () => Promise<void>;
    isLoading: boolean;
}

export const ParentAuthContext = createContext<ParentAuthContextType | undefined>(undefined);
