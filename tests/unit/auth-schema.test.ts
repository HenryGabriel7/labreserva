import { describe, expect, it } from "vitest";
import {
  alterarUsuarioSchema,
  conviteSchema,
  definirSenhaSchema,
  lerCsvUsuarios,
  loginSchema,
  preferenciasNotificacaoSchema,
  senhaForteSchema,
} from "@/lib/auth-schema";

describe("entradas de autenticação", () => {
  it("normaliza e-mail e recusa campos extras", () => {
    expect(
      loginSchema.parse({ email: "  ALUNO@EXEMPLO.EDU.BR ", senha: "segredo" })
        .email,
    ).toBe("aluno@exemplo.edu.br");
    expect(
      loginSchema.safeParse({
        email: "aluno@exemplo.edu.br",
        senha: "segredo",
        papel: "admin",
      }).success,
    ).toBe(false);
  });
  it("exige senha longa com os quatro grupos e confirmação igual", () => {
    for (const senha of [
      "Aa1!curta",
      "longamasnosegura123!",
      "LONGAMASNOCAPS123!",
      "SenhaSemNumero!",
      "SenhaSemSimbolo123",
    ])
      expect(senhaForteSchema.safeParse(senha).success).toBe(false);
    expect(
      definirSenhaSchema.safeParse({
        senha: "MinhaSenhaLonga1!",
        confirmarSenha: "OutraSenhaLonga2!",
      }).success,
    ).toBe(false);
    expect(
      definirSenhaSchema.safeParse({
        senha: "MinhaSenhaLonga1!",
        confirmarSenha: "MinhaSenhaLonga1!",
      }).success,
    ).toBe(true);
  });
  it("exige exatamente um papel e valida UUIDs de vínculos", () => {
    const convite = {
      nome: "Pessoa Exemplo",
      email: "pessoa@exemplo.edu.br",
      papeis: ["aluno"],
    };
    expect(conviteSchema.safeParse(convite).success).toBe(true);
    expect(
      conviteSchema.safeParse({ ...convite, nome: "A".repeat(151) }).success,
    ).toBe(false);
    expect(
      conviteSchema.safeParse({ ...convite, papeis: ["aluno", "monitor"] })
        .success,
    ).toBe(false);
    expect(conviteSchema.safeParse({ ...convite, papeis: [] }).success).toBe(
      false,
    );
    expect(
      alterarUsuarioSchema.safeParse({
        id: "93000000-0000-4000-8000-000000000001",
        nome: "Pessoa",
        ativo: true,
        papeis: ["aluno", "monitor"],
      }).success,
    ).toBe(false);
    expect(
      conviteSchema.safeParse({ ...convite, papeis: ["admin", "admin"] })
        .success,
    ).toBe(false);
    expect(
      conviteSchema.safeParse({ ...convite, papeis: ["superadmin"] }).success,
    ).toBe(false);
    expect(
      alterarUsuarioSchema.safeParse({
        id: "outro-usuario",
        nome: "Pessoa",
        ativo: true,
        papeis: ["aluno"],
        laboratorioIds: [],
      }).success,
    ).toBe(false);
    expect(
      preferenciasNotificacaoSchema.safeParse({
        lembretes: false,
        outros: true,
        essencial: false,
      }).success,
    ).toBe(false);
  });
});

describe("CSV de convites", () => {
  const cabecalho = "nome,email,matricula,papeis\n";
  it("aceita aspas e vírgulas com um único papel", () => {
    const usuarios = lerCsvUsuarios(
      `${cabecalho}\"Maria, Silva\",maria@exemplo.edu.br,123,monitor\n`,
    );
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0].nome).toBe("Maria, Silva");
    expect(usuarios[0].papeis).toEqual(["monitor"]);
    expect(() =>
      lerCsvUsuarios(
        `${cabecalho}Maria Silva,maria@exemplo.edu.br,123,aluno|monitor`,
      ),
    ).toThrow("somente um papel");
  });
  it("valida tudo antes de produzir convites", () => {
    expect(() =>
      lerCsvUsuarios(
        `${cabecalho}Ana Lima,ana@exemplo.edu.br,1,aluno\nBruno Lima,sem-email,2,admin`,
      ),
    ).toThrow("Linha 3");
    expect(() =>
      lerCsvUsuarios(
        `${cabecalho}Ana Lima,ana@exemplo.edu.br,1,aluno\nAna Lima,ANA@exemplo.edu.br,2,aluno`,
      ),
    ).toThrow("e-mail repetido");
    expect(() =>
      lerCsvUsuarios(`${cabecalho}Nome,mail@exemplo.edu.br,1,admin,extra`),
    ).toThrow();
    expect(() =>
      lerCsvUsuarios("nome,email,papeis\nPessoa,pessoa@exemplo.edu.br,aluno"),
    ).toThrow();
    expect(() =>
      lerCsvUsuarios(
        `${cabecalho}\"Aspa incompleta,mail@exemplo.edu.br,1,aluno`,
      ),
    ).toThrow();
  });
  it("limita o lote a 100 identidades", () => {
    expect(() =>
      lerCsvUsuarios(
        cabecalho +
          Array.from(
            { length: 101 },
            (_, indice) =>
              `Pessoa ${indice},p${indice}@exemplo.edu.br,${indice},aluno`,
          ).join("\n"),
      ),
    ).toThrow("100 usuários");
  });
});
