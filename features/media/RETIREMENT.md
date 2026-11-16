# Retiro y sustitución de medios — 1.23

Verificado el 16 de noviembre de 2026 con front 3000 → gateway 5080 → API 5122,
Auth 5123 y PostgreSQL local. El test `e2e/media-retirement-real.spec.ts` no
intercepta HTTP. Reutiliza claves existentes de la biblioteca en metadata QA
aislada; no crea objetos ni modifica los registros de origen de la biblioteca.

El escenario tiene dos pacientes, una plantilla activa y otra borrador,
semanas iniciadas y una semana futura con elementos `program` e `individual`.
El impacto `2 pacientes / 1 plantilla` coincide en API directa, gateway y UI.

1. DELETE sin sustituto devuelve 409 `MEDIA_REPLACEMENT_REQUIRED`. La BD queda
   idéntica. La UI muestra el impacto y mantiene la confirmación deshabilitada.
2. La API rechaza con 422 el mismo medio, un borrador y un tipo incompatible.
   El selector del destino programa solo ofrece otro Podcast Published; excluye
   el original, el Video y el borrador. Se selecciona el sustituto por teclado.
3. DELETE con sustituto también devuelve 409 por referencias conservadas.
   La comparación completa confirma rollback: ningún cambio parcial de estado,
   plantillas o snapshots. La UI permite despublicar en su lugar.
4. Despublicar con el sustituto devuelve 200. El original queda Draft y el
   sustituto Published. Cambian las referencias de la plantilla activa y los
   elementos `program` futuros; se conservan la plantilla borrador, las semanas
   iniciadas y los elementos `individual`, incluidos sus otros campos.
5. La pantalla confirma el impacto. El endpoint de referencias conserva solo
   las referencias que corresponde mantener al original. El `finally` limpia
   filas QA propias y comprueba cero restos. No usa DELETE de medios en la
   limpieza, porque las claves de los archivos están compartidas.

```powershell
node node_modules/@playwright/test/cli.js test --config=playwright.program-publication-retirement-real.config.ts media-retirement-real.spec.ts
node node_modules/@playwright/test/cli.js test program-template-impact.spec.ts media-retirement.spec.ts --project=chromium-desktop --output=qa-reports/publication-retirement-mocked --reporter=list
```

El E2E real completo tiene dos casos, uno por tarea, ambos aprobados. La suite
de regresión tiene 16 casos sintéticos aprobados (9 retiro / 7 publicación),
incluidos destino Rutinas/Video, permisos, concurrencia, inglés a 320 px,
teclado y cancelación. Esa cobertura sintética no se presenta como prueba de BD.
No se necesitó modificar código de producto ni traducciones.

Evidencia: [resultado](evidence/1.23-2026-11-16/123-result.json),
[tráfico UI](evidence/1.23-2026-11-16/123-traffic.json),
[antes](evidence/1.23-2026-11-16/123-before.json),
[después](evidence/1.23-2026-11-16/123-after.json),
[limpieza](evidence/1.23-2026-11-16/123-cleanup.json).
Las capturas contiguas muestran sustituto obligatorio, bloqueo 409 y retiro
confirmado. Los [gates y logs compartidos](../program/evidence/1.22-2026-11-16/gates.json)
incluyen typecheck, lint, build, i18n y ambas suites.
