# GhostQA

Plataforma de auditoria comportamental de UX com personas sintéticas.

## Requisitos

- Node.js 20.9 ou superior
- npm

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local
```

Preencha `OPENROUTER_API_KEY` no arquivo `.env.local` e inicie o servidor:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Stack base

- Next.js com App Router, React e TypeScript
- Tailwind CSS e Shadcn/UI
- Playwright para automação de navegador
- SDK `openai` configurado para a API OpenRouter

Os screenshots anotados pelo motor Set-of-Mark são salvos em
`public/runs/[sessionId]/`. Instale o Chromium do Playwright antes de executar
capturas pela primeira vez. Em ambientes com Chromium gerenciado pelo sistema,
configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` em `.env.local`:

```bash
npx playwright install chromium
```

Os testes ficam separados do código da aplicação em `tests/unit/` e
`tests/integration/`. Execute os testes unitários com `npm test`. Para o teste
integrado do navegador, configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` se
necessário e execute `npm run test:playwright`.
