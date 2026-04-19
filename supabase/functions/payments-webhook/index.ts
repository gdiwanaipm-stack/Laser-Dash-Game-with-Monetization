import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { type StripeEnv, verifyWebhook } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const env = (url.searchParams.get('env') || 'sandbox') as StripeEnv;

  let event: { type: string; data: { object: any } };
  try {
    event = await verifyWebhook(req, env);
  } catch (e) {
    console.error("Webhook signature verification failed:", e);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log("Received event:", event.type, "env:", env);

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const product = session.metadata?.product || 'level_3_unlock';
        if (!userId) {
          console.warn("Checkout completed without userId in metadata:", session.id);
          break;
        }

        await supabase.from("orders").upsert({
          user_id: userId,
          stripe_session_id: session.id,
          stripe_customer_id: session.customer || null,
          product_id: product,
          amount: session.amount_total,
          currency: session.currency,
          status: 'paid',
          environment: env,
        }, { onConflict: 'stripe_session_id' });

        await supabase.from("game_unlocks").upsert({
          user_id: userId,
          product,
          environment: env,
          stripe_session_id: session.id,
        }, { onConflict: 'user_id,product,environment' });
        break;
      }
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed": {
        const obj = event.data.object;
        const sessionId = obj.id;
        await supabase.from("orders")
          .update({ status: 'failed' })
          .eq('stripe_session_id', sessionId)
          .eq('environment', env);
        break;
      }
      default:
        console.log("Unhandled event:", event.type);
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
    // Still return 200 — we've verified the signature, errors get logged
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
