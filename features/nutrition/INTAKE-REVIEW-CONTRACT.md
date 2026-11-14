# 3.15 · Filtros, revisión diaria y preparación de ejemplos

Rama `org/f3-coppaddresd-front`, desde la entrega 3.14 `2e63d57`.
Mockup oficial: `referencia-claude-f3-nutricion/Nutrición · Bandeja de registros del paciente.png`.
Solo esta pantalla y su bandeja. No inicia cierre guiado ni publicación (3.16–3.17).
El cuerpo humano y los flujos de medios no cambian. No se editan tasks.md ni documentación
de estado del workspace; su consolidación corresponde al orquestador.

## Contratos confirmados

**3.7, backend `92da468`**, verificado con CodeGraph y `git show`:
`GET /api/v1/nutrition/patients/{id}/intake?from&to&page&pageSize`.
Mantiene el DTO y paginación descritos en `INTAKE-CONTRACT.md`.
Se retira el origen clínico provisional de 3.14: solo se aceptan `ai_estimated`
y `patient_confirmed`. Un origen `clinical` en la respuesta produce error visible,
de acuerdo con la decisión de Luis documentada por el backend; un source libre
no demuestra autoría clínica. Menú histórico y estimación original permanecen separados.

**3.8a, backend `433c481`**, rutas confirmadas por el orquestador y verificadas
en `NutritionCyclesController`, `NutritionReadController` e `IntakeDayReview.cs`:

| Operación | Ruta | Respuesta |
|---|---|---|
| Consultar revisión | `GET /api/v1/nutrition/cycles/{id}/days/reviews?from&to` | `IntakeDayReviewDto[]` |
| Marcar día | `POST /api/v1/nutrition/cycles/{id}/days/{day}/review` | `IntakeDayReviewDto` |
| Deshacer marca | `DELETE /api/v1/nutrition/cycles/{id}/days/{day}/review` | `IntakeDayReviewDto` |
| Contador global | `GET /api/v1/nutrition/intake/unreviewed-count` | `{ days: number }` |

```ts
interface IntakeDayReviewDto {
  localDate: string;
  hasRecords: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  unreviewed: boolean;
  modifiedSinceReview: boolean;
}
```

- POST y DELETE sin cuerpo, sin actor ni timestamps del cliente. El servidor resuelve autor,
  alcance y fecha; marcar/desmarcar no genera una revisión de ciclo ni publica contenido.
- Lecturas: `Nutrition.View` + `Nutrition.RecordsView` y alcance; escritura: `Nutrition.Manage`
  y alcance por ciclo. La UI oculta comandos a coordinación/lectura; no sustituye el guard del servidor.
- Fechas locales ISO. Solo se piden rangos contiguos ya transcurridos del ciclo,
  hasta 60 días cargados (ciclo + ventana), sin una petición por celda ni rangos que atraviesen
  un salto de continuidad antigua. El backend limita cada rango a 100 días.
- `modifiedSinceReview` y `unreviewed` se toman de la respuesta del servidor, no de comparar
  relojes del navegador ni de guardar marcas locales. Reabrir la ficha reconsulta el estado.
- Cada escritura se confirma por HTTP y después se vuelve a leer revisión y contador.
  Bloqueo de doble pulsación, cancelación al desmontar y ningún optimismo ni persistencia local.
  Error de escritura → aviso que pide comprobar el estado antes de volver a enviar.
- Una lectura incompleta, 404, 403 o 503 no marca todos los días como «sin revisar».
  El filtro y los comandos se deshabilitan hasta tener una lectura válida, con reintento,
  mientras sigue disponible el detalle de comidas de 3.7.
- El contador usa exclusivamente `{ days }`: no suma la página visible ni descarga ingestas
  de otros pacientes. Ausencia/error significa **desconocido**, nunca cero. El servidor conserva
  el alcance de los pacientes asignados (con la excepción de Admin definida en el change).

## Filtros y decisión aprobada

Luis confirmó en esta sesión: **fuera del plan = no existe una comida del mismo `mealCode`
en el menú publicado de ese día**. No se aplica umbral de calorías, ni por exceso ni por defecto.
Una diferencia calórica se muestra con su signo como dato; no altera ese filtro.
Sin menú no hay equivalente. Macros nulos siguen siendo «Sin dato», sin convertirlos a cero.

