import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-border bg-card px-3 text-sm text-ink placeholder:text-ink-faint " +
  "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/60 disabled:opacity-60";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(control, "min-h-[64px] py-2 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(control, "h-9 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8",
      "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237C8A6B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
      className)} {...props} />
  ),
);
Select.displayName = "Select";

export function Checkbox({ label, className, ...props }:
  React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink", className)}>
      <input type="checkbox" className="size-4 rounded border-border accent-accent" {...props} />
      {label}
    </label>
  );
}

export function Field({ label, hint, children, className }:
  { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-[13px] font-medium text-ink-soft">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[12px] text-ink-faint">{hint}</div>}
    </div>
  );
}

/* Segmented control: Active / Archived / All */
export function Segmented<T extends string>({ value, options, onChange }:
  { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn("rounded-[5px] px-3 py-1 text-[13px] transition-colors",
            value === o.value ? "bg-accent text-bg" : "text-ink-soft hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
