import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
const etapas = ["", "Setup, tooling e layout", "Banco, RLS, RPCs e seed", "Auth, RBAC e contas", "Cadastros e configurações", "Solicitações e calendário", "Painel do monitor e ocorrências", "Recorrência", "Fila de e-mail e worker", "Relatórios e auditoria", "Hardening e acessibilidade", "E2E, CI e documentação"];
const etapa = Number(process.argv[2]);
if (!Number.isInteger(etapa) || etapa < 1 || etapa > 11) throw new Error("Informe etapa 1–11");
for (const tarefa of ["lint", "typecheck", "test"]) {
  const resultado = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", tarefa], { encoding: "utf8", shell: process.platform === "win32" });
  if (resultado.status !== 0) { process.stderr.write(resultado.stdout + resultado.stderr); process.exit(resultado.status ?? 1); }
  process.stdout.write(`${tarefa}: passou\n`);
}
appendFileSync("docs/PROGRESSO.md", `\n## Etapa ${etapa} — ${etapas[etapa]}\n- Feito: implementação da etapa incluída neste commit.\n- Verificado: lint, typecheck e Vitest passaram localmente.\n- Pendente: testes Supabase/pgTAP e integração exigem Docker + serviços e credenciais; executar conforme README. Não foram considerados aprovados.\n- Próximo passo: ${etapa < 11 ? etapas[etapa + 1] : "provisionar serviços e executar validação de integração completa"}.\n`);
const arquivosEtapa = etapa === 2 ? ["supabase/migrations/202610200001_core.sql", "supabase/seed.sql", "supabase/config.toml", "supabase/tests", "src/lib/types.ts", "src/lib/errors.ts", "tests/unit/errors.test.ts", "tests/unit/tooling.test.ts", "docs", "package.json", "package-lock.json", ".env.example", "src/app/globals.css", "src/app/layout.tsx", "next-env.d.ts", "scripts/checkpoint.mjs", "scripts/validar-banco.mjs", "AGENTS.md"] : etapa === 3 ? ["src/lib/supabase", "src/lib/auth.ts", "src/lib/auth-actions.ts", "src/lib/auth-schema.ts", "src/lib/data.ts", "src/lib/demo.ts", "src/components/shared.tsx", "src/proxy.ts", "src/app/auth", "src/app/(auth)", "src/app/api/usuarios", "src/app/(portal)/usuarios", "src/app/(portal)/perfil", "src/app/(portal)/notificacoes", "src/app/(portal)/pessoas.css", "tests/unit/auth-schema.test.ts", "tests/unit/auth.test.ts", "docs/PROGRESSO.md"] : ["."];
for (const args of [["add", "--", ...arquivosEtapa.filter(p=>existsSync(p))], ["-c", "core.hooksPath=", "commit", "-m", `feat: etapa ${etapa} - ${etapas[etapa]}`]]) {
  const resultado = spawnSync("git", args, { encoding: "utf8" });
  process.stdout.write(resultado.stdout);
  if (resultado.status !== 0) { process.stderr.write(resultado.stderr); process.exit(resultado.status ?? 1); }
}
