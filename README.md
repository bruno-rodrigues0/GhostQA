# Bunter

**Auditoria comportamental de UX com personas sintéticas.** O Bunter navega
por uma jornada definida, observa a interface em um navegador real, registra
atritos e entrega um relatório com evidências visuais e recomendações.

## Comece pelo Docker

Docker Compose é o caminho recomendado: ele sobe a aplicação, PostgreSQL,
Chromium do Playwright e Mailpit sem exigir que você instale o navegador ou
configure o banco manualmente.

### Requisitos

- Docker Engine e Docker Compose v2.
- Uma chave de API do [OpenRouter](https://openrouter.ai/) para executar
  auditorias com IA.

### 1. Prepare o ambiente

Na raiz do repositório, crie o arquivo local de variáveis:

```bash
cp .env.example .env
```

Gere dois segredos distintos:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

No `.env`, substitua os valores de exemplo de `POSTGRES_PASSWORD` e
`BETTER_AUTH_SECRET` pelos resultados. Configure também:

```env
OPENROUTER_API_KEY=sua-chave-do-openrouter
ADMIN_EMAILS=seu-email@exemplo.com
BETTER_AUTH_URL=http://localhost:3001
```

`ADMIN_EMAILS` é uma lista de e-mails separada por vírgulas. A conta que usar
um desses e-mails terá acesso ao painel administrativo depois de se cadastrar
e verificar o endereço. O modelo multimodal padrão é
`nvidia/nemotron-3.5-super-vl:free`; você pode selecionar outro modelo compatível
com imagem por `OPENROUTER_MODEL`.

> **Segredos:** `.env` não deve ser commitado nem compartilhado. Não coloque
> chaves de API ou senhas no README, em tickets ou em logs públicos.

### 2. Inicie o Bunter

```bash
docker compose up --build -d
```

Abra:

- **Aplicação:** [http://localhost:3001](http://localhost:3001)
- **Caixa de entrada local (Mailpit):** [http://localhost:8025](http://localhost:8025)

Confira a inicialização:

```bash
docker compose ps
docker compose logs -f app
```

Cadastre uma conta, abra no Mailpit o e-mail de verificação e confirme o
endereço. O Mailpit captura as mensagens para desenvolvimento; ele **não**
entrega e-mails a caixas externas.

### 3. Envie e-mails para caixas reais (opcional)

Para produção ou testes de entrega externa, configure um provedor SMTP em `.env`.
Exemplo para Gmail:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-endereco@gmail.com
SMTP_PASSWORD=sua-senha-de-app
SMTP_FROM=Bunter <seu-endereco@gmail.com>
```

`SMTP_USER` é o endereço completo da conta. Com Gmail, use uma senha de app
gerada na Conta Google com a verificação em duas etapas ativada — não a senha
normal da conta. Para outros provedores, use o host, a porta, as credenciais e
um remetente autorizados pelo serviço. Depois de alterar o `.env`, recrie a
aplicação:

```bash
docker compose up -d --force-recreate app
```

### Encerrar, reiniciar e preservar os dados

```bash
docker compose down
```

Esse comando preserva o volume PostgreSQL. **Não use**
`docker compose down -v` se quiser conservar o banco. As auditorias e screenshots
também são persistidas nos diretórios locais `data/` e `public/runs/`.

## Desenvolvimento sem container da aplicação

É possível rodar Next.js no host e manter PostgreSQL/Mailpit no Docker.

### Requisitos

- Node.js 22 ou superior e npm.
- Docker Engine e Docker Compose v2 para PostgreSQL e Mailpit.
- Chromium instalado pelo Playwright.

### 1. Configure as variáveis

Crie e preencha `.env` conforme a seção anterior. Para o processo Node rodando
diretamente no host, use `127.0.0.1` para o banco e para o Mailpit:

```env
DATABASE_URL=postgresql://bunter:SUA_SENHA@127.0.0.1:5432/bunter?schema=public
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Bunter <no-reply@bunter.local>
BETTER_AUTH_URL=http://localhost:3001
```

Substitua `SUA_SENHA` pela mesma senha definida em `POSTGRES_PASSWORD`. Não
altere a `DATABASE_URL` do `.env.example` sem conferir usuário, senha, banco e
porta usados no Compose.

### 2. Suba os serviços de apoio

```bash
docker compose up -d postgres mailpit
```

### 3. Instale dependências e o Chromium do Playwright

```bash
npm ci
npx playwright install --with-deps chromium
```

`playwright` já é dependência do projeto. O comando instala o Chromium
compatível com a versão instalada e, em Linux, tenta instalar também as
bibliotecas de sistema necessárias. Se as dependências do sistema não puderem
ser instaladas automaticamente, use um ambiente Linux suportado e instale os
pacotes indicados pelo Playwright. No Windows, WSL2 é uma opção prática para
reproduzir o ambiente Linux.

Para instalar apenas o navegador, sem dependências do sistema:

```bash
npx playwright install chromium
```

### 4. Prepare o banco e inicie a aplicação

```bash
npm run db:generate
npm run db:migrate
npm run dev
```

Abra [http://localhost:3001](http://localhost:3001). O endpoint do banco usado
no host é `127.0.0.1`; dentro do Compose, a aplicação usa o hostname de serviço
`postgres`.

## Como usar

1. Crie uma conta com senha de pelo menos 12 caracteres e confirme o e-mail.
2. No Mission Control, informe a URL do produto e um objetivo observável, por
   exemplo: “Encontrar os preços e iniciar o cadastro”.
3. Escolha viewport e persona(s) disponíveis no seu plano.
4. Inicie a auditoria e acompanhe as etapas em `/runs/[id]`.
5. Revise as screenshots, os atritos priorizados, as recomendações e, quando
   disponível, o Raio-X técnico. O histórico fica em `/audits`.

Use o Bunter somente em sites para os quais você tenha autorização para realizar
testes. CAPTCHA e verificações anti-bot são tratados como bloqueios que exigem
intervenção humana; o agente não tenta resolvê-los.

## Planos e limites implementados

| Recurso | Free | Pro |
|---|---:|---:|
| Auditorias por mês | 5 | 100 |
| Personas por missão | 1 | 3 |
| Passos máximos por persona/jornada | 12 | 30 |
| Viewport Mobile | — | Sim |
| Personas personalizadas | — | Sim |
| Logs técnicos completos | — | Sim |
| Exportação Markdown e impressão/PDF pelo navegador | — | Sim |

O acesso Pro é concedido ou revogado manualmente por um administrador no
momento. O produto ainda não integra checkout, cobrança recorrente ou gestão
automática de assinatura.

## Comandos úteis

```bash
npm test                    # testes unitários, de API e componentes
npm run test:playwright     # integração real do motor com Chromium
npm run test:coverage       # cobertura incluindo as integrações Playwright
npm run lint                # ESLint
npx tsc --noEmit            # verificação TypeScript
npm run build               # build de produção Next.js
```

O Compose instala Chromium no container. Os testes de integração Playwright
podem ser executados sem uma chave OpenRouter: eles usam páginas locais e
decisões controladas pelos testes.

## Configuração e deploy

| Variável | Uso |
|---|---|
| `OPENROUTER_API_KEY` | Chave obrigatória para auditorias com IA |
| `OPENROUTER_MODEL` | Modelo multimodal; padrão definido em `.env.example` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Banco PostgreSQL |
| `DATABASE_URL` | Conexão do processo local; no Compose, construída com os parâmetros PostgreSQL |
| `BETTER_AUTH_SECRET` | Segredo de autenticação, com pelo menos 32 caracteres |
| `BETTER_AUTH_URL` | URL base da aplicação; HTTPS público em produção |
| `ADMIN_EMAILS` | E-mails administradores, separados por vírgula |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Envio de verificação e redefinição de senha |
| `BUNTER_PORT` | Porta local publicada pelo Compose; padrão `3001` |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Caminho opcional para Chromium gerenciado pelo ambiente |

Para deploy em servidor, use HTTPS e defina `BETTER_AUTH_URL` com a origem
pública exata. Mantenha PostgreSQL e Mailpit fora da Internet pública. O Compose
publica as portas em `127.0.0.1`, apropriado quando um proxy reverso no mesmo
host encaminha tráfego à aplicação. Configure SMTP real; Mailpit é somente
para desenvolvimento.

O container da aplicação usa os resolvedores DNS `8.8.8.8` e `1.1.1.1`. Em
redes que exigem DNS próprio ou bloqueiam esses servidores, ajuste `app.dns` em
`docker-compose.yml`.

As screenshots privadas ficam no disco local em `data/private-runs/`, e a
aplicação as entrega por uma rota autenticada que confere a propriedade da
auditoria. O histórico principal e os dados de conta ficam no PostgreSQL.
Antes de operar múltiplas instâncias ou em ambiente serverless, planeje
armazenamento compartilhado para screenshots e execução durável em fila; o
Compose atual é uma implantação de instância única.

## Migração de dados legados

O script de migração importa sessões JSON e screenshots legadas para uma conta
administradora. Cadastre essa conta primeiro. Faça uma simulação:

```bash
npm run migrate:legacy-runs
```

Revise o resultado e, se estiver correto, aplique:

```bash
npm run migrate:legacy-runs -- --apply
```

Com Docker, execute os comandos com `docker compose exec app` antes de `npm run`.

## Estrutura do repositório

```text
src/app/          páginas Next.js e rotas HTTP
src/components/   Mission Control, autenticação e relatórios
src/lib/          motor Playwright/SoM, OpenRouter, planos e persistência
prisma/           schema PostgreSQL e migrations
tests/            testes unitários, API, interface e integração Playwright
prompts/          materiais de prompt auxiliares
scripts/          tarefas operacionais, como migração de dados legados
```

Para uma visão de negócio, arquitetura, fluxo de auditoria e limites conhecidos,
consulte [DOCUMENTACAO.md](./DOCUMENTACAO.md).
