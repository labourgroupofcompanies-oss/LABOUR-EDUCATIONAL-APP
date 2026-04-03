// src/services/staffService.ts
//
// LABOUR-APP SYSTEM — Staff Service (Manual Fetch Version)
//
// Handles all staff-related API calls.
// Using fetch() instead of invoke() to bypass SDK auto-injection issues.

export interface StaffFormData {
    school_id: string;
    full_name: string;
    gender: string;
    phone: string;
    email: string;
    qualification: string;
    specialization: string;
    role: 'staff' | 'headteacher' | 'teacher' | 'accountant' | 'developer' | 'admin';
    username: string;
    password: string;
    address: string;
}

export interface CreatedStaff {
    id: string;
    school_id: string;
    username: string;
    full_name: string;
    role: string;
    gender?: string;
    phone?: string;
    contact_email?: string;
    qualification?: string;
    specialization?: string;
    address?: string;
    created_at?: string;
}

export interface CreateStaffResponse {
    success: boolean;
    message: string;
    staff: CreatedStaff;
    error?: string;
    reason?: string;
}

export const staffService = {

    async createStaff(formData: StaffFormData): Promise<CreateStaffResponse> {
        const { supabase } = await import('../supabaseClient');
        const { dbService } = await import('./dbService');

        const isOnline = navigator.onLine;
        if (!isOnline) {
            throw new Error('Staff creation requires internet connection.');
        }

        // 1. Identity Verification
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (sessionError || userError || !session || !user) {
            console.error('[staffService] No authenticated session found.');
            throw new Error('UNAUTHORIZED: No valid session. Please log in.');
        }

        const role = (user.app_metadata?.role || '').toLowerCase();
        const school_id_claim = user.app_metadata?.school_id || user.app_metadata?.schoolId;
        
        console.info(`[staffService] Caller: ${user.id} Role: ${role} School: ${school_id_claim}`);
        
        if (role !== 'headteacher') {
            throw new Error('FORBIDDEN: Only headteachers can create staff.');
        }

        // 2. Manual Fetch Invocation (Total Control)
        console.info('[staffService] Starting manual fetch to Edge Function...');
        
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/create-staff-user`;

        try {
            const response = await fetch(FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': ANON_KEY,
                },
                body: JSON.stringify({
                    school_id: formData.school_id,
                    full_name: formData.full_name.trim(),
                    gender: formData.gender,
                    phone: formData.phone.trim(),
                    email: formData.email?.trim()?.toLowerCase() || '',
                    qualification: formData.qualification.trim(),
                    specialization: formData.specialization.trim(),
                    role: formData.role,
                    username: formData.username.trim().toLowerCase(),
                    password: formData.password,
                    address: formData.address.trim(),
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                const status = response.status;
                const reason = result.reason || result.error || 'Unknown error';
                console.error(`[staffService] Error (Status: ${status}) Reason: ${reason}`);
                
                if (status === 401) {
                    throw new Error('401: Gateway rejection. Please check project secrets.');
                }
                if (status === 403) {
                    throw new Error(`403: Identity rejection. Reason: ${reason}`);
                }
                throw new Error(reason);
            }

            console.info('[staffService] Success!');

            // 3. Cache Locally
            try {
                await dbService.staff.add({
                    schoolId: result.staff.school_id,
                    idCloud: result.staff.id,
                    username: result.staff.username,
                    fullName: result.staff.full_name,
                    role: (result.staff.role || 'STAFF').toUpperCase() as any,
                    syncStatus: 'synced',
                    createdAt: result.staff.created_at ? new Date(result.staff.created_at).getTime() : Date.now(),
                    updatedAt: Date.now(),
                    // ... other fields
                    phoneNumber: result.staff.phone || '',
                    email: result.staff.contact_email || '',
                    address: result.staff.address || '',
                });
            } catch (dbErr) {
                console.error('[staffService] Local cache save failed:', dbErr);
            }

            return result;

        } catch (err: any) {
            console.error('[staffService] Fetch failed:', err.message);
            throw err;
        }
    },

    async updateStaffProfileOnlineFirst(
        editingId: number,
        updateData: Partial<any>,
        originalStaff: any,
        _schoolId: string
    ): Promise<boolean> {
        const isOnline = navigator.onLine;
        const now = Date.now();

        if (isOnline && originalStaff.idCloud) {
            try {
                const { supabase } = await import('../supabaseClient');
                const payload = {
                    full_name: updateData.fullName || originalStaff.fullName,
                    updated_at: new Date(now).toISOString()
                };

                const { error } = await supabase
                    .from('staff_profiles')
                    .update(payload)
                    .eq('id', originalStaff.idCloud);

                if (error) throw error;

                const { dbService } = await import('./dbService');
                await dbService.staff.update(editingId, {
                    ...updateData,
                    syncStatus: 'synced',
                    updatedAt: now
                });
                return true;

            } catch (err: any) {
                console.warn('[Staff update failed]', err);
                return false;
            }
        }
        return false;
    }
};
