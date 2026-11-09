"use server";
import { revalidatePath } from "next/cache";
import { z } from "@/lib/validacao";
import { requireUser } from "./auth";
import { createClient } from "./supabase/server";
import {
  laboratorioSchema,
  laboratorioCompletoSchema,
  laboratorioEdicaoSchema,
  equipamentoSchema,
  janelaSchema,
  bloqueioSchema,
  configuracaoSchema,
} from "./schemas";
import { mensagemErro } from "./errors";
async function salvar(
  schema: z.ZodType,
  dados: unknown,
  rpc: string,
  roles: ("admin" | "monitor")[] = ["admin"],
) {
  await requireUser(roles, { sensitive: true });
  const result = schema.safeParse(dados);
  if (!result.success)
    return {
      ok: false,
      mensagem: result.error.issues[0]?.message ?? "Confira os dados.",
    };
  const { id, ...campos } = result.data as Record<string, unknown>;
  const db = await createClient();
  const { error } = await db.rpc(rpc, { p_dados: campos, p_id: id ?? null });
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Alterações salvas com sucesso." };
}
export async function salvarLaboratorioAction(dados: unknown) {
  return salvar(laboratorioSchema, dados, "salvar_laboratorio");
}

type ResultadoLaboratorio = {
  ok: boolean;
  mensagem: string;
  campos: Record<string, string>;
  id?: string;
  codigo?: string;
};

const resultadoNaoConfirmado: ResultadoLaboratorio = {
  ok: false,
  mensagem:
    "Não foi possível confirmar o salvamento. Recarregue os dados do laboratório antes de tentar novamente.",
  campos: {},
  codigo: "RESULTADO_NAO_CONFIRMADO",
};

const mensagensLaboratorio: Record<string, string> = {
  REVISAO_OBRIGATORIA:
    "Abra o editor atualizado do laboratório antes de salvar alterações.",
  REVISAO_DESATUALIZADA:
    "Alguém alterou este laboratório depois que você abriu o editor. Carregue os dados atuais e revise suas alterações antes de salvar.",
  FUNCIONAMENTO_INCOMPLETO:
    "A edição não inclui todos os horários existentes. Recarregue os dados do laboratório.",
  FUNCIONAMENTO_OBRIGATORIO: "Adicione pelo menos um horário de funcionamento.",
  FUNCIONAMENTO_INCOMPATIVEL:
    "O funcionamento precisa comportar uma reserva dentro da duração mínima e máxima.",
  JANELAS_SOBREPOSTAS:
    "Os horários de funcionamento do mesmo dia não podem se sobrepor.",
  EQUIPAMENTO_OUTRO_LABORATORIO:
    "Um equipamento não pertence a este laboratório. Atualize a página.",
  EQUIPAMENTO_DUPLICADO: "Um equipamento foi informado mais de uma vez.",
  "23505":
    "Um patrimônio já está cadastrado. Confira os patrimônios dos equipamentos.",
  FORA_DA_JANELA:
    "Há reservas aprovadas fora do novo funcionamento. Mantenha esses horários ou resolva as reservas antes de alterar o laboratório.",
  DURACAO_INVALIDA:
    "Há reservas aprovadas com uma duração incompatível com os novos limites. Revise os limites antes de salvar.",
  EQUIPAMENTO_INDISPONIVEL:
    "Um equipamento alterado é necessário para uma reserva aprovada. Mantenha sua disponibilidade ou resolva a reserva antes de alterar.",
  CAPACIDADE_INVALIDA:
    "A nova capacidade é menor que a quantidade de participantes de uma reserva aprovada.",
};

function erroLaboratorio(erro: {
  code?: string;
  message: string;
}): ResultadoLaboratorio {
  const codigo = [erro.message, erro.code].find(
    (valor) => valor && Object.hasOwn(mensagensLaboratorio, valor),
  );
  return {
    ok: false,
    mensagem: codigo ? mensagensLaboratorio[codigo] : mensagemErro(erro),
    campos: {},
    codigo,
  };
}

function laboratorioSalvo(
  data: unknown,
  idEsperado?: string,
): ResultadoLaboratorio {
  const salvo = z.object({ id: z.uuid() }).safeParse(data);
  if (!salvo.success || (idEsperado && salvo.data.id !== idEsperado))
    return resultadoNaoConfirmado;
  revalidatePath("/", "layout");
  return {
    ok: true,
    mensagem: "Laboratório, funcionamento e equipamentos salvos com sucesso.",
    id: salvo.data.id,
    campos: {},
  };
}

export async function salvarLaboratorioCompletoAction(
  dados: unknown,
): Promise<ResultadoLaboratorio> {
  await requireUser(["admin"], { sensitive: true });
  const parsed = laboratorioCompletoSchema.safeParse(dados);
  if (!parsed.success)
    return {
      ok: false,
      mensagem: "Revise os campos destacados antes de salvar o laboratório.",
      campos: Object.fromEntries(
        parsed.error.issues.map((erro) => [erro.path.join("."), erro.message]),
      ),
    };
  const { id, janelas, equipamentos, ...laboratorio } = parsed.data;
  if (id) return erroLaboratorio({ message: "REVISAO_OBRIGATORIA" });
  const db = await createClient();
  const { data, error } = await db.rpc("salvar_laboratorio_completo", {
    p_id: null,
    p_dados: laboratorio,
    p_janelas: janelas,
    p_equipamentos: equipamentos,
  });
  return error ? erroLaboratorio(error) : laboratorioSalvo(data);
}

