import { ReservaDetalhe } from "@/components/reserva-detalhe";

export default function AdminReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ReservaDetalhe params={params} administrativo />;
}
