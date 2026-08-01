"use client";

import { useState } from "react";
import { BarChart3, Layers } from "lucide-react";
import clsx from "clsx";
import { FuturesWatcher } from "@/components/derivatives/FuturesWatcher";
import { OptionChain } from "@/components/derivatives/OptionChain";

type Tab = "futures" | "options";

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "futures", label: "Futures", icon: <Layers size={15} /> },
  { id: "options", label: "Options", icon: <BarChart3 size={15} /> },
];

export function DerivativesDashboard() {
  const [tab, setTab] = useState<Tab>("futures");

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-border-base bg-surface p-1">
        {TABS.map(({ id, label, icon }) => (
          <TabButton
            key={id}
            active={tab === id}
            label={label}
            icon={icon}
            onClick={() => setTab(id)}
          />
        ))}
      </div>

      {tab === "futures" ? <FuturesWatcher /> : <OptionChain />}
    </div>
  );
}

function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
