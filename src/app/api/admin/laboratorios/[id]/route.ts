import { getCurrentUser } from "@/lib/auth";
import { getLaboratorioEdicao } from "@/lib/data";
import { uuidSchema } from "@/lib/schemas";

const headers = { "Cache-Control": "private, no-store" };

function erro(mensagem: string, status: number) {
  return Response.json({ error: mensagem }, { status, headers });
}

export async function GET(
  _request: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const usuario = await getCurrentUser({ sensitive: true });
  if (!usuario) return erro("Autenticação necessária.", 401);
  if (!usuario.roles.includes("admin"))
    return erro("Acesso não autorizado.", 403);
  const id = uuidSchema.safeParse((await contexto.params).id);
  if (!id.success) return erro("Identificador de laboratório inválido.", 400);

  const resultado = await getLaboratorioEdicao(id.data.toLowerCase());
  if ("status" in resultado) return erro(resultado.mensagem, resultado.status);
  return Response.json(resultado.dados, { headers });
}
