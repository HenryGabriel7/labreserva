import { OcorrenciasPage } from "@/components/gestao/ocorrencias-page";
import type { PropsPaginaGestao } from "@/components/gestao/contexto";

export default function OcorrenciasMonitor(props: PropsPaginaGestao) {
  return <OcorrenciasPage {...props} espaco="monitor" />;
}
