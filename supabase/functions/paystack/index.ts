import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const STOREFRONT_URL = (Deno.env.get("STOREFRONT_URL") || "https://test-beulah-foods.blinkzdlfx.workers.dev").replace(/\/$/, "");
const VERSION = "paystack-v3";

const corsHeaders = {
  "Access-Control-Allow-Origin": STOREFRONT_URL,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", ...corsHeaders };

const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(request.url);
  const route = getRoute(url.pathname);

  try {
    if (route === "health" && request.method === "GET") return health();
    if (route === "initialize" && request.method === "POST") return await initialize(request);
    if (route === "verify" && request.method === "GET") return await verify(request, url);
    if (route === "webhook" && request.method === "POST") return await webhook(request);
    return json({ error: "NOT_FOUND", version: VERSION, route }, 404);
  } catch (error) {
    console.error("paystack function error", error);
    if (error instanceof ResponseError) return json({ error: error.message }, error.status);
    return json({ error: "PAYMENT_SERVER_ERROR", version: VERSION }, 500);
  }
});

function getRoute(pathname: string) {
  const path = pathname.replace(/^\/+|\/+$/g, "");
  const marker = "/paystack/";
  const markerIndex = path.indexOf(marker);
  if (markerIndex >= 0) return path.slice(markerIndex + marker.length).split("/")[0];
  if (path === "paystack") return "";
  return path.split("/").pop() || "";
}

function health() {
  return json({
    ok: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && PAYSTACK_SECRET_KEY),
    version: VERSION,
    configuration: {
      supabase_url: Boolean(SUPABASE_URL),
      supabase_anon_key: Boolean(SUPABASE_ANON_KEY),
      supabase_service_role_key: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      paystack_secret_key: Boolean(PAYSTACK_SECRET_KEY),
      storefront_url: STOREFRONT_URL,
    },
  });
}

