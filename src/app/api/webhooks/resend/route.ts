import { Resend } from "resend";
import { z } from "@/lib/validacao";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cabecalhosPrivados,
  limitarEndpoint,
} from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
const headersSchema = z
  .object({
    id: z.string().min(1).max(200),
    timestamp: z.string().regex(/^\d{1,15}$/),
    signature: z.string().min(1).max(2000),
  })
  .strict();
const eventoSchema = z
  .object({
    type: z.enum(["email.bounced", "email.complained"]),
    created_at: z.iso.datetime({ offset: true }),
    data: z
      .object({
        email_id: z.string().min(1).max(200),
        to: z.array(z.email()).min(1).max(50),
        created_at: z.iso.datetime({ offset: true }).optional(),
        from: z.string().max(500).optional(),
        subject: z.string().max(1000).optional(),
        message_id: z.string().max(500).optional(),
        broadcast_id: z.string().max(200).optional(),
        template_id: z.string().max(200).optional(),
        tags: z.record(z.string(), z.string()).optional(),
        bounce: z
          .object({
            message: z.string().max(10000),
            subType: z.string().max(200),
            type: z.string().max(200),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
const resposta = (status: number, mensagem: string) =>
  Response.json({ mensagem }, { status, headers: cabecalhosPrivados });

export async function POST(request: Request) {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return resposta(503, "Serviço indisponível.");
    if (!(await limitarEndpoint(request, "resend")))
      return resposta(429, "Tente novamente mais tarde.");
    const cabecalhos = headersSchema.safeParse({
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    });
    if (
      !cabecalhos.success ||
      Number(request.headers.get("content-length") ?? 0) > 262144
    )
      return resposta(400, "Webhook inválido.");
    const payload = await request.text(); // Nunca request.json(): a assinatura depende do corpo bruto.
    if (new TextEncoder().encode(payload).length > 262144)
      return resposta(413, "Webhook inválido.");
    let verificado: ReturnType<Resend["webhooks"]["verify"]>;
    try {
      verificado = new Resend(
        process.env.RESEND_API_KEY ?? "verificacao-local",
      ).webhooks.verify({
        payload,
        headers: cabecalhos.data,
        webhookSecret: secret,
      });
    } catch {
      return resposta(400, "Webhook inválido.");
    }
    if (!["email.bounced", "email.complained"].includes(verificado.type))
      return resposta(200, "Evento recebido.");
    const evento = eventoSchema.safeParse(verificado);
    if (!evento.success) return resposta(400, "Webhook inválido.");
    const admin = createAdminClient();
    for (const email of evento.data.data.to) {
      const { error } = await admin.rpc("registrar_webhook_notificacao", {
        p_provedor_id: evento.data.data.email_id,
        p_email: email.toLowerCase(),
        p_evento: evento.data.type,
        p_chave_idempotencia: `${cabecalhos.data.id}:${email.toLowerCase()}`,
      });
      if (error) return resposta(503, "Serviço indisponível.");
    }
    return resposta(200, "Evento recebido.");
  } catch {
    console.error("Falha no processamento do webhook de e-mail.");
    return resposta(503, "Serviço indisponível.");
  }
}
