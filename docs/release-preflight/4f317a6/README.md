# Evidencia versionada del preflight 4f317a6

**SHA probado:** `4f317a622c52907a24bc50d3ab7f14481772841d`.
Rama `org/f3-coppaddresd-front`. Padres:
`c1a23e51f4e02730d02d028c13e5be936ff49aec` y
`2f3471cc71cde40130e153057f20b5c21d187d3b` (origin/dev obtenido con fetch).
Ancestro común: `fa474fc61ce0c64ef4ebcd5c3bc1fc3ba77073b1`.
Este commit agrega evidencia; no cambia el código del merge probado.

## Merge y conflictos

Comandos de integración:

```powershell
git fetch origin
git merge --no-ff --no-commit origin/dev
git add providers/translations/es.json providers/translations/en.json
git commit -m "Merge origin/dev into org/f3-coppaddresd-front for release preflight"
```

Solo hubo conflictos de contenido en `providers/translations/es.json` y `en.json`.
Se comparó cada clave contra el ancestro común y se conservaron los cambios de
ambas ramas. **No hubo colisiones de valores por clave.** Resultado: 6.004 claves
en cada idioma, paridad completa y ninguna traducción cambiada de ambos carriles
perdida. [Resolución cuantificada](dictionary-resolution.json), [paridad](parity.json).

Pacientes, bienestar, 4.11 y el host QA 2.22 son idénticos por hash a c1a23e5.
`features/agents` es idéntico a origin/dev. Se preservan 2.21/2.22/4.11 y los tres
commits entrantes de agentes (routing/configuración, upload/KB y cuentas vinculadas).
[Hashes](clinical-hashes.json), [verificación del árbol](preservation.json).
No rebase, push ni edición de tasks.md.

## Resultado exacto

[results.json](results.json) registra comandos, exit codes, estadísticas y límites.
Typecheck, lint, build y las pruebas unitarias se volvieron a ejecutar al preparar
esta evidencia. Las suites UI/HTTP conservan sus reportes finales originales sobre
el mismo SHA; no se repitieron después, porque el código no cambió.

| Gate y comando | Resultado final | Evidencia |
| --- | --- | --- |
| `corepack yarn exec tsc --noEmit` | **Exit 0**; sin salida | [typecheck.txt](typecheck.txt) |
| `corepack yarn lint` | **Exit 0**; sin salida | [lint.txt](lint.txt) |
| `corepack yarn build` | **Exit 0**; compilación, TypeScript y generación de 91 páginas correctas | [build.txt](build.txt) |
| `corepack yarn i18n:check` | **Exit 0**, 0 faltantes, ES/EN 6004/6004 | [i18n.txt](i18n.txt) |
| `corepack yarn config:test` | **4/4 unit node:test**, 0 fallos/omitidas, exit 0 | [config-unit-4.txt](config-unit-4.txt) |
| Unit puras en Playwright: adaptador de uso + roundtrip agentes | **29/29**, 0 fallos/omitidas/flaky, exit 0; revalidación 1,474 s | [reporte](playwright-unit-29.json), [log](unit-29.txt) |
| Suite ampliada Playwright | **195/195**, 0 fallos/omitidas/flaky, exit 0; 176,814 s | [reporte](playwright-195.json), [log](e2e-195.txt) |
| Integración 2.22 controlador/API/BD/UI | **3/3**, 0 fallos/omitidas/flaky, exit 0; 5,473 s | [reporte](playwright-usage-3.json), [log](usage-3.txt) |
| 4.11 API/BD, UI APP/ERP y caída IA | **6/6**, 0 fallos/omitidas/flaky, exit 0; 44,257 s; con transporte QA descrito abajo | [reporte](playwright-phase4-6.json), [log](phase4-final-passed.txt) |

**Sin doble conteo:** las 29 unit Playwright ya forman parte de las 195. El
desglose es **33 unit únicas** (4 node:test + 21 adaptador + 8 roundtrip) y
**175 casos UI/HTTP/integración** (166 de la suite ampliada + 3 de uso + 6 de 4.11):
**208 casos únicos**. La reejecución de las 29 unit no agrega casos nuevos.

La suite ampliada abarca 18 archivos; [test-files.json](test-files.json) contiene
el conteo exacto por archivo. Cubre 2.21, 2.22, Fase1, rutinas/demostraciones,
4.7/4.8/4.9, medios y todos los tests entrantes de agentes de dev. No se afirma
haber ejecutado todas las suites del repositorio ni seeds/migraciones de otros módulos.

## Comandos de pruebas y configuración

Las configuraciones temporales exactas quedan versionadas como texto:
[suite ampliada](playwright.release.config.txt) y [unit](unit-recheck.config.txt).
Se ejecutaron con los procesos QA locales ya iniciados; no contienen webServer.

