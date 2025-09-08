// app/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { WordDropzone } from "@/components/global/word-dropzone";
import { ResponsiveDialog } from "@/components/global/responsive-dialog";
import { getErrorMessage } from "@/lib/utils";

// Para el diálogo (resumen)
type Punzado = {
  desde?: number | null;
  hasta?: number | null;
  unidad?: string | null;
};

type Ensayo = {
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

type CementacionTapon = {
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
};

// Crudo que devuelve /api/word/interventions
type RawIntervencion = {
  index: number;
  fechaISO: string | null;
  fechaTexto: string | null;
  text: string;
};

type Estimulacion = {
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

/** Helpers de UI para “Recuperado” (sopro + recuperado) */
function ensureEndsWithDot(s: string) {
  const t = s?.trim?.() ?? "";
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : t + ".";
}
function mkRecuperadoLinea(t: Ensayo) {
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

const fmtVolumen = (
  v?: { valor?: number | null; unidad?: string | null } | null
) =>
  v && (v.valor != null || v.unidad)
    ? `${v.valor ?? ""} ${v.unidad ?? ""}`
    : null;

const labelTipoEst = (t: Estimulacion["tipo"]) =>
  t === "acidizacion"
    ? "Acidización"
    : t === "fractura"
    ? "Fractura"
    : "Minifractura";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const [rawIntervenciones, setRawIntervenciones] = useState<RawIntervencion[]>(
    []
  );

  // Estados por intervención (para diálogo)
  const [summaryByIndex, setSummaryByIndex] = useState<
    Record<number, string | undefined>
  >({});
  const [punzadosByIndex, setPunzadosByIndex] = useState<
    Record<number, Punzado[] | undefined>
  >({});
  const [testsByIndex, setTestsByIndex] = useState<
    Record<number, Ensayo[] | undefined>
  >({});
  const [cementacionesByIndex, setCementacionesByIndex] = useState<
    Record<number, CementacionTapon[] | undefined>
  >({});
  const [estimulacionesByIndex, setEstimulacionesByIndex] = useState<
    Record<number, Estimulacion[] | undefined>
  >({});

  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const busy = useMemo(() => loading || summarizing, [loading, summarizing]);

  async function handleFileUpload(file: File) {
    setLoading(true);
    setErrorGeneral(null);
    setRawIntervenciones([]);
    setSummaryByIndex({});
    setPunzadosByIndex({});
    setTestsByIndex({});
    setCementacionesByIndex({});
    setEstimulacionesByIndex({});
    setDialogOpen(false);
    setSelectedIndex(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/word/interventions", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data?.ok)
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      setRawIntervenciones(data.interventions ?? []);
    } catch (e: unknown) {
      setErrorGeneral(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // Abre el diálogo y (si no hay resumen guardado) llama a /api/word/summarize para esa intervención
  async function abrirYAnalizar(idx: number) {
    setSelectedIndex(idx);
    setSummaryError(null);
    setDialogOpen(true);

    if (summaryByIndex[idx]) return; // cache

    const item = rawIntervenciones.find((x) => x.index === idx);
    if (!item) return;

    try {
      setSummarizing(true);
      const res = await fetch("/api/word/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, detail: "auto" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok)
        throw new Error(data?.error ?? `HTTP ${res.status}`);

      const s = data?.summaries?.[0];
      setSummaryByIndex((p) => ({ ...p, [idx]: s?.resumen || "(sin datos)" }));
      setPunzadosByIndex((p) => ({
        ...p,
        [idx]: Array.isArray(s?.punzados) ? s.punzados : [],
      }));
      setTestsByIndex((p) => ({
        ...p,
        [idx]: Array.isArray(s?.tests) ? s.tests : [],
      }));
      setCementacionesByIndex((p) => ({
        ...p,
        [idx]: Array.isArray(s?.cementaciones) ? s.cementaciones : [],
      }));
      setEstimulacionesByIndex((p) => ({
        ...p,
        [idx]: Array.isArray(s?.estimulaciones) ? s.estimulaciones : [],
      }));
    } catch (e: unknown) {
      setSummaryError(getErrorMessage(e));
    } finally {
      setSummarizing(false);
    }
  }

  // Reintentar desde el diálogo
  async function reanalizarActual() {
    if (selectedIndex == null) return;
    setSummaryByIndex((p) => {
      const { [selectedIndex]: unused, ...rest } = p;
      void unused;
      return rest;
    });
    setPunzadosByIndex((p) => {
      const { [selectedIndex]: unused, ...rest } = p;
      void unused;
      return rest;
    });
    setTestsByIndex((p) => {
      const { [selectedIndex]: unused, ...rest } = p;
      void unused;
      return rest;
    });
    setCementacionesByIndex((p) => {
      const { [selectedIndex]: unused, ...rest } = p;
      void unused;
      return rest;
    });
    setEstimulacionesByIndex((p) => {
      const { [selectedIndex]: unused, ...rest } = p;
      void unused;
      return rest;
    });
    await abrirYAnalizar(selectedIndex);
  }

  const fmtFecha = (i: {
    fechaISO?: string | null;
    fechaTexto?: string | null;
  }) => i.fechaISO ?? i.fechaTexto ?? null;

  const fmtIntervalo = (
    iv?: {
      desde?: number | null;
      hasta?: number | null;
      unidad?: string | null;
    } | null
  ) =>
    iv ? `${iv.desde ?? "?"}/${iv.hasta ?? "?"} ${iv.unidad ?? "m"}` : null;

  const fmtProf = (p?: number | null, u?: string | null) =>
    p != null ? `${p} ${u ?? "m"}` : null;

  const labelTipoCem = (t: CementacionTapon["tipo"]) => {
    switch (t) {
      case "cementacion":
        return "Cementación";
      case "squeeze":
        return "Squeeze / corrección de cementación";
      case "tampon_cemento":
        return "Tapón de cemento";
      case "bpp":
        return "BPP";
      default:
        return t;
    }
  };

  useEffect(() => {
    console.log({
      rawIntervenciones,
      summaryByIndex,
      punzadosByIndex,
      testsByIndex,
      cementacionesByIndex,
      estimulacionesByIndex,
      selectedIndex,
      dialogOpen,
    });
  }, [
    rawIntervenciones,
    summaryByIndex,
    punzadosByIndex,
    testsByIndex,
    cementacionesByIndex,
    estimulacionesByIndex,
    selectedIndex,
    dialogOpen,
  ]);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <WordDropzone onPickFile={handleFileUpload} isProcessingFile={busy} />

      {errorGeneral && <p className="text-red-600">{errorGeneral}</p>}
      {!loading && !errorGeneral && rawIntervenciones.length === 0 && (
        <p className="text-sm text-neutral-600">
          Sin intervenciones detectadas.
        </p>
      )}

      {/* Lista de intervenciones crudas, cada una con su botón */}
      <div className="grid gap-3">
        {rawIntervenciones.map((b) => (
          <article key={b.index} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full bg-neutral-100">
                Intervención {b.index}
              </span>
              {fmtFecha(b) && (
                <span className="text-xs text-neutral-500 ml-auto">
                  {fmtFecha(b)}
                </span>
              )}
            </div>

            <pre className="whitespace-pre-wrap text-sm">{b.text}</pre>

            <div className="mt-3 flex items-center gap-3">
              <button
                className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-50"
                onClick={() => abrirYAnalizar(b.index)}
                disabled={busy}
              >
                {busy && selectedIndex === b.index
                  ? "Analizando…"
                  : "Analizar con IA"}
              </button>
              {summaryByIndex[b.index] && (
                <span className="text-xs text-green-700">Resumen listo</span>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* ===== Dialog ===== */}
      <ResponsiveDialog
        open={dialogOpen}
        onOpenChange={(v) => setDialogOpen(v)}
        title={
          selectedIndex != null
            ? `Resumen — Intervención ${selectedIndex}`
            : "Resumen"
        }
        description="Resultado del análisis"
      >
        <div className="space-y-3 max-h-[80vh] overflow-y-auto">
          {selectedIndex != null && (
            <>
              <p className="text-sm text-neutral-600">
                {fmtFecha(
                  rawIntervenciones.find((x) => x.index === selectedIndex) || {}
                ) ?? ""}
              </p>

              {summarizing && <p className="text-sm">Analizando…</p>}
              {summaryError && (
                <p className="text-sm text-red-600">{summaryError}</p>
              )}

              {!summarizing && !summaryError && (
                <>
                  {/* Resumen */}
                  <p className="text-sm whitespace-pre-wrap">
                    {summaryByIndex[selectedIndex] ?? "—"}
                  </p>

                  {/* Punzados debajo del resumen */}
                  {(punzadosByIndex[selectedIndex]?.length ?? 0) > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <h3 className="text-sm font-medium mb-1">
                        Punzados realizados
                      </h3>
                      <ul className="list-disc ml-5 text-sm">
                        {punzadosByIndex[selectedIndex]!.map((iv, j) => (
                          <li key={j}>{fmtIntervalo(iv)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Ensayos detectados */}
                  {(testsByIndex[selectedIndex]?.length ?? 0) > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <h3 className="text-sm font-medium mb-2">
                        Ensayos detectados
                      </h3>
                      <div className="grid gap-3">
                        {testsByIndex[selectedIndex]!.map((t, i) => (
                          <div key={i} className="rounded-lg border p-3">
                            <div className="flex items-center gap-2">
                              {(t.nombre || t.numero) && (
                                <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full bg-neutral-100">
                                  {t.nombre ?? `Ensayo ${t.numero}`}
                                </span>
                              )}
                              {t.intervalo && (
                                <span className="text-xs text-neutral-600 ml-auto">
                                  {fmtIntervalo(t.intervalo)}
                                </span>
                              )}
                            </div>

                            {/* Tabla de propiedades: SIEMPRE visibles */}
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                              <div>
                                <strong>Fecha:</strong> {t.fecha ?? ""}
                              </div>
                              <div>
                                <strong>Intervalo:</strong>{" "}
                                {t.intervalo ? fmtIntervalo(t.intervalo) : ""}
                              </div>
                              <div>
                                <strong>Nº test:</strong>{" "}
                                {t.nombre ?? t.numero ?? ""}
                              </div>

                              <div>
                                <strong>Resultado (fluido):</strong>{" "}
                                {t.fluidoRecuperado ?? ""}
                              </div>
                              <div>
                                <strong>Nivel:</strong> {t.nivelFluido ?? ""}
                              </div>
                              <div>
                                <strong>Swab:</strong> {t.swab ?? ""}
                              </div>

                              <div>
                                <strong>Vazão:</strong> {t.vazao ?? ""}
                              </div>
                              <div>
                                <strong>Salinidad:</strong> {t.salinidad ?? ""}
                              </div>
                              <div>
                                <strong>BSW:</strong> {t.bsw ?? ""}
                              </div>

                              <div>
                                <strong>Presión:</strong> {t.presion ?? ""}{" "}
                              </div>

                              <div>
                                <strong>Grados API:</strong> {t.gradosAPI ?? ""}
                              </div>
                              <div className="col-span-2">
                                <strong>Observaciones:</strong>{" "}
                                {t.observacion ?? ""}
                              </div>

                              <div className="col-span-2">
                                <strong>Recuperado:</strong>{" "}
                                {mkRecuperadoLinea(t) || ""}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cementaciones / Tapones (incluye BPP) */}
                  {(cementacionesByIndex[selectedIndex]?.length ?? 0) > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <h3 className="text-sm font-medium mb-2">
                        Cimentaciones y tampones
                      </h3>
                      <div className="grid gap-3">
                        {cementacionesByIndex[selectedIndex]!.map((c, k) => (
                          <div key={k} className="rounded-lg border p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full bg-neutral-100">
                                {labelTipoCem(c.tipo)}
                              </span>
                              {c.zona && (
                                <span className="text-xs text-neutral-600">
                                  {c.zona}
                                </span>
                              )}
                              <span className="text-xs text-neutral-600 ml-auto">
                                {c.intervalo
                                  ? `Intervalo: ${fmtIntervalo(c.intervalo)}`
                                  : c.profundidad != null
                                  ? `Prof.: ${fmtProf(
                                      c.profundidad,
                                      c.unidadProfundidad
                                    )}`
                                  : null}
                              </span>
                            </div>
                            {c.observacion && (
                              <p className="mt-2 text-sm text-neutral-700">
                                {c.observacion}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Estimulaciones */}
              {(estimulacionesByIndex[selectedIndex]?.length ?? 0) > 0 && (
                <div className="mt-3 border-t pt-3">
                  <h3 className="text-sm font-medium mb-2">Estimulación</h3>
                  <div className="grid gap-3">
                    {estimulacionesByIndex[selectedIndex]!.map((e, i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full bg-neutral-100">
                            {labelTipoEst(e.tipo)}
                          </span>
                          {e.intervalo && (
                            <span className="text-xs text-neutral-600 ml-auto">
                              {fmtIntervalo(e.intervalo)}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                          <div>
                            <strong>Fecha:</strong> {e.fecha ?? ""}
                          </div>
                          <div>
                            <strong>Intervalo:</strong>{" "}
                            {e.intervalo ? fmtIntervalo(e.intervalo) : ""}
                          </div>
                          <div>
                            <strong>Fluido:</strong> {e.fluido ?? ""}
                          </div>

                          <div>
                            <strong>Vazão:</strong> {e.vazao ?? ""}
                          </div>
                          <div>
                            <strong>Pi:</strong> {e.presionInicial ?? ""}
                          </div>
                          <div>
                            <strong>Pm:</strong> {e.presionMedia ?? ""}
                          </div>

                          <div>
                            <strong>Pf:</strong> {e.presionFinal ?? ""}
                          </div>
                          <div className="sm:col-span-2">
                            <strong>Volumen:</strong>{" "}
                            {fmtVolumen(e.volumen) ?? ""}
                          </div>

                          <div className="col-span-2">
                            <strong>Observaciones:</strong>{" "}
                            {e.observacion ?? ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <button
                  className="px-3 py-1.5 rounded border text-sm"
                  onClick={() => setDialogOpen(false)}
                >
                  Cerrar
                </button>
                <button
                  className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-50"
                  onClick={reanalizarActual}
                  disabled={summarizing || selectedIndex == null}
                  title="Volver a pedir el resumen a la IA"
                >
                  Re-analizar
                </button>
              </div>
            </>
          )}
        </div>
      </ResponsiveDialog>
    </main>
  );
}
