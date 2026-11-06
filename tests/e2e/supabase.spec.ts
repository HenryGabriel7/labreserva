import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  ambienteLocal,
  clientePublico,
  clienteServico,
  colocarReservaNoHorario,
  criarLaboratorio,
  criarPessoa,
  exigirSucesso,
  horarioFuturo,
  motivoSemSupabase,
  senhaDev,
  solicitar,
} from "../integration/helpers";

const liveURL = "https://127.0.0.1:3100";
let pessoas: {
  aluno: Awaited<ReturnType<typeof criarPessoa>>;
  professor: Awaited<ReturnType<typeof criarPessoa>>;
  funcionario: Awaited<ReturnType<typeof criarPessoa>>;
  monitor: Awaited<ReturnType<typeof criarPessoa>>;
  admin: Awaited<ReturnType<typeof criarPessoa>>;
};
const contextos: BrowserContext[] = [];

async function novaPagina(browser: Browser) {
  const contexto = await browser.newContext({
    baseURL: liveURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    ignoreHTTPSErrors: true,
  });
  contextos.push(contexto);
  return contexto.newPage();
}
async function entrar(page: Page, email: string, senha = senhaDev) {
  await page.goto("/login");
  await page.getByLabel("E-mail institucional").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(page).toHaveURL(`${liveURL}/`);
}
async function preencherSolicitacao(
  page: Page,
  laboratorioId: string,
  finalidade: string,
) {
  await page.goto(`/reservas/nova?lab=${laboratorioId}`);
  await page
    .getByRole("combobox", { name: "Laboratório", exact: true })
    .selectOption(laboratorioId);
  await page.getByLabel("Data", { exact: true }).fill(horarioFuturo().data);
  await page.getByLabel("Horário de início", { exact: true }).fill("14:00");
  await page.getByLabel("Horário de término", { exact: true }).fill("15:00");
  await page.getByLabel("Finalidade da reserva").fill(finalidade);
  await page.getByLabel("Número de participantes").fill("3");
}
async function solicitarNaTela(
  page: Page,
  laboratorioId: string,
  finalidade: string,
  solicitanteId: string,
  depois: "inicio" | "novo" = "inicio",
) {
  await preencherSolicitacao(page, laboratorioId, finalidade);
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  const confirmacao = page.getByRole("dialog", {
    name: "Sua solicitação foi enviada",
  });
  await expect(confirmacao).toBeVisible();
  await expect(
    confirmacao.getByRole("button", { name: "Voltar ao início" }),
  ).toBeVisible();
  await expect(
    confirmacao.getByRole("button", { name: "Novo agendamento" }),
  ).toBeVisible();
  const reserva = exigirSucesso(
    await clienteServico()
      .from("reservas")
      .select("id,status")
      .eq("laboratorio_id", laboratorioId)
      .eq("solicitante_id", solicitanteId)
      .eq("finalidade", finalidade)
      .single(),
    "Conferir solicitação criada pela tela",
  );
  expect(reserva.status).toBe("pendente");
  await confirmacao
    .getByRole("button", {
      name: depois === "novo" ? "Novo agendamento" : "Voltar ao início",
    })
    .click();
  if (depois === "novo") {
    await expect(confirmacao).not.toBeVisible();
    await expect(
      page.getByLabel("Finalidade da reserva", { exact: true }),
    ).toHaveValue("");
  } else await expect(page).toHaveURL(`${liveURL}/`);
  await page.goto(`/reservas/${reserva.id}`);
  return reserva.id as string;
}
const card = (page: Page, finalidade: string) =>
  page.locator("article").filter({
    has: page.getByRole("heading", { name: finalidade, exact: true }),
  });
