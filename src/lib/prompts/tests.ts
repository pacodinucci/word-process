export const estandarizacionNombresTests = `
[Estandarización de NOMBRES de tests]
- Todo test de inyección (injetividade/injectividad/teste de injetividade):
  "nombre": "TI" y "numero" si aparece (p.ej., "TI-01" → "01"; "TI 2" → "2").
- Mantener otros tipos (TF/TFR/DST/RPS/etc.) tal como figuren.
`.trim();

export const reglasIntervalosTests = `
[Reglas CLAVE sobre INTERVALOS en tests]
- El campo "intervalo" debe estar SIEMPRE presente en cada test:
  1) Si hay rango explícito (p.ej., "Int. 589,77/605,0 m", "CPS-01 (561,0–568,0 m)"), usalo.
  2) Si hay una profundidad puntual relevante (p.ej., "swabbing a 592,0 m"), usar punto único.
  3) Si refiere una zona con rango en el texto, usar ese rango.
  4) Usar el "Int. principal" solo si el test no provee otro mejor y está claro.
  5) No dejes "intervalo": null.
  6) Si un evento (test/estimulación) no indica intervalo, heredar el último intervalo explícito **previo** del bloque.
`.trim();

export const ejemploHerenciaIntervalo = `
[Ejemplo de herencia de INTERVALO]
Entrada:
- Canhoneado CPS-03 (595,0–601,0 m)
- Efetuado TI com Q=0,56 BPM / Pressão 600 psi
Salida (solo tests):
[
  {
    "nombre": "TI",
    "numero": null,
    "fecha": null,
    "intervalo": { "desde": 595.0, "hasta": 601.0, "unidad": "m" },
    "vazao": "0,56 BPM",
    "presion": "600 psi",
    "sopro": null,
    "observacion": null
  }
]
`.trim();

export const reglasSopro = `
[Reglas de SOPRO/FLUXO]
- Si el texto menciona "sopro/fluxo/flujo/surgência/surgiu/surgió", completar "sopro".
- Una sola oración, orden temporal, sin mezclar con "Recuperado/Qt=/IP/K/Pe/BSW/API/Visc.".
- Si no hay mención, usar null.
`.trim();

export const ejemplosSopro = `
[Ejemplos de SOPRO/FLUXO]
Entrada: "Sopro moderado passando a forte. Gás na superfície aos 15 min 1º fluxo."
"sopro": "Sopro moderado passando a forte. Gás na superfície aos 15 min 1º fluxo."
Entrada: "Sopro forte imediato com gás na superfície aos 10 min. Surgiu gás/óleo aos 25 min de fluxo, com pouco óleo."
"sopro": "Sopro forte imediato com gás na superfície aos 10 min. Surgiu gás/óleo aos 25 min de fluxo, com pouco óleo."
Entrada: "Sopro moderado."
"sopro": "Sopro moderado."
Entrada: (sin mención)
"sopro": null
`.trim();

export const otrasReglasTests = `
[Otras reglas]
- Diferenciar RECUPERADO vs. VAZÃO (solo V/T: m3/d, bbl/d, BPD, MPCD, BPM, L/s, Qt=...).
- "fluidoRecuperado": listar TODOS los fluidos recuperados si hay.
- "recuperadoTexto": copiar/condensar la(s) oración(es) de recupero con números y unidades.
- TI: completar "presion" si aparece (psi).
- "fecha" del test puede ser la del bloque si no hay otra.
- No deducir fluido a partir de PVT.
- Resultado “seco” → "fluidoRecuperado": null y anotar en "observacion".
- "Obs./Observación:" → incorporar al test más relevante.
`.trim();
