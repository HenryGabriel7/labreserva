const origemInterna = "https://labreserva.invalid";
const caracteresInseguros = /[\\\p{Cc}]/u;
const rotasSemRetorno =
  /^\/(?:login|recuperar-senha|definir-senha|auth|api)(?:\/|$)/i;

export function destinoPosLogin(valor: unknown): string {
  if (
    typeof valor !== "string" ||
    valor.length > 2048 ||
    !valor.startsWith("/") ||
    valor.startsWith("//") ||
    valor.trim() !== valor ||
    caracteresInseguros.test(valor)
  )
    return "/";

  try {
    const url = new URL(valor, origemInterna);
    const caminhoDecodificado = decodeURIComponent(url.pathname);
    if (
      url.origin !== origemInterna ||
      caminhoDecodificado.startsWith("//") ||
      caracteresInseguros.test(caminhoDecodificado) ||
      rotasSemRetorno.test(caminhoDecodificado)
    )
      return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