async function initialize(request: Request) {
  requireConfigured();
  const user = await requireUser(request);
  const body = await readJson(request);
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400);
  if (!user.email) return json({ error: "CUSTOMER_EMAIL_REQUIRED" }, 409);

  const { data: order, error: orderError } = await adminClient.from("orders").select("id,order_number,customer_id,total,payment_status,status").eq("id", orderId).eq("customer_id", user.id).maybeSingle();
  if (orderError) throw databaseError(orderError, "ORDER_LOOKUP_FAILED");
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);
  if (order.payment_status !== "pending" || order.status !== "pending_payment") return json({ error: "ORDER_NOT_PAYABLE" }, 409);

  const { data: reservation, error: reservationError } = await adminClient.from("reservations").select("id,expires_at,status").eq("order_id", orderId).eq("status", "active").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (reservationError) throw databaseError(reservationError, "RESERVATION_LOOKUP_FAILED");
  if (!reservation) return json({ error: "RESERVATION_EXPIRED" }, 409);

  const { data: payment, error: paymentError } = await adminClient.from("payments").select("id,attempt_number,provider,provider_reference,status,raw_response,amount").eq("order_id", orderId).eq("provider", "paystack").eq("status", "pending").order("attempt_number", { ascending: false }).limit(1).maybeSingle();
  if (paymentError) throw databaseError(paymentError, "PAYMENT_LOOKUP_FAILED");
  if (!payment) return json({ error: "PAYMENT_ATTEMPT_NOT_FOUND" }, 409);

  const raw = isRecord(payment.raw_response) ? payment.raw_response : {};
  const storedAuthorizationUrl = typeof raw.authorization_url === "string" ? raw.authorization_url : "";
  if (payment.provider_reference && storedAuthorizationUrl) return json({ authorization_url: storedAuthorizationUrl, reference: payment.provider_reference, reused: true, version: VERSION });
  if (payment.provider_reference && !storedAuthorizationUrl) return json({ error: "PAYMENT_ATTEMPT_AMBIGUOUS" }, 409);

  const amountNaira = Number(order.total);
  const amountKobo = Math.round(amountNaira * 100);
  if (!Number.isFinite(amountNaira) || amountNaira <= 0 || !Number.isInteger(amountKobo) || amountKobo <= 0) return json({ error: "INVALID_ORDER_AMOUNT" }, 422);

  const reference = `BEULAH-${orderId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const callbackUrl = `${STOREFRONT_URL}/payment-callback`;
  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", { method: "POST", headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, amount: amountKobo, reference, callback_url: callbackUrl, metadata: { order_id: order.id, order_number: order.order_number, payment_id: payment.id, attempt_number: payment.attempt_number } }) });
  const providerData = await safeJson(paystackResponse);
  if (!paystackResponse.ok || providerData?.status !== true || !providerData?.data?.authorization_url) {
    console.error("Paystack initialize failed", paystackResponse.status, providerData);
    return json({ error: "PAYMENT_PROVIDER_INITIALIZATION_FAILED", message: safeProviderMessage(providerData) }, 502);
  }

  const { error: updateError } = await adminClient.from("payments").update({ provider_reference: reference, amount: amountNaira, raw_response: { ...providerData, authorization_url: providerData.data.authorization_url, access_code: providerData.data.access_code || null } }).eq("id", payment.id).eq("status", "pending");
  if (updateError) throw databaseError(updateError, "PAYMENT_ATTEMPT_UPDATE_FAILED");

  return json({ authorization_url: providerData.data.authorization_url, access_code: providerData.data.access_code || null, reference, version: VERSION });
}

async function verify(request: Request, url: URL) {
  requireConfigured();
  const user = await requireUser(request);
  const reference = String(url.searchParams.get("reference") || url.searchParams.get("trxref") || "").trim();
  if (!reference) return json({ error: "REFERENCE_REQUIRED" }, 400);

  const { data: payment, error: paymentError } = await adminClient.from("payments").select("id,order_id,provider_reference,status,amount").eq("provider", "paystack").eq("provider_reference", reference).maybeSingle();
  if (paymentError) throw databaseError(paymentError, "PAYMENT_LOOKUP_FAILED");
  if (!payment) return json({ error: "PAYMENT_NOT_FOUND" }, 404);

  const { data: order, error: orderError } = await adminClient.from("orders").select("id,order_number,customer_id,total").eq("id", payment.order_id).maybeSingle();
  if (orderError) throw databaseError(orderError, "ORDER_LOOKUP_FAILED");
  if (!order || order.customer_id !== user.id) return json({ error: "ORDER_NOT_FOUND" }, 404);

  const providerResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } });
  const providerData = await safeJson(providerResponse);
  if (!providerResponse.ok || providerData?.status !== true) {
    console.error("Paystack verify failed", providerResponse.status, providerData);
    return json({ error: "PAYMENT_PROVIDER_VERIFICATION_FAILED", message: safeProviderMessage(providerData) }, 502);
  }

  const transaction = providerData.data || {};
  const transactionStatus = String(transaction.status || "").toLowerCase();
  const expectedAmount = Math.round(Number(order.total) * 100);
  const paidAmount = Number(transaction.amount);

  if (transactionStatus === "success") {
    if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) return json({ error: "PAYMENT_AMOUNT_MISMATCH", expected_amount_kobo: expectedAmount, paid_amount_kobo: paidAmount }, 409);
    const { data: finalized, error: finalizeError } = await adminClient.rpc("finalize_paystack_payment", { target_reference: reference, target_status: "success", target_amount_kobo: paidAmount, target_raw_response: providerData, target_paid_at: transaction.paid_at || new Date().toISOString() });
    if (finalizeError) {
      console.error("PAYMENT_FINALIZATION_FAILED", { code: finalizeError.code, message: finalizeError.message, details: finalizeError.details, hint: finalizeError.hint, reference });
      return json({ error: "PAYMENT_FINALIZATION_FAILED" }, 500);
    }
    return json({ ok: true, paid: true, reference, order_id: order.id, order_number: order.order_number, transaction, finalization: finalized, version: VERSION });
  }

  const nonTerminalStatuses = new Set(["pending", "ongoing", "processing", "queued"]);
  if (nonTerminalStatuses.has(transactionStatus)) return json({ ok: true, paid: false, pending: true, reference, order_id: order.id, order_number: order.order_number, transaction_status: transactionStatus, transaction, version: VERSION });

  const terminalFailureStatuses = new Set(["failed", "abandoned", "reversed", "timeout"]);
  if (terminalFailureStatuses.has(transactionStatus)) {
    const { data: finalized, error: finalizeError } = await adminClient.rpc("finalize_paystack_payment", { target_reference: reference, target_status: "failed", target_amount_kobo: Number.isFinite(paidAmount) ? paidAmount : expectedAmount, target_raw_response: providerData, target_paid_at: transaction.paid_at || new Date().toISOString() });
    if (finalizeError) {
      console.error("PAYMENT_FAILURE_FINALIZATION_FAILED", finalizeError);
      return json({ error: "PAYMENT_FINALIZATION_FAILED" }, 500);
    }
    return json({ ok: true, paid: false, reference, order_id: order.id, order_number: order.order_number, transaction, finalization: finalized, version: VERSION });
  }

  return json({ ok: true, paid: false, reference, order_id: order.id, order_number: order.order_number, transaction, version: VERSION });
}

async function webhook(request: Request) {
  requireConfigured();
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";
  if (!signature || !(await verifySignature(rawBody, signature, PAYSTACK_SECRET_KEY))) return json({ error: "INVALID_WEBHOOK_SIGNATURE" }, 401);
  const event = parseJson(rawBody);
  if (!event || typeof event !== "object") return json({ error: "INVALID_WEBHOOK_PAYLOAD" }, 400);
  const eventName = String(event.event || "");
  if (eventName !== "charge.success" && eventName !== "charge.failed") return json({ received: true, ignored: true, event: eventName, version: VERSION });
  const reference = String(event?.data?.reference || "").trim();
  const amount = Number(event?.data?.amount);
  if (!reference) return json({ error: "WEBHOOK_REFERENCE_REQUIRED" }, 400);
  const { data: finalized, error: finalizeError } = await adminClient.rpc("finalize_paystack_payment", { target_reference: reference, target_status: eventName === "charge.success" ? "success" : "failed", target_amount_kobo: Number.isFinite(amount) ? amount : 0, target_raw_response: event, target_paid_at: event?.data?.paid_at || new Date().toISOString() });
  if (finalizeError) {
    console.error("Paystack webhook finalization failed", finalizeError);
    return json({ error: "PAYMENT_FINALIZATION_FAILED" }, 500);
  }
  return json({ received: true, reference, finalization: finalized, version: VERSION });
}

function requireConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PAYSTACK_SECRET_KEY) throw new ResponseError("PAYMENT_SERVER_NOT_CONFIGURED", 503);
}

async function requireUser(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new ResponseError("AUTH_REQUIRED", 401);
  const token = authorization.slice(7).trim();
  if (!token) throw new ResponseError("AUTH_REQUIRED", 401);
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new ResponseError("AUTH_INVALID", 401);
  return data.user;
}

async function verifySignature(payload: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

function timingSafeEqual(a: string, b: string) { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; }
async function readJson(request: Request) { try { return await request.json(); } catch { throw new ResponseError("INVALID_JSON", 400); } }
async function safeJson(response: Response) { try { return await response.json(); } catch { return null; } }
function parseJson(value: string) { try { return JSON.parse(value); } catch { return null; } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeProviderMessage(value: any) { const message = typeof value?.message === "string" ? value.message : "Payment provider request failed"; return message.slice(0, 200); }
function databaseError(error: any, fallback: string) { console.error(fallback, error); return new ResponseError(fallback, 500); }
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
class ResponseError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
