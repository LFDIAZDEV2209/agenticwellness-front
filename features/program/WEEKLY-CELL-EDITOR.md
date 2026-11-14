# Edición de celda — 2.18

Desde la agenda semanal, Program.Edit abre un panel lateral. Las elecciones se
guardan con el PUT parcial `/program/enrollments/{id}/week/{n}/tasks`. Solo se
envían las celdas tocadas, conservando puntos y el resto de las misiones. Cambiar
rutina muestra las contraindicaciones antes de elegir. También admite podcast,
restablecer y mover/intercambiar rutinas. No edita el catálogo.

El inicio se calcula desde la inscripción y su zona horaria, conforme a 2.8-fix
(`5ef2567`). La API decide definitivamente si hay activación o historial: un 409
bloquea nuevas escrituras y aparece en el panel. La prelectura compara las celdas
tocadas y avisa si cambiaron. **Límite:** no existe ETag/versión condicional en el
PUT; la comparación no cubre la carrera entre esa lectura y la escritura.

## Descanso

Verificado con CodeGraph en 2.7 (`51fe338`): clave backend
`Program:RestDays:Enabled` / entorno `Program__RestDays__Enabled`, apagada por defecto.
El backend no expone esta capacidad en una respuesta de lectura. El ERP conserva
el control deshabilitado con explicación hasta configurar explícitamente
`NEXT_PUBLIC_PROGRAM_REST_DAYS_ENABLED=true` **en su build**, de manera coordinada
con el interruptor del backend. La UI no enciende la API. Su 422 sigue protegiendo
una descoordinación; no se habilitó descanso en los servicios reales durante QA.

Intercambiar dos rutinas no necesita descanso. Mover a un día vacío deja descanso
en el origen y por eso requiere el interruptor. Un descanso existente sigue visible
cuando está apagado y no se sobrescribe desde este panel.

## Deshacer y límites del contrato

Disponible ocho segundos para el último cambio cuyo contenido anterior es
representable por el PUT. También compara antes de deshacer. Restablece una celda
de programa con `reset:true`; para otras restaura su referencia o descanso. El
GET aún entrega `source=snapshot` para autorías distintas: restaurar esa referencia
recupera contenido, pero no permite acreditar el origen original.

El contrato no permite quitar una celda y volver a un hueco vacío, de modo que no
se ofrece un deshacer ficticio en ese caso y se explica antes de elegir. No se
envían ids null para borrar vínculos: el backend los interpreta como conservar.

QA: lint/build/i18n; suite afectada, lectura F0 y móvil; build sintético adicional
con descanso habilitado. Capturas Playwright MCP a 1440/390 px sin errores JS ni
desbordamiento. No acredita configuración real ni comportamiento de la app móvil.

## Claves añadidas ES / EN

| ES | EN |
| --- | --- |
| Así lo ve el paciente | As the patient sees it |
| Cambiar rutina | Change routine |
| Cambio guardado | Change saved |
| Contenido actual | Current content |
| Día de descanso | Rest day |
| Disponible cuando la app de los pacientes lo soporte. | Available when the patients' app supports it. |
| Elegir rutina | Choose routine |
| Esta semana ya empezó; no se puede modificar. | This week has already started and cannot be changed. |
| Este día estaba vacío; este cambio no permite deshacer. | This day was empty; this change cannot be undone. |
| Los cambios se guardan al elegir. | Changes are saved when selected. |
| Mover a otro día | Move to another day |
| Mover a un día vacío requiere habilitar descanso en el día de origen. | Moving to an empty day requires enabling rest for the original day. |
| No se encontraron rutinas | No routines found |
| No se pudieron cargar las rutinas. | Unable to load routines. |
| No se pudo cargar la edición de la semana. | Unable to load week editing. |
| Restablecer al programa | Reset to program |
| Si el día tiene rutina, se intercambian ambas. | If the day has a routine, the two routines are swapped. |
| Intercambiar con {day} | Swap with {day} |
| Mover a {day} | Move to {day} |
| Esto cambió hace un momento. Revisa la agenda antes de reintentar. | This changed a moment ago. Review the agenda before trying again. |
| El descanso aún no está habilitado. | Rest is not enabled yet. |
| No se pudo guardar el cambio. Recarga la agenda antes de reintentar. | Unable to save the change. Reload the agenda before trying again. |
