import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Resend } from "resend";

const contexto = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: contexto.rpc }),
}));

import {
  categoriaEvento,
  criarTokenDescadastro,
  eventoEssencial,
  identidadePadrao,
  notificacaoSchema,
  origemAplicacao,
  podeEnviar,
  prepararMensagem,
  ResendNotificationProvider,
  segredoWorkerValido,
  templates,
  verificarTokenDescadastro,
  type Notificacao,
  type Template,
} from "@/lib/notificacoes";
import { POST as webhook } from "@/app/api/webhooks/resend/route";
import {
  GET as confirmarDescadastro,
  POST as descadastrar,
} from "@/app/api/descadastro/route";

const usuarioId = "10000000-0000-4000-8000-000000000001";
const segredo = "segredo-local-exclusivo-dos-testes-123456789";
const origem = "https://laboratorios.exemplo.edu.br";
function notificacao(template: Template = "reserva_aprovada"): Notificacao {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    usuario_id: usuarioId,
    tipo_evento: template,
    template,
    payload: {
      usuario_nome: "Lia",
      email: "lia@exemplo.edu.br",
      reserva_id: "30000000-0000-4000-8000-000000000001",
      laboratorio_nome: "Redes",
      inicio: "2026-10-21T13:00:00+00:00",
      fim: "2026-10-21T14:00:00+00:00",
      motivo: "Decisão registrada",
    },
    destinatario_email: "lia@exemplo.edu.br",
    essencial: eventoEssencial(template),
    chave_idempotencia: `reserva:${template}:${usuarioId}`,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  contexto.rpc.mockImplementation(async (nome: string) => ({
    data: nome === "consumir_rate_limit" ? true : null,
    error: null,
  }));
  vi.stubEnv("APP_URL", origem);
  vi.stubEnv("NOTIFICATION_UNSUBSCRIBE_SECRET", segredo);
  vi.stubEnv(
    "RESEND_WEBHOOK_SECRET",
    `whsec_${Buffer.from(segredo).toString("base64")}`,
  );
});

describe("preferências e tokens de descadastro", () => {
  it("preserva essenciais e bloqueia todo envio ao endereço suprimido", () => {
    for (const evento of templates) {
      expect(podeEnviar(evento, { lembretes: false, outros: false })).toBe(
        eventoEssencial(evento),
      );
      expect(podeEnviar(evento, {}, true)).toBe(false);
      expect(podeEnviar(evento, {})).toBe(true);
    }
    expect(categoriaEvento("lembrete_reserva")).toBe("lembretes");
    expect(podeEnviar("reserva_criada", { lembretes: false })).toBe(true);
  });
  it("assina usuário, categoria e validade, rejeitando adulteração e expiração", async () => {
    const agora = Date.UTC(2026, 9, 20);
    const token = await criarTokenDescadastro(
      usuarioId,
      "lembretes",
      segredo,
      agora,
    );
    expect(
      await verificarTokenDescadastro(token, segredo, agora),
    ).toMatchObject({ usuarioId, categoria: "lembretes" });
    expect(
      await verificarTokenDescadastro(
        token.replace(/^./, token[0] === "A" ? "B" : "A"),
        segredo,
        agora,
      ),
    ).toBeNull();
    expect(
      await verificarTokenDescadastro(token, `${segredo}diferente`, agora),
    ).toBeNull();
    expect(
      await verificarTokenDescadastro(token, segredo, agora + 30 * 86400000),
    ).toBeNull();
    expect(
      await verificarTokenDescadastro(`${token}.extra`, segredo, agora),
    ).toBeNull();
  });
  it("exige segredo forte e origem HTTPS ou localhost", async () => {
    await expect(
      criarTokenDescadastro(usuarioId, "outros", "fraco"),
    ).rejects.toThrow("SEGREDO_NAO_CONFIGURADO");
    expect(origemAplicacao("http://localhost:3000/caminho")).toBe(
      "http://localhost:3000",
    );
    expect(() => origemAplicacao("http://site-publico.edu.br")).toThrow();
    expect(() =>
      origemAplicacao("https://usuario:senha@exemplo.edu.br"),
    ).toThrow();
    expect(await segredoWorkerValido(segredo, segredo)).toBe(true);
    expect(await segredoWorkerValido(`${segredo}x`, segredo)).toBe(false);
    expect(await segredoWorkerValido(null, segredo)).toBe(false);
  });
  it("GET apenas confirma; POST da mesma origem muda a categoria assinada", async () => {
    const token = await criarTokenDescadastro(usuarioId, "lembretes", segredo);
    const url = `${origem}/api/descadastro?token=${token}`;
    expect((await confirmarDescadastro(new Request(url))).status).toBe(200);
    expect(contexto.rpc).not.toHaveBeenCalledWith(
      "descadastrar_notificacao",
      expect.anything(),
    );
    const resultado = await descadastrar(
      new Request(url, {
        method: "POST",
        headers: {
          origin: origem,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "confirmar=sim",
      }),
    );
    expect(resultado.status).toBe(200);
    expect(contexto.rpc).toHaveBeenCalledWith("descadastrar_notificacao", {
      p_usuario_id: usuarioId,
      p_categoria: "lembretes",
    });
  });
  it("bloqueia CSRF e corpo inesperado; aceita somente One-Click autenticado sem Origin", async () => {
    const token = await criarTokenDescadastro(usuarioId, "outros", segredo);
    const url = `${origem}/api/descadastro?token=${token}`;
    const requisicao = (body: string, origin?: string) =>
      new Request(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          ...(origin ? { origin } : {}),
        },
        body,
      });
    expect(
      (await descadastrar(requisicao("confirmar=sim", "https://atacante.test")))
        .status,
    ).toBe(403);
    expect((await descadastrar(requisicao("confirmar=sim"))).status).toBe(403);
    expect(
      (
        await descadastrar(
          requisicao("List-Unsubscribe=One-Click&categoria=essenciais"),
        )
      ).status,
    ).toBe(400);
    expect(contexto.rpc).not.toHaveBeenCalledWith(
      "descadastrar_notificacao",
      expect.anything(),
    );
    expect(
      (await descadastrar(requisicao("List-Unsubscribe=One-Click"))).status,
    ).toBe(200);
    expect(contexto.rpc).toHaveBeenCalledWith("descadastrar_notificacao", {
      p_usuario_id: usuarioId,
      p_categoria: "outros",
    });
  });
});

