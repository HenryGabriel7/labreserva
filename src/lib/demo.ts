import { formatInTimeZone } from "date-fns-tz";
import type { Laboratorio, Equipamento, Reserva, JanelaHorario } from "./types";
const id = (n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export const labsDemo:Laboratorio[] = [
  { id:id(1),nome:"Laboratório de Informática",tipo:"informatica",capacidade:32,localizacao:"Bloco A · Sala 101",descricao:"Um espaço conectado para transformar ideias em projetos. Computadores com ferramentas de desenvolvimento e acesso à internet.",regras_de_uso:"Não consumir alimentos. Preserve as configurações dos computadores e encerre sua sessão ao sair.",ativo:true,modo_reserva:"slot_fixo",granularidade_minutos:30,duracao_minima_minutos:60,duracao_maxima_minutos:240 },
  { id:id(2),nome:"Laboratório de Redes",tipo:"redes",capacidade:24,localizacao:"Bloco A · Sala 203",descricao:"Infraestrutura completa para práticas de redes, conectividade e segurança da informação.",regras_de_uso:"Reconfigure os equipamentos apenas com autorização do monitor.",ativo:true,modo_reserva:"slot_fixo",granularidade_minutos:30,duracao_minima_minutos:60,duracao_maxima_minutos:240 },
  { id:id(3),nome:"Laboratório de Química",tipo:"quimica",capacidade:20,localizacao:"Bloco B · Sala 105",descricao:"Bancadas equipadas para descobertas, experimentos e atividades práticas com acompanhamento técnico.",regras_de_uso:"Uso obrigatório de jaleco, óculos e calçado fechado. Acompanhamento técnico obrigatório.",ativo:true,modo_reserva:"intervalo_livre",granularidade_minutos:15,duracao_minima_minutos:30,duracao_maxima_minutos:180 },
  { id:id(4),nome:"Laboratório de Anatomia",tipo:"anatomia",capacidade:28,localizacao:"Bloco C · Sala 102",descricao:"Modelos anatômicos e recursos para o estudo integrado do corpo humano.",regras_de_uso:"Manusear os modelos com cuidado. Higienizar as mãos e a bancada antes e após o uso.",ativo:true,modo_reserva:"intervalo_livre",granularidade_minutos:15,duracao_minima_minutos:30,duracao_maxima_minutos:240 },
];
export const equipamentosDemo:Equipamento[] = labsDemo.flatMap((lab,i)=>[
  { id:id(101+i*2),laboratorio_id:lab.id,nome:["Computador","Kit de redes","Microscópio","Modelo anatômico"][i],patrimonio:`PAT-${1001+i*2}`,quantidade:[32,12,10,14][i],status:"ativo" as const,reservavel_individualmente:true },
  { id:id(102+i*2),laboratorio_id:lab.id,nome:["Projetor","Switch gerenciável","Balança de precisão","Projetor"][i],patrimonio:`PAT-${1002+i*2}`,quantidade:2,status:"ativo" as const,reservavel_individualmente:true },
]);
export const janelasDemo:JanelaHorario[] = labsDemo.flatMap((lab,i)=>[1,2,3,4,5].map(d=>({id:id(200+i*10+d),laboratorio_id:lab.id,dia_semana:d,inicio:"08:00:00",fim:"22:00:00",duracao_slot_minutos:60})));
export function reservasDemo():Reserva[] {
  const hoje = formatInTimeZone(new Date(),"America/Sao_Paulo","yyyy-MM-dd");
  const dados = [
    [0,"08:00","10:00","concluida","Introdução à programação","Mariana Costa",2,26],
    [2,"10:00","12:00","em_uso","Prática de química orgânica","Ricardo Almeida",2,18],
    [1,"14:00","16:00","aprovada","Configuração de redes locais","Ana Beatriz Santos",2,22],
    [0,"16:00","18:00","pendente","Projeto integrador · Engenharia","Lucas Oliveira",1,24],
    [3,"14:00","16:00","aprovada","Estudo do sistema cardiovascular","Carolina Mendes",2,20],
    [2,"16:00","18:00","pendente","Análise de soluções e misturas","Pedro Henrique",1,16],
    [1,"18:00","20:00","pendente","Segurança e protocolos de rede","Marina Rocha",2,24],
  ] as const;
  return dados.map(([li,inicio,fim,status,finalidade,nome,prioridade,participantes],i)=>({id:id(301+i),laboratorio_id:labsDemo[li].id,solicitante_id:id(500+i),inicio:new Date(`${hoje}T${inicio}:00-03:00`).toISOString(),fim:new Date(`${hoje}T${fim}:00-03:00`).toISOString(),escopo:"laboratorio",finalidade,n_participantes:participantes,justificativa_prioridade:prioridade===2?"Atividade prática prevista no plano de ensino.":null,prioridade_efetiva:prioridade,status,decidido_por:null,decidido_em:null,motivo:null,recorrencia_id:null,conflito:i===3,created_at:new Date(`${hoje}T07:00:00-03:00`).toISOString(),laboratorios:{nome:labsDemo[li].nome,tipo:labsDemo[li].tipo,localizacao:labsDemo[li].localizacao},profiles:{nome,email:`exemplo${i+1}@instituicao.edu.br`}}));
}
