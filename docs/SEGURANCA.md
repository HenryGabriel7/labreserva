# Segurança e operação

## Provisionamento obrigatório

- Supabase Auth: desabilitar novos cadastros (`enable_signup=false` em config.toml; painel Authentication → configuração de signups). Confirmar que POST /auth/v1/signup com chave pública falha pelo teste de integração.
- Senhas: mínimo 12 caracteres, requisitos lower/upper/digits/symbols no Supabase Auth (painel e configuração local). Ativar proteção de senhas vazadas quando disponível no plano. A validação do formulário é complementar.
- URL de produção HTTPS em APP_URL e redirect allowlist restrita. Cookies Secure em produção, SameSite=Lax; não forçar HttpOnly no cliente SSR Supabase.
- Não há cadastro público nem envio pelo SMTP padrão. Apenas admin autenticado cria convites; recuperação tem resposta indistinta.
- Configurar Vault/cron, secrets da Edge e DNS do Resend conforme EMAIL.md.

## Autorização e dados

Todos os handlers/action revalidam identidade. Revogação é conferida por getUser em decisões/admin. RLS consulta ativo e papéis de banco, nunca metadados mutáveis. Admin também perde acesso quando desativado. Auditoria não oferece UPDATE/DELETE e captura decisões, exceções à prioridade, alterações administrativas e exportações. Evitar incluir senhas/tokens em logs, capturas ou auditoria.

Bucket ocorrencias privado; tipos JPEG, PNG e WebP detectados pelo conteúdo; máximo 5MB e 5 anexos; nomes gerados no servidor, caminhos por lab/reserva e URLs assinadas por até 60 segundos. Restringir políticas Storage ao vínculo monitor↔lab ou admin.

## LGPD e retenção

Coletar nome, email, matrícula institucional e dados estritamente necessários à reserva. Exportação individual JSON e anonimização preservam IDs e histórico operacional. Retenção operacional adotada: reservas/ocorrências por 24 meses após encerramento, auditoria por 60 meses, logs técnicos sanitizados por 30 dias e outbox enviada por 90 dias. A instituição deve confirmar essas durações com o encarregado antes de produção; não há exclusão automática de evidências sem política aprovada. Aplicar processo de revisão mensal e anonimização quando cessar a finalidade. Não armazenar dados sensíveis em finalidade/observações.

## Limites de verificação

Testes offline não demonstram RLS, concorrência, revogação real, entrega de email nem acessibilidade em navegador. Executar os comandos de integração do README com Supabase local antes de liberar o sistema para usuários reais. Nada neste documento substitui a execução desses testes.
