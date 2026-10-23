import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("cabeçalho abre notificações e opções da conta sem trocar de página", async ({
  page,
}) => {
  await page.goto("/");
  const cabecalho = page.getByRole("banner");
  await expect(cabecalho.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText("Campus principal", { exact: true })).toHaveCount(
    0,
  );
  const sino = cabecalho.getByRole("button", {
    name: "Notificações",
    exact: true,
  });
  await sino.click();
  const painel = page.getByRole("dialog", { name: "Notificações recentes" });
  await expect(painel).toBeVisible();
  await expect(painel.getByText("Sua reserva foi aprovada")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    painel.getByRole("button", { name: "Fechar notificações" }),
  ).toBeFocused();
  await expect(
    painel.getByRole("button", { name: "Marcar como lidas" }),
  ).toBeDisabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(painel).toHaveCount(0);
  await expect(sino).toBeFocused();

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
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
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
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

const rotas = [
  "/",
  "/laboratorios",
  "/laboratorios/00000000-0000-4000-8000-000000000001",
  "/laboratorios/gerenciar",
  "/calendario",
  "/reservas",
  "/reservas/nova",
  "/monitor",
  "/usuarios",
  "/perfil",
  "/notificacoes",
  "/bloqueios",
  "/configuracoes",
  "/ocorrencias",
  "/relatorios",
  "/relatorios/privacidade",
  "/auditoria",
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
  await page.goto("/reservas/nova");
  await page
    .getByLabel("Finalidade da reserva")
    .fill("Exploração do formulário de reserva em modo de demonstração.");
  await expect(
    page.getByRole("button", { name: "Enviar solicitação" }),
  ).toBeDisabled();
  await page.goto("/usuarios");
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

test("filtros do catálogo e navegação de calendário funcionam", async ({
  page,
}) => {
  await page.goto("/laboratorios");
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
