import { eventoEssencial } from "../_shared/notificacoes.tsx";

// Exercita o entrypoint Deno completo. Não concede permissão de rede e usa
// somente credenciais fictícias; qualquer URL fora do contrato lança erro.
Deno.test(
  "worker Deno autentica, valida e entrega pela fila com snapshot",
  async (t) => {
    const originalServe = Deno.serve;
    const originalEnv = Deno.env.get;
    const originalFetch = globalThis.fetch;
    const runtime = globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil(tarefa: Promise<unknown>): void };
    };
    const originalRuntime = runtime.EdgeRuntime;
    const segredo = "segredo-ficticio-somente-teste-runtime-123456789";
    const ambiente: Record<string, string> = {
      APP_URL: "https://app.test",
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
      RESEND_API_KEY: "fake-resend-key",
      RESEND_FROM: "Teste <avisos@app.test>",
      NOTIFICATION_WORKER_SECRET: segredo,
      NOTIFICATION_UNSUBSCRIBE_SECRET: segredo,
    };
    const estado: {
      handler?: (req: Request) => Promise<Response>;
      tarefas: Promise<unknown>[];
      chamadas: string[];
      snapshot?: Record<string, unknown>;
      entregas: number;
      semCredenciais: boolean;
    } = { tarefas: [], chamadas: [], entregas: 0, semCredenciais: false };
    const linha: Record<string, unknown> = {
      id: "20000000-0000-4000-8000-000000000001",
      usuario_id: "10000000-0000-4000-8000-000000000001",
      tipo_evento: "reserva_aprovada",
      template: "reserva_aprovada",
      essencial: eventoEssencial("reserva_aprovada"),
      destinatario_email: "lia@app.test",
      chave_idempotencia: "worker-fixture:aprovada",
      payload: {
        usuario_nome: "Lia",
        email: "lia@app.test",
        reserva_id: "30000000-0000-4000-8000-000000000001",
        inicio: "2026-10-21T13:00:00Z",
        fim: "2026-10-21T14:00:00Z",
      },
    };
    const exigir = (condicao: unknown, mensagem: string) => {
      if (!condicao) throw new Error(mensagem);
    };
    try {
      Deno.env.get = (nome: string) =>
        estado.semCredenciais && nome === "RESEND_API_KEY"
          ? undefined
          : ambiente[nome];
      Deno.serve = ((fn: unknown) => {
        estado.handler = fn as (req: Request) => Promise<Response>;
        return {};
      }) as typeof Deno.serve;
      runtime.EdgeRuntime = {
        waitUntil(tarefa) {
          estado.tarefas.push(tarefa);
        },
      };
      globalThis.fetch = async (input, init) => {
        const url = new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        const nome = url.pathname.split("/").at(-1)!;
        estado.chamadas.push(nome);
        const corpo = init?.body ? JSON.parse(String(init.body)) : null;
        if (url.origin === "https://supabase.test") {
          if (nome === "configuracoes")
            return Response.json({
              valor: { nome: "Instituto Teste", cor: "#0f766e", logo_url: "" },
            });
          if (nome === "reclamar_notificacoes")
            return Response.json([
              { ...linha, mensagem_email: estado.snapshot ?? null },
            ]);
          if (nome === "preparar_entrega_notificacao") {
            estado.snapshot ??= corpo.p_mensagem;
            return Response.json(estado.snapshot);
          }
          if (
            ["registrar_entrega_notificacao", "concluir_notificacao"].includes(
              nome,
            )
          )
            return Response.json(null);
        }
        if (url.origin === "https://api.resend.com" && nome === "emails") {
          estado.entregas++;
          exigir(
            corpo.html === estado.snapshot?.html,
            "O envio deve usar o snapshot persistido.",
          );
          exigir(
            new Headers(init?.headers)
              .get("Idempotency-Key")
              ?.startsWith("notificacao-"),
            "Falta chave idempotente.",
          );
          return Response.json({ id: "resend-fixture-runtime" });
        }
        throw new Error(
          `Chamada de rede não simulada: ${url.origin}${url.pathname}`,
        );
      };
      await import("./index.ts");
      exigir(estado.handler, "Entrypoint não registrou handler.");
      const request = (corpo = "{}", autorizado = true) =>
        new Request(
          "https://supabase.test/functions/v1/processar-notificacoes",
          {
            method: "POST",
            headers: autorizado ? { "x-worker-secret": segredo } : {},
            body: corpo,
          },
        );
      await t.step(
        "rejeita segredo inválido e corpo adicional antes de consultar banco",
        async () => {
          exigir(
            (await estado.handler!(request("{}", false))).status === 401,
            "Esperava 401.",
          );
          exigir(
            (await estado.handler!(request('{"extra":true}'))).status === 400,
            "Esperava corpo estrito.",
          );
          exigir(
            estado.chamadas.length === 0,
            "Requisição rejeitada acessou banco.",
          );
        },
      );
      await t.step("sem credenciais falha antes do claim", async () => {
        estado.semCredenciais = true;
        exigir(
          (await estado.handler!(request())).status === 503,
          "Sem credenciais deve falhar.",
        );
        exigir(
          estado.chamadas.length === 0,
          "Sem credenciais não deve reclamar fila.",
        );
        estado.semCredenciais = false;
      });
      await t.step(
        "processa lote em background pela API Resend simulada",
        async () => {
          exigir(
            (await estado.handler!(request())).status === 202,
            "Esperava aceite assíncrono.",
          );
          await Promise.all(estado.tarefas);
          exigir(estado.entregas === 1, "Esperava uma entrega simulada.");
          exigir(
            JSON.stringify(estado.chamadas) ===
              JSON.stringify([
                "configuracoes",
                "reclamar_notificacoes",
                "preparar_entrega_notificacao",
                "emails",
                "registrar_entrega_notificacao",
                "concluir_notificacao",
              ]),
            "Ordem incorreta do protocolo da fila.",
          );
        },
      );
      await t.step(
        "provedor já registrado conclui sem novo envio",
        async () => {
          estado.chamadas = [];
          estado.tarefas = [];
          linha.provedor_id = "resend-fixture-runtime";
          exigir(
            (await estado.handler!(request())).status === 202,
            "Esperava aceite.",
          );
          await Promise.all(estado.tarefas);
          exigir(estado.entregas === 1, "Reconciliação duplicou envio.");
          exigir(
            estado.chamadas.includes("concluir_notificacao") &&
              !estado.chamadas.includes("emails"),
            "Deveria apenas concluir.",
          );
        },
      );
    } finally {
      Deno.serve = originalServe;
      Deno.env.get = originalEnv;
      globalThis.fetch = originalFetch;
      runtime.EdgeRuntime = originalRuntime;
    }
  },
);
