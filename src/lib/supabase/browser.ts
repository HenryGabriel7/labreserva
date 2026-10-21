"use client";
import { createBrowserClient } from "@supabase/ssr";
import { z } from "@/lib/validacao";

const configuracaoPublicaSchema = z
  .object({ url: z.url(), publishableKey: z.string().min(1) })
  .strict();

/** Somente URL e chave pública recebidas explicitamente do servidor. Tokens ficam em cookies. */
export function createClient(
  configuracao: z.infer<typeof configuracaoPublicaSchema>,
) {
  const { url, publishableKey } = configuracaoPublicaSchema.parse(configuracao);
  return createBrowserClient(url, publishableKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}
