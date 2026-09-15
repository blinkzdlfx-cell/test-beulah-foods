const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const STOREFRONT_PAGES = new Set([
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "account",
  "shop",
  "product",
  "cart",
  "checkout",
  "orders",
  "order",
  "payment-callback",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/paystack/initialize" && request.method === "POST") {
      return handlePaystackInitialize(request, env, url);
    }
    if (url.pathname === "/api/paystack/verify" && request.method === "GET") {
      return handlePaystackVerify(request, env, url);
    }
    if (url.pathname === "/api/paystack/webhook" && request.method === "POST") {
      return handlePaystackWebhook(request, env);
    }

    if (url.pathname === "/storefront/" || url.pathname === "/storefront/index.html") {
      const storefrontUrl = new URL(request.url);
      storefrontUrl.pathname = "/storefront/index.html";
      return env.ASSETS.fetch(new Request(storefrontUrl, request));
    }

    if (url.pathname.startsWith("/storefront/") && url.pathname.endsWith(".html")) {
      const filename = url.pathname.slice("/storefront/".length);
      const canonical = new URL(request.url);
      canonical.pathname = `/${filename}`;
      return Response.redirect(canonical, 301);
    }

    if (url.pathname === "/") {
      const storefrontUrl = new URL(request.url);
      storefrontUrl.pathname = "/storefront/index.html";
      return env.ASSETS.fetch(new Request(storefrontUrl, request));
    }

    if (url.pathname === "/admin") {
      const canonical = new URL(request.url);
      canonical.pathname = "/admin/";
      return Response.redirect(canonical, 301);
    }

    if (url.pathname === "/admin/") {
      const adminUrl = new URL(request.url);
      adminUrl.pathname = "/admin/index.html";
      return env.ASSETS.fetch(new Request(adminUrl, request));
    }

    const cleanPath = url.pathname.replace(/^\//, "");
    if (STOREFRONT_PAGES.has(cleanPath)) {
      const storefrontUrl = new URL(request.url);
      storefrontUrl.pathname = `/storefront/${cleanPath}.html`;
      return env.ASSETS.fetch(new Request(storefrontUrl, request));
    }

    if (
      url.pathname.endsWith(".html") &&
      !url.pathname.startsWith("/storefront/") &&
      !url.pathname.startsWith("/admin/")
    ) {
      const storefrontUrl = new URL(request.url);
      storefrontUrl.pathname = `/storefront${url.pathname}`;
      return env.ASSETS.fetch(new Request(storefrontUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};

async function handlePaystackInitialize(request, env, url) {
  const bindings = {
    supabase_url: Boolean(env.SUPABASE_URL),
    supabase_service_role_key: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    paystack_secret_key: Boolean(env.PAYSTACK_SECRET_KEY),
  };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.PAYSTACK_SECRET_KEY) {
    logPaymentEvent("initialize_not_configured", { bindings });
    return json({ error: "PAYMENT_SERVER_NOT_CONFIGURED" }, 503);
  }
  logPaymentEvent("initialize_request", { bindings });
  const auth = getBearerToken(request);
  if (!auth) return json({ error: "AUTH_REQUIRED" }, 401);

  const user = await getSupabaseUser(env, auth);
  if (!user?.id || !user.email) return json({ error: "AUTH_REQUIRED" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  const orderId = String(body?.order_id || "").trim();
  if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400);

  const orderResult = await supabaseRest(
    env,
    `/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&customer_id=eq.${encodeURIComponent(user.id)}&select=id,customer_id,total,payment_status,status`,
  );
  const order = orderResult.data?.[0];
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);
  if (order.payment_status !== "pending" || order.status !== "pending_payment")
    return json({ error: "ORDER_NOT_PAYABLE" }, 409);

  const reservationResult = await supabaseRest(
    env,
    `/rest/v1/reservations?order_id=eq.${encodeURIComponent(orderId)}&status=eq.active&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,expires_at&limit=1`,
  );
  const reservation = reservationResult.data?.[0];
  if (!reservation) return json({ error: "ORDER_RESERVATION_EXPIRED" }, 409);

  const paymentResult = await supabaseRest(
    env,
    `/rest/v1/payments?order_id=eq.${encodeURIComponent(orderId)}&provider=eq.paystack&select=id,amount,status,provider_reference&limit=1`,
  );
  const payment = paymentResult.data?.[0];
  if (!payment || payment.status !== "pending")
    return json({ error: "PAYMENT_NOT_AVAILABLE" }, 409);

  const reference = `BEULAH-${orderId}-${Date.now()}`;
  const callbackUrl = `${url.origin}/payment-callback?reference=${encodeURIComponent(reference)}`;
  const amountKobo = Math.round(Number(order.total) * 100);
  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: user.email,
      amount: String(amountKobo),
      currency: "NGN",
      reference,
      callback_url: callbackUrl,
      metadata: { order_id: order.id, customer_id: user.id },
    }),
  });
  const paystack = await safeJson(paystackResponse);
  if (!paystackResponse.ok || !paystack?.status || !paystack?.data?.authorization_url) {
    logPaymentEvent("initialize_paystack_failed", {
      order_id: order.id,
      http_status: paystackResponse.status,
      provider_message: paystack?.message || null,
    });
    return json({ error: "PAYMENT_INITIALIZATION_FAILED", detail: paystack?.message || null }, 502);
  }

  await supabaseRest(env, `/rest/v1/payments?id=eq.${encodeURIComponent(payment.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      provider_reference: paystack.data.reference,
      raw_response: paystack.data,
      updated_at: new Date().toISOString(),
    }),
  });

  logPaymentEvent("initialize_success", {
    order_id: order.id,
    paystack_http_status: paystackResponse.status,
    reservation_expires_at: reservation.expires_at,
  });
  return json({
    authorization_url: paystack.data.authorization_url,
    reference: paystack.data.reference,
    access_code: paystack.data.access_code,
    reservation_expires_at: reservation.expires_at,
  });
}

async function handlePaystackVerify(request, env, url) {
  const bindings = {
    supabase_url: Boolean(env.SUPABASE_URL),
    supabase_service_role_key: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    paystack_secret_key: Boolean(env.PAYSTACK_SECRET_KEY),
  };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.PAYSTACK_SECRET_KEY) {
    logPaymentEvent("verify_not_configured", { bindings });
    return json({ error: "PAYMENT_SERVER_NOT_CONFIGURED" }, 503);
  }
  const auth = getBearerToken(request);
  if (!auth) return json({ error: "AUTH_REQUIRED" }, 401);
  const user = await getSupabaseUser(env, auth);
  if (!user?.id) return json({ error: "AUTH_REQUIRED" }, 401);
  const reference = url.searchParams.get("reference")?.trim();
  if (!reference) return json({ error: "REFERENCE_REQUIRED" }, 400);

  const paymentResult = await supabaseRest(
    env,
    `/rest/v1/payments?provider_reference=eq.${encodeURIComponent(reference)}&provider=eq.paystack&select=id,order_id,amount,status`,
  );
  const payment = paymentResult.data?.[0];
  if (!payment) return json({ error: "PAYMENT_NOT_FOUND" }, 404);
  const orderResult = await supabaseRest(
    env,
    `/rest/v1/orders?id=eq.${encodeURIComponent(payment.order_id)}&customer_id=eq.${encodeURIComponent(user.id)}&select=id,total,status,payment_status`,
  );
  const order = orderResult.data?.[0];
  if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);

  const verifyResponse = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    },
  );
  const verified = await safeJson(verifyResponse);
  if (!verifyResponse.ok || !verified?.status) {
    logPaymentEvent("verify_paystack_failed", {
      order_id: order.id,
      http_status: verifyResponse.status,
    });
    return json({ error: "PAYMENT_VERIFICATION_FAILED" }, 502);
  }

  const transaction = verified.data;
  const providerStatus = String(transaction?.status || "").toLowerCase();
  const amountKobo = Number(transaction?.amount);
  if (!Number.isFinite(amountKobo)) return json({ error: "PAYMENT_AMOUNT_INVALID" }, 502);

  logPaymentEvent("verify_provider_status", {
    order_id: order.id,
    provider_status: providerStatus,
    http_status: verifyResponse.status,
  });
  if (providerStatus === "success") {
    const result = await finalizePayment(
      env,
      reference,
      "success",
      amountKobo,
      verified,
      transaction?.paid_at || null,
    );
    await sendOrderEmails(env, order.id, reference);
    return json({ ...result, provider_status: providerStatus, order_id: order.id });
  }

  if (providerStatus === "failed") {
    const result = await finalizePayment(
      env,
      reference,
      "failed",
      amountKobo,
      verified,
      transaction?.paid_at || null,
    );
    return json({ ...result, provider_status: providerStatus, order_id: order.id });
  }

  return json({
    order_id: order.id,
    payment_status: "pending",
    provider_status: providerStatus || "pending",
    message:
      "Payment has not been completed. Your order reservation remains active while time is available.",
  });
}

async function handlePaystackWebhook(request, env) {
  const bindings = {
    supabase_url: Boolean(env.SUPABASE_URL),
    supabase_service_role_key: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    paystack_secret_key: Boolean(env.PAYSTACK_SECRET_KEY),
  };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.PAYSTACK_SECRET_KEY) {
    logPaymentEvent("webhook_not_configured", { bindings });
    return new Response("Not configured", { status: 503 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!signature || !(await verifyHmacSha512(rawBody, env.PAYSTACK_SECRET_KEY, signature)))
    return new Response("Unauthorized", { status: 401 });

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (event?.event !== "charge.success" && event?.event !== "charge.failed")
    return new Response("OK", { status: 200 });

  const transaction = event.data || {};
  const reference = String(transaction.reference || "");
  if (!reference) return new Response("OK", { status: 200 });
  const status = event.event === "charge.success" ? "success" : "failed";
  logPaymentEvent("webhook_event", { event: event.event, reference_present: Boolean(reference) });
  try {
    const result = await finalizePayment(
      env,
      reference,
      status,
      Number(transaction.amount),
      event,
      transaction.paid_at || null,
    );
    if (status === "success" && result?.order_id)
      await sendOrderEmails(env, result.order_id, reference);
  } catch (error) {
    console.error("Paystack webhook processing failed", error);
    return new Response("Retry", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}

async function finalizePayment(env, reference, status, amountKobo, rawResponse, paidAt) {
  const response = await supabaseRpc(env, "finalize_paystack_payment", {
    target_reference: reference,
    target_status: status,
    target_amount_kobo: Math.round(amountKobo),
    target_raw_response: rawResponse,
    target_paid_at: paidAt,
  });
  if (!response.ok) {
    const detail = response.data;
    throw new Error(detail?.message || "Payment finalization failed");
  }
  logPaymentEvent("payment_finalized", {
    status,
    reference_present: Boolean(reference),
    amount_kobo: Math.round(amountKobo),
  });
  return response.data;
}

async function sendOrderEmails(env, orderId, reference) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return;
  const orderResult = await supabaseRest(
    env,
    `/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=id,total,subtotal,fees,delivery_fee,discount_amount,promo_code,delivery_name,delivery_address,created_at`,
  );
  const order = orderResult.data?.[0];
  if (!order) return;
  const userIdResult = await supabaseRest(
    env,
    `/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=customer_id`,
  );
  const customerId = userIdResult.data?.[0]?.customer_id;
  if (!customerId) return;
  const userResponse = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(customerId)}`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  const authUser = await safeJson(userResponse);
  const customerEmail = authUser?.email;
  if (!customerEmail) return;

  const itemsResult = await supabaseRest(
    env,
    `/rest/v1/order_items?order_id=eq.${encodeURIComponent(orderId)}&select=product_name,quantity,line_total&order=id.asc`,
  );
  const itemsHtml = (itemsResult.data || [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.product_name)} × ${item.quantity} — ${formatNaira(item.line_total)}</li>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Beulah Foods — Order confirmed</h2><p>Order <strong>${escapeHtml(order.id.slice(0, 8))}</strong> has been paid successfully.</p><ul>${itemsHtml}</ul><p>Subtotal: ${formatNaira(order.subtotal)}<br>Delivery: ${formatNaira(order.delivery_fee)}<br>Discount: ${formatNaira(order.discount_amount)}<br><strong>Total: ${formatNaira(order.total)}</strong></p><p>Delivery to: ${escapeHtml(order.delivery_address)}</p><p>Paystack reference: ${escapeHtml(reference)}</p></div>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `order-confirmation/${reference}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [customerEmail],
      subject: `Beulah Foods order ${order.id.slice(0, 8)} confirmed`,
      html,
    }),
  });
  if (env.ORDER_NOTIFICATION_EMAIL) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `admin-order/${reference}`,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [env.ORDER_NOTIFICATION_EMAIL],
        subject: `New Beulah Foods order ${order.id.slice(0, 8)}`,
        html,
      }),
    });
  }
}

async function getSupabaseUser(env, accessToken) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return safeJson(response);
}

async function supabaseRest(env, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${env.SUPABASE_URL}${path}`, { ...options, headers });
  return { ok: response.ok, status: response.status, data: await safeJson(response) };
}

async function supabaseRpc(env, functionName, body) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: await safeJson(response) };
}

async function verifyHmacSha512(payload, secret, expectedHex) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const actual = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return actual.length === expectedHex.length && timingSafeEqual(actual, expectedHex.toLowerCase());
}

function timingSafeEqual(a, b) {
  let result = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1)
    result |= (a.charCodeAt(i % a.length) || 0) ^ (b.charCodeAt(i % b.length) || 0);
  return result === 0;
}
function getBearerToken(request) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function formatNaira(value) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>\"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
  );
}
function logPaymentEvent(event, details = {}) {
  console.log(
    JSON.stringify({ scope: "payment", event, timestamp: new Date().toISOString(), ...details }),
  );
}
