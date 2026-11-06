import { BloqueiosPage } from "@/components/gestao/bloqueios-page";
import type { PropsPaginaGestao } from "@/components/gestao/contexto";

export default function BloqueiosAdmin(props: PropsPaginaGestao) {
  return <BloqueiosPage {...props} espaco="admin" />;
}
