import { ReservaDetalhe } from "@/components/reserva-detalhe";

export default function ReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ReservaDetalhe params={params} />;
}
