import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://cveghsjotmfygknqyvxg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vNg874YTHMxcb_SGHM1_Hg_CLoznK3H";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: "beulah-storefront-auth",
  },
});

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

function showNotVerified(reason) {
  alert.className = "alert alert-error";
  alert.textContent = "Email not verified.";
  title.textContent = "Email verification was not completed";
  message.textContent = reason || "We could not confirm your email address. Please try the verification link again.";
  shopLink.hidden = true;
}

function readVerificationError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    error: params.get("error") || hash.get("error"),
    description: params.get("error_description") || hash.get("error_description"),
  };
}

async function checkConfirmedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return false;

  if (data.user?.email_confirmed_at) {
    showVerified();
    return true;
  }

  return false;
}

async function checkVerification() {
  const { error, description } = readVerificationError();

  if (error) {
    showNotVerified(description || "The verification link is invalid or has expired.");
    return;
  }

  let settled = false;
  const { data: authListener } = supabase.auth.onAuthStateChange(async (event) => {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      if (await checkConfirmedUser()) {
        settled = true;
      }
    }
  });

  for (let attempt = 0; attempt < 10 && !settled; attempt += 1) {
    if (await checkConfirmedUser()) {
      settled = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  authListener.subscription.unsubscribe();

  if (!settled) {
    showNotVerified("Your email could not be confirmed in this session. Please try the verification link again.");
  }
}

checkVerification().catch(() => {
  showNotVerified("We could not verify your email right now. Please try the verification link again.");
});
