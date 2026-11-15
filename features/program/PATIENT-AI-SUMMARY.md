# Perfil 360: resumen estimado por IA (4.7)

Sustituye el bloque «Próximamente» de Resumen por el borrador real del contrato
BACK 4.4b (`3b6e09e`, `docs/modules/program-progress/PATIENT-SUMMARY.md`).
No inventa predicciones ni publica contenido o planes.

## Lectura y generación

- `GET /api/v1/program/erp/patients/{patientId}/ai-summary?language=es|en`
  consulta el último borrador del idioma; abrir la vista nunca genera uno.
- Solo `Program.Profile360View` + `Program.AiView` habilitan la consulta.
  `Program.AiManage` añade el botón explícito para POST `{ "language": "es" }`
  o `{ "language": "en" }`. El botón queda deshabilitado mientras se genera.
- El bloque muestra «Estimado por IA», borrador para revisión profesional,
  período de fuentes, fecha original UTC y modelo cuando está disponible.
- `empty`, `insufficient` y `unavailable` no producen una tarjeta de contenido.
  Un usuario autorizado a generar conserva la acción explícita. Un error de
  lectura ofrece reintentar GET antes de permitir POST.
- Un POST fallido conserva el borrador anterior con su fecha original e indica
  el fallo. Un 401/403/404 oculta tanto contenido como controles de IA.
- Cada petición usa `no-store`. El estado se liga a usuario, clínica, paciente,
  idioma y permiso de generación; se aborta al cambiar ese contexto o desmontar.
  No hay tokens ni borradores persistidos en el navegador.

## Texto y fuentes

El DTO se valida antes de renderizar. La respuesta se muestra como texto plano,
sin HTML, Markdown ni enlaces proporcionados por el modelo. Solo una referencia
conocida en `sources` se convierte en control local.

Cada fuente autorizada abre una pestaña del mismo paciente y mueve allí el foco:
nutrición → Nutrición; tests, mediciones y alertas → Seguimiento; programa,
ejercicio y podcasts → Plan semanal. Se muestra la sección y el intervalo de
la fuente como contexto de consulta; este aviso no aplica un filtro nuevo a los
datos existentes. Sin permiso de la sección, la referencia es texto.

La sección tiene un límite de errores propio para conservar el resto del perfil.
La ruta antigua de overview también recibe el bloque, sin controles de navegación
entre pestañas. Los textos nuevos existen en ambos diccionarios ES/EN.

## QA reproducible

Con un ERP propio en 3056 y el sustituto Postman local en 4537:

```powershell
postman simulation run postman/simulations/patient-summary-erp.sim.yaml --port 4537 --output ndjson --no-history
corepack yarn exec playwright test --config playwright.patient-summary.config.ts
corepack yarn lint
corepack yarn exec tsc --noEmit
corepack yarn i18n:check
corepack yarn build
```

El sustituto usa exclusivamente datos sintéticos del contrato inspeccionado,
estado aislado por sesión/paciente/idioma y ninguna conexión al stack real.
Los 25 casos verifican lectura sin POST, permisos, ausencia de contenido,
contrato inválido, generación explícita, persistencia, fallo sin cambiar fecha,
texto hostil, cambio de idioma y seis tamaños/idiomas. No prueban Auth, BD o LLM.

`scripts/qa/patient-summary-real-open.mjs <metadata> [role] [puerto-CDP]`
abre un navegador propio con login real. Lee la contraseña solo de Windows
Credential Manager y nunca genera automáticamente. Solo registra estados y
metadatos, sin texto clínico, credenciales ni tokens. La generación real se
ejecuta mediante el botón en una cuenta fixture autorizada. No se cambia el
stack compartido ni se publican planes.

Evidencia versionada en `features/program/evidence/4.7-*.json`; capturas MCP y
acta de revisión en `openspec/changes/organizar-experiencia-bienestar/revision-4.7-front/`
del repositorio de coordinación. Los resultados simulados y reales se distinguen.
