import { beforeEach, describe, expect, it, vi } from "vitest";

const contexto = vi.hoisted(() => ({
  configurado: true,
  getClaims: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  perfil: {
    data: {
      id: "10000000-0000-4000-8000-000000000001",
      nome: "Ana Lima",
      email: "ana@exemplo.edu.br",
      ativo: true,
    },
    error: null,
  } as { data: unknown; error: unknown },
  roles: { data: [{ papel: "aluno" }, { papel: "monitor" }], error: null } as {
    data: unknown;
    error: unknown;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseConfiguration: () => contexto.configurado,
  createClient: async () => ({
    auth: { getClaims: contexto.getClaims, getUser: contexto.getUser },
    from: contexto.from,
  }),
}));

import { getCurrentUser, requireUser } from "@/lib/auth";

describe("autorização no servidor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contexto.configurado = true;
    contexto.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
          user_metadata: { papel: "admin" },
        },
      },
      error: null,
    });
    contexto.getUser.mockResolvedValue({
      data: { user: { id: "10000000-0000-4000-8000-000000000001" } },
      error: null,
    });
    contexto.perfil = {
      data: {
        id: "10000000-0000-4000-8000-000000000001",
        nome: "Ana Lima",
        email: "ana@exemplo.edu.br",
        ativo: true,
      },
      error: null,
    };
    contexto.roles = {
      data: [{ papel: "aluno" }, { papel: "monitor" }],
      error: null,
    };
    contexto.from.mockImplementation((tabela: string) => ({
      select: () => ({
        eq: () =>
          tabela === "profiles"
            ? { maybeSingle: async () => contexto.perfil }
            : Promise.resolve(contexto.roles),
      }),
    }));
  });
  it("usa somente papéis consultados no banco, sem user_metadata", async () => {
    const usuario = await getCurrentUser();
    expect(usuario?.roles).toEqual(["aluno", "monitor"]);
    expect(usuario?.roles).not.toContain("admin");
    expect(contexto.getClaims).toHaveBeenCalledOnce();
    expect(contexto.getUser).not.toHaveBeenCalled();
  });
  it("rejeita cookies não verificados antes de ler perfis", async () => {
    contexto.getClaims.mockResolvedValue({
      data: null,
      error: new Error("JWT inválido"),
    });
    expect(await getCurrentUser()).toBeNull();
    expect(contexto.from).not.toHaveBeenCalled();
  });
  it("revalida getUser em ações sensíveis e rejeita sessão revogada", async () => {
    contexto.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("Revogada"),
    });
    expect(await getCurrentUser({ sensitive: true })).toBeNull();
    expect(contexto.getUser).toHaveBeenCalledOnce();
    expect(contexto.from).not.toHaveBeenCalled();
  });
  it("falha fechado para conta inativa, erro de banco e papéis ausentes ou desconhecidos", async () => {
    contexto.perfil.data = {
      id: "10000000-0000-4000-8000-000000000001",
      nome: "Ana",
      email: "ana@exemplo.edu.br",
      ativo: false,
    };
    expect(await getCurrentUser()).toBeNull();
    contexto.perfil = { data: null, error: new Error("Banco indisponível") };
    expect(await getCurrentUser()).toBeNull();
    contexto.perfil = {
      data: {
        id: "10000000-0000-4000-8000-000000000001",
        nome: "Ana",
        email: "ana@exemplo.edu.br",
        ativo: true,
      },
      error: null,
    };
    contexto.roles.data = [];
    expect(await getCurrentUser()).toBeNull();
    contexto.roles.data = [{ papel: "superadmin" }];
    expect(await getCurrentUser()).toBeNull();
  });
  it("redireciona a página sem sessão ou sem papel suficiente", async () => {
    await expect(requireUser(["admin"])).rejects.toThrow(
      "REDIRECT:/acesso-negado",
    );
    contexto.configurado = false;
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });
});
