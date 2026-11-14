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

Preencha `GEMINI_API_KEY` no arquivo `.env.local` e inicie o servidor:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Stack base

- Next.js com App Router, React e TypeScript
- Tailwind CSS e Shadcn/UI
- Playwright para automação de navegador
- `@google/genai` para integração com a API Gemini
