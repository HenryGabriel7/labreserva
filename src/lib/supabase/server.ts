import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function hasSupabaseConfiguration() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY,
  );
}

export async function createClient() {
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave)
    throw new Error("Serviço de autenticação não configurado.");
  const cookieStore = await cookies();
  return createServerClient(url, chave, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, {
              ...options,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            });
        } catch {
          // Server Components não escrevem cookies. O proxy renova antes da renderização.
        }
      },
    },
  });
}

export const createServerSupabase = createClient;