```powershell
# Node unit: el script config:test ejecuta este comando
node --test scripts/check-service-urls.test.mjs

# Unit Playwright, configurado únicamente con los dos archivos de pruebas puras
corepack yarn exec playwright test --config qa-reports/release-preflight/unit-recheck.config.ts

# Suite ampliada contra preview de producción del merge en 3067
corepack yarn exec playwright test --config qa-reports/release-preflight/playwright.release.config.ts

# Host QA de uso previamente iniciado; COP_222_PRIVATE_CONFIG apunta a su metadata temporal
corepack yarn exec playwright test --config playwright.routine-usage-real.config.ts --reporter=list,json

# 4.11 final: preload QA del navegador y proxy APP directo a los servicios locales
$env:NODE_OPTIONS = '--import=file:///C:/Users/Luis/Documents/CoppAddresd/Repos/.tmp/release-playwright-relay.mjs'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa/program-phase4-real.ps1 `
  -EvidenceDirectory C:/Users/Luis/Documents/CoppAddresd/Repos/openspec/changes/organizar-experiencia-bienestar/revision-release-front/phase4-relay `
  -AppUrl http://127.0.0.1:5182 -ErpUrl http://localhost:3067
```

Para reproducir, guardar los textos de configuración en las rutas temporales del
comando. Los servicios necesarios son las cinco simulaciones Postman del repo
(4537/4539/4541/4554/4556), preview FRONT3067 y host de uso5196; 4.11 además usa
preview APP5182 y sus proveedores transitorios4552/4553. Iniciarlos en background
solo en puertos libres, cerrar exclusivamente PIDs propios y no resetear fixtures.
El host de uso y la metadata privada se reproducen según
[ROUTINE-EDIT-IMPACT.md](../../../features/wellness/ROUTINE-EDIT-IMPACT.md).
La metadata JWT temporal no se versiona ni se imprime.

## Fallos previos, corrección y límites del resultado verde

Los intentos fallidos no se esconden ni se suman al resultado final:

| Intento | Resultado | Causa y ajuste |
| --- | --- | --- |
| 4.11 con gateway local original | 3 aprobadas, 1 fallida, 2 sin ejecutar | APP login401. Se ajustó el proxy del preview APP para usar Auth5123/API5122. [Log](phase4-first-failed.txt) |
| APP proxy directo y ERP producción3067→Gateway5080 | 4 aprobadas, 1 fallida, 1 sin ejecutar | CORS bloquea login ERP. Se aplicó relay HTTP solo en el navegador de pruebas y se repitió la suite completa. [Log](phase4-second-failed.txt) |
| Reejecución final 4.11 | **6 aprobadas**, 0 fallos/omitidas | Login/servicios reales mediante el transporte QA explícito. [Log](phase4-final-passed.txt) |

[playwright-relay.txt](playwright-relay.txt) y
[app-preview-config.txt](app-preview-config.txt) contienen ese transporte exacto.
El relay se limita a localhost5080/api y los orígenes QA declarados, envía las
peticiones a Auth5123/API5122 y conserva cuerpos/estados de sus respuestas.
**El resultado final verde valida el código FRONT con ese transporte; no certifica
el CORS/routing nativo del Gateway5080 ni constituye aprobación de la infraestructura
de release.** Ese recorrido nativo sigue sin quedar verificado. No se corrigió el
gateway compartido ni se cambió producto para ocultar el fallo.

El guion 4.11 conserva sus sustitutos declarados de envelopes IA unavailable y
borrador vigente para probar cancelación de una sugerencia stale. El caso de
caída HTTP503 de clientes/handlers reales permanece separado. La fixture 9/9 se
relee con su submit UI anterior registrado; no se presenta como una nueva transición
8→9. [Resumen UI](phase4-summary.json).

2.22 usa controlador/guard/store/resolver/EF reales del BACK9b901d7 sobre PostgreSQL
READ ONLY y JWT/contexto QA sintéticos: no es login Auth de producción ni despliegue
de ese endpoint en5122. APP tuvo merges concurrentes durante QA; se registra
[su provenancia](app-provenance.json) y no se certifica un SHA puro de release APP.

## Auditoría de cierre

Esta revisión detectó siete procesos QA propios que no se habían detenido por un
array JSON anidado en el cierre anterior. Se corrigió el cierre verificando PID,
comando y descendencia; [closure-audit.json](closure-audit.json) registra los
procesos finalmente detenidos. Los puertos QA se comprobaron libres y el stack
compartido API40556/Auth20808/Gateway35056 se conservó. Esto corrige la afirmación
de cierre completa del informe previo.

No se alteraron datos de negocio ni fixtures al versionar esta evidencia. Los
gates base y unit volvieron a pasar; no hubo cambios de código posteriores al merge.
Sin push ni cambios a tasks.md. [manifest.json](manifest.json) permite comprobar
la integridad de los artefactos de este directorio. Se normalizaron a UTF-8 sin
BOM, LF y sin espacios finales; no se alteraron comandos, resultados ni estados.
El .gitattributes local conserva LF al hacer checkout para que los hashes sean
reproducibles en Windows.
