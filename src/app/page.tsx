"use client";

import { useEffect, useMemo, useState } from "react";
import { WordDropzone } from "@/components/global/word-dropzone";
import { ResponsiveDialog } from "@/components/global/responsive-dialog";
import { getErrorMessage } from "@/lib/utils";
import { createInitialWellState, type WellState } from "@/lib/well-state";
import {
  CementacionTapon,
  Ensayo,
  Estimulacion,
  Punzado,
  RawIntervencion,
} from "../types";
import { fmtVolumen, labelTipoEst, mkRecuperadoLinea } from "@/lib/helpers";
import { applyInterventionToWellState } from "@/lib/well-state-ops";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [wellState, setWellState] = useState<WellState>(() =>
    createInitialWellState()
  );

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

    if (summaryByIndex[idx]) return; // cache -> ya abre el modal con lo guardado

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

      // Normalizo arrays
      const punzados = Array.isArray(s?.punzados) ? s.punzados : [];
      const tests = Array.isArray(s?.tests) ? s.tests : [];
      const cementaciones = Array.isArray(s?.cementaciones)
        ? s.cementaciones
        : [];
      const estimulaciones = Array.isArray(s?.estimulaciones)
        ? s.estimulaciones
        : [];

      // Guardo en los estados "byIndex" (para el modal)
      setSummaryByIndex((p) => ({ ...p, [idx]: s?.resumen || "(sin datos)" }));
      setPunzadosByIndex((p) => ({ ...p, [idx]: punzados }));
      setTestsByIndex((p) => ({ ...p, [idx]: tests }));
      setCementacionesByIndex((p) => ({ ...p, [idx]: cementaciones }));
      setEstimulacionesByIndex((p) => ({ ...p, [idx]: estimulaciones }));

      // ⬇️ Actualizo el estado global del pozo
      const fecha =
        (s && (s.fechaISO || s.fecha || null)) ??
        item.fechaISO ??
        item.fechaTexto ??
        null;

      setWellState((prev) =>
        applyInterventionToWellState(prev, {
          fecha,
          punzados,
          cementaciones,
          tests,
          estimulaciones,
        })
      );
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

  useEffect(() => {
    console.log("WELL STATE --> ", wellState);
  }, [wellState]);

  // Orden cronológico + gating (solo una intervención habilitada a la vez)
  const chrono = useMemo(() => {
    // ordenamos por fechaISO asc; si no hay fecha, caen al final y se desempata por index
    const sorted = [...rawIntervenciones].sort((a, b) => {
      const da = a.fechaISO || "";
      const db = b.fechaISO || "";
      if (da && db) return da.localeCompare(db) || a.index - b.index;
      if (da) return -1;
      if (db) return 1;
      return a.index - b.index;
    });

    const order = sorted.map((i) => i.index);
    const pos = new Map<number, number>();
    order.forEach((idx, i) => pos.set(idx, i));

    // ¿cuántas están completas de forma consecutiva desde el inicio?
    let completed = 0;
    while (completed < order.length && summaryByIndex[order[completed]]) {
      completed++;
    }

    const nextIndex = order[completed] ?? null; // solo esta se habilita
    return { order, pos, completed, nextIndex };
  }, [rawIntervenciones, summaryByIndex]);

  const canAnalyze = (idx: number) => chrono.nextIndex === idx;
  const orderPos = (idx: number) => chrono.pos.get(idx) ?? null;

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
        {rawIntervenciones.map((b) => {
          const enabledToAnalyze = canAnalyze(b.index); // habilita el PRIMER análisis (orden)
          const hasSummary = Boolean(summaryByIndex[b.index]); // ya fue analizada
          const canOpen = hasSummary || enabledToAnalyze; // si hay resumen, siempre se puede abrir

          const pos = orderPos(b.index);

          return (
            <article key={b.index} className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs uppercase tracking-wide px-2 py-0.5 rounded-full bg-neutral-100">
                  Intervención {b.index}
                </span>

                {pos != null && (
                  <span className="text-xs text-neutral-500">
                    #{pos + 1} en orden cronológico
                  </span>
                )}

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
                  disabled={busy || !canOpen}
                  title={
                    !canOpen
                      ? "Primero analizá las intervenciones anteriores (orden cronológico)"
                      : undefined
                  }
                >
                  {busy && selectedIndex === b.index
                    ? "Analizando…"
                    : hasSummary
                    ? "Ver resumen"
                    : enabledToAnalyze
                    ? "Analizar con IA"
                    : "Bloqueado"}
                </button>

                {hasSummary && (
                  <span className="text-xs text-green-700">Resumen listo</span>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Modal */}
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
