import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);

it("bloqueia cadastro público sem desabilitar o login por email", () => {
  const configuracao = readFileSync(resolve("supabase/config.toml"), "utf8");
  const secoes = Object.fromEntries(
    [
      ...configuracao.matchAll(
        /^\[([^\]]+)\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm,
      ),
    ].map(([, nome, corpo]) => [nome, corpo]),
  );
  expect(secoes.auth).toMatch(/^enable_signup\s*=\s*false\s*$/m);
  expect(secoes.auth).toMatch(/^enable_anonymous_sign_ins\s*=\s*false\s*$/m);
  expect(secoes["auth.email"]).toMatch(/^enable_signup\s*=\s*true\s*$/m);
});

it("resolve o rootDir do lint Next com glob de diretórios", () => {
  const { getRootDirs } =
    require("@next/eslint-plugin-next/dist/utils/get-root-dirs.js") as {
      getRootDirs: (context: {
        cwd: string;
        settings: { next: { rootDir: string } };
      }) => string[];
    };
  const dirs = getRootDirs({
    cwd: process.cwd(),
    settings: { next: { rootDir: resolve("src", "a*") } },
  });
  expect(dirs.map((d) => resolve(d).replaceAll("\\", "/"))).toContain(
    resolve("src", "app").replaceAll("\\", "/"),
  );
});
