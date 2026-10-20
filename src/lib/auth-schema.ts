import { z } from "zod";
import Papa from "papaparse";
import { papeis } from "@/lib/types";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Informe um e-mail válido.")
  .max(254);
export const senhaForteSchema = z
  .string()
  .min(12, "Use pelo menos 12 caracteres.")
  .max(128, "Use até 128 caracteres.")
  .regex(/[a-z]/, "Inclua uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua um número.")
  .regex(/[^a-zA-Z0-9]/, "Inclua um símbolo.");
export const loginSchema = z
  .object({
    email: emailSchema,
    senha: z.string().min(1, "Informe sua senha.").max(128),
  })
  .strict();
export const recuperarSenhaSchema = z.object({ email: emailSchema }).strict();
export const definirSenhaSchema = z
  .object({ senha: senhaForteSchema, confirmarSenha: z.string().max(128) })
  .strict()
  .refine((dados) => dados.senha === dados.confirmarSenha, {
    message: "As senhas devem ser iguais.",
    path: ["confirmarSenha"],
  });
const papeisSchema = z
  .array(z.enum(papeis))
  .min(1, "Selecione um papel.")
  .max(5)
  .refine(
    (valores) => new Set(valores).size === valores.length,
    "Papéis repetidos.",
  );
export const conviteSchema = z
  .object({
    nome: z.string().trim().min(2).max(160),
    email: emailSchema,
    matricula: z.string().trim().max(80).nullable().optional(),
    papeis: papeisSchema,
  })
  .strict();
export const importarUsuariosSchema = z
  .object({ csv: z.string().min(1).max(131072) })
  .strict();
export const alterarUsuarioSchema = z
  .object({
    id: z.uuid(),
    nome: z.string().trim().min(2).max(160),
    matricula: z.string().trim().max(80).nullable().optional(),
    ativo: z.boolean(),
    papeis: papeisSchema,
    laboratorioIds: z
      .array(z.uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length)
      .default([]),
  })
  .strict();
export const preferenciasNotificacaoSchema = z
  .object({ lembretes: z.boolean(), outros: z.boolean() })
  .strict();
export const paginacaoUsuariosSchema = z
  .object({ pagina: z.coerce.number().int().min(1).max(10000).default(1) })
  .strict();
export type ConviteUsuario = z.infer<typeof conviteSchema>;
export type EstadoAuth = { error?: string; success?: string };

/** CSV de entrada limitado, com aspas RFC 4180 e validação de todas as linhas antes de convidar. */
export function lerCsvUsuarios(csv: string): ConviteUsuario[] {
  importarUsuariosSchema.parse({ csv });
  const resultado = Papa.parse<Record<string, string>>(
    csv.replace(/^\uFEFF/, ""),
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (cabecalho) => cabecalho.trim(),
      delimitersToGuess: [",", ";"],
    },
  );
  const campos = resultado.meta.fields ?? [];
  if (
    resultado.errors.length ||
    campos.length !== 4 ||
    !["nome", "email", "matricula", "papeis"].every((campo) =>
      campos.includes(campo),
    )
  )
    throw new Error(
      "Use o cabeçalho nome,email,matricula,papeis e um CSV válido.",
    );
  if (resultado.data.length < 1 || resultado.data.length > 100)
    throw new Error("O arquivo deve conter entre 1 e 100 usuários.");
  const emails = new Set<string>();
  return resultado.data.map((linha, indice) => {
    const dados = conviteSchema.safeParse({
      nome: linha.nome,
      email: linha.email,
      matricula: linha.matricula,
      papeis: linha.papeis?.split("|").map((papel) => papel.trim()),
    });
    if (!dados.success)
      throw new Error(`Linha ${indice + 2}: confira nome, e-mail e papéis.`);
    if (emails.has(dados.data.email))
      throw new Error(`Linha ${indice + 2}: e-mail repetido no arquivo.`);
    emails.add(dados.data.email);
    return dados.data;
  });
}
