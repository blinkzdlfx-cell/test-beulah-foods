import { supabase } from "../lib/supabaseClient.js";
import { getCurrentSession } from "./authService.js";

const CHECKOUT_ORDER_KEY = "beulah_checkout_order";

function getRememberedOrderId() {
  try {
    const value = JSON.parse(localStorage.getItem(CHECKOUT_ORDER_KEY) || "null");
    return value?.orderId ? String(value.orderId) : null;
  } catch {
    return null;
  }
}

async function refreshExpiredReservation() {
  const session = await getCurrentSession();
  const orderId = getRememberedOrderId();
  if (!session?.user?.id || !orderId) return;

  const { data, error } = await supabase.rpc("expire_customer_reservation", {
    target_order_id: orderId,
  });
  if (error) {
    console.error("Reservation expiry refresh failed:", error);
    return;
  }

  // Re-run checkout's normal database hydration/render path. The browser does
  // not invent a state transition; it only asks the backend for authoritative state.
  if (data?.status === "expired" || data?.status === "cancelled") {
    window.location.reload();
  }
}

function observeCountdown() {
  const countdown = document.getElementById("checkout-reservation-countdown");
  if (!countdown) return;

  let requested = false;
  const observer = new MutationObserver(() => {
    if (countdown.textContent?.trim() !== "Expired" || requested) return;
    requested = true;
    void refreshExpiredReservation();
  });
  observer.observe(countdown, { childList: true, characterData: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeCountdown, { once: true });
} else {
  observeCountdown();
}
