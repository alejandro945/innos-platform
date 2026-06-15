"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "success" | "danger" | "link";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "border border-slate-200 text-slate-700 hover:bg-slate-50",
  success: "bg-emerald-700 text-white hover:bg-emerald-800",
  danger: "border border-slate-200 text-slate-600 hover:bg-slate-50",
  link: "text-slate-700 hover:text-slate-900",
};

/** Submit button that shows a spinner while its form action is pending. */
export function ActionButton({
  children,
  variant = "primary",
  className,
  full,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  full?: boolean;
}) {
  const { pending } = useFormStatus();
  const isBox = variant !== "link";
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 text-sm font-medium transition disabled:opacity-60",
        isBox && "rounded-lg px-3 py-2",
        full && "w-full",
        VARIANTS[variant],
        className,
      )}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
