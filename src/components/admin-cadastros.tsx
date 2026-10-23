"use client";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Pencil, Trash2, Plus, Save } from "lucide-react";
import {
  salvarLaboratorioAction,
  salvarEquipamentoAction,
  salvarJanelaAction,
  removerCadastroAction,
} from "@/lib/actions-cadastros";
import type { Laboratorio, Equipamento, JanelaHorario } from "@/lib/types";
import { tiposLaboratorio, nomeTipo } from "@/lib/types";
import { LaboratorioForm } from "./laboratorio-form";
type Campo = {
  name: string;
  label: string;
  tipo?: string;
  opcoes?: { valor: string; label: string }[];
};
type Tab = "laboratorios" | "equipamentos" | "janelas_horario";
export function AdminCadastros({
  laboratorios,
  equipamentos,
  janelas,
  demonstracao,
}: {
  laboratorios: Laboratorio[];
  equipamentos: Equipamento[];
  janelas: JanelaHorario[];
  demonstracao: boolean;
}) {
  const [tab, setTab] = useState<Tab>("laboratorios");
  const [editando, setEditando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [pendente, startTransition] = useTransition();
  const lista =
    tab === "laboratorios"
      ? laboratorios
      : tab === "equipamentos"
        ? equipamentos
        : janelas;
  const selecionado = lista.find((i) => i.id === editando) as unknown as
    Record<string, unknown> | undefined;
  const labOpcoes = laboratorios.map((l) => ({ valor: l.id, label: l.nome }));
  const campos: Campo[] =
    tab === "laboratorios"
      ? [
          { name: "nome", label: "Nome do laboratório" },
          {
            name: "tipo",
            label: "Tipo",
            opcoes: tiposLaboratorio.map((t) => ({
              valor: t,
              label: nomeTipo[t],
            })),
          },
          { name: "capacidade", label: "Capacidade", tipo: "number" },
          { name: "localizacao", label: "Localização" },
          { name: "descricao", label: "Descrição", tipo: "textarea" },
          { name: "regras_de_uso", label: "Regras de uso", tipo: "textarea" },
          {
            name: "modo_reserva",
            label: "Modo de reserva",
            opcoes: [
              { valor: "slot_fixo", label: "Slots fixos" },
              { valor: "intervalo_livre", label: "Intervalo livre" },
            ],
          },
          {
            name: "granularidade_minutos",
            label: "Granularidade (min)",
            tipo: "number",
          },
          {
            name: "duracao_minima_minutos",
            label: "Duração mínima (min)",
            tipo: "number",
          },
          {
            name: "duracao_maxima_minutos",
            label: "Duração máxima (min)",
            tipo: "number",
          },
          { name: "ativo", label: "Laboratório ativo", tipo: "checkbox" },
        ]
      : tab === "equipamentos"
        ? [
            { name: "laboratorio_id", label: "Laboratório", opcoes: labOpcoes },
            { name: "nome", label: "Nome do equipamento" },
            { name: "patrimonio", label: "Patrimônio" },
            { name: "quantidade", label: "Quantidade", tipo: "number" },
            {
              name: "status",
              label: "Situação",
              opcoes: [
                { valor: "ativo", label: "Ativo" },
                { valor: "manutencao", label: "Em manutenção" },
                { valor: "inativo", label: "Inativo" },
              ],
            },
            {
              name: "reservavel_individualmente",
              label: "Pode ser reservado individualmente",
              tipo: "checkbox",
            },
          ]
        : [
            { name: "laboratorio_id", label: "Laboratório", opcoes: labOpcoes },
            {
              name: "dia_semana",
              label: "Dia da semana",
              opcoes: [
                "Domingo",
                "Segunda",
                "Terça",
                "Quarta",
                "Quinta",
                "Sexta",
                "Sábado",
              ].map((d, i) => ({ valor: String(i), label: d })),
            },
            { name: "inicio", label: "Abertura", tipo: "time" },
            { name: "fim", label: "Encerramento", tipo: "time" },
            {
              name: "duracao_slot_minutos",
              label: "Duração de cada slot (min)",
              tipo: "number",
            },
          ];
  const padrao =
    tab === "laboratorios"
      ? {
          nome: "",
          tipo: "informatica",
          capacidade: 30,
          localizacao: "",
          descricao: "",
          regras_de_uso: "",
          modo_reserva: "slot_fixo",
          granularidade_minutos: 30,
          duracao_minima_minutos: 60,
          duracao_maxima_minutos: 240,
          ativo: true,
        }
      : tab === "equipamentos"
        ? {
            laboratorio_id: laboratorios[0]?.id ?? "",
            nome: "",
            patrimonio: "",
            quantidade: 1,
            status: "ativo",
            reservavel_individualmente: true,
          }
        : {
            laboratorio_id: laboratorios[0]?.id ?? "",
            dia_semana: 1,
            inicio: "08:00",
            fim: "18:00",
            duracao_slot_minutos: 60,
          };
  const iniciais = Object.fromEntries(
    campos.map((c) => [
      c.name,
      selecionado?.[c.name] ?? (padrao as Record<string, unknown>)[c.name],
    ]),
  );
  async function remover(id: string) {
    setMensagem("");
    if (
      !window.confirm(
        "Remover este cadastro? Registros com histórico serão preservados.",
      )
    )
      return;
    startTransition(async () => {
      const r = await removerCadastroAction({ entidade: tab, id });
      setMensagem(r.mensagem);
    });
  }
  return (
    <>
      <div className="settings-tabs" role="group" aria-label="Cadastros">
        {(
          [
            ["laboratorios", "Laboratórios"],
            ["equipamentos", "Equipamentos"],
            ["janelas_horario", "Funcionamento"],
          ] as const
        ).map(([t, label]) => (
          <button
            type="button"
            aria-pressed={tab === t}
            className={`button ${tab === t ? "button-primary" : "button-ghost"}`}
            key={t}
            onClick={() => {
              setTab(t);
              setEditando(null);
              setMensagem("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {demonstracao && (
        <p className="notice" style={{ marginBottom: 20 }}>
          Os cadastros estão disponíveis para consulta. Entre com uma conta de
          administrador para fazer alterações.
        </p>
      )}
      {mensagem && (
        <div role="status" className="notice" style={{ marginBottom: 18 }}>
          {mensagem}
        </div>
      )}
      <div className="crud-layout">
        <section className="panel">
          <div className="section-heading">
            <h2>Cadastros existentes</h2>
            <button
              className="button button-ghost button-sm"
              onClick={() => setEditando(null)}
            >
              <Plus size={13} />
              Novo
            </button>
          </div>
          <div className="crud-list">
            {lista.map((item) => (
              <div className="crud-list-item" key={item.id}>
                <div>
                  <strong>
                    {"nome" in item
                      ? item.nome
                      : `${["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][item.dia_semana]} · ${item.inicio.slice(0, 5)} – ${item.fim.slice(0, 5)}`}
                  </strong>
                  <small>
                    {"localizacao" in item
                      ? item.localizacao
                      : laboratorios.find((l) => l.id === item.laboratorio_id)
                          ?.nome}
                  </small>
                  {tab === "laboratorios" &&
                    !janelas.some(
                      (janela) => janela.laboratorio_id === item.id,
                    ) && (
                      <span className="cadastro-warning">
                        Sem funcionamento cadastrado. Edite para permitir
                        agendamentos.
                      </span>
                    )}
                </div>
                <div>
                  <button
                    className="button button-ghost button-sm"
                    onClick={() => setEditando(item.id)}
                    aria-label="Editar cadastro"
                  >
                    <Pencil size={14} />
                    <span>Editar</span>
                  </button>
                  <button
                    className="button button-ghost button-sm"
                    disabled={demonstracao || pendente}
                    onClick={() => remover(item.id)}
                    aria-label="Remover cadastro"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        {tab === "laboratorios" && editando && !selecionado ? (
          <section className="panel crud-form" role="status">
            Carregando os dados do laboratório salvo…
          </section>
        ) : tab === "laboratorios" ? (
          <LaboratorioForm
            key={`laboratorio-${editando}`}
            laboratorio={laboratorios.find((lab) => lab.id === editando)}
            janelas={janelas.filter(
              (janela) => janela.laboratorio_id === editando,
            )}
            equipamentos={equipamentos.filter(
              (equipamento) => equipamento.laboratorio_id === editando,
            )}
            demonstracao={demonstracao}
            onSaved={(id, mensagem) => {
              setEditando(id);
              setMensagem(mensagem);
            }}
          />
        ) : (
          <CadastroForm
            key={`${tab}-${editando}`}
            campos={campos}
            iniciais={iniciais}
            id={editando}
            tab={tab}
            demonstracao={demonstracao}
          />
        )}
      </div>
    </>
  );
}
function CadastroForm({
  campos,
  iniciais,
  id,
  tab,
  demonstracao,
}: {
  campos: Campo[];
  iniciais: Record<string, unknown>;
  id: string | null;
  tab: Tab;
  demonstracao: boolean;
}) {
  const { register, handleSubmit } = useForm({ defaultValues: iniciais });
  const [resultado, setResultado] = useState<{
    ok: boolean;
    mensagem: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(valores: Record<string, unknown>) {
    setResultado(null);
    const dados: Record<string, unknown> = {
      ...valores,
      ...(id ? { id } : {}),
    };
    if (tab === "janelas_horario") dados.dia_semana = Number(dados.dia_semana);
    if (tab === "equipamentos" && !dados.patrimonio) dados.patrimonio = null;
    startTransition(async () => {
      try {
        const fn =
          tab === "laboratorios"
            ? salvarLaboratorioAction
            : tab === "equipamentos"
              ? salvarEquipamentoAction
              : salvarJanelaAction;
        setResultado(await fn(dados));
      } catch {
        setResultado({
          ok: false,
          mensagem: "Não foi possível salvar. Tente novamente.",
        });
      }
    });
  }
  return (
    <form className="panel crud-form" onSubmit={handleSubmit(submit)}>
      <h2>{id ? "Editar cadastro" : "Adicionar cadastro"}</h2>
      <fieldset
        disabled={demonstracao || pending}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        <div className="form-grid">
          {campos.map((c) =>
            c.tipo === "checkbox" ? (
              <label key={c.name} className="checkbox-label full">
                <input type="checkbox" {...register(c.name)} />
                {c.label}
              </label>
            ) : (
              <label
                key={c.name}
                className={c.tipo === "textarea" ? "full" : ""}
              >
                {c.label}
                {c.opcoes ? (
                  <select className="input" {...register(c.name)}>
                    {c.opcoes.map((o) => (
                      <option value={o.valor} key={o.valor}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : c.tipo === "textarea" ? (
                  <textarea className="input" {...register(c.name)} />
                ) : (
                  <input
                    className="input"
                    type={c.tipo ?? "text"}
                    {...register(c.name, {
                      valueAsNumber: c.tipo === "number",
                    })}
                  />
                )}
              </label>
            ),
          )}
        </div>
        <button
          className="button button-primary"
          style={{ marginTop: 24 }}
          type="submit"
        >
          <Save size={15} />
          {pending ? "Salvando..." : "Salvar cadastro"}
        </button>
      </fieldset>
      {resultado && (
        <p
          role="status"
          className={`form-message ${!resultado.ok ? "form-message-error" : ""}`}
        >
          {resultado.mensagem}
        </p>
      )}
    </form>
  );
}
