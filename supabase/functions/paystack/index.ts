import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const STOREFRONT_URL = Deno.env.get("STOREFRONT_URL") || "https://beulah-foods.blinkzdlfx.workers.dev";
const corsHeaders = { "Access-Control-Allow-Origin": STOREFRONT_URL, "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", ...corsHeaders };
const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/functions\/v1\/paystack\/?/, "").replace(/^\/+/, "");
  try {
    if (route === "initialize" && request.method === "POST") return await initialize(request);
    if (route === "verify" && request.method === "GET") return await verify(request, url);
    if (route === "webhook" && request.method === "POST") return await webhook(request);
    return json({ error: "NOT_FOUND" }, 404);
  } catch (error) {
    if (error instanceof ResponseError) return json({ error: error.message }, error.status);
    console.error("paystack function error", error);
    return json({ error: "PAYMENT_SERVER_ERROR" }, 500);
  }
});

async function initialize(request: Request) {
  if (!PAYSTACK_SECRET_KEY) return json({ error: "PAYMENT_SERVER_NOT_CONFIGURED" }, 503);
  const user = await requireUser(request);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400);

  const { data: order, error: orderError } = await adminClient.from("orders").select("id,customer_id,total,payment_status,status").eq("id", orderId).eq("customer_id", user.id).maybeSingle();
  if (orderError) throw orderError;
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);
  if (order.payment_status !== "pending" || order.status !== "pending_payment") return json({ error: "ORDER_NOT_PAYABLE" }, 409);

  const now = new Date().toISOString();
  const { data: reservation, error: reservationError } = await adminClient.from("reservations").select("id,expires_at").eq("order_id", orderId).eq("status", "active").gt("expires_at", now).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (reservationError) throw reservationError;
  if (!reservation) return json({ error: "ORDER_RESERVATION_EXPIRED" }, 409);

  const { data: payment, error: paymentError } = await adminClient.from("payments").select("id,amount,status,provider_reference,raw_response,attempt_number").eq("order_id", orderId).eq("provider", "paystack").eq("status", "pending").order("attempt_number", { ascending: false }).limit(1).maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) return json({ error: "PAYMENT_NOT_AVAILABLE" }, 409);

  if (payment.provider_reference && payment.raw_response?.authorization_url) {
    return json({ authorization_url: payment.raw_response.authorization_url, reference: payment.provider_reference, access_code: payment.raw_response.access_code || null, reservation_expires_at: reservation.expires_at, payment_attempt_number: payment.attempt_number });
  }

  const reference = `BEULAH-${orderId}-${Date.now()}`;
  const callbackUrl = `${STOREFRONT_URL.replace(/\/$/, "")}/payment-callback?reference=${encodeURIComponent(reference)}`;
  const amountKobo = Math.round(Number(order.total) * 100);
  if (!Number.isFinite(amountKobo) || amountKobo <= 0) return json({ error: "PAYMENT_AMOUNT_INVALID" }, 409);

  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, amount: String(amountKobo), currency: "NGN", reference, callback_url: callbackUrl, metadata: { order_id: order.id, customer_id: user.id } }) });
  const paystack = await safeJson(paystackResponse);
  if (!paystackResponse.ok || !paystack?.status || !paystack?.data?.authorization_url) return json({ error: "PAYMENT_INITIALIZATION_FAILED", detail: paystack?.message || null }, 502);

  const { error: updateError } = await adminClient.from("payments").update({ provider_reference: paystack.data.reference, raw_response: paystack.data, updated_at: new Date().toISOString() }).eq("id", payment.id).eq("status", "pending");
  if (updateError) throw updateError;
  return json({ authorization_url: paystack.data.authorization_url, reference: paystack.data.reference, access_code: paystack.data.access_code, reservation_expires_at: reservation.expires_at, payment_attempt_number: payment.attempt_number });
}

async function verify(request: Request, url: URL) {
  if (!PAYSTACK_SECRET_KEY) return json({ error: "PAYMENT_SERVER_NOT_CONFIGURED" }, 503);
  const user = await requireUser(request);
  const reference = url.searchParams.get("reference")?.trim();
  if (!reference) return json({ error: "REFERENCE_REQUIRED" }, 400);

  const { data: payment, error: paymentError } = await adminClient.from("payments").select("id,order_id,amount,status,provider_reference").eq("provider_reference", reference).eq("provider", "paystack").maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) return json({ error: "PAYMENT_NOT_FOUND" }, 404);

  const { data: order, error: orderError } = await adminClient.from("orders").select("id,order_number,customer_id,total,status,payment_status").eq("id", payment.order_id).eq("customer_id", user.id).maybeSingle();
  if (orderError) throw orderError;
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);

  const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } });
  const verified = await safeJson(verifyResponse);
  if (!verifyResponse.ok || !verified?.status) return json({ error: "PAYMENT_VERIFICATION_FAILED" }, 502);
  const transaction = verified.data || {};
  const providerStatus = String(transaction.status || "").toLowerCase();
  const amountKobo = Number(transaction.amount);
  if (!Number.isFinite(amountKobo)) return json({ error: "PAYMENT_AMOUNT_INVALID" }, 502);

  if (providerStatus === "success" || providerStatus === "failed") {
    const result = await finalizePayment(reference, providerStatus, amountKobo, verified, transaction.paid_at || null);
    return json({ ...result, provider_status: providerStatus, order_id: order.id, order_number: order.order_number });
  }
  return json({ order_id: order.id, payment_status: "pending", provider_status: providerStatus || "pending", message: "Payment has not been completed. Your order reservation remains active while time is available." });
}

async function webhook(request: Request) {
  if (!PAYSTACK_SECRET_KEY) return new Response("Not configured", { status: 503 });
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!signature || !(await verifyHmacSha512(rawBody, PAYSTACK_SECRET_KEY, signature))) return new Response("Unauthorized", { status: 401 });
  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new Response("Bad request", { status: 400 }); }
  if (event?.event !== "charge.success" && event?.event !== "charge.failed") return new Response("OK", { status: 200 });
  const transaction = event.data || {};
  const reference = String(transaction.reference || "");
  if (!reference) return new Response("OK", { status: 200 });
  const providerStatus = event.event === "charge.success" ? "success" : "failed";
  try { await finalizePayment(reference, providerStatus, Number(transaction.amount), event, transaction.paid_at || null); }
  catch (error) { console.error("Paystack webhook finalization failed", error); return new Response("Retry", { status: 500 }); }
  return new Response("OK", { status: 200 });
}

async function finalizePayment(reference: string, status: string, amountKobo: number, rawResponse: unknown, paidAt: string | null) {
  const { data, error } = await adminClient.rpc("finalize_paystack_payment", { target_reference: reference, target_status: status, target_amount_kobo: Math.round(amountKobo), target_raw_response: rawResponse, target_paid_at: paidAt });
  if (error) throw error;
  return data;
}

async function requireUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ResponseError("AUTH_REQUIRED", 401);
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user?.id) throw new ResponseError("AUTH_REQUIRED", 401);
  return data.user;
}

async function verifyHmacSha512(payload: string, secret: string, signature: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = [...new Uint8Array(signed)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}
function timingSafeEqual(a: string, b: string) { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; }
async function safeJson(response: Response) { try { return await response.json(); } catch { return null; } }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: jsonHeaders }); }
class ResponseError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
