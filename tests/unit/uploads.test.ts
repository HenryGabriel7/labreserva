import { expect, it } from "vitest";
import {
  identificarFoto,
  lerCorpoLimitado,
  MAX_FOTO_BYTES,
} from "@/lib/uploads";
it("recusa MIME forjado e imagens maiores que5MB pelo conteúdo", async () => {
  await expect(
    identificarFoto(new TextEncoder().encode("<script>não é jpeg</script>")),
  ).rejects.toThrow();
  await expect(
    identificarFoto(new Uint8Array(MAX_FOTO_BYTES + 1)),
  ).rejects.toThrow(/5 MB/);
});
it("identifica PNG pelo cabeçalho binário", async () => {
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  expect(await identificarFoto(png)).toEqual({
    mime: "image/png",
    extensao: "png",
  });
});
it("limita corpo mesmo quando Content-Length está ausente", async () => {
  const r = new Request("http://localhost/upload", {
    method: "POST",
    body: "123456",
  });
  await expect(lerCorpoLimitado(r, 5)).rejects.toThrow(/grande/);
});
