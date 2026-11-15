"use client";

import { CheckCircle as CircleCheck, XCircle as CircleX, Warning as TriangleAlert } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type SignalLevel = "good" | "careful" | "risky";

const SIGNAL_STYLES: Record<SignalLevel, { label: string; box: string; badge: string; icon: typeof CircleCheck }> = {
  good: {
    label: "Good condition",
    box: "border-[#B7D9C2] bg-[#E8F3EC] text-[#141E16]",
    badge: "text-[#165B31]",
    icon: CircleCheck,
  },
  careful: {
    label: "Needs attention",
    box: "border-[#E5C99B] bg-[#F9F0E1] text-[#141E16]",
    badge: "text-[#7C4A0E]",
    icon: TriangleAlert,
  },
  risky: {
    label: "High risk",
    box: "border-[#E8B8B4] bg-[#FBEAE8] text-[#141E16]",
    badge: "text-[#8C261E]",
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
    <div className={cn("flex items-start gap-3 rounded-lg border p-3.5", cfg.box, className)}>
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", cfg.badge)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <div className="text-[13px] font-semibold text-[#141E16]">{title}</div>}
          <span className={cn("text-[12px] font-semibold", cfg.badge)}>{cfg.label}</span>
        </div>
        {detail && <div className="mt-1 text-[13px] leading-relaxed text-[#38473B]">{detail}</div>}
      </div>
    </div>
  );
}
