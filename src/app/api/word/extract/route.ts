// app/api/word/extract/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import * as mammoth from "mammoth";
import { z } from "zod";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/* ============== Utilidades ============== */
const toNum = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", ".").replace(/\s/g, ""));
    return Number.isNaN(n) ? null : n;
  }
  return null;
};

const ISO_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/;

// Meses ES/PT (sin tildes; ya normalizamos abajo)
const MONTHS_MAP: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  ene: 1,
  enero: 1,
  fev: 2,
  feb: 2,
  fevereiro: 2,
  febrero: 2,
  mar: 3,
  marco: 3,
  marzo: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  may: 5,
  mayo: 5,
  jun: 6,
  junho: 6,
  junio: 6,
  jul: 7,
  julho: 7,
  julio: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  sep: 9,
  sept: 9,
  setembro: 9,
  septiembre: 9,
  out: 10,
  oct: 10,
  outubro: 10,
  octubre: 10,
  nov: 11,
  novembro: 11,
  noviembre: 11,
  dez: 12,
  dic: 12,
  dezembro: 12,
  diciembre: 12,
};
function normalizeYY(yy: number): number {
  return yy >= 50 ? 1900 + yy : 2000 + yy;
}
function parseMonthYearToISOLastDay(
  text: string | null | undefined
): string | null {
  if (!text) return null;
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
  const re = /\b([a-z]{3,12})\s*(?:\/|-|\s+de\s+|\s+)\s*(\d{2,4})\b/i;
  const m = t.match(re);
  if (!m) return null;
  const mon = MONTHS_MAP[m[1]];
  if (!mon) return null;
  let year = parseInt(m[2], 10);
  if (year < 100) year = normalizeYY(year);
  const last = new Date(year, mon, 0).getDate();
  const mm = String(mon).padStart(2, "0");
  const dd = String(last).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// Normaliza tipo
function normalizeTipo(
  input: unknown
): "ensayo" | "punzado" | "estimulacion" | "cementacion" | null {
  if (input == null) return null;
  const s = String(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
  if (
    /^(ensayo|tf(-?\w+)?|teste\s*de\s*fluxo|flow\s*test|teste\s*de\s*produc)/.test(
      s
    )
  )
    return "ensayo";
  if (/^(punzado|punzon|punco|perfor|perforacion|gun|tiro)/.test(s))
    return "punzado";
  if (/^(estimulacion|estimulacao|estimulo|acidiz|fractur|frack)/.test(s))
    return "estimulacion";
  if (/^(cementacion|cimentacion|cimentacao|cementa|squeeze)/.test(s))
    return "cementacion";
  if (["ensayo", "punzado", "estimulacion", "cementacion"].includes(s))
    return s as any;
  return null;
}

// Clasificación de fluido (incluye combos con gas)
type FluidoClase =
  | "oleo"
  | "agua"
  | "gas"
  | "oleo_y_agua"
  | "agua_y_oleo"
  | "oleo_y_gas"
  | "gas_y_oleo"
  | "agua_y_gas"
  | "gas_y_agua"
  | "no_especificado";

function classifyFluidoRecuperado(s: unknown): FluidoClase | null {
  if (typeof s !== "string") return null;
  const t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const hasOil = /(oleo|petroleo)/.test(t),
    hasWater = /\bagua\b/.test(t),
    hasGas = /\bgas\b/.test(t);
  const io = t.indexOf("oleo"),
    iw = t.indexOf("agua"),
    ig = t.indexOf("gas");
  if (hasOil && hasWater && !hasGas)
    return io >= 0 && (iw < 0 || io <= iw) ? "oleo_y_agua" : "agua_y_oleo";
  if (hasOil && hasGas && !hasWater)
    return io >= 0 && (ig < 0 || io <= ig) ? "oleo_y_gas" : "gas_y_oleo";
  if (hasWater && hasGas && !hasOil)
    return iw >= 0 && (ig < 0 || iw <= ig) ? "agua_y_gas" : "gas_y_agua";
  if (hasOil) return "oleo";
  if (hasWater) return "agua";
  if (hasGas) return "gas";
  return "no_especificado";
}

function normalizeUnit(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = u.toLowerCase().replace(/\s+/g, "");
  if (s === "m³") return "m3";
  if (s === "bbls") return "bbl";
  if (s === "lt" || s === "lts") return "l";
  return s;
}

function inferTotalFromText(text: string | null | undefined) {
  if (!text) return { valor: null, unidad: null, full: null as string | null };
  const re = /(\d+(?:[.,]\d+)?)\s*(m3|m³|m|bbl|l|gal)\b/i;
  const m = text.match(re);
  if (!m) return { valor: null, unidad: null, full: null as string | null };
  return { valor: toNum(m[1]), unidad: normalizeUnit(m[2]), full: text };
}

/* ============== Schemas Zod ============== */
const IntervaloBareSchema = z.object({
  desde: z.preprocess(toNum, z.number().nullish()),
  hasta: z.preprocess(toNum, z.number().nullish()),
  unidad: z.string().nullish(),
});
const IntervaloSchema = IntervaloBareSchema.nullish();

const IntervencionSchema = z.object({
  tipo: z.enum(["ensayo", "punzado", "estimulacion", "cementacion"]),
  fechaISO: z.string().regex(ISO_RE).nullish(),
  fechaTexto: z.string().nullish(),

  // Ensayo
  numeroEnsayo: z.preprocess(
    (v) => (v == null ? null : String(v)),
    z.string().nullish()
  ),
  intervalo: IntervaloSchema,
  fluidoRecuperado: z.string().nullish(),
  fluidoRecuperadoClasificacion: z
    .enum([
      "oleo",
      "agua",
      "gas",
      "oleo_y_agua",
      "agua_y_oleo",
      "oleo_y_gas",
      "gas_y_oleo",
      "agua_y_gas",
      "gas_y_agua",
      "no_especificado",
    ])
    .nullish(),
  totalRecuperado: z
    .object({
      valor: z.preprocess(toNum, z.number().nullish()),
      unidad: z.string().nullish(),
    })
    .nullish(),
  totalRecuperadoTexto: z.string().nullish(),

  // Punzado
  intervalosPunzado: z
    .preprocess((v) => (v == null ? [] : v), z.array(IntervaloBareSchema))
    .default([]),

  observaciones: z.string().nullish(),
});

const ExtractionSchema = z.object({
  intervenciones: z.array(IntervencionSchema).default([]),
});
type Extraction = z.infer<typeof ExtractionSchema>;

/* ============== JSON Schema para tools ============== */
const extractionParametersSchema = {
  type: "object",
  properties: {
    intervenciones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: ["ensayo", "punzado", "estimulacion", "cementacion"],
          },
          fechaISO: { type: "string", nullable: true },
          fechaTexto: { type: "string", nullable: true },
          numeroEnsayo: { type: "string", nullable: true },
          intervalo: {
            type: "object",
            properties: {
              desde: { type: ["number", "string", "null"] },
              hasta: { type: ["number", "string", "null"] },
              unidad: { type: "string", nullable: true },
            },
            nullable: true,
          },
          fluidoRecuperado: { type: "string", nullable: true },
          fluidoRecuperadoClasificacion: {
            type: "string",
            enum: [
              "oleo",
              "agua",
              "gas",
              "oleo_y_agua",
              "agua_y_oleo",
              "oleo_y_gas",
              "gas_y_oleo",
              "agua_y_gas",
              "gas_y_agua",
              "no_especificado",
            ],
            nullable: true,
          },
          totalRecuperado: {
            type: "object",
            properties: {
              valor: { type: ["number", "string", "null"] },
              unidad: { type: "string", nullable: true },
            },
            nullable: true,
          },
          totalRecuperadoTexto: { type: "string", nullable: true },
          intervalosPunzado: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: {
                desde: { type: ["number", "string", "null"] },
                hasta: { type: ["number", "string", "null"] },
                unidad: { type: "string", nullable: true },
              },
            },
            default: [],
          },
          observaciones: { type: "string", nullable: true },
        },
        required: ["tipo"],
      },
      default: [],
    },
  },
} as const;

