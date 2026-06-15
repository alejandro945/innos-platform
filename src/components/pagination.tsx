import Link from "next/link";
import { cn } from "@/lib/utils";

/** Simple prev/next pagination driven by a `page` query param. */
export function Pagination({
  basePath,
  page,
  pageSize,
  total,
  params,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  params?: Record<string, string>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const link = (p: number) => {
    const sp = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${sp.toString()}`;
  };
  const btn =
    "rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50";
  const disabled = "pointer-events-none opacity-40";

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        Página {page} de {totalPages} · {total} registros
      </span>
      <div className="flex gap-2">
        <Link
          href={link(page - 1)}
          className={cn(btn, page <= 1 && disabled)}
          aria-disabled={page <= 1}
        >
          Anterior
        </Link>
        <Link
          href={link(page + 1)}
          className={cn(btn, page >= totalPages && disabled)}
          aria-disabled={page >= totalPages}
        >
          Siguiente
        </Link>
      </div>
    </div>
  );
}
