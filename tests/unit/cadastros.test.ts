import { expect, it } from "vitest";
import {
  laboratorioSchema,
  bloqueioSchema,
  configuracaoSchema,
} from "@/lib/schemas";
import { labsDemo } from "@/lib/demo";
it("rejeita campos adicionais e durações incoerentes", () => {
  expect(
    laboratorioSchema.safeParse({ ...labsDemo[0], status: "aprovada" }).success,
  ).toBe(false);
  expect(
    laboratorioSchema.safeParse({ ...labsDemo[0], duracao_maxima_minutos: 10 })
      .success,
  ).toBe(false);
});
it("exige motivo explícito para cancelar reservas afetadas", () => {
  expect(
    bloqueioSchema.safeParse({
      laboratorio_id: null,
      inicio: "2027-01-01T10:00:00Z",
      fim: "2027-01-01T12:00:00Z",
      motivo: "feriado",
      descricao: "Recesso",
      cancelar_reservas: true,
      motivo_cancelamento: null,
    }).success,
  ).toBe(false);
});
it("configurações não aceitam chave arbitrária ou domínios inválidos", () => {
  expect(
    configuracaoSchema.safeParse({ chave: "service_role", valor: 10 }).success,
  ).toBe(false);
  expect(
    configuracaoSchema.safeParse({
      chave: "dominios_email_permitidos",
      valor: ["javascript:alert(1)"],
    }).success,
  ).toBe(false);
});
