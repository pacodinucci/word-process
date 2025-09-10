// app/api/word/summarize/route.ts
import { deaccent, sanitizeVazao, toNum } from "@/lib/helpers";
import { normalizeEstimulaciones } from "@/lib/helpers/estimulaciones";
import { fewShot } from "@/lib/prompts";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";

type RawIntervencion = {
  index?: number;
  fechaISO?: string | null;
  fechaTexto?: string | null;
  text: string;
};

type DetailMode = "auto" | "breve" | "extendido";

type Punzado = {
  desde: number | null;
  hasta: number | null;
  unidad: string | null;
};

type Ensayo = {
  nombre?: string | null;
  numero?: string | null;
  fecha?: string | null;
  intervalo?: {
    desde: number | null;
    hasta: number | null;
    unidad: string | null;
  } | null;
  fluidoRecuperado?: string | null;
  totalRecuperado?: { valor: number | null; unidad: string | null } | null;
  recuperadoTexto?: string | null;
  vazao?: string | null;
  swab?: string | null;
  nivelFluido?: string | null;
  salinidad?: string | null;
  bsw?: string | null;
  gradosAPI?: string | null;
  presion?: string | null;
  sopro?: string | null;
  observacion?: string | null;
};
type CementacionTapon = {
  tipo: "cementacion" | "squeeze" | "tampon_cemento" | "bpp";
  intervalo?: {
    desde: number | null;
    hasta: number | null;
    unidad: string | null;
  } | null; // requerido para cementación/squeeze
  profundidad?: number | null; // para BPP (punto único)
  unidadProfundidad?: string | null; // "m" por defecto si hay profundidad
  zona?: string | null; // CPS-01, etc., si aplica
  observacion?: string | null;
};

export type Estimulacion = {
  tipo: "acidizacion" | "fractura" | "minifractura";
  fecha: string;
  intervalo: {
    desde: number | null;
    hasta: number | null;
    unidad: string | null;
  };
  fluido?: string | null;
  presionInicial?: string | null;
  presionMedia?: string | null;
  presionFinal?: string | null;
  vazao?: string | null;
  volumen?: { valor: number | null; unidad: string | null } | null;
  observacion?: string | null;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const MODEL = process.env.OPENAI_MODEL_SUMMARY ?? "gpt-4o-mini";

/** Recorta defensivo por si viene un bloque enorme */
function clampText(s: string, max = 6000) {
  return s.length > max ? s.slice(0, max) : s;
}

/** Normaliza términos clave con errores comunes */
function normalizeDomainTypos(s: string) {
  const rules: Array<[RegExp, string]> = [
    [/\bBBP\b/gi, "BPP"], // BBP -> BPP
    [/\bDUO\s*LINE\b/gi, "DUOLINE"], // DUO LINE -> DUOLINE
    [/\bPCK\b/gi, "PACKER"], // PCK -> PACKER
    [/\bCPS\s*[-]?\s*(\d+)\b/gi, "CPS-$1"], // CPS 01 -> CPS-01
    [/\bVAZ[ÃA]O\b/gi, "VAZAO"], // VAZÃO -> VAZAO (ASCII)
  ];
  return rules.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
}

/** Heurística de complejidad (usa texto normalizado) */
function detectComplexity(t: string) {
  const s = normalizeDomainTypos(t);
  const bullets = (s.match(/^\s*[-•]/gm) || []).length;
  const intervals = (
    s.match(/\b\d{3,4}[.,]?\d*\s*[-–\/]\s*\d{3,4}[.,]?\d*\s*m\b/gi) || []
  ).length;
  const keywords = (
    s.match(
      /\b(PACKER|B[- ]?TANDEM|BBP|BPP|BPR|RPS|MINI?FRATUR|INJETIV|TCZ|DUOLINE|CPS-\d|TF-?\d|TFR-?\d)\b/gi
    ) || []
  ).length;
  const mandatoryBoost = hasMandatoryEvents(s) ? 3 : 0;
  const longBonus = s.length > 1500 ? 2 : s.length > 800 ? 1 : 0;
  return bullets + intervals + keywords + mandatoryBoost + longBonus;
}

/** Eventos clave presentes (usa texto normalizado) */
function hasMandatoryEvents(text: string) {
  const s = normalizeDomainTypos(text);
  const punzado = /(canhone|punzad|perforad)/i.test(s);
  const ensayo =
    /\b(TF-?\d|TFR-?\d|DST|Teste\s+de\s+Avalia|inyectivid|injetiv|swab)\b/i.test(
      s
    );
  const soloPresion =
    /(sonolog|press[aã]o\s+est[aá]tica|registro\s+de\s+press[aã]o|buildup|fall[- ]?off|Pcab)/i.test(
      s
    );
  const cementBPP = /(cimenta|squeeze|BBP\b|BPP\b|tap[oã]n)/i.test(s);
  const estimul = /(mini?fratur|fratur|acidiza|estimul)/i.test(s);
  const ensayoValido = ensayo && !soloPresion;
  return punzado || ensayoValido || cementBPP || estimul;
}

function pickDetail(
  detail: DetailMode | undefined,
  text: string
): Exclude<DetailMode, "auto"> {
  if (detail === "breve" || detail === "extendido") return detail;
  if (hasMandatoryEvents(text)) return "extendido"; // fuerza extendido si hay eventos clave
  const score = detectComplexity(text);
  return score >= 6 ? "extendido" : "breve";
}

/* ==================== PROMPT ==================== */

function buildMessages(
  item: RawIntervencion,
  mode: Exclude<DetailMode, "auto">
): ChatCompletionMessageParam[] {
  const fechaPreferida = item.fechaTexto?.trim() || item.fechaISO?.trim() || "";
  const style =
    mode === "extendido"
      ? "Resumen extendido (3–6 frases)."
      : "Resumen breve (1–2 frases).";

  // normalizamos typos antes de enviar al modelo
  const normText = normalizeDomainTypos(clampText(item.text));

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "Sos un asistente técnico que resume intervenciones de pozos en español con precisión.",
    },
    {
      role: "user",
      content: `${style}\n\n${fewShot}\n\nFechaTexto: ${
        fechaPreferida || "N/A"
      }\n\nTEXTO:\n${normText}`,
    },
  ];
  return messages;
}

