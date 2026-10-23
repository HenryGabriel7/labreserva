import { expect, it } from "vitest";
import {
  prioridadeSolicitante,
  ordenarSolicitacoes,
  intervaloValido,
  horariosSlots,
  diasCalendario,
  validarHorarioReserva,
  campoErroReserva,
} from "@/lib/reservas";
import { reservaSchema, reservaFormularioSchema } from "@/lib/schemas-reservas";
import { labsDemo, janelasDemo } from "@/lib/demo";
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

const laboratorio = { ...labsDemo[0], modo_reserva: "slot_fixo" as const };
const contextoHorario = {
  laboratorio,
  janelas: janelasDemo,
  data: "2026-11-02",
  horaInicio: "09:00",
  horaFim: "10:00",
  politica: { antecedenciaMinHoras: 1, antecedenciaMaxDias: 90 },
  agora: new Date("2026-11-01T12:00:00Z"),
};
it("explica a duração rejeitada com limites, duração selecionada e campo", () => {
  const erros = validarHorarioReserva({ ...contextoHorario, horaFim: "09:30" });
  expect(erros).toEqual([
    {
      campo: "horaFim",
      mensagem: expect.stringMatching(/60 a 240 minutos.*30 minutos.*término/),
    },
  ]);
});
it("diferencia início e término desalinhados em slot fixo", () => {
  expect(
    validarHorarioReserva({
      ...contextoHorario,
      horaInicio: "09:15",
      horaFim: "10:15",
    }),
  ).toEqual([
    {
      campo: "horaInicio",
      mensagem: expect.stringMatching(/60 minutos.*08:00.*início/),
    },
  ]);
  expect(
    validarHorarioReserva({ ...contextoHorario, horaFim: "10:15" }),
  ).toEqual([
    {
      campo: "horaFim",
      mensagem: expect.stringMatching(/60 minutos.*término/),
    },
  ]);
  expect(validarHorarioReserva(contextoHorario)).toEqual([]);
});
it("aceita janela posterior e alinha a partir da abertura, sem atravessar o intervalo fechado", () => {
  const base = {
    ...janelasDemo[0],
    laboratorio_id: laboratorio.id,
    dia_semana: 1,
  };
  const janelas = [
    { ...base, inicio: "08:30:00", fim: "12:30:00" },
    { ...base, id: "tarde", inicio: "14:30:00", fim: "18:30:00" },
  ];
  expect(
    validarHorarioReserva({
      ...contextoHorario,
      janelas,
      horaInicio: "14:30",
      horaFim: "15:30",
    }),
  ).toEqual([]);
  expect(
    validarHorarioReserva({
      ...contextoHorario,
      janelas,
      horaInicio: "12:30",
      horaFim: "14:30",
    }),
  ).toEqual([
    {
      campo: "horaInicio",
      mensagem: expect.stringContaining("dentro do mesmo período"),
    },
  ]);
});
it("explica a falta de funcionamento e distingue o dia fechado", () => {
  expect(validarHorarioReserva({ ...contextoHorario, janelas: [] })).toEqual([
    {
      campo: "data",
      mensagem: expect.stringContaining("não tem funcionamento cadastrado"),
    },
  ]);
  expect(
    validarHorarioReserva({ ...contextoHorario, data: "2026-11-07" })[0]?.campo,
  ).toBe("data");
});
it("horários futuros respeitam antecedência real e fuso Brasília", () => {
  expect(
    validarHorarioReserva({
      ...contextoHorario,
      agora: new Date("2026-11-02T11:30:00Z"),
    })[0],
  ).toEqual({
    campo: "horaInicio",
    mensagem: expect.stringContaining("1 hora(s) de antecedência"),
  });
  expect(
    validarHorarioReserva({
      ...contextoHorario,
      agora: new Date("2026-11-02T12:00:00Z"),
    })[0]?.campo,
  ).toBe("horaInicio");
  expect(
    validarHorarioReserva({ ...contextoHorario, data: "2027-03-01" })[0]?.campo,
  ).toBe("data");
});
it("intervalo livre usa a granularidade do laboratório em vez do slot", () => {
  const livre = {
    ...laboratorio,
    modo_reserva: "intervalo_livre" as const,
    granularidade_minutos: 15,
    duracao_minima_minutos: 30,
  };
  expect(
    validarHorarioReserva({
      ...contextoHorario,
      laboratorio: livre,
      horaInicio: "09:15",
      horaFim: "09:45",
    }),
  ).toEqual([]);
  expect(
    validarHorarioReserva({
      ...contextoHorario,
      laboratorio: livre,
      horaInicio: "09:17",
      horaFim: "09:47",
    })[0]?.campo,
  ).toBe("horaInicio");
});
it("direciona erros RPC conhecidos ao campo e não usa detalhes internos", () => {
  expect(campoErroReserva({ code: "P0001", message: "DURACAO_INVALIDA" })).toBe(
    "horaFim",
  );
  expect(campoErroReserva({ message: "FORA_DA_JANELA" })).toBe("horaInicio");
  expect(campoErroReserva({ message: "SQL secreto" })).toBeUndefined();
  expect(campoErroReserva({ message: "__proto__" })).toBeUndefined();
});
it("horários vazios não recebem valores artificiais e apontam seu campo", () => {
  const resultado = reservaFormularioSchema.safeParse({
    laboratorioId: laboratorio.id,
    data: "2026-11-02",
    horaInicio: "",
    horaFim: "",
    escopo: "laboratorio",
    finalidade: "Aula prática",
    nParticipantes: 1,
    justificativaPrioridade: "",
    equipamentos: [],
    repetir: false,
    dataFim: "",
    excecoes: "",
  });
  expect(resultado.success).toBe(false);
  if (!resultado.success)
    expect(resultado.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["horaInicio"],
          message: "Informe um horário de início válido.",
        }),
        expect.objectContaining({
          path: ["horaFim"],
          message: "Informe um horário de término válido.",
        }),
      ]),
    );
});

it("recorrência desmarcada não fica bloqueada por uma exceção agora oculta", () => {
  const entrada = {
    laboratorioId: laboratorio.id,
    data: "2026-11-02",
    horaInicio: "09:00",
    horaFim: "10:00",
    escopo: "laboratorio",
    finalidade: "Aula prática",
    nParticipantes: 1,
    justificativaPrioridade: "",
    equipamentos: [],
    repetir: false,
    dataFim: "",
    excecoes: "data digitada incorretamente",
  };
  expect(reservaFormularioSchema.safeParse(entrada).success).toBe(true);
  expect(
    reservaFormularioSchema.safeParse({
      ...entrada,
      repetir: true,
      dataFim: "2026-11-30",
    }).success,
  ).toBe(false);
});
