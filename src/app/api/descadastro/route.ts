import { z } from "@/lib/validacao";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarTokenDescadastro } from "@/lib/notificacoes";
import {
  cabecalhosPrivados,
  configuracaoDescadastro,
  limitarEndpoint,
} from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
const querySchema = z.object({ token: z.string().min(1).max(1200) }).strict();
const formularioSchema = z.object({ confirmar: z.literal("sim") }).strict();
const oneClickSchema = z
  .object({ "List-Unsubscribe": z.literal("One-Click") })
  .strict();
function query(request: Request) {
  const parametros = new URL(request.url).searchParams;
  if ([...parametros.keys()].length !== 1) return null;
  const resultado = querySchema.safeParse(Object.fromEntries(parametros));
  return resultado.success ? resultado.data : null;
}
const resposta = (mensagem: string, status: number) =>
  new Response(mensagem, {
    status,
    headers: {
      ...cabecalhosPrivados,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

/** GET apenas exibe confirmação: scanners de links não alteram preferências. */
export async function GET(request: Request) {
  try {
    if (!(await limitarEndpoint(request, "descadastro")))
      return resposta("Tente novamente mais tarde.", 429);
    const config = configuracaoDescadastro();
    const dados = query(request);
    if (
      !dados ||
      !(await verificarTokenDescadastro(dados.token, config.segredo))
    )
      return resposta(
        "Este link expirou ou é inválido. Atualize suas preferências no perfil.",
        400,
      );
    // O token contém somente base64url e ponto, conferidos antes da interpolação.
    return new Response(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preferências de e-mail</title></head><body><main><h1>Desativar estes avisos por e-mail?</h1><p>Decisões de reserva, convites e segurança da conta continuam sendo enviados.</p><form method="post" action="/api/descadastro?token=${dados.token}"><input type="hidden" name="confirmar" value="sim"><button type="submit">Confirmar descadastro</button></form><p><a href="/perfil">Gerenciar todas as preferências</a></p></main></body></html>`,
      {
        headers: {
          ...cabecalhosPrivados,
          "Content-Type": "text/html; charset=utf-8",
        },
      },
    );
  } catch {
    return resposta("Serviço indisponível. Tente novamente mais tarde.", 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!(await limitarEndpoint(request, "descadastro")))
      return resposta("Tente novamente mais tarde.", 429);
    const config = configuracaoDescadastro();
    const dados = query(request);
    if (
      !dados ||
      Number(request.headers.get("content-length") ?? 0) > 2048 ||
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      return resposta("Solicitação inválida.", 400);
    const corpo = await request.text();
    if (corpo.length > 2048) return resposta("Solicitação inválida.", 400);
    const parametros = new URLSearchParams(corpo);
    if ([...parametros.keys()].length !== 1)
      return resposta("Solicitação inválida.", 400);
    const formulario = Object.fromEntries(parametros);
    const origem = request.headers.get("origin");
    // RFC 8058: provedores de e-mail enviam POST sem Origin. A capacidade HMAC
    // autenticada e o corpo estrito One-Click substituem a sessão nesse fluxo.
    const oneClick = !origem && oneClickSchema.safeParse(formulario).success;
    if (
      !oneClick &&
      (origem !== config.origem ||
        !formularioSchema.safeParse(formulario).success)
    )
      return resposta("Origem inválida.", 403);
    const token = await verificarTokenDescadastro(dados.token, config.segredo);
    if (!token) return resposta("Este link expirou ou é inválido.", 400);
    const { error } = await createAdminClient().rpc(
      "descadastrar_notificacao",
      { p_usuario_id: token.usuarioId, p_categoria: token.categoria },
    );
    if (error)
      return resposta("Serviço indisponível. Tente novamente mais tarde.", 503);
    return resposta(
      "Preferência atualizada. As mensagens essenciais continuam sendo enviadas.",
      200,
    );
  } catch {
    return resposta("Serviço indisponível. Tente novamente mais tarde.", 503);
  }
}
