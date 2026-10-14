import * as React from "react";
import { cn } from "@/lib/utils";
import { STATUS, type Tone } from "@/lib/format";

const TONES: Record<Tone | "accent", string> = {
  grey: "bg-bg-alt text-ink-soft",
  amber: "bg-warn-bg text-warn",
  green: "bg-ok-bg text-ok",
  red: "bg-bad-bg text-bad",
  accent: "bg-accent/10 text-accent",
};

export function Badge({ tone = "grey", className, ...props }:
  React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone | "accent" }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium leading-5", TONES[tone], className)}
      {...props}
    />
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const s = STATUS[status] ?? { label: status, tone: "grey" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