/* ==================== Normalización y fallbacks ==================== */

function normalizePunzados(arr: unknown): Punzado[] {
  if (!Array.isArray(arr)) return [];
  const out: Punzado[] = [];
  for (const it of arr) {
    const desde = toNum((it && (it.desde ?? it.from ?? it.start)) ?? null);
    const hasta = toNum((it && (it.hasta ?? it.to ?? it.end)) ?? null);
    const unidad =
      (typeof it?.unidad === "string" && it.unidad) ||
      (typeof it?.unit === "string" && it.unit) ||
      null;
    if (desde != null || hasta != null) {
      out.push({
        desde: desde ?? null,
        hasta: hasta ?? null,
        unidad: unidad ?? "m",
      });
    }
  }
  return out;
}

// ——— normalizeEnsayos ———
function normalizeEnsayos(arr: unknown): Ensayo[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((raw) => {
    const nombre = typeof raw?.nombre === "string" ? raw.nombre : null;
    const numero = typeof raw?.numero === "string" ? raw.numero : null;
    const fecha = typeof raw?.fecha === "string" ? raw.fecha : null;

    const intervaloRaw = raw?.intervalo ?? null;
    const intervalo =
      intervaloRaw && typeof intervaloRaw === "object"
        ? {
            desde: toNum(intervaloRaw.desde ?? intervaloRaw.from),
            hasta: toNum(intervaloRaw.hasta ?? intervaloRaw.to),
            unidad:
              (typeof intervaloRaw?.unidad === "string" &&
                intervaloRaw.unidad) ||
              (typeof intervaloRaw?.unit === "string" && intervaloRaw.unit) ||
              "m",
          }
        : null;

    const totalRec = raw?.totalRecuperado;
    const totalRecuperado =
      totalRec && typeof totalRec === "object"
        ? {
            valor: toNum(totalRec.valor),
            unidad:
              (typeof totalRec?.unidad === "string" && totalRec.unidad) ||
              (typeof totalRec?.unit === "string" && totalRec.unit) ||
              null,
          }
        : null;

    const fluidoRecuperado =
      typeof raw?.fluidoRecuperado === "string" ? raw.fluidoRecuperado : null;
    const recuperadoTexto =
      typeof raw?.recuperadoTexto === "string" ? raw.recuperadoTexto : null;
    const vazao = typeof raw?.vazao === "string" ? raw.vazao : null;
    const swab = typeof raw?.swab === "string" ? raw.swab : null;
    const nivelFluido =
      typeof raw?.nivelFluido === "string" ? raw.nivelFluido : null;
    const salinidad = typeof raw?.salinidad === "string" ? raw.salinidad : null;
    const bsw = typeof raw?.bsw === "string" ? raw.bsw : null;
    const gradosAPI = typeof raw?.gradosAPI === "string" ? raw.gradosAPI : null;
    const sopro = typeof raw?.sopro === "string" ? raw.sopro : null;
    const observacion =
      typeof raw?.observacion === "string" ? raw.observacion : null;
    const presion = typeof raw?.presion === "string" ? raw.presion : null;

    return {
      nombre,
      numero,
      fecha,
      intervalo,
      fluidoRecuperado,
      totalRecuperado,
      recuperadoTexto,
      vazao,
      swab,
      nivelFluido,
      salinidad,
      bsw,
      gradosAPI,
      presion,
      sopro,
      observacion,
    };
  });
}

