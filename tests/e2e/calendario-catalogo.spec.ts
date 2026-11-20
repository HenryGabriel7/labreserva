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

  test("dia e semana mostram horários extremos e bloqueios até a meia-noite exclusiva", async ({
    page,
  }) => {
    const db = clienteServico();
    const lab = await criarLaboratorio(db);
    const reservas = [randomUUID(), randomUUID()];
    const bloqueios = [randomUUID(), randomUUID()];
    try {
      exigirSucesso(
        await db
          .from("janelas_horario")
          .update({ inicio: "07:00", fim: "23:00" })
          .eq("laboratorio_id", lab.id),
        "Configurar funcionamento estendido da fixture local",
      );
      const base = {
        laboratorio_id: lab.id,
        solicitante_id: aluno.id,
        escopo: "laboratorio",
        n_participantes: 3,
        prioridade_efetiva: 1,
        papel_solicitante: "aluno",
        status: "aprovada",
        finalidade: "Atividade fictícia no horário estendido",
      };
      exigirSucesso(
        await db.from("reservas").insert([
          {
            ...base,
            id: reservas[0],
            inicio: "2028-02-02T07:00:00-03:00",
            fim: "2028-02-02T08:00:00-03:00",
          },
          {
            ...base,
            id: reservas[1],
            inicio: "2028-02-02T22:00:00-03:00",
            fim: "2028-02-02T23:00:00-03:00",
          },
        ]),
        "Criar reservas fictícias antes das oito e após as vinte e duas",
      );
      exigirSucesso(
        await db.from("bloqueios").insert([
          {
            id: bloqueios[0],
            laboratorio_id: lab.id,
            inicio: "2028-02-02T23:00:00-03:00",
            fim: "2028-02-03T00:00:00-03:00",
            motivo: "manutencao",
            descricao: "Bloqueio fictício com término à meia-noite",
          },
          {
            id: bloqueios[1],
            laboratorio_id: lab.id,
            inicio: "2028-02-03T23:30:00-03:00",
            fim: "2028-02-04T00:30:00-03:00",
            motivo: "manutencao",
            descricao: "Bloqueio fictício que atravessa a meia-noite",
          },
        ]),
        "Criar bloqueios fictícios nos limites do dia local",
      );
      const celula = (hora: string, coluna = 0) =>
        page
          .locator(".calendar-table tbody tr")
          .filter({
            has: page
              .locator("th")
              .filter({ hasText: new RegExp(`^${hora}$`) }),
          })
          .locator("td")
          .nth(coluna);
      for (const visao of ["dia", "semana"]) {
        await page.goto(
          `/calendario?lab=${lab.id}&data=2028-02-02&visao=${visao}`,
        );
        await expect(page.locator(".calendar-table tbody tr")).toHaveCount(24);
        const coluna = visao === "dia" ? 0 : 2; // 02/02/2028 é quarta-feira.
        for (const hora of ["07:00", "22:00"]) {
          await expect(celula(hora, coluna)).toContainText(
            "Laboratório reservado",
          );
        }
        await expect(
          celula("08:00", coluna).locator(".calendar-block"),
        ).toHaveCount(0);
        await expect(celula("23:00", coluna)).toContainText("Bloqueado");
        await expect(celula("23:00", coluna)).toContainText("23:00 – 00:00");
        if (visao === "semana") {
          await expect(
            celula("00:00", 3).locator(".calendar-block"),
          ).toHaveCount(0);
          await expect(celula("23:00", 3)).toContainText("Bloqueado");
          await expect(celula("00:00", 4)).toContainText("Bloqueado");
          await expect(
            celula("01:00", 4).locator(".calendar-block"),
          ).toHaveCount(0);
        }
      }
      await page.goto(`/calendario?lab=${lab.id}&data=2028-02-03&visao=dia`);
      await expect(celula("00:00").locator(".calendar-block")).toHaveCount(0);
      await expect(celula("23:00")).toContainText("Bloqueado");
      await page.goto(`/calendario?lab=${lab.id}&data=2028-02-04&visao=dia`);
      await expect(celula("00:00")).toContainText("Bloqueado");
      await expect(celula("01:00").locator(".calendar-block")).toHaveCount(0);
      const solicitarTarde = celula("23:00").getByRole("link");
      const destino = new URL(
        (await solicitarTarde.getAttribute("href"))!,
        page.url(),
      );
      expect(destino.searchParams.get("lab")).toBe(lab.id);
      expect(destino.searchParams.get("data")).toBe("2028-02-04");
      expect(destino.searchParams.get("inicio")).toBe("23:00");
      expect(destino.searchParams.has("fim")).toBe(false);
      await solicitarTarde.click();
      await expect(
        page.getByRole("combobox", { name: "Laboratório", exact: true }),
      ).toHaveValue(lab.id);
      await expect(page.getByLabel("Data", { exact: true })).toHaveValue(
        "2028-02-04",
      );
      await expect(
        page.getByLabel("Horário de início", { exact: true }),
      ).toHaveValue("23:00");
    } finally {
      exigirSucesso(
        await db.from("reservas").delete().in("id", reservas),
        "Remover reservas da fixture",
      );
      exigirSucesso(
        await db.from("bloqueios").delete().in("id", bloqueios),
        "Remover bloqueios da fixture",
      );
      exigirSucesso(
        await db.from("janelas_horario").delete().eq("laboratorio_id", lab.id),
        "Remover horários da fixture",
      );
      exigirSucesso(
        await db.from("laboratorios").delete().eq("id", lab.id),
        "Remover laboratório da fixture",
      );
    }
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
