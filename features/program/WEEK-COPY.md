# Copiar a otras semanas — 2.19

La agenda reutiliza la entrada `ProgramBulkAssignDialog` con una variante de copia
de semana. La asignación masiva anterior mantiene su contrato. Con Program.Edit se
pueden elegir rutinas, podcasts o ambos y semanas concretas. Cada destino se lee
antes de mostrar los conteos; no se habilita copiar mientras una lectura falle.

Usa el PUT parcial de 2.8 por semana, sin forzar semanas iniciadas. Recalcula la
fecha desde `startLocalDate` y zona de la inscripción; la API puede añadir un 409
si se inició después de la vista previa. El resultado distingue aplicadas,
iniciadas omitidas, errores y cambios concurrentes. No promete atomicidad entre
semanas. No reintenta escrituras automáticamente ni repite por doble clic.

Solo copia celdas con referencias y los días reales del destino: semana 12 de seis
días, sin día 84. Conserva los puntos del destino. Con descanso deshabilitado no
copia descansos ni sobrescribe descansos existentes; informa el conteo. Los huecos
de origen se omiten y se cuentan aparte.

Deshacer dura ocho segundos y restaura solo las semanas aplicadas. Comprueba las
celdas otra vez antes de escribir. Tiene los mismos límites del contrato que
`WEEKLY-CELL-EDITOR.md`: no puede reconstruir un hueco ni acreditar el origen de
un `snapshot`, y no hay ETag para la carrera entre lectura y PUT. Si el destino
contiene huecos, avisa antes de copiar y no ofrece un deshacer imposible.

QA: lint/build/i18n verdes; 29/29 pruebas de agenda, edición, copia y F0; 14/14 de
regresión Fase 1/asignación masiva. Playwright MCP a 1440/390 px sin errores JS y
diálogo dentro del viewport. Toda la evidencia funcional usa HTTP sintético.

## Claves añadidas ES / EN

| ES | EN |
| --- | --- |
| Semanas aplicadas: {count} | Weeks applied: {count} |
| Semanas a actualizar: {count} | Weeks to update: {count} |
| Semanas iniciadas omitidas: {count} | Started weeks skipped: {count} |
| Semanas restauradas: {count} | Weeks restored: {count} |
| Celdas sin contenido que se omiten: {count} | Empty cells skipped: {count} |
| Celdas de descanso que se omiten: {count} | Disabled rest cells skipped: {count} |
| Cambiaron y no se sobrescribieron: {weeks}. | Changed and not overwritten: {weeks}. |
| Contenido a copiar | Content to copy |
| Copiar a las semanas elegidas | Copy to selected weeks |
| Copiar a otras semanas | Copy to other weeks |
| Copiar la semana {week} | Copy week {week} |
| El destino contiene días vacíos; esta copia no permite deshacer. | The destination contains empty days; this copy cannot be undone. |
| Las celdas copiadas quedan personalizadas. Las semanas iniciadas se omiten. | Copied cells become custom content. Started weeks are skipped. |
| No se aplicó en las semanas: {weeks}. | Not applied to weeks: {weeks}. |
| No se pudo deshacer en las semanas: {weeks}. | Unable to undo in weeks: {weeks}. |
| No se pudo preparar la copia. Vuelve a intentarlo. | Unable to prepare the copy. Try again. |
| Resultado de la copia | Copy results |
| Semanas de destino | Destination weeks |
| Vista previa de la copia | Copy preview |
| Rutinas y podcasts | Routines and podcasts |
