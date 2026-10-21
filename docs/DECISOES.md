# Decisões

- 2026-10-20: usar Next.js 16 real, App Router, npm, TypeScript strict e proxy.ts, conforme solicitado. O runtime Sites usa Vinext/Workers; não trocar a stack nem publicar uma versão estática que perderia as Server Actions. Entrega local preparada para Vercel + Supabase.
- Funcionário tem os mesmos privilégios de professor e prioridade 2. Admin/monitor não elevam a prioridade do solicitante.
- Ausência de credenciais deve falhar de forma segura; modo de demonstração exclusivamente de leitura e identificado, sem simular autenticação ou persistência.
- Configurações mantêm chave única além de UUID, conciliando a identidade universal de tabelas com a busca por chave.
- O ambiente Windows bloqueia npm.ps1; usar npm.cmd, sem alterar a política de execução.
- Auditoria de dependências: atualizar jsPDF para 4.2.1+ e Vitest para 5.0.5+. O plugin ESLint do Next 16 depende de fast-glob/braces sem correção publicada no momento; override restrito desse plugin para tinyglobby, que oferece a única API usada (globSync com onlyDirectories). Teste específico verifica resolução rootDir. `npm audit --audit-level=high` passou com zero alertas após essas mudanças.
- Fonte Inter variável hospedada no próprio aplicativo, sem consulta ao Google Fonts em build ou navegação.
- A preparação de módulos independentes foi paralelizada; integração, verificações e commits permanecem ordenados por etapa. O script de checkpoint seleciona os arquivos das etapas 2/3 para não incluir antecipadamente a interface preparada para a etapa 4.
- Recorrência respeita o limite de meses e também a antecedência máxima por ocorrência, valendo o mais restritivo. Configurações padrão permitem 90 dias dentro do limite máximo de 6 meses.
- Tentativas inválidas fazem rollback da transação RPC: o rate limit do endpoint de solicitação é consumido em uma requisição de serviço separada antes da RPC autenticada; há defesa adicional dentro da RPC.
- Validação auxiliar com PostgreSQL WASM é reproduzível; adapters Supabase externos são declarados. `supabase test db` continua obrigatório no CI com serviços reais.
- 2026-10-21: provisionar_usuario exige ator administrador e não pode criar o primeiro. A operação excepcional inicializar_administrador é service-only, tem lock global e recusa qualquer novo bootstrap se houver papel admin, mesmo inativo. A CLI gera o convite e enfileira a entrega sem imprimir credenciais; depois, o fluxo normal é obrigatório.
- RLS/RPC também verificam session_id em auth.sessions, usuário e not_after. Novas transações rejeitam a sessão removida; fixtures de teste mantêm sessões/claims explícitos, sem bypass na aplicação.
- Eventos de autenticação são privados na fila por RLS da linha inteira. Filtrar somente no React deixaria links bearer acessíveis por REST e pelo snapshot renderizado.
- CSP usa nonce por resposta e renderização dinâmica. Estilos inline são permitidos nos componentes; scripts de produção não permitem inline genérico ou eval.
- E-mails congelam o envelope antes do envio para manter o mesmo conteúdo nos retries idempotentes. Aceite no Resend não é entrega; envio incerto perto do limite da janela exige reconciliação, sem reenvio automático.
- Testes com chave de serviço são restritos a loopback. O ajuste de horário para check-in existe só em fixture QA e não cria caminho de teste no aplicativo. Ausência de serviços é skipped explícito local e erro no CI.
- Retenção é uma política de referência a confirmar pela instituição, sem exclusão automática de evidências. Modo escuro permanece opcional, após os fluxos obrigatórios.