/** Normaliza cementaciones/tampones */
function normalizeCementaciones(arr: unknown): CementacionTapon[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((raw) => {
    const tipoRaw =
      typeof raw?.tipo === "string" ? raw.tipo.toLowerCase() : null;
    const tipo: CementacionTapon["tipo"] =
      tipoRaw === "squeeze"
        ? "squeeze"
        : tipoRaw === "tampon_cemento"
        ? "tampon_cemento"
        : tipoRaw === "bpp"
        ? "bpp"
        : "cementacion";

    const intRaw = raw?.intervalo ?? null;
    const intervalo =
      intRaw && typeof intRaw === "object"
        ? {
            desde: toNum(intRaw.desde ?? intRaw.from),
            hasta: toNum(intRaw.hasta ?? intRaw.to),
            unidad:
              (typeof intRaw?.unidad === "string" && intRaw.unidad) ||
              (typeof intRaw?.unit === "string" && intRaw.unit) ||
              "m",
          }
        : null;

    const profundidad = toNum(raw?.profundidad);
    const unidadProfundidad =
      (typeof raw?.unidadProfundidad === "string" && raw.unidadProfundidad) ||
      (typeof raw?.profUnit === "string" && raw.profUnit) ||
      (profundidad != null ? "m" : null);

    const zona = typeof raw?.zona === "string" ? raw.zona : null;
    const observacion =
      typeof raw?.observacion === "string" ? raw.observacion : null;

    return {
      tipo,
      intervalo,
      profundidad,
      unidadProfundidad,
      zona,
      observacion,
    };
  });
}

/** Extrae rangos por zona, Int. principal y profundidades PACKER */
function extractContextRanges(text: string) {
  const zoneRanges = new Map<
    string,
    { desde: number; hasta: number; unidad: string }
  >();

  // Ej.: "CPS-01 (561,0 – 568,0m)"  /  "CPS-03 + CPS-04 (605,0 – 634,0 m)"
  const zoneRe =
    /(CPS[-\s]?\d+(?:\s*[+\/]\s*CPS[-\s]?\d+)*)[^.\n\r]*?\(\s*([0-9]{3,4}[.,]?\d*)\s*[–\-\/]\s*([0-9]{3,4}[.,]?\d*)\s*m\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = zoneRe.exec(text))) {
    const zone = m[1].replace(/\s+/g, "");
    const desde = toNum(m[2]);
    const hasta = toNum(m[3]);
    if (desde != null && hasta != null)
      zoneRanges.set(zone.toUpperCase(), { desde, hasta, unidad: "m" });
  }

  // Int. principal del bloque: "Int. 589,77/605,0 m"
  const intRe =
    /Int\.\s*([0-9]{3,4}[.,]?\d*)\s*[/–-]\s*([0-9]{3,4}[.,]?\d*)\s*m/gi;
  const mainIntervals: Array<{ desde: number; hasta: number; unidad: string }> =
    [];
  while ((m = intRe.exec(text))) {
    const d = toNum(m[1]);
    const h = toNum(m[2]);
    if (d != null && h != null)
      mainIntervals.push({ desde: d, hasta: h, unidad: "m" });
  }

  // Profundidades PACKER: "PACKER a 637,50m"
  const packerRe = /(PACKER|PCK)[^.\n\r]{0,40}?a\s*([0-9]{3,4}[.,]?\d*)\s*m/gi;
  const packerDepths: number[] = [];
  while ((m = packerRe.exec(text))) {
    const depth = toNum(m[2]);
    if (depth != null) packerDepths.push(depth);
  }

  return { zoneRanges, mainIntervals, packerDepths };
}

