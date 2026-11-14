"use client";

import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type SignalLevel = "good" | "careful" | "risky";

const SIGNAL_STYLES: Record<SignalLevel, { label: string; box: string; icon: typeof CircleCheck }> = {
  good: {
    label: "Good",
    box: "border-emerald-300 bg-emerald-50 text-emerald-800",
    icon: CircleCheck,
  },
  careful: {
    label: "Careful",
    box: "border-amber-300 bg-amber-50 text-amber-800",
    icon: TriangleAlert,
  },
  risky: {
    label: "Risky",
    box: "border-red-300 bg-red-50 text-red-800",
    icon: CircleX,
  },
};

export function scoreToSignal(score: number | null | undefined): SignalLevel {
  if (score == null) return "careful";
  if (score >= 70) return "good";
  if (score >= 45) return "careful";
  return "risky";
}

interface SignalProps {
  level: SignalLevel;
  title?: string;
  detail?: string;
  className?: string;
}

export function Signal({ level, title, detail, className }: SignalProps) {
  const cfg = SIGNAL_STYLES[level];
  const Icon = cfg.icon;
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2.5", cfg.box, className)}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        {title && <div className="text-xs font-medium text-stone-700">{title}</div>}
        <div className="text-sm font-bold leading-tight">{cfg.label}</div>
        {detail && <div className="text-xs text-stone-700">{detail}</div>}
      </div>
    </div>
  );
}
