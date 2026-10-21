import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
const etapas = [
  "",
  "Setup, tooling e layout",
  "Banco, RLS, RPCs e seed",
  "Auth, RBAC e contas",
  "Cadastros e configurações",
  "Solicitações e calendário",
  "Painel do monitor e ocorrências",
  "Recorrência",
  "Fila de e-mail e worker",
  "Relatórios e auditoria",
  "Hardening e acessibilidade",
  "E2E, CI e documentação",
];
const etapa = Number(process.argv[2]);
if (!Number.isInteger(etapa) || etapa < 1 || etapa > 11)
  throw new Error("Informe etapa 1–11");
for (const tarefa of ["lint", "typecheck", "test"]) {
  const windows = process.platform === "win32";
  const resultado = spawnSync(
    windows ? (process.env.ComSpec ?? "cmd.exe") : "npm",
    windows ? ["/d", "/s", "/c", `npm.cmd run ${tarefa}`] : ["run", tarefa],
    { encoding: "utf8" },
  );
  if (resultado.status !== 0) {
    process.stderr.write(resultado.stdout + resultado.stderr);
    process.exit(resultado.status ?? 1);
  }
  process.stdout.write(`${tarefa}: passou\n`);
}
appendFileSync(
  "docs/PROGRESSO.md",
  `\n## Etapa ${etapa} — ${etapas[etapa]}\n- Feito: implementação da etapa incluída neste commit.\n- Verificado: lint, typecheck e Vitest passaram localmente.\n- Pendente: testes Supabase/pgTAP e integração exigem Docker + serviços e credenciais; executar conforme README. Não foram considerados aprovados.\n- Próximo passo: ${etapa < 11 ? etapas[etapa + 1] : "provisionar serviços e executar validação de integração completa"}.\n`,
);
const arquivosEtapa =
  etapa === 2
    ? [
        "supabase/migrations/202610200001_core.sql",
        "supabase/seed.sql",
        "supabase/config.toml",
        "supabase/tests",
        "src/lib/types.ts",
        "src/lib/errors.ts",
        "tests/unit/errors.test.ts",
        "tests/unit/tooling.test.ts",
        "docs",
        "package.json",
        "package-lock.json",
        ".env.example",
        "src/app/globals.css",
        "src/app/layout.tsx",
        "next-env.d.ts",
        "scripts/checkpoint.mjs",
        "scripts/validar-banco.mjs",
        "AGENTS.md",
      ]
    : etapa === 3
      ? [
          "src/lib/supabase",
          "src/lib/auth.ts",
          "src/lib/auth-actions.ts",
          "src/lib/auth-schema.ts",
          "src/lib/data.ts",
          "src/lib/demo.ts",
          "src/components/shared.tsx",
          "src/proxy.ts",
          "src/app/auth",
          "src/app/(auth)",
          "src/app/api/usuarios",
          "src/app/(portal)/usuarios",
          "src/app/(portal)/perfil",
          "src/app/(portal)/notificacoes",
          "src/app/(portal)/pessoas.css",
          "tests/unit/auth-schema.test.ts",
          "tests/unit/auth.test.ts",
          "docs/PROGRESSO.md",
        ]
      : ["."];
const preparacoes = {
  5: [
    "src/lib/reservas.ts",
    "src/lib/schemas-reservas.ts",
    "src/lib/actions-reservas.ts",
    "src/lib/errors.ts",
    "src/components/reserva-form.tsx",
    "src/components/reserva-acoes.tsx",
    "src/components/calendario.tsx",
    "src/app/(portal)/reservas",
    "src/app/(portal)/calendario",
    "tests/unit/reservas.test.ts",
    "docs/PROGRESSO.md",
    "scripts/checkpoint.mjs",
  ],
  6: [
    "src/lib/actions-monitor.ts",
    "src/lib/uploads.ts",
    "src/components/monitor-painel.tsx",
    "src/components/ocorrencia-form.tsx",
    "src/app/(portal)/monitor",
    "src/app/(portal)/ocorrencias",
    "src/app/api/ocorrencias",
    "tests/unit/uploads.test.ts",
    "docs/PROGRESSO.md",
  ],
  7: [
    "src/lib/recorrencia.ts",
    "src/lib/schemas-reservas.ts",
    "src/lib/actions-reservas.ts",
    "src/components/reserva-form.tsx",
    "src/components/monitor-painel.tsx",
    "tests/unit/recorrencia.test.ts",
    "docs/PROGRESSO.md",
  ],
  8: [
    "supabase/functions",
    "supabase/migrations/202610200008_email.sql",
    "supabase/tests/008_email.sql",
    "src/lib/notificacoes",
    "src/app/api/webhooks",
    "src/app/api/descadastro",
    "tests/unit/notificacoes.test.ts",
    "docs/EMAIL.md",
    "docs/PROGRESSO.md",
  ],
  9: [
    "src/lib/relatorios.ts",
    "src/lib/data-painel.ts",
    "src/app/(portal)/relatorios",
    "src/app/(portal)/auditoria",
    "src/app/api/relatorios",
    "src/app/api/privacidade",
    "tests/unit/relatorios.test.ts",
    "supabase/migrations/202610200009_resumo_painel.sql",
    "supabase/tests/009_resumo_painel.sql",
    "src/app/(portal)/page.tsx",
    "src/lib/data.ts",
    "docs/PROGRESSO.md",
  ],
  10: [
    ".gitattributes",
    ".prettierignore",
    "src",
    "public",
    "supabase/migrations/202610200010_hardening.sql",
    "supabase/migrations/202610200011_bloqueios.sql",
    "supabase/migrations/202610200012_bootstrap.sql",
    "supabase/migrations/202610200013_contexto_auditoria.sql",
    "supabase/tests/010_hardening.sql",
    "supabase/tests/011_bloqueios.sql",
    "supabase/tests/012_bootstrap.sql",
    "supabase/tests/013_contexto_auditoria.sql",
    "supabase/tests/001_seguranca_fluxos.sql",
    "supabase/tests/002_recorrencia_fila_rotinas.sql",
    "scripts/validar-banco.mjs",
    "scripts/checkpoint.mjs",
    "scripts/contraste.mjs",
    "scripts/primeiro-admin.mjs",
    "tests/unit",
    "docs/SEGURANCA.md",
    "docs/DECISOES.md",
    "docs/ARQUITETURA.md",
    "docs/PROGRESSO.md",
    "next.config.ts",
    "next-env.d.ts",
    "package.json",
    "package-lock.json",
  ],
};
const arquivos = preparacoes[etapa] ?? arquivosEtapa;
for (const args of [
  ["add", "--", ...arquivos.filter((p) => existsSync(p))],
  [
    "-c",
    "core.hooksPath=",
    "commit",
    "-m",
    `feat: etapa ${etapa} - ${etapas[etapa]}`,
  ],
]) {
  const resultado = spawnSync("git", args, { encoding: "utf8" });
  process.stdout.write(resultado.stdout);
  if (resultado.status !== 0) {
    process.stderr.write(resultado.stderr);
    process.exit(resultado.status ?? 1);
  }
}