Con foto, sin revisar, fuera del plan y tipo de comida se combinan con AND sobre los datos
cargados; no se inventan parámetros de filtrado para 3.7. La UI indica ese alcance y muestra
el número de comidas, separado del contador global de días. La tira conserva sus 30 fechas
y estados originales; los filtros no transforman un día oculto en interrupción.
Al cambiar filtros se propone el día más reciente con coincidencias. Se pueden seleccionar
otras fechas, mostrando el vacío de filtro correspondiente y «Limpiar filtros».
La revisión siempre se aplica al **día completo**, incluso con filtros activos, explicado junto
al comando. Fotos restringidas → filtro de foto deshabilitado, sin solicitudes de imagen.

## Contrato real 3.8b (`19acc16`)

Codex-back entregó este commit durante 3.15, con aviso de Luis. Se verificó con CodeGraph
y `git show` de `NutritionHighlightsController.cs`, `IntakeExamples.cs` y
`docs/modules/nutrition/CYCLE-HIGHLIGHTS.md`. Se consume el contrato entregado, sin protocolo
alternativo ni laboratorio en el producto. Los datos de las pruebas siguen siendo HTTP sintético.

- `GET /api/v1/nutrition/cycles/{id}/highlights?page=1&pageSize=100`
  → `{ page, pageSize, total, items }`.
- `POST /api/v1/nutrition/cycles/{id}/highlights/{intakeId}` con `{ note: string|null }` → 204.
- `DELETE` a esa misma ruta → 204.
- Cada ítem: `intakeLogId`, `localDate`, `mealCode`, `recorded` (macros), `waterMl`,
  `pinnedBy`, `pinnedAt`, `note`. Nota opcional de hasta **2000** caracteres.

El servicio conserva el DTO real y el componente usa una proyección de presentación
`{ recordId, note }`. Las páginas de referencias se leen hasta cubrir el total del ciclo,
sin descargar fotos/análisis ni hacer una petición por comida. Así un ejemplo de la página 2
no se presenta falsamente como «sin anclar». Totales cambiantes, páginas parciales o IDs
duplicados producen lectura no válida con reintento; nunca una lista vacía inventada.

La confirmación y relectura atraviesan HTTP, sin optimismo, localStorage ni datos de ejemplo
en código de producto. El anclado referencia el ID del registro: una corrección mantiene la
marca y la nota. POST/DELETE requieren `Nutrition.Manage`, ciclo y registro del mismo paciente;
el backend aplica alcance a ambos. Notas visibles/editables solo con `Nutrition.NotesView`;
la UI también las oculta aunque una respuesta defectuosa las incluyera para coordinación.
Con endpoint ausente o lectura fallida el botón se deshabilita y permite reintentar la lectura.
No cierra ciclos, publica recomendaciones ni llama a los contratos de 3.9.

## Validación

Evidencia del 14/11/2026 sobre esta entrega:

- `corepack yarn lint`, `corepack yarn build`, `corepack yarn i18n:check`: salida 0;
  TypeScript correcto y cero claves ausentes. 50 claves nuevas ES/EN y una traducción corregida.
- `next dev` local: **42/42** entre las cinco suites listadas abajo (17 casos nuevos y 25 de regresión).
- `next start` del build final: **17/17** casos nuevos de revisión y anclado.
- Logs locales: `qa-reports/3.15-{lint,build,i18n,full-dev,prod}.log`.
- Matriz Playwright MCP y capturas: siguiente sección. Toda la evidencia HTTP es sintética;
  no reemplaza la comprobación de permisos, concurrencia y persistencia del backend.

Suites nuevas:

- `e2e/nutrition-intake-review.spec.ts`: filtros AND, misma clave de comida y desvío informativo,
  marcar/deshacer y refrescar, contador global, modificación posterior, error de escritura,
  DTO inválido/contador no disponible, coordinación, origen falsificado, ausencia de rutas
  de highlights en el flujo normal, teclado a 320 px e inglés.
- `e2e/nutrition-intake-highlights.spec.ts`: contrato real con HTTP sintético para
  anclar/quitar/nota, conservación tras corrección y recarga, error/reintento, privacidad de nota,
  teclado, 320 px y ejemplo en la segunda página. No afirma persistencia/autorización del backend.

Regresión: `nutrition-intake.spec.ts`, `nutrition-workspace-layout.spec.ts`, `nutrition-cycles.spec.ts`.
Solo el laboratorio preexistente de `nutrition-cycles.spec.ts` requiere `next dev`.
Usar `E2E_BASE_URL=http://localhost:3058`; no ampliar `allowedDevOrigins` para 127.0.0.1.
Traducciones nuevas ES/EN: `INTAKE-REVIEW-I18N.md`.