/* ============== Tools helpers ============== */
function getToolArgs(
  completion: OpenAI.Chat.Completions.ChatCompletion
): string | null {
  const msg = completion.choices?.[0]?.message;
  const calls = msg?.tool_calls;
  if (Array.isArray(calls)) {
    const fnCall = calls.find((c) => c.type === "function");
    if (fnCall && "function" in fnCall) {
      const args = (
        fnCall as Extract<(typeof calls)[number], { type: "function" }>
      ).function.arguments;
      if (typeof args === "string") return args;
    }
  }
  const legacy = (msg as any)?.function_call?.arguments;
  return typeof legacy === "string" ? legacy : null;
}

/* ============== Fallback punzados ============== */
function findPunzadoMentions(text: string): number {
  const matches = text.match(/^\s*PUNZAD[OA]\b.*$/gim);
  return matches ? matches.length : 0;
}
function ensurePunzados(o: any, text: string): any {
  const arr = Array.isArray(o?.intervenciones) ? o.intervenciones : [];
  const modelCount = arr.filter(
    (x: any) => normalizeTipo(x?.tipo) === "punzado"
  ).length;
  const mentions = findPunzadoMentions(text);
  const missing = Math.max(0, mentions - modelCount);
  if (missing <= 0) return o;
  const placeholders = Array.from({ length: missing }, () => ({
    tipo: "punzado",
    intervalosPunzado: [],
  }));
  return { ...o, intervenciones: [...arr, ...placeholders] };
}

