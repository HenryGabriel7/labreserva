/** QA manual autorizado, isolado por UUID; nunca executado pelo CI.
 * Requer LABRESERVA_QA_AUTORIZADO=1 e credenciais de serviço no ambiente.
 * Senhas aleatórias ficam somente em test-results/qa-remoto/contas.json (ignorado).
 * `preparar`, `testar`, `encerrar`. Encerrar desativa fixtures, preservando auditoria.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { formatInTimeZone } from "date-fns-tz";

const projeto = "https://hvcetcfairwfuyxlyynl.supabase.co";
assert.equal(
  process.env.LABRESERVA_QA_AUTORIZADO,
  "1",
  "QA remoto requer autorização explícita.",
);
assert.equal(
  process.env.SUPABASE_URL,
  projeto,
  "Projeto fora do escopo desta verificação.",
);
const baseURL = process.env.QA_APP_URL || "https://127.0.0.1:3100";
assert.ok(
  ["https://127.0.0.1:3100", "https://labreserva.vercel.app"].includes(baseURL),
);
const pasta = "test-results/qa-remoto";
await mkdir(pasta, { recursive: true });
const arquivo = `${pasta}/contas.json`;
const db = createClient(projeto, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function dados(r, acao) {
  if (r.error) throw new Error(`${acao}: ${r.error.message}`);
  return r.data;
}
let estado;
try {
  estado = JSON.parse(await readFile(arquivo, "utf8"));
} catch {
  estado = { run: randomUUID(), pessoas: {}, reservas: [], resultados: [] };
}
assert.match(estado.run, /^[a-f0-9-]{36}$/);
const salvar = () => writeFile(arquivo, JSON.stringify(estado, null, 2));
const nomeLab = estado.nomeLab || `QA Chrome ${estado.run.slice(0, 8)}`;
const passo = (texto) => {
  estado.resultados.push(texto);
  console.log(`PASSOU: ${texto}`);
};
const comando = process.argv[2];

if (comando === "preparar") {
  assert.ok(!estado.encerrado, "Fixtures já encerradas.");
  for (const papel of [
    "admin",
    "aluno",
    "professor",
    "funcionario",
    "monitor",
  ]) {
    if (estado.pessoas[papel]) continue;
    const email = `qa-${papel}-${estado.run}@example.invalid`;
    const senha = `Qa!7${randomBytes(24).toString("base64url")}`;
    const auth = dados(
      await db.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      }),
      "Criar identidade QA",
    );
    const pessoa = {
      id: auth.user.id,
      email,
      senha,
      nome: `QA ${papel} ${estado.run.slice(0, 8)}`,
    };
    estado.pessoas[papel] = pessoa;
    await salvar();
    dados(
      await db
        .from("profiles")
        .insert({ id: pessoa.id, nome: pessoa.nome, email, ativo: true }),
      "Criar perfil QA",
    );
    dados(
      await db.from("user_roles").insert({ user_id: pessoa.id, papel }),
      "Vincular papel QA",
    );
  }
  passo("cinco contas genéricas, cada uma com um papel e senha aleatória");
  await salvar();
} else if (comando === "encerrar") {
  const ids = Object.values(estado.pessoas).map((p) => p.id);
  assert.equal(ids.length, 5);
  const laboratorios = [
    ...(estado.labsAnteriores || []),
    ...(estado.lab ? [{ id: estado.lab, nome: nomeLab }] : []),
  ];
  const clienteAdmin = createClient(
    projeto,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  dados(
    await clienteAdmin.auth.signInWithPassword({
      email: estado.pessoas.admin.email,
      password: estado.pessoas.admin.senha,
    }),
    "Entrar para encerrar reservas QA",
  );
  for (const laboratorio of laboratorios) {
    assert.ok(
      laboratorio.nome.startsWith(`QA Chrome ${estado.run.slice(0, 8)}`),
    );
    const cadastro = dados(
      await db
        .from("laboratorios")
        .select("nome")
        .eq("id", laboratorio.id)
        .single(),
      "Conferir identidade do laboratório QA",
    );
    assert.equal(cadastro.nome, laboratorio.nome);
    const abertas = dados(
      await db
        .from("reservas")
        .select("id,solicitante_id")
        .eq("laboratorio_id", laboratorio.id)
        .in("status", ["pendente", "aprovada"]),
      "Listar solicitações QA abertas",
    );
    for (const reserva of abertas) {
      assert.ok(
        ids.includes(reserva.solicitante_id),
        "Reserva de pessoa real não pode ser encerrada pelo roteiro QA.",
      );
      dados(
        await clienteAdmin.rpc("cancelar_reserva", {
          p_reserva_id: reserva.id,
          p_motivo: "Encerramento das fixtures de teste Chrome autorizadas.",
        }),
        "Cancelar reserva QA aberta",
      );
    }
    dados(
      await db
        .from("laboratorios")
        .update({ ativo: false })
        .eq("id", laboratorio.id)
        .eq("nome", laboratorio.nome),
      "Desativar laboratório QA",
    );
  }
  await clienteAdmin.auth.signOut({ scope: "global" });
  for (const p of [
    ...Object.values(estado.pessoas),
    ...(estado.convidado ? [estado.convidado] : []),
  ]) {
    assert.ok(p.email.endsWith(`-${estado.run}@example.invalid`));
    dados(
      await db
        .from("profiles")
        .update({ ativo: false })
        .eq("id", p.id)
        .eq("email", p.email),
      "Desativar conta QA",
    );
    dados(
      await db
        .from("notificacoes")
        .update({
          envio_dispensado: true,
          status: "falhou",
          erro: "Fixture de teste encerrada; não enviar e-mail.",
          proxima_tentativa_em: null,
        })
        .eq("usuario_id", p.id),
      "Dispensar e-mails QA",
    );
  }
  estado.encerrado = true;
  passo("contas e laboratório de QA desativados; histórico preservado");
  await salvar();
} else if (comando === "testar" || comando === "mobile") {
  assert.ok(!estado.encerrado);
  assert.equal(Object.keys(estado.pessoas).length, 5);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const paginas = {};
  const erros = [];
  try {
    for (const [papel, pessoa] of Object.entries(estado.pessoas)) {
      const contexto = await browser.newContext({
        baseURL,
        ignoreHTTPSErrors: baseURL.includes("127.0.0.1"),
        locale: "pt-BR",
        timezoneId: "America/Sao_Paulo",
        viewport: { width: 1440, height: 1000 },
      });
      const page = await contexto.newPage();
      page.on("pageerror", (e) => erros.push({ papel, mensagem: e.message }));
      await page.goto("/login");
      await page.getByLabel("E-mail institucional").fill(pessoa.email);
      await page.getByLabel("Senha", { exact: true }).fill(pessoa.senha);
      await page.getByRole("button", { name: "Entrar na minha conta" }).click();
      await expect(page).toHaveURL(`${baseURL}/`, { timeout: 30000 });
      paginas[papel] = page;
      await expect(page.getByRole("banner").getByRole("textbox")).toHaveCount(
        0,
      );
      await page
        .getByRole("button", { name: "Notificações", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Notificações recentes" }),
      ).toBeVisible();
      await expect(page).toHaveURL(`${baseURL}/`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /Menu de perfil/ }).click();
      const menu = page.getByRole("menu", { name: "Opções da conta" });
      await expect(
        menu.getByRole("menuitem", { name: "Segurança", exact: true }),
      ).toBeVisible();
      await expect(
        menu.getByRole("menuitem", {
          name: "Configurações do sistema",
          exact: true,
        }),
      ).toHaveCount(papel === "admin" ? 1 : 0);
      await page.keyboard.press("Escape");
      const api = await page.request.get("/api/usuarios");
      expect(api.status()).toBe(papel === "admin" ? 200 : 403);
      for (const rota of [
        "/laboratorios",
        "/reservas",
        "/calendario",
        "/perfil",
        "/ajuda",
      ]) {
        const respostaPagina = await page.goto(rota);
        expect(respostaPagina.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(
          page.getByText("Application error", { exact: false }),
        ).toHaveCount(0);
      }
      passo(`login, navegação, menus e controle de acesso: ${papel}`);
    }
    if (comando === "testar") {
      const admin = paginas.admin;
      await admin.goto("/usuarios");
      await admin
        .getByRole("button", { name: "Adicionar usuário", exact: true })
        .click();
      const papelSelect = admin.getByRole("combobox", {
        name: /Papel de acesso/,
      });
      await expect(papelSelect).not.toHaveAttribute("multiple");
      await papelSelect.selectOption("professor");
      await papelSelect.selectOption("monitor");
      await expect(papelSelect).toHaveValue("monitor");
      const indevido = await admin.request.post("/api/usuarios", {
        headers: { Origin: baseURL },
        data: {
          nome: "QA múltiplo",
          email: `qa-recusado-${estado.run}@example.invalid`,
          papeis: ["aluno", "admin"],
        },
      });
      expect(indevido.status()).toBe(400);
      const csv = await admin.request.post("/api/usuarios", {
        headers: { Origin: baseURL },
        data: {
          csv: `nome,email,matricula,papeis\nQA recusado,qa-recusado-${estado.run}@example.invalid,,aluno|monitor`,
        },
      });
      expect(csv.status()).toBe(400);
      passo(
        "seleção única de papel e rejeição de múltiplos papéis na API e no CSV",
      );
      if (!estado.convidado) {
        const email = `qa-convite-${estado.run}@example.invalid`;
        await admin
          .getByLabel("Nome completo", { exact: true })
          .fill(`QA convite ${estado.run.slice(0, 8)}`);
        await admin
          .getByLabel("E-mail institucional", { exact: true })
          .fill(email);
        await admin
          .getByRole("button", { name: "Criar e enviar convite", exact: true })
          .click();
        await expect(
          admin.getByText(
            "Usuário criado. O convite foi adicionado à fila de envio.",
            { exact: true },
          ),
        ).toBeVisible({ timeout: 30000 });
        estado.convidado = dados(
          await db
            .from("profiles")
            .select("id,email")
            .eq("email", email)
            .single(),
          "Conferir convite QA",
        );
        await salvar();
        passo(
          "criação de usuário pela interface com um papel e convite na fila",
        );
      }

      await admin.goto("/laboratorios/gerenciar");
      if (!estado.lab) {
        await admin
          .getByLabel("Nome do laboratório", { exact: true })
          .fill(nomeLab);
        await admin
          .getByLabel("Localização", { exact: true })
          .fill("Ambiente isolado de teste Chrome");
        await admin
          .getByRole("button", { name: "Adicionar equipamento", exact: true })
          .click();
        await admin
          .getByLabel("Nome do equipamento", { exact: true })
          .fill("Computador QA");
        await admin
          .getByRole("button", { name: "Salvar laboratório", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              dados(
                await db.from("laboratorios").select("id").eq("nome", nomeLab),
                "Consultar laboratório QA",
              ).length,
          )
          .toBe(1);
        estado.lab = dados(
          await db
            .from("laboratorios")
            .select("id")
            .eq("nome", nomeLab)
            .single(),
          "Obter ID laboratório QA",
        ).id;
        await salvar();
      }
      const linhaLab = admin
        .locator(".crud-list-item")
        .filter({ hasText: nomeLab });
      await linhaLab
        .getByRole("button", { name: "Editar cadastro", exact: true })
        .click();
      await expect(
        admin.getByLabel("Nome do laboratório", { exact: true }),
      ).toHaveValue(nomeLab);
      await expect(
        admin.getByLabel("Nome do equipamento", { exact: true }),
      ).toHaveValue("Computador QA");
      const janelas = dados(
        await db
          .from("janelas_horario")
          .select("id")
          .eq("laboratorio_id", estado.lab),
        "Conferir horários QA",
      );
      expect(janelas.length).toBe(5);
      await admin
        .getByRole("button", { name: "Salvar laboratório", exact: true })
        .click();
      passo(
        "criação e edição atômica do laboratório com cinco dias e equipamento",
      );
      await admin.goto("/usuarios");
      const linhaMonitor = admin
        .getByRole("row")
        .filter({ hasText: estado.pessoas.monitor.email });
      await linhaMonitor
        .getByRole("button", {
          name: `Editar ${estado.pessoas.monitor.nome}`,
          exact: true,
        })
        .click();
      await admin.getByRole("checkbox", { name: nomeLab, exact: true }).check();
      await admin
        .getByRole("button", { name: "Salvar alterações", exact: true })
        .click();
      await expect(
        admin.getByText("Permissões e vínculos atualizados.", { exact: true }),
      ).toBeVisible();
      passo("monitor vinculado ao laboratório pela interface administrativa");

      let data = new Date(Date.now() + 3 * 86400000);
      while (
        [0, 6].includes(
          Number(formatInTimeZone(data, "America/Sao_Paulo", "i")) % 7,
        )
      )
        data = new Date(data.valueOf() + 86400000);
      const dia = formatInTimeZone(data, "America/Sao_Paulo", "yyyy-MM-dd");
      for (const [indice, papel] of [
        "aluno",
        "professor",
        "funcionario",
        "monitor",
        "admin",
      ].entries()) {
        const page = paginas[papel];
        await page.goto(`/reservas/nova?lab=${estado.lab}`);
        await page
          .getByRole("combobox", { name: "Laboratório", exact: true })
          .selectOption(estado.lab);
        await page.getByLabel("Data", { exact: true }).fill(dia);
        await page
          .getByLabel("Horário de início", { exact: true })
          .fill("14:00");
        await page
          .getByLabel("Horário de término", { exact: true })
          .fill("14:30");
        await page
          .getByLabel("Finalidade da reserva")
          .fill(`QA ${papel} ${estado.run}`);
        await page.getByLabel("Número de participantes").fill("3");
        await page
          .getByRole("button", { name: "Enviar solicitação", exact: true })
          .click();
        await expect(
          page.getByLabel("Horário de término", { exact: true }),
        ).toHaveAttribute("aria-invalid", "true");
        await expect(
          page.getByLabel("Horário de término", { exact: true }),
        ).toBeFocused();
        const cor = await page
          .locator("#erro-fim")
          .evaluate((el) => getComputedStyle(el).color);
        const [vermelho, verde, azul] = cor.match(/\d+/g).map(Number);
        assert.ok(
          vermelho > verde + 20 && vermelho > azul + 20,
          "Mensagem de erro precisa ser vermelha",
        );
        await page
          .getByLabel("Horário de início", { exact: true })
          .fill("14:15");
        await page
          .getByLabel("Horário de término", { exact: true })
          .fill("15:15");
        await page
          .getByRole("button", { name: "Enviar solicitação", exact: true })
          .click();
        await expect(page.locator('[aria-invalid="true"]')).not.toHaveCount(0);
        await page
          .getByLabel("Horário de início", { exact: true })
          .fill(`${8 + indice}:00`.padStart(5, "0"));
        await page
          .getByLabel("Horário de término", { exact: true })
          .fill(`${9 + indice}:00`.padStart(5, "0"));
        await page
          .getByRole("button", { name: "Enviar solicitação", exact: true })
          .click();
        const modal = page.getByRole("dialog", {
          name: "Sua solicitação foi enviada",
          exact: true,
        });
        await expect(modal).toBeVisible({ timeout: 30000 });
        const r = dados(
          await db
            .from("reservas")
            .select("id")
            .eq("laboratorio_id", estado.lab)
            .eq("solicitante_id", estado.pessoas[papel].id)
            .eq("finalidade", `QA ${papel} ${estado.run}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .single(),
          "Conferir solicitação QA",
        );
        estado.reservas.push({ id: r.id, papel });
        await salvar();
        if (papel === "aluno") {
          await modal
            .getByRole("button", { name: "Novo agendamento", exact: true })
            .click();
          await expect(modal).not.toBeVisible();
          await expect(page.getByLabel("Finalidade da reserva")).toHaveValue(
            "",
          );
        } else {
          await modal
            .getByRole("button", { name: "Voltar ao início", exact: true })
            .click();
          await expect(page).toHaveURL(`${baseURL}/`);
        }
        passo(`validações e solicitação real com confirmação: ${papel}`);
      }
    }
    for (const [papel, page] of Object.entries(paginas)) {
      for (const largura of [320, 360, 390, 768]) {
        await page.setViewportSize({ width: largura, height: 800 });
        for (const rota of [
          "/",
          "/laboratorios",
          "/reservas/nova",
          "/reservas",
          "/calendario",
          "/perfil",
          ...(papel === "admin"
            ? ["/usuarios", "/laboratorios/gerenciar", "/configuracoes"]
            : []),
          ...(papel === "monitor" ? ["/monitor"] : []),
        ]) {
          const respostaPagina = await page.goto(rota);
          expect(respostaPagina.status()).toBe(200);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            `Overflow ${papel} ${rota} ${largura}`,
          );
        }
      }
      await page.screenshot({
        path: `${pasta}/${papel}-mobile.png`,
        fullPage: true,
      });
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
        `Acessibilidade ${papel}`,
      );
      passo(`mobile 320/360/390/768 e acessibilidade: ${papel}`);
    }
    assert.deepEqual(erros, [], "Erros de execução no navegador");
    passo("nenhuma exceção JavaScript nos fluxos verificados");
    await salvar();
  } finally {
    await browser.close();
  }
} else throw new Error("Use preparar, testar, mobile ou encerrar.");
