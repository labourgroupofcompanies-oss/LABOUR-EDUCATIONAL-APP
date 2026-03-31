// ============================================================
// Edge Function: initiate-momo-payment
// Initiates an MTN MoMo Collection request for a school subscription
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

        const { schoolId, term, academicYear, phoneNumber, amount = 300 } = await req.json();

        if (!schoolId || !term || !academicYear || !phoneNumber) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (!MOMO_API_USER || !MOMO_API_KEY || !MOMO_SUBSCRIPTION_KEY) {
            return new Response(JSON.stringify({ error: 'MoMo API credentials not configured on server' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Step 1: Get Bearer token from MTN
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
            console.error('Token error:', err);
            return new Response(JSON.stringify({ error: 'Failed to get MoMo token', detail: err }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const { access_token } = await tokenRes.json();

        // Step 2: Generate external ID for this transaction
        const externalId = crypto.randomUUID();

        // Step 3: Initiate payment request
        const payRes = await fetch(`${MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'X-Reference-Id': externalId,
                'X-Target-Environment': MOMO_TARGET_ENV,
                'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: String(amount),
                currency: 'EUR', // Use 'GHS' in production
                externalId,
                payer: {
                    partyIdType: 'MSISDN',
                    partyId: phoneNumber.replace(/^0/, '233'),
                },
                payerMessage: `Labour App Subscription - ${term} ${academicYear}`,
                payeeNote: `School ${schoolId} subscription`,
            })
        });

        if (!payRes.ok) {
            const err = await payRes.text();
            console.error('Payment initiation error:', err);
            return new Response(JSON.stringify({ error: 'Failed to initiate payment', detail: err }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Step 4: Save pending subscription to Supabase
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await supabase.from('school_subscriptions').insert({
            school_id: schoolId,
            term,
            academic_year: academicYear,
            status: 'pending',
            momo_reference: externalId,
            phone_number: phoneNumber,
            amount_paid: amount,
        });

        return new Response(JSON.stringify({
            success: true,
            reference: externalId,
            message: 'Payment request sent to your phone. Please approve it.'
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Unexpected error:', error);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
