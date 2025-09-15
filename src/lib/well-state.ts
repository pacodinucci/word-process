import { Ensayo } from "@/types";

/* ===== Tipos base ===== */
export type Depth = number; // en metros
export type UnitDepth = "m";
export type Interval = { desde: Depth; hasta: Depth; unidad: UnitDepth };

/* ===== Zonas ===== */
export type Zone = {
  name: string; // p.ej., "CPS-01"
  intervals: Interval[]; // usualmente 1, pero permitimos combos (CPS-03/04)
};

/* ===== Punzados (segmentos materiales que pueden abrirse/cerrarse) ===== */
export type Perforation = {
  id: string; // único por segmento
  zone?: string; // nombre de zona si se conoce (CPS-01)
  interval: Interval;
  status: "open" | "closed";
  closedBy?: "squeeze" | "cement_plug";
  metadata?: Record<string, unknown>;
};

/* ===== Elementos de cementación / aislamiento ===== */
export type CementPlug = {
  id: string;
  interval: Interval;
  active: boolean;
  placedAt: string; // ISO
  removedAt?: string;
};

export type Squeeze = {
  id: string;
  interval: Interval;
  date: string; // ISO
};

export type Bpp = {
  id: string;
  depth: Depth;
  active: boolean;
  zone?: string | null;
  placedAt: string;
};

export type IntervaloIA = {
  desde?: number | null;
  hasta?: number | null;
  unidad?: string | null; // suele ser "m"
} | null;

/* ===== Logs operacionales (no cambian estructura) ===== */
export type TestLog = {
  id: string;
  nombre?: string | null; // "TFR-1"
  numero?: string | null; // si la IA lo separa
  fecha?: string | null; // "07/11/71" o ISO si vino así
  intervalo?: IntervaloIA; // { desde, hasta, unidad } | null
  fluidoRecuperado?: string | null; // "óleo", "óleo y agua", etc.
  totalRecuperado?: { valor?: number | null; unidad?: string | null } | null;
  recuperadoTexto?: string | null; // texto libre de recuperado
  vazao?: string | null;
  swab?: string | null;
  nivelFluido?: string | null;
  salinidad?: string | null;
  bsw?: string | null;
  gradosAPI?: string | null;
  sopro?: string | null;
  presion?: string | null;
  observacion?: string | null;
};

export type Stimulation = {
  id: string;
  date?: string | null;
  interval?: Interval;
  detail?: string | null; // acidización, minifractura, etc.
};

/* ===== Estado del pozo ===== */
export type WellState = {
  well?: { totalDepth?: Depth | null }; // opcional, si lo conocemos
  zones: Record<string, Zone>; // diccionario por nombre de zona
  perforations: Perforation[]; // todos los punzados (segmentados)
  cementPlugs: CementPlug[];
  squeezes: Squeeze[];
  bpps: Bpp[];
  tests: TestLog[];
  stimulations: Stimulation[];
  notes: string[]; // observaciones generales
  lastUpdated?: string; // ISO
  version: 1;
};

/* ===== Factory de estado inicial ===== */
export function createInitialWellState(
  partial?: Partial<WellState>
): WellState {
  return {
    zones: {},
    perforations: [],
    cementPlugs: [],
    squeezes: [],
    bpps: [],
    tests: [],
    stimulations: [],
    notes: [],
    version: 1,
    ...partial,
  };
}
