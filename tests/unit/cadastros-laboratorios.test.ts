import { describe, expect, it, vi } from "vitest";
import { editarLaboratorioCompletoAction } from "@/lib/actions-cadastros";
import {
  laboratorioCompletoSchema,
  laboratorioEdicaoFormularioSchema,
  laboratorioEdicaoSchema,
  laboratorioEdicaoSnapshotSchema,
} from "@/lib/schemas";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ roles: ["admin"] }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const laboratorio = {
  nome: "Laboratório de testes",
  tipo: "informatica",
  capacidade: 30,
  localizacao: "Bloco A",
  descricao: "",
  regras_de_uso: "",
  ativo: true,
  modo_reserva: "slot_fixo",
  granularidade_minutos: 30,
  duracao_minima_minutos: 60,
  duracao_maxima_minutos: 240,
  janelas: [
    { dia_semana: 1, inicio: "08:00", fim: "18:00", duracao_slot_minutos: 60 },
  ],
  equipamentos: [
    {
      nome: "Computador",
      patrimonio: null,
      quantidade: 10,
      status: "ativo",
      reservavel_individualmente: true,
    },
  ],
};
describe("cadastro integrado do laboratório", () => {
  it("aceita funcionamento e equipamento no mesmo cadastro", () => {
    expect(laboratorioCompletoSchema.safeParse(laboratorio).success).toBe(true);
  });
  it("impede laboratório sem funcionamento", () => {
    const resultado = laboratorioCompletoSchema.safeParse({
      ...laboratorio,
      janelas: [],
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success)
      expect(resultado.error.issues[0].path).toEqual(["janelas"]);
  });
  it("aponta o encerramento anterior à abertura", () => {
    const resultado = laboratorioCompletoSchema.safeParse({
      ...laboratorio,
      janelas: [{ ...laboratorio.janelas[0], fim: "07:00" }],
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success)
      expect(
        resultado.error.issues.some(
          (erro) => erro.path.join(".") === "janelas.0.fim",
        ),
      ).toBe(true);
  });
  it("impede sobreposição dos períodos de um mesmo dia", () => {
    expect(
      laboratorioCompletoSchema.safeParse({
        ...laboratorio,
        janelas: [
          ...laboratorio.janelas,
          { ...laboratorio.janelas[0], inicio: "09:00" },
        ],
      }).success,
    ).toBe(false);
  });
  it("permite pausa de almoço e horários em dias diferentes", () => {
    expect(
      laboratorioCompletoSchema.safeParse({
        ...laboratorio,
        janelas: [
          { ...laboratorio.janelas[0], fim: "12:00" },
          { ...laboratorio.janelas[0], inicio: "13:00" },
          { ...laboratorio.janelas[0], dia_semana: 2 },
        ],
      }).success,
    ).toBe(true);
  });
  it("impede períodos onde nenhuma reserva atinge a duração mínima", () => {
    expect(
      laboratorioCompletoSchema.safeParse({
        ...laboratorio,
        janelas: [{ ...laboratorio.janelas[0], fim: "08:30" }],
      }).success,
    ).toBe(false);
  });
  it("considera o arredondamento da duração mínima ao intervalo fixo", () => {
    expect(
      laboratorioCompletoSchema.safeParse({
        ...laboratorio,
        duracao_minima_minutos: 70,
        duracao_maxima_minutos: 90,
      }).success,
    ).toBe(false);
  });
  it("usa a granularidade no modo livre", () => {
    expect(
      laboratorioCompletoSchema.safeParse({
        ...laboratorio,
        modo_reserva: "intervalo_livre",
        granularidade_minutos: 15,
        duracao_minima_minutos: 70,
        duracao_maxima_minutos: 90,
      }).success,
    ).toBe(true);
  });
  it("aponta patrimônio repetido no equipamento correspondente", () => {
    const resultado = laboratorioCompletoSchema.safeParse({
      ...laboratorio,
      equipamentos: [0, 1].map(() => ({
        ...laboratorio.equipamentos[0],
        patrimonio: "PC-001",
      })),
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success)
      expect(
        resultado.error.issues.some(
          (erro) => erro.path.join(".") === "equipamentos.1.patrimonio",
        ),
      ).toBe(true);
  });
  it("permite espaço sem equipamento e rejeita quantidade inválida", () => {
    expect(
      laboratorioCompletoSchema.safeParse({ ...laboratorio, equipamentos: [] })
        .success,
    ).toBe(true);
    expect(
      laboratorioCompletoSchema.safeParse({
        ...laboratorio,
        equipamentos: [{ ...laboratorio.equipamentos[0], quantidade: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe("leitura e edição do laboratório", () => {
  const labId = "00000000-0000-4000-8000-000000000001";
  const janelaId = "00000000-0000-4000-8000-000000000002";
  const { janelas, equipamentos, ...dados } = laboratorio;
  const janela = {
    ...janelas[0],
    id: janelaId,
    laboratorio_id: labId,
    inicio: "08:00:30.123456",
    fim: "24:00:00",
  };
  const leitura = {
    laboratorio: { ...dados, id: labId },
    janelas: [janela],
    equipamentos: [],
    revisao: "a".repeat(64),
    total_janelas: 1,
    total_equipamentos: 0,
  };

  it("mantém literalmente horários legados no retrato recebido do banco", () => {
    const dados = laboratorioEdicaoSnapshotSchema.parse(leitura);
    expect(dados.janelas[0]).toEqual(janela);
  });

  it("recusa retrato parcial, com duplicatas ou com dados de outro laboratório", () => {
    for (const invalido of [
      { ...leitura, janelas: [] },
      { ...leitura, total_equipamentos: 1 },
      { ...leitura, janelas: [janela, janela], total_janelas: 2 },
      { ...leitura, janelas: [{ ...janela, laboratorio_id: janelaId }] },
    ]) {
      expect(laboratorioEdicaoSnapshotSchema.safeParse(invalido).success).toBe(
        false,
      );
    }
  });

  it("permite abrir cadastro legado sem sujeitar a leitura aos limites de criação", () => {
    const campo = {
      ...janelas[0],
      id: janelaId,
      inicio: janela.inicio,
      fim: janela.fim,
    };
    for (const horarios of [[], Array.from({ length: 51 }, () => campo)]) {
      expect(
        laboratorioEdicaoFormularioSchema.safeParse({
          ...dados,
          id: labId,
          janelas: horarios,
          equipamentos,
        }).success,
      ).toBe(true);
    }
  });

  it("exige revisão e impede que um horário persistido seja enviado como novo", () => {
    const edicao = {
      id: labId,
      revisao: leitura.revisao,
      laboratorio: dados,
      janelas: { manter: [janelaId], alterar: [], novas: [], remover: [] },
      equipamentos: [],
    };
    expect(laboratorioEdicaoSchema.safeParse(edicao).success).toBe(true);
    expect(
      laboratorioEdicaoSchema.safeParse({ ...edicao, revisao: "" }).success,
    ).toBe(false);
    expect(
      laboratorioEdicaoSchema.safeParse({
        ...edicao,
        janelas: {
          ...edicao.janelas,
          novas: [{ ...janelas[0], id: janelaId }],
        },
      }).success,
    ).toBe(false);
  });

  it.each([0, 504])(
    "pede recarga quando o transporte não confirma a gravação (%i)",
    async (status) => {
      mocks.revalidatePath.mockClear();
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: "", message: "Resposta não recebida" },
        status,
      });
      const resultado = await editarLaboratorioCompletoAction({
        id: labId,
        revisao: leitura.revisao,
        laboratorio: dados,
        janelas: { manter: [janelaId], alterar: [], novas: [], remover: [] },
        equipamentos: [],
      });
      expect(resultado).toMatchObject({
        ok: false,
        codigo: "RESULTADO_NAO_CONFIRMADO",
      });
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );
});
