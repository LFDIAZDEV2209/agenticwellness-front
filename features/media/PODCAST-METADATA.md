# Sugerencias editoriales para podcasts (4.9)

En `/media/new`, la ayuda de IA está disponible al crear un podcast para quien
tiene **Media.Create y Program.AiManage** en el contexto activo. No depende de
Media.Publish. Reutiliza el formulario de 1.18 y el contrato ERP 4.6b de BACK
`4c7a811` (`docs/modules/media/PODCAST-METADATA.md`). La carga múltiple y los
editores de medios existentes conservan su flujo.

El operador escribe el título y, opcionalmente, contexto editorial. Solicitar
ayuda envía exclusivamente `{title, language, context}` a
`POST /api/v1/media/podcast-metadata` mediante el cliente autenticado existente.
El audio, nombre del archivo, storage, autor y datos de pacientes no viajan a la IA.
Título: 1–200 caracteres; contexto: hasta 16000; texto sin HTML ni URLs.

La respuesta se muestra como **Estimado por IA**, con modelo si existe y fecha
del servicio formateada según el idioma. Se valida la respuesta antes de ofrecerla:
descripción no vacía de hasta 2000 caracteres, categoría estable del catálogo,
hasta 32 etiquetas de hasta 64 caracteres, estimación explícita y fecha UTC.
No se inventa un modelo cuando viene `null`.

**Usar sugerencias** reemplaza descripción, categoría y etiquetas del formulario;
el texto de revisión avisa de ese reemplazo antes del clic. El foco pasa a la
descripción y los tres campos siguen editables. **Descartar** conserva los valores
manuales. Ninguna de estas acciones guarda ni publica. Guardar continúa usando
upload-intent, PUT del archivo y creación existentes, con el estado elegido por
el operador. No se altera automáticamente el estado de publicación.

Cambiar contenido, archivo, contexto editorial, idioma, usuario, clínica o
capacidades invalida el intento anterior. Se cancela la petición en vuelo al
cambiar o salir; deshacer una edición tampoco revive un borrador ni un loading
cancelado. El bloqueo inmediato por referencia impide doble solicitud. Un fallo
de IA conserva los campos y ofrece reintento o edición manual. No se muestra la
ayuda para video/imagen ni en los editores de recursos existentes.

## Verificación del 15-11-2026

- Lint, build Next.js 16.3, TypeScript e i18n sin errores; claves ES/EN en paridad.
- **37/37 E2E**, incluidos 19 nuevos de 4.9 y 18 de regresión de biblioteca,
  edición y carga múltiple. HTTP editorial contra Postman; auth, storage y
  guardado sintéticos, sin escrituras al stack. Se corrigió una aserción anterior
  de carga múltiple para esperar la respuesta HTTP antes de contar actualizaciones.
- Playwright MCP: revisión de escritorio y móvil 320/390/1440, tema claro/oscuro,
  teclado y foco al aceptar; sin desbordamiento ni errores JS. Detector Impeccable
  sin incidencias en los componentes cambiados.
- Chrome DevTools MCP contra el formulario real: ayuda visible, consola sin
  avisos/errores y restauración de sesión/contexto HTTP 200.
- **Runtime real, sin interceptar APIs:** login UI y generación ES/EN 200/ok;
  modelo y fecha reales. No se aceptó/guardó/publicó contenido en esta prueba.
  Catálogo completo (55 medios, página de 100) con el mismo hash antes/después y
  cero peticiones de escritura del catálogo. Evidencia sanitizada:
  [4.9-live.json](evidence/4.9-live.json). Esto no certifica cada frase generada ni
  reemplaza la revisión editorial. El guardado tras editar se verificó con HTTP
  sintético, preservando la biblioteca real.

La simulación propia vive en `postman/mocks/podcast-metadata-erp` y
`postman/simulations/podcast-metadata-erp.sim.yaml`. Se construyó del contrato
local; CLI 1.76.0 no reconoce `postman status`, por lo que no se buscó un mock
cloud ni se inicializó/publicó un workspace.

Con el frontend propio y la simulación **ya iniciados** en background:

```powershell
$env:E2E_BASE_URL='http://localhost:3066'
$env:E2E_PODCAST_SIM_URL='http://127.0.0.1:4541'
corepack yarn e2e --config=playwright.podcast-metadata.config.ts
```

La configuración no arranca servicios. La simulación se lanza con
`postman simulation run postman/simulations/podcast-metadata-erp.sim.yaml --port 4541 --output ndjson --no-history`.
Sus logs y las capturas están en `qa-reports/podcast-metadata` (ignorados en Git).
Solo el orquestador gestiona el stack compartido; esta entrega no lo reinicia.
