import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render, toPlainText } from "@react-email/render";
import { Resend } from "resend";
import { z } from "zod";

/** Compartilhado por Next e Deno: sem variáveis de ambiente ou estado global. */
export const templates = [
  "reserva_criada",
  "reserva_aprovada",
  "reserva_recusada",
  "reserva_cancelada",
  "reserva_substituida",
  "reserva_no_show",
  "prioridade_substituicao",
  "lembrete_reserva",
  "pendencia_monitor",
  "pendencia_admin",
  "ocorrencia_grave",
  "convite",
  "recuperacao",
  "seguranca_conta",
] as const;
export const templateSchema = z.enum(templates);
export type Template = z.infer<typeof templateSchema>;
export const preferenciasSchema = z
  .object({ lembretes: z.boolean().optional(), outros: z.boolean().optional() })
  .strict();
export const identidadeSchema = z
  .object({
    nome: z.string().min(1).max(100),
    cor: z.string().regex(/^#[0-9a-f]{6}$/i),
    logo_url: z.union([
      z.literal(""),
      z.url().refine((valor) => new URL(valor).protocol === "https:"),
    ]),
  })
  .strict();
export type Identidade = z.infer<typeof identidadeSchema>;
export const identidadePadrao: Identidade = {
  nome: "Instituto Horizonte",
  cor: "#0f766e",
  logo_url: "",
};
export const payloadSchema = z
  .object({
    usuario_nome: z.string().max(200),
    email: z.email(),
    reserva_id: z.uuid().optional(),
    laboratorio_id: z.uuid().optional(),
    laboratorio_nome: z.string().max(200).optional(),
    inicio: z.iso.datetime({ offset: true }).optional(),
    fim: z.iso.datetime({ offset: true }).optional(),
    motivo: z.string().max(4000).nullable().optional(),
    finalidade: z.string().max(4000).optional(),
    prioridade: z.number().int().optional(),
    ocorrencia_id: z.uuid().optional(),
    descricao: z.string().max(4000).optional(),
    antecedencia: z.enum(["24h", "1h"]).optional(),
    created_at: z.iso.datetime({ offset: true }).optional(),
    url: z.url().optional(),
    horarios_livres: z.array(z.string().max(200)).max(20).optional(),
  })
  .strict();
export type Payload = z.infer<typeof payloadSchema>;
export const notificacaoSchema = z
  .object({
    id: z.uuid(),
    usuario_id: z.uuid(),
    tipo_evento: templateSchema,
    template: templateSchema,
    payload: payloadSchema,
    destinatario_email: z.email(),
    essencial: z.boolean(),
    chave_idempotencia: z.string().min(1).max(1000),
  })
  .strict()
  .refine((notificacao) => notificacao.tipo_evento === notificacao.template, {
    message: "Evento e template incompatíveis.",
  });
export type Notificacao = z.infer<typeof notificacaoSchema>;

const essenciais = new Set<Template>([
  "reserva_aprovada",
  "reserva_recusada",
  "reserva_cancelada",
  "reserva_substituida",
  "convite",
  "recuperacao",
  "seguranca_conta",
]);
export function eventoEssencial(evento: Template) {
  return essenciais.has(evento);
}
export function categoriaEvento(evento: Template): "lembretes" | "outros" {
  return evento === "lembrete_reserva" ? "lembretes" : "outros";
}
export function podeEnviar(
  evento: Template,
  preferencias: z.infer<typeof preferenciasSchema>,
  suprimido = false,
) {
  if (suprimido) return false;
  return (
    eventoEssencial(evento) ||
    preferenciasSchema.parse(preferencias)[categoriaEvento(evento)] !== false
  );
}

const encoder = new TextEncoder();
const base64url = (dados: Uint8Array) =>
  btoa(String.fromCharCode(...dados))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const decodificar = (valor: string) =>
  Uint8Array.from(
    atob(valor.replaceAll("-", "+").replaceAll("_", "/")),
    (letra) => letra.charCodeAt(0),
  );
export async function sha256(valor: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(valor)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function chaveHmac(segredo: string) {
  if (segredo.length < 32) throw new Error("SEGREDO_NAO_CONFIGURADO");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
const descadastroSchema = z
  .object({
    v: z.literal(1),
    usuarioId: z.uuid(),
    categoria: z.enum(["lembretes", "outros"]),
    exp: z.number().int().positive(),
  })
  .strict();
export type Descadastro = z.infer<typeof descadastroSchema>;
export async function criarTokenDescadastro(
  usuarioId: string,
  categoria: Descadastro["categoria"],
  segredo: string,
  agora = Date.now(),
) {
  const dados = descadastroSchema.parse({
    v: 1,
    usuarioId,
    categoria,
    exp: Math.floor(agora / 1000) + 30 * 24 * 3600,
  });
  const corpo = base64url(encoder.encode(JSON.stringify(dados)));
  return `${corpo}.${base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await chaveHmac(segredo), encoder.encode(corpo))))}`;
}
export async function verificarTokenDescadastro(
  token: string,
  segredo: string,
  agora = Date.now(),
): Promise<Descadastro | null> {
  try {
    if (!/^[A-Za-z0-9_-]{1,1024}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [corpo, assinatura] = token.split(".");
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await chaveHmac(segredo),
        decodificar(assinatura),
        encoder.encode(corpo),
      ))
    )
      return null;
    const dados = descadastroSchema.parse(
      JSON.parse(new TextDecoder().decode(decodificar(corpo))),
    );
    return dados.exp > Math.floor(agora / 1000) &&
      dados.exp <= Math.floor(agora / 1000) + 31 * 24 * 3600
      ? dados
      : null;
  } catch {
    return null;
  }
}
export function origemAplicacao(valor: string) {
  const url = new URL(valor);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("ORIGEM_INVALIDA");
  return url.origin;
}
export async function segredoWorkerValido(
  recebido: string | null,
  esperado: string,
) {
  if (!recebido || recebido.length > 256 || esperado.length < 32) return false;
  const chave = await chaveHmac(esperado);
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    encoder.encode("worker"),
  );
  const candidata = await chaveHmac(recebido.padEnd(32, "\0"));
  return crypto.subtle.verify(
    "HMAC",
    candidata,
    assinatura,
    encoder.encode("worker"),
  );
}

