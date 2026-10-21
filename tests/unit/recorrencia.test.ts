import { expect, it } from "vitest";
import { gerarDatasRecorrencia, somarMesesCivil } from "@/lib/recorrencia";
it("gera datas semanais civis e pula exceções e feriados", () => {
  expect(
    gerarDatasRecorrencia({
      dataInicio: "2026-10-01",
      dataFim: "2026-10-31",
      diaSemana: 2,
      excecoes: ["2026-10-13"],
      feriados: ["2026-10-20"],
    }),
  ).toEqual({ datas: ["2026-10-06", "2026-10-27"], puladas: ["2026-10-20"] });
});
it("limita meses pelo calendário inclusive fim de mês", () => {
  expect(somarMesesCivil("2026-08-31", 6)).toBe("2027-02-28");
  expect(() =>
    gerarDatasRecorrencia({
      dataInicio: "2026-08-31",
      dataFim: "2027-03-01",
      diaSemana: 1,
    }),
  ).toThrow();
});
it("recusa datas e intervalos inválidos sem laço infinito", () => {
  expect(() =>
    gerarDatasRecorrencia({
      dataInicio: "2026-10-31",
      dataFim: "2026-10-01",
      diaSemana: 1,
    }),
  ).toThrow();
  expect(() =>
    gerarDatasRecorrencia({
      dataInicio: "2026-02-30",
      dataFim: "2026-03-10",
      diaSemana: 1,
    }),
  ).toThrow();
});