describe("templates pt-BR e provider", () => {
  it("renderiza todos os eventos com link direto, texto alternativo e fuso brasileiro", async () => {
    for (const template of templates) {
      const dados = notificacao(template);
      if (["convite", "recuperacao"].includes(template))
        dados.payload.url = `${origem}/auth/confirm?token_hash=${"a".repeat(64)}&type=${template === "convite" ? "invite" : "recovery"}`;
      const mensagem = await prepararMensagem(
        dados,
        origem,
        identidadePadrao,
        segredo,
      );
      expect(mensagem.html).toContain('lang="pt-BR"');
      expect(mensagem.html).toContain("21/10/2026, 10:00");
      expect(mensagem.texto).toContain("Lia");
      expect(mensagem.html).toContain(
        ["convite", "recuperacao"].includes(template)
          ? "/auth/confirm?"
          : "/reservas/30000000-0000-4000-8000-000000000001",
      );
      expect(Boolean(mensagem.descadastroUrl)).toBe(!dados.essencial);
    }
  });
  it("escapa texto, valida classificação e recusa links de autenticação externos", async () => {
    const dados = notificacao();
    dados.payload.motivo = '<script>alert("x")</script>';
    const mensagem = await prepararMensagem(
      dados,
      origem,
      identidadePadrao,
      segredo,
    );
    expect(mensagem.html).not.toContain("<script>");
    expect(mensagem.html).toContain("&lt;script&gt;");
    await expect(
      prepararMensagem(
        { ...dados, essencial: false },
        origem,
        identidadePadrao,
        segredo,
      ),
    ).rejects.toThrow("CLASSIFICACAO_EVENTO_INVALIDA");
    const convite = notificacao("convite");
    convite.payload.url = `https://atacante.test/auth/confirm?token_hash=${"a".repeat(64)}&type=invite`;
    await expect(
      prepararMensagem(convite, origem, identidadePadrao, segredo),
    ).rejects.toThrow("LINK_AUTH_INVALIDO");
    expect(
      notificacaoSchema.safeParse({ ...dados, papel: "admin" }).success,
    ).toBe(false);
    expect(
      notificacaoSchema.safeParse({ ...dados, template: "convite" }).success,
    ).toBe(false);
  });
  it("usa Resend por contrato, cabeçalhos One-Click e chave estável sem enviar rede", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ data: { id: "id-provedor" }, error: null });
    const provider = new ResendNotificationProvider(
      "somente-teste",
      "Instituto <avisos@exemplo.edu.br>",
      { emails: { send } } as unknown as Resend,
    );
    const mensagem = await prepararMensagem(
      notificacao("lembrete_reserva"),
      origem,
      identidadePadrao,
      segredo,
    );
    expect(await provider.enviar(mensagem)).toEqual({ id: "id-provedor" });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["lia@exemplo.edu.br"],
        headers: {
          "List-Unsubscribe": `<${mensagem.descadastroUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      { idempotencyKey: expect.stringMatching(/^notificacao-[a-f0-9]{64}$/) },
    );
    const chave = send.mock.calls[0][1];
    await provider.enviar(mensagem);
    expect(send.mock.calls[1][1]).toEqual(chave);
  });
  it("não persiste mensagens do provedor que poderiam conter dados ou tokens", async () => {
    const send = vi
      .fn()
      .mockResolvedValue({
        data: null,
        error: { name: "validation_error", message: "token=SEGREDO_PRIVADO" },
      });
    const provider = new ResendNotificationProvider(
      "somente-teste",
      "avisos@exemplo.edu.br",
      { emails: { send } } as unknown as Resend,
    );
    const mensagem = await prepararMensagem(
      notificacao(),
      origem,
      identidadePadrao,
      segredo,
    );
    await expect(provider.enviar(mensagem)).rejects.toThrow(
      /^resend_validation_error$/,
    );
  });
});

describe("webhook Resend com assinatura real do SDK", () => {
  const evento = (tipo: "email.bounced" | "email.complained") => ({
    type: tipo,
    created_at: "2026-10-20T15:00:00.000Z",
    data: {
      email_id: "provedor-123",
      to: ["lia@exemplo.edu.br"],
      ...(tipo === "email.bounced"
        ? {
            bounce: {
              message: "Mailbox missing",
              subType: "NoEmail",
              type: "Permanent",
            },
          }
        : {}),
    },
  });
  function requisicao(
    raw: string,
    enviado = raw,
    timestamp = String(Math.floor(Date.now() / 1000)),
  ) {
    const id = "msg_assinada_local";
    const signature = `v1,${createHmac("sha256", segredo).update(`${id}.${timestamp}.${raw}`).digest("base64")}`;
    return new Request(`${origem}/api/webhooks/resend`, {
      method: "POST",
      headers: {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      },
      body: enviado,
    });
  }
  it.each(["email.bounced", "email.complained"] as const)(
    "verifica corpo bruto e suprime %s sem sessão",
    async (tipo) => {
      expect(
        (await webhook(requisicao(JSON.stringify(evento(tipo), null, 2))))
          .status,
      ).toBe(200);
      expect(contexto.rpc).toHaveBeenCalledWith(
        "registrar_webhook_notificacao",
        {
          p_provedor_id: "provedor-123",
          p_email: "lia@exemplo.edu.br",
          p_evento: tipo,
          p_chave_idempotencia: "msg_assinada_local:lia@exemplo.edu.br",
        },
      );
    },
  );
  it("recusa alteração de bytes, assinatura antiga e campos inesperados antes de mutar", async () => {
    const corpo = JSON.stringify(evento("email.complained"));
    expect((await webhook(requisicao(corpo, `${corpo} `))).status).toBe(400);
    expect(
      (
        await webhook(
          requisicao(corpo, corpo, String(Math.floor(Date.now() / 1000) - 600)),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await webhook(
          requisicao(
            JSON.stringify({ ...evento("email.complained"), inseguro: true }),
          ),
        )
      ).status,
    ).toBe(400);
    expect(contexto.rpc).not.toHaveBeenCalledWith(
      "registrar_webhook_notificacao",
      expect.anything(),
    );
  });
  it("falha fechado para rate limit e indisponibilidade de persistência", async () => {
    contexto.rpc.mockResolvedValue({ data: false, error: null });
    expect(
      (await webhook(requisicao(JSON.stringify(evento("email.complained")))))
        .status,
    ).toBe(429);
    contexto.rpc.mockImplementation(async (nome: string) =>
      nome === "consumir_rate_limit"
        ? { data: true, error: null }
        : { data: null, error: { code: "indisponivel" } },
    );
    expect(
      (await webhook(requisicao(JSON.stringify(evento("email.complained")))))
        .status,
    ).toBe(503);
  });
});
