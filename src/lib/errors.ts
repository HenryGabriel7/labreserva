const mensagens:Record<string,string> = {
  "23P01":"Este horário acabou de ser ocupado. Escolha outro intervalo.",
  CONFLITO_SALA:"Há uma reserva aprovada nesse horário.",
  ESTOQUE_INSUFICIENTE:"A quantidade de equipamentos não está disponível nesse intervalo.",
  ACESSO_NEGADO:"Você não tem permissão para realizar esta ação.",
  AUTO_DECISAO:"Outra pessoa precisa decidir sua solicitação.",
  TRANSICAO_INVALIDA:"A reserva mudou de estado. Atualize a página.",
  INTERVALO_INVALIDO:"Confira a data e o horário informados.",
  FORA_JANELA:"Selecione um horário dentro do funcionamento do laboratório.",
  BLOQUEIO_HORARIO:"O laboratório está bloqueado nesse intervalo.",
  ANTECEDENCIA_INVALIDA:"O horário não respeita a antecedência permitida.",
  LIMITE_EXCEDIDO:"Muitas tentativas. Aguarde um momento e tente novamente.",
  RATE_LIMIT:"Muitas tentativas. Aguarde um momento e tente novamente.",
  MOTIVO_OBRIGATORIO:"Informe o motivo para registrar esta decisão.",
  RESERVA_NAO_ENCONTRADA:"Reserva não encontrada ou sem permissão de acesso.",
  RESERVAS_AFETADAS:"Existem reservas aprovadas nesse intervalo. Revise os cancelamentos antes de criar o bloqueio.",
};
export function mensagemErro(erro:unknown):string {
  if (erro && typeof erro === "object") {
    const valor = erro as {code?:string;message?:string};
    if (valor.code && mensagens[valor.code]) return mensagens[valor.code];
    if (valor.message && mensagens[valor.message]) return mensagens[valor.message];
  }
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}
