import { redirect } from "next/navigation";
import { z } from "@/lib/validacao";
import { PageHeading, Pagination } from "@/components/shared";
import { getContexto, getLaboratorios } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { paginacaoUsuariosSchema } from "@/lib/auth-schema";
import { UsuariosClient, type UsuarioLista } from "./usuarios-client";
import "@/app/(portal)/pessoas.css";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { demonstracao } = await getContexto();
  if (!demonstracao) await requireUser(["admin"], { sensitive: true });
  const parametros = paginacaoUsuariosSchema.safeParse(await searchParams);
  if (!parametros.success) redirect("/admin/usuarios");
  const pagina = parametros.data.pagina;
  const laboratorios = await getLaboratorios();
  let total = 0;
  let usuarios: UsuarioLista[] = [];
  if (demonstracao) {
    usuarios = [
      {
        id: "demo-aluno",
        nome: "Ana Carolina Silva",
        email: "ana.silva@instituicao.edu.br",
        matricula: "202601024",
        ativo: true,
        papeis: ["aluno"],
        laboratorioIds: [],
      },
      {
        id: "demo-professor",
        nome: "Ricardo Almeida",
        email: "ricardo.almeida@instituicao.edu.br",
        matricula: "DOC1042",
        ativo: true,
        papeis: ["professor"],
        laboratorioIds: [],
      },
      {
        id: "demo-monitor",
        nome: "Mariana Costa",
        email: "mariana.costa@instituicao.edu.br",
        matricula: "202400183",
        ativo: true,
        papeis: ["monitor"],
        laboratorioIds: [laboratorios[0]?.id].filter(
          (id): id is string => !!id,
        ),
      },
      {
        id: "demo-funcionario",
        nome: "Paulo Santos",
        email: "paulo.santos@instituicao.edu.br",
        matricula: "TEC0318",
        ativo: false,
        papeis: ["funcionario"],
        laboratorioIds: [],
      },
    ];
    total = usuarios.length;
  } else {
    const db = await createClient();
    const perfis = await db
      .from("profiles")
      .select("id,nome,email,matricula,ativo", { count: "exact" })
      .order("nome")
      .range((pagina - 1) * 20, pagina * 20 - 1);
    if (perfis.error) throw new Error("Não foi possível carregar os usuários.");
    const ids = (perfis.data ?? []).map((perfil) => perfil.id as string);
    const [roles, vinculos] = ids.length
      ? await Promise.all([
          db.from("user_roles").select("user_id,papel").in("user_id", ids),
          db
            .from("monitor_laboratorios")
            .select("monitor_id,laboratorio_id")
            .in("monitor_id", ids),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (roles.error || vinculos.error)
      throw new Error("Não foi possível carregar os vínculos dos usuários.");
    usuarios = (perfis.data ?? []).map((perfil) => ({
      ...perfil,
      papeis: (roles.data ?? [])
        .filter((role) => role.user_id === perfil.id)
        .map((role) =>
          z
            .enum(["aluno", "professor", "funcionario", "monitor", "admin"])
            .parse(role.papel),
        ),
      laboratorioIds: (vinculos.data ?? [])
        .filter((vinculo) => vinculo.monitor_id === perfil.id)
        .map((vinculo) => vinculo.laboratorio_id as string),
    })) as UsuarioLista[];
    total = perfis.count ?? 0;
  }
  return (
    <>
      <PageHeading
        titulo="Pessoas que fazem acontecer"
        descricao="Gerencie acessos, papéis e vínculos da sua comunidade acadêmica."
      />
      <UsuariosClient
        usuarios={usuarios}
        laboratorios={laboratorios.map((lab) => ({
          id: lab.id,
          nome: lab.nome,
        }))}
        demonstracao={demonstracao}
      />
      <Pagination pagina={pagina} total={total} base="/admin/usuarios" />
    </>
  );
}
