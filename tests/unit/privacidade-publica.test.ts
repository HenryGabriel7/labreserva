import { describe, expect, it } from "vitest";
import { lerPrivacidadePublica } from "@/lib/privacidade-publica";

describe("configuração pública de privacidade", () => {
  it("gera o link de contato e usa apenas os prazos configurados", () => {
    expect(
      lerPrivacidadePublica(
        " dados+privacidade@instituicao.example ",
        " Prazo fictício de homologação. ",
      ),
    ).toEqual({
      contato: {
        email: "dados+privacidade@instituicao.example",
        href: "mailto:dados%2Bprivacidade@instituicao.example",
      },
      retencao: "Prazo fictício de homologação.",
    });
  });

  it("trata configuração ausente ou e-mail inválido como pendente", () => {
    const pendente = { contato: null, retencao: null };
    expect(lerPrivacidadePublica(undefined, undefined)).toEqual(pendente);
    expect(lerPrivacidadePublica("javascript:alert(1)", "   ")).toEqual(
      pendente,
    );
    expect(
      lerPrivacidadePublica("dados@instituicao.example?bcc=x", undefined),
    ).toEqual(pendente);
  });
});
