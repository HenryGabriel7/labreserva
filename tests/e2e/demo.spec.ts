import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("cabeçalho abre notificações e opções da conta sem trocar de página", async ({
  page,
}) => {
  await page.goto("/");
  const cabecalho = page.getByRole("banner");
  await expect(cabecalho.getByRole("textbox")).toHaveCount(0);
  await expect(cabecalho.getByRole("searchbox")).toHaveCount(0);
  await expect(cabecalho.locator("svg.lucide-search")).toHaveCount(0);
  await expect(page.getByText("Campus principal", { exact: true })).toHaveCount(
    0,
  );
  const sino = cabecalho.getByRole("button", {
    name: "Notificações",
    exact: true,
  });
  await expect(sino).toHaveAttribute("aria-expanded", "false");
  await sino.click();
  const painel = page.getByRole("dialog", { name: "Notificações recentes" });
  await expect(sino).toHaveAttribute("aria-expanded", "true");
  await expect(painel).toBeVisible();
  await expect(painel.getByText("Sua reserva foi aprovada")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(painel.locator('a[href="/notificacoes"]')).toHaveCount(0);
  await expect(
    painel.getByRole("button", { name: "Fechar notificações" }),
  ).toBeFocused();
  await expect(
    painel.getByRole("button", { name: "Marcar como lidas" }),
  ).toBeDisabled();
  await test.info().attach("painel-de-notificacoes", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await expect(painel.getByRole("listitem")).toHaveCount(5);
  const maisAntigas = painel.getByRole("button", { name: "Mais antigas" });
  const maisRecentes = painel.getByRole("button", { name: "Mais recentes" });
  await expect(maisRecentes).toBeDisabled();
  await maisAntigas.click();
  await expect(painel.getByRole("listitem")).toHaveCount(1);
  await expect(maisAntigas).toBeDisabled();
  await expect(painel.getByRole("list")).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  await maisRecentes.click();
  await expect(painel.getByRole("listitem")).toHaveCount(5);
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press("Escape");
  await expect(painel).toHaveCount(0);
  await expect(sino).toBeFocused();
  await expect(sino).toHaveAttribute("aria-expanded", "false");

  const perfil = cabecalho.getByRole("button", { name: /Menu de perfil/ });
  await perfil.click();
  const menu = page.getByRole("menu", { name: "Opções da conta" });
  await expect(
    menu.getByRole("menuitem", { name: "Meu perfil", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Preferências", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitem", { name: "Entrar na instituição" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(perfil).toBeFocused();
  await perfil.click();
  await page
    .getByRole("heading", { level: 1 })
    .click({ position: { x: 1, y: 1 } });
  await expect(menu).toHaveCount(0);
  await perfil.click();
  await menu.getByRole("menuitem", { name: "Segurança", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil#seguranca$/);
  await expect(page.locator("#seguranca")).toBeInViewport();
});

for (const largura of [320, 360, 390]) {
  test(`menus compactos e navegação por teclado em ${largura}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto("/");
    const sino = page.getByRole("button", {
      name: "Notificações",
      exact: true,
    });
    await sino.click();
    const painel = page.getByRole("dialog", { name: "Notificações recentes" });
    const limites = await painel.boundingBox();
    expect(limites?.x).toBeGreaterThanOrEqual(0);
    expect((limites?.x ?? 0) + (limites?.width ?? 0)).toBeLessThanOrEqual(
      largura,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(largura + 1);
    await page.keyboard.press("Escape");

    const abrir = page.getByRole("button", { name: "Abrir menu", exact: true });
    await abrir.click();
    const lateral = page.getByRole("dialog", {
      name: "Menu principal",
      exact: true,
    });
    const fechar = lateral.getByRole("button", {
      name: "Fechar menu principal",
    });
    await expect(lateral).toBeVisible();
    await expect(fechar).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      lateral.getByRole("link", { name: "Privacidade e segurança" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(fechar).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(lateral).toHaveCount(0);
    await expect(abrir).toBeFocused();
    await expect(
      page.getByRole("navigation", { name: "Navegação rápida" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(largura + 1);
  });
}

const rotas = [
  "/",
  "/laboratorios",
  "/laboratorios/00000000-0000-4000-8000-000000000001",
  "/calendario",
  "/reservas",
  "/reservas/nova",
  "/monitor",
  "/perfil",
  "/notificacoes",
  "/bloqueios",
  "/ocorrencias",
  "/relatorios/privacidade",
  "/admin",
  "/admin/laboratorios",
  "/admin/usuarios",
  "/admin/configuracoes",
  "/admin/auditoria",
  "/admin/relatorios",
  "/admin/privacidade",
  "/admin/bloqueios",
  "/admin/solicitacoes",
  "/admin/ocorrencias",
  "/ajuda",
  "/privacidade",
  "/login",
];

test("navegação institucional, formulário e operações da demonstração somente leitura", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(/Ambiente de demonstração/)).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await test.info().attach("painel-demonstracao", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.goto("/laboratorios");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Laboratório de/ }).first(),
  ).toBeVisible();
  const laboratorio = "00000000-0000-4000-8000-000000000001";
  await page.goto(`/reservas/nova?lab=${laboratorio}`);
  const escopo = page.getByLabel("O que você precisa?");
  await expect(escopo).toHaveValue("laboratorio");
  await escopo.selectOption("equipamentos");
  await page.getByRole("button", { name: "Adicionar equipamento" }).click();
  await expect(
    page.getByRole("combobox", { name: "Equipamento", exact: true }),
  ).toHaveValue("00000000-0000-4000-8000-000000000101");
  const quantidade = page.getByRole("spinbutton", {
    name: "Quantidade",
    exact: true,
  });
  await quantidade.fill("2");
  await escopo.selectOption("laboratorio");
  await expect(quantidade).toHaveCount(0);
  const data = await page.getByLabel("Data", { exact: true }).inputValue();
  const fim = new Date(`${data}T12:00:00Z`);
  fim.setUTCDate(fim.getUTCDate() + 7);
  await page.getByRole("checkbox", { name: /Repetir semanalmente/ }).check();
  await page.getByLabel("Repetir até").fill(fim.toISOString().slice(0, 10));
  await expect(page.getByText(/2 encontro\(s\) previsto\(s\)/)).toBeVisible();
  await page
    .getByLabel("Finalidade da reserva")
    .fill("Exploração do formulário de reserva em modo de demonstração.");
  await expect(
    page.getByRole("button", { name: "Enviar solicitação" }),
  ).toBeDisabled();
  await page.goto("/admin/usuarios");
  await expect(
    page.getByRole("button", { name: "Adicionar usuário" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Importar CSV" }),
  ).toBeDisabled();
  await page.goto("/perfil");
  await expect(
    page.getByRole("button", { name: "Salvar preferências" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Sair de todos os dispositivos" }),
  ).toBeDisabled();
});

test("troca entre o portal e a administração pelo cabeçalho", async ({
  page,
}) => {
  await page.goto("/");
  const cabecalho = page.getByRole("banner");
  const main = page.getByRole("main");
  const admin = cabecalho.getByRole("link", {
    name: "Espaço administrativo",
    exact: true,
  });
  const usuario = cabecalho.getByRole("link", {
    name: "Espaço de usuário",
    exact: true,
  });
  await expect(main.getByRole("link", { name: "Nova reserva" })).toBeVisible();
  await expect(main.locator('a[href^="/monitor"]')).toHaveCount(0);
  await expect(main.locator('a[href^="/ocorrencias"]')).toHaveCount(0);
  await expect(admin).toBeInViewport();
  await expect(usuario).toHaveCount(0);
  await admin.click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    main.getByRole("heading", { name: "Espaço administrativo", level: 1 }),
  ).toBeVisible();
  await expect(
    main.getByRole("list", { name: "Módulos administrativos" }),
  ).toBeVisible();
  await expect(main.getByRole("link", { name: "Nova reserva" })).toHaveCount(0);
  await expect(usuario).toBeInViewport();
  const largura = page.viewportSize()?.width ?? 1440;
  const limiteBotao = await usuario.boundingBox();
  expect(limiteBotao?.x).toBeGreaterThanOrEqual(0);
  expect((limiteBotao?.x ?? 0) + (limiteBotao?.width ?? 0)).toBeLessThanOrEqual(
    largura,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(largura + 1);
  await expect(admin).toHaveCount(0);
  await expect(page.getByText(/Ambiente de demonstração/)).toBeVisible();
  await test.info().attach("espaco-administrativo", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await cabecalho
    .getByRole("button", { name: "Notificações", exact: true })
    .click();
  const notificacoes = page.getByRole("dialog", {
    name: "Notificações recentes",
  });
  await expect(notificacoes).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  await notificacoes
    .getByRole("button", { name: "Fechar notificações" })
    .click();
  await expect(notificacoes).toHaveCount(0);

  if (largura <= 800) {
    await cabecalho.getByRole("button", { name: "Abrir menu" }).click();
  }
  const menu = page.getByLabel("Menu principal", { exact: true });
  await expect(menu.locator('a[href="/admin/usuarios"]')).toBeVisible();
  await expect(menu.locator('a[href="/reservas/nova"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await usuario.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(admin).toBeInViewport();
  await expect(menu.locator('a[href="/admin/usuarios"]')).toHaveCount(0);
});

test("endereços administrativos antigos redirecionam e preservam filtros", async ({
  page,
}) => {
  await page.goto("/laboratorios/gerenciar");
  await expect(page).toHaveURL(/\/admin\/laboratorios$/);
  await page.goto("/relatorios?inicio=2026-10-01&fim=2026-10-31");
  await expect(page).toHaveURL(/\/admin\/relatorios\?/);
  const filtros = new URL(page.url()).searchParams;
  expect(filtros.get("inicio")).toBe("2026-10-01");
  expect(filtros.get("fim")).toBe("2026-10-31");
});

test("agendamento avisa quando o laboratório do link está indisponível", async ({
  page,
}) => {
  const indisponivel = "00000000-0000-4000-8000-000000009999";
  await page.goto(`/reservas/nova?lab=${indisponivel}&inicio=14:00&fim=15:00`);
  await expect(page.getByRole("status")).toContainText(
    "O laboratório selecionado não está disponível.",
  );
  const laboratorio = page.getByRole("combobox", {
    name: "Laboratório",
    exact: true,
  });
  await expect(laboratorio).toHaveValue("00000000-0000-4000-8000-000000000001");
  await expect(
    laboratorio.locator(`option[value="${indisponivel}"]`),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Horário de início", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Horário de término", { exact: true }),
  ).toHaveValue("");
});

test("filtros do catálogo e navegação de calendário funcionam", async ({
  page,
}) => {
  await page.goto("/laboratorios");
  const pesquisa = page.getByRole("searchbox", { name: "Nome ou descrição" });
  const formulario = page.getByRole("search", { name: "Buscar laboratórios" });
  await expect(formulario.locator("svg.lucide-search")).toHaveCount(1);
  await expect(formulario.locator("svg.lucide-search")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(
    page.getByRole("banner").locator("svg.lucide-search"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual((page.viewportSize()?.width ?? 1440) + 1);
  await test.info().attach("busca-do-catalogo", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await pesquisa.fill("Química");
  await pesquisa.press("Enter");
  await expect(page.locator(".catalog-grid article")).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Química");
  await page.getByRole("link", { name: "Limpar filtros" }).click();
  await expect(page.locator(".catalog-grid article")).toHaveCount(4);
  await expect(pesquisa).toHaveValue("");
  await page.getByLabel("Tipo de laboratório").selectOption("quimica");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page).toHaveURL(/tipo=quimica/);
  await expect(page.locator(".catalog-grid article")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Laboratório de Química", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Limpar filtros" }).click();
  await expect(page.locator(".catalog-grid article")).toHaveCount(4);

  if ((page.viewportSize()?.width ?? 1440) <= 800) {
    await page
      .getByRole("navigation", { name: "Navegação rápida" })
      .getByRole("link", { name: "Calendário", exact: true })
      .click();
  } else {
    await page
      .getByRole("complementary", { name: "Menu principal" })
      .getByRole("link", { name: "Calendário", exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/calendario/);
  await page.getByRole("link", { name: "Semana", exact: true }).click();
  await expect(page).toHaveURL(/visao=semana/);
  await expect(page.locator(".calendar-table thead th")).toHaveCount(8);
  await page.getByRole("link", { name: "Mês", exact: true }).click();
  await expect(page).toHaveURL(/visao=mes/);
  await expect(page.locator(".month-day")).toHaveCount(42);
});

for (const rota of rotas) {
  test(`acessibilidade WCAG A/AA e largura do viewport: ${rota}`, async ({
    page,
  }) => {
    const resposta = await page.goto(rota);
    expect(resposta?.status(), `Resposta HTTP de ${rota}`).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).not.toHaveText(/não foi possível carregar|página não encontrada|404/i);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      `Overflow horizontal em ${rota}`,
    ).toBe(true);
    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    if (resultado.violations.length)
      await test.info().attach("violacoes-axe", {
        body: JSON.stringify(resultado.violations, null, 2),
        contentType: "application/json",
      });
    expect(
      resultado.violations.map((violacao) => ({
        id: violacao.id,
        descricao: violacao.description,
        elementos: violacao.nodes.map((no) => ({
          alvo: no.target,
          detalhe: no.failureSummary,
        })),
      })),
      `Acessibilidade em ${rota}`,
    ).toEqual([]);
  });
}

test("login valida entrada sem liberar acesso e não oferece cadastro público", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("E-mail institucional")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
  await expect(page.getByText("Informe sua senha.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /cadastrar|criar conta/i }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(
    page.getByRole("button", { name: "Enviar instruções" }),
  ).toBeVisible();
});
