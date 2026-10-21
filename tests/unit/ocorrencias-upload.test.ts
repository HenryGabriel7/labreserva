import { afterEach, beforeEach, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  usuarioId: "f1000000-0000-4000-8000-000000000001",
  reservaId: "f1000000-0000-4000-8000-000000000002",
  laboratorioId: "f1000000-0000-4000-8000-000000000003",
  loteId: "f1000000-0000-4000-8000-000000000004",
  arquivoId: "f1000000-0000-4000-8000-000000000005",
  getCurrentUser: vi.fn(),
  adminRpc: vi.fn(),
  userRpc: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  assinar: vi.fn(),
  removerTemp: vi.fn(),
  removerFinal: vi.fn(),
  inserir: vi.fn(),
  filtros: [] as Array<[string, unknown]>,
  atualizacoes: [] as Array<Record<string, unknown>>,
  claimDisponivel: true,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: estado.getCurrentUser }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: estado.userRpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: estado.reservaId,
              laboratorio_id: estado.laboratorioId,
              status: "concluida",
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: estado.adminRpc,
    storage: {
      from: (bucket: string) => ({
        download: estado.download,
        upload: estado.upload,
        createSignedUploadUrl: estado.assinar,
        remove:
          bucket === "ocorrencias" ? estado.removerFinal : estado.removerTemp,
      }),
    },
    from: () => {
      const query = {
        select: () => query,
        insert: estado.inserir,
        update: (valor: Record<string, unknown>) => {
          estado.atualizacoes.push(valor);
          return query;
        },
        eq: (campo: string, valor: unknown) => {
          estado.filtros.push([campo, valor]);
          return query;
        },
        gt: (campo: string, valor: unknown) => {
          estado.filtros.push([campo, valor]);
          return query;
        },
        lt: () => query,
        limit: async () => ({ data: [], error: null }),
        maybeSingle: async () => {
          const disponivel = estado.claimDisponivel;
          estado.claimDisponivel = false;
          return {
            data: disponivel
              ? {
                  id: estado.loteId,
                  paths: [
                    `${estado.usuarioId}/${estado.loteId}/${estado.arquivoId}`,
                  ],
                }
              : null,
            error: null,
          };
        },
        then: (resolve: (value: { data: null; error: null }) => unknown) =>
          Promise.resolve(resolve({ data: null, error: null })),
      };
      return query;
    },
  }),
}));

