import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const windows = process.platform === "win32";
const status = spawnSync(
  windows ? (process.env.ComSpec ?? "cmd.exe") : "npx",
  windows
    ? ["/d", "/s", "/c", "npx.cmd supabase status --output json"]
    : ["supabase", "status", "--output", "json"],
  { encoding: "utf8" },
);
if (status.status !== 0)
  throw new Error(
    "Supabase local indisponível. Rode npx supabase start antes de configurar o CI.",
  );
const ambiente = JSON.parse(status.stdout);
const valores = {
  SUPABASE_URL: ambiente.API_URL,
  SUPABASE_PUBLISHABLE_KEY: ambiente.PUBLISHABLE_KEY ?? ambiente.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: ambiente.SERVICE_ROLE_KEY,
  APP_URL: "http://127.0.0.1:3100",
  REQUIRE_SUPABASE_TESTS: "true",
};
if (
  !valores.SUPABASE_URL ||
  !["127.0.0.1", "localhost", "[::1]"].includes(
    new URL(valores.SUPABASE_URL).hostname,
  ) ||
  Object.values(valores).some(
    (valor) => typeof valor !== "string" || !valor || /[\r\n]/.test(valor),
  )
)
  throw new Error(
    "A configuração de testes deve apontar ao Supabase local e conter todas as chaves.",
  );
if (!process.env.GITHUB_ENV)
  throw new Error(
    "Este script grava somente o ambiente do GitHub Actions; não imprime segredos.",
  );
appendFileSync(
  process.env.GITHUB_ENV,
  Object.entries(valores)
    .map(([chave, valor]) => `${chave}=${valor}`)
    .join("\n") + "\n",
);
console.log(
  "Variáveis do Supabase local configuradas para as etapas seguintes, sem exibir os valores.",
);
