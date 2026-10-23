import { describe, expect, it } from "vitest";
import { resumirNotificacoes } from "@/lib/notificacoes/resumo";
import type { Notificacao } from "@/lib/types";

const base: Notificacao = {
  id: "10000000-0000-4000-8000-000000000001",
  usuario_id: "20000000-0000-4000-8000-000000000001",
  tipo_evento: "reserva_aprovada",
  template: "reserva_aprovada",
  payload: {
    reserva_id: "30000000-0000-4000-8000-000000000001",
    titulo: "Reserva aprovada",
    mensagem: "Sua atividade foi confirmada.",
    email: "pessoa@example.com",
    token: "campo-que-nao-deve-cruzar-a-fronteira",
    link: "https://example.com/auth?token=privado",
  },
  status: "enviada",
  created_at: "2026-10-23T12:00:00Z",
  lida_em: null,
};

describe("resumo de notificações do cabeçalho", () => {
  it("transfere somente os campos de apresentação e a referência validada", () => {
    expect(resumirNotificacoes([base])).toEqual([
      {
        id: base.id,
        titulo: "Reserva aprovada",
        mensagem: "Sua atividade foi confirmada.",
        criadaEm: base.created_at,
        lidaEm: null,
        reservaId: base.payload.reserva_id,
      },
    ]);
    const resultado = JSON.stringify(resumirNotificacoes([base]));
    expect(resultado).not.toContain("pessoa@example.com");
    expect(resultado).not.toContain("privado");
    expect(resultado).not.toContain("token");
  });

  it.each(["convite", "recuperacao", "recuperacao_senha", "seguranca_conta"])(
    "exclui %s pelo evento ou template além da proteção da RLS",
    (evento) => {
      expect(
        resumirNotificacoes([
          { ...base, tipo_evento: evento },
          { ...base, template: evento },
        ]),
      ).toEqual([]);
    },
  );

  it("recusa caminhos e links no lugar do UUID e limita a prévia", () => {
    const [resumo] = resumirNotificacoes([
      {
        ...base,
        payload: {
          titulo: "A".repeat(1000),
          mensagem: "B".repeat(1000),
          reserva_id: "javascript:alert(1)",
        },
      },
    ]);
    expect(resumo.reservaId).toBeNull();
    expect(resumo.titulo).toHaveLength(160);
    expect(resumo.mensagem).toHaveLength(500);
  });

  it.each([
    ["reserva_criada", "Nova solicitação de reserva", "aguarda análise"],
    [
      "prioridade_substituicao",
      "Solicitação com prioridade para análise",
      "coincide com uma reserva aprovada",
    ],
    [
      "pendencia_monitor",
      "Solicitação pendente de análise",
      "continua pendente",
    ],
    ["reserva_no_show", "Não comparecimento registrado", "não comparecimento"],
  ])(
    "identifica o evento real %s emitido pelo banco",
    (evento, titulo, mensagem) => {
      const [resumo] = resumirNotificacoes([
        {
          ...base,
          tipo_evento: evento,
          template: evento,
          payload: {
            reserva_id: base.payload.reserva_id,
            laboratorio_nome: "Laboratório de Química",
            inicio: "2026-10-23T13:00:00Z",
            email: "pessoa@example.com",
            url: "https://example.com/auth?token=secreto",
            token: "secreto",
          },
        },
      ]);
      expect(resumo.titulo).toBe(titulo);
      expect(resumo.mensagem).toContain(mensagem);
      expect(resumo.mensagem).toContain("Laboratório de Química");
      expect(resumo.mensagem).toContain("23/10/2026");
      expect(resumo.mensagem).toContain("10:00");
      expect(JSON.stringify(resumo)).not.toContain("secreto");
      expect(JSON.stringify(resumo)).not.toContain("pessoa@example.com");
    },
  );

  it("mantém os avisos legíveis quando o payload não tem laboratório ou traz data inválida", () => {
    const [resumo] = resumirNotificacoes([
      {
        ...base,
        tipo_evento: "reserva_criada",
        payload: { inicio: "data inválida" },
      },
    ]);
    expect(resumo.mensagem).toBe("Uma nova solicitação aguarda análise.");
  });
});
