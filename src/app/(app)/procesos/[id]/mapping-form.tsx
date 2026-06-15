import { Select } from "@/components/form";
import {
  MAPPING_FIELDS,
  FIELD_LABELS,
  type ColumnMapping,
} from "@/lib/column-mapping";
import { confirmMapping } from "../actions";

export function MappingForm({
  uploadId,
  headers,
  mapping,
  method,
  sample = [],
}: {
  uploadId: string;
  headers: string[];
  mapping: ColumnMapping;
  method?: string;
  sample?: Record<string, unknown>[];
}) {
  return (
    <form action={confirmMapping} className="space-y-4">
      <input type="hidden" name="uploadId" value={uploadId} />
      <p className="text-sm text-slate-500">
        {method === "ai"
          ? "Mapeo sugerido por IA. Revíselo y confírmelo."
          : "Mapeo sugerido automáticamente. Revíselo y confírmelo."}
      </p>

      {sample.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sample.map((row, i) => (
                <tr key={i}>
                  {headers.map((h) => (
                    <td
                      key={h}
                      className="max-w-48 truncate px-3 py-1.5 text-slate-600"
                    >
                      {row[h] === null || row[h] === undefined
                        ? ""
                        : String(row[h])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MAPPING_FIELDS.map((field) => (
          <label key={field} className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              {FIELD_LABELS[field]}
              {field === "name" && <span className="text-rose-500"> *</span>}
            </span>
            <Select name={field} defaultValue={mapping[field] ?? ""}>
              <option value="">— Ninguna —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Confirmar mapeo
      </button>
    </form>
  );
}
