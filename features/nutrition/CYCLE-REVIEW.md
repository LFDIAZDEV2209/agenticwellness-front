# 3.16 · Revisión guiada del ciclo, pasos 1–3

Desde la ficha de Nutrición, **Revisar ciclo** abre `?tab=cierre` para la prescripción seleccionada. Requiere `Nutrition.View`, `Nutrition.RecordsView` y `Nutrition.Manage`; la lectura conserva el alcance por paciente y ciclo del servidor. La pantalla presenta el resumen, la comparación y los registros en secciones navegables por teclado. La bandeja de pacientes sigue disponible.

Referencia visual: `openspec/changes/organizar-experiencia-bienestar/mockups/referencia-claude-f3-nutricion/nutricion-ciclo-revision.html` y su PNG. La adaptación utiliza los datos que existen en los contratos, sin porcentajes clínicos, horarios de registro, mediciones históricas ni persistencia de avance ficticios. El cuerpo humano de la ficha no cambia.

## Lecturas reales

| Uso                        | Contrato verificado                                                                                                   | Regla                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Período y adherencia       | 3.3, `e304475`: `GET /api/v1/nutrition/cycles/{id}/adherence?page=1&pageSize=100`                                     | `cycleId`, `number`, `state`, `startDate`, `endDate`, `from`, `through`, `adherence`, `daysWithData`, `elapsedDays`, `interruptions`, `daysWithUnknownMenu`, `page`, `pageSize`, `days`. Los agregados abarcan todo el período; `days` está paginado.               |
| Registros y menú histórico | 3.7, `92da468`: `GET /api/v1/nutrition/patients/{id}/intake?from&to&page=1&pageSize=100`                              | DTO y validación de 3.14/3.15. Se leen todas las fechas atribuidas por 3.3, incluida la continuidad, en ventanas contiguas de hasta 100 días. No se calcula una media sobre una primera página incompleta. Se valida que cada fecha pertenezca al ciclo consultado. |
| Revisión diaria            | 3.8a, `433c481`: `GET /cycles/{id}/days/reviews?from&to`, `POST` / `DELETE /cycles/{id}/days/{day}/review`            | Prefijo `/api/v1/nutrition`. Reutiliza 3.15. Los rangos se dividen en un máximo de 100 días. El estado cambia tras confirmación y nueva lectura, sin optimismo.                                                                                                     |
| Ejemplos anclados          | 3.8b, `19acc16`: `GET /cycles/{id}/highlights?page&pageSize`, `POST` / `DELETE /cycles/{id}/highlights/{intakeLogId}` | Prefijo `/api/v1/nutrition`. Reutiliza 3.15: lectura paginada completa, nota opcional y referencia al registro vivo; no se genera una copia congelada en el cliente.                                                                                                |

El ciclo anterior se busca entre las cabeceras publicadas, por fecha anterior más cercana. Antes de mostrarlo se comprueba el número canónico de 3.3: debe ser el número actual menos uno. Una primera publicación no fabrica un anterior. Una respuesta fallida o incoherente muestra un aviso con reintento; no retira el resumen actual ni se sustituye por ceros.

## Significado de las cifras

- **Adherencia y cobertura:** vienen de 3.3. El frontend no recalcula su fórmula. El agua no cuenta como comida; los días sin comida son interrupciones, fuera del denominador. No se limita artificialmente una adherencia superior al 100 %.
- **Calorías y macros:** suma diaria de los valores registrados, excluyendo `mealCode=agua`; media sobre días que tienen comidas y todos sus valores conocidos para esa cifra. Si una comida carece de ese valor, ese día no aporta a esa media. Cada cifra muestra su denominador. Un valor desconocido no equivale a cero ni una comida parcial a incumplimiento.
- **Agua registrada:** media de las sumas diarias con al menos una cantidad conocida, incluyendo cero explícito. No se inventa una meta histórica de hidratación.
- **Meta de menú:** media de las sumas del menú efectivo de esas mismas fechas con registro conocido y objetivo disponible. Informa su propio denominador; no usa la versión actual para sustituir un menú histórico ausente.
- **Origen:** la media conjunta se identifica expresamente como IA + paciente, con medias y número de registros separados por origen. La comparación ofrece el desglose de calorías y macros por origen. Las diferencias son descriptivas, sin valoración clínica ni flechas de mejora/empeoramiento.
- La comparación muestra los rangos efectivamente leídos y cobertura, aunque tengan distinta duración. Los cambios de adherencia se expresan en puntos porcentuales. Las mediciones clínicas por período y las metas de agua ausentes se indican como no disponibles.

