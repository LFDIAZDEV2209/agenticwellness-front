# Pulido R2 + R3 — 1.28

## Entregado en el front

| Hallazgo | Comportamiento |
| --- | --- |
| R2-03 / R3-01 | El impacto cuenta plantillas activas; las referencias se etiquetan como activa, borrador, archivada o estado no disponible. Los borradores no se presentan como actualizados: se avisa explícitamente y se nombran cuando su estado se puede leer. No se modifican desde el front. |
| R2-04 | Esqueleto de dos zonas, nombres de sección y aviso al superar cuatro segundos. No se habilita retirar antes de cargar el impacto. |
| R2-06 | Sustitución singular, «Elige un único sustituto» / «Usar como sustituto». |
| R2-07 / R2-08 | Rango sin preselección y selección de otras páginas avisada solo si existen pacientes elegidos fuera de la página visible. |
| R2-10 / R2-11 | Medios sin archivo visibles y deshabilitados; podcasts solicitados al servidor por `sortOrder` numérico. No se eliminan después de paginar por carecer de archivo. |
| R2-13 / R2-14 | Sin Día/Mes en la ficha. Uso con conteo de referencias en tarjetas y etiquetas también en tabla. No se inventan pacientes ni uso cuando el DTO no trae conteo. |
| R2-15 | Tipo, vacío, 200 MB y duplicados por nombre/tamaño comprobados al entrar al lote. Autor, título y categoría obligatorios por fila; categoría sin selección inicial. Solo se suben las filas válidas. Quitar el primer duplicado recupera el siguiente. |
| R2-17 | Las URL S3 antiguas de miniaturas se convierten en clave y pasan por `/storage/sign`. Si la imagen falla se conserva el fondo, sin icono roto. No se cambió la configuración de buckets. |
| R3-04 | Banner «Plantilla activa: solo lectura», ayuda de consulta y acción de nueva versión pendiente. |
| R3-05 | Huecos agrupados por tipo/semana con contadores; cada día abre la plantilla con ese día seleccionado. Funciona con el 422 actual y está preparado para la ampliación del preview. |
| R3-06 | Celdas sin archivo marcadas; no cuentan como días con podcast ni participan en autocompletar. Validez editorial de la referencia; no equivale a una comprobación física de storage. |

## Dependencias confirmadas por el orquestador

**1.29 aún pendiente:** «Crear nueva versión» queda deshabilitada, con tooltip
«Pendiente del backend». Copy aprobado literalmente: «Crea un borrador con los 83
días de esta plantilla; la versión activa sigue vigente hasta publicar». No se
inventó una ruta de clonación.

**Preview de huecos aún pendiente:** el back añadirá una lectura sin escritura
después de 2.11/2.12/2.16/1.15b/1.29. El front está preparado para el campo opcional
`huecos: [{day,weekNumber,weekday,taskCode}]` en el resultado de
`POST /program/templates/{id}/publish?preview=true`. Valida la forma, agrupa la
lista y bloquea publicar al recibir huecos. Coordinar el nombre final del campo
cuando se entregue el contrato. Ausencia no significa cero: conserva el aviso
de comprobación al publicar y la validación 422 vigente. Nunca llama a publicar
al abrir el diálogo. R3-05 anticipado no queda acreditado contra el servicio real
hasta integrar esa ampliación.

Los límites anteriores de sustitución de demostraciones en el backend siguen
registrados en O31: las pruebas HTTP sintéticas no acreditan que se actualicen las
referencias de `routine_exercises` / `exercise_routines` en BD.

## Verificación

`corepack yarn lint`, `build`, `i18n:check` sin errores. Ocho pruebas puras de cola;
30 casos de medios/pacientes/UX y 35 de regresión de fase, impacto, editor, plantillas,
medios y demostraciones verdes. Las dos aserciones antiguas sobre listas planas se
adaptan a los grupos expandibles. Playwright MCP 1440/390 px: banner, tooltip,
contador y ausencia de desbordamiento de página; sin errores JavaScript.
Las pruebas funcionales usan mocks HTTP sintéticos; no hubo publicación real,
escritura de pacientes ni operaciones sobre buckets.

## Claves nuevas ES / EN

Las claves de las otras entregas de esta cadena están en [2.17](WEEKLY-AGENDA.md),
[2.20b](../wellness/EXERCISE-DEMONSTRATIONS.md),
[2.20c](../wellness/ROUTINE-CONTRAINDICATIONS.md),
[2.18](WEEKLY-CELL-EDITOR.md) y [2.19](WEEK-COPY.md).

| ES | EN |
| --- | --- |
| Consulta el contenido de cada día de esta versión. | View the content for each day of this version. |
| Consultando el impacto y las referencias… | Checking impact and references… |
| Crea un borrador con los 83 días de esta plantilla; la versión activa sigue vigente hasta publicar | Create a draft with this template's 83 days; the active version remains in effect until publication |
| Elige un único sustituto | Choose one replacement |
| Elige una categoría. | Choose a category. |
| Elige una semana | Choose a week |
| En uso · {count} | In use · {count} |
| La consulta está tardando más de lo habitual. Puedes esperar o cancelar. | This check is taking longer than usual. You can wait or cancel. |
| Los 83 días tienen el contenido requerido. | All 83 days have the required content. |
| Los borradores no se modifican. Revisa sus referencias antes de publicarlos. | Drafts are not changed. Review their references before publishing them. |
| Pendiente del backend | Pending backend |
| Plantilla activa: solo lectura | Active template: read only |
| Plantillas activas que se actualizarán | Active templates to update |
| Referencias en plantillas | Template references |
| Sin archivo | No file |
| Sin archivo · no se puede elegir | No file · cannot be selected |
| Sin archivo. Este día se cuenta como hueco. | No file. This day counts as a gap. |
| Usar como sustituto | Use as replacement |
| Activa · se actualizará | Active · will be updated |
| Borrador · no se modifica | Draft · unchanged |
| Archivada · no se modifica | Archived · unchanged |
| Estado no disponible | Status unavailable |
| El archivo está vacío. | The file is empty. |
| Archivo duplicado en este lote. | Duplicate file in this batch. |
