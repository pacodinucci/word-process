export const reglasBloqueantes = `
[REGLAS BLOQUEANTES — leer primero]
- PACKER/AD-1/R-3/RTTS/etc. **NO** es BPP. **PROHIBIDO** mapear PACKER → BPP en cualquier circunstancia.
- Para crear un ítem {"tipo":"bpp"} el MISMO EVENTO (la misma viñeta que empieza con "- ") debe contener el token literal con límites de palabra: \\bBPP\\b o \\bBBP\\b **y** un verbo de acción (“fixado/assentado/posicionado/instalado/retirado/removido”).
- Si el evento menciona PACKER y NO contiene \\bBPP\\b/\\bBBP\\b literal ⇒ **no devolvás ningún ítem** en "cementaciones".
- Listados o inventario (p. ej., “Peixe no poço (PACKER’s, BPP’s…)”) **no** implican instalación de BPP ⇒ no registrar nada.
- Sin rango explícito en el MISMO evento, **no** devolver “cementacion/squeeze/tampon_cemento”.
`.trim();

export const distincionBppPacker = `
[Distinción BPP vs PACKER — PROHIBIDO mapear]
- PACKER/AD-1/R-3/RTTS/etc. **NO** es BPP. Nunca mapear PACKER → BPP.
- Para BPP se requiere **BPP/BBP literal + verbo de acción** (“fixado/assentado/posicionado/instalado/retirado/removido”) en el MISMO evento.
- Listados/inventario (“Peixe no poço (PACKER’s, BPP’s…)”) no cuentan como instalación.
`.trim();

export const reglasCementaciones = `
[Reglas de CEMENTACIONES/TAMPONES — versión estricta]
- Incluir en "cementaciones" solo:
  1) **BPP**: únicamente si el evento contiene **BPP/BBP literal + verbo de acción**.
     Formato: { "tipo":"bpp", "intervalo": null, "profundidad": <número si figura>, "unidadProfundidad":"m", "zona": <si figura>, "observacion": <opcional> }.
  2) **Cementación/Squeeze/Tampón de cemento**: solo si **en el mismo evento** hay:
     - un **rango explícito** (p.ej., “561,0/568,0 m”) o
     - una **zona con rango** (p.ej., “CPS-01 (561,0–568,0 m)”).
     En estos casos, "intervalo" es **obligatorio** con ambos extremos (desde y hasta) y unidad.
- **NO** contar como cementación:
  * Inyecciones de pasta de cemento sin rango/zona (p.ej., “Injetado 1,0 bbl… 400 psi”).
  * Inyecciones de pasta de cemento para **posicionar equipos** (PACKER/BPP) sin rango.
  * “Furo no/do revestimento” sin vinculación a intervalos punzados con rango.
`.trim();

export const validacionCementaciones = `
[Validación previa a la salida — checklist]
- Si existe un ítem con "tipo":"bpp" y en el evento NO aparecen \\bBPP\\b/\\bBBP\\b **y** un verbo de acción ⇒ eliminar ese ítem.
- Si "tipo" ∈ {"cementacion","squeeze","tampon_cemento"} y NO hay intervalo completo (desde & hasta) **en el mismo evento** ⇒ eliminar ese ítem.
- Si el evento contiene “PACKER” y no cumple los requisitos anteriores ⇒ "cementaciones": no agregar nada.
`.trim();

export const ejemplosCementacionesNeg = `
[Ejemplos NEGATIVOS (deben devolver cementaciones: [])]
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
`.trim();

export const ejemplosCementacionesPos = `
[Ejemplos POSITIVOS]
Entrada:
- BPP fixado a 639,0 m isolando SERRARIA.
Salida (cementaciones):
[{ "tipo":"bpp", "intervalo": null, "profundidad": 639.0, "unidadProfundidad":"m", "zona":"SERRARIA", "observacion":"Isolamento com BPP." }]

Entrada:
- Correção de cimentação (squeeze) na CPS-01 (561,0–568,0 m).
Salida (cementaciones):
[{ "tipo":"squeeze", "intervalo": { "desde": 561.0, "hasta": 568.0, "unidad": "m" }, "profundidad": null, "unidadProfundidad": null, "zona":"CPS-01", "observacion":"Correção de cimentação." }]
`.trim();

export const ejemploBppSqueeze = `
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
