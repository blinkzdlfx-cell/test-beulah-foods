// Storefront Supabase client.
//
// STAGING configuration for the reconstruction environment.
// The publishable key is safe for browser use; never place service-role
// credentials in storefront code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "../components/navActive.js";

const SUPABASE_URL = "https://cveghsjotmfygknqyvxg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vNg874YTHMxcb_SGHM1_Hg_CLoznK3H";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: "beulah-storefront-auth",
  },
});
