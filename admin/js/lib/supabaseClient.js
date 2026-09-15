// Admin Supabase client.
//
// STAGING configuration for the reconstruction environment.
// Authorization is still enforced by database RLS through public.admin_users.
// NEVER place the service_role key in this file.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://cveghsjotmfygknqyvxg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vNg874YTHMxcb_SGHM1_Hg_CLoznK3H";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: "beulah-admin-auth",
  },
});
