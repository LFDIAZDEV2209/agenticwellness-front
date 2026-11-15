# Plan semanal: sugerencias aplicables (4.8)

Consume el contrato ERP 4.5b (`7810eb7`, incluido en BACK `4c7a811`) dentro de la
agenda de Plan semanal. Conserva la edición manual de 2.18. No usa el servicio
de IA directamente ni aplica cambios al abrir, consultar o generar.

## Contrato y acciones

Base: `/api/v1/program/erp/enrollments/{enrollmentId}/weeks/{weekNumber}/ai-suggestions`.

- GET `?language=es|en`: último borrador, con estados por sugerencia y `stale`.
  Requiere Profile360View y AiView.
- POST base `{ "language": "es" }` o `en`: generación explícita; añade AiManage
  y Program.Edit. Conserva modelo nullable, fecha UTC y período del proveedor.
- POST `/{briefId}/suggestions/{index}/apply`, cuerpo exacto `{ "confirmed": true }`:
  confirma una sugerencia. Nunca envía IDs de recursos elegidos por el navegador.
  Acepta `applied` y `already_applied`, usa la semana devuelta y vuelve a consultar
  el borrador para mostrar aplicaciones parciales.

El lector ve las alternativas y su procedencia sin controles de generación o
aplicación. El profesional autorizado revisa fecha, celda actual, alternativa,
motivo y fuentes. La confirmación tiene una acción individual; Cancelar/Escape
no envían POST. El foco empieza en Cancelar y regresa al botón de revisión.

Solo una semana futura editable permite generar/aplicar. Se respeta el
interruptor de descanso. El servidor sigue siendo autoridad sobre la versión,
fecha, inscripción, seguridad, recursos, consentimiento, permisos y asignación.
Aplicar personaliza la celda mediante el editor existente y deja su evento en
la bitácora transaccional. Las ediciones posteriores se hacen en el editor manual;
no se inventa una operación de deshacer que el contrato no ofrece.

## Fallos, privacidad y concurrencia

`empty`, `insufficient` y `unavailable` no producen una tarjeta ficticia. La
agenda manual sigue disponible. Una generación fallida conserva el borrador
anterior y su fecha. Un 401/403/404 oculta contenido y acciones de IA.

Un 409, un 422 o un resultado incierto deshabilitan aplicar hasta volver a
consultar. Esa acción recarga tanto semana como borrador: si se perdió la
respuesta después de guardar, recupera la celda y su marca aplicada sin repetir
el POST. No hay reintentos automáticos ante errores de aplicación.

Las operaciones de IA bloquean temporalmente edición/copia/cierre de la agenda
para evitar dos escrituras desde la misma vista. Un cambio manual vuelve a
consultar `stale`. El estado se liga a usuario, clínica, inscripción, semana,
idioma y permisos; se aborta al cambiar contexto o desmontar. Las peticiones
usan `no-store`; no se persisten tokens ni borradores en el navegador.

Los DTO se validan antes de renderizar. Label y reason son texto plano: nunca
HTML, Markdown o enlaces externos del modelo. Las referencias conocidas llevan
a descriptores locales de fuente con sección e intervalo de hechos recientes,
distinto del intervalo de la semana futura. Una frontera de errores conserva el
editor ante un fallo del bloque opcional. Todo texto nuevo tiene clave ES/EN.

## QA reproducible

Procesos propios en background, sin autoarranque del stack compartido:

```powershell
postman simulation run postman/simulations/weekly-suggestions-erp.sim.yaml --port 4539 --output ndjson --no-history
corepack yarn exec playwright test --config playwright.weekly-ai.config.ts
corepack yarn lint
corepack yarn exec tsc --noEmit
corepack yarn i18n:check
corepack yarn build
```

35 casos: 29 de 4.8 y seis regresiones de 2.18. Usan el sustituto ERP Postman
con datos sintéticos y estado aislado por sesión/idioma. Incluyen confirmación,
cancelación, una celda sin alterar XP/otras tareas, permisos, estados vacíos,
fecha, 409/422/500, respuesta perdida tras escritura, texto hostil y ES/EN a
320/390/1440. La simulación no demuestra Auth, BD, locks ni el proveedor LLM.

Puente MCP con la misma fixture, compilada en un directorio ignorado por lint:

```powershell
corepack yarn exec tsc --noCheck --module commonjs --target es2022 --moduleResolution node --rootDir . --outDir .next/qa48-fixtures e2e/fixtures/weekly-ai-http.ts
node scripts/qa/weekly-ai-sim-open.mjs <ruta-absoluta>/.next/qa48-fixtures/e2e/fixtures/weekly-ai-http.js 9241
```

QA real: `node scripts/qa/weekly-ai-real-open.mjs <metadata> <role> <week> <CDP-port>`.
Lee Credential Manager solo en memoria y no genera ni aplica automáticamente.
La interacción MCP usa la UI real y guarda solo estados/metadatos, sin tokens,
contraseñas, motivos clínicos ni trazas con credenciales. Solo se modifica la
fixture autorizada; no se publica ni se cambia el stack.

Evidencia en `features/program/evidence/4.8-*.json` y capturas/acta en
`openspec/changes/organizar-experiencia-bienestar/revision-4.8-front/` del repositorio
de coordinación. Los resultados simulados y reales se distinguen.
