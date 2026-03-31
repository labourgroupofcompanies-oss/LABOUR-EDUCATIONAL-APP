// ============================================================
// Edge Function: verify-momo-payment
// Checks MTN MoMo payment status and activates subscription
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        // Read secrets inside handler so startup crashes don't kill preflight
        const MOMO_API_USER = Deno.env.get('MOMO_API_USER') ?? '';
        const MOMO_API_KEY = Deno.env.get('MOMO_API_KEY') ?? '';
        const MOMO_SUBSCRIPTION_KEY = Deno.env.get('MOMO_SUBSCRIPTION_KEY') ?? '';
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
        const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        const MOMO_BASE_URL = 'https://sandbox.momodeveloper.mtn.com';
        const MOMO_TARGET_ENV = 'sandbox';

        const { reference } = await req.json();

        if (!reference) {
            return new Response(JSON.stringify({ error: 'Payment reference is required' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Step 1: Get Bearer token
        const credentials = btoa(`${MOMO_API_USER}:${MOMO_API_KEY}`);
        const tokenRes = await fetch(`${MOMO_BASE_URL}/collection/token/`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
                'X-Target-Environment': MOMO_TARGET_ENV,
            }
        });

        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            return new Response(JSON.stringify({ error: 'Failed to get MoMo token', detail: err }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const { access_token } = await tokenRes.json();

        // Step 2: Check payment status from MTN
        const statusRes = await fetch(`${MOMO_BASE_URL}/collection/v1_0/requesttopay/${reference}`, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'X-Target-Environment': MOMO_TARGET_ENV,
                'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
            }
        });

        const statusData = await statusRes.json();
        const paymentStatus = statusData.status; // 'SUCCESSFUL' | 'FAILED' | 'PENDING'

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        if (paymentStatus === 'SUCCESSFUL') {
            await supabase
                .from('school_subscriptions')
                .update({
                    status: 'active',
                    paid_at: new Date().toISOString(),
                    activated_at: new Date().toISOString(),
                })
                .eq('momo_reference', reference);

            return new Response(JSON.stringify({
                success: true,
                status: 'active',
                message: '✅ Payment confirmed! Your subscription is now active.'
            }), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } else if (paymentStatus === 'FAILED') {
            await supabase
                .from('school_subscriptions')
                .update({ status: 'expired' })
                .eq('momo_reference', reference);

            return new Response(JSON.stringify({
                success: false,
                status: 'failed',
                message: '❌ Payment was declined or cancelled. Please try again.'
            }), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } else {
            return new Response(JSON.stringify({
                success: false,
                status: 'pending',
                message: '⏳ Payment still pending. Please approve it on your phone.'
            }), {
                status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

    } catch (error) {
        console.error('Unexpected error:', error);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
