import { Shell } from "@/components/shell";
import { getContexto, getNotificacoes } from "@/lib/data";
import { resumirNotificacoes } from "@/lib/notificacoes/resumo";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { demonstracao, usuario } = await getContexto();
  const resultadoNotificacoes = await getNotificacoes()
    .then((notificacoes) => ({ notificacoes, indisponiveis: false }))
    .catch(() => ({ notificacoes: [], indisponiveis: true }));
  return (
    <Shell
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
