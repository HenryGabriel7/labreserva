"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { reservaSchema,cancelarSchema } from "./schemas-reservas";
import { mensagemErro } from "./errors";
export async function solicitarReservaAction(dados:unknown){
  const usuario=await requireUser();const parsed=reservaSchema.safeParse(dados);if(!parsed.success)return {ok:false,mensagem:parsed.error.issues[0]?.message??"Dados inválidos."};const v=parsed.data;
  if(v.justificativaPrioridade&&!usuario.roles.some(r=>r==="professor"||r==="funcionario"))return {ok:false,mensagem:"Seu perfil não permite justificativa de prioridade."};
  const servico=createAdminClient();const limite=await servico.rpc("consumir_rate_limit",{p_chave:`solicitar-endpoint:${usuario.id}`,p_limite:15,p_janela_segundos:60});if(limite.error||limite.data!==true)return {ok:false,mensagem:"Aguarde um minuto antes de enviar outra solicitação."};
  const db=await createClient();const {data,error}=await db.rpc("solicitar_reserva",{p_laboratorio_id:v.laboratorioId,p_inicio:v.inicio,p_fim:v.fim,p_escopo:v.escopo,p_finalidade:v.finalidade,p_n_participantes:v.nParticipantes,p_justificativa_prioridade:v.justificativaPrioridade||null,p_equipamentos:v.equipamentos.map(e=>({equipamento_id:e.equipamentoId,quantidade:e.quantidade})),p_recorrencia:null});
  if(error)return {ok:false,mensagem:mensagemErro(error)};revalidatePath("/","layout");return {ok:true,mensagem:"Solicitação enviada. Você será avisado quando houver uma decisão.",dados:data};
}
export async function cancelarReservaAction(dados:unknown){
  const usuario=await requireUser(undefined,{sensitive:true});const parsed=cancelarSchema.safeParse(dados);if(!parsed.success)return {ok:false,mensagem:"Informe o motivo do cancelamento."};const db=await createClient();const {data:reserva,error:consulta}=await db.from("reservas").select("id,solicitante_id,laboratorio_id").eq("id",parsed.data.reservaId).maybeSingle();
  if(consulta||!reserva)return {ok:false,mensagem:"Reserva não encontrada ou sem permissão."};if(reserva.solicitante_id!==usuario.id&&!usuario.roles.some(r=>r==="admin"||r==="monitor"))return {ok:false,mensagem:"Você não pode cancelar essa reserva."};
  const {error}=await db.rpc("cancelar_reserva",{p_reserva_id:parsed.data.reservaId,p_motivo:parsed.data.motivo});if(error)return {ok:false,mensagem:mensagemErro(error)};revalidatePath("/","layout");return {ok:true,mensagem:"Reserva cancelada. Os envolvidos serão notificados."};
}
