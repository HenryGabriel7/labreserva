import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const rotasPublicas = [
  "/login",
  "/recuperar-senha",
  "/definir-senha",
  "/auth/confirm",
  "/privacidade",
  "/acesso-negado",
  "/api/webhooks/resend",
  "/api/descadastro",
];

/** Renovação e redirecionamento otimistas; autorização é refeita em cada página e ação. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return response;
  const supabase = createServerClient(url, chave, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, {
            ...options,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        for (const [nome, valor] of Object.entries(cacheHeaders))
          response.headers.set(nome, valor);
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const caminho = request.nextUrl.pathname;
  const publica = rotasPublicas.some(
    (rota) => caminho === rota || caminho.startsWith(`${rota}/`),
  );
  if ((!data?.claims || error) && !publica && !caminho.startsWith("/api/")) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    const redirect = NextResponse.redirect(destino);
    for (const cookie of response.cookies.getAll())
      redirect.cookies.set(cookie);
    for (const nome of ["cache-control", "expires", "pragma"]) {
      const valor = response.headers.get(nome);
      if (valor) redirect.headers.set(nome, valor);
    }
    return redirect;
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
