import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  rmdirSync,
} from "node:fs";
import { request as solicitarHttp } from "node:http";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const origem = "https://127.0.0.1:3100";
const host = "127.0.0.1";
const portaNext = 3102;

/** Somente QA local: o Next continua em produção, atrás de TLS no loopback. */
export async function iniciarServidorE2e() {
  if (process.env.APP_URL !== origem)
    throw new Error("O proxy E2E exige APP_URL=https://127.0.0.1:3100.");
  if (
    process.env.SUPABASE_URL &&
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(process.env.SUPABASE_URL).hostname,
    )
  )
    throw new Error("O proxy E2E não aceita Supabase remoto.");

  const pastaTemporaria = mkdtempSync(join(tmpdir(), "labreserva-e2e-tls-"));
  const chave = join(pastaTemporaria, "key.pem");
  const certificado = join(pastaTemporaria, "cert.pem");
  const limparCertificado = () => {
    // Remove somente os dois arquivos conhecidos da pasta criada por mkdtemp.
    rmSync(chave, { force: true });
    rmSync(certificado, { force: true });
    try {
      rmdirSync(pastaTemporaria);
    } catch {
      // Outro processo pode já ter encerrado esta instância de QA.
    }
  };
  const opcoesOpenSSL = [
    "openssl",
    ...(process.platform === "win32"
      ? [
          "C:/Program Files/Git/usr/bin/openssl.exe",
          "C:/Program Files/Git/mingw64/bin/openssl.exe",
        ].filter(existsSync)
      : []),
  ];
  const certificadoGerado = opcoesOpenSSL.some(
    (binario) =>
      spawnSync(
        binario,
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          chave,
          "-out",
          certificado,
          "-sha256",
          "-days",
          "1",
          "-subj",
          "/CN=127.0.0.1",
          "-addext",
          "subjectAltName=IP:127.0.0.1,DNS:localhost",
        ],
        { stdio: "pipe", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
      ).status === 0,
  );
  if (!certificadoGerado) {
    limparCertificado();
    throw new Error("OpenSSL é necessário para o HTTPS local dos testes E2E.");
  }

  const next = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      host,
      "--port",
      String(portaNext),
    ],
    { cwd: process.cwd(), env: process.env, stdio: "inherit" },
  );
  const servidor = createServer(
    { key: readFileSync(chave), cert: readFileSync(certificado) },
    (requisicao, resposta) => {
      const encaminhamento = solicitarHttp(
        {
          hostname: host,
          port: portaNext,
          path: requisicao.url,
          method: requisicao.method,
          headers: {
            ...requisicao.headers,
            host: "127.0.0.1:3100",
            "x-forwarded-host": "127.0.0.1:3100",
            "x-forwarded-proto": "https",
            "x-forwarded-for": host,
          },
        },
        (retorno) => {
          resposta.writeHead(retorno.statusCode ?? 502, retorno.headers);
          retorno.pipe(resposta);
        },
      );
      encaminhamento.on("error", () => {
        if (!resposta.headersSent)
          resposta.writeHead(502, { "content-type": "text/plain" });
        resposta.end("Servidor de testes ainda indisponível.");
      });
      requisicao.on("aborted", () => encaminhamento.destroy());
      requisicao.pipe(encaminhamento);
    },
  );

  let encerrado = false;
  const encerrar = async () => {
    if (encerrado) return;
    encerrado = true;
    servidor.closeAllConnections();
    await new Promise((concluir) => servidor.close(concluir));
    if (next.exitCode === null) {
      next.kill();
      await new Promise((concluir) => {
        const limite = setTimeout(() => {
          next.kill("SIGKILL");
          concluir();
        }, 3000);
        limite.unref();
        next.once("exit", () => {
          clearTimeout(limite);
          concluir();
        });
      });
    }
    limparCertificado();
  };
  next.once("exit", () => {
    if (!encerrado) void encerrar();
  });
  try {
    await new Promise((concluir, rejeitar) => {
      servidor.once("error", rejeitar);
      servidor.listen(3100, host, concluir);
    });
  } catch (erro) {
    await encerrar();
    throw erro;
  }
  return { encerrar };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const servidor = await iniciarServidorE2e();
  for (const sinal of ["SIGINT", "SIGTERM"])
    process.once(sinal, () => {
      void servidor.encerrar().then(() => process.exit(0));
    });
}
