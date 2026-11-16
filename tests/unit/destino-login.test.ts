import { describe, expect, it } from "vitest";
import { destinoPosLogin } from "@/lib/destino-login";

describe("destino após login", () => {
  it("mantém um caminho do portal, com parâmetros e âncora", () => {
    expect(destinoPosLogin("/relatorios/privacidade")).toBe(
      "/relatorios/privacidade",
    );
    expect(destinoPosLogin("/admin/usuarios?pagina=2#lista")).toBe(
      "/admin/usuarios?pagina=2#lista",
    );
  });

  it.each([
    undefined,
    ["/relatorios/privacidade"],
    "https://fora.invalid",
    "//fora.invalid",
    "/\\fora.invalid",
    "/%2ffora.invalid",
    "/%5cfora.invalid",
    "/%0afora.invalid",
    "/a/..//fora.invalid",
    "/%6Cogin",
    "/auth/confirm?token_hash=abc",
    "/api/privacidade",
    "/%zz",
  ])("usa / quando o destino é inválido ou inadequado: %j", (valor) => {
    expect(destinoPosLogin(valor)).toBe("/");
  });
});
