# Agenda semanal · 2.17

Desde Perfil 360 → Plan semanal → Ver tareas, disponible también en lectura.
El diálogo presenta rutina/descanso y podcast por día; las demás misiones se
conservan en un desplegable. Siete columnas en escritorio y lista vertical en móvil.
La semana final respeta los seis días recibidos; no fabrica un día 84.

Consume solo `GET /program/enrollments/{id}/week/{number}`. Usa `source`, `rest`,
contenido y totales entregados por el backend. No activa semanas, consulta catálogos
ni escribe tareas. La edición antigua del diálogo se sustituye por esta agenda de
lectura; los cambios por celda quedan para 2.18/2.19 tras el contrato 2.8.

Verificados con CodeGraph GetSnapshot y ProgramUpcoming del back Fase 2, `c0288b3`:
`upcoming` es opcional y solo incluye mañana hasta hoy+6; no sustituye el detalle de
una semana elegida. `rest` es opcional y elimina la misión de ejercicio. Los tipos
del detalle semanal amplían esos campos de forma compatible con respuestas antiguas.

Origen: `template_week`/`template_generic`/`program` → Del programa; `individual` →
Personalizado; `legacy` → Asignación anterior; descanso → Descanso. Un podcast
`snapshot` viene del programa según el resolvedor. **Límite del contrato de rutina:**
`EffectiveRoutineResolver` devuelve `snapshot` sin distinguir `Origin=program` de
una edición individual; se muestra De la semana, sin atribuir autoría que no consta.
Si el contrato necesita distinguir ambas, el backend debe ampliar su metadato.
La ausencia de `source` se muestra Origen no informado; no se convierte en legado.

Errores 403/404/5xx: mensaje genérico y reintento, sin mostrar errores internos ni
contenido de una respuesta anterior. Cada lectura se cancela al cerrar/cambiar semana.
Pruebas HTTP sintéticas: `e2e/program-week-agenda.spec.ts` y regresión `bienestar-f0`.

## Claves nuevas ES/EN

En ES el valor coincide con la clave. Las demás etiquetas se reutilizan.

| ES / clave | EN |
| --- | --- |
| Del programa | From the program |
| Asignación anterior | Previous assignment |
| De la semana | From the week |
| Sin contenido | Missing content |
| Origen no informado | Source not provided |
| Sin rutina | No routine |
| Contenido asignado | Assigned content |
| Sin misión de ejercicio | No exercise mission |
| Otras tareas | Other tasks |
| Agenda en solo lectura | Read-only agenda |
| Cargando agenda | Loading agenda |
| No pudimos cargar la agenda | Unable to load the agenda |
| Agenda semanal | Weekly agenda |
| Sin tareas configuradas para esta semana | No tasks configured for this week |
| Ver tareas | View tasks |
