import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const confirmacaoSchema = z
  .object({
    token_hash: z.string().min(20).max(512),
    type: z.enum(["invite", "recovery"]),
  })
  .strict();

export async function GET(request: NextRequest) {
  const falha = () =>
    NextResponse.redirect(new URL("/login?erro=link-invalido", request.url), {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  const dados = confirmacaoSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!dados.success || request.nextUrl.searchParams.size !== 2) return falha();
  try {
    const admin = createAdminClient();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "origem-indisponivel";
    const limite = await admin.rpc("consumir_rate_limit", {
      p_chave: `confirmacao:${createHash("sha256").update(ip).digest("hex")}`,
      p_limite: 30,
      p_janela_segundos: 900,
    });
    if (limite.error || limite.data !== true) return falha();
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: dados.data.token_hash,
      type: dados.data.type,
    });
    if (error || !data.user) return falha();
    const { data: perfil, error: perfilError } = await supabase
      .from("profiles")
      .select("ativo")
      .eq("id", data.user.id)
      .maybeSingle();
    if (perfilError || perfil?.ativo !== true) {
      await supabase.auth.signOut({ scope: "global" });
      return falha();
    }
    return NextResponse.redirect(new URL("/definir-senha", request.url), {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return falha();
  }
}
