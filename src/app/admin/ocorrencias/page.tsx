import { OcorrenciasPage } from "@/components/gestao/ocorrencias-page";
import type { PropsPaginaGestao } from "@/components/gestao/contexto";

export default function OcorrenciasAdmin(props: PropsPaginaGestao) {
  return <OcorrenciasPage {...props} espaco="admin" />;
}
