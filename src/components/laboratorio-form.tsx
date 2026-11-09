"use client";

import { useState, useTransition } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
  type FieldError,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  editarLaboratorioCompletoAction,
  salvarLaboratorioCompletoAction,
} from "@/lib/actions-cadastros";
import {
  laboratorioCompletoSchema,
  laboratorioEdicaoFormularioSchema,
  type LaboratorioEdicaoFormulario,
} from "@/lib/schemas";
import {
  tiposLaboratorio,
  nomeTipo,
  type LaboratorioEdicao,
  type Equipamento,
  type JanelaHorario,
} from "@/lib/types";

const dias = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

function horaParaFormulario(hora: string) {
  return /^\d{2}:\d{2}:00$/.test(hora) ? hora.slice(0, 5) : hora;
}

function janelaParaFormulario(janela: JanelaHorario) {
  return {
    id: janela.id,
    dia_semana: janela.dia_semana,
    inicio: horaParaFormulario(janela.inicio),
    fim: horaParaFormulario(janela.fim),
    duracao_slot_minutos: janela.duracao_slot_minutos,
  };
}

function equipamentoParaFormulario(equipamento: Equipamento) {
  return {
    id: equipamento.id,
    nome: equipamento.nome,
    patrimonio: equipamento.patrimonio,
    quantidade: equipamento.quantidade,
    status: equipamento.status,
    reservavel_individualmente: equipamento.reservavel_individualmente,
  };
}

function horarioLegado(hora: string) {
  return hora.startsWith("24:") || hora.length > 5;
}

