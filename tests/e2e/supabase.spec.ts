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
} from "../integration/helpers";

const liveURL = "http://127.0.0.1:3100";
let pessoas: {
  aluno: Awaited<ReturnType<typeof criarPessoa>>;
  professor: Awaited<ReturnType<typeof criarPessoa>>;
  monitor: Awaited<ReturnType<typeof criarPessoa>>;
  admin: Awaited<ReturnType<typeof criarPessoa>>;
};
const contextos: BrowserContext[] = [];

async function novaPagina(browser: Browser) {
  const contexto = await browser.newContext({
    baseURL: liveURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
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
async function solicitarNaTela(
  page: Page,
  laboratorioId: string,
  finalidade: string,
) {
  await page.goto(`/reservas/nova?lab=${laboratorioId}`);
  await page
    .getByLabel("Laboratório", { exact: true })
    .selectOption(laboratorioId);
  await page.getByLabel("Data", { exact: true }).fill(horarioFuturo().data);
  await page.getByLabel("Horário de início", { exact: true }).fill("14:00");
  await page.getByLabel("Horário de término", { exact: true }).fill("15:00");
  await page.getByLabel("Finalidade da reserva").fill(finalidade);
  await page.getByLabel("Número de participantes").fill("3");
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  await expect(page).toHaveURL(/\/reservas\/[a-f0-9-]{36}$/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
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
  await pedido
    .getByLabel("Motivo da decisão")
    .fill("Aprovação de atividade durante teste local.");
  await pedido.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect.poll(() => status(reservaId)).toBe("aprovada");
}

test.describe("fluxos reais Supabase local", () => {
  test.skip(!ambienteLocal, motivoSemSupabase);
  test.beforeAll(async () => {
    const [aluno, professor, monitor, admin] = await Promise.all([
      criarPessoa("aluno"),
      criarPessoa("professor"),
      criarPessoa("monitor"),
      criarPessoa("admin"),
    ]);
    pessoas = { aluno, professor, monitor, admin };
  });
  test.afterEach(async () => {
    await Promise.all(contextos.splice(0).map((contexto) => contexto.close()));
  });

  test("login → solicitar → monitor aprova → check-in → check-out", async ({
    page,
    browser,
  }) => {
    const lab = await criarLaboratorio(clienteServico(), pessoas.monitor.id);
    const finalidade = `QA ciclo ${randomUUID().slice(0, 8)}`;
    await entrar(page, pessoas.aluno.email);
    const id = await solicitarNaTela(page, lab.id, finalidade);
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
    const antiga = await solicitarNaTela(page, lab.id, atividadeAluno);
    const monitor = await novaPagina(browser);
    await entrar(monitor, pessoas.monitor.email);
    await aprovarNaTela(monitor, lab.id, atividadeAluno, antiga);
    const professor = await novaPagina(browser);
    await entrar(professor, pessoas.professor.email);
    const nova = await solicitarNaTela(professor, lab.id, atividadeProfessor);
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
      .getByLabel("Reserva aprovada a substituir")
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
    await page.goto("/usuarios");
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
