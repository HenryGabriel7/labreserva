"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "./auth";
import { createClient } from "./supabase/server";
import { laboratorioSchema,equipamentoSchema,janelaSchema,bloqueioSchema,configuracaoSchema } from "./schemas";
import { mensagemErro } from "./errors";
async function salvar(schema:z.ZodType,dados:unknown,rpc:string,roles:("admin"|"monitor")[]=["admin"]){
  await requireUser(roles,{sensitive:true}); const result=schema.safeParse(dados);
  if(!result.success) return {ok:false,mensagem:result.error.issues[0]?.message??"Confira os dados."};
  const {id,...campos}=result.data as Record<string,unknown>;
  const db=await createClient();const {error}=await db.rpc(rpc,{p_dados:campos,p_id:id??null});
  if(error) return {ok:false,mensagem:mensagemErro(error)};
  revalidatePath("/","layout");return {ok:true,mensagem:"Alterações salvas com sucesso."};
}
export async function salvarLaboratorioAction(dados:unknown){return salvar(laboratorioSchema,dados,"salvar_laboratorio");}
export async function salvarEquipamentoAction(dados:unknown){return salvar(equipamentoSchema,dados,"salvar_equipamento");}
export async function salvarJanelaAction(dados:unknown){return salvar(janelaSchema,dados,"salvar_janela_horario");}
export async function removerCadastroAction(dados:unknown){
  await requireUser(["admin"],{sensitive:true});const parsed=z.object({entidade:z.enum(["laboratorios","equipamentos","janelas_horario","bloqueios"]),id:z.uuid()}).strict().safeParse(dados);
  if(!parsed.success)return {ok:false,mensagem:"Registro inválido."};const db=await createClient();const {error}=await db.rpc("remover_cadastro",{p_entidade:parsed.data.entidade,p_id:parsed.data.id});
  if(error)return {ok:false,mensagem:mensagemErro(error)};revalidatePath("/","layout");return {ok:true,mensagem:"Registro removido."};
}
export async function criarBloqueioAction(dados:unknown){
  await requireUser(["admin","monitor"],{sensitive:true});const parsed=bloqueioSchema.safeParse(dados);if(!parsed.success)return {ok:false,mensagem:parsed.error.issues[0]?.message??"Dados inválidos."};
  const v=parsed.data;const db=await createClient();const {error}=await db.rpc("criar_bloqueio",{p_laboratorio_id:v.laboratorio_id,p_inicio:v.inicio,p_fim:v.fim,p_motivo:v.motivo,p_descricao:v.descricao,p_cancelar_reservas:v.cancelar_reservas,p_motivo_cancelamento:v.motivo_cancelamento});
  if(error)return {ok:false,mensagem:mensagemErro(error)};revalidatePath("/","layout");return {ok:true,mensagem:"Bloqueio registrado."};
}
export async function listarAfetadasAction(dados:unknown){
  await requireUser(["admin","monitor"],{sensitive:true});const parsed=z.object({laboratorio_id:z.uuid().nullable(),inicio:z.iso.datetime({offset:true}),fim:z.iso.datetime({offset:true})}).strict().safeParse(dados);if(!parsed.success)return {ok:false,mensagem:"Confira o intervalo.",reservas:[]};
  const db=await createClient();const {data,error}=await db.rpc("reservas_afetadas_bloqueio",{p_laboratorio_id:parsed.data.laboratorio_id,p_inicio:parsed.data.inicio,p_fim:parsed.data.fim});return {ok:!error,mensagem:error?mensagemErro(error):"Consulta concluída.",reservas:data??[]};
}
export async function salvarConfiguracaoAction(dados:unknown){
  await requireUser(["admin"],{sensitive:true});const parsed=configuracaoSchema.safeParse(dados);if(!parsed.success)return {ok:false,mensagem:"Configuração inválida."};const db=await createClient();const {error}=await db.rpc("atualizar_configuracao",{p_chave:parsed.data.chave,p_valor:parsed.data.valor});if(error)return {ok:false,mensagem:mensagemErro(error)};revalidatePath("/configuracoes");return {ok:true,mensagem:"Configuração atualizada."};
}