/* ============== Sanitización ============== */
function sanitizeIntervenciones(o: any): any {
  const out: any = { intervenciones: [] as any[] };
  const arr = Array.isArray(o?.intervenciones) ? o.intervenciones : [];

  out.intervenciones = arr.map((it: any) => {
    const tipo = normalizeTipo(it?.tipo);

    // fechas: acepta ISO o deriva de "MMM/YY"
    const rawFechaISO =
      typeof it?.fechaISO === "string" && ISO_RE.test(it.fechaISO)
        ? it.fechaISO
        : null;
    const rawFechaTexto =
      typeof it?.fechaTexto === "string" && it.fechaTexto.trim().length > 0
        ? it.fechaTexto
        : null;
    const isoFromMY = rawFechaISO
      ? null
      : parseMonthYearToISOLastDay(rawFechaTexto);
    const fechaISO = rawFechaISO ?? isoFromMY;
    const fechaTexto = rawFechaTexto;

    // intervalo ensayo
    const intervalo =
      it?.intervalo && typeof it.intervalo === "object"
        ? {
            desde: toNum(it.intervalo.desde),
            hasta: toNum(it.intervalo.hasta),
            unidad:
              typeof it.intervalo.unidad === "string"
                ? it.intervalo.unidad
                : null,
          }
        : null;

    // punzado: lista
    const intervalosPunzado =
      Array.isArray(it?.intervalosPunzado) && it.intervalosPunzado.length
        ? it.intervalosPunzado.map((iv: any) => ({
            desde: toNum(iv?.desde),
            hasta: toNum(iv?.hasta),
            unidad: typeof iv?.unidad === "string" ? iv.unidad : null,
          }))
        : [];

    // totales + fluido
    let totalRecuperado =
      it?.totalRecuperado && typeof it.totalRecuperado === "object"
        ? {
            valor: toNum(it.totalRecuperado.valor),
            unidad:
              typeof it.totalRecuperado.unidad === "string"
                ? it.totalRecuperado.unidad
                : null,
          }
        : null;

    const fluidoRecuperado =
      typeof it?.fluidoRecuperado === "string" ? it.fluidoRecuperado : null;

    let totalRecuperadoTexto =
      typeof it?.totalRecuperadoTexto === "string"
        ? it.totalRecuperadoTexto
        : null;

    if (
      (!totalRecuperado || totalRecuperado.valor == null) &&
      fluidoRecuperado
    ) {
      const inferred = inferTotalFromText(fluidoRecuperado);
      if (inferred.valor != null) {
        totalRecuperado = { valor: inferred.valor, unidad: inferred.unidad };
        if (!totalRecuperadoTexto) totalRecuperadoTexto = inferred.full;
      }
    }

    const incoming = it?.fluidoRecuperadoClasificacion;
    const fluidoRecuperadoClasificacion: FluidoClase | null =
      incoming &&
      [
        "oleo",
        "agua",
        "gas",
        "oleo_y_agua",
        "agua_y_oleo",
        "oleo_y_gas",
        "gas_y_oleo",
        "agua_y_gas",
        "gas_y_agua",
        "no_especificado",
      ].includes(String(incoming))
        ? (incoming as FluidoClase)
        : classifyFluidoRecuperado(fluidoRecuperado);

    const observaciones =
      tipo === "punzado"
        ? null
        : typeof it?.observaciones === "string"
        ? it.observaciones
        : null;

    return {
      tipo,
      fechaISO,
      fechaTexto,
      numeroEnsayo:
        tipo === "ensayo" && it?.numeroEnsayo != null
          ? String(it.numeroEnsayo)
          : null,
      intervalo: tipo === "ensayo" ? intervalo : null,
      fluidoRecuperado,
      fluidoRecuperadoClasificacion:
        tipo === "ensayo" ? fluidoRecuperadoClasificacion : null,
      totalRecuperado: tipo === "ensayo" ? totalRecuperado : null,
      totalRecuperadoTexto: tipo === "ensayo" ? totalRecuperadoTexto : null,
      intervalosPunzado: tipo === "punzado" ? intervalosPunzado : [],
      observaciones,
    };
  });

  return out;
}

