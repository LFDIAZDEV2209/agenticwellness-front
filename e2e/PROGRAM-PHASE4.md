# Recorrido 4.11 — API/BD listo, UI pendiente

Contrato: BACK `docs/modules/program-progress/QA-4.11.md`, SHA e0a9c29.
Usa exclusivamente `.ai/operations/organizar-experiencia-bienestar/4.11-back-fixture.json`
del workspace compartido y sus credenciales Windows Vault. No cambia esa metadata,
no ejecuta prepare, no consume la fixture APP aparcada y no crea/reinicia servicios
de producto. Python necesita psycopg y los helpers BACK existentes; .NET10 y
Postman CLI deben estar disponibles. El checkout `COP_F4_SOURCE` debe coincidir
exactamente con el SHA de la fixture. La conexión DB y los appsettings locales
se leen solo en memoria del entorno configurado.

Desde este worktree, con API5122/Auth5123 ya disponibles:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/qa/program-phase4-real.ps1
```

El runner inicia **solo** dos simulaciones Postman propias4552/4553, comprueba
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

Tres casos `test.fixme` permanecen visibles en el reporte y **no cuentan como QA UI**:

1. APP: completar la batería en una fixture nueva8/9 mediante formularios y verificar
   plan nutricional y espera clínica, con selectores/transiciones del rediseño final.
2. ERP: abrir/reabrir/cancelar el detalle de una sugerencia, probar teclado/foco y
   observar cero POSTapply, sin cambiar contenido niXP.
3. Degradación visual: interceptar solo los envelopes IA del navegador QA propio,
   conservar APP/Perfil360/editor manual navegables; retirar interceptores y releer.
   Ese ensayo visual no sustituye la prueba del proveedor503 atravesando handlers.

Los sentinelas históricos BACK y los hashes actuales de ambas identidades deben
permanecer iguales. Los reportes guardan hashes/conteos, no respuestas de tests ni
texto clínico. No se declara4.11cerrada mientras estos tres casosUI sigan pendientes.
