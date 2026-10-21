import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
