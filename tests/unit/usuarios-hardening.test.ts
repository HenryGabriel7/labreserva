import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const contexto = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  adminRpc: vi.fn(),
  adminFrom: vi.fn(),
  generateLink: vi.fn(),
  existente: null as { id: string } | null,
  orcamentoEmail: true,
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: contexto.getCurrentUser }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: contexto.adminRpc,
    from: contexto.adminFrom,
    auth: { admin: { generateLink: contexto.generateLink } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { POST } from "@/app/api/usuarios/route";

const criarRequest = (
  dados: unknown,
  origem: string | null = "https://portal.teste",
) =>
  new NextRequest("https://portal.teste/api/usuarios", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origem ? { Origin: origem } : {}),
    },
    body: JSON.stringify(dados),
  });
const convite = {
  nome: "Pessoa Exemplo",
  email: "pessoa@teste.edu.br",
  matricula: "2026001",
  papeis: ["aluno"],
};

describe("hardening de convites administrativos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_URL", "https://portal.teste");
    contexto.existente = null;
    contexto.orcamentoEmail = true;
    contexto.getCurrentUser.mockResolvedValue({
      id: "a1000000-0000-4000-8000-000000000003",
      nome: "Admin",
      email: "admin@teste.edu.br",
      ativo: true,
      roles: ["admin"],
    });
    contexto.adminFrom.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { valor: [] }, error: null }),
          maybeSingle: async () => ({ data: contexto.existente, error: null }),
        }),
      }),
    }));
    contexto.adminRpc.mockImplementation(
      async (nome: string, parametros: { p_chave?: string }) => ({
        data:
          nome === "consumir_rate_limit"
            ? parametros.p_chave?.startsWith("convite-email:")
              ? contexto.orcamentoEmail
              : true
            : "a1000000-0000-4000-8000-000000000001",
        error: null,
      }),
    );
    contexto.generateLink.mockResolvedValue({
      data: {
        user: { id: "a1000000-0000-4000-8000-000000000001" },
        properties: { hashed_token: "segredo-bearer-nao-retornar" },
      },
      error: null,
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("nega Origin ausente ou externo antes de usar o serviço administrativo", async () => {
    expect((await POST(criarRequest(convite, null))).status).toBe(403);
    expect(
      (await POST(criarRequest(convite, "https://outra-origem.teste"))).status,
    ).toBe(403);
    expect(contexto.getCurrentUser).not.toHaveBeenCalled();
    expect(contexto.generateLink).not.toHaveBeenCalled();
  });
  it("revalida sessão sensível e papel antes de gerar qualquer link", async () => {
    contexto.getCurrentUser.mockResolvedValue({
      id: "a1000000-0000-4000-8000-000000000001",
      roles: ["aluno"],
    });
    expect((await POST(criarRequest(convite))).status).toBe(403);
    expect(contexto.getCurrentUser).toHaveBeenCalledWith({ sensitive: true });
    expect(contexto.adminRpc).not.toHaveBeenCalled();
    expect(contexto.generateLink).not.toHaveBeenCalled();
  });
  it("preserva o token anterior quando o profile já existe", async () => {
    contexto.existente = { id: "a1000000-0000-4000-8000-000000000001" };
    const response = await POST(criarRequest(convite));
    expect(response.status).toBe(422);
    expect(contexto.generateLink).not.toHaveBeenCalled();
    expect(contexto.adminRpc).not.toHaveBeenCalledWith(
      "provisionar_usuario",
      expect.anything(),
    );
  });
  it("reserva orçamento por email antes de generateLink para impedir reemissão concorrente", async () => {
    contexto.orcamentoEmail = false;
    expect((await POST(criarRequest(convite))).status).toBe(422);
    expect(contexto.adminRpc).toHaveBeenCalledWith(
      "consumir_rate_limit",
      expect.objectContaining({
        p_chave: expect.stringMatching(/^convite-email:[a-f0-9]{64}$/),
        p_limite: 1,
        p_janela_segundos: 600,
      }),
    );
    expect(contexto.generateLink).not.toHaveBeenCalled();
  });
  it("valida todo o CSV antes de produzir identidades Auth", async () => {
    const csv =
      "nome,email,matricula,papeis\nPessoa Boa,boa@teste.edu.br,1,aluno\nPessoa Ruim,invalido,2,aluno";
    expect((await POST(criarRequest({ csv }))).status).toBe(400);
    expect(contexto.generateLink).not.toHaveBeenCalled();
  });
  it("gera somente invite e passa o bearer para a fila sem retorná-lo", async () => {
    const response = await POST(criarRequest(convite));
    expect(response.status).toBe(201);
    expect(contexto.generateLink).toHaveBeenCalledWith({
      type: "invite",
      email: convite.email,
      options: { redirectTo: "https://portal.teste/definir-senha" },
    });
    expect(contexto.adminRpc).toHaveBeenCalledWith(
      "provisionar_usuario",
      expect.objectContaining({
        p_token_hash: "segredo-bearer-nao-retornar",
        p_papeis: ["aluno"],
      }),
    );
    const corpo = await response.text();
    expect(corpo).not.toContain("segredo-bearer");
    expect(corpo).not.toContain("token_hash");
    expect(JSON.parse(corpo)).toEqual({ criados: 1, erros: [] });
  });
});
