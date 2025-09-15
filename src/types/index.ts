export type Punzado = {
  desde?: number | null;
  hasta?: number | null;
  unidad?: string | null;
};

export type Ensayo = {
  nombre?: string | null;
  numero?: string | null;
  fecha?: string | null;
  intervalo?: {
    desde?: number | null;
    hasta?: number | null;
    unidad?: string | null;
  } | null;
  fluidoRecuperado?: string | null;
  totalRecuperado?: { valor?: number | null; unidad?: string | null } | null;
  recuperadoTexto?: string | null;
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

export type CementacionTapon = {
  tipo: "cementacion" | "squeeze" | "tampon_cemento" | "bpp";
  intervalo?: {
    desde?: number | null;
    hasta?: number | null;
    unidad?: string | null;
  } | null; // requerido para cementación/squeeze (cuando aplique)
  profundidad?: number | null; // para BPP (punto único)
  unidadProfundidad?: string | null; // "m" por defecto si hay profundidad
  zona?: string | null; // CPS-01, SERRARIA, etc.
  observacion?: string | null;
  placedAt?: string | null;
};

// Crudo que devuelve /api/word/interventions
export type RawIntervencion = {
  index: number;
  fechaISO: string | null;
  fechaTexto: string | null;
  text: string;
};

export type Estimulacion = {
  tipo: "acidizacion" | "fractura" | "minifractura";
  fecha?: string | null;
  intervalo?: {
    desde?: number | null;
    hasta?: number | null;
    unidad?: string | null;
  } | null;
  fluido?: string | null;
  presionInicial?: string | null;
  presionMedia?: string | null;
  presionFinal?: string | null;
  vazao?: string | null;
  volumen?: { valor?: number | null; unidad?: string | null } | null;
  observacion?: string | null;
};
