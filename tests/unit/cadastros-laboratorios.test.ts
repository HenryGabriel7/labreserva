import { describe, expect, it } from "vitest";
import { laboratorioCompletoSchema } from "@/lib/schemas";

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
