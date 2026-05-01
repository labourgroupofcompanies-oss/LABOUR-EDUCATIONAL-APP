// ============================================================
// Edge Function: verify-paystack-subscription
// Production-Safe | Secure Paystack Verification | CORS Hardened
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS Headers ─────────────────────────────────────────────
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Main Handler ──────────────────────────────────────────────
Deno.serve(async (req) => {

    // 1. Handle CORS Preflight (OPTIONS) — MUST be first
    if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200, headers: corsHeaders });
    }

    // 2. Only allow POST requests
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    try {
        // 3. Load Environment Secrets — fail with descriptive errors
        const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        if (!PAYSTACK_SECRET) {
            console.error('[verify-paystack] FATAL: PAYSTACK_SECRET_KEY environment secret is not set.');
            return new Response(JSON.stringify({ error: 'Server configuration error: payment provider not configured. Contact support.' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error('[verify-paystack] FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.');
            return new Response(JSON.stringify({ error: 'Server configuration error: database not configured. Contact support.' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 4. Parse and Validate Request Body
        const body = await req.json();
        const { reference, schoolId, plan, term, academicYear } = body;

        if (!reference || !schoolId || !plan || !term || !academicYear) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: reference, schoolId, plan, term, academicYear' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 5. Server-Side Paystack Verification (10s timeout)
        console.log(`[verify-paystack] Verifying reference: ${reference} for schoolId: ${schoolId}`);
        const paystackController = new AbortController();
        const paystackTimer = setTimeout(() => paystackController.abort(), 10000);

        let paystackRes: Response;
        try {
            paystackRes = await fetch(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
                {
                    headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}` },
                    signal: paystackController.signal
                }
            );
        } catch (fetchErr: any) {
            const isTimeout = fetchErr?.name === 'AbortError';
            console.error('[verify-paystack] Paystack fetch error:', fetchErr?.message);
            return new Response(JSON.stringify({ error: isTimeout ? 'Paystack verification timed out — please try again.' : 'Network error reaching Paystack' }), {
                status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } finally {
            clearTimeout(paystackTimer);
        }

        if (!paystackRes.ok) {
            const err = await paystackRes.text();
            console.error('[verify-paystack] Paystack API returned non-OK status:', paystackRes.status, err);
            return new Response(JSON.stringify({ error: 'Could not verify payment with Paystack', detail: paystackRes.status }), {
                status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const paystackJson = await paystackRes.json();
        const tx = paystackJson?.data;
        console.log(`[verify-paystack] Paystack status: ${tx?.status}, amount: ${tx?.amount}, currency: ${tx?.currency}`);

        // 6. Validate Payment Was Successful
        if (tx?.status !== 'success') {
            return new Response(JSON.stringify({
                success: false,
                status: tx?.status ?? 'unknown',
                message: 'Transaction was not successful on Paystack'
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 7. Build Subscription Payloads Based on Plan
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const activatedAt = new Date().toISOString();
        const total = tx.amount / 100;
        const currency = tx.currency ?? 'GHS';
        const payloads: object[] = [];

        const getNextAcademicYear = (currentYear: string) => {
            const parts = currentYear.split('/');
            if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
                return `${Number(parts[0]) + 1}/${Number(parts[1]) + 1}`;
            }
            return currentYear; // Fallback
        };

        const generateTerms = (startTerm: string, startYear: string, count: number) => {
            const result = [];
            let currentTerm = startTerm;
            let currentYear = startYear;
            for (let i = 0; i < count; i++) {
                result.push({ term: currentTerm, year: currentYear });
                if (currentTerm === 'Term 3') {
                    currentTerm = 'Term 1';
                    currentYear = getNextAcademicYear(currentYear);
                } else if (currentTerm === 'Term 1') {
                    currentTerm = 'Term 2';
                } else if (currentTerm === 'Term 2') {
                    currentTerm = 'Term 3';
                }
            }
            return result;
        };

        const count = plan === '1_term' ? 1 : plan === '2_terms' ? 2 : plan === 'annual' ? 3 : 0;
        
        if (count > 0) {
            const termsToAdd = generateTerms(term, academicYear, count);
            termsToAdd.forEach((t, i) => {
                payloads.push({
                    school_id: schoolId,
                    term: t.term,
                    academic_year: t.year,
                    status: 'active',
                    provider: 'paystack',
                    payment_reference: `${reference}-T${i + 1}`,
                    amount_paid: total / count,
                    currency,
                    verified_at: activatedAt,
                    updated_at: activatedAt
                });
            });
        } else {
            console.error('[verify-paystack] Invalid plan received:', plan);
            return new Response(JSON.stringify({ error: `Invalid plan: "${plan}". Must be 1_term, 2_terms, or annual.` }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 8. Authoritatively Activate Subscription in Database
        console.log(`[verify-paystack] Upserting ${payloads.length} subscription record(s)...`);
        const { error: dbError } = await supabase
            .from('school_subscriptions')
            .upsert(payloads, { onConflict: 'school_id,term,academic_year' });

        if (dbError) {
            console.error('[verify-paystack] DB upsert error - code:', dbError.code, '| message:', dbError.message, '| details:', dbError.details, '| hint:', dbError.hint);
            // Return a 200 with failure info so we can diagnose from the client side log
            return new Response(JSON.stringify({
                success: false,
                status: 'db_error',
                error: 'Payment verified but subscription activation failed.',
                detail: dbError.message,
                hint: dbError.hint ?? null,
                code: dbError.code ?? null
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log('[verify-paystack] Subscription activated successfully.');
        return new Response(JSON.stringify({
            success: true,
            status: 'active',
            message: '✅ Subscription activated successfully!'
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err: any) {
        // 9. Global Error Safety — always return JSON with CORS headers
        console.error('[verify-paystack] Unhandled fatal error:', err?.message ?? err);
        return new Response(JSON.stringify({ error: err?.message ?? 'Internal server error' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
