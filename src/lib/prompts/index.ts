export const fewShot = `
[Objetivo]
Devolvé SOLO JSON con:
{
  "resumen": string,
  "punzados": [ { "desde": number|null, "hasta": number|null, "unidad": "m"|string|null } ],
  "tests": [
    {
      "nombre": string|null,
      "numero": string|null,
      "fecha": string|null,
      "intervalo": { "desde": number|null, "hasta": number|null, "unidad": string|null }|null,
      "fluidoRecuperado": string|null,
      "totalRecuperado": { "valor": number|null, "unidad": string|null }|null,
      "recuperadoTexto": string|null,
      "vazao": string|null,
      "swab": string|null,
      "nivelFluido": string|null,
      "salinidad": string|null,
      "bsw": string|null,
      "gradosAPI": string|null,
      "presion": string|null,
      "sopro": string|null,
      "observacion": string|null
    }
  ],
  "cementaciones": [
    {
      "tipo": "cementacion" | "squeeze" | "tampon_cemento" | "bpp",
      "intervalo": { "desde": number|null, "hasta": number|null, "unidad": string|null }|null,
      "profundidad": number|null,
      "unidadProfundidad": string|null,
      "zona": string|null,
      "observacion": string|null
    }
  ],
  "estimulaciones": [
    {
      "tipo": "acidizacion" | "fractura" | "minifractura",
      "fecha": string,
      "intervalo": { "desde": number|null, "hasta": number|null, "unidad": string|null },
      "fluido": string|null,
      "presionInicial": string|null,
      "presionMedia": string|null,
      "presionFinal": string|null,
      "vazao": string|null,
      "volumen": { "valor": number|null, "unidad": string|null }|null,
      "observacion": string|null
    }
  ]
}

[REGLAS BLOQUEANTES — leer primero]
- PACKER/AD-1/R-3/RTTS/**BPR**/etc. **NO** es BPP. **PROHIBIDO** mapear PACKER/**BPR** → BPP en cualquier circunstancia.
- **BPR NO es BPP ni cementación/tapón. Ignorarlo por completo**: no crear ítems en "cementaciones" por la presencia de BPR.
- Para crear un ítem {"tipo":"bpp"} el MISMO EVENTO (la misma viñeta que empieza con "- ") debe contener el token literal con límites de palabra: \\bBPP\\b o \\bBBP\\b **y** un verbo de acción (“fixado/assentado/posicionado/instalado/retirado/removido”).
- Si el evento menciona PACKER y NO contiene \\bBPP\\b/\\bBBP\\b literal ⇒ **no devolvás ningún ítem** en "cementaciones".
- Listados o inventario (p. ej., “Peixe no poço (PACKER’s, BPP’s…)”) **no** implican instalación de BPP ⇒ no registrar nada.
- Sin rango explícito en el MISMO evento, **no** devolver “cementacion/squeeze/tampon_cemento”.

[Reglas de PUNZADOS — extracción estricta]
- Registrar un punzado ÚNICAMENTE si el texto declara explícitamente que se realizó, con verbos/expresiones como:
  "canhoneado/canhoneo/canhonear/canhoneamento", "punzado", "perforado",
  "tiros disparados/feitos/realizados", "disparo de canhoneira", "shot(s)",
  "reperforado/reperfuração (com tiros)".
- NO registrar punzados cuando:
  * Solo se listan intervalos o zonas sin verbo de punzado.
  * Son tareas de limpieza/chequeo/milling, etc.
  * Son trabajos de cimentación/tapones/BPP sin mención de tiros.
- Asociar cada punzado al evento que lo declara. No heredar salvo aclaración explícita.
- Si no hay declaración explícita, devolver [].

[Ejemplos de PUNZADOS]
Entrada:
- Checado fundo do poço com sapata MILL de 4.1/2” a 555,81 m e limpo até 559,5 m.
Salida (punzados):
[]

Entrada:
- Canhoneado CPS-01 (561,0–568,0 m), 6 tiros/ft.
Salida (punzados):
[{ "desde": 561.0, "hasta": 568.0, "unidad": "m" }]

Entrada:
- Perforado intervalo 605,0/634,0 m na CPS-03/04.
Salida (punzados):
[{ "desde": 605.0, "hasta": 634.0, "unidad": "m" }]

[Estandarización de NOMBRES de tests]
- Todo test de inyección (injetividade/injectividad/teste de injetividade):
  "nombre": "TI" y "numero" si aparece ("TI-01" → "01"; "TI 2" → "2").
- Mantener otros tipos (TF/TFR/DST/RPS/etc.) tal como figuren.

[Reglas CLAVE sobre INTERVALOS en tests]
- El campo "intervalo" debe estar SIEMPRE presente en cada test:
  1) Si hay rango explícito, usalo.
  2) Si hay profundidad puntual relevante, usar punto único.
  3) Si refiere una zona con rango en el texto, usar ese rango.
  4) Usar el "Int. principal" solo si el test no provee otro mejor.
  5) No dejes "intervalo": null.
  6) Si un evento (test/estimulación) no indica intervalo, heredar el último intervalo explícito **previo** del bloque.

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

[Reglas de SOPRO/FLUXO]
- Tratar "sopro", "fluxo/flujo/flow" y "surgência/surgiu/surgió" como el **mismo concepto** y registrar TODO en el campo "sopro".
- Incluir también **hitos de flujo**: "1º fluxo/primer flujo/first flow", "gás/óleo na superfície", "chama/llama", "imediato", con sus **tiempos** si aparecen.
- Armar **una sola oración concisa** en **orden temporal**. No mezclar con "Recuperado/Qt=/IP/K/Pe/Salinidade/BSW/API/Visc.".
- **Si solo hay "fluxo/flujo/flow"** (sin la palabra "sopro"), **igual** completar "sopro" con esa(s) frase(s).
- Si no hay mención a ninguno de esos términos, usar null.

[Ejemplos de SOPRO/FLUXO]
Entrada: "Sopro moderado passando a forte. Gás na superfície aos 15 min 1º fluxo."
"sopro": "Sopro moderado passando a forte. Gás na superfície aos 15 min 1º fluxo."

Entrada: "Fluxo imediato; gás na superfície."
"sopro": "Fluxo imediato; Gás na superfície."

Entrada: "1º fluxo aos 12 min com chama fraca; depois gás/óleo aos 25 min."
"sopro": "1º fluxo aos 12 min com chama fraca; Gás/óleo aos 25 min."

Entrada: "Surgiu gás aos 8 min; primeiro fluxo aos 20 min."
"sopro": "Surgiu gás aos 8 min; 1º fluxo aos 20 min."

Entrada: (sem/ sin mención)
"sopro": null

[Otras reglas]
- Diferenciar RECUPERADO vs. VAZÃO (solo V/T: m3/d, bbl/d, BPD, MPCD, BPM, L/s, Qt=...).
- "fluidoRecuperado": listar TODOS los fluidos recuperados si hay.
- "recuperadoTexto": copiar/condensar la(s) oración(es) de recupero con números y unidades.
- TI: completar "presion" si aparece (psi).
- "fecha" del test puede ser la del bloque si no hay otra.
- No deducir fluido a partir de PVT.
- Resultado “seco” → "fluidoRecuperado": null y anotar en "observacion".
- "Obs./Observación:" → incorporar al test más relevante.

[Reglas ESPECÍFICAS para TI (teste de injetividade)]
- Un TI NO es un ensayo de flujo/producción. En todo TI:
  * "totalRecuperado": null
  * "recuperadoTexto": null
  * "fluidoRecuperado": null
  * "sopro": null
- En TI solo registrar "vazao" (BPM/L/s/Qt=) y "presion" (psi) si aparecen.
- Si en el mismo bloque hay frases con "Recuperado...", **no** asociarlas al TI.

[Reglas de FECHAS (intervención)]
- En la cabecera recibís "FechaTexto:" (y eventualmente "fechaISO:").
- **Todas** las entradas de "tests" y "estimulaciones" deben llevar "fecha" igual a "FechaTexto". 
- Si "FechaTexto" está vacío o no existe, usar "fechaISO".
- Si el texto menciona otra fecha distinta, **ignorarla** y usar la de la intervención.
- Si no hay "FechaTexto" ni "fechaISO":
  * En "tests": ""fecha": null".
  * En "estimulaciones": **no crear** el ítem (no cumple validación).
- Usar **exactamente** el string provisto (no re-formatear).
- Si "FechaTexto" viene como **rango** (p. ej., "08 a 14/07/2010", "08–14/07/2010", "08-14/07/2010",
  "12/06 a 14/06/2010"), tomar **solo la fecha final** (la de la derecha) y usarla
  en **todos** los ítems de "tests" y "estimulaciones".
- Conservar el **formato exacto** tal como aparece en "FechaTexto" ("14/07/2010"), sin re-formatear.

[Ejemplo de FECHA (herencia a todos los eventos)]
Cabecera:
FechaTexto: 2024-05-12

Entrada:
- Canhoneado CPS-03 (595,0–601,0 m)
- Efetuado TI com Q=0,56 BPM / Pressão 600 psi
- Acidizado CPS-03 com 2,0 m3 de HCl 15%. Q=1,0 BPM; Pf=850 psi.

Salida (solo campos de fecha mostrados):
"tests": [
  { "nombre": "TI", "fecha": "2024-05-12", ... }
],
"estimulaciones": [
  { "tipo": "acidizacion", "fecha": "2024-05-12", ... }
]

[Reglas de ESTIMULACIONES (acidización, fractura, minifractura)]
- **Registrar SIEMPRE fuera de "tests"** en el array "estimulaciones".
- Disparadores (PT/ES): "acidiza/acidiz/acidific", "HCl/HF/ácido", "fratura/fratura hidráulica/fractura", "minifratura/mini-fratura/minifrac".
- Campos:
  * "tipo": normalizar a "acidizacion" | "fractura" | "minifractura".
  * "fecha": del evento o del bloque (si aplica).
  * "intervalo": **obligatorio**. Reglas de obtención (idénticas a tests):
    1) rango explícito (a/b m) → usarlo,
    2) zona con rango (CPS-xx (...–...) m) → usar ese rango,
    3) si el bloque tiene un único "Int. a/b m" → usarlo,
    4) si nada de lo anterior, **no** crear el ítem.
  * "fluido": ácido o fluido bombeado (p.ej., "HCl 15%", "água gel", "slickwater").
  * "presionInicial"/"presionMedia"/"presionFinal": en psi si figuran.
  * "vazao": caudal de bombeo (BPM/L/s/Qt=).
  * "volumen": {valor, unidad} cuando se informe (m3, bbl, L, etc.).
  * "observacion": notas relevantes (diagnóstico, etapa, etc.).
- **Validación obligatoria**: si falta alguno de { "tipo", "fecha", "intervalo (completo)" } ⇒ **eliminar** ese ítem de "estimulaciones".
- Desambiguación:
  * "squeeze de ácido" ⇒ tratar como **acidizacion** (estimulaciones), **NO** como "squeeze" de cementación.
  * "squeeze de cemento" ⇒ cementaciones (si cumple reglas de intervalo).
- No mezclar con ensayos de presión (step-rate sin bombeo en zona, falloff sin tratamiento) ⇒ NO es estimulación.

[Reglas CLAVE sobre INTERVALOS en estimulaciones]
- El campo "intervalo" debe estar SIEMPRE presente en cada estimulación:
  1) Si hay rango explícito, usalo (a/b m).
  2) Si hay profundidad puntual relevante de zona (no equipo), usar punto único.
  3) Si refiere una zona con rango en el texto (CPS-xx (...–...) m), usar ese rango.
  4) Usar el "Int. principal" solo si la estimulación no provee otro mejor.
  5) No dejes "intervalo": null. Debe tener "desde" **y** "hasta" no nulos.
  6) Si un evento de estimulación no indica intervalo, heredar el último intervalo explícito **previo** del bloque (misma zona/bloque).
- **PROHIBIDO** usar "PACKER a X m" como intervalo (ni siquiera como punto único X/X). El PACKER es equipo y **no** define intervalos de estimulación.
- Si en el evento solo aparece el nivel de PACKER y no hay rango ni zona con rango:
  * Intentar heredar del último intervalo explícito previo del bloque.
  * Si no existe, **no** crear el ítem de "estimulaciones".

[Ejemplos de ESTIMULACIONES — POSITIVOS]
Entrada:
- Acidizado CPS-01 (561,0–568,0 m) com 2,5 m3 de HCl 15%. Q=1,2 BPM; pressão média 600 psi; Pf=850 psi.
Salida (estimulaciones):
[
  {
    "tipo":"acidizacion",
    "fecha": null,
    "intervalo": { "desde": 561.0, "hasta": 568.0, "unidad":"m" },
    "fluido":"HCl 15%, 2,5 m3",
    "presionInicial": null,
    "presionMedia":"600 psi",
    "presionFinal":"850 psi",
    "vazao":"1,2 BPM",
    "volumen": { "valor": 2.5, "unidad": "m3" },
    "observacion": null
  }
]

Entrada:
- Realizada minifratura diagnóstica na CPS-03 (595,0–601,0 m). Q=0,8 BPM; Pi=300 psi; Pf=900 psi; Volume 2,0 m3 de água.
Salida (estimulaciones):
[
  {
    "tipo":"minifractura",
    "fecha": null,
    "intervalo": { "desde": 595.0, "hasta": 601.0, "unidad":"m" },
    "fluido":"água",
    "presionInicial":"300 psi",
    "presionMedia": null,
    "presionFinal":"900 psi",
    "vazao":"0,8 BPM",
    "volumen": { "valor": 2.0, "unidad": "m3" },
    "observacion":"Minifratura diagnóstica"
  }
]

[Ejemplo de ESTIMULACIÓN — NEGATIVO (PACKER ≠ intervalo)]
Entrada:
- Efetuado MINIFRATURAMENTO HIDRÁULICO com PACKER FH a 515,0 m.
  Pressão média 1200 psi / Vazão 10,0 BPM.
Salida (estimulaciones):
[]

[Ejemplo de ESTIMULACIÓN — HERENCIA VÁLIDA]
Entrada:
- Canhoneado CPS-03 (595,0–601,0 m)
- Efetuado MINIFRATURAMENTO HIDRÁULICO com PACKER FH a 515,0 m. Q=10,0 BPM; Pf=1200 psi.
Salida (estimulaciones):
[
  {
    "tipo":"minifractura",
    "fecha": null,
    "intervalo": { "desde": 595.0, "hasta": 601.0, "unidad":"m" },
    "fluido": null,
    "presionInicial": null,
    "presionMedia": null,
    "presionFinal":"1200 psi",
    "vazao":"10,0 BPM",
    "volumen": null,
    "observacion": null
  }
]

[Resumen]
- "breve": 1–2 frases; "extendido": 3–6.
- Incluir fecha/rango, pruebas (TF/TFR/DST/**TI**/swab), intervalos, resultados (sopro/flow,
  presencia, tiempos, recuperos, caudal, **estimulaciones** realizadas, TCZ, minifractura, reequipado).
- **No** mencionar PACKERS.

[Eventos que NO pueden faltar en el RESUMEN]
- Punzados realizados, Ensayos, Cementaciones/BPP válidos, **Estimulaciones**.

[REGLAS DURAS — se verifican antes de responder]
- No inventar eventos: si hay duda, devolver listas vacías.
- No heredar ni inferir cementaciones desde otros eventos o del “Int. principal”.
- Si una regla exige palabra **literal**, debe estar tal cual en el MISMO evento.
- Si el evento contiene “PACKER” y NO contiene \\bBPP\\b/\\bBBP\\b, **no** devolver nada en "cementaciones".

[Distinción BPP vs PACKER — PROHIBIDO mapear]
- PACKER/AD-1/R-3/RTTS/**BPR**/etc. **NO** es BPP. Nunca mapear PACKER/**BPR** → BPP.
- Para BPP se requiere **BPP/BBP literal + verbo de acción** (“fixado/assentado/posicionado/instalado/retirado/removido”) en el MISMO evento.
- Listados/inventario (“Peixe no poço (PACKER’s, BPP’s…)”) no cuentan como instalación.

[Reglas de CEMENTACIONES/TAMPONES — versión estricta]
- Incluir en "cementaciones" solo:
  1) **BPP**: únicamente si el evento contiene **BPP/BBP literal + verbo de acción**.
     Formato: { "tipo":"bpp", "intervalo": null, "profundidad": <número si figura>, "unidadProfundidad":"m", "zona": <si figura>, "observacion": <opcional> }.
  2) **Cementación/Squeeze/Tampón de cemento**: solo si **en el mismo evento** hay:
     - un **rango explícito** o
     - una **zona con rango**.
     En estos casos, "intervalo" es **obligatorio** con ambos extremos (desde y hasta) y unidad.
- **NO** contar como cementación:
  * Inyecciones de pasta de cemento sin rango/zona.
  * Inyecciones de pasta de cemento para **posicionar equipos** (PACKER/BPP) sin rango.
  * “Furo no/do revestimento” sin vinculación a intervalos punzados con rango.
  * **BPR** (cualquier mención). **No** crear ítems en "cementaciones" por BPR.

[Validación previa a la salida — checklist]
- Si existe un ítem con "tipo":"bpp" y en el evento NO aparecen \\bBPP\\b/\\bBBP\\b **y** un verbo de acción ⇒ eliminar ese ítem.
- Si "tipo" ∈ {"cementacion","squeeze","tampon_cemento"} y NO hay intervalo completo (desde & hasta) **en el mismo evento** ⇒ eliminar ese ítem.
- Si el evento contiene **"BPR"** (con o sin verbo de acción) ⇒ **"cementaciones": no agregar nada**.
- Si el evento contiene “PACKER” y no cumple los requisitos anteriores ⇒ "cementaciones": no agregar nada.

[Ejemplos NEGATIVOS (cementaciones: [])]
Entrada:
- Posicionado PACKER AD-1 a 500,0 m com extremidade a 585,0 m. Injetado 5,3 bbl de pasta de cimento 15,8 lb/gal. Assentado PACKER AD-1 a 441,82 m com extremidade a 526,85 m. Injetado 1,0 bbl de pasta com pressão 400 psi.
Salida (cementaciones):
[]

Entrada:
- Checado fundo do poço com sapata MILL de 4.1/2” a 555,81 m e limpo até 559,5 m.
Salida (cementaciones):
[]

Entrada:
- Peixe no poço. (02 PACKER’s BPP’s + clone de broca tricônica)
Salida (cementaciones):
[]

Entrada:
- Assentado **BPR** a 520,0 m para teste de pressão.
Salida (cementaciones):
[]

[Ejemplos POSITIVOS]
Entrada:
- BPP fixado a 639,0 m isolando SERRARIA.
Salida (cementaciones):
[{ "tipo":"bpp", "intervalo": null, "profundidad": 639.0, "unidadProfundidad":"m", "zona":"SERRARIA", "observacion":"Isolamento com BPP." }]

Entrada:
- Correção de cimentação (squeeze) na CPS-01 (561,0–568,0 m).
Salida (cementaciones):
[{ "tipo":"squeeze", "intervalo": { "desde": 561.0, "hasta": 568.0, "unidad": "m" }, "profundidad": null, "unidadProfundidad": null, "zona":"CPS-01", "observacion":"Correção de cimentação." }]

[Ejemplo — BPP + squeeze en CPS-01]
Entrada (resumida):
... Isolado a zona SERRARIA com BPP fixado a 639,0 m ...
... Correção de cimentação/ squeeze na CPS-01 (561,0–568,0 m) ...
Salida (ejemplo):
{
  "resumen":"... se aisló SERRARIA con BPP a 639 m y se efectuó squeeze en CPS-01 (561,0–568,0 m) ...",
  "punzados":[],
  "tests":[],
  "cementaciones":[
    { "tipo":"bpp", "intervalo":null, "profundidad":639.0, "unidadProfundidad":"m", "zona":"SERRARIA", "observacion":"Aislamiento con BPP." },
    { "tipo":"squeeze", "intervalo":{"desde":561.0,"hasta":568.0,"unidad":"m"}, "profundidad":null, "unidadProfundidad":null, "zona":"CPS-01", "observacion":"Squeeze sobre intervalos punzados." }
  ]
}
`.trim();
