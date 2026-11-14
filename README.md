# GhostQA

Plataforma de auditoria comportamental de UX com personas sintéticas.

## Executar com Docker

Requisitos: Docker Engine e Docker Compose v2. O arquivo `.env` local contém as
configurações do ambiente e não é versionado. Ele já pode ser usado diretamente;
em uma instalação nova, copie `.env.example` para `.env` e gere `POSTGRES_PASSWORD`
e `BETTER_AUTH_SECRET` com valores aleatórios antes de iniciar.

Suba o sistema e o PostgreSQL com um comando:

```bash
docker compose up --build
```

Abra [http://localhost:3001](http://localhost:3001). O PostgreSQL fica persistido
no volume Docker `postgres_data`; arquivos de auditoria legados e screenshots
privadas permanecem nas pastas locais `data/` e `public/runs/`. As migrations
Prisma são aplicadas automaticamente antes da inicialização da aplicação.
Como o navegador Playwright também roda dentro do container, use a porta interna
3001 (por exemplo, `http://localhost:3001`) ao auditar a própria instalação.
Na inicialização, o container corrige a propriedade das pastas de dados montadas
e executa a aplicação como usuário não privilegiado, evitando erros `EACCES` em
clones novos.
Para executar em segundo plano, use `docker compose up --build -d`; para parar,
`docker compose down`. Os dados do banco permanecem após `docker compose down`;
não use `docker compose down -v` se quiser preservá-los.

O container instala as dependências do Chromium do Playwright, então não é
necessário configurar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` dentro do Docker.
Para desenvolvimento sem Docker, instale as dependências e o Chromium com:

```bash
npm install
npx playwright install chromium
npm run db:generate
npm run db:migrate
npm run dev
```

Para desenvolvimento local, use `DATABASE_URL` apontando para
`127.0.0.1:5432` e ajuste `BETTER_AUTH_URL` para a porta escolhida.

## Configuração manual necessária

- **OpenRouter:** preencha `OPENROUTER_API_KEY` com uma chave válida para executar
  auditorias com análise visual. O modelo padrão multimodal é
  `nvidia/nemotron-3.5-super-vl:free`.
- **E-mail no ambiente local:** o Compose inicia o Mailpit; mensagens de cadastro
  e redefinição de senha ficam disponíveis em
  [http://localhost:8025](http://localhost:8025). O padrão é
  `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, sem usuário/senha. Esse serviço apenas
  captura e-mails e não os entrega a caixas externas.
- **Administrador:** defina `ADMIN_EMAILS` com o e-mail da conta que terá acesso
  administrativo. Cadastre e verifique essa conta após iniciar a aplicação.
- **Produção:** altere `BETTER_AUTH_URL` para a origem HTTPS pública exata, use
  credenciais fortes e únicas em `POSTGRES_PASSWORD` e `BETTER_AUTH_SECRET`, e
  configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM`
  para um provedor real de e-mail.

Crie sua conta pelo formulário de cadastro. Para conceder acesso administrativo
à primeira conta, inclua seu e-mail em `ADMIN_EMAILS` antes de iniciar o app.
O painel `/admin` permite conceder e revogar manualmente o plano Pro; não há
gateway de pagamento integrado. A autenticação usa e-mail e senha com mínimo
de 12 caracteres, verificação de e-mail e recuperação de senha.

## Stack base

- Next.js com App Router, React e TypeScript
- Tailwind CSS e Shadcn/UI
- Playwright para automação de navegador
- SDK `openai` configurado para a API OpenRouter

Os screenshots anotados pelo motor Set-of-Mark são salvos em
`public/runs/[sessionId]/[personaId]/`. Instale o Chromium do Playwright antes de executar
capturas pela primeira vez. Em ambientes com Chromium gerenciado pelo sistema,
configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` em `.env.local`:

```bash
npx playwright install chromium
```

Os testes ficam separados do código da aplicação em `tests/unit/` e
`tests/integration/`; os testes de rotas ficam em `tests/api/`. Execute a suíte
com `npm test`. Para os testes integrados do navegador, configure
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` se necessário e execute
`npm run test:playwright`.

As contas, concessões de plano e auditorias são persistidas no PostgreSQL.
As screenshots ficam em `data/private-runs/` e só são servidas por uma rota que
verifica a sessão e a propriedade da auditoria. Para migrar as sessões JSON e
screenshots legados para a primeira conta administradora, cadastre-a primeiro e
rode `npm run migrate:legacy-runs` para simular; revise o resultado e então
execute `npm run migrate:legacy-runs -- --apply`.

A API aceita `POST /api/runs` para iniciar uma missão e `GET /api/runs/[id]` para consultar
seu progresso e relatório; `POST /api/runs/[id]/retry` repete uma execução
concluída ou com falha, preservando o mesmo ID e a configuração original, sem
consumir uma nova sessão mensal. O plano e os limites são sempre determinados
no servidor a partir da conta autenticada. O Mission Control permite configurar
uma missão e acompanhar auditorias próprias. Em `/runs/[id]`, a jornada é atualizada durante a execução e o relatório
apresenta screenshots, pensamentos, atritos priorizados e logs técnicos, com
uma ação para executar novamente auditorias concluídas ou com falha. A
exportação Markdown/PDF e o Raio-X técnico completo são exibidos no plano Pro.
O histórico completo de execuções está separado em `/audits`.
O armazenamento de screenshots usa disco local; em ambientes serverless ou com
múltiplas instâncias, substitua-o por um bucket privado (por exemplo, S3) antes
de produção. `ADMIN_EMAILS` é uma lista separada por vírgula e deve ser
configurada apenas no servidor.
