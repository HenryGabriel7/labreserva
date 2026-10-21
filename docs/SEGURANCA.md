# Segurança e operação

## Provisionamento obrigatório

- Supabase Auth: desabilitar novos cadastros (`enable_signup=false` em config.toml; painel Authentication → configuração de signups). Confirmar que POST /auth/v1/signup com chave pública falha pelo teste de integração.
- Senhas: mínimo 12 caracteres, requisitos lower/upper/digits/symbols no Supabase Auth (painel e configuração local). Ativar proteção de senhas vazadas quando disponível no plano. A validação do formulário é complementar.
- URL de produção HTTPS em APP_URL e redirect allowlist restrita. Cookies Secure em produção, SameSite=Lax; não forçar HttpOnly no cliente SSR Supabase.
- Não há cadastro público nem envio pelo SMTP padrão. Apenas admin autenticado cria convites; recuperação tem resposta indistinta.
- Configurar Vault/cron, secrets da Edge e DNS do Resend conforme EMAIL.md.

## Autorização e dados

Todos os handlers/action revalidam identidade. Revogação é conferida por getUser em decisões/admin. RLS consulta ativo e papéis de banco, nunca metadados mutáveis. Também verifica session_id em auth.sessions, para o mesmo usuário e respeitando not_after. Após a remoção da sessão, novas transações de leitura/RPC recusam o JWT antigo mesmo antes de sua expiração; transações já iniciadas podem concluir com o snapshot MVCC. Não há SELECT de auth.sessions nem EXECUTE do helper para o cliente. Admin também perde acesso quando desativado.

Auditoria não oferece UPDATE/DELETE e captura decisões, exceções à prioridade, alterações administrativas e exportações. IP e user-agent são sanitizados quando disponíveis. O proxy reverso deve sobrescrever cabeçalhos de IP; valores livremente enviados pelo cliente não comprovam origem. Limites por conta/email independem desse IP. Evitar senhas, tokens, cookies e chaves em logs, capturas ou auditoria.

O primeiro administrador usa a CLI operacional e a RPC service-only inicializar_administrador. Um lock global e a existência de qualquer papel admin, inclusive inativo, impedem reabrir o bootstrap. O CLI não imprime links ou tokens e limita tentativas por email antes de generateLink. Depois, provisionar_usuario exige um ator administrador autenticado. Falhas após criar identidade Auth podem deixá-la sem perfil/papéis e sem acesso, sem apagar histórico.

Eventos/templates de autenticação são ocultos por RLS da linha inteira em notificacoes e no RPC de marcar lidas. Isso protege payload, chave idempotente e snapshot renderizado: um hashed_token é credencial bearer. Filtrar apenas no React não protegeria o acesso REST direto.

Scripts de produção usam CSP com nonce por resposta, renderização dinâmica e sem unsafe-inline/unsafe-eval em script-src. style-src permite atributos e estilos inline dos componentes. Há HSTS, X-Content-Type-Options, frame-ancestors, Referrer-Policy e Permissions-Policy. Server Actions usam Origin nativo; handlers de mutação comparam APP_URL. Webhook usa assinatura Resend/corpo bruto. One-Click sem Origin exige token HMAC e corpo restrito RFC 8058.

Bucket ocorrencias privado; tipos JPEG, PNG e WebP detectados pelo conteúdo binário; máximo 5 MiB por arquivo e 5 anexos; nomes UUID gerados no servidor, caminhos por lab/reserva e URLs assinadas por até 60 segundos. O corpo também é limitado durante a leitura. Não há INSERT de Storage para o cliente autenticado, para evitar bypass da detecção; o servidor autoriza antes de usar o serviço e a RPC confere paths e objetos existentes. Políticas de leitura respeitam vínculo monitor↔lab ou admin. Falhas tentam limpar os uploads sem registro.

Preferências aceitam somente lembretes/outros booleanos. Rate limit pré-login é service-only. A solicitação consome o limite do endpoint em uma chamada separada antes da RPC, pois erros transacionais reverteriam o contador interno. CSV neutraliza fórmulas e exportações exigem autorização e auditoria.

## LGPD e retenção

Coletar nome, email, matrícula institucional e dados estritamente necessários à reserva. Exportação individual JSON e anonimização preservam IDs e histórico operacional; a anonimização administrativa desativa a conta e não apaga identidades. Política de referência: reservas/ocorrências por 24 meses após encerramento, auditoria por 60 meses, logs técnicos sanitizados por 30 dias e outbox enviada por 90 dias. Esses prazos são uma decisão operacional a confirmar com o encarregado antes de produção, não um job automático de exclusão já implementado. Confirmar também o contato institucional em /privacidade. Aplicar revisão periódica e anonimização quando cessar a finalidade, preservando obrigações de conservação. Não armazenar dados sensíveis em finalidade/observações.

## Limites de verificação

Unitários e PostgreSQL WASM exercitam regras, RLS e RPCs com adaptadores, mas não comprovam GoTrue, PostgREST, Storage nativo, revogação pelo Auth real, concorrência HTTP, entrega de email ou cron. Executar os comandos de integração do README com Supabase local e validar a entrega em homologação antes de liberar usuários reais. Resultados reais de navegador/axe e limites desta execução estão em TESTES.md e PROGRESSO.md; nenhuma descrição substitui esses testes.
