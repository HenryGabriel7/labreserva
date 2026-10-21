import { expect, it } from "vitest";
import { criarCsp } from "@/lib/security";
it("a política de produção permite scripts apenas com nonce e sem eval", () => {
  const csp = criarCsp("teste-aleatorio");
  const scripts = csp
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("script-src"));
  expect(scripts).toContain("'nonce-teste-aleatorio'");
  expect(scripts).not.toContain("unsafe-inline");
  expect(scripts).not.toContain("unsafe-eval");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(criarCsp("teste", true)).toContain("'unsafe-eval'");
});
