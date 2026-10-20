import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Nunca importar em Client Components: esta chave ignora RLS. */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave)
    throw new Error("Serviço administrativo não configurado.");
  return createClient(url, chave, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
