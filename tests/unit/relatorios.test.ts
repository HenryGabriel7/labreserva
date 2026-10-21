import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
import {
  celulaCsv,
  exportacaoRelatorioSchema,
  filtroAuditoriaSchema,
  gerarCsvRelatorio,
  gerarPdfRelatorio,
  intervaloRelatorio,
  lerJsonLimitado,
  origemPermitida,
  periodoPadrao,
  privacidadeSchema,
  relatorioSchema,
  resumoRelatorio,
  type Relatorio,
} from "@/lib/relatorios";

const mocks = vi.hoisted(() => ({
  usuario: vi.fn(),
  rpc: vi.fn(),
  limite: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.usuario }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.limite }),
}));
import { POST as exportar } from "@/app/api/relatorios/route";
import { POST as privacidade } from "@/app/api/privacidade/route";

const usuarioId = "00000000-0000-4000-8000-000000000005";
const outroId = "00000000-0000-4000-8000-000000000006";
const periodo = { inicio: "2026-10-01", fim: "2026-10-20" };
const relatorio: Relatorio = {
  por_laboratorio: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      nome: "Laboratório de Química",
      total: 8,
      aprovadas: 5,
      pendentes: 2,
      no_shows: 1,
      horas_ocupadas: 12.5,
    },
  ],
  por_papel: [{ papel: "professor", total: 8 }],
  ocorrencias: [{ tipo: "falta_material", gravidade: "baixa", total: 2 }],
};

