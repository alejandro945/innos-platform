import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-3xl font-semibold text-slate-900">404</p>
      <p className="mt-1 text-sm text-slate-500">
        No encontramos lo que buscaba.
      </p>
      <Link
        href="/"
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
