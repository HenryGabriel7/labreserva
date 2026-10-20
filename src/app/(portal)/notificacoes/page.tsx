import { PageHeading } from "@/components/shared";
import { getContexto, getNotificacoes } from "@/lib/data";
import { NotificacoesClient } from "./notificacoes-client";
import "../pessoas.css";

export default async function NotificacoesPage() {
  const [{ demonstracao }, notificacoes] = await Promise.all([
    getContexto(),
    getNotificacoes(),
  ]);
  return (
    <>
      <PageHeading
        titulo="Você está por dentro"
        descricao="Decisões, lembretes e avisos importantes reunidos em um só lugar."
      />
      <NotificacoesClient
        notificacoes={notificacoes}
        demonstracao={demonstracao}
      />
    </>
  );
}