export async function editarLaboratorioCompletoAction(
  dados: unknown,
): Promise<ResultadoLaboratorio> {
  await requireUser(["admin"], { sensitive: true });
  const parsed = laboratorioEdicaoSchema.safeParse(dados);
  if (!parsed.success)
    return {
      ok: false,
      mensagem:
        "Revise os horários, equipamentos e dados do laboratório antes de salvar.",
      campos: Object.fromEntries(
        parsed.error.issues
          .filter((erro) =>
            ["laboratorio", "janelas", "equipamentos"].includes(
              String(erro.path[0]),
            ),
          )
          .map((erro) => [erro.path.join("."), erro.message]),
      ),
    };
  const { id, revisao, laboratorio, janelas, equipamentos } = parsed.data;
  const db = await createClient();
  const { data, error, status } = await db.rpc("editar_laboratorio_completo", {
    p_id: id,
    p_revisao: revisao,
    p_dados: laboratorio,
    p_janelas: janelas,
    p_equipamentos: equipamentos,
  });
  if (error && (status === 0 || status >= 500)) return resultadoNaoConfirmado;
  return error ? erroLaboratorio(error) : laboratorioSalvo(data, id);
}
export async function salvarEquipamentoAction(dados: unknown) {
  return salvar(equipamentoSchema, dados, "salvar_equipamento");
}
export async function salvarJanelaAction(dados: unknown) {
  return salvar(janelaSchema, dados, "salvar_janela_horario");
}
export async function removerCadastroAction(dados: unknown) {
  await requireUser(["admin"], { sensitive: true });
  const parsed = z
    .object({
      entidade: z.enum([
        "laboratorios",
        "equipamentos",
        "janelas_horario",
        "bloqueios",
      ]),
      id: z.uuid(),
    })
    .strict()
    .safeParse(dados);
  if (!parsed.success) return { ok: false, mensagem: "Registro inválido." };
  const db = await createClient();
  const { error } = await db.rpc("remover_cadastro", {
    p_entidade: parsed.data.entidade,
    p_id: parsed.data.id,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Registro removido." };
}
export async function criarBloqueioAction(dados: unknown) {
  await requireUser(["admin", "monitor"], { sensitive: true });
  const parsed = bloqueioSchema.safeParse(dados);
  if (!parsed.success)
    return {
      ok: false,
      mensagem: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  const v = parsed.data;
  const db = await createClient();
  const { error } = await db.rpc(v.id ? "editar_bloqueio" : "criar_bloqueio", {
    ...(v.id ? { p_id: v.id } : {}),
    p_laboratorio_id: v.laboratorio_id,
    p_inicio: v.inicio,
    p_fim: v.fim,
    p_motivo: v.motivo,
    p_descricao: v.descricao,
    p_cancelar_reservas: v.cancelar_reservas,
    p_motivo_cancelamento: v.motivo_cancelamento,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  revalidatePath("/", "layout");
  return {
    ok: true,
    mensagem: v.id ? "Bloqueio atualizado." : "Bloqueio registrado.",
  };
}
export async function listarAfetadasAction(dados: unknown) {
  await requireUser(["admin", "monitor"], { sensitive: true });
  const parsed = z
    .object({
      laboratorio_id: z.uuid().nullable(),
      inicio: z.iso.datetime({ offset: true }),
      fim: z.iso.datetime({ offset: true }),
    })
    .strict()
    .safeParse(dados);
  if (!parsed.success)
    return { ok: false, mensagem: "Confira o intervalo.", reservas: [] };
  const db = await createClient();
  const { data, error } = await db.rpc("reservas_afetadas_bloqueio", {
    p_laboratorio_id: parsed.data.laboratorio_id,
    p_inicio: parsed.data.inicio,
    p_fim: parsed.data.fim,
  });
  return {
    ok: !error,
    mensagem: error ? mensagemErro(error) : "Consulta concluída.",
    reservas: data ?? [],
  };
}
export async function salvarConfiguracaoAction(dados: unknown) {
  await requireUser(["admin"], { sensitive: true });
  const parsed = configuracaoSchema.safeParse(dados);
  if (!parsed.success) return { ok: false, mensagem: "Configuração inválida." };
  const db = await createClient();
  const { error } = await db.rpc("atualizar_configuracao", {
    p_chave: parsed.data.chave,
    p_valor: parsed.data.valor,
  });
  if (error) return { ok: false, mensagem: mensagemErro(error) };
  revalidatePath("/admin/configuracoes");
  return { ok: true, mensagem: "Configuração atualizada." };
}
