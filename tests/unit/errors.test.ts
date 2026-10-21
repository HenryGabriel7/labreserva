import { expect, it } from "vitest";
import { mensagemErro } from "@/lib/errors";
it("traduz a exclusão concorrente e não expõe detalhes do banco", () => {
  expect(mensagemErro({ code: "23P01", message: "sensitive detail" })).toMatch(
    /ocupado/,
  );
  expect(
    mensagemErro({ message: "password=secreto SQL query email privado" }),
  ).not.toMatch(/secreto|query|email/);
});
