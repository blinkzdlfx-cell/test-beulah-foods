// Storefront Supabase client.
//
// Staging reconstruction uses the isolated staging Supabase project.
// The anon/public key is safe to use in browser code. NEVER put the
// service_role key here or anywhere else in /storefront.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "../components/navActive.js";

export const SUPABASE_URL = "https://cveghsjotmfygknqyvxg.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZWdoc2pvdG1meWdrbnF5dnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTgzMzEsImV4cCI6MjEwNDk5NDMzMX0.LU1fBwi46IdtEkK5IyajDuSfDJWcPaSI-LMZ-q5q2kQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: "beulah-storefront-auth",
  },
});
