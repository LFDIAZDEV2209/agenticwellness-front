# Publicación de plantillas — 1.22

La acción Publicar de la lista de plantillas abre una vista de impacto con el estilo del
PNG «Vista de impacto al publicar» y `mockups/canvas-fuente/Impacto.dc.html` del change
`organizar-experiencia-bienestar`. Reutiliza Dialog de Base UI y los tokens del ERP.
No modifica el editor 1.21 ni `tasks.md`.

## Contrato y límites

- Consulta `POST /api/v1/program/templates/{id}/publish?preview=true` al abrir.
  Muestra `pacientesQueCambian`, `conPersonalizacionesFuturas` y
  `semanasOmitidasIniciadas`. Los dos conteos de pacientes pueden solaparse:
  no se suman, ni se representa una barra de grupos excluyentes o un total inventado.
- Solo una plantilla Draft con `Program.Edit` ofrece publicación. Carga o fallo del
  impacto bloquean la confirmación; reintentar vuelve a consultar. Cerrar cancela
  la consulta y una nueva apertura descarta el estado anterior.
- Confirmar usa el POST existente sin `preview`. Un bloqueo inmediato por referencia
  evita doble envío; durante la publicación no permite cerrar ni cancelar.
- **El contrato 1.11 no devuelve huecos ni comprueba la integridad de la plantilla.**
  Los huecos de 1.10a llegan al intentar publicar, en un **422 ProblemDetails con
  `gaps: [{ day, weekNumber, weekday, taskCode }]`**. El backend rechaza antes de
  cambiar versión o estado. El cliente conserva esas extensiones, lista todos los
  huecos válidos (incluidas varias clases por día) y deshabilita nuevos intentos.
  «Revisar plantilla» abre el editor existente; volver a Publicar consulta impacto
  nuevo y permite validar la corrección contra el backend.
- Por ese límite, la UI indica que las comprobaciones se ejecutarán al publicar;
  no muestra checks verdes anticipados ni deduce huecos clínicos desde el editor
  de podcasts. Bloquear el primer intento desde una lista de huecos requeriría
  extender el contrato de vista previa o añadir una consulta de validación.
- No se añaden el total de pacientes, la categoría «sin cambios» ni un detalle por
  paciente del mockup: esos datos no están en el contrato.
- Los errores transitorios conservan el impacto y permiten reintento explícito.
  El modal tiene cuerpo desplazable y acciones visibles en 320 px; textos ES/EN,
  números según idioma y navegación por teclado.

## Verificación reproducible

```powershell
corepack yarn lint
corepack yarn build
corepack yarn i18n:check
node --test features/program/services/program-sequence.test.mjs
$env:E2E_BASE_URL='http://localhost:3042'
corepack yarn e2e program-template-impact.spec.ts program-sequence.spec.ts --project=chromium-desktop --output=qa-reports/1.22-playwright --reporter=list
```

La URL debe apuntar a un servidor iniciado en segundo plano y verificado por HTTP.
Los e2e usan respuestas HTTP sintéticas fieles al backend commiteado: no publican
plantillas reales ni prueban la política de alcance en la base de datos.
Los siete casos nuevos cubren carga, conteos y ceros, cancelación/reapertura,
422 con tres clases, fallo/reintento, permisos, doble envío, cierre durante escritura,
inglés, 320 px y teclado/foco. Los cinco del editor 1.21 cubren la regresión afectada.
La revisión visual con Playwright MCP confirma escritorio y móvil.

## Claves nuevas ES / EN

Se reutilizan las claves existentes de acciones, permisos, tareas, días y «Publicando...».
Las 16 claves añadidas son:

| ES | EN |
| --- | --- |
| Publicar la versión {version} | Publish version {version} |
| Publicar versión {version} | Publish version {version} |
| Cargando impacto de publicación… | Loading publication impact… |
| No se pudo cargar el impacto. Reintenta antes de publicar. | Unable to load the impact. Try again before publishing. |
| A quién llega | Who receives the changes |
| Recibirán los cambios desde su próxima semana | Will receive changes from their next week |
| Conservan sus personalizaciones futuras | Keep their future customizations |
| {count} semanas ya iniciadas no se tocan. | {count} weeks that have already started remain unchanged. |
| Solo cambian los elementos del programa. Lo personalizado se conserva. | Only program items change. Customizations are preserved. |
| El impacto respeta tu alcance de pacientes. Los conteos pueden incluir a la misma persona. | The impact respects your patient scope. Counts may include the same person. |
| Comprobaciones de la plantilla | Template checks |
| Completa estos días antes de publicar. | Complete these days before publishing. |
| Día {day} · Semana {week} | Day {day} · Week {week} |
| Al publicar se comprobará el contenido de los 83 días: podcast, rutina y plan nutricional. | Publishing will check the content of all 83 days: podcast, routine and nutrition plan. |
| No se pudo publicar. Reintenta o vuelve a revisar la plantilla. | Unable to publish. Try again or review the template. |
| Revisar plantilla | Review template |
