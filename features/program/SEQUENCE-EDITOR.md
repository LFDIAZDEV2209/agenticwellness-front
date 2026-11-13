# Editor de secuencia — 1.21

El detalle de una plantilla de 12 semanas muestra 83 días y una celda 84 deshabilitada.
La selección de podcasts usa `MediaLibraryPicker` con destino `programa`. El arrastre
intercambia los podcasts de dos celdas; la acción «Intercambiar» ofrece el mismo resultado
por teclado. Las acciones son locales hasta guardar el borrador y admiten deshacer.
Plantillas de otra duración no se convierten silenciosamente a 83 días.

Referencias revisadas: PNG «Plantilla · Secuencia de 83 días» y su pantalla dentro de
`CoppAddresd-Mockups-Fase-1-4.html`, en el change `organizar-experiencia-bienestar`.
Se reutilizan Dialog de Base UI, botones, insignias y tokens del ERP.

## Regla y conservación

- Las filas de una semana prevalecen sobre las genéricas, incluso con `mediaId: null`.
- El catálogo publicado completo se pagina y ordena por `sortOrder`, fecha e id.
- Autocompletar conserva las asignaciones existentes, rellena solo huecos y exige un
  intervalo mínimo de 42 días entre repeticiones. Si las elecciones existentes ya lo
  incumplen, informa el problema; «Rehacer toda la secuencia» permite reconstruirla.
- Rehacer recorre todos los podcasts publicados en orden y vuelve a empezar. Con 42
  episodios, los días 43–83 contienen los episodios 1–41. Menos de 42 no permite relleno.
- El contador de repeticiones cuenta apariciones posteriores a la primera; un medio
  que ya no está publicado se identifica como no disponible y cuenta como hueco.
- Solo un borrador con `Program.Edit` habilita escrituras. Guardar usa el PUT existente
  `templates/{id}/weekday-tasks?weekNumber=N`, exclusivamente con filas `podcast`.
  El fix backend 1.7b conserva las demás clases y sus referencias clínicas. Nunca se
  envía el día 84. Puntos y orden existentes se conservan por celda.
- La transacción del backend es por semana. Ante un fallo parcial se conservan los
  cambios pendientes y el reintento omite las semanas ya confirmadas.

## Verificación

```powershell
node --test features/program/services/program-sequence.test.mjs
corepack yarn e2e program-sequence.spec.ts --project=chromium-desktop
corepack yarn lint
corepack yarn build
corepack yarn i18n:check
```

Las cinco pruebas unitarias cubren resolución, regla C1, huecos, intercambio y payload.
Los cinco e2e HTTP sintéticos cubren persistencia y reintento, referencias clínicas,
arrastre, teclado, permisos, móvil, inglés, recuperación del catálogo, selector y deshacer.
Las pruebas reales del orquestador complementan esta evidencia; no se cambió `tasks.md`.

## Nuevas claves i18n (ES / EN)

| ES | EN |
| --- | --- |
| 12 semanas, 83 días | 12 weeks, 83 days |
| Arrastra para intercambiar podcasts o selecciona un día y usa Intercambiar. | Drag to swap podcasts, or select a day and use Swap. |
| Autocompletar huecos | Fill gaps automatically |
| Día 84: no existe | Day 84: does not exist |
| Días con podcast | Days with a podcast |
| Días que repiten | Days with repeats |
| El autocompletado recorre el catálogo en orden y no repite podcasts antes de 42 días. | Autofill follows the catalog order and leaves at least 42 days between repeats. |
| Estado de la secuencia | Sequence status |
| Huecos | Gaps |
| Intercambiar | Swap |
| La secuencia de 83 días requiere una plantilla de 12 semanas. | The 83-day sequence requires a 12-week template. |
| No existe | Does not exist |
| No se pudo cargar la plantilla. | Unable to load the template. |
| No se pudo completar respetando 42 días entre repeticiones. Revisa la secuencia o publica más podcasts. | Unable to fill the sequence with at least 42 days between repeats. Review the sequence or publish more podcasts. |
| No se pudo guardar la secuencia. Los cambios pendientes se conservan. | Unable to save the sequence. Pending changes have been kept. |
| Plantilla de programa | Program template |
| Podcast no disponible | Podcast unavailable |
| Puntos | Points |
| Rehacer toda la secuencia | Rebuild the entire sequence |
| Se necesitan al menos 42 podcasts publicados para autocompletar. | At least 42 published podcasts are required for autofill. |
| Secuencia de podcasts | Podcast sequence |
| Selecciona otro día para intercambiar los podcasts. | Select another day to swap the podcasts. |
| Tarea | Task |
| Tareas | Tasks |
| Vacío | Empty |
