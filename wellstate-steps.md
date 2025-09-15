# Paso a paso

## 1. Punto de partida claro (lo que ya tenemos)

- **Input:** archivo `.docx` → texto completo → `rawIntervenciones` (bloques por intervención).
- **Objetivo inmediato:** convertir cada `rawIntervencion` en **eventos atómicos estandarizados** y aplicarlos secuencialmente a un **WellState** (estado global del pozo).

## 2. Definir el “diccionario” de eventos (sin código aún)

- Armar un catálogo corto y estable de **eventos atómicos** que describan acciones que cambian (o no) el estado estructural del pozo.
- Ejemplos: `PUNZADO_ABIERTO`, `SQUEEZE`, `SET_TAPON_CEMENTO`, `CORTE_CEMENTO`, `PACKER_SET/RETRIEVE`, `TEST_*`, `ESTIMULACION`, `LIMPIEZA`, etc.
- Para cada evento, acordar campos mínimos (fecha, intervalo/profundidad, metadatos) y **si afecta o no** el estado estructural.

## 3. Definir el modelo mínimo del “WellState”

- Contendrá listas/tablas de: **punzados** (con estado: abierto/cerrado y quién lo cerró), **tapones de cemento** (activos/removidos), **squeezes**, **packers** (activos/inactivos), y **logs** de operaciones neutrales (tests, estimulaciones, limpiezas).
- Importante: decidir si representamos “zonas” por **intervalos** (con posibles splits) y mantener un `status` por intervalo.

## 4. Normalización por intervención

- Para cada `rawIntervencion`, ejecutamos un **normalizador** (IA + reglas) que produce:
  - Una **lista de eventos atómicos estandarizados** (del diccionario del paso 2).
  - Fechas/intervalos **homogeneizados** (unidades, decimales, formato de fecha).
  - Flags de **confianza/ambigüedad** para revisión (si algo no está claro).
- Resultado: `IntervencionNormalizada = { fecha, eventos[] }`.

## 5. Orden temporal y criterio de desempate

- Ordenar todas las `IntervencionNormalizada` **de la más antigua a la más nueva**.
- Si hay misma fecha, definimos un desempate determinista (p. ej., orden de aparición en el documento).

## 6. Motor de reglas: aplicar eventos al WellState

- Recorrer intervención por intervención, evento por evento, aplicando **reglas de negocio**:
  - **Eventos que NO cambian estructura:** `TEST_*`, `ESTIMULACION`, `LIMPIEZA` → solo se registran en el log (no alteran estados de punzados).
  - **Eventos que SÍ cambian estructura:**
    - `PUNZADO_ABIERTO` → crea/une intervalos en estado **abierto**.
    - `SQUEEZE` o `SET_TAPON_CEMENTO` sobre un punzado → ese intervalo (o parte) pasa a **cerrado** (guardar `closed_by` = squeeze/tapón).
    - `CORTE_CEMENTO` sobre un tapón previo → marcar tapón **removido** y, si corresponde, **reabrir** el intervalo afectado (total o parcial).
    - `PUNZADO` posterior sobre zona ya cementada → **reabre** (nuevo estado **abierto**) en el sub-intervalo afectado.
    - `PACKER_SET/RETRIEVE` → track operacional (no cambia punzados), pero habilita validaciones de pruebas.
- Cada aplicación genera un **delta** (qué cambió) y **validaciones** (warnings/errores).

## 7. Reglas de transición del punzado (mini-FSM)

- Inexistente → **Abierto** (por PUNZADO).
- Abierto → **Cerrado** (por SQUEEZE o TAPON).
- Cerrado → **Abierto** (por RE-PUNZADO o CORTE que remueve la barrera).
- **Parciales:** si un evento afecta solo parte del intervalo, **split** del intervalo en segmentos con estados distintos (abierto/cerrado).

## 8. Gestión de intervalos

- Definir criterios conceptuales (sin implementar aún) para:
  - **Unir** intervalos contiguos/solapados con **mismo estado**.
  - **Dividir** intervalos cuando un evento afecta parcialmente.
  - Tolerancias (p. ej., 0.1 m) para evitar ruido por redondeos.

## 9. Validaciones y coherencia

- Antes de aplicar un evento, chequear precondiciones:
  - `SQUEEZE` debe **intersectar** un punzado abierto previo.
  - `CORTE_CEMENTO` debe caer sobre un **tapón** existente.
  - `TEST` debería referir a un intervalo **abierto** (si explícito); si no, loggear warning.
- Registrar **warnings/errores** por intervención, sin frenar el pipeline (a menos que vos decidas lo contrario).

## 10. Persistencia trazable

- Guardar:
  - Estado global final (**WellState**).
  - **Historial por intervención**: eventos aplicados, deltas, warnings/errores, referencias a la fuente (página, línea).
- Así podés auditar por qué el estado final es el que es.

## 11. Idempotencia y re-análisis

- El análisis completo debe ser **determinista**: mismo input → mismo estado.
- Si re-analizás (porque cambió el parser o el prompt), primero **reseteás** el WellState y volvés a aplicar todas las intervenciones en orden.
- Mantener versión de esquema (por si luego agregamos nuevos tipos de eventos).

## 12. UI y control operativo (más adelante)

- Timeline por intervención con badges de cambios.
- Snapshot del estado del pozo (punzados por intervalo y estado).
- Panel de validaciones (filtros por error/warning).
- Botón “Reanalizar” (ya tenés algo parecido) que limpia resultados y reejecuta.

## 13. Criterios de aceptación por etapa

- **E1 (modelos):** Diccionario de eventos + campos acordados; `WellState` mínimo definido.
- **E2 (normalización):** De 3 documentos reales, obtener eventos limpios y coherentes.
- **E3 (reglas):** Casos clave aprobados:
  - Test sobre punzado existente → **no cambia** el punzado.
  - Estimulación → **no cambia** el punzado.
  - Squeeze/tapón sobre punzado → **cierra** el intervalo (total/parcial).
  - Corte de cemento sobre tapón → **remueve** tapón y, si aplica, **reabre**.
- **E4 (consolidación):** Uniones/splits de intervalos funcionan en casos con solapes.
- **E5 (idempotencia):** Re-ejecución produce exactamente el mismo estado y logs.
