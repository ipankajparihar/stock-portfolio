"use client";

import { useState } from "react";
import { Plus, Wallet, X } from "lucide-react";
import clsx from "clsx";
import { AddHoldingForm } from "@/components/portfolio/AddHoldingForm";
import { HoldingLotsList } from "@/components/portfolio/HoldingLotsList";
import type { HoldingLot } from "@/lib/types";

/**
 * The transaction-record layer beneath the live dashboard above: every purchase exactly as
 * entered, with the form to add another tucked behind a toggle rather than always on screen —
 * once a portfolio has a dozen lots, a permanently-open form is just something to scroll past.
 */
export function ManageHoldingsSection({ lots }: { lots: HoldingLot[] }) {
  const [showForm, setShowForm] = useState(lots.length === 0);

  return (
    <section id="manage-holdings" className="scroll-mt-20 space-y-4 border-t border-border-base pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet size={18} className="text-muted" aria-hidden="true" />
            Manage Holdings
          </h2>
          <p className="text-sm text-muted">Every purchase you&apos;ve recorded, in one place.</p>
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
          {showForm ? "Close" : "Record a purchase"}
        </button>
      </div>

      {showForm && <AddHoldingForm onClose={() => setShowForm(false)} />}

      <HoldingLotsList lots={lots} onAddClick={() => setShowForm(true)} />
    </section>
  );
}
