# Cierre del ciclo 3.17 y ajustes R7 del ERP

## Contrato y recorrido

La revisión y su mensaje pertenecen al ciclo revisado. Los pasos 4–7 completan
la lectura 3.16: evaluación interna, borrador IA etiquetado, preparación del plan
siguiente, mensaje bilingüe, adjuntos, vista previa y publicación conjunta.
Se consumen las rutas 3.9 y 3.13 documentadas en el backend en
`docs/modules/nutrition/CYCLE-REVIEWS.md` y `AI-CYCLE-SUMMARY.md` (BACK `eb181a8`).

- Guardar permite una evaluación incompleta y devuelve su revisión optimista.
  Los cambios locales bloquean salir de la ficha hasta guardar o descartar.
- La IA se solicita expresamente y no copia contenido al mensaje. Copiar abre
  una confirmación; después se exige edición y confirmación profesional. Otra
  generación, un cambio del mensaje o un borrador distinto leído del servidor
  invalidan la confirmación anterior. `insufficient` permite la revisión manual
  sin confirmar texto vacío; `unavailable` conserva los datos previos.
- El plan siguiente reutiliza el editor, permite copiar el anterior y enviar
  a aprobación. Sus escrituras no cambian la prescripción de la URL del cierre.
  No se aprueba ni publica por separado desde este recorrido.
- Los archivos son internos por defecto. Solo imágenes marcadas expresamente
  aparecen en la vista previa; un PDF permanece interno. El cliente envía
  multipart sin fijar Content-Type, y renueva URLs mediante GET del cierre.
- Publicar exige ambos mensajes, evaluación, plan preparado, confirmación de
  alertas, IA revisada cuando corresponde y ciclo finalizado según hoy local.
  Un único POST publica plan y mensaje. El éxito confirmado deja el cierre en
  solo lectura. Ante 409, fallo de contrato o respuesta incierta se comprueba
  el estado antes de repetir una escritura, conservando los textos locales.

Los permisos del servidor siguen siendo la autoridad. La UI separa gestión,
aprobación, notas y fotos, y no inventa resultados cuando una lectura falla.

## R7-01 a R7-06

Agua permanece como registro de hidratación, con mililitros visibles; no se
clasifica fuera del plan ni ofrece anclado. Las filas y la galería ordenan
desayuno, almuerzo, merienda, cena y agua; el DTO no permite inventar horarios.

El calendario conserva hoy vacío como día en curso. El resumen admite el DTO
R7-03: ese día sigue en el rango y en `days`, pero no suma `elapsedDays` ni
`interruptions`. El cliente conserva la aritmética del backend, incluida la
paginación de períodos de más de cien días y los rangos sin comidas.

Al abrir la bandeja se selecciona el último día con registros de las ventanas
cargadas. La selección explícita se conserva al actualizar. Los contadores del
encabezado y de los chips corresponden al ciclo y continuidad cargados; «sin
revisar» cuenta registros de días pendientes, mientras el contador global
existente sigue contando días. Una lectura desconocida se muestra con «—» o
«no disponible», sin convertirla en cero. Los chips combinables conservan
semántica de checkbox, teclado y foco visible.

Las comidas con equivalente muestran «En el plan» y su desvío conocido; el
agua no tiene comparación de comida. La tira ofrece iniciar el cierre y su
leyenda incluye revisado, modificado y anclado. Los días con ejemplos añaden
estrella y etiqueta accesible al estado de revisión.

## Verificación del 15-11-2026

`corepack yarn lint`, `corepack yarn build` e `i18n:check` correctos. La matriz
Playwright MCP de cierre y bandeja pasó en ES/EN a 320, 390 y 1440 px, sin
desbordamiento, errores JS ni advertencias de consola. Se comprobaron IA,
edición, preparación, confirmación de publicación, orden, agua, filtros por
teclado, selección y etiquetas. Evidencia visual en el workspace:
`openspec/changes/organizar-experiencia-bienestar/revision-front-3.17-r7/`.

Campañas con Playwright CLI sobre el cliente real y HTTP sintético del contrato:

```powershell
$env:E2E_BASE_URL='http://localhost:3056'
corepack yarn e2e e2e/nutrition-cycle-closing.spec.ts e2e/nutrition-cycle-review.spec.ts e2e/nutrition-intake.spec.ts e2e/nutrition-intake-review.spec.ts e2e/nutrition-intake-highlights.spec.ts e2e/nutrition-r7.spec.ts --project=chromium-desktop
# 60/60; primera campaña, antes de añadir dos regresiones de confirmación IA.
corepack yarn e2e e2e/nutrition-cycle-closing.spec.ts e2e/nutrition-workspace-layout.spec.ts e2e/nutrition-cycles.spec.ts e2e/nutrition-editor.spec.ts e2e/nutrition-plan-review.spec.ts --project=chromium-desktop
# 45/45; incluye las 17 pruebas finales del cierre. Hay solapamiento entre campañas.
```

La evidencia acredita el frontend contra esos contratos; no acredita una
publicación en BD real ni el recorrido ERP↔APP 3.20. La cancelación de lecturas
en desarrollo/StrictMode se registra aparte (R7-08, fuera de este alcance).
Impeccable detect no encontró errores bloqueantes: sus advertencias estéticas
de bordes y valores del sidecar se conservan como compatibilidad con la
presentación de nutrición. No se modificaron PRODUCT/DESIGN ni el sidecar.