function request(body: unknown, origin = "https://laboratorios.example") {
  return new Request("https://laboratorios.example/api/relatorios", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://laboratorios.example");
  mocks.usuario.mockReset().mockResolvedValue({
    id: usuarioId,
    nome: "Admin",
    email: "admin@example.org",
    ativo: true,
    roles: ["admin"],
  });
  mocks.limite.mockReset().mockResolvedValue({ data: true, error: null });
  mocks.rpc.mockReset().mockImplementation(async (nome: string) => ({
    data:
      nome === "obter_relatorios" ? relatorio : { perfil: { id: usuarioId } },
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("filtros e formatos institucionais", () => {
  it("usa o dia civil de São Paulo e inclui todo o último dia", () => {
    expect(periodoPadrao(new Date("2026-11-01T01:00:00Z"))).toEqual({
      inicio: "2026-10-01",
      fim: "2026-10-31",
    });
    expect(
      intervaloRelatorio({ inicio: "2026-10-20", fim: "2026-10-20" }),
    ).toEqual({
      p_inicio: "2026-10-20T03:00:00.000Z",
      p_fim: "2026-10-21T03:00:00.000Z",
    });
  });
  it("rejeita campos extras, datas inválidas e intervalos excessivos", () => {
    expect(
      exportacaoRelatorioSchema.safeParse({
        ...periodo,
        formato: "csv",
        admin: true,
      }).success,
    ).toBe(false);
    expect(
      exportacaoRelatorioSchema.safeParse({
        inicio: "2026-02-30",
        fim: "2026-03-01",
        formato: "pdf",
      }).success,
    ).toBe(false);
    expect(
      exportacaoRelatorioSchema.safeParse({
        inicio: "2026-01-01",
        fim: "2027-01-02",
        formato: "pdf",
      }).success,
    ).toBe(false);
    expect(
      filtroAuditoriaSchema.safeParse({
        acao: "eq.aprovar_reserva),or(id.neq.0)",
      }).success,
    ).toBe(false);
  });
  it("preserva o snapshot do papel e converte números Postgres sem aceitar dados pessoais extras", () => {
    expect(relatorioSchema.parse(relatorio).por_papel[0].papel).toBe(
      "professor",
    );
    expect(
      relatorioSchema.safeParse({
        ...relatorio,
        solicitante_email: "privado@example.org",
      }).success,
    ).toBe(false);
    expect(resumoRelatorio(relatorio)).toEqual({
      total: 8,
      aprovadas: 5,
      pendentes: 2,
      noShows: 1,
      horas: 12.5,
    });
  });
  it("CSV preserva acentos, aspas e quebras e neutraliza fórmulas", () => {
    const ataque = '  =HYPERLINK("https://example.org";"abrir")\nQuímica';
    const dados = {
      ...relatorio,
      por_laboratorio: [{ ...relatorio.por_laboratorio[0], nome: ataque }],
    };
    const csv = gerarCsvRelatorio(dados, periodo);
    const resultado = Papa.parse<Record<string, string>>(csv, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
    });
    expect(resultado.errors).toEqual([]);
    expect(resultado.data[0]["Nome ou categoria"]).toBe(`'${ataque}`);
    expect(resultado.data[0]["Horas de sala confirmadas"]).toBe("12.50");
    for (const formula of [
      "+cmd",
      "-1+2",
      "@SUM(A1)",
      "\ttexto",
      "\r=1",
      "\uFEFF=1",
    ])
      expect(celulaCsv(formula).startsWith("\"'")).toBe(true);
  });
  it("gera PDF real paginado, com dados institucionais", async () => {
    const buffer = await gerarPdfRelatorio(
      relatorio,
      periodo,
      new Date("2026-10-20T12:00:00Z"),
    );
    expect(new TextDecoder().decode(buffer.slice(0, 5))).toBe("%PDF-");
    expect(buffer.byteLength).toBeGreaterThan(2000);
  });
  it("falha fechada para Origin ausente ou de outro domínio", () => {
    expect(origemPermitida(null, "https://laboratorios.example")).toBe(false);
    expect(
      origemPermitida("https://evil.example", "https://laboratorios.example"),
    ).toBe(false);
    expect(origemPermitida("https://laboratorios.example", undefined)).toBe(
      false,
    );
    expect(
      origemPermitida(
        "https://laboratorios.example",
        "https://laboratorios.example/app",
      ),
    ).toBe(true);
  });
  it("limita o JSON recebido inclusive sem Content-Length", async () => {
    await expect(
      lerJsonLimitado(request({ texto: "x".repeat(9000) })),
    ).rejects.toThrow("ENTRADA_INVALIDA");
  });
});

describe("exportação reautenticada e auditada", () => {
  it("nega Origin incorreta antes de consultar a sessão", async () => {
    expect(
      (
        await exportar(
          request({ ...periodo, formato: "csv" }, "https://evil.example"),
        )
      ).status,
    ).toBe(403);
    expect(mocks.usuario).not.toHaveBeenCalled();
  });
  it("demonstração ou sessão ausente não exporta dados", async () => {
    mocks.usuario.mockResolvedValue(null);
    expect(
      (await exportar(request({ ...periodo, formato: "csv" }))).status,
    ).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("papel comum não exporta relatórios administrativos", async () => {
    mocks.usuario.mockResolvedValue({ id: usuarioId, roles: ["aluno"] });
    expect(
      (await exportar(request({ ...periodo, formato: "csv" }))).status,
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("getUser é requerido e o arquivo só sai após registrar a exportação", async () => {
    const resposta = await exportar(request({ ...periodo, formato: "csv" }));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toContain("text/csv");
    expect(mocks.usuario).toHaveBeenCalledWith({ sensitive: true });
    expect(mocks.rpc).toHaveBeenCalledWith("obter_relatorios", {
      p_inicio: "2026-10-01T03:00:00.000Z",
      p_fim: "2026-10-21T03:00:00.000Z",
      p_laboratorio_id: null,
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith("registrar_exportacao", {
      p_formato: "csv",
      p_filtros: { ...periodo, laboratorio_id: null },
    });
  });
  it("falha da auditoria impede entregar o arquivo", async () => {
    mocks.rpc.mockImplementation(async (nome: string) => ({
      data: nome === "obter_relatorios" ? relatorio : null,
      error: nome === "registrar_exportacao" ? { code: "42501" } : null,
    }));
    const resposta = await exportar(request({ ...periodo, formato: "pdf" }));
    expect(resposta.status).toBe(503);
    expect(resposta.headers.get("content-type")).toContain("application/json");
  });
  it("limite excedido não dispara a consulta", async () => {
    mocks.limite.mockResolvedValue({ data: false, error: null });
    expect(
      (await exportar(request({ ...periodo, formato: "csv" }))).status,
    ).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("direitos de privacidade", () => {
  it("anonimização exige UUID, motivo e payload estrito", () => {
    expect(
      privacidadeSchema.safeParse({
        acao: "anonimizar",
        usuario_id: usuarioId,
        motivo: "curto",
      }).success,
    ).toBe(false);
    expect(
      privacidadeSchema.safeParse({
        acao: "exportar",
        usuario_id: usuarioId,
        papel: "admin",
      }).success,
    ).toBe(false);
  });
  it("aluno exporta os próprios dados e não dados de outro ID", async () => {
    mocks.usuario.mockResolvedValue({ id: usuarioId, roles: ["aluno"] });
    expect((await privacidade(request({ acao: "exportar" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("exportar_dados_usuario", {
      p_usuario_id: usuarioId,
    });
    mocks.rpc.mockClear();
    expect(
      (await privacidade(request({ acao: "exportar", usuario_id: outroId })))
        .status,
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("somente admin pode anonimizar e a alteração usa RPC com motivo", async () => {
    const payload = {
      acao: "anonimizar",
      usuario_id: outroId,
      motivo: "Solicitação formal validada pela instituição.",
    };
    mocks.usuario.mockResolvedValue({ id: usuarioId, roles: ["aluno"] });
    expect((await privacidade(request(payload))).status).toBe(403);
    mocks.usuario.mockResolvedValue({ id: usuarioId, roles: ["admin"] });
    expect((await privacidade(request(payload))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("anonimizar_usuario", {
      p_usuario_id: outroId,
      p_motivo: payload.motivo,
    });
  });
});
