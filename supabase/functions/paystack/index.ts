import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const STOREFRONT_URL = (Deno.env.get("STOREFRONT_URL") || "https://test-beulah-foods.blinkzdlfx.workers.dev").replace(/\/$/, "");
const VERSION = "paystack-v2";

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
  const route = url.pathname.replace(/^\/functions\/v1\/paystack\/?/, "").replace(/^\/+/, "");

  try {
    if (route === "health" && request.method === "GET") return health();
    if (route === "initialize" && request.method === "POST") return await initialize(request);
    if (route === "verify" && request.method === "GET") return await verify(request, url);
    if (route === "webhook" && request.method === "POST") return await webhook(request);
    return json({ error: "NOT_FOUND", version: VERSION }, 404);
  } catch (error) {
    console.error("paystack function error", error);
    if (error instanceof ResponseError) return json({ error: error.message }, error.status);
    return json({ error: "PAYMENT_SERVER_ERROR", version: VERSION }, 500);
  }
});

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
  if (!PAYSTACK_SECRET_KEY) return json({ error: "PAYMENT_SERVER_NOT_CONFIGURED", version: VERSION }, 503);

  const user = await requireUser(request);
  const body = await readJson(request);
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400);
  if (!user.email) return json({ error: "CUSTOMER_EMAIL_REQUIRED" }, 409);

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id,order_number,customer_id,total,payment_status,status")
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (orderError) throw databaseError(orderError, "ORDER_LOOKUP_FAILED");
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);
  if (order.payment_status !== "pending" || order.status !== "pending_payment") {
    return json({ error: "ORDER_NOT_PAYABLE" }, 409);
  }

  const { data: reservation, error: reservationError } = await adminClient
    .from("reservations")
    .select("id,expires_at,status")
    .eq("order_id", orderId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reservationError) throw databaseError(reservationError, "RESERVATION_LOOKUP_FAILED");
  if (!reservation) return json({ error: "ORDER_RESERVATION_EXPIRED" }, 409);

  const { data: payment, error: paymentError } = await adminClient
    .from("payments")
    .select("id,amount,status,provider_reference,raw_response,attempt_number")
    .eq("order_id", orderId)
    .eq("provider", "paystack")
    .eq("status", "pending")
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) throw databaseError(paymentError, "PAYMENT_LOOKUP_FAILED");
  if (!payment) return json({ error: "PAYMENT_NOT_AVAILABLE" }, 409);

  const existingAuthorization = extractAuthorization(payment.raw_response);
  if (payment.provider_reference && existingAuthorization) {
    return json({
      authorization_url: existingAuthorization.authorization_url,
      access_code: existingAuthorization.access_code,
      reference: payment.provider_reference,
      reservation_expires_at: reservation.expires_at,
      payment_attempt_number: payment.attempt_number,
      reused: true,
      version: VERSION,
    });
  }

  if (payment.provider_reference && !existingAuthorization) {
    return json({
      error: "PAYMENT_ATTEMPT_REQUIRES_RETRY",
      message: "This payment attempt already has a provider reference but no usable checkout URL. Start a fresh payment attempt.",
      version: VERSION,
    }, 409);
  }

  const amountKobo = toKobo(order.total);
  if (amountKobo === null) return json({ error: "PAYMENT_AMOUNT_INVALID" }, 409);

  const reference = `BEULAH-${orderId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const callbackUrl = `${STOREFRONT_URL}/payment-callback?reference=${encodeURIComponent(reference)}`;

  let paystackResponse: Response;
  try {
    paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: String(amountKobo),
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          customer_id: user.id,
          payment_attempt_number: payment.attempt_number,
        },
      }),
    });
  } catch (error) {
    console.error("Paystack initialize network error", { reference, order_id: order.id, error });
    return json({ error: "PAYSTACK_NETWORK_ERROR", reference, version: VERSION }, 502);
  }

  const provider = await safeJson(paystackResponse);
  if (!paystackResponse.ok || !provider?.status || !provider?.data?.authorization_url) {
    console.error("Paystack initialize rejected", {
      reference,
      order_id: order.id,
      http_status: paystackResponse.status,
      provider_message: provider?.message || null,
    });
    return json({
      error: "PAYMENT_INITIALIZATION_FAILED",
      reference,
      provider_message: provider?.message || null,
      provider_status: provider?.status ?? null,
      http_status: paystackResponse.status,
      version: VERSION,
    }, 502);
  }

  const providerReference = String(provider.data.reference || reference);
  const rawResponse = provider.data;
  const { error: updateError } = await adminClient
    .from("payments")
    .update({
      provider_reference: providerReference,
      raw_response: rawResponse,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("status", "pending");
  if (updateError) {
    console.error("Payment reference persistence failed", { payment_id: payment.id, reference: providerReference, error: updateError });
    return json({ error: "PAYMENT_REFERENCE_PERSISTENCE_FAILED", reference: providerReference, version: VERSION }, 500);
  }

  return json({
    authorization_url: provider.data.authorization_url,
    access_code: provider.data.access_code || null,
    reference: providerReference,
    reservation_expires_at: reservation.expires_at,
    payment_attempt_number: payment.attempt_number,
    reused: false,
    version: VERSION,
  });
}

async function verify(request: Request, url: URL) {
  if (!PAYSTACK_SECRET_KEY) return json({ error: "PAYMENT_SERVER_NOT_CONFIGURED", version: VERSION }, 503);

  const user = await requireUser(request);
  const reference = url.searchParams.get("reference")?.trim();
  if (!reference) return json({ error: "REFERENCE_REQUIRED" }, 400);

  const { data: payment, error: paymentError } = await adminClient
    .from("payments")
    .select("id,order_id,amount,status,provider_reference,attempt_number")
    .eq("provider_reference", reference)
    .eq("provider", "paystack")
    .maybeSingle();
  if (paymentError) throw databaseError(paymentError, "PAYMENT_LOOKUP_FAILED");
  if (!payment) return json({ error: "PAYMENT_NOT_FOUND" }, 404);

  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id,order_number,customer_id,total,status,payment_status")
    .eq("id", payment.order_id)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (orderError) throw databaseError(orderError, "ORDER_LOOKUP_FAILED");
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);

  const verified = await verifyWithPaystack(reference);
  if (!verified.ok) return json({ error: "PAYMENT_VERIFICATION_FAILED", reference, version: VERSION }, 502);

  const transaction = verified.data || {};
  const providerStatus = String(transaction.status || "").toLowerCase();
  const amountKobo = Number(transaction.amount);
  if (!Number.isFinite(amountKobo) || amountKobo < 0) return json({ error: "PAYMENT_AMOUNT_INVALID", reference, version: VERSION }, 502);

  if (providerStatus === "success" || providerStatus === "failed") {
    const result = await finalizePayment(reference, providerStatus, amountKobo, verified.raw, transaction.paid_at || null);
    return json({ ...normalizeFinalization(result), provider_status: providerStatus, order_id: order.id, order_number: order.order_number, reference, version: VERSION });
  }

  return json({
    order_id: order.id,
    order_number: order.order_number,
    payment_status: "pending",
    provider_status: providerStatus || "pending",
    reference,
    version: VERSION,
  });
}

async function webhook(request: Request) {
  if (!PAYSTACK_SECRET_KEY) return new Response("Not configured", { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!signature || !(await verifyHmacSha512(rawBody, PAYSTACK_SECRET_KEY, signature))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const eventName = String(event?.event || "");
  if (eventName !== "charge.success" && eventName !== "charge.failed") {
    return new Response("OK", { status: 200 });
  }

  const transaction = (event.data || {}) as Record<string, unknown>;
  const reference = String(transaction.reference || "").trim();
  if (!reference) return new Response("OK", { status: 200 });

  const providerStatus = eventName === "charge.success" ? "success" : "failed";
  const amountKobo = Number(transaction.amount);
  if (!Number.isFinite(amountKobo)) return new Response("Bad request", { status: 400 });

  try {
    await finalizePayment(reference, providerStatus, amountKobo, event, String(transaction.paid_at || "") || null);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Paystack webhook finalization failed", { reference, event: eventName, error });
    return new Response("Retry", { status: 500 });
  }
}

async function finalizePayment(reference: string, status: string, amountKobo: number, rawResponse: unknown, paidAt: string | null) {
  const { data, error } = await adminClient.rpc("finalize_paystack_payment", {
    target_reference: reference,
    target_status: status,
    target_amount_kobo: Math.round(amountKobo),
    target_raw_response: rawResponse,
    target_paid_at: paidAt,
  });
  if (error) {
    console.error("Payment finalization RPC failed", { reference, status, error });
    throw new Error("PAYMENT_FINALIZATION_FAILED");
  }
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

async function verifyWithPaystack(reference: string) {
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const raw = await safeJson(response);
    return { ok: response.ok && Boolean(raw?.status), data: raw?.data || null, raw };
  } catch (error) {
    console.error("Paystack verify network error", { reference, error });
    return { ok: false, data: null, raw: null };
  }
}

async function verifyHmacSha512(payload: string, secret: string, signature: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index++) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function extractAuthorization(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== "object") return null;
  const value = rawResponse as Record<string, unknown>;
  const authorizationUrl = typeof value.authorization_url === "string" ? value.authorization_url : null;
  if (!authorizationUrl) return null;
  return {
    authorization_url: authorizationUrl,
    access_code: typeof value.access_code === "string" ? value.access_code : null,
  };
}

function toKobo(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const kobo = Math.round(amount * 100);
  return Number.isSafeInteger(kobo) && kobo > 0 ? kobo : null;
}

async function readJson(request: Request) {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    throw new ResponseError("INVALID_JSON", 400);
  }
}

function databaseError(error: unknown, code: string) {
  console.error(code, error);
  return new ResponseError(code, 500);
}

function normalizeFinalization(value: unknown) {
  if (value && typeof value === "object") return value;
  return { payment_status: "unknown" };
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

class ResponseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
