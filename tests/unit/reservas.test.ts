import { expect, it } from "vitest";
import {
  prioridadeSolicitante,
  ordenarSolicitacoes,
  intervaloValido,
  horariosSlots,
  diasCalendario,
} from "@/lib/reservas";
import { reservaSchema } from "@/lib/schemas-reservas";
it("papeis acumulados elevam prioridade só professor ou funcionário", () => {
  expect(prioridadeSolicitante(["aluno", "monitor", "admin"])).toBe(1);
  expect(prioridadeSolicitante(["funcionario", "monitor"])).toBe(2);
  expect(prioridadeSolicitante(["professor"])).toBe(2);
});
it("ordena prioridade e chegada sem alterar a lista original", () => {
  const a = [
    { id: "a", prioridade_efetiva: 1, created_at: "2026-10-01" },
    { id: "b", prioridade_efetiva: 2, created_at: "2026-10-03" },
    { id: "c", prioridade_efetiva: 2, created_at: "2026-10-02" },
  ];
  expect(ordenarSolicitacoes(a).map((r) => r.id)).toEqual(["c", "b", "a"]);
  expect(a[0].id).toBe("a");
});
it("valida slots consecutivos e intervalos alinhados à janela", () => {
  const base = {
    abertura: "08:00",
    fechamento: "22:00",
    granularidade: 15,
    slot: 60,
    minima: 30,
    maxima: 240,
  };
  expect(
    intervaloValido({
      ...base,
      inicio: "09:00",
      fim: "11:00",
      modo: "slot_fixo",
    }),
  ).toBe(true);
  expect(
    intervaloValido({
      ...base,
      inicio: "09:15",
      fim: "11:15",
      modo: "slot_fixo",
    }),
  ).toBe(false);
  expect(
    intervaloValido({
      ...base,
      inicio: "09:15",
      fim: "10:00",
      modo: "intervalo_livre",
    }),
  ).toBe(true);
  expect(
    intervaloValido({
      ...base,
      inicio: "09:17",
      fim: "10:00",
      modo: "intervalo_livre",
    }),
  ).toBe(false);
  expect(horariosSlots("08:00", "10:00", 60)).toEqual([
    "08:00",
    "09:00",
    "10:00",
  ]);
});
it("o calendário mantém datas civis entre viradas de mês/ano", () => {
  expect(diasCalendario("2026-12-31", "semana")).toEqual([
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
  expect(diasCalendario("2026-10-20", "mes")).toHaveLength(42);
});
it("entrada de reserva não permite solicitante ou status forjado", () => {
  const v = {
    laboratorioId: "00000000-0000-4000-8000-000000000001",
    inicio: "2026-12-01T15:00:00Z",
    fim: "2026-12-01T16:00:00Z",
    escopo: "laboratorio",
    finalidade: "Aula prática",
    nParticipantes: 10,
    justificativaPrioridade: "",
    equipamentos: [],
  };
  expect(reservaSchema.safeParse(v).success).toBe(true);
  expect(reservaSchema.safeParse({ ...v, status: "aprovada" }).success).toBe(
    false,
  );
  expect(
    reservaSchema.safeParse({ ...v, escopo: "equipamentos" }).success,
  ).toBe(false);
});
