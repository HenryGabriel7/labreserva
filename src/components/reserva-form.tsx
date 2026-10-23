"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Plus,
  Trash2,
  ShieldCheck,
  CalendarDays,
  Info,
  CircleCheck,
  TriangleAlert,
} from "lucide-react";
import {
  reservaFormularioSchema,
  type ReservaFormulario,
} from "@/lib/schemas-reservas";
import { solicitarReservaAction } from "@/lib/actions-reservas";
import type { Laboratorio, Equipamento, JanelaHorario } from "@/lib/types";
import { gerarDatasRecorrencia } from "@/lib/recorrencia";
import {
  horariosSlots,
  janelasDoDia,
  validarHorarioReserva,
  type PoliticaAntecedencia,
} from "@/lib/reservas";
export function ReservaForm({
  laboratorios,
  equipamentos,
  janelas,
  labInicial,
  dataInicial,
  horaInicioInicial,
  horaFimInicial,
  demonstracao,
  prioridade,
  politica,
}: {
  laboratorios: Laboratorio[];
  equipamentos: Equipamento[];
  janelas: JanelaHorario[];
  labInicial?: string;
  dataInicial?: string;
  horaInicioInicial?: string;
  horaFimInicial?: string;
  demonstracao: boolean;
  prioridade: boolean;
  politica: PoliticaAntecedencia;
}) {
  const router = useRouter();
  const [mensagem, setMensagem] = useState("");
  const [sucesso, setSucesso] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const erroResumo = useRef<HTMLDivElement>(null);
  const focarResumo = useRef(false);
  const [pending, startTransition] = useTransition();
  const hoje = formatInTimeZone(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
  const {
    register,
    handleSubmit,
    control,
    setError,
    clearErrors,
    setFocus,
    reset,
    formState: { errors },
  } = useForm<ReservaFormulario>({
    resolver: zodResolver(reservaFormularioSchema),
    defaultValues: {
      laboratorioId: labInicial ?? laboratorios.find((l) => l.ativo)?.id ?? "",
      data: dataInicial ?? hoje,
      horaInicio: horaInicioInicial ?? "",
      horaFim: horaFimInicial ?? "",
      escopo: "laboratorio",
      finalidade: "",
      nParticipantes: 1,
      justificativaPrioridade: "",
      equipamentos: [],
      repetir: false,
      dataFim: "",
      excecoes: "",
    },
  });
  useEffect(() => {
    if (sucesso && !dialog.current?.open) dialog.current?.showModal();
  }, [sucesso]);
  useEffect(() => {
    if (mensagem && focarResumo.current) {
      erroResumo.current?.focus();
      focarResumo.current = false;
    }
  }, [mensagem]);
  const { fields, append, remove } = useFieldArray({
    control,
    name: "equipamentos",
  });
  const labId = useWatch({ control, name: "laboratorioId" });
  const data = useWatch({ control, name: "data" });
  const repetir = useWatch({ control, name: "repetir" });
  const dataFim = useWatch({ control, name: "dataFim" });
  const excecoes = useWatch({ control, name: "excecoes" });
  const escopo = useWatch({ control, name: "escopo" });
  let previstas = 0;
  try {
    if (repetir && dataFim)
      previstas = gerarDatasRecorrencia({
        dataInicio: data,
        dataFim,
        diaSemana: new Date(data + "T12:00:00Z").getUTCDay(),
        excecoes: excecoes
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean),
      }).datas.length;
  } catch {}
  const lab = laboratorios.find((l) => l.id === labId);
  const disponiveis = equipamentos.filter(
    (e) =>
      e.laboratorio_id === labId &&
      e.status === "ativo" &&
      (escopo !== "equipamentos" || e.reservavel_individualmente),
  );
  const funcionamento = janelasDoDia(janelas, labId, data);
  const semFuncionamento = Boolean(
    lab && !janelas.some((j) => j.laboratorio_id === lab.id),
  );
  const slots = [
    ...new Set(
      funcionamento.flatMap((janela) =>
        horariosSlots(
          janela.inicio,
          janela.fim,
          lab?.modo_reserva === "slot_fixo"
            ? janela.duracao_slot_minutos
            : (lab?.granularidade_minutos ?? 15),
        ),
      ),
    ),
  ];
  const equipamentosSelecionados = useWatch({ control, name: "equipamentos" });
  const proximoEquipamento = disponiveis.find(
    (e) =>
      !equipamentosSelecionados.some((item) => item.equipamentoId === e.id),
  );
  function novoAgendamento() {
    dialog.current?.close();
    setSucesso(null);
    setMensagem("");
    reset();
    requestAnimationFrame(() => setFocus("laboratorioId"));
  }
  function submit(v: ReservaFormulario) {
    if (pending || sucesso) return;
    setMensagem("");
    clearErrors();
    if (demonstracao) {
      setMensagem(
        "Entre com sua conta institucional para enviar uma solicitação.",
      );
      return;
    }
    const falhas = validarHorarioReserva({
      laboratorio: lab,
      janelas,
      data: v.data,
      horaInicio: v.horaInicio,
      horaFim: v.horaFim,
      politica,
    });
    if (lab && v.nParticipantes > lab.capacidade)
      falhas.push({
        campo: "nParticipantes",
        mensagem: `Este laboratório comporta até ${lab.capacidade} pessoas. Reduza a quantidade de participantes.`,
      });
    const itemInvalido = v.equipamentos.find((item) => {
      const equipamento = disponiveis.find((e) => e.id === item.equipamentoId);
      return !equipamento || item.quantidade > equipamento.quantidade;
    });
    if (itemInvalido)
      falhas.push({
        campo: "equipamentos",
        mensagem:
          "Confira os itens e as quantidades. Use somente equipamentos disponíveis deste laboratório e até o estoque informado.",
      });
    if (falhas.length) {
      falhas.forEach((falha, indice) =>
        setError(
          falha.campo,
          { type: "validate", message: falha.mensagem },
          { shouldFocus: indice === 0 },
        ),
      );
      if (falhas[0].campo === "equipamentos") {
        if (fields.length) setFocus("equipamentos.0.equipamentoId");
        else focarResumo.current = true;
      }
      setMensagem(
        "Não foi possível enviar. Corrija os campos indicados abaixo.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const {
          data,
          horaInicio,
          horaFim,
          repetir,
          dataFim,
          excecoes,
          ...campos
        } = v;
        const r = await solicitarReservaAction({
          ...campos,
          recorrencia: repetir
            ? {
                diaSemana: new Date(data + "T12:00:00Z").getUTCDay(),
                horaInicio,
                horaFim,
                dataInicio: data,
                dataFim,
                excecoes: excecoes
                  .split(",")
                  .map((d) => d.trim())
                  .filter(Boolean),
              }
            : null,
          inicio: fromZonedTime(
            `${data}T${horaInicio}:00`,
            "America/Sao_Paulo",
          ).toISOString(),
          fim: fromZonedTime(
            `${data}T${horaFim}:00`,
            "America/Sao_Paulo",
          ).toISOString(),
        });
        if (r.ok) {
          const ids = (r.dados as { reserva_ids?: string[] })?.reserva_ids;
          if (repetir) {
            const puladas =
              (r.dados as { datas_puladas?: string[] }).datas_puladas ?? [];
            setSucesso(
              `${ids?.length ?? 0} solicitações criadas. Datas puladas por feriado: ${puladas.length ? puladas.join(", ") : "nenhuma"}. Acompanhe a série em Minhas reservas.`,
            );
          } else
            setSucesso(
              "Você será avisado quando houver uma decisão. Acompanhe o andamento em Minhas reservas.",
            );
        } else {
          if (r.campo) {
            setError(
              r.campo,
              { type: "server", message: r.mensagem },
              { shouldFocus: true },
            );
            if (r.campo === "equipamentos") {
              if (fields.length) setFocus("equipamentos.0.equipamentoId");
              else focarResumo.current = true;
            }
          } else focarResumo.current = true;
          setMensagem(r.mensagem);
        }
      } catch {
        focarResumo.current = true;
        setMensagem("Não foi possível enviar. Tente novamente.");
      }
    });
  }
  return (
    <div className="reservation-form-layout">
      <form
        noValidate
        className="panel reservation-form"
        onSubmit={(event) =>
          void handleSubmit(submit, (falhas) => {
            if (falhas.equipamentos && !fields.length)
              focarResumo.current = true;
            setMensagem(
              "Corrija os campos indicados antes de enviar a solicitação.",
            );
          })(event)
        }
      >
        <div
          className="reservation-error-summary"
          role="alert"
          tabIndex={-1}
          ref={erroResumo}
          hidden={!mensagem}
        >
          <TriangleAlert size={18} aria-hidden="true" />
          <span>{mensagem}</span>
        </div>
        <div className="form-section-title">
          <span>01</span>
          <div>
            <h2>O espaço e o momento</h2>
            <p>Escolha onde e quando sua atividade vai acontecer.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="full">
            Laboratório
            <select
              className="input"
              aria-invalid={Boolean(errors.laboratorioId)}
              aria-describedby={
                errors.laboratorioId ? "erro-laboratorio" : undefined
              }
              {...register("laboratorioId", {
                onChange: () => {
                  remove();
                  clearErrors();
                  setMensagem("");
                },
              })}
            >
              {!laboratorios.some((l) => l.ativo) && (
                <option value="">Nenhum laboratório disponível</option>
              )}
              {laboratorios
                .filter((l) => l.ativo)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome} · até {l.capacidade} pessoas
                  </option>
                ))}
            </select>
            {errors.laboratorioId && (
              <span className="field-error" id="erro-laboratorio">
                {errors.laboratorioId.message}
              </span>
            )}
          </label>
          <label>
            Data
            <input
              type="date"
              aria-label="Data"
              min={hoje}
              className="input"
              aria-invalid={Boolean(errors.data)}
              aria-describedby={
                errors.data ? "erro-data" : "funcionamento-reserva"
              }
              {...register("data")}
            />
            {errors.data && (
              <span className="field-error" id="erro-data">
                {errors.data.message}
              </span>
            )}
          </label>
          <label>
            O que você precisa?
            <select
              className="input"
              {...register("escopo", { onChange: () => remove() })}
            >
              <option value="laboratorio">Laboratório completo</option>
              <option value="equipamentos">Apenas equipamentos</option>
            </select>
          </label>
          <label>
            Horário de início
            <input
              type="time"
              aria-label="Horário de início"
              className="input"
              list="slots-disponiveis"
              step={60}
              aria-invalid={Boolean(errors.horaInicio)}
              aria-describedby={
                errors.horaInicio
                  ? "erro-inicio funcionamento-reserva"
                  : "funcionamento-reserva"
              }
              {...register("horaInicio")}
            />
            {errors.horaInicio && (
              <span className="field-error" id="erro-inicio">
                {errors.horaInicio.message}
              </span>
            )}
          </label>
          <label>
            Horário de término
            <input
              type="time"
              aria-label="Horário de término"
              className="input"
              list="slots-disponiveis"
              step={60}
              aria-invalid={Boolean(errors.horaFim)}
              aria-describedby={
                errors.horaFim
                  ? "erro-fim funcionamento-reserva"
                  : "funcionamento-reserva"
              }
              {...register("horaFim")}
            />
            {errors.horaFim && (
              <span className="field-error" id="erro-fim">
                {errors.horaFim.message}
              </span>
            )}
          </label>
        </div>
        <datalist id="slots-disponiveis">
          {slots.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="form-hint" id="funcionamento-reserva">
          <CalendarDays size={13} />
          {funcionamento.length
            ? `Funcionamento: ${funcionamento.map((j) => `${j.inicio.slice(0, 5)} às ${j.fim.slice(0, 5)}${lab?.modo_reserva === "slot_fixo" ? ` (slots de ${j.duracao_slot_minutos} minutos)` : ""}`).join("; ")}${lab?.modo_reserva === "intervalo_livre" ? ` · intervalos de ${lab.granularidade_minutos} minutos` : ""}. Duração: ${lab?.duracao_minima_minutos} a ${lab?.duracao_maxima_minutos} minutos.`
            : "Sem funcionamento cadastrado para este dia."}
        </p>
        <p className="form-hint">
          Antecedência: pelo menos {politica.antecedenciaMinHoras} hora(s) e até{" "}
          {politica.antecedenciaMaxDias} dias.
        </p>
        {semFuncionamento && (
          <div className="reservation-error-summary" role="alert">
            <TriangleAlert size={18} aria-hidden="true" />
            <span>
              Este laboratório ainda não tem horários de funcionamento
              cadastrados. A administração precisa cadastrá-los antes de receber
              solicitações.{" "}
              <a href={`/laboratorios/${labId}`}>Ver laboratório</a>.
            </span>
          </div>
        )}
        <div className="form-divider" />
        <div className="form-section-title">
          <span>02</span>
          <div>
            <h2>Conte um pouco sobre a atividade</h2>
            <p>Essas informações ajudam a organizar melhor os espaços.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="full">
            Finalidade da reserva
            <textarea
              className="input"
              placeholder="Ex.: Aula prática de programação para a turma de Engenharia..."
              aria-label="Finalidade da reserva"
              maxLength={2000}
              aria-invalid={Boolean(errors.finalidade)}
              aria-describedby={
                errors.finalidade ? "erro-finalidade" : undefined
              }
              {...register("finalidade")}
            />
            {errors.finalidade && (
              <span className="field-error" id="erro-finalidade">
                {errors.finalidade.message}
              </span>
            )}
          </label>
          <label>
            Número de participantes
            <input
              type="number"
              aria-label="Número de participantes"
              min={1}
              max={lab?.capacidade ?? 10000}
              className="input"
              aria-invalid={Boolean(errors.nParticipantes)}
              aria-describedby={
                errors.nParticipantes ? "erro-participantes" : undefined
              }
              {...register("nParticipantes", { valueAsNumber: true })}
            />
            {errors.nParticipantes && (
              <span className="field-error" id="erro-participantes">
                {errors.nParticipantes.message}
              </span>
            )}
          </label>
          {prioridade && (
            <label className="full">
              Justificativa de prioridade{" "}
              <span className="muted">(opcional)</span>
              <textarea
                className="input"
                placeholder="Descreva a necessidade acadêmica ou institucional."
                aria-invalid={Boolean(errors.justificativaPrioridade)}
                aria-describedby={
                  errors.justificativaPrioridade ? "erro-prioridade" : undefined
                }
                {...register("justificativaPrioridade")}
              />
              {errors.justificativaPrioridade && (
                <span className="field-error" id="erro-prioridade">
                  {errors.justificativaPrioridade.message}
                </span>
              )}
            </label>
          )}
        </div>
        <div className="form-divider" />
        <div className="form-section-title">
          <span>03</span>
          <div>
            <h2>Equipamentos para a sua atividade</h2>
            <p>Adicione os itens e as quantidades necessárias.</p>
          </div>
        </div>
        <div
          className="reservation-equipment-fields"
          role="group"
          aria-label="Equipamentos solicitados"
          aria-describedby={
            errors.equipamentos ? "erro-equipamentos" : undefined
          }
        >
          {fields.map((f, i) => (
            <div className="equipment-form-row" key={f.id}>
              <label>
                Equipamento
                <select
                  className="input"
                  aria-invalid={Boolean(
                    errors.equipamentos?.[i]?.equipamentoId ||
                    errors.equipamentos?.message,
                  )}
                  aria-describedby={
                    errors.equipamentos ? "erro-equipamentos" : undefined
                  }
                  {...register(`equipamentos.${i}.equipamentoId`)}
                >
                  {disponiveis.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome} ({e.quantidade} no total)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantidade
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={
                    disponiveis.find(
                      (e) =>
                        e.id === equipamentosSelecionados?.[i]?.equipamentoId,
                    )?.quantidade
                  }
                  aria-invalid={Boolean(
                    errors.equipamentos?.[i]?.quantidade ||
                    errors.equipamentos?.message,
                  )}
                  aria-describedby={
                    errors.equipamentos ? "erro-equipamentos" : undefined
                  }
                  {...register(`equipamentos.${i}.quantidade`, {
                    valueAsNumber: true,
                  })}
                />
              </label>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => remove(i)}
                aria-label="Remover equipamento"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {errors.equipamentos && (
            <p className="field-error" id="erro-equipamentos">
              {errors.equipamentos.message ??
                "Confira os equipamentos selecionados."}
            </p>
          )}
        </div>
        <button
          type="button"
          className="button button-outline button-sm"
          disabled={!proximoEquipamento}
          onClick={() =>
            proximoEquipamento &&
            append({ equipamentoId: proximoEquipamento.id, quantidade: 1 })
          }
        >
          <Plus size={13} />
          Adicionar equipamento
        </button>
        {prioridade && (
          <>
            <div className="form-divider" />
            <div className="form-section-title">
              <span>04</span>
              <div>
                <h2>Um encontro que se repete</h2>
                <p>
                  Professores e funcionários podem solicitar uma série semanal.
                </p>
              </div>
            </div>
            <label
              className="checkbox-label"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <input type="checkbox" {...register("repetir")} />
              Repetir semanalmente no mesmo dia e horário
            </label>
            {repetir && (
              <div className="form-grid" style={{ marginTop: 20 }}>
                <label>
                  Repetir até
                  <input
                    className="input"
                    type="date"
                    min={data}
                    aria-invalid={Boolean(errors.dataFim)}
                    aria-describedby={
                      errors.dataFim ? "erro-data-fim" : undefined
                    }
                    {...register("dataFim")}
                  />
                  {errors.dataFim && (
                    <span className="field-error" id="erro-data-fim">
                      {errors.dataFim.message}
                    </span>
                  )}
                </label>
                <label className="full">
                  Datas de exceção (opcional)
                  <input
                    className="input"
                    placeholder="2026-11-02, 2026-11-09"
                    aria-invalid={Boolean(errors.excecoes)}
                    aria-describedby={
                      errors.excecoes ? "erro-excecoes" : undefined
                    }
                    {...register("excecoes")}
                  />
                  {errors.excecoes && (
                    <span className="field-error" id="erro-excecoes">
                      {errors.excecoes.message}
                    </span>
                  )}
                </label>
                <p className="form-hint full">
                  {previstas} encontro(s) previsto(s), antes de verificar os
                  feriados. A série respeita os limites de antecedência e de
                  duração definidos pela instituição. Cada data depende de
                  aprovação.
                </p>
              </div>
            )}
          </>
        )}
        {demonstracao && (
          <p className="notice" style={{ marginTop: 25 }}>
            Você pode explorar o formulário. Para enviar, entre com uma conta
            institucional e conecte o Supabase.
          </p>
        )}
        <div className="form-submit">
          <span>
            <ShieldCheck size={13} />
            Sua solicitação será analisada por um monitor.
          </span>
          <button
            className="button button-primary"
            type="submit"
            disabled={
              pending ||
              demonstracao ||
              Boolean(sucesso) ||
              semFuncionamento ||
              !laboratorios.some((l) => l.ativo)
            }
          >
            {pending ? "Enviando..." : "Enviar solicitação"}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
      <aside>
        <section className="panel reservation-summary">
          <span className="eyebrow">ANTES DE RESERVAR</span>
          <h2>
            Pequenos cuidados.
            <br />
            Grandes experiências.
          </h2>
          <div className="summary-note">
            <Info size={17} />
            <p>
              As solicitações podem coincidir. A reserva só estará garantida
              após a aprovação do monitor.
            </p>
          </div>
          <div className="summary-note">
            <ClockIcon />
            <p>
              Todos os horários seguem o fuso de Brasília. Respeite a
              antecedência e a duração permitidas.
            </p>
          </div>
          {lab && (
            <div className="summary-rules">
              <h3>Regras deste espaço</h3>
              <p>{lab.regras_de_uso}</p>
            </div>
          )}
          <a href="/ajuda" className="section-link">
            Conhecer a política de reservas
            <ArrowRight size={13} />
          </a>
        </section>
      </aside>
      <dialog
        ref={dialog}
        className="reservation-success-dialog"
        aria-labelledby="reserva-enviada-titulo"
        aria-describedby="reserva-enviada-descricao"
        onCancel={novoAgendamento}
      >
        <span className="reservation-success-icon">
          <CircleCheck size={30} aria-hidden="true" />
        </span>
        <h2 id="reserva-enviada-titulo">Sua solicitação foi enviada</h2>
        <p id="reserva-enviada-descricao">{sucesso}</p>
        <div className="reservation-success-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => router.push("/")}
          >
            Voltar ao início
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={novoAgendamento}
          >
            Novo agendamento
          </button>
        </div>
      </dialog>
    </div>
  );
}
function ClockIcon() {
  return <CalendarDays size={17} />;
}
