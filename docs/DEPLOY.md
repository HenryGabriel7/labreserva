# Implantação do LabReserva

Atualizado em 23/10/2026. O banco já recebeu as duas novas migrações desta rodada. O rollout do código atualizado na Vercel ainda está pendente; os resultados da publicação de 22/10 abaixo permanecem identificados como histórico.

## Rollout de 23/10 — em validação

- Banco: dez migrações aplicadas no total. As novas versões são `20261023193250_laboratorio_completo` e `20261023193257_papel_unico`, iguais aos arquivos do repositório. Não houve edição de migrações já aplicadas.
- Código: build consolidado após o último ajuste de CSS passou, lint global passou sem avisos e TypeScript passou. Os 115 testes unitários em 17 arquivos foram repetidos com sucesso. As 259 asserções SQL em WASM passaram; pgTAP nativo e integração no CI ainda aguardam execução desta versão.
- Navegador: 108 casos da demonstração passaram em Chrome, incluindo desktop e 320/360/390 px, com revisão visual das capturas. Nos cinco papéis, passaram login/navegação/RBAC, erros de duração/slot em vermelho com foco, envio real e diálogo de sucesso com os dois botões. Criar usuário, rejeitar múltiplos papéis na API/CSV e criar/editar laboratório integrado passaram. Dez verificações adicionais de decisão, cancelamento, autorização, ocorrência com foto privada/assinada, check-in/out e no-show também passaram.
- Mobile autenticado: a verificação com dados reais encontrou três overflows a 320 px (`/reservas`, `/monitor`, `/usuarios`), que a demonstração não reproduzia. As correções usam quebra de texto e ajuste da área de rolagem da tabela, sem ocultar conteúdo. O diagnóstico de 52 verificações com CSS injetado passou; a repetição definitiva nos cinco papéis sobre o build consolidado ainda está em andamento.
- Operação: o laboratório real Lab Quimica permanece sem horários presumidos; a administração configurará o funcionamento real pelo botão **Editar**. As contas e o laboratório de QA são isolados e serão desativados ao concluir, preservando histórico e dispensando seus e-mails. O encerramento ainda precisa ser confirmado.
- Publicação: o deploy desta rodada e seu smoke posterior ainda não foram confirmados. A URL existente abaixo é o destino de produção, não evidência de que já contém o código novo.

## Recursos publicados

| Recurso                       | Destino                                         |
| ----------------------------- | ----------------------------------------------- |
| Aplicação                     | https://labreserva.vercel.app                   |
| Repositório privado           | https://github.com/HenryGabriel7/labreserva     |
| Branch de produção            | `main`                                          |
| Projeto Vercel                | `labreserva`, equipe `henrygabriel7s-projects`  |
| Runtime e região das funções  | Node.js 24, `gru1` (São Paulo)                  |
| Projeto Supabase              | `labreserva`, referência `hvcetcfairwfuyxlyynl` |
| Organização e região do banco | `HenryGabriel7`, `sa-east-1`                    |
| API Supabase                  | https://hvcetcfairwfuyxlyynl.supabase.co        |

Os pushes em `main` publicam automaticamente na Vercel. `vercel.json` fixa Next.js, instalação por `npm ci`, build por `npm run build` e a região. O banco foi inicialmente criado sem seed nem senhas de desenvolvimento; o primeiro administrador foi provisionado pelo bootstrap operacional com o e-mail informado pelo proprietário. A rodada de 23/10 usa fixtures QA separadas e temporárias, descritas em [TESTES](TESTES.md), sem utilizar as contas pessoais.

## Banco e Auth

As dez migrações estão aplicadas, com versões iguais às dos arquivos do repositório: oito da implantação inicial e duas de 23/10. São 18 tabelas públicas com RLS, RPCs com autorização, dois buckets privados de 5 MiB por arquivo e dois jobs cron. O histórico permanece compatível com futuras migrações pelo CLI.

Auth permite login por e-mail, bloqueia signup público e usuários anônimos, exige senha de 12 caracteres com maiúscula, minúscula, número e símbolo e usa `https://labreserva.vercel.app` como Site URL. A allowlist de redirect contém somente `/auth/confirm` e `/definir-senha` nessa origem. Não é necessário alterar a configuração local de desenvolvimento para esses valores.

