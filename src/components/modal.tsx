"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

const ModalCtx = createContext<{ close: () => void }>({ close: () => {} });

/** Forms inside a Modal call this to close it on success. */
export function useModalClose() {
  return useContext(ModalCtx).close;
}

export function Modal({
  triggerLabel,
  title,
  children,
  triggerClassName,
}: {
  triggerLabel: string;
  title: string;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        }
      >
        {triggerLabel}
      </button>

      {open && (
        <ModalCtx.Provider value={{ close: () => setOpen(false) }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
            onClick={() => setOpen(false)}
          >
            <div
              ref={panelRef}
              tabIndex={-1}
              className="w-full max-w-2xl rounded-2xl bg-white shadow-xl outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h2 className="text-base font-semibold text-slate-900">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-6">{children}</div>
            </div>
          </div>
        </ModalCtx.Provider>
      )}
    </>
  );
}
