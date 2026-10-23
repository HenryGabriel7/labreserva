import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  limite: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.limite }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { solicitarReservaAction } from "@/lib/actions-reservas";

const entrada = {
  laboratorioId: "00000000-0000-4000-8000-000000000001",
  inicio: "2026-11-02T12:00:00.000Z",
  fim: "2026-11-02T13:00:00.000Z",
  escopo: "laboratorio",
  finalidade: "Atividade prática da turma",
  nParticipantes: 3,
  justificativaPrioridade: "",
  equipamentos: [],
  recorrencia: null,
};

describe("solicitar reserva: contrato servidor/formulário", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "pessoa", roles: ["aluno"] });
    mocks.limite.mockResolvedValue({ data: true, error: null });
    mocks.rpc.mockResolvedValue({
      data: { reserva_ids: ["reserva-nova"] },
      error: null,
    });
  });
  it("erro de duração marca término e não informa sucesso nem revalida", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "DURACAO_INVALIDA" },
    });
    const retorno = await solicitarReservaAction(entrada);
    expect(retorno).toMatchObject({
      ok: false,
      campo: "horaFim",
      mensagem: "Confira a duração mínima e máxima permitidas.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("erro de funcionamento marca início sem revelar detalhes do banco", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "FORA_DA_JANELA",
        details: "SQL privado",
      },
    });
    const retorno = await solicitarReservaAction(entrada);
    expect(retorno).toMatchObject({ ok: false, campo: "horaInicio" });
    expect(JSON.stringify(retorno)).not.toContain("SQL privado");
  });
  it("reserva válida chama RPC uma vez, mantém UTC e devolve confirmação só após persistir", async () => {
    const retorno = await solicitarReservaAction(entrada);
    expect(retorno).toMatchObject({
      ok: true,
      dados: { reserva_ids: ["reserva-nova"] },
    });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("solicitar_reserva", {
      p_laboratorio_id: entrada.laboratorioId,
      p_inicio: entrada.inicio,
      p_fim: entrada.fim,
      p_escopo: "laboratorio",
      p_finalidade: entrada.finalidade,
      p_n_participantes: 3,
      p_justificativa_prioridade: null,
      p_equipamentos: [],
      p_recorrencia: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout");
  });
  it("entrada malformada aponta campo e não consome limite nem chama RPC", async () => {
    const retorno = await solicitarReservaAction({
      ...entrada,
      fim: "inválido",
    });
    expect(retorno).toMatchObject({ ok: false, campo: "horaFim" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.limite).not.toHaveBeenCalled();
  });
  it("aluno não forja recorrência e rate limit impede envio", async () => {
    const proibido = await solicitarReservaAction({
      ...entrada,
      justificativaPrioridade: "Sou prioridade",
    });
    expect(proibido.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.limite).not.toHaveBeenCalled();
    mocks.limite.mockResolvedValue({ data: false, error: null });
    const limitado = await solicitarReservaAction(entrada);
    expect(limitado.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("erro inesperado não é interpretado como campo nem exibe SQL", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "password=segredo SELECT privado" },
    });
    const retorno = await solicitarReservaAction(entrada);
    expect(retorno).toMatchObject({ ok: false, campo: undefined });
    expect(JSON.stringify(retorno)).not.toMatch(/segredo|SELECT|privado/);
  });
});