import { POST as registrar } from "@/app/api/ocorrencias/route";
import { POST as preparar } from "@/app/api/ocorrencias/uploads/route";
import {
  MAX_FOTO_BYTES,
  ocorrenciaEntradaSchema,
  validarPathsTemporarios,
} from "@/lib/uploads";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
function request(
  dados: unknown,
  origin: string | null = "https://portal.teste",
) {
  return new Request("https://portal.teste/api/ocorrencias", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(dados),
  });
}
const entrada = () => ({
  reservaId: estado.reservaId,
  tipo: "dano",
  gravidade: "baixa",
  descricao: "Descrição suficiente da ocorrência",
  loteId: estado.loteId,
});
const preparo = () => ({
  reservaId: estado.reservaId,
  fotos: [{ tamanho: png.length, mime: "image/png" }],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "https://portal.teste");
  estado.filtros = [];
  estado.atualizacoes = [];
  estado.claimDisponivel = true;
  estado.getCurrentUser.mockResolvedValue({
    id: estado.usuarioId,
    roles: ["monitor"],
  });
  estado.adminRpc.mockResolvedValue({ data: true, error: null });
  estado.userRpc.mockImplementation(async (nome: string) => ({
    data: nome === "pode_gerir_lab" ? true : { id: "ocorrencia-criada" },
    error: null,
  }));
  estado.download.mockResolvedValue({
    data: new Blob([png], { type: "image/png" }),
    error: null,
  });
  estado.upload.mockResolvedValue({ error: null });
  estado.assinar.mockImplementation(async (path: string) => ({
    data: {
      signedUrl: `https://projeto.supabase.co/storage/v1/object/upload/sign/ocorrencias-temporarias/${path}?token=assinatura-teste`,
    },
    error: null,
  }));
  estado.inserir.mockResolvedValue({ error: null });
  estado.removerTemp.mockResolvedValue({ error: null });
  estado.removerFinal.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("nega CSRF antes de acessar sessão ou emitir upload", async () => {
  expect((await preparar(request(preparo(), null))).status).toBe(403);
  expect(
    (await registrar(request(entrada(), "https://outra.teste"))).status,
  ).toBe(403);
  expect(estado.getCurrentUser).not.toHaveBeenCalled();
  expect(estado.assinar).not.toHaveBeenCalled();
});
it("exige sessão sensível e papel, sem entregar assinaturas ao aluno", async () => {
  estado.getCurrentUser.mockResolvedValue({
    id: estado.usuarioId,
    roles: ["aluno"],
  });
  expect((await preparar(request(preparo()))).status).toBe(403);
  expect(estado.getCurrentUser).toHaveBeenCalledWith({ sensitive: true });
  expect(estado.assinar).not.toHaveBeenCalled();
});
it("revalida vínculo do monitor antes de assinar ou baixar fotos", async () => {
  estado.userRpc.mockResolvedValue({ data: false, error: null });
  expect((await preparar(request(preparo()))).status).toBe(403);
  expect((await registrar(request(entrada()))).status).toBe(403);
  expect(estado.assinar).not.toHaveBeenCalled();
  expect(estado.download).not.toHaveBeenCalled();
});
it("aplica rate limit também no preparo", async () => {
  estado.adminRpc.mockResolvedValue({ data: false, error: null });
  expect((await preparar(request(preparo()))).status).toBe(429);
  expect(estado.assinar).not.toHaveBeenCalled();
});
it("recusa mais de cinco arquivos, tamanho excedido e URLs/paths fornecidos pelo cliente", async () => {
  expect(
    (
      await preparar(
        request({ ...preparo(), fotos: Array(6).fill(preparo().fotos[0]) }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await preparar(
        request({
          ...preparo(),
          fotos: [{ tamanho: MAX_FOTO_BYTES + 1, mime: "image/png" }],
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await registrar(
        request({ ...entrada(), url: "https://externo.teste/foto" }),
      )
    ).status,
  ).toBe(400);
  expect(
    ocorrenciaEntradaSchema.safeParse({ ...entrada(), paths: ["alheio"] })
      .success,
  ).toBe(false);
  expect(estado.download).not.toHaveBeenCalled();
});
it("assina somente paths gerados, vinculados ao usuário e lote salvo", async () => {
  const resposta = await preparar(request(preparo()));
  expect(resposta.status).toBe(201);
  const body = await resposta.json();
  const inserido = estado.inserir.mock.calls[0][0];
  expect(inserido).toMatchObject({
    id: body.loteId,
    usuario_id: estado.usuarioId,
    reserva_id: estado.reservaId,
  });
  expect(
    validarPathsTemporarios(inserido.paths, estado.usuarioId, body.loteId),
  ).toHaveLength(1);
  expect(estado.assinar).toHaveBeenCalledWith(inserido.paths[0], {
    upsert: false,
  });
  expect(resposta.headers.get("Cache-Control")).toBe("private, no-store");
});
it("claim de lote exige posse, reserva, estado pendente e validade; replay não baixa arquivos", async () => {
  const primeiro = await registrar(request(entrada()));
  expect(primeiro.status).toBe(201);
  expect(estado.filtros).toEqual(
    expect.arrayContaining([
      ["usuario_id", estado.usuarioId],
      ["reserva_id", estado.reservaId],
      ["estado", "pendente"],
      ["id", estado.loteId],
      ["expira_em", expect.any(String)],
    ]),
  );
  expect((await registrar(request(entrada()))).status).toBe(409);
  expect(estado.download).toHaveBeenCalledTimes(1);
});
it("recusa lote expirado ou alheio sem tocar em Storage", async () => {
  estado.claimDisponivel = false;
  expect((await registrar(request(entrada()))).status).toBe(409);
  expect(estado.download).not.toHaveBeenCalled();
  expect(estado.removerTemp).not.toHaveBeenCalled();
});
it("tipo real inválido nunca vai ao bucket definitivo e o temporário é removido", async () => {
  estado.download.mockResolvedValue({
    data: new Blob(["<script>falso png</script>"], { type: "image/png" }),
    error: null,
  });
  expect((await registrar(request(entrada()))).status).toBe(400);
  expect(estado.upload).not.toHaveBeenCalled();
  expect(estado.removerTemp).toHaveBeenCalledTimes(1);
  expect(estado.atualizacoes).toContainEqual(
    expect.objectContaining({ estado: "falhou" }),
  );
});
it("valida bytes antes de promover e só registra paths finais gerados", async () => {
  expect((await registrar(request(entrada()))).status).toBe(201);
  const [path, bytes, opcoes] = estado.upload.mock.calls[0];
  expect(path).toMatch(
    new RegExp(
      `^${estado.laboratorioId}/${estado.reservaId}/[a-f0-9-]{36}\\.png$`,
    ),
  );
  expect(bytes).toEqual(new Uint8Array(png));
  expect(opcoes).toEqual({ contentType: "image/png", upsert: false });
  expect(estado.userRpc).toHaveBeenCalledWith(
    "registrar_ocorrencia",
    expect.objectContaining({ p_anexos: [path] }),
  );
  expect(estado.removerTemp).toHaveBeenCalledTimes(1);
  expect(estado.removerFinal).not.toHaveBeenCalled();
});
it("falha da RPC limpa fotos promovidas e não deixa anexos órfãos", async () => {
  estado.userRpc.mockImplementation(async (nome: string) =>
    nome === "pode_gerir_lab"
      ? { data: true, error: null }
      : { data: null, error: { message: "OCORRENCIA_NAO_PERMITIDA" } },
  );
  expect((await registrar(request(entrada()))).status).toBe(400);
  expect(estado.removerFinal).toHaveBeenCalledTimes(1);
  expect(estado.removerTemp).toHaveBeenCalledTimes(1);
});
it("ocorrência sem foto usa JSON sem criar nem consumir um lote", async () => {
  expect(
    (await registrar(request({ ...entrada(), loteId: null }))).status,
  ).toBe(201);
  expect(estado.download).not.toHaveBeenCalled();
  expect(estado.userRpc).toHaveBeenCalledWith(
    "registrar_ocorrencia",
    expect.objectContaining({ p_anexos: [] }),
  );
});
it("corpo maior que 16 KiB é recusado sem baixar fotos", async () => {
  expect(
    (await registrar(request({ ...entrada(), descricao: "x".repeat(20000) })))
      .status,
  ).toBe(400);
  expect(estado.download).not.toHaveBeenCalled();
});
it("validação de paths nega traversal, outro usuário/lote e duplicados", () => {
  const path = `${estado.usuarioId}/${estado.loteId}/${estado.arquivoId}`;
  expect(() =>
    validarPathsTemporarios([path], estado.reservaId, estado.loteId),
  ).toThrow();
  expect(() =>
    validarPathsTemporarios([path, path], estado.usuarioId, estado.loteId),
  ).toThrow();
  expect(() =>
    validarPathsTemporarios(
      [`${estado.usuarioId}/${estado.loteId}/../arquivo`],
      estado.usuarioId,
      estado.loteId,
    ),
  ).toThrow();
});
