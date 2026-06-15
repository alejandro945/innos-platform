import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white">
            IN
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            Comparador de Tarifas
          </h1>
          <p className="mt-1 text-sm text-slate-500">INOOS SAS</p>
        </div>

        <p className="mb-6 text-center text-sm text-slate-600">
          Inicie sesión con su cuenta corporativa para continuar.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
              <path fill="#f3f3f3" d="M0 0h23v23H0z" />
              <path fill="#f35325" d="M1 1h10v10H1z" />
              <path fill="#81bc06" d="M12 1h10v10H12z" />
              <path fill="#05a6f0" d="M1 12h10v10H1z" />
              <path fill="#ffba08" d="M12 12h10v10H12z" />
            </svg>
            Continuar con Microsoft
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Acceso restringido a usuarios autorizados de INOOS.
        </p>
      </div>
    </main>
  );
}