async function status(id: string) {
  return exigirSucesso(
    await clienteServico()
      .from("reservas")
      .select("status")
      .eq("id", id)
      .single(),
    "Consultar estado da fixture",
  ).status as string;
}
async function aprovarNaTela(
  page: Page,
  laboratorioId: string,
  finalidade: string,
  reservaId: string,
) {
  await page.goto(`/monitor?lab=${laboratorioId}`);
  const pedido = card(page, finalidade);
  await pedido.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(pedido.getByRole("alert")).toContainText(
    "Informe o motivo desta decisão.",
  );
  await expect(pedido.getByLabel("Motivo da decisão")).toBeFocused();
  await expect(pedido.getByLabel("Motivo da decisão")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await pedido
    .getByLabel("Motivo da decisão")
    .fill("Aprovação de atividade durante teste local.");
  await pedido.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect.poll(() => status(reservaId)).toBe("aprovada");
}

test.describe("fluxos reais Supabase local", () => {
  test.skip(!ambienteLocal, motivoSemSupabase);
  test.beforeAll(async () => {
    const [aluno, professor, funcionario, monitor, admin] = await Promise.all([
      criarPessoa("aluno"),
      criarPessoa("professor"),
      criarPessoa("funcionario"),
      criarPessoa("monitor"),
      criarPessoa("admin"),
    ]);
    pessoas = { aluno, professor, funcionario, monitor, admin };
  });
  test.afterEach(async () => {
    await Promise.all(contextos.splice(0).map((contexto) => contexto.close()));
  });

  test("área administrativa sem sessão redireciona para login", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios");
    await expect(page).toHaveURL(`${liveURL}/login`);
  });

  for (const papel of [
    "aluno",
    "professor",
    "funcionario",
    "monitor",
  ] as const) {
    test(`${papel} não entra na administração por link direto`, async ({
      page,
    }) => {
      await entrar(page, pessoas[papel].email);
      await expect(
        page.getByRole("link", { name: "Espaço administrativo", exact: true }),
      ).toHaveCount(0);
      for (const destino of [
        "/admin",
        "/admin/usuarios",
        "/admin/solicitacoes",
      ]) {
        await page.goto(destino);
        await expect(page).toHaveURL(`${liveURL}/acesso-negado`);
        await expect(
          page.getByRole("heading", { name: "Acesso não autorizado." }),
        ).toBeVisible();
      }
    });
  }

  test("admin alterna espaços no celular e agenda no portal de usuário", async ({
    page,
  }) => {
    const servico = clienteServico();
    const lab = await criarLaboratorio(servico, pessoas.monitor.id);
    const inativo = await criarLaboratorio(servico);
    exigirSucesso(
      await servico
        .from("laboratorios")
        .update({ ativo: false })
        .eq("id", inativo.id),
      "Preparar laboratório inativo para o teste",
    );
    await page.setViewportSize({ width: 320, height: 800 });
    await entrar(page, pessoas.admin.email);
    const cabecalho = page.getByRole("banner");
    const irParaAdmin = cabecalho.getByRole("link", {
      name: "Espaço administrativo",
      exact: true,
    });
    await expect(irParaAdmin).toBeInViewport();
    await irParaAdmin.click();
    await expect(page).toHaveURL(`${liveURL}/admin`);
    await page.goto("/admin/laboratorios");
    await expect(page.getByText(inativo.nome, { exact: true })).toBeVisible();
    await page.goto("/admin/solicitacoes");
    const voltar = cabecalho.getByRole("link", {
      name: "Espaço de usuário",
      exact: true,
    });
    await expect(voltar).toBeInViewport();
    await voltar.click();
    await expect(page).toHaveURL(`${liveURL}/`);
    await page.goto(`/reservas/nova?lab=${inativo.id}`);
    await expect(page.getByRole("status")).toContainText(
      "O laboratório selecionado não está disponível.",
    );
    await expect(
      page
        .getByRole("combobox", { name: "Laboratório", exact: true })
        .locator(`option[value="${inativo.id}"]`),
    ).toHaveCount(0);
    const finalidade = `QA reserva de administrador ${randomUUID().slice(0, 8)}`;
    await solicitarNaTela(page, lab.id, finalidade, pessoas.admin.id);
    await page.goto(`/admin/solicitacoes?lab=${lab.id}`);
    await expect(
      card(page, finalidade).getByRole("button", {
        name: "Aprovar",
        exact: true,
      }),
    ).toBeDisabled();
  });

  test("admin abre o detalhe administrativo e recusa a solicitação de outra conta", async ({
    page,
  }) => {
    const lab = await criarLaboratorio(clienteServico(), pessoas.monitor.id);
    const finalidade = `QA recusa administrativa ${randomUUID().slice(0, 8)}`;
    const id = await solicitar(pessoas.aluno.cliente, lab.id, finalidade);
    await entrar(page, pessoas.admin.email);
    await page.goto(`/monitor?lab=${lab.id}`);
    await expect(page).toHaveURL(`${liveURL}/admin/solicitacoes?lab=${lab.id}`);
    const pedido = card(page, finalidade);
    await pedido.getByRole("link", { name: finalidade, exact: true }).click();
    await expect(page).toHaveURL(`${liveURL}/admin/reservas/${id}`);
    await page.goBack();
    await pedido
      .getByLabel("Motivo da decisão")
      .fill("Recusa na área administrativa de teste.");
    await pedido.getByRole("button", { name: "Recusar", exact: true }).click();
    await expect.poll(() => status(id)).toBe("recusada");
  });

  test("monitor agenda no portal de usuário", async ({ page }) => {
    const lab = await criarLaboratorio(clienteServico(), pessoas.monitor.id);
    await entrar(page, pessoas.monitor.email);
    await solicitarNaTela(
      page,
      lab.id,
      `QA reserva de monitor ${randomUUID().slice(0, 8)}`,
      pessoas.monitor.id,
    );
  });

  test("funcionário solicita série de equipamentos e monitor aprova as datas", async ({
    page,
    browser,
  }) => {
    const servico = clienteServico();
    const lab = await criarLaboratorio(servico, pessoas.monitor.id);
    const equipamentoId = randomUUID();
    exigirSucesso(
      await servico.from("equipamentos").insert({
        id: equipamentoId,
        laboratorio_id: lab.id,
        nome: "Projetor QA",
        quantidade: 4,
        status: "ativo",
        reservavel_individualmente: true,
      }),
      "Criar equipamento de teste",
    );
    const finalidade = `QA série de equipamentos ${randomUUID().slice(0, 8)}`;
    const primeiro = horarioFuturo();
    const excecao = horarioFuturo(9);
    const ultimo = horarioFuturo(16);
    await entrar(page, pessoas.funcionario.email);
    await preencherSolicitacao(page, lab.id, finalidade);
    await page.getByLabel("O que você precisa?").selectOption("equipamentos");
    await page.getByRole("button", { name: "Adicionar equipamento" }).click();
    await page
      .getByRole("combobox", { name: "Equipamento", exact: true })
      .selectOption(equipamentoId);
    await page
      .getByRole("spinbutton", { name: "Quantidade", exact: true })
      .fill("2");
    await page.getByRole("checkbox", { name: /Repetir semanalmente/ }).check();
    await page.getByLabel("Repetir até").fill(ultimo.data);
    await page.getByLabel("Datas de exceção (opcional)").fill(excecao.data);
    await page.getByRole("button", { name: "Enviar solicitação" }).click();
    await expect(
      page.getByRole("dialog", { name: "Sua solicitação foi enviada" }),
    ).toContainText("2 solicitações criadas");

    const reservas = exigirSucesso(
      await servico
        .from("reservas")
        .select("id,inicio,status,escopo,papel_solicitante,recorrencia_id")
        .eq("laboratorio_id", lab.id)
        .eq("solicitante_id", pessoas.funcionario.id)
        .eq("finalidade", finalidade)
        .order("inicio"),
      "Conferir as datas e o escopo da série",
    );
    expect(reservas).toHaveLength(2);
    expect(reservas[0].recorrencia_id).toBeTruthy();
    expect(
      reservas.map((reserva) => new Date(reserva.inicio).toISOString()),
    ).toEqual([primeiro.inicio, ultimo.inicio]);
    for (const reserva of reservas) {
      expect(reserva).toMatchObject({
        escopo: "equipamentos",
        papel_solicitante: "funcionario",
        recorrencia_id: reservas[0].recorrencia_id,
        status: "pendente",
      });
    }
    const itens = exigirSucesso(
      await servico
        .from("reserva_equipamentos")
        .select("equipamento_id,quantidade")
        .in(
          "reserva_id",
          reservas.map((reserva) => reserva.id),
        ),
      "Conferir a quantidade reservada em cada data",
    );
    expect(itens).toEqual(
      Array(2).fill({ equipamento_id: equipamentoId, quantidade: 2 }),
    );

    const monitor = await novaPagina(browser);
    await entrar(monitor, pessoas.monitor.email);
    await monitor.goto(`/monitor?lab=${lab.id}`);
    await monitor
      .getByLabel("Motivo da aprovação")
      .fill("Série local de equipamentos aprovada durante o teste.");
    await monitor
      .getByRole("button", { name: "Aprovar datas sem conflito" })
      .click();
    await expect
      .poll(() => Promise.all(reservas.map((reserva) => status(reserva.id))))
      .toEqual(["aprovada", "aprovada"]);
  });

  test("duração e alinhamento aparecem em vermelho no campo antes do envio", async ({
    page,
  }) => {
    const lab = await criarLaboratorio(clienteServico(), pessoas.monitor.id);
    const finalidade = `QA validação ${randomUUID().slice(0, 8)}`;
    await entrar(page, pessoas.aluno.email);
    await page.goto(`/reservas/nova?lab=${lab.id}`);
    await page.getByLabel("Data", { exact: true }).fill(horarioFuturo().data);
    const inicio = page.getByLabel("Horário de início", { exact: true });
    const fim = page.getByLabel("Horário de término", { exact: true });
    await inicio.fill("14:00");
    await fim.fill("14:30");
    await page
      .getByLabel("Finalidade da reserva", { exact: true })
      .fill(finalidade);
    const enviar = page.getByRole("button", { name: "Enviar solicitação" });
    await enviar.click();
    await expect(fim).toBeFocused();
    await expect(fim).toHaveAttribute("aria-invalid", "true");
    await expect(fim).toHaveCSS("border-color", "rgb(179, 48, 48)");
    await expect(page.locator("#erro-fim")).toContainText("60 a 240 minutos");
    await expect(page.locator("#erro-fim")).toHaveCSS(
      "color",
      "rgb(179, 48, 48)",
    );
    await inicio.fill("14:15");
    await fim.fill("15:15");
    await enviar.click();
    await expect(inicio).toBeFocused();
    await expect(inicio).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#erro-inicio")).toContainText(
      "passos de 60 minutos",
    );
    const tentativas = await clienteServico()
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .eq("laboratorio_id", lab.id)
      .eq("solicitante_id", pessoas.aluno.id)
      .eq("finalidade", finalidade);
    expect(tentativas.error).toBeNull();
    expect(tentativas.count).toBe(0);
    await inicio.fill("14:00");
    await fim.fill("15:00");
    await enviar.click();
    await expect(
      page.getByRole("dialog", { name: "Sua solicitação foi enviada" }),
    ).toBeVisible();
  });

  test("login → solicitar → monitor aprova → check-in → check-out", async ({
    page,
    browser,
  }) => {
    const lab = await criarLaboratorio(clienteServico(), pessoas.monitor.id);
    const finalidade = `QA ciclo ${randomUUID().slice(0, 8)}`;
    await entrar(page, pessoas.aluno.email);
    const id = await solicitarNaTela(
      page,
      lab.id,
      finalidade,
      pessoas.aluno.id,
      "novo",
    );
    const monitor = await novaPagina(browser);
    await entrar(monitor, pessoas.monitor.email);
    await aprovarNaTela(monitor, lab.id, finalidade, id);
    await colocarReservaNoHorario(id);
    await monitor.goto(`/monitor?aba=agenda&lab=${lab.id}`);
    await card(monitor, finalidade)
      .getByRole("button", { name: "Fazer check-in" })
      .click();
    await expect.poll(() => status(id)).toBe("em_uso");
    await card(monitor, finalidade)
      .getByRole("button", { name: "Fazer check-out" })
      .click();
    await expect.poll(() => status(id)).toBe("concluida");
    const checkin = exigirSucesso(
      await clienteServico()
        .from("checkins")
        .select("entrada,saida")
        .eq("reserva_id", id)
        .single(),
      "Conferir check-in e saída reais",
    );
    expect(checkin.entrada).toBeTruthy();
    expect(checkin.saida).toBeTruthy();
    await page.reload();
    await expect(page.getByText("Concluída", { exact: true })).toBeVisible();
  });

  test("professor solicita horário do aluno e monitor substitui com motivo", async ({
    page,
    browser,
  }) => {
    const lab = await criarLaboratorio(clienteServico(), pessoas.monitor.id);
    const atividadeAluno = `QA aluno ${randomUUID().slice(0, 8)}`;
    const atividadeProfessor = `QA professor ${randomUUID().slice(0, 8)}`;
    await entrar(page, pessoas.aluno.email);
    const antiga = await solicitarNaTela(
      page,
      lab.id,
      atividadeAluno,
      pessoas.aluno.id,
    );
    const monitor = await novaPagina(browser);
    await entrar(monitor, pessoas.monitor.email);
    await aprovarNaTela(monitor, lab.id, atividadeAluno, antiga);
    const professor = await novaPagina(browser);
    await entrar(professor, pessoas.professor.email);
    const nova = await solicitarNaTela(
      professor,
      lab.id,
      atividadeProfessor,
      pessoas.professor.id,
    );
    await monitor.goto(`/monitor?lab=${lab.id}`);
    const pedido = card(monitor, atividadeProfessor);
    await expect(
      pedido.getByText("Horários coincidentes · compare antes de decidir"),
    ).toBeVisible();
    await pedido
      .getByLabel("Motivo da decisão")
      .fill(
        "Atividade curricular prioritária, substituição validada pelo monitor.",
      );
    await pedido
      .getByRole("combobox", {
        name: "Reserva aprovada a substituir",
        exact: true,
      })
      .selectOption(antiga);
    await pedido.getByRole("button", { name: "Substituir com motivo" }).click();
    await expect.poll(() => status(antiga)).toBe("substituida");
    await expect.poll(() => status(nova)).toBe("aprovada");
    await page.reload();
    await expect(page.getByText("Substituída", { exact: true })).toBeVisible();
    const fila = exigirSucesso(
      await clienteServico()
        .from("notificacoes")
        .select("id")
        .eq("usuario_id", pessoas.aluno.id)
        .eq("tipo_evento", "reserva_substituida")
        .eq("payload->>reserva_id", antiga),
      "Conferir email essencial na fila",
    );
    expect(fila?.length).toBeGreaterThan(0);
  });

  test("solicitante cancela a própria solicitação pela tela", async ({
    page,
  }) => {
    const lab = await criarLaboratorio(clienteServico(), pessoas.monitor.id);
    await entrar(page, pessoas.aluno.email);
    const id = await solicitarNaTela(
      page,
      lab.id,
      `QA cancelamento ${randomUUID().slice(0, 8)}`,
      pessoas.aluno.id,
    );
    await page
      .getByRole("button", { name: "Cancelar reserva", exact: true })
      .click();
    await page
      .getByLabel("Motivo do cancelamento")
      .fill("Atividade reagendada durante o teste local.");
    await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
    await expect.poll(() => status(id)).toBe("cancelada");
    await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
  });

  test("cadastro público falha e convite administrativo confirma e define senha", async ({
    page,
    browser,
  }) => {
    const email = `e2e-invite-${randomUUID()}@teste.edu.br`;
    const signup = await clientePublico().auth.signUp({
      email,
      password: senhaDev,
    });
    expect(signup.error?.code).toBe("signup_disabled");
    await entrar(page, pessoas.admin.email);
    await page.goto("/admin/usuarios");
    await page.getByRole("button", { name: "Adicionar usuário" }).click();
    await page.getByLabel("Nome completo").fill("Pessoa convidada no E2E");
    await page.getByLabel("E-mail institucional").fill(email);
    const resposta = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/usuarios") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Criar e enviar convite" }).click();
    expect((await resposta).status()).toBe(201);
    const servico = clienteServico();
    const perfil = exigirSucesso(
      await servico.from("profiles").select("id").eq("email", email).single(),
      "Encontrar pessoa convidada",
    );
    const fila = exigirSucesso(
      await servico
        .from("notificacoes")
        .select("payload,status")
        .eq("usuario_id", perfil.id)
        .eq("tipo_evento", "convite")
        .single(),
      "Obter convite da fila local sem enviar email",
    );
    expect(fila.status).toBe("pendente");
    const url = fila.payload.url as string;
    expect(new URL(url).origin).toBe(liveURL);
    const convidado = await novaPagina(browser);
    await convidado.goto(url);
    await expect(convidado).toHaveURL(`${liveURL}/definir-senha`);
    const senha = "SenhaConviteQA!123456";
    await convidado.getByLabel("Nova senha", { exact: true }).fill(senha);
    await convidado.getByLabel("Confirme a nova senha").fill(senha);
    await convidado.getByRole("button", { name: "Salvar minha senha" }).click();
    await expect(convidado).toHaveURL(/\/login\?senha=atualizada$/);
    await entrar(convidado, email, senha);
    await convidado.goto("/perfil");
    await expect(
      convidado.getByRole("heading", { name: "Pessoa convidada no E2E" }),
    ).toBeVisible();
  });
});
