import { supabase } from "../lib/supabaseClient.js";

const title = document.querySelector("#verification-title");
const message = document.querySelector("#verification-message");
const alert = document.querySelector("#verification-alert");
const shopLink = document.querySelector("#verification-shop");

function showVerified() {
  alert.className = "alert alert-success";
  alert.textContent = "Email verified successfully.";
  title.textContent = "Your account is verified";
  message.textContent = "Your email address has been confirmed. You can now continue shopping with Beulah Foods.";
  shopLink.hidden = false;
}

function showNotVerified(reason = "We could not confirm your email address.") {
  alert.className = "alert alert-error";
  alert.textContent = "Email not verified.";
  title.textContent = "Email verification was not completed";
  message.textContent = reason;
  shopLink.hidden = true;
}

async function checkVerification() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const error = params.get("error") || hash.get("error");
  const errorDescription = params.get("error_description") || hash.get("error_description");

  if (error) {
    showNotVerified(errorDescription || "The verification link is invalid or has expired.");
    return;
  }

  const { data, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    showNotVerified("We could not verify your email right now. Please try the verification link again.");
    return;
  }

  const user = data.session?.user;

  if (user?.email_confirmed_at) {
    showVerified();
    return;
  }

  showNotVerified("Your email address has not been confirmed. Please use the verification link sent to your email.");
}

checkVerification();
