export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10">
      <header className="flex items-center gap-3 border-b border-[var(--border)] pb-6">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-400/10 text-sm font-bold text-sky-300"
        >
          G
        </span>
        <div>
          <p className="text-sm font-semibold tracking-wide text-slate-100">
            GhostQA
          </p>
          <p className="text-xs text-slate-400">MISSION CONTROL</p>
        </div>
        <span className="ml-auto rounded-full border border-[var(--border)] px-3 py-1 text-xs text-slate-400">
          Ambiente inicializado
        </span>
      </header>

      <section className="flex flex-1 flex-col justify-center py-20">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-sky-300">
          Auditoria comportamental de UX
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-100 sm:text-6xl">
          Testes de usabilidade com personas sintéticas.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-slate-400">
          A base do GhostQA está pronta. O Mission Control e o motor de
          navegação serão construídos nas próximas etapas.
        </p>
      </section>

      <footer className="border-t border-[var(--border)] pt-4 text-xs text-slate-500">
        GhostQA · Engenharia de qualidade comportamental
      </footer>
    </main>
  );
}