/** Intenta completar intervalo faltante (tests) usando zona o PACKER o Int. principal */
function fillMissingIntervals(tests: Ensayo[], text: string): Ensayo[] {
  const { zoneRanges, mainIntervals, packerDepths } =
    extractContextRanges(text);

  return tests.map((t) => {
    const hasInterval =
      t.intervalo && (t.intervalo.desde != null || t.intervalo.hasta != null);

    if (hasInterval) return t;

    // 1) Buscar zona mencionada en nombre u observación
    const nameObs = `${t.nombre ?? ""} ${t.observacion ?? ""}`.toUpperCase();
    const zoneMatch = nameObs.match(
      /CPS[-\s]?\d+(?:\s*[+\/]\s*CPS[-\s]?\d+)*/g
    );
    if (zoneMatch) {
      for (const z of zoneMatch) {
        const key = z.replace(/\s+/g, "");
        const r = zoneRanges.get(key);
        if (r) {
          return {
            ...t,
            intervalo: { desde: r.desde, hasta: r.hasta, unidad: r.unidad },
          };
        }
      }
    }

    // 2) Si es inyectividad / packer y hay profundidad PACKER
    const looksInjectivity = /INYE|INJETIV/i.test(nameObs);
    if (looksInjectivity && packerDepths.length > 0) {
      const d = packerDepths[0];
      return { ...t, intervalo: { desde: d, hasta: d, unidad: "m" } };
    }

    // 3) Usar Int. principal si existe
    if (mainIntervals.length > 0) {
      const r = mainIntervals[0];
      return {
        ...t,
        intervalo: { desde: r.desde, hasta: r.hasta, unidad: r.unidad },
      };
    }

    // 4) Último recurso
    return t;
  });
}

/** Completa intervalos en cementaciones (no aplica a BPP) con zonas o Int. principal */
function fillMissingCementIntervals(
  items: CementacionTapon[],
  text: string
): CementacionTapon[] {
  const { zoneRanges, mainIntervals } = extractContextRanges(text);

  return items.map((c) => {
    if (c.tipo === "bpp") return c; // BPP no necesita intervalo
    const hasInt =
      c.intervalo && (c.intervalo.desde != null || c.intervalo.hasta != null);
    if (hasInt) return c;

    // Intentar por zona
    if (c.zona) {
      const key = c.zona.toUpperCase().replace(/\s+/g, "");
      const r = zoneRanges.get(key);
      if (r)
        return {
          ...c,
          intervalo: { desde: r.desde, hasta: r.hasta, unidad: r.unidad },
        };
    }

    // Usar Int. principal del bloque
    if (mainIntervals.length > 0) {
      const r = mainIntervals[0];
      return {
        ...c,
        intervalo: { desde: r.desde, hasta: r.hasta, unidad: r.unidad },
      };
    }

    return c;
  });
}

/** Filtra: mantener BPP y cementaciones/squeeze SOLO si son sobre intervalos punzados (no furo do revestimento) */
function filterCementacionesForPerforated(
  items: CementacionTapon[],
  text: string
): CementacionTapon[] {
  const norm = normalizeDomainTypos(text);
  const isCasingHoleContext = /furo\s+do?\s+revestiment/i.test(norm);

  return items.filter((c) => {
    if (c.tipo === "bpp") return true; // siempre BPP
    if (
      isCasingHoleContext &&
      !(c.intervalo && c.intervalo.desde != null && c.intervalo.hasta != null)
    ) {
      // contexto de furo en revestimiento y sin intervalo -> descartar
      return false;
    }
    // cementación/squeeze: debe tener intervalo (sobre punzados)
    return !!(
      c.intervalo &&
      c.intervalo.desde != null &&
      c.intervalo.hasta != null
    );
  });
}

