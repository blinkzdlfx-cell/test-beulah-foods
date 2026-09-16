import { getCurrentSession } from "../services/authService.js";
import { removeCartItems } from "../services/cartService.js";
import { verifyPaystackPayment } from "../services/paystackService.js";
import { supabase } from "../lib/supabaseClient.js";

const title = document.getElementById("payment-title");
const message = document.getElementById("payment-message");
const status = document.getElementById("payment-status");
const reference = new URLSearchParams(window.location.search).get("reference");
const CHECKOUT_ORDER_KEY = "beulah_checkout_order";

function show(text, type = "") {
  status.textContent = text;
  status.className = `alert${type ? ` alert-${type}` : ""}`;
}

function clearRememberedCheckoutOrder() {
  localStorage.removeItem(CHECKOUT_ORDER_KEY);
}

async function removePaidItems(orderId) {
  const { data: items, error } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId);
  if (error) throw error;
  removeCartItems((items || []).map((item) => item.product_id).filter(Boolean));
}

async function getOrderNumber(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data?.order_number || `Order ${String(orderId).slice(0, 8)}`;
}

async function init() {
  if (!reference) {
    title.textContent = "Payment reference missing";
    message.textContent = "We could not verify this payment.";
    show("No payment reference was supplied.", "error");
    return;
  }

  const session = await getCurrentSession();
  if (!session?.access_token) {
    title.textContent = "Sign in required";
    message.textContent = "Sign in to verify and view this order.";
    show("Please sign in, then open your orders.", "error");
    return;
  }

  try {
    const data = await verifyPaystackPayment(reference);
    const finalization = data?.finalization || {};
    const paymentStatus = finalization.payment_status;
    const orderId = finalization.order_id || data.order_id || null;
    const latePayment = Boolean(finalization.late_payment);
    const manualResolutionRequired = Boolean(finalization.manual_resolution_required);

    if (paymentStatus === "successful" && !latePayment && !manualResolutionRequired) {
      clearRememberedCheckoutOrder();
      if (orderId) {
        await removePaidItems(orderId);
        const orderNumber = data.order_number || (await getOrderNumber(orderId));
        title.textContent = "Payment confirmed";
        message.textContent = `Your payment has been verified. ${orderNumber} is now paid.`;
        show(`${orderNumber} is confirmed.`, "success");
      } else {
        title.textContent = "Payment confirmed";
        message.textContent = "Your payment has been verified and your order is now paid.";
        show("Payment confirmed.", "success");
      }
      if (orderId) {
        setTimeout(() => {
          window.location.href = `/order.html?id=${encodeURIComponent(orderId)}`;
        }, 1200);
      }
      return;
    }

    if (paymentStatus === "successful" && latePayment) {
      clearRememberedCheckoutOrder();
      title.textContent = "Payment received — manual review required";
      message.textContent =
        "Paystack confirmed the payment, but the reservation had already expired. No stock was consumed and the order was not silently marked as paid. Our team must review this payment before fulfillment.";
      show("Payment received. Manual resolution is required.", "error");
      return;
    }

    if (paymentStatus === "failed") {
      clearRememberedCheckoutOrder();
      title.textContent = "Payment not completed";
      message.textContent =
        "Paystack reported that this payment attempt failed. You can return to your orders and try again if a new reservation is available.";
      show("Payment was not confirmed.", "error");
      return;
    }

    title.textContent = "Payment not completed";
    message.textContent =
      "This payment attempt was not completed. Check your order status before trying again.";
    show("Your payment was not completed.");
  } catch (error) {
    console.error(error);
    title.textContent = "Payment status unavailable";
    message.textContent =
      "We could not confirm the payment right now. Check My Orders before trying to pay again.";
    show(
      "We could not verify the payment. Your order status remains controlled by the payment provider.",
      "error",
    );
  }
}

init();