/* ============== Handler ============== */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return NextResponse.json({ error: "Solo .docx" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { value: text } = await mammoth.extractRawText({ buffer: buf });
    const clipped = text.slice(0, 120_000);

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Extraé SOLO intervenciones. Tipos válidos EXACTOS (sin tildes): 'ensayo' | 'punzado' | 'estimulacion' | 'cementacion'. " +
            "Mapeá 'TF', 'TF-01', 'TF-1', 'teste de fluxo', 'flow test', 'teste de produção' a tipo='ensayo'. " +
            "Para 'ensayo' devolvé SIEMPRE: numeroEnsayo, intervalo {desde,hasta,unidad}, fechaISO si la hay (si no, fechaTexto), " +
            "fluidoRecuperado (texto), fluidoRecuperadoClasificacion ∈ {oleo, agua, gas, oleo_y_agua, agua_y_oleo, oleo_y_gas, gas_y_oleo, agua_y_gas, gas_y_agua, no_especificado}, " +
            "totalRecuperado {valor,unidad} y totalRecuperadoTexto. Si 'Total recuperado' es '?', inferí del texto de 'Fluido' si dice 'Recuperado N unidad ...'. " +
            "Para 'punzado' NO pongas observaciones: devolvé SOLO intervalosPunzado [{desde,hasta,unidad}]. " +
            "Si un punzado no tiene intervalos explícitos, IGUAL devolvé un item con intervalosPunzado: []. " + // <- importante
            "Si el encabezado de fecha está en formato mes/año (p.ej. 'NOV/79', 'Dez/77', 'Mai/82'), asigná ese encabezado a todas las intervenciones hasta el próximo encabezado y escribilo en fechaTexto (no inventes día). " + // <- importante
            "Si dudás, usá null o []. Devolvé solo llamando a la función.",
        },
        {
          role: "user",
          content:
            "Texto del documento (ignorar portada / tablas generales y enfocarse en intervenciones y TF):\n\n" +
            clipped,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_extraction",
            description: "Guarda solo las intervenciones extraídas.",
            parameters: extractionParametersSchema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_extraction" } },
      temperature: 0.1,
    });

    const argsStr = getToolArgs(completion);
    if (!argsStr) {
      return NextResponse.json(
        { error: "No tool call detected" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(argsStr);

    // Asegura punzados si el modelo omitió alguno (detectado por texto)
    const withPlaceholders = ensurePunzados(parsed, clipped);

    const cleaned = sanitizeIntervenciones(withPlaceholders);
    const data: Extraction = ExtractionSchema.parse(cleaned);

    return NextResponse.json({ ok: true, intervenciones: data.intervenciones });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
