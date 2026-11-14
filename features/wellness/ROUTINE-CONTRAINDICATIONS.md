# Contraindicaciones y duplicación — 2.20c

El editor conserva `contraindications` (máximo 4000 caracteres). Para borrarlo envía
cadena vacía: el backend interpreta null como «sin cambio». El aviso muestra solo
el texto registrado, sin inferir condiciones clínicas. Aparece en el detalle, en
la asignación individual y junto al selector del contenido semanal. La asignación
individual espera la lectura; un fallo visible permite reintentar.

Duplicar requiere `Wellness.Manage` y usa
`POST /api/v1/wellness/exercise-routines/{id}/clone` con `{}`. Abre la copia en
borrador devuelta por el backend, conservando ejercicios, medios e indicaciones.
No asigna pacientes ni modifica la rutina original. Un rechazo es visible tanto
en la lista como dentro del detalle. No hay reintento automático de la creación.

## Claves añadidas ES / EN

| ES | EN |
| --- | --- |
| Contraindicaciones | Contraindications |
| Duplicar | Duplicate |
| Revisa estas indicaciones antes de asignar la rutina. | Review these instructions before assigning the routine. |
| No se pudo duplicar la rutina. Revisa si ya se creó antes de reintentar. | Unable to duplicate the routine. Check whether it was already created before retrying. |
| Consultando contraindicaciones... | Checking contraindications... |
| No se pudieron consultar las contraindicaciones. | Unable to check contraindications. |

QA: lint, build e i18n sin errores; 32/32 casos afectados con mocks HTTP y 5/5
repetidos tras ajustar el error dentro del detalle. Inspección Playwright MCP a
1440 y 390 px: aviso visible, sin desbordamiento ni errores JavaScript.
