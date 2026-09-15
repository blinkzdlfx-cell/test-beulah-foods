// Admin Supabase client.
//
// The staging reconstruction uses the isolated staging Supabase project.
// Authorization is still enforced by database RLS through public.admin_users.
// NEVER place the service_role key in this file.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://cveghsjotmfygknqyvxg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZWdoc2pvdG1meWdrbnF5dnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTgzMzEsImV4cCI6MjEwNDk5NDMzMX0.LU1fBwi46IdtEkK5IyajDuSfDJWcPaSI-LMZ-q5q2kQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: "beulah-admin-auth",
  },
});
