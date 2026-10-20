import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  envelopeSchema,
  identidadePadrao,
  identidadeSchema,
  notificacaoSchema,
  origemAplicacao,
  prepararMensagem,
  ResendNotificationProvider,
  segredoWorkerValido,
} from "../_shared/notificacoes.tsx";

declare const EdgeRuntime: { waitUntil(tarefa: Promise<unknown>): void };
const corpoSchema = z.object({}).strict();
const pausa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const segredo = Deno.env.get("NOTIFICATION_WORKER_SECRET") ?? "";
  if (
    !(await segredoWorkerValido(
      request.headers.get("x-worker-secret"),
      segredo,
    ))
  )
    return new Response(null, { status: 401 });
  try {
    const valores = z
      .object({
        supabaseUrl: z.url(),
        serviceRole: z.string().min(1),
        resendKey: z.string().min(1),
        remetente: z.string().min(1),
        appUrl: z.url(),
        segredoDescadastro: z.string().min(32),
      })
      .strict()
      .parse({
        supabaseUrl: Deno.env.get("SUPABASE_URL"),
        serviceRole: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        resendKey: Deno.env.get("RESEND_API_KEY"),
        remetente: Deno.env.get("RESEND_FROM"),
        appUrl: Deno.env.get("APP_URL"),
        segredoDescadastro: Deno.env.get("NOTIFICATION_UNSUBSCRIBE_SECRET"),
      });
    origemAplicacao(valores.appUrl);
    if (Number(request.headers.get("content-length") ?? 0) > 1024)
      return new Response(null, { status: 413 });
    const corpo = await request.text();
    if (
      corpo.length > 1024 ||
      !corpoSchema.safeParse(JSON.parse(corpo)).success
    )
      return new Response(null, { status: 400 });
    const supabase = createClient(valores.supabaseUrl, valores.serviceRole, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { data: config, error: configErro } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "identidade_visual")
      .single();
    if (configErro) throw new Error("CONFIGURACAO_INDISPONIVEL");
    const visual = identidadeSchema.safeParse(config?.valor);
    const identidade = visual.success ? visual.data : identidadePadrao;
    const { data: lote, error: erroClaim } = await supabase.rpc(
      "reclamar_notificacoes",
      { p_limite: 25 },
    );
    if (erroClaim) throw new Error("FILA_INDISPONIVEL");
    const processar = async () => {
      for (const linha of lote ?? []) {
        let aceitaPeloProvedor = false;
        try {
          if (linha.provedor_id) {
            aceitaPeloProvedor = true;
            const { error } = await supabase.rpc("concluir_notificacao", {
              p_id: linha.id,
              p_sucesso: true,
              p_erro: null,
            });
            if (error) throw new Error("CONCLUSAO_INDISPONIVEL");
            continue;
          }
          if (
            linha.mensagem_preparada_em &&
            Date.now() - new Date(linha.mensagem_preparada_em).getTime() >=
              23 * 3600000
          ) {
            const { error } = await supabase.rpc(
              "marcar_reconciliacao_notificacao",
              { p_id: linha.id },
            );
            if (error) throw new Error("RECONCILIACAO_INDISPONIVEL");
            continue;
          }
          // A RPC devolve a linha completa; validamos estritamente os campos usados.
          const notificacao = notificacaoSchema.parse({
            id: linha.id,
            usuario_id: linha.usuario_id,
            tipo_evento: linha.tipo_evento,
            template: linha.template,
            payload: linha.payload,
            destinatario_email: linha.destinatario_email,
            essencial: linha.essencial,
            chave_idempotencia: linha.chave_idempotencia,
          });
          if (
            !linha.mensagem_email &&
            notificacao.template === "reserva_substituida"
          ) {
            const { data: livres, error } = await supabase.rpc(
              "sugerir_horarios_notificacao",
              { p_id: notificacao.id },
            );
            if (error) throw new Error("SUGESTOES_INDISPONIVEIS");
            notificacao.payload.horarios_livres = z
              .array(z.string().max(200))
              .max(3)
              .parse(livres);
          }
          let envelope = linha.mensagem_email;
          if (!envelope) {
            const mensagem = await prepararMensagem(
              notificacao,
              valores.appUrl,
              identidade,
              valores.segredoDescadastro,
            );
            const persistencia = await supabase.rpc(
              "preparar_entrega_notificacao",
              {
                p_id: notificacao.id,
                p_mensagem: { ...mensagem, remetente: valores.remetente },
              },
            );
            if (persistencia.error) throw new Error("SNAPSHOT_INDISPONIVEL");
            envelope = persistencia.data;
          }
          const { remetente, ...mensagem } = envelopeSchema.parse(envelope);
          const entrega = await new ResendNotificationProvider(
            valores.resendKey,
            remetente,
          ).enviar(mensagem);
          aceitaPeloProvedor = true;
          const registro = await supabase.rpc("registrar_entrega_notificacao", {
            p_id: notificacao.id,
            p_provedor_id: entrega.id,
          });
          if (registro.error) throw new Error("REGISTRO_ENTREGA_INDISPONIVEL");
          const conclusao = await supabase.rpc("concluir_notificacao", {
            p_id: notificacao.id,
            p_sucesso: true,
            p_erro: null,
          });
          if (conclusao.error) throw new Error("CONCLUSAO_INDISPONIVEL");
        } catch (error) {
          // Se o provedor já aceitou, preserve o lease: o reaper tentará novamente
          // com a MESMA chave Resend. Não rotule aceitação como falha de envio.
          if (!aceitaPeloProvedor) {
            const codigo =
              error instanceof z.ZodError
                ? "payload_invalido"
                : error instanceof Error &&
                    /^[A-Za-z_]{1,100}$/.test(error.message)
                  ? error.message
                  : "falha_provedor";
            const conclusao = await supabase.rpc("concluir_notificacao", {
              p_id: linha.id,
              p_sucesso: false,
              p_erro: codigo,
            });
            if (conclusao.error)
              console.error("Falha ao registrar tentativa de e-mail.");
          } else
            console.error(
              "Entrega aceita pelo provedor requer reconciliação da fila.",
            );
        }
        // Limita este worker a menos de duas chamadas por segundo (plano padrão).
        await pausa(550);
      }
    };
    EdgeRuntime.waitUntil(
      processar().catch(() =>
        console.error(
          "Worker de e-mail interrompido; o reaper recuperará os leases.",
        ),
      ),
    );
    return Response.json({ aceitas: lote?.length ?? 0 }, { status: 202 });
  } catch (error) {
    if (error instanceof SyntaxError)
      return new Response(null, { status: 400 });
    console.error("Serviço de notificações indisponível.");
    return new Response(null, { status: 503 });
  }
});
