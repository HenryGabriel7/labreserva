import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getContexto, getNotificacoes } from "@/lib/data";
import { resumirNotificacoes } from "@/lib/notificacoes/resumo";

export async function PortalShell({
  children,
  administrativo = false,
}: {
  children: React.ReactNode;
  administrativo?: boolean;
}) {
  const { demonstracao, usuario } = await getContexto();
  if (administrativo && !demonstracao && !usuario?.roles.includes("admin"))
    redirect("/acesso-negado");

  const resultadoNotificacoes = await getNotificacoes()
    .then((notificacoes) => ({ notificacoes, indisponiveis: false }))
    .catch(() => ({ notificacoes: [], indisponiveis: true }));
  return (
    <Shell
      administrativo={administrativo}
      demonstracao={demonstracao}
      nome={usuario?.nome ?? "Visitante"}
      roles={usuario?.roles ?? []}
      notificacoes={resumirNotificacoes(resultadoNotificacoes.notificacoes)}
      notificacoesIndisponiveis={resultadoNotificacoes.indisponiveis}
    >
      {children}
    </Shell>
  );
}
