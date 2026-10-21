import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  ambienteLocal,
  clientePublico,
  clienteServico,
  criarLaboratorio,
  criarPessoa,
  exigirSucesso,
  horarioFuturo,
  motivoSemSupabase,
  solicitar,
} from "./helpers";

describe.skipIf(!ambienteLocal)(
  `Supabase real local${ambienteLocal ? "" : ` — ${motivoSemSupabase}`}`,
  () => {
    it("N aprovações concorrentes no mesmo horário produzem exatamente uma aprovação", async () => {
      const servico = clienteServico();
      const [aluno, admin] = await Promise.all([
        criarPessoa("aluno", servico),
        criarPessoa("admin", servico),
      ]);
      const lab = await criarLaboratorio(servico);
      const horario = horarioFuturo();
      const ids: string[] = [];
      for (let indice = 0; indice < 8; indice++)
        ids.push(
          await solicitar(
            aluno.cliente,
            lab.id,
            `Concorrência QA ${indice}`,
            horario,
          ),
        );
      const resultados = await Promise.all(
        ids.map((id) =>
          admin.cliente.rpc("aprovar_reserva", {
            p_reserva_id: id,
            p_motivo: "Ensaio concorrente local com justificativa",
          }),
        ),
      );
      expect(resultados.filter((resultado) => !resultado.error)).toHaveLength(
        1,
      );
      expect(resultados.filter((resultado) => resultado.error)).toHaveLength(7);
      const reservas = exigirSucesso(
        await servico.from("reservas").select("status").in("id", ids),
        "Conferir aprovações concorrentes",
      );
      expect(
        reservas?.filter((reserva) => reserva.status === "aprovada"),
      ).toHaveLength(1);
      expect(
        reservas?.filter((reserva) => reserva.status === "pendente"),
      ).toHaveLength(7);
    });

    it("signUp direto com chave pública é recusado pelo Auth", async () => {
      const resposta = await clientePublico().auth.signUp({
        email: `publico-${randomUUID()}@teste.edu.br`,
        password: "DevOnly!123456",
      });
      expect(resposta.error?.code).toBe("signup_disabled");
      expect(resposta.data.session).toBeNull();
      expect(resposta.data.user).toBeNull();
    });

    it("generateLink invite funciona com signup desabilitado e cria uma fila privada sem SMTP", async () => {
      const servico = clienteServico();
      const admin = await criarPessoa("admin", servico);
      const email = `invite-${randomUUID()}@teste.edu.br`;
      const link = exigirSucesso(
        await servico.auth.admin.generateLink({ type: "invite", email }),
        "Gerar convite sem SMTP",
      );
      expect(link.properties.hashed_token).toBeTruthy();
      exigirSucesso(
        await servico.rpc("provisionar_usuario", {
          p_usuario_id: link.user.id,
          p_nome: "Convite de integração",
          p_email: email,
          p_matricula: null,
          p_papeis: ["aluno"],
          p_ator_id: admin.id,
          p_token_hash: link.properties.hashed_token,
          p_app_url: "http://127.0.0.1:3100",
        }),
        "Provisionar e enfileirar convite",
      );
      const fila = exigirSucesso(
        await servico
          .from("notificacoes")
          .select("tipo_evento,status")
          .eq("usuario_id", link.user.id)
          .eq("tipo_evento", "convite")
          .single(),
        "Conferir fila de convite",
      );
      expect(fila.status).toBe("pendente");
      const convidado = clientePublico();
      const confirmado = exigirSucesso(
        await convidado.auth.verifyOtp({
          token_hash: link.properties.hashed_token,
          type: "invite",
        }),
        "Confirmar convite",
      );
      expect(confirmado.user?.id).toBe(link.user.id);
      const notificacoes = exigirSucesso(
        await convidado
          .from("notificacoes")
          .select("payload,chave_idempotencia"),
        "Conferir RLS do segredo",
      );
      expect(notificacoes).toEqual([]);
      const repeticao = await clientePublico().auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "invite",
      });
      expect(repeticao.error).not.toBeNull();
    });

    it("logout global impede o mesmo JWT copiado de chamar RPC e ler dados diretamente", async () => {
      const admin = await criarPessoa("admin");
      const copia = clientePublico(admin.accessToken);
      expect(
        exigirSucesso(
          await copia.rpc("tem_papel", { p_papel: "admin" }),
          "Validar sessão antes de revogar",
        ),
      ).toBe(true);
      expect(
        (await admin.cliente.auth.signOut({ scope: "global" })).error,
      ).toBeNull();
      const consulta = exigirSucesso(
        await copia.from("profiles").select("id"),
        "Consultar com JWT revogado",
      );
      expect(consulta).toEqual([]);
      const rpc = await copia.rpc("alterar_usuario_admin", {
        p_usuario_id: admin.id,
        p_nome: "Tentativa após logout",
        p_matricula: null,
        p_ativo: true,
        p_papeis: ["admin"],
        p_laboratorio_ids: [],
      });
      expect(rpc.error?.code).toBe("42501");
      expect(
        (await copia.auth.getUser(admin.accessToken)).error,
      ).not.toBeNull();
    });

    it("desativação conserva o perfil e bloqueia RLS/RPC da sessão já existente", async () => {
      const servico = clienteServico();
      const aluno = await criarPessoa("aluno", servico);
      exigirSucesso(
        await servico
          .from("profiles")
          .update({ ativo: false })
          .eq("id", aluno.id),
        "Desativar fixture",
      );
      expect(
        exigirSucesso(
          await aluno.cliente.from("profiles").select("id"),
          "Conferir RLS inativo",
        ),
      ).toEqual([]);
      expect(
        (await aluno.cliente.rpc("marcar_notificacoes_lidas", { p_ids: null }))
          .error?.code,
      ).toBe("42501");
      const preservado = exigirSucesso(
        await servico
          .from("profiles")
          .select("id,ativo")
          .eq("id", aluno.id)
          .single(),
        "Conferir histórico preservado",
      );
      expect(preservado).toEqual({ id: aluno.id, ativo: false });
    });
  },
);
