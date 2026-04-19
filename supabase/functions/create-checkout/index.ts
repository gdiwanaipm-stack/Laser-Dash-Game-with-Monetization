import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseAuth = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated user — derive userId from the JWT, never trust the body
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(authHeader);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { priceId, returnUrl, environment } = await req.json();
    if (!priceId || typeof priceId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(priceId)) {
      return new Response(JSON.stringify({ error: "Invalid priceId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = (environment || 'sandbox') as StripeEnv;
    const stripe = createStripeClient(env);

    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) {
      return new Response(JSON.stringify({ error: "Price not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripePrice = prices.data[0];

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: "payment",
      ui_mode: "embedded",
      return_url: returnUrl || `${req.headers.get("origin")}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      customer_email: user.email ?? undefined,
      metadata: { userId: user.id, product: 'level_3_unlock' },
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error("create-checkout error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