/** Detecta BPP y profundidad para garantizar mención en el resumen */
function extractBPP(text: string): {
  present: boolean;
  depth: number | null;
  zone: string | null;
} {
  const norm = normalizeDomainTypos(text);
  // "BPP ... a 639,0 m" (con posible zona cerca)
  const re = /\bBPP\b([^.\n\r]{0,80}?)(?:a\s*)?([0-9]{3,4}[.,]?\d*)\s*m/gi;
  const m = re.exec(norm);
  if (m) {
    const depth = toNum(m[2]);
    // Buscar zona (CPS-xx o SERRARIA) en la vecindad capturada
    const seg = m[1] || "";
    const zoneMatch = seg.match(/\b(CPS[-\s]?\d+|SERRARIA)\b/i);
    const zone = zoneMatch
      ? zoneMatch[1].toUpperCase().replace(/\s+/g, "")
      : null;
    return { present: true, depth: depth ?? null, zone };
  }
  // Sin profundidad, pero aparece BPP
  if (/\bBPP\b/i.test(norm)) return { present: true, depth: null, zone: null };
  return { present: false, depth: null, zone: null };
}

function ensureBPPInResumen(resumen: string, text: string) {
  const info = extractBPP(text);
  if (!info.present) return resumen; // no hay BPP en el bloque
  if (/\bBPP\b/i.test(resumen) || /\bBBP\b/i.test(resumen)) return resumen; // ya está mencionado

  const parts: string[] = [];
  if (info.zone) parts.push(`en ${info.zone}`);
  if (info.depth != null) parts.push(`a ${info.depth} m`);
  const extra = parts.length ? ` (${parts.join(", ")})` : "";

  const clause = ` Se aisló con BPP${extra}.`;
  const trimmed = resumen.trim();
  const needsDot = trimmed.length > 0 && !/[.!?]$/.test(trimmed);
  return trimmed + (needsDot ? "." : "") + clause;
}

function normalizeFluidTerms(s: string | null | undefined) {
  if (!s) return s ?? null;
  // aceite -> óleo (con posibles plurales)
  return s.replace(/\baceites?\b/gi, "óleo");
}

function normalizeResumenTerms(s: string) {
  // también normalizamos en el resumen
  return normalizeFluidTerms(s) ?? s;
}

/** ¿Hay palabras de canhoneo/punzado en el texto crudo? */
function hasPunzadoKeywords(text: string) {
  return /(canhone|punzad|perforad|tiros?)/i.test(text);
}

/** Si no hay keywords de punzado en el bloque, eliminamos "punzados" devueltos por el modelo */
function filterPunzadosByKeywords(text: string, punzados: Punzado[]) {
  if (!hasPunzadoKeywords(text)) return [];
  return punzados;
}

function extractRecuperadoTextoFromBlock(text: string): string | null {
  // ES/PT: Recuperado/Recuperados/Recuperou …
  const re = /\b(Recuperad[oa]s?|Recuperou)\b[^.\n\r]*(?:\.[^\n\r]*)?/gi;
  const m = text.match(re);
  if (!m || m.length === 0) return null;
  return m
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function guessFluidoFromRecuperado(s: string | null): string | null {
  if (!s) return null;
  const hasOleo = /\b(óleo|oleo|petro(?:leo)?)\b/i.test(s);
  const hasAgua = /\b(água|agua)\b/i.test(s);
  const hasGas = /\b(g[aá]s|gas)\b/i.test(s);
  const parts: string[] = [];
  if (hasOleo) parts.push("óleo");
  if (hasAgua) parts.push("agua");
  if (hasGas) parts.push("gas");
  return parts.length ? parts.join(" y ") : null;
}

/** Extrae la primera frase relacionada a sopro/fluxo del bloque completo */
function extractSoproBlock(text: string): string | null {
  // normalizamos saltos y mantenemos acentos
  const norm = text.replace(/\r/g, "");

  // 1) Arrancar en la primera mención de sopro/fluxo/surgência/surgió/surgiu (PT + ES)
  const startRe =
    /\b(sopro|fluxo|flujo|surg(?:iu|i[oó])|surg[êe]ncia|surgencia)\b/i;
  const mStart = startRe.exec(norm);
  if (!mStart) return null;
  const startIdx = mStart.index;

  // Trabajamos sobre el texto a partir del inicio detectado
  const after = norm.slice(startIdx);

  // 2) Candidatos de corte:
  //    a) primera línea en blanco (fin de párrafo del sopro/fluxo)
  const paraBreakRe = /\n\s*\n/;
  const mPara = paraBreakRe.exec(after);

  //    b) antes de métricas u otras secciones (Recuperado, Q, IP, Ke, Dano, Pe, Salinidad, BSW, API, Visc., Óleo…)
  const stopRe =
    /(Recuperad[oa]s?|Recuperou|Recuperado)\b|^[ \t]*(Q|Qt)\s*=|Vaz[ãa]o|^[ \t]*IP\s*=|^[ \t]*Ke\s*=|^[ \t]*Dano\s*=|^[ \t]*Pe\s*=|Salin|^Óleo\s*:|^Oleo\s*:|^Visc\.|^[ \t]*BSW\b|^[ \t]*Grau?s?\s*API\b/gim;
  const mStop = stopRe.exec(after);

  // 3) Tomar el corte más temprano entre (a) y (b)
  let endRel = after.length;
  if (mPara && mPara.index < endRel) endRel = mPara.index;
  if (mStop && mStop.index < endRel) endRel = mStop.index;

  const slice = after.slice(0, endRel);

  // 4) Limpieza ligera
  return slice
    .replace(/[ \t]+/g, " ")
    .replace(/\s*([.;])\s*/g, "$1 ")
    .trim();
}

/** Garantiza el prefijo “Sopro: ” y limpia duplicados tipo “Sopro: sopro …” */
function normalizeSoproLabel(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!v) return null;
  const body = v.replace(/^sopro\b[:\s-]*/i, "").trim();
  return body ? `Sopro: ${body}` : null;
}

