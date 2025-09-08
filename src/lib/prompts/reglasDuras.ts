export const reglasDuras = `
[REGLAS DURAS — se verifican antes de responder]
- No inventar eventos: si hay duda, devolver listas vacías.
- No heredar ni inferir cementaciones desde otros eventos o del “Int. principal”.
- Si una regla exige palabra **literal**, debe estar tal cual en el MISMO evento.
- Si el evento contiene “PACKER” y NO contiene \\bBPP\\b/\\bBBP\\b, **no** devolver nada en "cementaciones".
`.trim();
