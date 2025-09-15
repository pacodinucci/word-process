import { Ensayo, Estimulacion } from "../../types";

export function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Si el string de 'vazao' contiene unidades “por presión” o menciona IP, lo descartamos */

export function sanitizeVazao(s: string | null | undefined): string | null {
  if (!s) return null;
  const txt = s.trim();

  // indicadores de "por presión" o índice: m3/d/kg/cm2, kgf/cm2, "IP", etc.
  if (
    /\/\s*(kgf?\/?cm2)\b/i.test(txt) || // /kg/cm2 o /kgf/cm2
    /\bkgf?\/?cm2\b/i.test(txt) || // kg/cm2 o kgf/cm2
    /\bIP\b/i.test(txt) // menciona IP
  ) {
    return null;
  }

  // si no contiene unidad de V/T conocida, también lo descartamos
  if (!/\b(m3\/d|bbl\/d|bpd|mpcd|bpm|l\/s|qt\s*=)/i.test(txt)) {
    return null;
  }

  return txt;
}

export function deaccent(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function ensureEndsWithDot(s: string) {
  const t = s?.trim?.() ?? "";
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : t + ".";
}
export function mkRecuperadoLinea(t: Ensayo) {
  const parts: string[] = [];
  if (t.sopro) parts.push(ensureEndsWithDot(t.sopro));
  if (t.recuperadoTexto) {
    parts.push(ensureEndsWithDot(t.recuperadoTexto));
  } else if (t.totalRecuperado?.valor != null || t.totalRecuperado?.unidad) {
    const num = t.totalRecuperado?.valor ?? "";
    const uni = t.totalRecuperado?.unidad ?? "";
    const recTxt = t.recuperadoTexto ?? "";
    parts.push(
      ensureEndsWithDot(`${recTxt} Total Recuperado ${num} ${uni}`.trim())
    );
  }
  return parts
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const fmtVolumen = (
  v?: { valor?: number | null; unidad?: string | null } | null
) =>
  v && (v.valor != null || v.unidad)
    ? `${v.valor ?? ""} ${v.unidad ?? ""}`
    : null;

export const labelTipoEst = (t: Estimulacion["tipo"]) =>
  t === "acidizacion"
    ? "Acidización"
    : t === "fractura"
    ? "Fractura"
    : "Minifractura";
