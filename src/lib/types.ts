export const papeis = ["aluno", "professor", "funcionario", "monitor", "admin"] as const;
export type Papel = (typeof papeis)[number];
export const tiposLaboratorio = ["redes", "informatica", "quimica", "anatomia"] as const;
export type TipoLaboratorio = (typeof tiposLaboratorio)[number];
export type StatusReserva = "pendente" | "aprovada" | "recusada" | "cancelada" | "em_uso" | "concluida" | "no_show" | "substituida";
export interface Laboratorio { id:string; nome:string; tipo:TipoLaboratorio; capacidade:number; localizacao:string; descricao:string; regras_de_uso:string; ativo:boolean; modo_reserva:"slot_fixo"|"intervalo_livre"; granularidade_minutos:number; duracao_minima_minutos:number; duracao_maxima_minutos:number; }
export interface Equipamento { id:string; laboratorio_id:string; nome:string; patrimonio:string|null; quantidade:number; status:"ativo"|"manutencao"|"inativo"; reservavel_individualmente:boolean; }
export interface JanelaHorario { id:string; laboratorio_id:string; dia_semana:number; inicio:string; fim:string; duracao_slot_minutos:number; }
export interface Reserva { id:string; laboratorio_id:string; solicitante_id:string; inicio:string; fim:string; escopo:"laboratorio"|"equipamentos"; finalidade:string; n_participantes:number; justificativa_prioridade:string|null; prioridade_efetiva:number; status:StatusReserva; decidido_por:string|null; decidido_em:string|null; motivo:string|null; recorrencia_id:string|null; conflito:boolean; created_at:string; laboratorios?:{nome:string;tipo:TipoLaboratorio;localizacao:string}; profiles?:{nome:string;email:string}; }
export interface Notificacao { id:string; usuario_id:string; tipo_evento:string; template:string; payload:Record<string,unknown>; status:string; created_at:string; lida_em:string|null; }
export const nomeTipo:Record<TipoLaboratorio,string> = { redes:"Redes", informatica:"Informática", quimica:"Química", anatomia:"Anatomia" };
export const nomeStatus:Record<StatusReserva,string> = { pendente:"Pendente", aprovada:"Aprovada", recusada:"Recusada", cancelada:"Cancelada", em_uso:"Em uso", concluida:"Concluída", no_show:"Não compareceu", substituida:"Substituída" };
export const corStatus:Record<StatusReserva,string> = { pendente:"amber", aprovada:"green", recusada:"red", cancelada:"gray", em_uso:"blue", concluida:"gray", no_show:"red", substituida:"gray" };