const textos: Record<
  Template,
  { assunto: string; mensagem: string; botao: string }
> = {
  reserva_criada: {
    assunto: "Nova solicitação de laboratório",
    mensagem: "Há uma solicitação aguardando a sua análise.",
    botao: "Analisar solicitação",
  },
  reserva_aprovada: {
    assunto: "Sua reserva foi aprovada",
    mensagem:
      "A sua solicitação foi aprovada. Consulte as regras de uso antes da atividade.",
    botao: "Ver reserva",
  },
  reserva_recusada: {
    assunto: "Sua solicitação foi recusada",
    mensagem:
      "A análise da sua solicitação foi concluída. Confira o motivo abaixo.",
    botao: "Ver solicitação",
  },
  reserva_cancelada: {
    assunto: "Reserva cancelada",
    mensagem: "A reserva foi cancelada. Confira o motivo e os detalhes.",
    botao: "Ver reserva",
  },
  reserva_substituida: {
    assunto: "Sua reserva foi substituída",
    mensagem:
      "A sua reserva foi substituída após uma decisão de prioridade. Confira o motivo e consulte horários livres no calendário do laboratório.",
    botao: "Ver reserva e alternativas",
  },
  reserva_no_show: {
    assunto: "Ausência registrada na reserva",
    mensagem:
      "Não foi registrado check-in dentro da tolerância. Consulte os detalhes da reserva.",
    botao: "Ver reserva",
  },
  prioridade_substituicao: {
    assunto: "Solicitação com prioridade para analisar",
    mensagem:
      "Uma solicitação com maior prioridade coincide com uma reserva aprovada. A decisão exige análise e justificativa.",
    botao: "Analisar conflito",
  },
  lembrete_reserva: {
    assunto: "Lembrete da sua reserva",
    mensagem:
      "Sua atividade está se aproximando. Confira o horário e lembre-se de fazer check-in com o monitor.",
    botao: "Ver reserva",
  },
  pendencia_monitor: {
    assunto: "Solicitação aguardando decisão",
    mensagem: "Uma solicitação de laboratório continua pendente de análise.",
    botao: "Analisar pendência",
  },
  pendencia_admin: {
    assunto: "Alerta de solicitação pendente",
    mensagem:
      "Uma solicitação excedeu o prazo de análise e precisa da atenção da administração.",
    botao: "Ver pendência",
  },
  ocorrencia_grave: {
    assunto: "Ocorrência grave em laboratório",
    mensagem:
      "Foi registrada uma ocorrência grave. Acesse o sistema para acompanhar e tomar as providências necessárias.",
    botao: "Ver ocorrência",
  },
  convite: {
    assunto: "Ative seu acesso à reserva de laboratórios",
    mensagem:
      "Você recebeu acesso ao sistema de reserva de laboratórios. Confirme seu convite e defina uma senha para entrar.",
    botao: "Ativar acesso",
  },
  recuperacao: {
    assunto: "Redefina sua senha com segurança",
    mensagem:
      "Recebemos uma solicitação para redefinir sua senha. Se não foi você, ignore este e-mail. Sua senha permanece a mesma.",
    botao: "Redefinir senha",
  },
  seguranca_conta: {
    assunto: "Aviso de segurança da sua conta",
    mensagem:
      "Há uma atualização de segurança relacionada à sua conta. Acesse o sistema para conferir.",
    botao: "Acessar conta",
  },
};
const formatarData = (valor: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
function linkDaNotificacao(notificacao: Notificacao, appUrl: string) {
  const origem = origemAplicacao(appUrl);
  if (["convite", "recuperacao"].includes(notificacao.template)) {
    if (!notificacao.payload.url) throw new Error("LINK_AUTH_AUSENTE");
    const link = new URL(notificacao.payload.url);
    const tipo = notificacao.template === "convite" ? "invite" : "recovery";
    if (
      link.origin !== origem ||
      link.pathname !== "/auth/confirm" ||
      link.searchParams.get("type") !== tipo ||
      !/^[A-Za-z0-9_-]{20,256}$/.test(link.searchParams.get("token_hash") ?? "")
    )
      throw new Error("LINK_AUTH_INVALIDO");
    return link.toString();
  }
  if (notificacao.payload.reserva_id)
    return `${origem}/reservas/${notificacao.payload.reserva_id}`;
  return `${origem}/perfil`;
}
export function EmailNotificacao({
  notificacao,
  identidade,
  url,
  descadastroUrl,
}: {
  notificacao: Notificacao;
  identidade: Identidade;
  url: string;
  descadastroUrl?: string;
}) {
  const conteudo = textos[notificacao.template];
  const dados = notificacao.payload;
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{conteudo.assunto}</Preview>
      <Body
        style={{
          backgroundColor: "#f1f5f9",
          fontFamily: "Arial, sans-serif",
          color: "#172033",
          padding: "24px 12px",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
            maxWidth: "560px",
            borderRadius: "12px",
          }}
        >
          {identidade.logo_url ? (
            <Img
              src={identidade.logo_url}
              alt={identidade.nome}
              width="140"
              style={{ maxWidth: "100%" }}
            />
          ) : (
            <Text
              style={{
                color: identidade.cor,
                fontWeight: "bold",
                fontSize: "18px",
              }}
            >
              {identidade.nome}
            </Text>
          )}
          <Heading as="h1" style={{ fontSize: "24px", lineHeight: "32px" }}>
            {conteudo.assunto}
          </Heading>
          <Text>Olá, {dados.usuario_nome}.</Text>
          <Text>{conteudo.mensagem}</Text>
          {dados.laboratorio_nome && (
            <Text>
              <strong>Laboratório:</strong> {dados.laboratorio_nome}
            </Text>
          )}
          {dados.inicio && (
            <Text>
              <strong>Início:</strong> {formatarData(dados.inicio)} (Brasília)
            </Text>
          )}
          {dados.fim && (
            <Text>
              <strong>Término:</strong> {formatarData(dados.fim)} (Brasília)
            </Text>
          )}
          {dados.motivo && (
            <Text>
              <strong>Motivo:</strong> {dados.motivo}
            </Text>
          )}
          {dados.horarios_livres?.map((horario) => (
            <Text key={horario}>Horário livre: {horario}</Text>
          ))}
          {!!dados.horarios_livres?.length && (
            <Text>
              Estas sugestões foram verificadas no envio deste e-mail. Uma nova
              solicitação depende de disponibilidade e aprovação.
            </Text>
          )}
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={url}
              style={{
                backgroundColor: identidade.cor,
                color: "#ffffff",
                padding: "14px 20px",
                borderRadius: "6px",
                fontWeight: "bold",
                textDecoration: "none",
              }}
            >
              {conteudo.botao}
            </Button>
          </Section>
          <Text
            style={{
              fontSize: "12px",
              color: "#475569",
              wordBreak: "break-all",
            }}
          >
            Se o botão não abrir, use este link: <Link href={url}>{url}</Link>
          </Text>
          {descadastroUrl ? (
            <Text style={{ fontSize: "12px", color: "#475569" }}>
              <Link href={descadastroUrl}>
                Desativar estes avisos por e-mail
              </Link>
              . As decisões de reserva e mensagens de segurança continuam sendo
              enviadas.
            </Text>
          ) : (
            <Text style={{ fontSize: "12px", color: "#475569" }}>
              Esta é uma mensagem essencial sobre sua reserva ou a segurança da
              sua conta.
            </Text>
          )}
          <Text style={{ fontSize: "12px", color: "#475569" }}>
            Horários exibidos no fuso America/Sao_Paulo. Não responda a esta
            mensagem.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const mensagemSchema = z
  .object({
    para: z.email(),
    assunto: z.string().min(1).max(500),
    html: z.string().min(1).max(1048576),
    texto: z.string().min(1).max(1048576),
    chaveIdempotencia: z.string().min(1).max(1000),
    descadastroUrl: z.url().optional(),
  })
  .strict();
export type Mensagem = z.infer<typeof mensagemSchema>;
export const envelopeSchema = mensagemSchema
  .extend({
    remetente: z
      .string()
      .min(1)
      .max(500)
      .refine((valor) => !/[\r\n]/.test(valor)),
  })
  .strict();
export interface NotificationProvider {
  enviar(mensagem: Mensagem): Promise<{ id: string }>;
}
export class ResendNotificationProvider implements NotificationProvider {
  private readonly resend: Resend;
  constructor(
    apiKey: string,
    private readonly remetente: string,
    cliente?: Resend,
  ) {
    if (!apiKey || !remetente || /[\r\n]/.test(remetente))
      throw new Error("RESEND_NAO_CONFIGURADO");
    this.resend = cliente ?? new Resend(apiKey);
  }
  async enviar(mensagem: Mensagem) {
    const { data, error } = await this.resend.emails.send(
      {
        from: this.remetente,
        to: [mensagem.para],
        subject: mensagem.assunto,
        html: mensagem.html,
        text: mensagem.texto,
        ...(mensagem.descadastroUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${mensagem.descadastroUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      },
      {
        idempotencyKey: `notificacao-${await sha256(mensagem.chaveIdempotencia)}`,
      },
    );
    // A mensagem do provedor pode conter endereço ou token; persistimos somente o código.
    if (error || !data?.id)
      throw new Error(
        `resend_${error?.name?.replace(/[^a-z_]/gi, "").slice(0, 80) || "sem_identificador"}`,
      );
    return { id: data.id };
  }
}
export async function prepararMensagem(
  notificacao: Notificacao,
  appUrl: string,
  identidade: Identidade,
  segredoDescadastro: string,
): Promise<Mensagem> {
  notificacaoSchema.parse(notificacao);
  identidadeSchema.parse(identidade);
  const essencial = eventoEssencial(notificacao.tipo_evento);
  if (notificacao.essencial !== essencial)
    throw new Error("CLASSIFICACAO_EVENTO_INVALIDA");
  const url = linkDaNotificacao(notificacao, appUrl);
  const descadastroUrl = essencial
    ? undefined
    : `${origemAplicacao(appUrl)}/api/descadastro?token=${await criarTokenDescadastro(notificacao.usuario_id, categoriaEvento(notificacao.tipo_evento), segredoDescadastro)}`;
  const html = await render(
    <EmailNotificacao
      notificacao={notificacao}
      identidade={identidade}
      url={url}
      descadastroUrl={descadastroUrl}
    />,
  );
  return {
    para: notificacao.destinatario_email,
    assunto: textos[notificacao.template].assunto,
    html,
    texto: toPlainText(html),
    chaveIdempotencia: notificacao.chave_idempotencia,
    descadastroUrl,
  };
}