## Registros y siguiente etapa

La galería carga seis tarjetas por tanda; permite todos, con foto, fuera del plan o anclados. «Fuera del plan» conserva la regla aprobada para 3.15: comida sin el mismo `mealCode` en el menú de esa fecha; el desvío calórico no filtra. El detalle reutiliza el menú histórico, los orígenes, la corrección del paciente, las fotos y el anclado de 3.15. `Nutrition.PhotosView` y `Nutrition.NotesView` gobiernan fotos y notas, también en el diálogo. Los fallos de lectura de ejemplos no se presentan como cero ejemplos.

Los pasos 4–7 aparecen como siguientes etapas; **Continuar a evaluación** permanece deshabilitado. No se llama al servicio de IA, ni a las rutas de borrador, revisión de ciclo o publicación de 3.9/3.13. No hay autoguardado del cierre ni se presenta la revisión diaria como cierre del ciclo. La integración de 3.17 queda separada.

## Verificación y evidencia

Datos, identidades, fotos y HTTP de los fixtures son sintéticos. Los contratos se verificaron en CodeGraph; estas pruebas de frontend no sustituyen las pruebas del backend.

Entrega verificada: `corepack yarn lint`, `corepack yarn build` e `i18n:check` en 0. E2E afectadas en desarrollo: **51/51** (13 de 3.16 y 38 de regresión). La suite nueva también pasó **13/13** contra el build final con `next start`. La matriz Playwright MCP se repitió sobre ese build de producción.

- `e2e/nutrition-cycle-review.spec.ts`: resumen y entrada desde ficha; comparación y navegación por foco; primer ciclo; carga/error/reintento y contrato inválido; vacío, agua sola y menú desconocido; continuidad de 130 días; galería, filtro, anclado persistido y revisión diaria; error de ejemplos; permisos de gestión y fotos.
- Playwright MCP: 320, 390 y 1440, ES/EN. Recorrido ficha → resumen → comparación → registro → anclar → filtro anclados; carga, 503 del período, reintento, vacío, 503 del anterior y reintento. Sin errores JavaScript ni desbordamiento horizontal. En el recorrido normal, cero errores de consola y red. En los estados de error, únicamente los 503 provocados por el fixture.
- Chrome DevTools MCP: inspección de DOM, consola, recursos y traza durante actualización/reintento del anterior. HTTP sintético adaptado a `fetch` en un contexto aislado; el 503 provocado del anterior conservó las cifras actuales y el reintento recuperó la comparación. Los recursos de la pantalla cargaron con 200. Sin nuevos errores desde la entrada a la revisión; los 401 previos correspondían a la restauración inicial del login antes de instalar el fixture. La traza de esa interacción en desarrollo observó CLS 0,10; no es una medición de carga de producción.
- Capturas locales en `qa-reports/3.16-{es|en}-{320|390|1440}-{summary|comparison|detail|pinned|loading|error|empty|empty-records|previous-error}.png`. Las capturas de viewport permiten revisar cada estado dentro del panel con scroll del ERP.
- Traducciones añadidas y revisadas: [CYCLE-REVIEW-I18N.md](CYCLE-REVIEW-I18N.md).
