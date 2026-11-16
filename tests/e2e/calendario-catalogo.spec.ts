import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  ambienteLocal,
  clienteServico,
  criarLaboratorio,
  criarPessoa,
  exigirSucesso,
  motivoSemSupabase,
  senhaDev,
} from "../integration/helpers";

test.describe("calendário e catálogo com Supabase local", () => {
  test.skip(!ambienteLocal, motivoSemSupabase);
  let aluno: Awaited<ReturnType<typeof criarPessoa>>;

  test.beforeAll(async () => {
    aluno = await criarPessoa("aluno");
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail institucional").fill(aluno.email);
    await page.getByLabel("Senha", { exact: true }).fill(senhaDev);
    await page.getByRole("button", { name: "Entrar na minha conta" }).click();
    await expect(page).toHaveURL(/3100\/$/);
  });

  test("mês civil inclui bloqueios que cruzam dias e respeita meia-noite local", async ({
    page,
  }) => {
    const db = clienteServico();
    const lab = await criarLaboratorio(db);
    const ids = [randomUUID(), randomUUID()];
    exigirSucesso(
      await db
        .from("bloqueios")
        .insert([
          {
            id: ids[0],
            laboratorio_id: lab.id,
            inicio: "2028-01-29T23:30:00-03:00",
            fim: "2028-02-02T00:00:00-03:00",
            motivo: "manutencao",
            descricao: "Bloqueio fictício que começa antes da grade",
          },
          {
            id: ids[1],
            laboratorio_id: lab.id,
            inicio: "2028-02-28T23:30:00-03:00",
            fim: "2028-03-01T00:00:00-03:00",
            motivo: "manutencao",
            descricao: "Bloqueio fictício que inclui o dia bissexto",
          },
        ])
        .select("id"),
      "Criar bloqueios fictícios em loopback",
    );
    try {
      await page.goto(`/calendario?lab=${lab.id}&data=2028-01-01&visao=mes`);
      await page.getByRole("link", { name: "Período anterior" }).click();
      await expect(page).toHaveURL(/data=2027-12-01&visao=mes$/);
      await page.getByRole("link", { name: "Próximo período" }).click();
      await expect(page).toHaveURL(/data=2028-01-01&visao=mes$/);
      await page.getByRole("link", { name: "Próximo período" }).click();
      await expect(page).toHaveURL(/data=2028-02-01&visao=mes$/);
      await expect(
        page.getByRole("heading", { name: "fevereiro de 2028" }),
      ).toBeVisible();
      for (const dia of [
        "31/01/2028",
        "01/02/2028",
        "28/02/2028",
        "29/02/2028",
      ]) {
        await expect(
          page
            .getByRole("link", { name: `${dia}, 1 bloqueio`, exact: true })
            .locator(".month-blocked"),
        ).toHaveText("1 bloqueio");
      }
      for (const dia of ["02/02/2028", "01/03/2028"]) {
        await expect(
          page.getByRole("link", { name: dia, exact: true }),
        ).toBeVisible();
      }
      await page.getByRole("link", { name: "Próximo período" }).click();
      await expect(page).toHaveURL(/data=2028-03-01&visao=mes$/);
    } finally {
      const { error } = await db.from("bloqueios").delete().in("id", ids);
      expect(error).toBeNull();
    }
  });

  test("catálogo pagina e busca um laboratório fora dos cem primeiros com RLS", async ({
    page,
  }) => {
    const db = clienteServico();
    const termo = `QA catálogo [*], ${randomUUID().slice(0, 8)}`;
    const laboratorios = Array.from({ length: 102 }, (_, i) => ({
      id: randomUUID(),
      nome: `${termo} ${String(i).padStart(3, "0")}`,
      tipo: "informatica",
      capacidade: 20,
      localizacao: "Fixtura local",
      modo_reserva: "slot_fixo",
      ativo: i < 101,
    }));
    const autorizado = laboratorios[100];
    const inativo = laboratorios[101];
    const item = {
      id: randomUUID(),
      laboratorio_id: autorizado.id,
      nome: "Microscópio 100% [teste]",
      quantidade: 2,
    };
    exigirSucesso(
      await db.from("laboratorios").insert(laboratorios).select("id"),
      "Criar 102 laboratórios fictícios em loopback",
    );
    try {
      exigirSucesso(
        await db.from("equipamentos").insert(item).select("id"),
        "Adicionar equipamento ao último laboratório ativo",
      );
      const oculto = await aluno.cliente
        .from("laboratorios")
        .select("id")
        .eq("id", inativo.id)
        .maybeSingle();
      expect(oculto.error).toBeNull();
      expect(oculto.data).toBeNull();
      const filtros = new URLSearchParams({
        q: termo,
        tipo: "informatica",
        capacidade: "20",
      });
      await page.goto(`/laboratorios?${filtros}`);
      await expect(page.locator(".catalog-grid article")).toHaveCount(20);
      await expect(
        page.getByText("101 laboratórios encontrados"),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: autorizado.nome, exact: true }),
      ).toHaveCount(0);
      await page.getByRole("link", { name: "Próxima" }).click();
      await expect(page).toHaveURL(/&pagina=2$/);
      const params = new URL(page.url()).searchParams;
      expect(params.get("q")).toBe(termo);
      expect(params.get("tipo")).toBe("informatica");
      expect(params.get("capacidade")).toBe("20");
      expect(params.get("pagina")).toBe("2");
      await page.goto(`/laboratorios?${filtros}&pagina=6`);
      await expect(page.locator(".catalog-grid article")).toHaveCount(1);
      await expect(
        page.getByRole("heading", { name: autorizado.nome, exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Conhecer o espaço" }).click();
      await expect(
        page.getByRole("heading", { name: autorizado.nome, exact: true }),
      ).toBeVisible();
      await expect(page.getByText(item.nome, { exact: true })).toBeVisible();
      await page
        .getByRole("link", { name: "Reservar este laboratório" })
        .click();
      await expect(
        page.getByRole("combobox", { name: "Laboratório", exact: true }),
      ).toHaveValue(autorizado.id);
      await page.goto(`/laboratorios/${autorizado.id}`);
      await page.getByRole("link", { name: "Consultar a agenda" }).click();
      await expect(
        page.getByRole("combobox", { name: "Laboratório", exact: true }),
      ).toHaveValue(autorizado.id);
      await page.goto(
        `/laboratorios?${filtros}&equipamento=${encodeURIComponent(item.nome)}`,
      );
      await expect(page.locator(".catalog-grid article")).toHaveCount(1);
      await expect(
        page.getByRole("heading", { name: autorizado.nome, exact: true }),
      ).toBeVisible();
      await page.goto(`/laboratorios/${inativo.id}`);
      await expect(
        page.getByRole("heading", { name: "404", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: inativo.nome, exact: true }),
      ).toHaveCount(0);
    } finally {
      const equipamento = await db
        .from("equipamentos")
        .delete()
        .eq("id", item.id);
      expect(equipamento.error).toBeNull();
      const labs = await db
        .from("laboratorios")
        .delete()
        .in(
          "id",
          laboratorios.map(({ id }) => id),
        );
      expect(labs.error).toBeNull();
    }
  });
});
