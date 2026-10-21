import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "@/lib/validacao";

const fuso = "America/Sao_Paulo";
const dataCivilSchema = z.iso.date();
const vazioOpcional = (schema: z.ZodType<string>) =>
  z.preprocess(
    (valor) => (valor === "" ? undefined : valor),
    schema.optional(),
  );

export function periodoPadrao(agora = new Date()) {
  const fim = formatInTimeZone(agora, fuso, "yyyy-MM-dd");
  return { inicio: `${fim.slice(0, 7)}-01`, fim };
}

function validarPeriodo(
  dados: { inicio: string; fim: string },
  ctx: z.RefinementCtx,
) {
  const dias =
    (Date.parse(`${dados.fim}T00:00:00Z`) -
      Date.parse(`${dados.inicio}T00:00:00Z`)) /
    86400000;
  if (dias < 0 || dias > 365)
    ctx.addIssue({
      code: "custom",
      path: ["fim"],
      message: "Escolha um período de até 366 dias, com o fim após o início.",
    });
}

export const filtroRelatorioSchema = z
  .object({
    inicio: dataCivilSchema.default(() => periodoPadrao().inicio),
    fim: dataCivilSchema.default(() => periodoPadrao().fim),
    laboratorio_id: vazioOpcional(z.uuid()),
    pagina: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .superRefine(validarPeriodo);

export const exportacaoRelatorioSchema = z
  .object({
    inicio: dataCivilSchema,
    fim: dataCivilSchema,
    laboratorio_id: vazioOpcional(z.uuid()),
    formato: z.enum(["csv", "pdf"]),
  })
  .strict()
  .superRefine(validarPeriodo);

export const filtroAuditoriaSchema = z
  .object({
    inicio: dataCivilSchema.default(() => periodoPadrao().inicio),
    fim: dataCivilSchema.default(() => periodoPadrao().fim),
    acao: vazioOpcional(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)),
    entidade: vazioOpcional(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)),
    ator_id: vazioOpcional(z.uuid()),
    entidade_id: vazioOpcional(z.uuid()),
    pagina: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict()
  .superRefine(validarPeriodo);

export const privacidadeSchema = z.discriminatedUnion("acao", [
  z
    .object({ acao: z.literal("exportar"), usuario_id: z.uuid().optional() })
    .strict(),
  z
    .object({
      acao: z.literal("anonimizar"),
      usuario_id: z.uuid(),
      motivo: z.string().trim().min(10).max(2000),
    })
    .strict(),
]);

const contagem = z.coerce.number().int().nonnegative();
export const relatorioSchema = z
  .object({
    por_laboratorio: z.array(
      z
        .object({
          id: z.uuid(),
          nome: z.string(),
          total: contagem,
          aprovadas: contagem,
          pendentes: contagem,
          no_shows: contagem,
          horas_ocupadas: z.coerce.number().nonnegative(),
        })
        .strict(),
    ),
    por_papel: z.array(
      z
        .object({
          papel: z.enum(["aluno", "professor", "funcionario"]),
          total: contagem,
        })
        .strict(),
    ),
    ocorrencias: z.array(
      z
        .object({
          tipo: z.enum(["dano", "falta_material", "uso_indevido"]),
          gravidade: z.enum(["baixa", "media", "grave"]),
          total: contagem,
        })
        .strict(),
    ),
  })
  .strict();

export type Relatorio = z.infer<typeof relatorioSchema>;
export type FiltrosRelatorio = z.infer<typeof filtroRelatorioSchema>;
export type PeriodoRelatorio = Pick<
  FiltrosRelatorio,
  "inicio" | "fim" | "laboratorio_id"
>;
export const relatorioVazio: Relatorio = {
  por_laboratorio: [],
  por_papel: [],
  ocorrencias: [],
};
export const nomesPapelRelatorio = {
  aluno: "Aluno",
  professor: "Professor",
  funcionario: "Funcionário",
};
export const nomesOcorrencia = {
  dano: "Dano",
  falta_material: "Falta de material",
  uso_indevido: "Uso indevido",
};
export const nomesGravidade = {
  baixa: "Baixa",
  media: "Média",
  grave: "Grave",
};

/** Datas do filtro são inclusivas no horário civil da instituição. */
export function intervaloRelatorio(
  dados: Pick<PeriodoRelatorio, "inicio" | "fim">,
) {
  const diaSeguinte = new Date(`${dados.fim}T12:00:00Z`);
  diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);
  return {
    p_inicio: fromZonedTime(`${dados.inicio}T00:00:00`, fuso).toISOString(),
    p_fim: fromZonedTime(
      `${diaSeguinte.toISOString().slice(0, 10)}T00:00:00`,
      fuso,
    ).toISOString(),
  };
}

export function resumoRelatorio(relatorio: Relatorio) {
  return relatorio.por_laboratorio.reduce(
    (soma, lab) => ({
      total: soma.total + lab.total,
      aprovadas: soma.aprovadas + lab.aprovadas,
      pendentes: soma.pendentes + lab.pendentes,
      noShows: soma.noShows + lab.no_shows,
      horas: soma.horas + lab.horas_ocupadas,
    }),
    { total: 0, aprovadas: 0, pendentes: 0, noShows: 0, horas: 0 },
  );
}

/** Células de texto nunca podem ser interpretadas como fórmulas pelo Excel. */
export function celulaCsv(valor: string | number) {
  let texto = String(valor).replace(/\0/g, "");
  if (/^[\s\uFEFF]*[=+\-@]/u.test(texto) || /^[\t\r\n]/u.test(texto))
    texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

export function gerarCsvRelatorio(
  relatorio: Relatorio,
  filtros: PeriodoRelatorio,
) {
  const linhas: (string | number)[][] = [
    [
      "Seção",
      "Nome ou categoria",
      "Início do período",
      "Fim do período",
      "Total",
      "Aprovadas / em uso / concluídas",
      "Pendentes",
      "Não compareceu",
      "Horas de sala confirmadas",
      "Gravidade",
    ],
  ];
  for (const lab of relatorio.por_laboratorio)
    linhas.push([
      "Laboratório",
      lab.nome,
      filtros.inicio,
      filtros.fim,
      lab.total,
      lab.aprovadas,
      lab.pendentes,
      lab.no_shows,
      lab.horas_ocupadas.toFixed(2),
      "",
    ]);
  for (const papel of relatorio.por_papel)
    linhas.push([
      "Papel na solicitação",
      nomesPapelRelatorio[papel.papel],
      filtros.inicio,
      filtros.fim,
      papel.total,
      "",
      "",
      "",
      "",
      "",
    ]);
  for (const ocorrencia of relatorio.ocorrencias)
    linhas.push([
      "Ocorrência",
      nomesOcorrencia[ocorrencia.tipo],
      filtros.inicio,
      filtros.fim,
      ocorrencia.total,
      "",
      "",
      "",
      "",
      nomesGravidade[ocorrencia.gravidade],
    ]);
  return `\uFEFF${linhas.map((linha) => linha.map(celulaCsv).join(";")).join("\r\n")}\r\n`;
}

export async function gerarPdfRelatorio(
  relatorio: Relatorio,
  filtros: PeriodoRelatorio,
  agora = new Date(),
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 17;
  let y = 20;
  function linha(texto: string, tamanho = 10, negrito = false) {
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.setFontSize(tamanho);
    const partes = doc.splitTextToSize(texto, 176) as string[];
    for (const parte of partes) {
      if (y > 274) {
        doc.addPage();
        y = 20;
      }
      doc.text(parte, margem, y);
      y += tamanho * 0.48 + 1.4;
    }
  }
  const data = (valor: string) => valor.split("-").reverse().join("/");
  const resumo = resumoRelatorio(relatorio);
  doc.setTextColor(23, 43, 58);
  linha("Relatório de laboratórios", 19, true);
  linha(`Período: ${data(filtros.inicio)} a ${data(filtros.fim)}`, 10);
  linha(
    `Gerado em ${formatInTimeZone(agora, fuso, "dd/MM/yyyy HH:mm")} (São Paulo)`,
    9,
  );
  y += 5;
  linha("Visão do período", 13, true);
  linha(
    `${resumo.total} solicitações | ${resumo.aprovadas} aprovadas, em uso ou concluídas`,
  );
  linha(
    `${resumo.pendentes} pendentes | ${resumo.noShows} não comparecimentos`,
  );
  linha(`${resumo.horas.toFixed(2)} horas de sala confirmadas`);
  y += 5;
  linha("Uso por laboratório", 13, true);
  for (const lab of relatorio.por_laboratorio) {
    linha(lab.nome, 11, true);
    linha(
      `Total: ${lab.total} | Aprovadas: ${lab.aprovadas} | Pendentes: ${lab.pendentes} | Não compareceu: ${lab.no_shows}`,
    );
    linha(`Horas de sala confirmadas: ${lab.horas_ocupadas.toFixed(2)}`, 9);
    y += 2;
  }
  if (!relatorio.por_laboratorio.length)
    linha("Nenhum laboratório no período.");
  y += 4;
  linha("Papel registrado na solicitação", 13, true);
  for (const papel of relatorio.por_papel)
    linha(`${nomesPapelRelatorio[papel.papel]}: ${papel.total} solicitações`);
  if (!relatorio.por_papel.length) linha("Nenhuma solicitação no período.");
  y += 4;
  linha("Ocorrências registradas no período", 13, true);
  for (const ocorrencia of relatorio.ocorrencias)
    linha(
      `${nomesOcorrencia[ocorrencia.tipo]} | ${nomesGravidade[ocorrencia.gravidade]}: ${ocorrencia.total}`,
    );
  if (!relatorio.ocorrencias.length) linha("Nenhuma ocorrência no período.");
  y += 5;
  linha(
    "Critérios: reservas que intersectam o período; ocorrências pela data do registro. Horas consideram sala inteira aprovada, em uso ou concluída, limitadas ao período. O papel é o snapshot da solicitação.",
    8,
  );
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    doc.setPage(pagina);
    doc.setFontSize(8);
    doc.setTextColor(90, 107, 118);
    doc.text(`Uso institucional | Página ${pagina} de ${paginas}`, margem, 288);
  }
  return doc.output("arraybuffer");
}

export function origemPermitida(
  origem: string | null,
  appUrl: string | undefined,
) {
  if (!origem || !appUrl) return false;
  try {
    const url = new URL(appUrl);
    return ["https:", "http:"].includes(url.protocol) && origem === url.origin;
  } catch {
    return false;
  }
}

export async function lerJsonLimitado(request: Request, limite = 8192) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new Error("ENTRADA_INVALIDA");
  const leitor = request.body?.getReader();
  if (!leitor) throw new Error("ENTRADA_INVALIDA");
  const partes: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const parte = await leitor.read();
    if (parte.done) break;
    total += parte.value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      throw new Error("ENTRADA_INVALIDA");
    }
    partes.push(parte.value);
  }
  return JSON.parse(Buffer.concat(partes).toString("utf8")) as unknown;
}
