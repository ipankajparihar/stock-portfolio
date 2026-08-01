import { CtaButtons } from "@/components/landing/CtaButtons";

/** Closing call to action — a tinted full-width panel that repeats the pitch after the board. */
export function FinalCta({ isAuthed }: { isAuthed: boolean }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-accent-soft bg-accent-soft px-6 py-12 text-center sm:px-10 sm:py-16">
      <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        {isAuthed
          ? "Pick up where you left off"
          : "Start tracking your portfolio in under a minute"}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-muted-strong">
        {isAuthed
          ? "Your holdings and watchlist are a click away."
          : "Sign in with Google, add your first holding, and watch it move with the market. No card, no setup."}
      </p>
      <div className="mt-7 flex justify-center">
        <CtaButtons isAuthed={isAuthed} />
      </div>
    </section>
  );
}