function isInjectivityTest(t: Ensayo) {
  const s = `${t.nombre ?? ""} ${t.observacion ?? ""}`.toLowerCase();
  return /injetiv|inyectiv|injectiv|packer/.test(s);
}

function extractInjectivityPsi(text: string): string | null {
  const norm = text.replace(/\r/g, " ").replace(/[ \t]+/g, " ");
  // Cortamos en oraciones (punto, fin de línea o punto y coma)
  const sentences = norm
    .split(/(?<=[.!?])\s+|[\n;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  // Relevante sólo si menciona injetividade/inyectividad o vazão/BPM
  const RELEVANT =
    /(injetiv|inyectiv|injectiv|teste\s+de\s+injetiv|vaz[ãa]o|bpm)/i;

  // Ruido/descartar: cementación/squeeze/tapón/BPP/assentado/injetado/isolamento
  const NOISE =
    /(ciment|pasta\s+de\s+cimento|squeeze|tap(?:[ãa]o|on)|\bBPP\b|assentad|injetad[oa]|isolament)/i;

  const out: string[] = [];

  for (const s of sentences) {
    if (!/psi\b/i.test(s)) continue; // debe tener psi
    if (!RELEVANT.test(s)) continue; // y ser frase de inyectividad/caudal
    if (NOISE.test(s)) continue; // no cementación/aislamiento/etc.

    // Extraer Coluna/Anular/Pressão ... psi dentro de la frase
    let m: RegExpExecArray | null;

    const reCol = /(colu(?:na|mn)a)[^.\n\r]{0,20}?(\d+[.,]?\d*)\s*psi/gi;
    while ((m = reCol.exec(s))) out.push(`Coluna ${m[2]} psi`);

    const reAnu = /(anular)[^.\n\r]{0,20}?(\d+[.,]?\d*)\s*psi/gi;
    while ((m = reAnu.exec(s))) out.push(`Anular ${m[2]} psi`);

    const rePrs = /press[aã]o[^.\n\r]{0,20}?(\d+[.,]?\d*)\s*psi/gi;
    while ((m = rePrs.exec(s))) out.push(`Pressão ${m[1]} psi`);
  }

  // Quitar duplicados y unir
  const uniq = Array.from(new Set(out));
  return uniq.length ? uniq.join("; ") : null;
}

// --- helpers de normalización y segmentación por eventos ---
function normalizeLite(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin acentos
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .toLowerCase()
    .trim();
}

type Evento = { idx: number; start: number; end: number; text: string };

// Parte el texto en eventos que comienzan con "- "
function splitEventsByDash(text: string): Evento[] {
  const src = text.replace(/\r/g, "");
  const lines = src.split("\n");
  // offsets de inicio de cada línea para poder mapear índices
  const offsets: number[] = [];
  let acc = 0;
  for (const ln of lines) {
    offsets.push(acc);
    acc += ln.length + 1;
  }

  const bulletIdxs: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*-\s+\S/.test(lines[i])) bulletIdxs.push(offsets[i]);
  }
  if (bulletIdxs.length === 0)
    return [{ idx: 0, start: 0, end: src.length, text: src }];

  const out: Evento[] = [];
  for (let i = 0; i < bulletIdxs.length; i++) {
    const start = bulletIdxs[i];
    const end = i + 1 < bulletIdxs.length ? bulletIdxs[i + 1] : src.length;
    out.push({ idx: i, start, end, text: src.slice(start, end).trim() });
  }
  return out;
}

