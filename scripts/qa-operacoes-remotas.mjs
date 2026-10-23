/**
 * QA remoto opt-in, autorizado para as fixtures de qa-remoto.mjs.
 * Não altera política global. Os únicos ajustes de relógio são em reservas
 * listadas no estado QA, com antes/depois registrados em operacoes.json.
 * Senhas não são copiadas para evidências nem escritas no terminal.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { setTimeout as esperar } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { formatInTimeZone } from "date-fns-tz";

const projeto = "https://hvcetcfairwfuyxlyynl.supabase.co";
assert.equal(
  process.env.LABRESERVA_QA_AUTORIZADO,
  "1",
  "QA remoto requer autorização explícita.",
);
assert.equal(process.env.SUPABASE_URL, projeto, "Projeto fora do escopo QA.");
const baseURL = process.env.QA_APP_URL || "https://127.0.0.1:3100";
assert.ok(
  ["https://127.0.0.1:3100", "https://labreserva.vercel.app"].includes(baseURL),
);
const pasta = "test-results/qa-remoto";
const arquivoEstado = `${pasta}/contas.json`;
const arquivoOperacoes = `${pasta}/operacoes.json`;
await mkdir(pasta, { recursive: true });
let estado;
console.log(
  "Aguardando laboratório QA e cinco solicitações da verificação principal.",
);
for (let tentativa = 0; tentativa < 180; tentativa++) {
  estado = JSON.parse(await readFile(arquivoEstado, "utf8"));
  assert.ok(!estado.encerrado, "Fixtures encerradas; operação proibida.");
  if (estado.lab && new Set(estado.reservas?.map((r) => r.papel)).size === 5)
    break;
  await esperar(5000);
}
assert.match(estado.run, /^[a-f0-9-]{36}$/);
assert.equal(
  new Set(estado.reservas.map((r) => r.papel)).size,
  5,
  "As cinco reservas QA ainda não foram criadas.",
);
const operacoes = await readFile(arquivoOperacoes, "utf8")
  .then(JSON.parse)
  .catch(() => ({
    run: estado.run,
    resultados: [],
    relogios: [],
    ocorrencias: [],
    errosNavegador: [],
  }));
assert.equal(operacoes.run, estado.run);
const salvar = () =>
  writeFile(arquivoOperacoes, JSON.stringify(operacoes, null, 2));
const db = createClient(projeto, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function dados(resposta, acao) {
  if (resposta.error) throw new Error(`${acao}: ${resposta.error.message}`);
  return resposta.data;
}
async function passo(nome, callback) {
  if (operacoes.resultados.includes(nome)) return;
  await callback();
  operacoes.resultados.push(nome);
  await salvar();
  console.log(`PASSOU: ${nome}`);
}
const lab = dados(
  await db.from("laboratorios").select("id,nome").eq("id", estado.lab).single(),
  "Conferir laboratório QA",
);
const nomeBase = `QA Chrome ${estado.run.slice(0, 8)}`;
assert.ok(
  [nomeBase, `${nomeBase} revisado`].includes(lab.nome),
  "Laboratório fora das fixtures QA autorizadas.",
);
const pessoasIds = new Set(Object.values(estado.pessoas).map((p) => p.id));
const reservas = Object.fromEntries(
  await Promise.all(
    estado.reservas.map(async (r) => {
      const reserva = dados(
        await db
          .from("reservas")
          .select(
            "id,solicitante_id,laboratorio_id,finalidade,status,inicio,fim",
          )
          .eq("id", r.id)
          .eq("laboratorio_id", estado.lab)
          .eq("solicitante_id", estado.pessoas[r.papel].id)
          .single(),
        "Conferir reserva QA",
      );
      assert.equal(reserva.finalidade, `QA ${r.papel} ${estado.run}`);
      assert.ok(pessoasIds.has(reserva.solicitante_id));
      return [r.papel, reserva];
    }),
  ),
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const paginas = {};
const clientes = {};
try {
  for (const papel of ["monitor", "admin", "aluno", "professor"]) {
    const pessoa = estado.pessoas[papel];
    assert.ok(pessoa.email.endsWith(`-${estado.run}@example.invalid`));
    const contexto = await browser.newContext({
      baseURL,
      ignoreHTTPSErrors: baseURL.includes("127.0.0.1"),
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      viewport: { width: 1440, height: 1000 },
    });
    const page = await contexto.newPage();
    page.setDefaultTimeout(30000);
    page.on("pageerror", (erro) =>
      operacoes.errosNavegador.push({ papel, mensagem: erro.message }),
    );
    try {
      await page.goto("/login");
      await page.getByLabel("E-mail institucional").fill(pessoa.email);
      await page.getByLabel("Senha", { exact: true }).fill(pessoa.senha);
      await page
        .getByRole("button", { name: "Entrar na minha conta", exact: true })
        .click();
      await expect(page).toHaveURL(`${baseURL}/`, { timeout: 30000 });
    } catch {
      throw new Error(
        `Não foi possível abrir a sessão QA: ${papel}. Detalhes de credenciais omitidos.`,
      );
    }
    paginas[papel] = page;
    const cliente = createClient(
      projeto,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const login = await cliente.auth.signInWithPassword({
      email: pessoa.email,
      password: pessoa.senha,
    });
    assert.equal(login.error, null, `Autenticação QA pela API: ${papel}`);
    clientes[papel] = cliente;
  }
  const monitor = paginas.monitor;
  const status = async (reserva) =>
    dados(
      await db
        .from("reservas")
        .select("status")
        .eq("id", reserva.id)
        .eq("laboratorio_id", estado.lab)
        .single(),
      "Conferir estado QA",
    ).status;
  const card = (page, reserva) =>
    page.locator("article").filter({
      has: page.getByRole("heading", {
        name: reserva.finalidade,
        exact: true,
      }),
    });
  async function painel(page, aba = "pendentes") {
    await page.goto(`/monitor?lab=${estado.lab}&aba=${aba}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  async function decidir(page, reserva, botao, motivo) {
    await painel(page);
    const pedido = card(page, reserva);
    await expect(pedido).toBeVisible();
    if (motivo)
      await pedido
        .getByLabel("Motivo da decisão", { exact: true })
        .fill(motivo);
    await pedido.getByRole("button", { name: botao, exact: true }).click();
    return pedido;
  }
  await passo(
    "aluno sem acesso ao painel monitor e sem poder aprovar via RPC",
    async () => {
      await paginas.aluno.goto("/monitor");
      await expect(paginas.aluno).toHaveURL(/\/acesso-negado$/);
      const tentativa = await clientes.aluno.rpc("aprovar_reserva", {
        p_reserva_id: reservas.aluno.id,
        p_motivo: "Teste QA sem permissão",
      });
      assert.equal(tentativa.error?.code, "42501");
      assert.equal(await status(reservas.aluno), "pendente");
    },
  );
  await passo(
    "monitor impedido de decidir a própria reserva na UI e no RPC",
    async () => {
      await painel(monitor);
      const propria = card(monitor, reservas.monitor);
      await expect(
        propria.getByRole("button", { name: "Aprovar", exact: true }),
      ).toBeDisabled();
      await expect(
        propria.getByRole("button", { name: "Recusar", exact: true }),
      ).toBeDisabled();
      const tentativa = await clientes.monitor.rpc("aprovar_reserva", {
        p_reserva_id: reservas.monitor.id,
        p_motivo: "Teste QA de decisão própria",
      });
      assert.equal(tentativa.error?.message, "DECISAO_PROPRIA_PROIBIDA");
      assert.equal(await status(reservas.monitor), "pendente");
      await propria.screenshot({
        path: `${pasta}/operacao-propria-proibida.png`,
      });
    },
  );
  await passo(
    "aprovação sem motivo é recusada; motivo válido aprova pelo monitor",
    async () => {
      const professor = reservas.professor;
      const pedido = await decidir(monitor, professor, "Aprovar");
      await expect(pedido.getByRole("alert")).toContainText(
        "Informe o motivo desta decisão.",
      );
      assert.equal(await status(professor), "pendente");
      await pedido.screenshot({
        path: `${pasta}/operacao-motivo-obrigatorio.png`,
      });
      await pedido
        .getByLabel("Motivo da decisão", { exact: true })
        .fill("Atividade QA aprovada para verificação operacional.");
      await pedido
        .getByRole("button", { name: "Aprovar", exact: true })
        .click();
      await expect
        .poll(() => status(professor), { timeout: 30000 })
        .toBe("aprovada");
    },
  );
  await passo("monitor recusa solicitação com motivo preservado", async () => {
    const motivo =
      "Solicitação QA recusada para testar a comunicação ao solicitante.";
    await decidir(monitor, reservas.funcionario, "Recusar", motivo);
    await expect
      .poll(() => status(reservas.funcionario), { timeout: 30000 })
      .toBe("recusada");
    const salvo = dados(
      await db
        .from("reservas")
        .select("motivo,decidido_por")
        .eq("id", reservas.funcionario.id)
        .single(),
      "Conferir recusa QA",
    );
    assert.equal(salvo.motivo, motivo);
    assert.equal(salvo.decidido_por, estado.pessoas.monitor.id);
  });
  await passo(
    "administrador decide a solicitação do monitor com motivo",
    async () => {
      await decidir(
        paginas.admin,
        reservas.monitor,
        "Aprovar",
        "Aprovação QA pelo administrador; solicitante não decide a própria reserva.",
      );
      await expect
        .poll(() => status(reservas.monitor), { timeout: 30000 })
        .toBe("aprovada");
    },
  );
  await passo("aluno cancela a própria solicitação com motivo", async () => {
    const page = paginas.aluno;
    await page.goto(`/reservas/${reservas.aluno.id}`);
    await page
      .getByRole("button", { name: "Cancelar reserva", exact: true })
      .click();
    await page
      .getByLabel("Motivo do cancelamento", { exact: true })
      .fill("Cancelamento da fixture QA pelo próprio solicitante.");
    await page
      .getByRole("button", { name: "Confirmar cancelamento", exact: true })
      .click();
    await expect
      .poll(() => status(reservas.aluno), { timeout: 30000 })
      .toBe("cancelada");
    await page.reload();
    await expect(page.getByText("Cancelada", { exact: true })).toBeVisible();
  });
  await passo(
    "notificações reais aparecem no popover e são marcadas como lidas",
    async () => {
      const page = paginas.professor;
      await page.goto("/");
      const url = page.url();
      await page
        .getByRole("button", { name: "Notificações", exact: true })
        .click();
      const popup = page.getByRole("dialog", {
        name: "Notificações recentes",
        exact: true,
      });
      await expect(popup).toBeVisible();
      await expect(
        popup.getByText("Sua reserva foi aprovada", { exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(url);
      await popup
        .getByRole("button", { name: "Marcar como lidas", exact: true })
        .click();
      await expect
        .poll(
          async () => {
            const fila = dados(
              await db
                .from("notificacoes")
                .select("id,lida_em")
                .eq("usuario_id", estado.pessoas.professor.id)
                .eq("tipo_evento", "reserva_aprovada")
                .eq("payload->>reserva_id", reservas.professor.id),
              "Conferir leitura de aviso QA",
            );
            return fila.length > 0 && fila.every((n) => n.lida_em);
          },
          { timeout: 30000 },
        )
        .toBeTruthy();
      await page.keyboard.press("Escape");
    },
  );
  async function ajustarRelogio(reserva, minutosPassados) {
    assert.ok(estado.reservas.some((r) => r.id === reserva.id));
    const antes = dados(
      await db
        .from("reservas")
        .select("inicio,fim,status,solicitante_id,laboratorio_id")
        .eq("id", reserva.id)
        .eq("laboratorio_id", estado.lab)
        .single(),
      "Conferir fixture antes do relógio",
    );
    assert.equal(antes.status, "aprovada");
    assert.ok(pessoasIds.has(antes.solicitante_id));
    const depois = {
      inicio: new Date(Date.now() - minutosPassados * 60000).toISOString(),
      fim: new Date(Date.now() + 3590000).toISOString(),
    };
    operacoes.relogios.push({
      id: reserva.id,
      antes,
      depois,
      motivo:
        "Fixture de relógio QA para testar transição temporal real sem alterar regra global.",
    });
    await salvar();
    dados(
      await db
        .from("reservas")
        .update(depois)
        .eq("id", reserva.id)
        .eq("laboratorio_id", estado.lab)
        .eq("solicitante_id", antes.solicitante_id)
        .eq("status", "aprovada")
        .select("id")
        .single(),
      "Ajustar somente relógio da fixture QA",
    );
  }
  await passo(
    "check-in e check-out reais pelo monitor registram entrada e saída",
    async () => {
      await ajustarRelogio(reservas.professor, 1);
      await painel(monitor, "agenda");
      let pedido = card(monitor, reservas.professor);
      await pedido
        .getByRole("button", { name: "Fazer check-in", exact: true })
        .click();
      await expect
        .poll(() => status(reservas.professor), { timeout: 30000 })
        .toBe("em_uso");
      await painel(monitor, "agenda");
      pedido = card(monitor, reservas.professor);
      await pedido
        .getByRole("button", { name: "Fazer check-out", exact: true })
        .click();
      await expect
        .poll(() => status(reservas.professor), { timeout: 30000 })
        .toBe("concluida");
      const registro = dados(
        await db
          .from("checkins")
          .select("entrada,saida,monitor_id")
          .eq("reserva_id", reservas.professor.id)
          .single(),
        "Conferir check-in QA",
      );
      assert.ok(registro.entrada && registro.saida);
      assert.equal(registro.monitor_id, estado.pessoas.monitor.id);
    },
  );
  await passo(
    "ocorrência baixa com foto privada é registrada e pode ser aberta",
    async () => {
      await monitor.goto(`/ocorrencias?reserva=${reservas.professor.id}`);
      await monitor
        .getByRole("combobox", { name: "Reserva", exact: true })
        .selectOption(reservas.professor.id);
      await monitor
        .getByRole("combobox", { name: "Tipo", exact: true })
        .selectOption("falta_material");
      await monitor
        .getByRole("combobox", { name: "Gravidade", exact: true })
        .selectOption("baixa");
      const descricao = `QA foto privada ${estado.run}: material de teste ausente, sem dados pessoais.`;
      await monitor
        .getByLabel("O que aconteceu?", { exact: true })
        .fill(descricao);
      await monitor.locator('input[type="file"]').setInputFiles({
        name: "qa-pixel.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
          "base64",
        ),
      });
      const envio = monitor.waitForResponse(
        (r) =>
          r.url().endsWith("/api/ocorrencias") &&
          r.request().method() === "POST",
      );
      await monitor
        .getByRole("button", { name: "Registrar ocorrência", exact: true })
        .click();
      assert.equal((await envio).status(), 201);
      await expect(
        monitor
          .getByRole("status")
          .filter({ hasText: "Ocorrência registrada." }),
      ).toBeVisible();
      const ocorrencia = dados(
        await db
          .from("ocorrencias")
          .select("id,anexos")
          .eq("reserva_id", reservas.professor.id)
          .eq("descricao", descricao)
          .single(),
        "Conferir ocorrência QA",
      );
      assert.equal(ocorrencia.anexos.length, 1);
      operacoes.ocorrencias.push(ocorrencia);
      await salvar();
      const artigo = monitor.locator("article").filter({ hasText: descricao });
      await artigo
        .getByRole("button", { name: "Abrir 1 foto(s)", exact: true })
        .click();
      await expect(
        artigo.getByRole("img", { name: "Foto 1 da ocorrência" }),
      ).toBeVisible();
      const proibida = await paginas.aluno.request.post("/api/ocorrencias", {
        headers: { Origin: baseURL },
        data: {
          reservaId: reservas.professor.id,
          tipo: "dano",
          gravidade: "baixa",
          descricao: "QA sem permissão não deve criar ocorrência.",
          loteId: null,
        },
      });
      assert.equal(proibida.status(), 403);
      await monitor.screenshot({
        path: `${pasta}/operacao-ocorrencia-foto.png`,
        fullPage: true,
      });
    },
  );
  await passo(
    "ausência exige prazo e depois registra no-show com motivo",
    async () => {
      await decidir(
        monitor,
        reservas.admin,
        "Aprovar",
        "Aprovação QA para testar ausência após tolerância.",
      );
      await expect
        .poll(() => status(reservas.admin), { timeout: 30000 })
        .toBe("aprovada");
      const cedo = await clientes.monitor.rpc("marcar_no_show", {
        p_reserva_id: reservas.admin.id,
        p_motivo: "Tentativa QA antes da tolerância",
      });
      assert.equal(cedo.error?.message, "NOSHOW_NAO_PERMITIDO");
      await ajustarRelogio(reservas.admin, 180);
      await painel(monitor, "agenda");
      const pedido = card(monitor, reservas.admin);
      await pedido
        .getByLabel("Observações / motivo", { exact: true })
        .fill("Ausência registrada pela fixture QA após prazo de tolerância.");
      await pedido
        .getByRole("button", { name: "Registrar ausência", exact: true })
        .click();
      await expect
        .poll(() => status(reservas.admin), { timeout: 30000 })
        .toBe("no_show");
    },
  );
  await passo(
    "envio e modal a 320px; erro vermelho do monitor preserva estado",
    async () => {
      const finalidade = `QA feedback monitor ${estado.run} - foco`;
      operacoes.reservasExtras ??= [];
      let extra = operacoes.reservasExtras.find(
        (r) => r.finalidade === finalidade,
      );
      if (!extra) {
        const origem = reservas.monitor;
        const inicio = new Date(
          new Date(origem.inicio).getTime() + 3 * 3600000,
        );
        const fim = new Date(new Date(origem.fim).getTime() + 3 * 3600000);
        const aluno = paginas.aluno;
        await aluno.setViewportSize({ width: 320, height: 800 });
        await aluno.goto(`/reservas/nova?lab=${estado.lab}`);
        await aluno
          .getByRole("combobox", { name: "Laboratório", exact: true })
          .selectOption(estado.lab);
        await aluno
          .getByLabel("Data", { exact: true })
          .fill(formatInTimeZone(inicio, "America/Sao_Paulo", "yyyy-MM-dd"));
        await aluno
          .getByLabel("Horário de início", { exact: true })
          .fill(formatInTimeZone(inicio, "America/Sao_Paulo", "HH:mm"));
        await aluno
          .getByLabel("Horário de término", { exact: true })
          .fill(formatInTimeZone(fim, "America/Sao_Paulo", "HH:mm"));
        await aluno
          .getByLabel("Finalidade da reserva", { exact: true })
          .fill(finalidade);
        await aluno
          .getByLabel("Número de participantes", { exact: true })
          .fill("1");
        await aluno
          .getByRole("button", { name: "Enviar solicitação", exact: true })
          .click();
        const modal = aluno.getByRole("dialog", {
          name: "Sua solicitação foi enviada",
          exact: true,
        });
        await expect(modal).toBeVisible({ timeout: 30000 });
        const resposta = dados(
          await db
            .from("reservas")
            .select("id,status")
            .eq("laboratorio_id", estado.lab)
            .eq("solicitante_id", estado.pessoas.aluno.id)
            .eq("finalidade", finalidade)
            .single(),
          "Conferir única solicitação QA adicional criada pela UI mobile",
        );
        assert.equal(resposta.status, "pendente");
        extra = {
          id: resposta.id,
          finalidade,
          solicitanteId: estado.pessoas.aluno.id,
          laboratorioId: estado.lab,
          criadaPelaInterface: true,
        };
        operacoes.reservasExtras.push(extra);
        await salvar();
        const caixa = await modal.boundingBox();
        assert.ok(
          caixa &&
            caixa.x >= 0 &&
            caixa.y >= 0 &&
            caixa.x + caixa.width <= 321 &&
            caixa.y + caixa.height <= 801,
          "Confirmação precisa caber inteira no viewport de 320px.",
        );
        assert.ok(
          Math.abs(caixa.x + caixa.width / 2 - 160) <= 2 &&
            Math.abs(caixa.y + caixa.height / 2 - 400) <= 2,
          "Confirmação precisa estar centralizada na tela.",
        );
        assert.ok(
          await aluno.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          "Envio mobile sem transbordamento horizontal.",
        );
        const inicioBotao = modal.getByRole("button", {
          name: "Voltar ao início",
          exact: true,
        });
        const novoBotao = modal.getByRole("button", {
          name: "Novo agendamento",
          exact: true,
        });
        await expect(inicioBotao).toBeFocused();
        await aluno.keyboard.press("Tab");
        await expect(novoBotao).toBeFocused();
        await aluno.keyboard.press("Shift+Tab");
        await expect(inicioBotao).toBeFocused();
        const caixaInicio = await inicioBotao.boundingBox();
        const caixaNovo = await novoBotao.boundingBox();
        assert.ok(
          caixaInicio &&
            caixaNovo &&
            caixaInicio.y + caixaInicio.height <= caixaNovo.y + 1,
          "Os dois botões precisam ficar empilhados na tela estreita.",
        );
        await aluno.screenshot({
          path: `${pasta}/operacao-modal-mobile320.png`,
        });
        await novoBotao.click();
        await expect(modal).not.toBeVisible();
        await expect(
          aluno.getByLabel("Finalidade da reserva", { exact: true }),
        ).toHaveValue("");
        await expect(
          aluno.getByLabel("Número de participantes", { exact: true }),
        ).toHaveValue("1");
        await expect(
          aluno.getByRole("combobox", { name: "Laboratório", exact: true }),
        ).toBeFocused();
        extra.modalMobile = {
          largura: 320,
          altura: 800,
          caixa,
          botoesEmpilhados: true,
          focoPorTeclado: true,
          novoAgendamentoLimpo: true,
        };
        await salvar();
      }
      assert.ok(
        extra.modalMobile?.novoAgendamentoLimpo,
        "A confirmação mobile desta única fixture precisa ter evidência completa antes de concluir o caso.",
      );
      const pedido = await decidir(monitor, extra, "Aprovar");
      await expect(pedido.getByRole("alert")).toContainText(
        "Informe o motivo desta decisão.",
      );
      const motivo = pedido.getByLabel("Motivo da decisão", { exact: true });
      await expect(motivo).toBeFocused();
      await expect(motivo).toHaveAttribute("aria-invalid", "true");
      await expect(motivo).toHaveCSS("border-color", "rgb(179, 48, 48)");
      assert.equal(await status(extra), "pendente");
      await pedido.screenshot({
        path: `${pasta}/operacao-motivo-corrigido.png`,
      });
    },
  );
  assert.deepEqual(
    operacoes.errosNavegador,
    [],
    "Exceções JavaScript nas operações QA",
  );
  operacoes.concluidoEm = new Date().toISOString();
  delete operacoes.falha;
  await salvar();
  console.log(
    `Operações QA concluídas: ${operacoes.resultados.length} verificações; credenciais e dados reais não foram exibidos.`,
  );
} catch (erro) {
  operacoes.falha = { mensagem: erro.message, em: new Date().toISOString() };
  await salvar();
  throw erro;
} finally {
  for (const cliente of Object.values(clientes))
    await cliente.auth.signOut({ scope: "local" });
  await browser.close();
}
