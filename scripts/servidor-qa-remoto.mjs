import assert from "node:assert/strict";
import { iniciarServidorE2e } from "./servidor-e2e-https.mjs";

// Entrada manual distinta dos testes de CI: somente o projeto autorizado.
assert.equal(process.env.LABRESERVA_QA_AUTORIZADO, "1");
assert.equal(
  process.env.SUPABASE_URL,
  "https://hvcetcfairwfuyxlyynl.supabase.co",
);
await iniciarServidorE2e({ qaRemoto: true });
