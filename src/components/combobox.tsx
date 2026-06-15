"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";

export type ComboOption = { id: string; label: string };

/** Minimal searchable single-select (typeahead). */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Buscar…",
}: {
  options: ComboOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return options.slice(0, 50);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 50);
  }, [options, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 outline-none focus:border-slate-500"
      >
        <span className={selected ? "" : "text-slate-400"}>
          {selected ? selected.label : "Seleccione ítem canónico…"}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full border-b border-slate-100 px-3 py-2 text-sm outline-none"
            />
            <ul className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-400">
                  Sin resultados
                </li>
              ) : (
                filtered.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        o.id === value ? "bg-slate-50 font-medium" : ""
                      }`}
                    >
                      {o.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
