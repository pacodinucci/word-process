import { nanoid } from "nanoid";
import type { WellState, Interval, Perforation } from "@/lib/well-state";
import type { Punzado, CementacionTapon, Ensayo, Estimulacion } from "../types";

// ---------------- Utils ----------------
const toInterval = (
  iv?: Punzado | CementacionTapon["intervalo"] | null
): Interval | null => {
  if (!iv) return null;
  const d = iv.desde ?? null;
  const h = iv.hasta ?? null;
  if (d == null || h == null) return null;
  return { desde: Number(d), hasta: Number(h), unidad: "m" };
};

const intersects = (a: Interval, b: Interval, tol = 0): boolean =>
  !(a.hasta < b.desde - tol || b.hasta < a.desde - tol);

const closePerforationsBy = (
  state: WellState,
  zona: Interval,
  reason: Perforation["closedBy"]
) => {
  // Minimal: marca como "closed" los punzados que intersectan (sin split por ahora)
  for (const p of state.perforations) {
    if (intersects(p.interval, zona)) {
      p.status = "closed";
      p.closedBy = reason ?? p.closedBy;
    }
  }
};

// ---------------- Apply ----------------
export type ExtractedInterventionPayload = {
  fecha?: string | null; // ISO si la tenés
  punzados: Punzado[];
  cementaciones: CementacionTapon[];
  tests: Ensayo[];
  estimulaciones: Estimulacion[];
};

export function applyInterventionToWellState(
  prev: WellState,
  payload: ExtractedInterventionPayload
): WellState {
  const next: WellState = structuredClone(prev);
  const lastDate = payload.fecha ?? prev.lastUpdated ?? null;

  // 1) Punzados -> agregan segmentos "open"
  for (const raw of payload.punzados ?? []) {
    const iv = toInterval(raw);
    if (!iv) continue;
    next.perforations.push({
      id: nanoid(8),
      zone: undefined, // si más adelante resolvés zona por rango, llenalo acá
      interval: iv,
      status: "open",
      metadata: {},
    });
  }

  // 2) Cementaciones/Squeeze/BPP
  for (const c of payload.cementaciones ?? []) {
    if (c.tipo === "bpp") {
      if (c.profundidad == null) continue;
      next.bpps.push({
        id: nanoid(8),
        depth: Number(c.profundidad),
        active: true,
        zone: c.zona ?? null,
        placedAt: lastDate ?? new Date().toISOString(),
      });
      continue;
    }

    const iv = toInterval(c.intervalo);
    if (!iv) continue;

    if (c.tipo === "squeeze") {
      next.squeezes.push({
        id: nanoid(8),
        interval: iv,
        date: lastDate ?? new Date().toISOString(),
      });
      // Cierra punzados que intersecten por squeeze
      closePerforationsBy(next, iv, "squeeze");
    } else {
      // "cementacion" o "tampon_cemento" -> tratamos como tapón de cemento activo
      next.cementPlugs.push({
        id: nanoid(8),
        interval: iv,
        active: true,
        placedAt: lastDate ?? new Date().toISOString(),
      });
      // Cierra punzados que intersecten por cemento
      closePerforationsBy(next, iv, "cement_plug");
    }
  }

  // 3) Tests (log, no cambia estructura)
  for (const t of payload.tests ?? []) {
    const iv = toInterval(t.intervalo ?? null);
    if (!iv) continue; // si no hay intervalo, lo omitimos por ahora
    next.tests.push({
      id: nanoid(8),
      fecha: t.fecha ?? null,
      intervalo: iv,
      vazao: t.vazao ?? null,
      fluidoRecuperado: t.fluidoRecuperado ?? null,
      observacion: t.observacion ?? null,
      recuperadoTexto: t.recuperadoTexto ?? null,
      sopro: t.sopro ?? null,
      bsw: t.bsw ?? null,
      gradosAPI: t.gradosAPI ?? null,
      nivelFluido: t.nivelFluido ?? null,
      nombre: t.nombre ?? null,
      numero: t.numero ?? null,
      presion: t.presion ?? null,
      salinidad: t.salinidad ?? null,
      swab: t.swab ?? null,
      totalRecuperado: t.totalRecuperado ?? null,
    });
  }

  // 4) Estimulaciones (log, no cambia estructura)
  for (const e of payload.estimulaciones ?? []) {
    next.stimulations.push({
      id: nanoid(8),
      date: e.fecha ?? null,
      interval: toInterval(e.intervalo ?? null) ?? undefined,
      detail: e.tipo ?? null,
    });
  }

  next.lastUpdated = lastDate ?? new Date().toISOString();
  return next;
}
