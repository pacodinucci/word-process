export const objetivoYFormato = `
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
  ]
}
`.trim();
