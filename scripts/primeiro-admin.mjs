import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ajuda = `Uso: node --env-file=.env.local scripts/primeiro-admin.mjs --email admin@instituicao.edu.br --nome "Nome completo" [--matricula ADM001]

Exige APP_URL, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.
Só funciona enquanto nenhum papel admin existir, mesmo em uma conta inativa.
O convite sai pela fila de e-mail; nenhum link, token ou segredo é impresso.`;

const mensagens = {
  BOOTSTRAP_JA_REALIZADO:
    "Já existe um administrador. Use a área Usuários para criar novas contas.",
  DOMINIO_NAO_PERMITIDO:
    "O domínio informado não está permitido nas configurações.",
  PERFIL_JA_EXISTENTE:
    "Já existe um perfil com esse identificador ou email. Não foi alterado.",
  USUARIO_AUTH_INVALIDO:
    "A identidade de autenticação não corresponde ao convite.",
  ENTRADA_INVALIDA: "Confira nome, email, matrícula e a origem APP_URL.",
};
class FalhaSegura extends Error {}
function falhar(mensagem) {
  throw new FalhaSegura(mensagem);
}
async function executar() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      nome: { type: "string" },
      matricula: { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(ajuda);
    return;
  }
  const email = values.email?.trim().toLowerCase();
  const nome = values.nome?.trim();
  if (
    !email ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ||
    !nome ||
    nome.length < 2 ||
    nome.length > 150 ||
    (values.matricula?.length ?? 0) > 100
  )
    falhar(
      "Informe --email e --nome válidos. Use --help para consultar o comando.",
    );
  const {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: chave,
    APP_URL: appUrl,
  } = process.env;
  if (!supabaseUrl || !chave || !appUrl)
    falhar(
      "Configure APP_URL, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.",
    );
  let origem;
  try {
    const url = new URL(appUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    )
      falhar(
        "APP_URL deve ser uma origem HTTPS, ou HTTP em loopback para desenvolvimento.",
      );
    origem = url.origin;
    new URL(supabaseUrl);
  } catch {
    falhar(
      "Confira SUPABASE_URL e APP_URL. Não use caminho, credenciais ou parâmetros na origem da aplicação.",
    );
  }
  const supabase = createClient(supabaseUrl, chave, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const preflight = await supabase
    .from("user_roles")
    .select("id")
    .eq("papel", "admin")
    .limit(1);
  if (preflight.error)
    falhar(
      "Não foi possível verificar o banco. Confira a conexão, a chave de serviço e as migrações.",
    );
  if (preflight.data.length) falhar(mensagens.BOOTSTRAP_JA_REALIZADO);
  const perfil = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1);
  if (perfil.error) falhar("Não foi possível verificar o cadastro existente.");
  if (perfil.data.length) falhar(mensagens.PERFIL_JA_EXISTENTE);
  const configuracao = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "dominios_email_permitidos")
    .single();
  if (configuracao.error || !Array.isArray(configuracao.data.valor))
    falhar("Não foi possível verificar os domínios permitidos.");
  if (
    configuracao.data.valor.length &&
    !configuracao.data.valor.includes(email.split("@")[1])
  )
    falhar(mensagens.DOMINIO_NAO_PERMITIDO);
  const limite = await supabase.rpc("consumir_rate_limit", {
    p_chave: `convite-email:${createHash("sha256").update(email).digest("hex")}`,
    p_limite: 1,
    p_janela_segundos: 600,
  });
  if (limite.error || limite.data !== true)
    falhar(
      "Já houve uma tentativa de convite para este endereço. Aguarde dez minutos antes de tentar novamente.",
    );
  const convite = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${origem}/definir-senha` },
  });
  if (
    convite.error ||
    !convite.data.user?.id ||
    !convite.data.properties?.hashed_token
  )
    falhar(
      "Não foi possível gerar o convite. Nenhuma senha foi criada; confira o serviço de autenticação.",
    );
  const resultado = await supabase.rpc("inicializar_administrador", {
    p_usuario_id: convite.data.user.id,
    p_nome: nome,
    p_email: email,
    p_matricula: values.matricula?.trim() || null,
    p_token_hash: convite.data.properties.hashed_token,
    p_app_url: origem,
  });
  if (resultado.error)
    falhar(
      mensagens[resultado.error.message] ??
        "Não foi possível provisionar o administrador. O banco reverteu perfil, papel, auditoria e fila juntos. A identidade Auth pode permanecer sem acesso; não apague histórico.",
    );
  console.log(
    "Primeiro administrador criado. Convite essencial enfileirado; confira a operação do worker de notificações.",
  );
}

executar().catch((erro) => {
  console.error(
    erro instanceof FalhaSegura
      ? erro.message
      : "Não foi possível executar o bootstrap. Confira os argumentos com --help e a disponibilidade dos serviços.",
  );
  process.exitCode = 1;
});
