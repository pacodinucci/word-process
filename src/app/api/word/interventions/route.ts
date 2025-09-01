// app/api/word/interventions/route.ts
import { NextResponse } from "next/server";
import * as mammoth from "mammoth";

export const runtime = "nodejs";

const clean = (s: string) =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

function sliceFromHistorico(full: string) {
  const RE = /HIST[OÓ]RICO\s+(?:DE|DO)\s+PO[ZCÇ]O|HISTORIAL\s+DEL\s+POZO/i;
  const m = RE.exec(full);
  return m ? full.slice(m.index) : full;
}

// ---- Meses permitidos (ES/PT), minúsculas o mayúsculas por flag /i ----
const MONTH_TOKENS = [
  "jan",
  "janeiro",
  "ene",
  "enero",
  "fev",
  "feb",
  "fevereiro",
  "febrero",
  "mar",
  "marco",
  "março",
  "marzo",
  "abr",
  "abril",
  "mai",
  "may",
  "mayo",
  "jun",
  "junho",
  "junio",
  "jul",
  "julho",
  "julio",
  "ago",
  "agosto",
  "set",
  "sep",
  "sept",
  "setembro",
  "septiembre",
  "out",
  "oct",
  "outubro",
  "octubre",
  "nov",
  "novembro",
  "noviembre",
  "dez",
  "dic",
  "dezembro",
  "diciembre",
];

// dd/mm/yy(yy)
const DMY = String.raw`\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}`;
// ISO yyyy-mm-dd
const YMD = String.raw`\d{4}-\d{2}-\d{2}`;
// Mes/aa(aaaa) **solo si el token es un mes permitido**
const MONY = String.raw`(?:${MONTH_TOKENS.join("|")})[\/-]\d{2,4}`;
// Rango: "03 a 09/02/2014" o "11 a 16/12/2006"
const DMY_RANGE = String.raw`\d{1,2}\s*(?:a|al|–|-|—)\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}`;

// La fecha debe estar al **comienzo de línea**
const DATE_LINE = new RegExp(
  String.raw`^(\s*(?:${DMY_RANGE}|${DMY}|${YMD}|${MONY}))\b`,
  "gmi"
);

const MONTHS: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  ene: 1,
  enero: 1,
  fev: 2,
  feb: 2,
  fevereiro: 2,
  febrero: 2,
  mar: 3,
  março: 3,
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

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

function toISO(fecha: string | null) {
  if (!fecha) return null;
  const t = fecha.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  // dd/mm/yyyy(yy)
  let m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
    const d = String(+m[1]).padStart(2, "0");
    const mo = String(+m[2]).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  // 12 de mayo de 1982
  m = norm(t).match(/(\d{1,2})\s+de\s+([a-z]{3,12})\s+(\d{2,4})/);
  if (m) {
    const mon = MONTHS[m[2]];
    if (mon) {
      let y = +m[3];
      if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
      const d = String(+m[1]).padStart(2, "0");
      return `${y}-${String(mon).padStart(2, "0")}-${d}`;
    }
  }

  // OUT/70, Mai/82, Nov-1979…
  m = norm(t).match(/([a-z]{3,12})[\/-](\d{2,4})/);
  if (m) {
    const mon = MONTHS[m[1]];
    if (mon) {
      let y = +m[2];
      if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
      const last = new Date(y, mon, 0).getDate();
      return `${y}-${String(mon).padStart(2, "0")}-${String(last).padStart(
        2,
        "0"
      )}`;
    }
  }

  // Rango "03 a 09/02/2014" -> usamos la fecha final
  m = norm(t).match(
    /(\d{1,2})\s*(?:a|al|–|-|—)\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/
  );
  if (m) {
    let y = +m[4];
    if (y < 100) y = y >= 50 ? 1900 + y : 2000 + y;
    const d = String(+m[2]).padStart(2, "0");
    const mo = String(+m[3]).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  return null;
}

type Intervention = {
  index: number;
  fechaTexto: string | null;
  fechaISO: string | null;
  text: string;
};

function splitByDateStrict(block: string): Intervention[] {
  const text = clean(block);

  const starts: Array<{ i: number; label: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = DATE_LINE.exec(text))) {
    starts.push({ i: m.index, label: m[1].trim() });
  }

  if (starts.length === 0) {
    return [{ index: 1, fechaTexto: null, fechaISO: null, text }];
  }

  const parts: Intervention[] = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k].i;
    const e = k < starts.length - 1 ? starts[k + 1].i : text.length;
    const chunk = text.slice(s, e).trimEnd();
    const fechaTexto = starts[k].label;
    const fechaISO = toISO(fechaTexto);
    if (chunk)
      parts.push({
        index: parts.length + 1,
        fechaTexto,
        fechaISO,
        text: chunk,
      });
  }
  return parts;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const raw = form.get("text");
    let full = "";
    if (typeof raw === "string" && raw.trim()) {
      full = raw;
    } else {
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { ok: false, error: "Falta 'file' (.docx) o 'text'." },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const { value } = await mammoth.extractRawText({ buffer: buf });
      full = value;
    }

    const historic = sliceFromHistorico(full);
    const interventions = splitByDateStrict(historic);

    return NextResponse.json({
      ok: true,
      count: interventions.length,
      interventions,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error" },
      { status: 500 }
    );
  }
}
