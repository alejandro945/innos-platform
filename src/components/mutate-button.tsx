"use client";

import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

type Variant = "primary" | "secondary" | "success" | "danger" | "link";

const VARIANTS: Record<Variant, string> = {
  primary: "rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-800",
  secondary:
    "rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50",
  success: "rounded-lg bg-emerald-700 px-3 py-2 text-white hover:bg-emerald-800",
  danger: "rounded-lg px-2 py-1.5 text-rose-600 hover:bg-rose-50",
  link: "rounded-lg px-2 py-1.5 text-slate-600 hover:bg-slate-100",
};

/**
 * Calls a server action (returning ActionResult | void) in a transition,
 * with optional confirm and success/error toasts. For inline table actions.
 */
export function MutateButton({
  action,
  fields,
  children,
  variant = "secondary",
  confirmText,
  successMessage = "Listo.",
  className,
  title,
}: {
  action: (formData: FormData) => Promise<ActionResult | void>;
  fields: Record<string, string>;
  children: ReactNode;
  variant?: Variant;
  confirmText?: string;
  successMessage?: string;
  className?: string;
  title?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title={title}
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        startTransition(async () => {
          const fd = new FormData();
          for (const [k, v] of Object.entries(fields)) fd.append(k, v);
          try {
            const res = await action(fd);
            if (res && res.ok === false) {
              toast.error(res.message ?? "No se pudo completar la acción.");
            } else {
              toast.success(res?.message ?? successMessage);
            }
          } catch {
            toast.error("Ocurrió un error.");
          }
        });
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-sm font-medium transition disabled:opacity-60",
        VARIANTS[variant],
        className,
      )}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
