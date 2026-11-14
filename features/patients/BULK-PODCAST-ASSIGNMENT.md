# Asignación de podcasts en bloque · 1.24

El directorio clínico permite seleccionar hasta 100 pacientes, incluso entre páginas
y filtros. La selección se elimina al cambiar de usuario, clínica o autorización.
La acción requiere `Program.Edit` y el rol `Admin` o `ClinicalDirector`.

El diálogo reutiliza el selector de biblioteca de 1.20 y exige un podcast publicado
con archivo válido. Permite elegir semanas 1–12 del programa de 83 días, revisar la
selección y cancelar sin escribir. La confirmación bloquea cierres y envíos duplicados
mientras está pendiente. Al terminar se limpia la selección y se actualiza el directorio.

## Contrato y alcance

`POST /api/v1/program/content/bulk-assign-patients`, back `a21c71d`:

```ts
// Solicitud
{ patientIds: string[], mediaId: string, semanaDesde: number, semanaHasta: number }
// Respuesta
{ aplicadas: number, omitidasSemanaIniciada: number, omitidasSinAlcance: string[] }
```

El backend es quien aplica §10.3: Admin tiene alcance global; Director conserva el
alcance de sus pacientes asignados. Omite semanas iniciadas según la fecha local del
paciente, personaliza los podcasts futuros y conserva las otras clases de tareas.
`aplicadas` y `omitidasSemanaIniciada` cuentan pacientes distintos, pueden solaparse
y no son cantidades de semanas. `omitidasSinAlcance` contiene identificadores.
El resultado muestra solo los identificadores enviados que devuelve ese campo,
sin nombres ni datos clínicos de pacientes omitidos por alcance.

No existe una consulta de simulación: la revisión previa no ejecuta el POST ni
inventa conteos. Los resultados se muestran tras confirmar. Se traducen los errores
`ACTIVE_ENROLLMENT_REQUIRED`, `PROGRAM_WEEK_OUT_OF_RANGE`, `PODCAST_NOT_PUBLISHED`
y 403, conservando la selección para corregir. Los errores inciertos piden revisar
el estado antes de reintentar; no hay reenvío automático de negocio.

## Referencias y comprobación

Inspiración visual oficial: `openspec/changes/organizar-experiencia-bienestar/mockups/
referencia-claude-1c-publicar/1.24-asignacion-bloque/`. Se adaptaron los estados al
contrato real: sin matriz predictiva ni resultados individuales que el API no entrega.

`e2e/patients-bulk-podcast.spec.ts` cubre selección entre páginas y filtros, límite 100,
permisos, revisión/cancelación sin escritura, bloqueo durante envío, un solo POST,
resultado con conteos solapados y privacidad del alcance, errores de dominio, placeholder,
inglés y móvil. `e2e/workspace-style.spec.ts` conserva la regresión del directorio.
Son pruebas HTTP sintéticas; no sustituyen la integración del backend con datos reales.
Las capturas locales quedan en `.shots/1.24/` y los artefactos en `qa-reports/1.24-patients-final/`.

## Claves i18n añadidas (ES/EN)

Se reutilizan las claves existentes del selector y de navegación; las siguientes
son las únicas claves nuevas. En ES el valor coincide con la clave.

| ES / clave | EN |
| --- | --- |
| Asignar podcast en bloque | Assign podcast in bulk |
| Resultado de la asignación | Assignment result |
| Revisa las asignaciones aplicadas y las omisiones. | Review the applied assignments and skipped patients or weeks. |
| Un podcast, varias semanas y varios pacientes. Nada se guarda hasta confirmar. | One podcast, several weeks and several patients. Nothing is saved until you confirm. |
| Semanas {from} a {to} | Weeks {from} to {to} |
| Pacientes con asignaciones aplicadas | Patients with assignments applied |
| Pacientes con semanas iniciadas omitidas | Patients with started weeks skipped |
| Pacientes omitidos por alcance | Patients skipped due to scope |
| Los conteos de aplicados y semanas iniciadas pueden incluir al mismo paciente. | The applied and started-week counts may include the same patient. |
| Fuera de tu alcance | Outside your scope |
| No se modificaron. Solo se muestran los identificadores enviados, sin nombres ni datos clínicos. | They were not changed. Only submitted identifiers are shown, without names or clinical data. |
| Las asignaciones quedan personalizadas y las futuras publicaciones de plantilla las conservan. | Assignments are personalized and preserved when future template versions are published. |
| {count} paciente{s} seleccionado{s} | {count} patient{s} selected |
| La selección incluye pacientes de otras páginas o filtros. | The selection includes patients from other pages or filters. |
| Elige un podcast publicado de la biblioteca. | Choose a published podcast from the library. |
| Cambiar podcast | Change podcast |
| Elegir podcast | Choose podcast |
| Desde la semana | From week |
| Hasta la semana | To week |
| La semana final debe ser igual o posterior a la inicial. | The final week must be the same as or later than the starting week. |
| Asignar {podcast} en las semanas {from} a {to} a {count} paciente{s}. | Assign {podcast} in weeks {from} to {to} to {count} patient{s}. |
| Las semanas iniciadas se omiten y los pacientes fuera de tu alcance no se modifican. Los conteos se confirman al aplicar. | Started weeks are skipped and patients outside your scope are not changed. Counts are confirmed when applied. |
| Todos los pacientes de tu alcance deben tener un programa activo. | All patients within your scope must have an active program. |
| Aplicando... | Applying... |
| Confirmar y asignar | Confirm and assign |
| Elige un podcast publicado con un archivo válido. | Choose a published podcast with a valid file. |
| Todos los pacientes de tu alcance deben tener un programa activo. Revisa la selección antes de continuar. | All patients within your scope must have an active program. Review the selection before continuing. |
| El rango supera la duración del programa de un paciente. Ajusta las semanas. | The range exceeds a patient's program duration. Adjust the weeks. |
| No se pudo confirmar la asignación. Revisa el estado antes de reintentar. | Unable to confirm the assignment. Check its status before retrying. |
| Seleccionar pacientes de esta página | Select patients on this page |
| Seleccionar a {name} | Select {name} |
| Acciones de pacientes seleccionados | Selected patient actions |
| {count} en esta página. Máximo {max} por asignación. | {count} on this page. Maximum {max} per assignment. |
