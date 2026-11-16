import { z } from "@/lib/validacao";

export function lerPrivacidadePublica(
  emailConfigurado: string | undefined,
  retencaoConfigurada: string | undefined,
) {
  const email = z.email().max(254).safeParse(emailConfigurado?.trim());
  const retencao = retencaoConfigurada?.trim();
  return {
    contato: email.success
      ? {
          email: email.data,
          href: `mailto:${encodeURIComponent(email.data).replace("%40", "@")}`,
        }
      : null,
    retencao: retencao || null,
  };
}
