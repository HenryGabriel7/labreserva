import { z } from "@/lib/validacao";
import { tiposLaboratorio, papeis } from "./types";
export const uuidSchema = z.uuid();
export const laboratorioSchema = z
  .object({
    id: uuidSchema.optional(),
    nome: z.string().trim().min(2).max(150),
    tipo: z.enum(tiposLaboratorio),
    capacidade: z.number().int().min(1).max(10000),
    localizacao: z.string().trim().min(2).max(200),
    descricao: z.string().max(2000),
    regras_de_uso: z.string().max(4000),
    ativo: z.boolean(),
    modo_reserva: z.enum(["slot_fixo", "intervalo_livre"]),
    granularidade_minutos: z.number().int().min(1).max(240),
    duracao_minima_minutos: z.number().int().min(1).max(1440),
    duracao_maxima_minutos: z.number().int().min(1).max(1440),
  })
  .strict()
  .refine((v) => v.duracao_maxima_minutos >= v.duracao_minima_minutos, {
    message: "Duração máxima precisa ser maior ou igual à mínima",
    path: ["duracao_maxima_minutos"],
  });
export const equipamentoSchema = z
  .object({
    id: uuidSchema.optional(),
    laboratorio_id: uuidSchema,
    nome: z.string().trim().min(2).max(150),
    patrimonio: z.string().trim().max(100).nullable(),
    quantidade: z.number().int().min(1).max(100000),
    status: z.enum(["ativo", "manutencao", "inativo"]),
    reservavel_individualmente: z.boolean(),
  })
  .strict();
const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
export const janelaSchema = z
  .object({
    id: uuidSchema.optional(),
    laboratorio_id: uuidSchema,
    dia_semana: z.number().int().min(0).max(6),
    inicio: horaSchema,
    fim: horaSchema,
    duracao_slot_minutos: z.number().int().min(1).max(720),
  })
  .strict()
  .refine((v) => v.fim > v.inicio, {
    message: "O fim precisa ser depois do início",
    path: ["fim"],
  });
const funcionamentoLaboratorioSchema = z
  .object({
    dia_semana: z.number().int().min(0).max(6),
    inicio: horaSchema,
    fim: horaSchema,
    duracao_slot_minutos: z.number().int().min(1).max(720),
  })
  .strict();
const equipamentoLaboratorioSchema = equipamentoSchema.omit({
  laboratorio_id: true,
});
const minutosHorario = (hora: string) =>
  Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
export const laboratorioCompletoSchema = laboratorioSchema
  .safeExtend({
    janelas: z
      .array(funcionamentoLaboratorioSchema)
      .min(1, "Adicione pelo menos um horário de funcionamento.")
      .max(50),
    equipamentos: z.array(equipamentoLaboratorioSchema).max(100),
  })
  .superRefine((v, ctx) => {
    v.janelas.forEach((janela, i) => {
      const inicio = minutosHorario(janela.inicio);
      const fim = minutosHorario(janela.fim);
      const passo =
        v.modo_reserva === "slot_fixo"
          ? janela.duracao_slot_minutos
          : v.granularidade_minutos;
      const menorReserva = Math.ceil(v.duracao_minima_minutos / passo) * passo;
      if (fim <= inicio)
        ctx.addIssue({
          code: "custom",
          message: "O encerramento precisa ser depois da abertura.",
          path: ["janelas", i, "fim"],
        });
      else if (
        menorReserva > fim - inicio ||
        menorReserva > v.duracao_maxima_minutos
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Este horário não comporta uma reserva válida. Confira a duração mínima, máxima e o intervalo entre horários.",
          path: ["janelas", i, "duracao_slot_minutos"],
        });
      if (
        (janela.inicio.slice(5) && janela.inicio.slice(5) !== ":00") ||
        (janela.fim.slice(5) && janela.fim.slice(5) !== ":00")
      )
        ctx.addIssue({
          code: "custom",
          message: "Use horários sem segundos.",
          path: ["janelas", i, "inicio"],
        });
      if (
        v.janelas.some(
          (outra, j) =>
            j < i &&
            outra.dia_semana === janela.dia_semana &&
            minutosHorario(outra.inicio) < fim &&
            minutosHorario(outra.fim) > inicio,
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Este horário se sobrepõe a outro funcionamento do mesmo dia.",
          path: ["janelas", i, "inicio"],
        });
    });
    v.equipamentos.forEach((item, i) => {
      if (
        item.patrimonio &&
        v.equipamentos.some(
          (outro, j) => j < i && outro.patrimonio === item.patrimonio,
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Este patrimônio já foi informado em outro equipamento.",
          path: ["equipamentos", i, "patrimonio"],
        });
      if (
        item.id &&
        v.equipamentos.some((outro, j) => j < i && outro.id === item.id)
      )
        ctx.addIssue({
          code: "custom",
          message: "Equipamento repetido.",
          path: ["equipamentos", i, "nome"],
        });
    });
  });
export type LaboratorioCompleto = z.infer<typeof laboratorioCompletoSchema>;
export const bloqueioSchema = z
  .object({
    id: uuidSchema.optional(),
    laboratorio_id: uuidSchema.nullable(),
    inicio: z.iso.datetime({ offset: true }),
    fim: z.iso.datetime({ offset: true }),
    motivo: z.enum(["feriado", "manutencao", "evento"]),
    descricao: z.string().trim().min(3).max(2000),
    cancelar_reservas: z.boolean(),
    motivo_cancelamento: z.string().max(2000).nullable(),
  })
  .strict()
  .refine((v) => new Date(v.fim) > new Date(v.inicio), {
    message: "O fim precisa ser depois do início",
    path: ["fim"],
  })
  .refine(
    (v) => !v.cancelar_reservas || Boolean(v.motivo_cancelamento?.trim()),
    { message: "Justifique os cancelamentos", path: ["motivo_cancelamento"] },
  );
export const configuracaoSchema = z.discriminatedUnion("chave", [
  z
    .object({
      chave: z.enum([
        "cancelamento_prazo_horas",
        "antecedencia_min_horas",
        "antecedencia_max_dias",
        "noshow_tolerancia_minutos",
        "pendencia_lembrete_horas",
        "pendencia_alerta_admin_horas",
        "recorrencia_max_meses",
        "login_max_falhas",
        "login_bloqueio_minutos",
      ]),
      valor: z.number().int().min(1).max(8760),
    })
    .strict(),
  z
    .object({
      chave: z.literal("dominios_email_permitidos"),
      valor: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(100),
    })
    .strict(),
  z
    .object({
      chave: z.literal("identidade_visual"),
      valor: z
        .object({
          nome: z.string().min(2).max(150),
          cor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          logo_url: z.union([z.literal(""), z.url().startsWith("https://")]),
        })
        .strict(),
    })
    .strict(),
]);
export const filtroCatalogoSchema = z
  .object({
    q: z.string().max(100).optional(),
    tipo: z.enum([...tiposLaboratorio, ""]).optional(),
    capacidade: z.coerce.number().int().min(0).max(10000).optional(),
    equipamento: z.string().max(100).optional(),
    pagina: z.coerce.number().int().min(1).max(10000).optional(),
  })
  .strict();
export { papeis };
