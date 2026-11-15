# 3.20 — recorrido real APP → ERP → APP

Base del ERP: `39a86c5`. La configuración dedicada
`playwright.nutrition-real.config.ts` no arranca servidores ni intercepta APIs.
Los procesos compartidos pertenecen exclusivamente al orquestador; no se
arrancan, reinician ni detienen desde estas pruebas.

**Primera ejecución, 15-11-2026: 3.20 incompleta.** Preflight real 1/1 correcto;
recorrido completo 0/1, detenido en análisis HTTP500 por conexión rechazada al
proveedor 8010. No se registró comida ni se publicó el cierre. Storage privado,
cuatro identidades y lectura APP anterior a publicar sí se comprobaron.
Resultados sanitizados: [evidence/3.20-first-real-run.json](evidence/3.20-first-real-run.json).
El resto del guion necesita ejecutarse cuando el orquestador habilite 8010.

## Preparación y secretos

- ERP de este checkout y APP F3 de producto, con sus proxies al gateway local.
- Auth, API, PostgreSQL y Valkey reales. Foto IA requiere además el proveedor
  configurado en el backend; en `eb181a8` es Food AI `8010`, no AI `8000`.
- Storage efectivo con lectura y escritura privada. La capacidad firmada debe
  devolver y permitir decodificar la imagen real, sin sustituirla en la red.
- Fixture QA aislada: paciente con inscripción activa y sin almuerzo hoy,
  nutricionista asignado, coordinación asignada sin PhotosView y nutricionista
  ajeno con permisos de nutrición. El ciclo a revisar terminó antes de hoy,
  sigue en continuidad, no está publicado su cierre y tiene preparado n+1.
  Una publicación anterior permite comprobar el historial tras publicar.

`E2E_320_FIXTURE` apunta a JSON **sin secretos**. Campos: `patientId`, `cycleId`,
`sourcePrescriptionId`, `nextPrescriptionId`, `localDate` y `accounts` con
`patient`, `nutritionist`, `coordinator`, `foreignNutritionist`. Cada cuenta
indica `login` y `credentialTarget`; el paciente añade `documentNumber`.
Credential Manager de Windows conserva las contraseñas bajo
`CoppAddresd/QA/3.20/<run>/<rol>`. El helper las lee exclusivamente en memoria.
No exportar sesiones, tokens ni capacidades de Storage a logs, HAR o trazas.
La configuración desactiva trace y vídeo incluso ante fallo.

El consentimiento sigue la configuración vigente del producto y sus rutas
reales. La prueba no inventa textos, aceptaciones ni políticas y no cambia
flags para eludir un fallo. `available=false` por sí solo no demuestra que
esté activo el enforcement; debe comprobarse la configuración efectiva.

## Ejecución

```powershell
$env:E2E_320_FIXTURE='<ruta absoluta a metadata sin secretos>'
$env:E2E_BASE_URL='http://localhost:3056'
$env:E2E_APP_BASE_URL='http://127.0.0.1:5182'
corepack yarn e2e --config playwright.nutrition-real.config.ts --grep preflight
corepack yarn e2e --config playwright.nutrition-real.config.ts --grep 'Foto IA corregida'
```

El primer caso verifica identidades, permisos y alcance contra Auth/API reales.
El segundo usa login UI en ambas interfaces, selecciona un JPEG de alimento,
analiza, corrige, guarda y comprueba la referencia del análisis en el payload.
Después comprueba foto/corrección en ERP, ocultación a coordinación y 404 ajeno,
prepara n+1 y publica mensaje ES/EN con una imagen visible y otra privada.
La APP debe leer la nueva publicación, decodificar la imagen y mostrar el
anterior en historial. El cambio de idioma se hace mediante la UI de Inicio.
El JPEG por defecto es `food-ai-service/tests/assets/pizza.jpg`; se puede
seleccionar otro con `E2E_320_IMAGE`.

Es una prueba con escrituras clínicas **solo QA**: ejecutar el recorrido
completo una vez por fixture. Si falla después de registrar o publicar, consultar
primero BD/estado real y preparar una fixture nueva cuando corresponda; no
repetir indiscriminadamente una publicación. El preflight es de lectura salvo
el login y puede repetirse. Los datos QA de rondas previas quedan intactos.

## Playwright MCP y evidencia

`scripts/qa/nutrition-real-open.mjs <metadata> [puerto CDP]` abre un navegador
local, inicia sesión por UI y deja Nutrición disponible para inspección MCP.
Lanzarlo en background, con ventana oculta y PID registrado. MCP puede conectar
con `browserType().connectOverCDP('http://127.0.0.1:9236')`; no se transmiten
contraseñas ni tokens en argumentos de herramientas. Las capturas se toman
después del login. Cerrar el navegador, recoger sus hijos y comprobar que no
queda su listener. Solo detener PIDs propios verificados por ruta y argumentos.

La prueba guarda `preflight.json` y `evidence.json` sanitizados, con métodos,
rutas sin query, estados, etapas y conteos de consola. No guarda cabeceras de
autorización ni cuerpos de auth. `complete:false` es un recorrido inconcluso,
aunque otras comprobaciones hayan pasado. Una firma real, una fila en BD o
una lectura anterior no sustituyen la aceptación bidireccional completa.

Los avisos de Community/Telemedicine no disponibles en el stack mínimo se
registran aparte de errores del recorrido nutricional. La prueba web no
acredita cámara física, iOS ni entrega de notificaciones push.