// Busca una posición "ancla" del test en el texto original
function findTestAnchorIndex(t: Ensayo, text: string): number {
  const name = (t.nombre ?? "").toUpperCase();
  const num = (t.numero ?? "").replace(/\s+/g, "");
  const patterns: RegExp[] = [];

  // TI (teste de injetividade)
  if (/^TI\b/.test(name) || /INJETIV|INJECTIV|INYECTIV/i.test(name)) {
    patterns.push(/\bTI\b[ -]?\d*/i, /teste\s+de\s+inj(et|ec)tiv/i);
  }
  // TF/TFR/DST/RPS
  if (/^TF\b/.test(name)) patterns.push(/\bTF-?\s*\d*/i);
  if (/^TFR\b/.test(name)) patterns.push(/\bTFR-?\s*\d*/i);
  if (/^DST\b/.test(name)) patterns.push(/\bDST\b/i);
  if (/^RPS\b/.test(name)) patterns.push(/\bRPS-?\s*\d*/i);

  // Si hay número, intentá con él (RPS-01, TI-2, etc.)
  if (num) {
    const base = name.split(/\s|-/)[0] || "";
    if (base) patterns.push(new RegExp(`\\b${base}\\s*-?\\s*0*${num}\\b`, "i"));
  }

  let best = -1;
  for (const re of patterns) {
    const pos = text.search(re);
    if (pos >= 0 && (best < 0 || pos < best)) best = pos;
  }
  return best;
}

function eventIndexForPos(events: Evento[], pos: number): number {
  if (pos < 0) return -1;
  for (let i = 0; i < events.length; i++) {
    if (pos >= events[i].start && pos < events[i].end) return i;
  }
  return -1;
}

// ¿needle aparece dentro del evento? (comparación normalizada)
function includesInEvent(evText: string, needle: string): boolean {
  if (!needle) return false;
  const H = normalizeLite(evText);
  const N = normalizeLite(needle);
  return N.length > 0 && H.includes(N);
}

function pickFechaPreferida(
  fechaTexto?: string | null,
  fechaISO?: string | null
) {
  const raw = (fechaTexto || fechaISO || "").trim();
  if (!raw) return "";

  // Detecta: "08 a 14/07/2010", "08–14/07/2010", "08-14/07/2010", "12/06 a 14/06/2010"
  const m = raw.match(
    /(?:^|.*?)(\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?)\s*(?:a|al|até|–|-)\s*(\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?)$/i
  );
  return m ? m[2] : raw;
}

/* ==================== Core ==================== */

