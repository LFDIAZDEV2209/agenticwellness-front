# Recorrido 4.11 — API/BD y UI premium

Contrato: BACK `docs/modules/program-progress/QA-4.11.md`, SHA e0a9c29.
Los tres casos API/BD usan `.ai/operations/organizar-experiencia-bienestar/4.11-back-fixture.json`;
los de UI usan además `4.11-ui-app-fixture.json` y el runner versionado en
`.worktrees/app-f3/scripts/qa/program-assignment/ui.mjs`. Credenciales solo Windows Vault.
No cambia esas metadata, no ejecuta prepare ni consume la fixture APP aparcada.
No crea/reinicia servicios de producto. Python necesita psycopg y los helpers BACK; .NET10 y
Postman CLI deben estar disponibles. El checkout `COP_F4_SOURCE` debe coincidir
exactamente con el SHA de la fixture. La conexión DB y los appsettings locales
se leen solo en memoria del entorno configurado.

Desde este worktree, con API5122/Auth5123 ya disponibles:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa/program-phase4-real.ps1 -AppUrl http://127.0.0.1:5182 -ErpUrl http://127.0.0.1:3071
```

APP/ERP deben estar ya disponibles; el runner los verifica sin iniciarlos. Inicia **solo** dos simulaciones Postman propias4552/4553, comprueba
`listening`, ejecuta Playwright y cierra sus PIDs/descendientes verificados. Falla
si encuentra esos puertos ocupados. Evidencia nueva bajo `revision-4.11/<UTC>/`;
`-EvidenceDirectory`, `-WorkspaceRoot` y `-BackendSource` permiten elegir rutas.
Las simulaciones reutilizan los contratos BACK sin publicarlos ni crear mocks cloud.
No se registran passwords, JWT, cookies, cuerpos clínicos o URLs firmadas.

Para ejecutar únicamente la suite si esos proveedores propios ya están arriba:

```powershell
corepack yarn exec playwright test --config playwright.program-phase4-real.config.ts
```

| Caso | Prueba que se ejecuta |
| --- | --- |
| Paciente termina tests | El fixture ya está en9/9 por la preparación BACK. Comprueba la batería real y reenvía el último submit con su clave original: mismo resultado, una inscripción/propuesta, plan publicado de30días y propuesta de rutina/secuencia7podcasts. No representa una transición nueva8→9. |
| Sin acción profesional | Dos GET de las cinco alternativas sintéticas existentes. Ningún POST generar/apply; todos los estados draft, actor/fecha nulos, semana/XP/snapshots iguales y cero auditoría ai_application. |
| IA caída | Clientes HTTP y handlers/guard/stores EF F4 reales contra Postman503; conexión DB READ ONLY. Ambos devuelven unavailable sin draft; no cambia ninguna fila de negocio observada. Luego las lecturas reales de nutrición/programa/sugerencias siguen funcionando. No ejecuta controllers con fallo inyectado ni apaga AI compartida. |

La nutrición publicada tiene un workflow independiente. La inscripción queda
**PendingAssignment/semana0**, con12semanasLocked; no se inventa activación inmediata.
La propuesta conserva5referenciasdemo: el bloqueo1.14 por audios sigue vigente;
el test no acredita que los blobs existan ni que toda la secuencia sea reproducible.
Semana2del compañero es22–28/11/2026: revalidar antes22-nov00:00Bogotá. Después debe
prepararse otra fixture autorizada; el guion nunca corre fechas ni resetea datos.

Los tres casos UI están implementados y se ejecutan en la misma suite, sin `fixme`:

1. APP: formulario 8→9 con fixture UI independiente, resultados, propuesta única,
   plan publicado de 30 días y espera clínica; lecturas ES/EN × 320/390/1440. La
   ejecución inicial conserva un registro `.ui-submit.json`. Si ya está 9/9, la
   suite exige ese registro y declara relectura; nunca resetea ni finge otro alta.
2. ERP: lectura real del borrador sin aplicación y comparación de semana/XP/APP.
   El histórico está `stale` y permanece bloqueado. La cancelación con foco/Escape
   se comprueba en un subcaso con **solo el GET IA sintético vigente**, identificado
   en el reporte; después se retira y se relee la respuesta real.
3. Degradación visual: solo envelopes IA `unavailable` en el navegador ERP propio;
   conserva agenda y controles, retira interceptores y relee. APP conserva Programa,
   Nutrición, Perfil y evaluaciones. No sustituye el proveedor503 de los handlers.

Para una transición nueva preparar otra metadata UI y pasar `-UiMetadata`; el
runner no prepara ni resetea. La propuesta nueva actual tiene90celdas de podcast,
13medios publicados sin demo/clave vacía; no se fija a las7celdas históricas ni se
acredita audio descargable. Doce semanas Locked no equivalen a programa activo.

Los sentinelas BACK/3.20/R7/APP aparcada y los hashes de ambas identidades BACK
permanecen iguales. El rol generador tiene403 auxiliares en biometría/catálogos:
se acredita disponibilidad de controles, no un guardado manual con ese rol. No se
afirma consola global vacía. Detalle y límites en
`.worktrees/app-f3/docs/integracion/4.11-ui-redisenada.md`; evidencia final en
`openspec/changes/organizar-experiencia-bienestar/revision-4.11/final-premium/`.