## Evidencia UI con Playwright MCP

Se probó la página real `/nutrition/{id}?tab=registros`, no un componente aislado,
con HTTP sintético para los contratos entregados. Matriz completa de seis contextos:
**320, 390 y 768 px × español e inglés**. En cada uno:

1. Carga bloqueada visible y recuperación.
2. Filtros combinados sin resultados, limpiar y un día sin comidas.
3. Marcar, deshacer, modificación posterior y volver a revisar.
4. Anclar nota, conservar el ejemplo al corregir y quitarlo.
5. Error de escritura de revisión y de anclado, sin éxito ficticio; relectura y reintento.
6. Fallo de lectura de ingestas (503), aviso y reintento sin perder el flujo.

Resultado en los seis: **cero errores `pageerror`, cero avisos/errores en consola normal,
cero mensajes de consola inesperados y cero desborde horizontal**. En cada contexto los
escenarios de fallo inyectan cuatro respuestas HTTP 503; sus mensajes de red son esperados
y se distinguen de los errores JavaScript. Las escrituras de QA fueron interceptadas; no
se cambió información real del backend.

La matriz detectó y corrigió en esta entrega las claves dinámicas «Sin foto»/«Revisado»,
la traducción inglesa de «Sin datos» y el breadcrumb que intentaba traducir el nombre del
paciente. El Topbar ahora conserva literal el título dinámico y traduce las etiquetas
estáticas; no se envían nombres propios al colector de claves ausentes.

Capturas locales (`qa-reports/`, excluidas de Git) por cada idioma y ancho:
`3.15-mcp-{es|en}-{320|390|768}-{carga|normal|vacio-filtros|dia-vacio|error-revision|error-anclado|revisado-sin-ancla|error-ingestas}.png`.

| Vista | Normal | Carga | Vacío | Error de ingestas |
|---|---|---|---|---|
| ES 320 | [captura](../../qa-reports/3.15-mcp-es-320-normal.png) | [captura](../../qa-reports/3.15-mcp-es-320-carga.png) | [captura](../../qa-reports/3.15-mcp-es-320-vacio-filtros.png) | [captura](../../qa-reports/3.15-mcp-es-320-error-ingestas.png) |
| ES 390 | [captura](../../qa-reports/3.15-mcp-es-390-normal.png) | [captura](../../qa-reports/3.15-mcp-es-390-carga.png) | [captura](../../qa-reports/3.15-mcp-es-390-vacio-filtros.png) | [captura](../../qa-reports/3.15-mcp-es-390-error-ingestas.png) |
| ES 768 | [captura](../../qa-reports/3.15-mcp-es-768-normal.png) | [captura](../../qa-reports/3.15-mcp-es-768-carga.png) | [captura](../../qa-reports/3.15-mcp-es-768-vacio-filtros.png) | [captura](../../qa-reports/3.15-mcp-es-768-error-ingestas.png) |
| EN 320 | [captura](../../qa-reports/3.15-mcp-en-320-normal.png) | [captura](../../qa-reports/3.15-mcp-en-320-carga.png) | [captura](../../qa-reports/3.15-mcp-en-320-vacio-filtros.png) | [captura](../../qa-reports/3.15-mcp-en-320-error-ingestas.png) |
| EN 390 | [captura](../../qa-reports/3.15-mcp-en-390-normal.png) | [captura](../../qa-reports/3.15-mcp-en-390-carga.png) | [captura](../../qa-reports/3.15-mcp-en-390-vacio-filtros.png) | [captura](../../qa-reports/3.15-mcp-en-390-error-ingestas.png) |
| EN 768 | [captura](../../qa-reports/3.15-mcp-en-768-normal.png) | [captura](../../qa-reports/3.15-mcp-en-768-carga.png) | [captura](../../qa-reports/3.15-mcp-en-768-vacio-filtros.png) | [captura](../../qa-reports/3.15-mcp-en-768-error-ingestas.png) |

Chrome DevTools también se utilizó para consola/red del documento local (HTTP 200);
fuera del contexto con mocks la restauración anónima devuelve 401 y lleva al login.
Las pruebas de pantalla autenticada y la consola limpia de arriba corresponden a Playwright MCP.
