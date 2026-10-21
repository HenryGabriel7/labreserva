export function criarCsp(
  nonce: string,
  desenvolvimento = false,
  supabaseUrl?: string,
) {
  let origemSupabase = "";
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (["https:", "http:"].includes(url.protocol))
        origemSupabase = ` ${url.origin}`;
    } catch {
      /* Configuração inválida não amplia a política. */
    }
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desenvolvimento ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https://*.supabase.co${origemSupabase}`,
    "font-src 'self'",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${origemSupabase}${desenvolvimento ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
