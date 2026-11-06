import { BloqueiosPage } from "@/components/gestao/bloqueios-page";
import type { PropsPaginaGestao } from "@/components/gestao/contexto";

export default function BloqueiosMonitor(props: PropsPaginaGestao) {
  return <BloqueiosPage {...props} espaco="monitor" />;
}
