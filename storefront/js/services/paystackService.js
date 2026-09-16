import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabaseClient.js";

const PAYSTACK_FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/paystack`;

async function callPaystack(route, { method = "GET", body = null, query = null } = {}) {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    const error = new Error("AUTH_REQUIRED");
    error.code = "AUTH_REQUIRED";
    throw error;
  }

  const url = new URL(`${PAYSTACK_FUNCTION_BASE}/${route}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  };
  if (body !== null) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || "PAYMENT_REQUEST_FAILED");
    error.code = payload?.error || "PAYMENT_REQUEST_FAILED";
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

export function initializePaystackPayment(orderId) {
  return callPaystack("initialize", {
    method: "POST",
    body: { order_id: orderId },
  });
}

export function verifyPaystackPayment(reference) {
  return callPaystack("verify", {
    method: "GET",
    query: { reference },
  });
}
