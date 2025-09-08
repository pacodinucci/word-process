export const reglasPunzados = `
[Reglas de PUNZADOS — extracción estricta]
- Registrar un punzado ÚNICAMENTE si el texto declara explícitamente que se realizó, con verbos/expresiones como:
  "canhoneado/canhoneo/canhonear/canhoneamento", "punzado", "perforado",
  "tiros disparados/feitos/realizados", "disparo de canhoneira", "shot(s)",
  "reperforado/reperfuração (com tiros)".
- NO registrar punzados cuando:
  * Solo se listan intervalos o zonas (p.ej., "Int.: 544/581,4 m", "CPS-01 (561–568 m)") sin verbo de punzado.
  * Son tareas de limpieza/chequeo/milling: "checado/chequeado", "limpo/limpieza",
    "milling/mill/sapata MILL", "raspado", "circulado", "sondado/sonolog".
  * Son trabajos de cimentación/tapones/BPP sin mención de tiros.
- Asociar cada punzado al evento que lo declara. No heredar punzados salvo aclaración explícita.
- Si no hay declaración explícita, devolver [].
`.trim();

export const ejemplosPunzados = `
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
`.trim();
