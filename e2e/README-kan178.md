# KAN-178 · aceptación de recompensas

La suite usa Chromium con ERP, Antares web, Auth, Gateway, API y PostgreSQL reales. No simula respuestas de negocio. Requiere una base desechable y perfiles sintéticos.

| Escenario | Resultado esperado |
| --- | --- |
| ERP y libro mayor legado | Tras editar de 17 a 37 XP, el mismo día sigue pagando 17. Un replay conserva el asiento y la bitácora identifica al editor. |
| Antares web a 390 px | Cuatro confirmaciones desbloquean el cofre; el ejercicio reducido cuenta. Cofre único, bonus al cierre, nivel 7 e historial conservados. Un paso retirado no paga, ni por la API anterior tras el corte. |
| Cierre conectado Motor 365 | El formulario real confirma el check-in. El bonus se registra una vez ante un reenvío. |
| Medianoches Bogotá y Tokio | Una misma edición entra en vigor a instantes diferentes. No revalúa asientos ni arrastra pasos. La racha cae tras un día perdido. |

## Ejecución local

1. Crear PostgreSQL desechable con pgvector y una base `copp_review_kan178`. Crear el rol `app_user` (`NOLOGIN`). Arrancar Auth sin `DevPatient` para aplicar su esquema, luego migrar la API con `ASPNETCORE_ENVIRONMENT=Production` y `--migrate`.
2. Sembrar en Auth `erp-kan178@example.test` con `Auth__AdminEmail`, y en reinicios sucesivos con `DevPatient__Email`, `patient-kan178@example.test`, `patient-kan178-east@example.test` y `patient-kan178-motor@example.test`. Usar un documento y contraseña sintéticos por perfil. Establecer `app.patient_profiles.timezone` en `Asia/Tokyo` para el paciente este. Los otros usan `America/Bogota`.
3. Cargar `e2e/seed/kan178-rewards.sql`. Ejecutar luego `scripts/qa/seed-paid-customer-journey.sql` del backend con `psql -v returning_email=patient-kan178-motor@example.test` y después `e2e/seed/kan178-motor.sql`.
4. Arrancar API con `SkipDatabaseInitialization=true`, `Storage__SignatureKey` sintética y `AuthService__BaseUrl` apuntando a Auth local. Compartir `Jwt__Issuer` y `Jwt__Secret` entre API y Auth, y la llave entre `Auth__InternalApiKey` y `AuthService__InternalApiKey`. En Gateway, enrutar `/api/auth` a Auth y `/api/v1` a la API.
5. Para el escenario de medianoches, arrancar `tests/CoppAddresd.E2EHost` en lugar de la API con `COP_E2E_PORT`, `COP_E2E_FILE_CLOCK=true` y `COP_E2E_OUTPUT` en un directorio de `/tmp`. Inicializar `utc-clock.txt` allí con `date -u +%Y-%m-%dT%H:%M:%SZ`. Este reloj solo existe en el host E2E.
6. Arrancar el ERP en modo desarrollo en `http://127.0.0.1:30478` y Antares con Vite en `http://127.0.0.1:5188`. Apuntar `NEXT_PUBLIC_GATEWAY_URL` y `VITE_GATEWAY_BASE_URL` al Gateway local y usar `VITE_WEB_SAME_ORIGIN=true` para Antares.

Exportar `KAN178_ERP_PASSWORD`, `KAN178_PATIENT_PASSWORD`, `KAN178_EAST_PASSWORD` y `KAN178_MOTOR_PASSWORD` con los valores elegidos. Exportar `KAN178_CLOCK_FILE` con la ruta del paso 5. Ejecutar desde ERP:

```sh
KAN178_DISPOSABLE_FIXTURE=1 \
KAN178_TEMPLATE_ID=17800000-0000-4000-8000-000000000001 \
yarn playwright test -c playwright.kan178.config.ts
```

Usar una base nueva para repetir la suite. Si faltan el reloj o el paciente Motor 365, se omite el escenario correspondiente. El navegador usa UTC deliberadamente y no determina el día de recompensa.
