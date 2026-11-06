import { SolicitacoesPage } from "@/components/gestao/solicitacoes-page";
import type { PropsPaginaGestao } from "@/components/gestao/contexto";

export default function Monitor(props: PropsPaginaGestao) {
  return <SolicitacoesPage {...props} espaco="monitor" />;
}
