import { Estimulacion } from "@/app/api/word/summarize/route";
import { sanitizeVazao, toNum } from ".";

// Helpers genéricos
export function pickStr(...cands: unknown[]): string | null {
  for (const v of cands) if (typeof v === "string" && v.trim()) return v;
  return null;
}
export function pickObj<T extends object>(...cands: unknown[]): T | null {
  for (const v of cands) if (v && typeof v === "object") return v as T;
  return null;
}

export function normalizeEstimulaciones(arr: unknown): Estimulacion[] {
  if (!Array.isArray(arr)) return [];

  return arr.map((raw): Estimulacion => {
    const r = (raw ?? {}) as Record<string, unknown>;

    // --- tipo ---
    const tipoStr = (pickStr(r["tipo"], r["nombre"]) || "").toLowerCase();
    let tipo: Estimulacion["tipo"] = "acidizacion";
    if (
      /(mini[\s-]?frac|minifract|mini[\s-]?fract|mini[\s-]?fratur)/i.test(
        tipoStr
      )
    ) {
      tipo = "minifractura";
    } else if (/\b(fratur|fract|frac)\b/i.test(tipoStr)) {
      tipo = "fractura";
    } else if (/(acid|ácid|acido|ácido)/i.test(tipoStr)) {
      tipo = "acidizacion";
    }

    // --- fecha ---
    const fecha = pickStr(r["fecha"], r["date"]) || "";

    // --- intervalo (siempre presente) ---
    const intSrc = pickObj<Record<string, unknown>>(
      r["intervalo"],
      r["interval"]
    );
    const intervalo = intSrc
      ? {
          desde: toNum(intSrc["desde"] ?? intSrc["from"] ?? intSrc["start"]),
          hasta: toNum(intSrc["hasta"] ?? intSrc["to"] ?? intSrc["end"]),
          unidad: pickStr(intSrc["unidad"], intSrc["unit"]) || "m",
        }
      : { desde: null, hasta: null, unidad: "m" };

    // --- fluido / ácido ---
    const fluido = pickStr(r["fluido"], r["acido"], r["acid"]);

    // --- presiones ---
    const presionInicial = pickStr(r["presionInicial"], r["pressaoInicial"]);
    const presionMedia = pickStr(r["presionMedia"], r["pressaoMedia"]);
    const presionFinal = pickStr(r["presionFinal"], r["pressaoFinal"]);

    // --- vazão ---
    const vazao = sanitizeVazao(pickStr(r["vazao"], r["caudal"], r["flow"]));

    // --- volumen ---
    const volSrc = pickObj<Record<string, unknown>>(r["volumen"], r["volume"]);
    const volumen = volSrc
      ? {
          valor: toNum(volSrc["valor"] ?? volSrc["value"]),
          unidad: pickStr(volSrc["unidad"], volSrc["unit"]),
        }
      : null;

    // --- observación ---
    const observacion = pickStr(r["observacion"], r["obs"]);

    return {
      tipo,
      fecha,
      intervalo,
      fluido,
      presionInicial,
      presionMedia,
      presionFinal,
      vazao,
      volumen,
      observacion,
    };
  });
}