export function LaboratorioForm({
  edicao,
  demonstracao,
  bloqueado,
  onRecarregar,
  onSaved,
}: {
  edicao?: LaboratorioEdicao;
  demonstracao: boolean;
  bloqueado: boolean;
  onRecarregar: () => void;
  onSaved: (id: string, mensagem: string) => void;
}) {
  const laboratorio = edicao?.laboratorio;
  const janelas = edicao?.janelas ?? [];
  const equipamentos = edicao?.equipamentos ?? [];
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);
  const [recargaObrigatoria, setRecargaObrigatoria] = useState(false);
  const [janelasRemovidas, setJanelasRemovidas] = useState<string[]>([]);
  const [equipamentosRetirados, setEquipamentosRetirados] = useState<
    LaboratorioEdicaoFormulario["equipamentos"]
  >([]);
  const {
    register,
    control,
    handleSubmit,
    setError,
    getFieldState,
    getValues,
    formState,
  } = useForm<LaboratorioEdicaoFormulario>({
    resolver: zodResolver(
      edicao ? laboratorioEdicaoFormularioSchema : laboratorioCompletoSchema,
    ),
    defaultValues: {
      ...(laboratorio
        ? {
            id: laboratorio.id,
            nome: laboratorio.nome,
            tipo: laboratorio.tipo,
            capacidade: laboratorio.capacidade,
            localizacao: laboratorio.localizacao,
            descricao: laboratorio.descricao,
            regras_de_uso: laboratorio.regras_de_uso,
            ativo: laboratorio.ativo,
            modo_reserva: laboratorio.modo_reserva,
            granularidade_minutos: laboratorio.granularidade_minutos,
            duracao_minima_minutos: laboratorio.duracao_minima_minutos,
            duracao_maxima_minutos: laboratorio.duracao_maxima_minutos,
          }
        : {
            nome: "",
            tipo: "informatica",
            capacidade: 30,
            localizacao: "",
            descricao: "",
            regras_de_uso: "",
            ativo: true,
            modo_reserva: "slot_fixo",
            granularidade_minutos: 30,
            duracao_minima_minutos: 60,
            duracao_maxima_minutos: 240,
          }),
      janelas: laboratorio
        ? janelas.map(janelaParaFormulario)
        : [1, 2, 3, 4, 5].map((dia_semana) => ({
            dia_semana,
            inicio: "08:00",
            fim: "18:00",
            duracao_slot_minutos: 60,
          })),
      equipamentos: equipamentos.map(equipamentoParaFormulario),
    },
  });
  const horarios = useFieldArray({
    control,
    name: "janelas",
    keyName: "chave",
  });
  const inventario = useFieldArray({
    control,
    name: "equipamentos",
    keyName: "chave",
  });
  const modo = useWatch({ control, name: "modo_reserva" });
  const desabilitado = demonstracao || pending || bloqueado;
  function erro(name: FieldPath<LaboratorioEdicaoFormulario>) {
    const campo = getFieldState(name, formState).error as
      (FieldError & { root?: FieldError }) | undefined;
    const mensagem = campo?.message ?? campo?.root?.message;
    return mensagem ? (
      <span className="cadastro-field-error" id={`lab-erro-${name}`}>
        {mensagem}
      </span>
    ) : null;
  }
  function atributos(name: FieldPath<LaboratorioEdicaoFormulario>) {
    return {
      "aria-invalid": Boolean(getFieldState(name, formState).error),
      "aria-describedby": getFieldState(name, formState).error
        ? `lab-erro-${name}`
        : undefined,
    };
  }
  function gravar(valores: LaboratorioEdicaoFormulario) {
    if (!edicao) return salvarLaboratorioCompletoAction(valores);

    const { id, janelas: periodos, equipamentos: itens, ...campos } = valores;
    const anteriores = new Map(
      janelas.map((j) => [j.id, janelaParaFormulario(j)]),
    );
    const manter: string[] = [];
    const alterar: Omit<JanelaHorario, "laboratorio_id">[] = [];
    const novas: Omit<JanelaHorario, "laboratorio_id" | "id">[] = [];

    for (const { id: janelaId, ...periodo } of periodos) {
      if (!janelaId) {
        novas.push(periodo);
        continue;
      }
      const original = anteriores.get(janelaId);
      if (
        original &&
        periodo.dia_semana === original.dia_semana &&
        periodo.inicio === original.inicio &&
        periodo.fim === original.fim &&
        periodo.duracao_slot_minutos === original.duracao_slot_minutos
      ) {
        manter.push(janelaId);
      } else {
        alterar.push({ id: janelaId, ...periodo });
      }
    }

    const inventarioOriginal = new Map(equipamentos.map((e) => [e.id, e]));
    const equipamentosAlterados = itens.filter((item) => {
      const original = item.id ? inventarioOriginal.get(item.id) : undefined;
      return (
        !original ||
        item.nome.trim() !== original.nome.trim() ||
        (item.patrimonio?.trim() || null) !==
          (original.patrimonio?.trim() || null) ||
        item.quantidade !== original.quantidade ||
        item.status !== original.status ||
        item.reservavel_individualmente !== original.reservavel_individualmente
      );
    });
    return editarLaboratorioCompletoAction({
      id,
      revisao: edicao.revisao,
      laboratorio: campos,
      janelas: { manter, alterar, novas, remover: janelasRemovidas },
      equipamentos: [...equipamentosAlterados, ...equipamentosRetirados],
    });
  }

  function submit(valores: LaboratorioEdicaoFormulario) {
    if (desabilitado || recargaObrigatoria) return;
    setResultado(null);
    startTransition(async () => {
      try {
        const r = await gravar(valores);
        if (!r.ok) {
          setResultado(r.mensagem);
          if (
            edicao &&
            "codigo" in r &&
            (r.codigo === "REVISAO_DESATUALIZADA" ||
              r.codigo === "FUNCIONAMENTO_INCOMPLETO" ||
              r.codigo === "RESULTADO_NAO_CONFIRMADO")
          ) {
            setRecargaObrigatoria(true);
          }
          let primeiro = true;
          for (const [campo, mensagem] of Object.entries(r.campos)) {
            setError(
              campo as FieldPath<LaboratorioEdicaoFormulario>,
              { message: mensagem },
              { shouldFocus: primeiro },
            );
            primeiro = false;
          }
          return;
        }
        if (r.id) onSaved(r.id, r.mensagem);
      } catch {
        if (edicao) setRecargaObrigatoria(true);
        setResultado(
          edicao
            ? "Não foi possível confirmar o salvamento. Recarregue os dados antes de tentar novamente."
            : "Não foi possível confirmar a criação. Confira a lista antes de tentar novamente.",
        );
      }
    });
  }
  return (
    <form
      className="panel crud-form laboratorio-completo-form"
      noValidate
      onSubmit={handleSubmit(submit, () =>
        setResultado(
          "Revise os campos destacados antes de salvar o laboratório.",
        ),
      )}
    >
      <h2>{laboratorio ? "Editar laboratório" : "Novo laboratório"}</h2>
      <p className="cadastro-help">
        Cadastre o espaço, os horários de funcionamento e seus equipamentos no
        mesmo formulário.
      </p>
      {resultado && (
        <div className="form-message form-message-error" role="alert">
          {resultado}
        </div>
      )}
      {recargaObrigatoria && (
        <>
          <p className="cadastro-help">
            O rascunho ficará disponível até os dados atuais serem carregados.
          </p>
          <button
            type="button"
            className="button button-outline"
            disabled={desabilitado}
            onClick={onRecarregar}
          >
            Recarregar dados
          </button>
        </>
      )}
      <fieldset disabled={desabilitado} className="cadastro-fieldset">
        <legend>Informações do laboratório</legend>
        <div className="form-grid">
          <label className="full">
            Nome do laboratório
            <input
              className="input"
              {...register("nome")}
              {...atributos("nome")}
            />
            {erro("nome")}
          </label>
          <label>
            Tipo
            <select
              className="input"
              {...register("tipo")}
              {...atributos("tipo")}
            >
              {tiposLaboratorio.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {nomeTipo[tipo]}
                </option>
              ))}
            </select>
            {erro("tipo")}
          </label>
          <label>
            Capacidade de pessoas
            <input
              className="input"
              type="number"
              min={1}
              max={10000}
              {...register("capacidade", { valueAsNumber: true })}
              {...atributos("capacidade")}
            />
            {erro("capacidade")}
          </label>
          <label className="full">
            Localização
            <input
              className="input"
              placeholder="Bloco e sala"
              {...register("localizacao")}
              {...atributos("localizacao")}
            />
            {erro("localizacao")}
          </label>
          <label className="full">
            Descrição
            <textarea
              className="input"
              {...register("descricao")}
              {...atributos("descricao")}
            />
            {erro("descricao")}
          </label>
          <label className="full">
            Regras de uso
            <textarea
              className="input"
              {...register("regras_de_uso")}
              {...atributos("regras_de_uso")}
            />
            {erro("regras_de_uso")}
          </label>
          <label>
            Modo de reserva
            <select className="input" {...register("modo_reserva")}>
              <option value="slot_fixo">Horários com intervalos fixos</option>
              <option value="intervalo_livre">Intervalo livre</option>
            </select>
          </label>
          <label>
            Intervalo entre horários (min)
            <input
              className="input"
              type="number"
              min={1}
              max={240}
              {...register("granularidade_minutos", { valueAsNumber: true })}
              {...atributos("granularidade_minutos")}
            />
            {erro("granularidade_minutos")}
          </label>
          <label>
            Duração mínima da reserva (min)
            <input
              className="input"
              type="number"
              min={1}
              max={1440}
              {...register("duracao_minima_minutos", { valueAsNumber: true })}
              {...atributos("duracao_minima_minutos")}
            />
            {erro("duracao_minima_minutos")}
          </label>
          <label>
            Duração máxima da reserva (min)
            <input
              className="input"
              type="number"
              min={1}
              max={1440}
              {...register("duracao_maxima_minutos", { valueAsNumber: true })}
              {...atributos("duracao_maxima_minutos")}
            />
            {erro("duracao_maxima_minutos")}
          </label>
          <label className="checkbox-label full">
            <input type="checkbox" {...register("ativo")} />
            Laboratório disponível para reservas
          </label>
        </div>
      </fieldset>
      <fieldset disabled={desabilitado} className="cadastro-fieldset">
        <legend>Horários de funcionamento</legend>
        <p className="cadastro-help">
          Horário de Brasília. Adicione pelo menos um período. Para fechar o
          intervalo de almoço, cadastre dois períodos no mesmo dia.
        </p>
        {edicao?.total_janelas === 0 && horarios.fields.length === 0 && (
          <p className="cadastro-warning">
            Sem funcionamento cadastrado. Adicione um período para permitir
            agendamentos.
          </p>
        )}
        {erro("janelas")}
        <div className="cadastro-repeat-list">
          {horarios.fields.map((janela, i) => (
            <div className="cadastro-repeat-card" key={janela.chave}>
              <div className="cadastro-repeat-heading">
                <h3>Período {i + 1}</h3>
                <button
                  type="button"
                  className="button button-ghost button-sm"
                  onClick={() => {
                    const id = janela.id;
                    if (id) setJanelasRemovidas((ids) => [...ids, id]);
                    horarios.remove(i);
                  }}
                  aria-label={`Remover período ${i + 1}`}
                >
                  <Trash2 size={14} />
                  <span>Remover</span>
                </button>
              </div>
              {(horarioLegado(janela.inicio) || horarioLegado(janela.fim)) && (
                <p className="cadastro-help">
                  Período legado. Ao alterar este período, informe os horários
                  em HH:mm.
                </p>
              )}
              <div className="form-grid">
                <label className="full">
                  Dia da semana
                  <select
                    className="input"
                    {...register(`janelas.${i}.dia_semana`, {
                      valueAsNumber: true,
                    })}
                    {...atributos(`janelas.${i}.dia_semana`)}
                  >
                    {dias.map((dia, diaId) => (
                      <option key={diaId} value={diaId}>
                        {dia}
                      </option>
                    ))}
                  </select>
                  {erro(`janelas.${i}.dia_semana`)}
                </label>
                <label>
                  Abertura
                  <input
                    className="input"
                    type={horarioLegado(janela.inicio) ? "text" : "time"}
                    {...register(`janelas.${i}.inicio`)}
                    {...atributos(`janelas.${i}.inicio`)}
                  />
                  {erro(`janelas.${i}.inicio`)}
                </label>
                <label>
                  Encerramento
                  <input
                    className="input"
                    type={horarioLegado(janela.fim) ? "text" : "time"}
                    {...register(`janelas.${i}.fim`)}
                    {...atributos(`janelas.${i}.fim`)}
                  />
                  {erro(`janelas.${i}.fim`)}
                </label>
                <label className="full">
                  Duração de cada intervalo fixo (min)
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={720}
                    {...register(`janelas.${i}.duracao_slot_minutos`, {
                      valueAsNumber: true,
                    })}
                    {...atributos(`janelas.${i}.duracao_slot_minutos`)}
                  />
                  {erro(`janelas.${i}.duracao_slot_minutos`)}
                </label>
              </div>
            </div>
          ))}
        </div>
        {modo === "intervalo_livre" && (
          <p className="cadastro-help">
            No modo livre, o agendamento usa o intervalo entre horários definido
            nas informações do laboratório.
          </p>
        )}
        <button
          type="button"
          className="button button-ghost"
          onClick={() =>
            horarios.append({
              dia_semana: 1,
              inicio: "08:00",
              fim: "18:00",
              duracao_slot_minutos: 60,
            })
          }
        >
          <Plus size={15} />
          Adicionar horário
        </button>
      </fieldset>
      <fieldset disabled={desabilitado} className="cadastro-fieldset">
        <legend>Equipamentos do laboratório</legend>
        <p className="cadastro-help">
          Adicione os equipamentos disponíveis neste espaço. O patrimônio é
          opcional e precisa ser único. Itens removidos ficam inativos para
          preservar o histórico.
        </p>
        {erro("equipamentos")}
        {inventario.fields.length === 0 && (
          <p className="cadastro-help">Nenhum equipamento adicionado.</p>
        )}
        <div className="cadastro-repeat-list">
          {inventario.fields.map((item, i) => (
            <div className="cadastro-repeat-card" key={item.chave}>
              <div className="cadastro-repeat-heading">
                <h3>Equipamento {i + 1}</h3>
                <button
                  className="button button-ghost button-sm"
                  type="button"
                  onClick={() => {
                    const equipamento = getValues(`equipamentos.${i}`);
                    const salvo = equipamentos.find(
                      (item) => item.id === equipamento.id,
                    );
                    if (salvo && salvo.status !== "inativo")
                      setEquipamentosRetirados((itens) => [
                        ...itens,
                        {
                          ...equipamentoParaFormulario(salvo),
                          status: "inativo",
                        },
                      ]);
                    inventario.remove(i);
                  }}
                  aria-label={`Remover equipamento ${i + 1}`}
                >
                  <Trash2 size={14} />
                  <span>Remover</span>
                </button>
              </div>
              <div className="form-grid">
                <label className="full">
                  Nome do equipamento
                  <input
                    className="input"
                    {...register(`equipamentos.${i}.nome`)}
                    {...atributos(`equipamentos.${i}.nome`)}
                  />
                  {erro(`equipamentos.${i}.nome`)}
                </label>
                <label>
                  Patrimônio (opcional)
                  <input
                    className="input"
                    {...register(`equipamentos.${i}.patrimonio`, {
                      setValueAs: (valor: unknown) =>
                        typeof valor === "string" ? valor.trim() || null : null,
                    })}
                    {...atributos(`equipamentos.${i}.patrimonio`)}
                  />
                  {erro(`equipamentos.${i}.patrimonio`)}
                </label>
                <label>
                  Quantidade
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100000}
                    {...register(`equipamentos.${i}.quantidade`, {
                      valueAsNumber: true,
                    })}
                    {...atributos(`equipamentos.${i}.quantidade`)}
                  />
                  {erro(`equipamentos.${i}.quantidade`)}
                </label>
                <label className="full">
                  Situação
                  <select
                    className="input"
                    {...register(`equipamentos.${i}.status`)}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="manutencao">Em manutenção</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
                <label className="checkbox-label full">
                  <input
                    type="checkbox"
                    {...register(
                      `equipamentos.${i}.reservavel_individualmente`,
                    )}
                  />
                  Pode ser reservado individualmente
                </label>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="button button-ghost"
          onClick={() =>
            inventario.append({
              nome: "",
              patrimonio: null,
              quantidade: 1,
              status: "ativo",
              reservavel_individualmente: true,
            })
          }
        >
          <Plus size={15} />
          Adicionar equipamento
        </button>
      </fieldset>
      <button
        disabled={desabilitado || recargaObrigatoria}
        className="button button-primary cadastro-save"
        type="submit"
      >
        <Save size={15} />
        {pending ? "Salvando..." : "Salvar laboratório"}
      </button>
    </form>
  );
}
