const mensagens: Record<string, string> = {
  "23P01": "Este horário acabou de ser ocupado. Escolha outro intervalo.",
  CONFLITO_SALA: "Há uma reserva aprovada nesse horário.",
  ESTOQUE_INSUFICIENTE:
    "A quantidade de equipamentos não está disponível nesse intervalo.",
  ACESSO_NEGADO: "Você não tem permissão para realizar esta ação.",
  AUTO_DECISAO: "Outra pessoa precisa decidir sua solicitação.",
  TRANSICAO_INVALIDA: "A reserva mudou de estado. Atualize a página.",
  INTERVALO_INVALIDO: "Confira a data e o horário informados.",
  FORA_JANELA: "Selecione um horário dentro do funcionamento do laboratório.",
  BLOQUEIO_HORARIO: "O laboratório está bloqueado nesse intervalo.",
  ANTECEDENCIA_INVALIDA: "O horário não respeita a antecedência permitida.",
  LIMITE_EXCEDIDO: "Muitas tentativas. Aguarde um momento e tente novamente.",
  RATE_LIMIT: "Muitas tentativas. Aguarde um momento e tente novamente.",
  MOTIVO_OBRIGATORIO: "Informe o motivo para registrar esta decisão.",
  RESERVA_NAO_ENCONTRADA: "Reserva não encontrada ou sem permissão de acesso.",
  RESERVAS_AFETADAS:
    "Existem reservas aprovadas nesse intervalo. Revise os cancelamentos antes de criar o bloqueio.",
  BLOQUEIO_AFETA_RESERVAS:
    "Revise e autorize o cancelamento das reservas afetadas antes de bloquear.",
  DECISAO_PROPRIA_PROIBIDA: "Outra pessoa precisa decidir sua solicitação.",
  HORARIO_BLOQUEADO: "Existe um bloqueio de uso nesse intervalo.",
  FORA_DA_JANELA:
    "Selecione horários alinhados ao funcionamento e ao modo de reserva.",
  DURACAO_INVALIDA: "Confira a duração mínima e máxima permitidas.",
  CAPACIDADE_INVALIDA:
    "A quantidade de participantes excede a capacidade do espaço.",
  EQUIPAMENTO_INDISPONIVEL:
    "Um equipamento selecionado está indisponível ou pertence a outro laboratório.",
  EQUIPAMENTOS_OBRIGATORIOS: "Selecione pelo menos um equipamento.",
  EQUIPAMENTO_DUPLICADO: "Selecione cada equipamento apenas uma vez.",
  LABORATORIO_INATIVO: "Este laboratório está indisponível para reservas.",
  MOTIVO_DESEMPATE_OBRIGATORIO:
    "Há outra solicitação com preferência. Justifique sua decisão.",
  PRAZO_CANCELAMENTO_ENCERRADO:
    "O prazo de cancelamento terminou. Entre em contato com um monitor.",
  LIMITE_SOLICITACOES:
    "Muitas solicitações em um minuto. Aguarde antes de tentar novamente.",
  CHECKIN_FORA_DO_HORARIO:
    "O check-in só pode ser feito durante o horário da reserva.",
  NOSHOW_NAO_PERMITIDO:
    "Aguarde o prazo de tolerância antes de registrar ausência.",
  LABORATORIO_EM_USO:
    "Conclua as atividades em uso antes de alterar este espaço.",
  SUBSTITUICAO_INVALIDA:
    "Essa combinação de reservas não permite substituição.",
  RECORRENCIA_INVALIDA: "Confira os dias, as datas e o limite da recorrência.",
  RECORRENCIA_SEM_DATAS: "Nenhuma data elegível foi encontrada para a série.",
};
export function codigoErro(erro: unknown): string | undefined {
  if (erro && typeof erro === "object") {
    const valor = erro as { code?: string; message?: string };
    if (valor.code && Object.hasOwn(mensagens, valor.code)) return valor.code;
    if (valor.message && Object.hasOwn(mensagens, valor.message))
      return valor.message;
  }
}
export function mensagemErro(erro: unknown): string {
  const codigo = codigoErro(erro);
  return codigo
    ? mensagens[codigo]
    : "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}
