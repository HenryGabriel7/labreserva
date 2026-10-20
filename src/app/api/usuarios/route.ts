import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  alterarUsuarioSchema,
  conviteSchema,
  importarUsuariosSchema,
  lerCsvUsuarios,
  paginacaoUsuariosSchema,
  type ConviteUsuario,
} from "@/lib/auth-schema";

export const dynamic = "force-dynamic";
const entradaConvitesSchema = z.union([conviteSchema, importarUsuariosSchema]);
const resposta = (dados: unknown, status = 200) =>
  NextResponse.json(dados, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

function origemPermitida(request: NextRequest) {
  const appUrl = process.env.APP_URL;
  if (!appUrl) return false;
  try {
    return request.headers.get("origin") === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

async function lerJsonLimitado(request: NextRequest): Promise<unknown> {
  if (
    request.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() !== "application/json"
  )
    throw new Error("Entrada inválida.");
  const leitor = request.body?.getReader();
  if (!leitor) throw new Error("Entrada inválida.");
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  while (true) {
    const parte = await leitor.read();
    if (parte.done) break;
    tamanho += parte.value.byteLength;
    if (tamanho > 200000) {
      await leitor.cancel();
      throw new Error("Entrada excede o limite.");
    }
    partes.push(parte.value);
  }
  return JSON.parse(Buffer.concat(partes).toString("utf8")) as unknown;
}

async function autorizarAdmin() {
  const usuario = await getCurrentUser({ sensitive: true });
  if (!usuario)
    return {
      erro: resposta({ error: "Autenticação necessária." }, 401),
    } as const;
  if (!usuario.roles.includes("admin"))
    return {
      erro: resposta({ error: "Acesso não autorizado." }, 403),
    } as const;
  return { usuario } as const;
}

export async function GET(request: NextRequest) {
  const acesso = await autorizarAdmin();
  if (acesso.erro) return acesso.erro;
  const parametros = paginacaoUsuariosSchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parametros.success || request.nextUrl.searchParams.size > 1)
    return resposta({ error: "Filtros inválidos." }, 400);
  try {
    const pagina = parametros.data.pagina;
    const supabase = await createClient();
    const {
      data: usuarios,
      error,
      count,
    } = await supabase
      .from("profiles")
      .select("id,nome,email,matricula,ativo,created_at", { count: "exact" })
      .order("nome")
      .range((pagina - 1) * 20, pagina * 20 - 1);
    if (error) throw error;
    const ids = (usuarios ?? []).map((usuario) => usuario.id as string);
    if (!ids.length)
      return resposta({ usuarios: [], total: count ?? 0, pagina });
    const [roles, vinculos] = await Promise.all([
      supabase.from("user_roles").select("user_id,papel").in("user_id", ids),
      supabase
        .from("monitor_laboratorios")
        .select("monitor_id,laboratorio_id")
        .in("monitor_id", ids),
    ]);
    if (roles.error || vinculos.error)
      throw new Error("Falha ao carregar vínculos.");
    return resposta({
      usuarios: (usuarios ?? []).map((usuario) => ({
        ...usuario,
        papeis: (roles.data ?? [])
          .filter((item) => item.user_id === usuario.id)
          .map((item) => item.papel),
        laboratorioIds: (vinculos.data ?? [])
          .filter((item) => item.monitor_id === usuario.id)
          .map((item) => item.laboratorio_id),
      })),
      total: count ?? 0,
      pagina,
    });
  } catch {
    return resposta({ error: "Não foi possível carregar os usuários." }, 503);
  }
}

async function convidar(
  dados: ConviteUsuario,
  atorId: string,
  appUrl: string,
  dominiosPermitidos: string[],
) {
  const dominio = dados.email.slice(dados.email.lastIndexOf("@") + 1);
  if (dominiosPermitidos.length && !dominiosPermitidos.includes(dominio))
    return false;
  const admin = createAdminClient();
  // generateLink cria a identidade, mas não utiliza o SMTP padrão do Supabase.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: dados.email,
    options: { redirectTo: `${appUrl}/definir-senha` },
  });
  if (error || !data.user?.id || !data.properties?.hashed_token) return false;
  const provisionamento = await admin.rpc("provisionar_usuario", {
    p_usuario_id: data.user.id,
    p_nome: dados.nome,
    p_email: dados.email,
    p_matricula: dados.matricula || null,
    p_papeis: dados.papeis,
    p_ator_id: atorId,
    p_token_hash: data.properties.hashed_token,
    p_app_url: appUrl,
  });
  if (provisionamento.error) {
    // Sem profile ativo a identidade não acessa dados. Não apagar: preservar para correção administrativa.
    console.error("Falha no provisionamento de usuário.", {
      codigo: provisionamento.error.code,
      usuarioId: data.user.id,
    });
    return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  if (!origemPermitida(request))
    return resposta({ error: "Origem não autorizada." }, 403);
  const acesso = await autorizarAdmin();
  if (acesso.erro) return acesso.erro;
  let usuarios: ConviteUsuario[];
  let csv = false;
  try {
    const dados = entradaConvitesSchema.safeParse(
      await lerJsonLimitado(request),
    );
    if (!dados.success)
      return resposta({ error: "Confira os dados do convite." }, 400);
    csv = "csv" in dados.data;
    usuarios =
      "csv" in dados.data ? lerCsvUsuarios(dados.data.csv) : [dados.data];
  } catch (erro) {
    return resposta(
      {
        error:
          erro instanceof Error && erro.message.startsWith("Linha ")
            ? erro.message
            : "Envie um CSV válido com até 100 usuários e os campos nome,email,matricula,papeis.",
      },
      400,
    );
  }
  try {
    const appUrl = new URL(process.env.APP_URL!).origin;
    if (process.env.NODE_ENV === "production" && !appUrl.startsWith("https://"))
      return resposta({ error: "Serviço indisponível." }, 503);
    const admin = createAdminClient();
    const limite = await admin.rpc("consumir_rate_limit", {
      p_chave: `convites:${acesso.usuario.id}`,
      p_limite: 10,
      p_janela_segundos: 600,
    });
    if (limite.error || limite.data !== true)
      return resposta(
        { error: "Aguarde alguns minutos antes de enviar novos convites." },
        429,
      );
    const { data: configuracao, error } = await admin
      .from("configuracoes")
      .select("valor")
      .eq("chave", "dominios_email_permitidos")
      .single();
    const dominios = z
      .array(z.string().trim().toLowerCase().min(1).max(253))
      .safeParse(configuracao?.valor);
    if (error || !dominios.success)
      return resposta(
        { error: "Não foi possível validar os domínios institucionais." },
        503,
      );
    let criados = 0;
    const erros: { linha: number; mensagem: string }[] = [];
    for (const [indice, usuario] of usuarios.entries()) {
      if (await convidar(usuario, acesso.usuario.id, appUrl, dominios.data))
        criados += 1;
      else
        erros.push({
          linha: indice + (csv ? 2 : 1),
          mensagem:
            "Convite não criado. Confira os dados, o domínio permitido e se a conta já existe.",
        });
    }
    return resposta(
      { criados, erros },
      criados ? (erros.length ? 207 : 201) : 422,
    );
  } catch {
    return resposta(
      { error: "Não foi possível criar os convites neste momento." },
      503,
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!origemPermitida(request))
    return resposta({ error: "Origem não autorizada." }, 403);
  const acesso = await autorizarAdmin();
  if (acesso.erro) return acesso.erro;
  try {
    const dados = alterarUsuarioSchema.safeParse(
      await lerJsonLimitado(request),
    );
    if (!dados.success)
      return resposta({ error: "Confira os dados do usuário." }, 400);
    const supabase = await createClient();
    const { error } = await supabase.rpc("alterar_usuario_admin", {
      p_usuario_id: dados.data.id,
      p_nome: dados.data.nome,
      p_matricula: dados.data.matricula || null,
      p_ativo: dados.data.ativo,
      p_papeis: dados.data.papeis,
      p_laboratorio_ids: dados.data.laboratorioIds,
    });
    if (error)
      return resposta(
        {
          error:
            "Não foi possível atualizar o usuário. Confira as permissões e os vínculos.",
        },
        400,
      );
    return resposta({ success: true });
  } catch {
    return resposta({ error: "Não foi possível atualizar o usuário." }, 400);
  }
}
