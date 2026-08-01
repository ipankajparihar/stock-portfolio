import { Activity, Eye, PieChart, Wallet } from "lucide-react";

/**
 * Four capability cards — what the product actually does, stated plainly. Every claim here maps
 * to a shipped feature (live prices, portfolio, watchlist, sector analytics); nothing aspirational.
 */
const FEATURES = [
  {
    icon: Activity,
    title: "Live market prices",
    body: "Real-time quotes and daily top gainers & losers for US and Indian equities, refreshed every minute.",
  },
  {
    icon: Wallet,
    title: "Personal portfolio",
    body: "Log every purchase with its date, quantity, and price. Positions roll up to a true weighted-average cost basis.",
  },
  {
    icon: Eye,
    title: "Smart watchlist",
    body: "Follow the stocks you're weighing up and see today's move at a glance, before you commit any capital.",
  },
  {
    icon: PieChart,
    title: "Sector analytics",
    body: "See how your capital is allocated and which sectors are carrying — or dragging — your returns.",
  },
];

export function FeatureGrid() {
  return (
    <section className="space-y-6">
      <SectionHeading
        eyebrow="Everything in one place"
        title="Your markets and your money, together"
        subtitle="A public market view for everyone, and a private portfolio for you — no spreadsheets, no switching tabs."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-xl border border-border-base bg-surface p-5 shadow-sm transition-colors hover:border-border-strong"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <feature.icon size={20} aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow && (
        <p className="text-xs font-semibold tracking-wide text-accent uppercase">{eyebrow}</p>
      )}
      <h2 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-2 text-muted-strong">{subtitle}</p>}
    </div>
  );
}
