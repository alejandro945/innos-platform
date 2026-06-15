import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, isLocalAdminEnabled, LOCAL_ADMIN_PROVIDER } from "@/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const localEnabled = isLocalAdminEnabled();

  async function localSignIn(formData: FormData) {
    "use server";
    try {
      await signIn(LOCAL_ADMIN_PROVIDER, {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/",
      });
    } catch (e) {
      if (e instanceof AuthError) {
        redirect("/iniciar-sesion?error=credenciales");
      }
      throw e; // re-throw the success redirect
    }
  }

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

        {error === "credenciales" && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-600">
            Correo o contraseña incorrectos.
          </p>
        )}

        <form action={async () => {
          "use server";
          await signIn("microsoft-entra-id", { redirectTo: "/" });
        }}>
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

        {localEnabled && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              o ingrese como administrador
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <form action={localSignIn} className="space-y-3">
              <input
                name="email"
                type="email"
                required
                placeholder="Correo"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <input
                name="password"
                type="password"
                required
                placeholder="Contraseña"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="submit"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Ingresar
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Acceso restringido a usuarios autorizados de INOOS.
        </p>
      </div>
    </main>
  );
}
