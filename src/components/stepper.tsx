import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = {
  label: string;
  state: "done" | "current" | "todo";
  hint?: string;
};

export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                s.state === "done" && "bg-emerald-600 text-white",
                s.state === "current" && "bg-slate-900 text-white",
                s.state === "todo" && "bg-slate-200 text-slate-500",
              )}
            >
              {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="leading-tight">
              <span
                className={cn(
                  "text-sm",
                  s.state === "todo" ? "text-slate-400" : "text-slate-800",
                  s.state === "current" && "font-medium",
                )}
              >
                {s.label}
              </span>
              {s.hint && (
                <span className="block text-xs text-slate-400">{s.hint}</span>
              )}
            </div>
          </div>
          {i < steps.length - 1 && (
            <span className="mx-1 hidden h-px w-8 bg-slate-200 sm:block" />
          )}
        </li>
      ))}
    </ol>
  );
}
