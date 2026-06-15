"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

type SelectFilter = {
  name: string;
  allLabel: string;
  options: { value: string; label: string }[];
};

/** Search box + optional select filters that drive URL query params. */
export function TableFilters({
  searchPlaceholder = "Buscar…",
  selects = [],
}: {
  searchPlaceholder?: string;
  selects?: SelectFilter[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setParam = (name: string, value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(name, value);
    else p.delete(name);
    p.delete("page");
    router.replace(`${pathname}?${p.toString()}`);
  };

  // Debounce the search input.
  useEffect(() => {
    const current = sp.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParam("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-56">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        />
      </div>
      {selects.map((s) => (
        <select
          key={s.name}
          defaultValue={sp.get(s.name) ?? ""}
          onChange={(e) => setParam(s.name, e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
        >
          <option value="">{s.allLabel}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
