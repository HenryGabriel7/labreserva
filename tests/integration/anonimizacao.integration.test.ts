import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ambienteLocal,
  clienteServico,
  criarPessoa,
  exigirSucesso,
  motivoSemSupabase,
} from "./helpers";

describe.skipIf(!ambienteLocal)(
  `Anonimização da fila local${ambienteLocal ? "" : ` — ${motivoSemSupabase}`}`,
  () => {
    it("uma resposta do worker concorrente não restaura dados já redigidos", async () => {
      const worker = clienteServico();
      const [aluno, admin] = await Promise.all([
        criarPessoa("aluno", worker),
        criarPessoa("admin", worker),
      ]);
      const id = randomUUID();
      const envelope = { para: aluno.email, html: "conteúdo fictício" };
      exigirSucesso(
        await worker.from("notificacoes").insert({
          id,
          usuario_id: aluno.id,
          tipo_evento: "recuperacao",
          template: "recuperacao",
          destinatario_email: aluno.email,
          status: "enviando",
          payload: { token: "privado-e-ficticio" },
          chave_idempotencia: `recovery-test:privado-e-ficticio:${id}`,
          mensagem_email: envelope,
          mensagem_preparada_em: new Date().toISOString(),
        }),
        "Criar fixture de retirada já preparada",
      );

      const [anonimizacao, registro] = await Promise.all([
        admin.cliente.rpc("anonimizar_usuario", {
          p_usuario_id: aluno.id,
          p_motivo: "Finalidade encerrada no ensaio local.",
        }),
        worker.rpc("registrar_entrega_notificacao", {
          p_id: id,
          p_provedor_id: "resposta-concorrente-ficticia",
        }),
      ]);
      exigirSucesso(anonimizacao, "Anonimizar enquanto o worker registra");
      // Se o registro foi anterior, a anonimização o remove. Se foi posterior,
      // o banco rejeita a resposta porque a linha deixou de ser elegível.
      if (registro.error) {
        expect(registro.error.message).toBe("NOTIFICACAO_NAO_RECLAMADA");
      }

      const dados = exigirSucesso(
        await worker.from("notificacoes").select("*").eq("id", id).single(),
        "Conferir a fila após a corrida",
      );
      expect(dados).toMatchObject({
        usuario_id: aluno.id,
        payload: { anonimizada: true },
        destinatario_email: "anonimizado@anon.invalid",
        status: "falhou",
        erro: "perfil_anonimizado",
        mensagem_email: null,
        mensagem_preparada_em: null,
        provedor_id: null,
        proxima_tentativa_em: null,
      });
      expect(dados.chave_idempotencia).toMatch(/^anonimizada:[0-9a-f]{64}$/);
      const retry = await worker.rpc("preparar_entrega_notificacao", {
        p_id: id,
        p_mensagem: envelope,
      });
      expect(retry.error?.message).toBe("NOTIFICACAO_NAO_RECLAMADA");
    });
  },
);
