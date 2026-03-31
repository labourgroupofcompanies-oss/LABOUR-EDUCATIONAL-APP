// supabase/functions/create-staff-user/index.ts
//
// LABOUR-APP SYSTEM — Diagnostic Version (401 vs 403)
//
// DIAGNOSIS:
// 1. If status is 401 -> Rejection came from the Supabase Platform (Gateway).
// 2. If status is 403 -> Rejection came from THIS code (Token Verification).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
            return json({ error: 'Environment config missing', reason: 'Missing secrets' }, 500);
        }

        const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // ── Identity Verification ───────────────────────────────────
        const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('[create-staff-user] Unauthorized: Missing token');
            // We use 403 here as a "Signal" that our code is being reached
            return json({ error: 'Unauthorized', reason: 'Missing token' }, 403);
        }

        const token = authHeader.split(' ')[1];

        // adminClient.auth.getUser(token) is the production-safe way to verify a JWT in a Supabase Edge Function.
        const { data: { user: caller }, error: jwtError } = await adminClient.auth.getUser(token);

        if (jwtError || !caller) {
            console.error('[create-staff-user] Forbidden: Invalid token', jwtError?.message);
            // We use 403 here as a "Signal" that our code is being reached
            return json({ 
                error: 'Unauthorized', 
                reason: `Invalid token: ${jwtError?.message || 'Verification failed'}` 
            }, 403);
        }

        // ── RBAC Enforcement ───────────────────────────────────
        const callerRole = (caller.app_metadata?.role || '').toLowerCase();
        const callerSchoolId = caller.app_metadata?.schoolId || caller.app_metadata?.school_id;

        console.log(`[create-staff-user] Caller: ${caller.id} Role: ${callerRole} School: ${callerSchoolId}`);

        if (callerRole !== 'headteacher') {
            console.error('[create-staff-user] Forbidden: Not headteacher');
            return json({ error: 'Unauthorized', reason: 'Not headteacher' }, 403);
        }

        if (!callerSchoolId) {
            console.error('[create-staff-user] Forbidden: Missing school_id claim');
            return json({ error: 'Unauthorized', reason: 'No school association' }, 403);
        }

        // ── Request Body ───────────────────────────────────────────
        let body: Record<string, any>;
        try {
            body = await req.json();
        } catch {
            return json({ error: 'Invalid JSON body' }, 400);
        }

        const {
            school_id,
            full_name,
            gender,
            phone,
            email: contactEmail,
            qualification,
            specialization,
            role: requestedRole,
            username,
            password,
            address,
        } = body;

        if (school_id !== callerSchoolId) {
            console.error(`[create-staff-user] Forbidden: school_id mismatch (${school_id} vs ${callerSchoolId})`);
            return json({ error: 'Unauthorized', reason: 'Cross-school creation attempt' }, 403);
        }

        // Required fields
        if (!full_name || !username || !password || !requestedRole) {
            return json({ error: 'Missing required fields' }, 400);
        }

        // Fetch school_code
        const { data: school, error: schoolError } = await adminClient
            .from('schools')
            .select('school_code')
            .eq('id', school_id)
            .single();

        if (schoolError || !school) {
            return json({ error: 'School not found' }, 404);
        }

        const authEmail = `${username.toLowerCase().trim()}@${school.school_code.toLowerCase()}.internal`;

        // Check uniqueness
        const { data: existingUser } = await adminClient
            .from('staff_profiles')
            .select('id')
            .eq('school_id', school_id)
            .eq('username', username.trim())
            .maybeSingle();

        if (existingUser) {
            return json({ error: 'Username already taken' }, 409);
        }

        // Create Auth User
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email: authEmail,
            password: password,
            email_confirm: true,
            user_metadata: { full_name, username, role: requestedRole, school_id },
            app_metadata: { role: requestedRole, school_id },
        });

        if (authError || !authData.user) {
            console.error('[create-staff-user] Auth creation failed:', authError?.message);
            return json({ error: 'Auth creation failed', details: authError?.message }, 500);
        }

        const newUserId = authData.user.id;

        // Insert Profile
        const { data: newProfile, error: insertError } = await adminClient
            .from('staff_profiles')
            .insert({
                id: newUserId,
                school_id,
                username: username.trim(),
                full_name: full_name.trim(),
                gender: gender ?? null,
                phone: phone ?? null,
                contact_email: contactEmail ? contactEmail.trim().toLowerCase() : null,
                auth_email: authEmail,
                qualification: qualification ?? null,
                specialization: specialization ?? null,
                role: requestedRole,
                address: address ?? null,
            })
            .select()
            .single();

        if (insertError || !newProfile) {
            console.error('[create-staff-user] DB Insert failed. Rolling back...');
            await adminClient.auth.admin.deleteUser(newUserId);
            return json({ error: 'Profile creation failed', details: insertError?.message }, 500);
        }

        console.log(`[SUCCESS] Created ${requestedRole} ${full_name}`);
        return json({
            success: true,
            message: `Staff registered successfully.`,
            staff: newProfile,
        }, 201);

    } catch (err: any) {
        console.error('[UNHANDLED ERROR]', err.message);
        return json({ error: 'Internal error', details: err.message }, 500);
    }
});

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
