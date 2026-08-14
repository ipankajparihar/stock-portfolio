"use client";

import { useState } from "react";
import { Plus, Wallet, X } from "lucide-react";
import clsx from "clsx";
import { AddTradeForm } from "@/components/portfolio/AddTradeForm";
import { TransactionsList } from "@/components/portfolio/TransactionsList";
import type { Holding, Transaction } from "@/lib/types";

/**
 * The ledger beneath the live dashboard above: every trade exactly as entered, with the form to
 * add another tucked behind a toggle rather than always on screen — once a portfolio has a dozen
 * trades, a permanently-open form is just something to scroll past.
 */
export function ManageHoldingsSection({
  trades,
  openPositions,
}: {
  trades: Transaction[];
  openPositions: Holding[];
}) {
  const [showForm, setShowForm] = useState(trades.length === 0);

  return (
    <section id="manage-holdings" className="scroll-mt-20 space-y-4 border-t border-border-base pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet size={18} className="text-muted" aria-hidden="true" />
            Manage Holdings
          </h2>
          <p className="text-sm text-muted">Every trade you&apos;ve recorded, in one place.</p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          aria-pressed={showForm}
          className={clsx(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
            showForm
              ? "border-border-strong bg-surface-muted text-foreground"
              : "border-accent bg-accent-soft text-accent hover:bg-accent-soft/80",
          )}
        >
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? "Close" : "Record a trade"}
        </button>
      </div>

      {showForm && (
        <AddTradeForm onClose={() => setShowForm(false)} openPositions={openPositions} />
      )}

      <TransactionsList trades={trades} onAddClick={() => setShowForm(true)} />
    </section>
  );
}