O primeiro acesso do administrador é entregue por um convite temporário no arquivo local `.env.primeiro-acesso.local.html`. Abra esse arquivo no navegador e clique em **Definir minha senha**. Não há senha padrão de produção. O arquivo contém uma credencial de uso único e é excluído do Git e do upload Vercel. Não publique nem compartilhe esse arquivo. Se o convite expirar antes da ativação, gere um novo pelo fluxo operacional autorizado; não reabra o bootstrap, não apague a conta e não defina uma senha compartilhada.

## Variáveis e segredos

Vercel Production contém `APP_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `NOTIFICATION_UNSUBSCRIBE_SECRET`. A chave de serviço e o segredo de descadastro foram cadastrados como Secret. Não foram expostos no código, no navegador ou nos logs de implantação.

O arquivo local `.env.deploy.local` contém as credenciais operacionais. `.env.worker.local` contém somente `APP_URL` e os dois segredos próprios do worker, sem sobrescrever os `SUPABASE_*` reservados da Edge. Os arquivos `.env*`, `.vercel/` e caches Supabase estão ignorados pelo Git e pelo `.vercelignore`. Não envie esses arquivos a terceiros. Apenas `.env.example`, sem valores, é versionado.

## E-mail pendente

O proprietário informou que ainda não possui Resend configurado. Nenhum e-mail foi enviado. A Edge Function `processar-notificacoes` foi publicada com autenticação pelo segredo próprio; chamadas sem ele são recusadas. A função falha antes de reclamar a fila quando faltam as credenciais do Resend. Os valores de invocação não foram cadastrados no Vault, por isso o job não faz chamadas de envio enquanto a configuração estiver incompleta.

Para ativar os e-mails:

1. Criar uma conta Resend e verificar um domínio/remetente controlado pela instituição, com o DNS descrito em [EMAIL](EMAIL.md).
2. Cadastrar `RESEND_API_KEY` e `RESEND_FROM` como secrets da Edge Function, preservando os três secrets próprios já configurados. Não publicar chaves na conversa, no repositório ou em migrações.
3. Criar no Resend o webhook `https://labreserva.vercel.app/api/webhooks/resend` para bounce/complaint. Cadastrar seu `RESEND_WEBHOOK_SECRET` e a chave Resend no servidor Vercel e fazer um novo deploy.
4. Configurar no Vault `project_url` e `notification_worker_secret` com os valores reais do projeto e do worker. Validar entrega, retry, descadastro e supressão antes de liberar convites em volume.
5. Conferir convites/recuperações antigos antes de drenar a fila: links temporários podem ter expirado ou já ter sido consumidos no primeiro acesso local.

Criar contas e recuperar senhas continuará enfileirando mensagens, mas sua entrega depende dessa configuração.

## Histórico da implantação de 22/10 e avisos do Supabase

O [CI completo de 22/10](https://github.com/HenryGabriel7/labreserva/actions/runs/39832599914), commit `558f554`, passou: 79 testes unitários, 216 asserções pgTAP nativas, cinco integrações, 50 E2E, worker Deno, lint, tipos, build e npm audit. Esse run não valida as alterações de 23/10.

O smoke de produção de 22/10 verificou login e privacidade HTTP 200, redirecionamento da área interna para login, ausência do modo de demonstração, API administrativa HTTP 401 sem sessão e ausência de erros JavaScript no navegador. O Auth hospedado confirmou provider Email ativo e signup público bloqueado; o acesso anônimo aos laboratórios e ao worker foi recusado.

Os advisors identificaram três tabelas service-only com RLS sem policies de cliente (`rate_limits`, `supressoes_email` e `ocorrencia_uploads`): o bloqueio é intencional. O aviso sobre funções SECURITY DEFINER executáveis por usuários autenticados corresponde às RPCs autorizadas e helpers de RLS definidos na especificação; não foi removida a validação de sessão, papel ou vínculo para silenciar o aviso. Referências: [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funções SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

A proteção de senhas vazadas permaneceu desativada no plano Free; a [documentação do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) informa disponibilidade a partir do Pro. Não houve alteração de plano. Os requisitos de tamanho e complexidade já estão ativos no Auth.

Os resultados do CI e limites restantes estão em [PROGRESSO](PROGRESSO.md) e [TESTES](TESTES.md). O transporte assinado foi também validado no Storage hospedado: Chromium fez upload a partir da origem de produção, o servidor conferiu os bytes, a leitura pública foi negada e o objeto temporário foi removido pelo SDK. A revisão integral do fluxo de ocorrências com fotos e a entrega de e-mails continuam sendo tarefas de homologação. Cadastre os laboratórios, equipamentos, horários e vínculos de monitores pela interface administrativa após definir a senha.