async function summarizeOne(
  item: RawIntervencion,
  mode: Exclude<DetailMode, "auto">
) {
  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: buildMessages(item, mode),
  });

  const content = resp.choices[0]?.message?.content || "{}";
  let resumen = "";
  let punzados: Punzado[] = [];
  let tests: Ensayo[] = [];
  let cementaciones: CementacionTapon[] = [];
  let estimulaciones: Estimulacion[] = [];

  const tryParse = (txt: string) => {
    const obj = JSON.parse(txt);
    return {
      resumen: typeof obj?.resumen === "string" ? obj.resumen : "",
      punzados: normalizePunzados(obj?.punzados ?? []),
      tests: normalizeEnsayos(obj?.tests ?? []),
      cementaciones: normalizeCementaciones(obj?.cementaciones ?? []),
      estimulaciones: normalizeEstimulaciones(obj?.estimulaciones ?? []),
    };
  };

  try {
    ({ resumen, punzados, tests, cementaciones, estimulaciones } =
      tryParse(content));
  } catch {
    const sliced = content.replace(/^[\s\S]*?{/, "{").replace(/}[\s\S]*$/, "}");
    try {
      ({ resumen, punzados, tests, cementaciones, estimulaciones } =
        tryParse(sliced));
    } catch {
      resumen = content.slice(0, 300).trim();
      punzados = [];
      tests = [];
      cementaciones = [];
      estimulaciones = [];
    }
  }

  // Fallbacks con texto normalizado
  const normText = normalizeDomainTypos(item.text);
  tests = fillMissingIntervals(tests, normText);
  const soproEnBloque = extractSoproBlock(normText);

  const events = splitEventsByDash(normText);
  const fechaIntervencion = pickFechaPreferida(item.fechaTexto, item.fechaISO);

  tests = tests.map((t) => {
    // evento al que pertenece el test
    const anchorPos = findTestAnchorIndex(t, normText);
    const evIdx = eventIndexForPos(events, anchorPos);
    const evText = evIdx >= 0 ? events[evIdx].text : null;

    // 1) Recuperado: conservar solo si está dentro del evento del test
    const recTxt = t.recuperadoTexto ?? null;
    // if (recTxt && evText && !includesInEvent(evText, recTxt)) {
    //   recTxt = null;
    // }

    // 2) Fluido a partir del recuperado (si existe)
    const fluidFromRec = guessFluidoFromRecuperado(recTxt);
    let fluido = normalizeFluidTerms(
      t.fluidoRecuperado ?? fluidFromRec ?? null
    );

    if (
      fluido &&
      /\b(lama|lodo|mud|fluido\s+de\s+perfura[cç]?[aã]o)\b/i.test(fluido) &&
      t.vazao
    ) {
      const v = t.vazao.toLowerCase();
      if (/oleo\b|q[\s=]*o/.test(deaccent(v))) fluido = "óleo";
      else if (/gas\b|q[\s=]*g/.test(deaccent(v))) fluido = "gas";
      else if (/agua\b|q[\s=]*a/.test(deaccent(v))) fluido = "agua";
    }

    // 3) SOPRO: idem, solo si pertenece al evento del test (sin fallback global)
    let soproLLM = t.sopro ?? null;
    if (soproLLM && evText && !includesInEvent(evText, soproLLM)) {
      soproLLM = null;
    }

    // 4) Presión: si es TI, extraer psi solo del evento (o del bloque si no hay evento)
    const presion =
      t.presion ??
      (isInjectivityTest(t) ? extractInjectivityPsi(evText ?? normText) : null);

    return {
      ...t,
      nombre:
        [t.nombre, t.numero]
          .filter((s): s is string => !!s && s.trim().length > 0)
          .join("-") || null,
      presion,
      sopro: normalizeSoproLabel(soproLLM),
      fecha: t.fecha ?? fechaIntervencion,
      vazao: sanitizeVazao(t.vazao),
      recuperadoTexto: recTxt,
      fluidoRecuperado: fluido,
      observacion: normalizeFluidTerms(t.observacion),
    };
  });
  cementaciones = fillMissingCementIntervals(cementaciones, normText);
  cementaciones = filterCementacionesForPerforated(cementaciones, normText);
  punzados = filterPunzadosByKeywords(normText, punzados);

  estimulaciones = estimulaciones.map((e) => ({
    ...e,
    fecha: e.fecha || fechaIntervencion,
    vazao: sanitizeVazao(e.vazao || null),
  }));

  // Asegurar BPP en resumen si estaba en el texto
  resumen = normalizeResumenTerms(resumen)
    .replace(/\s{2,}/g, " ")
    .trim();
  resumen = ensureBPPInResumen(resumen, normText);

  return { resumen, punzados, tests, cementaciones, estimulaciones };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const detailIn: DetailMode =
      body?.detail === "breve" ||
      body?.detail === "extendido" ||
      body?.detail === "auto"
        ? body.detail
        : "auto";

    const items: RawIntervencion[] = Array.isArray(body?.items)
      ? body.items
      : body?.item
      ? [body.item]
      : [];

    if (!items.length) {
      return NextResponse.json(
        { ok: false, error: "Faltan 'items' o 'item'." },
        { status: 400 }
      );
    }

    const summaries: Array<{
      index: number | null;
      resumen: string;
      mode: "breve" | "extendido";
      punzados: Punzado[];
      tests: Ensayo[];
      cementaciones: CementacionTapon[];
      estimulaciones: Estimulacion[];
    }> = [];

    for (const it of items) {
      const mode = pickDetail(detailIn, it.text);
      const out = await summarizeOne(it, mode);
      summaries.push({
        index: typeof it.index === "number" ? it.index : null,
        resumen: out.resumen,
        mode,
        punzados: out.punzados,
        tests: out.tests,
        cementaciones: out.cementaciones,
        estimulaciones: out.estimulaciones,
      });
    }

    return NextResponse.json({ ok: true, summaries });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
