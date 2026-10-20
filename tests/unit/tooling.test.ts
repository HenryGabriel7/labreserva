import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";
const require = createRequire(import.meta.url);
it("resolve o rootDir do lint Next com glob de diretórios", () => {
  const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs.js") as { getRootDirs: (context: { cwd:string; settings:{next:{rootDir:string}} }) => string[] };
  const dirs = getRootDirs({ cwd:process.cwd(), settings:{next:{rootDir:resolve("src", "a*")}} });
  expect(dirs.map(d=>resolve(d).replaceAll("\\", "/"))).toContain(resolve("src", "app").replaceAll("\\", "/"));
});
