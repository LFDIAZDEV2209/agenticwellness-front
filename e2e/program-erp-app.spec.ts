import { expect, test as base, type Locator } from "@playwright/test";
import { mockProgramErpApp } from "./fixtures/program-erp-app-http";

type Bridge = Awaited<ReturnType<typeof mockProgramErpApp>>;
const test = base.extend<{ bridge: Bridge }>({
  bridge: async ({ page, browser }, provide) => {
    const bridge = await mockProgramErpApp(page, browser);
    try {
      await provide(bridge);
      expect(
        bridge.state.unexpected,
        "No debe salir ninguna mutación ni API de programa desconocida",
      ).toEqual([]);
      expect(
        bridge.state.pageErrors,
        "Ambas interfaces deben funcionar sin errores JavaScript",
      ).toEqual([]);
    } finally {
      await bridge.close();
    }
  },
});

const erpDay = (agenda: Locator, name: string) =>
  agenda
    .getByRole("article")
    .filter({ has: agenda.page().getByRole("heading", { name, exact: true }) });
async function chooseRoutine(
  bridge: Bridge,
  agenda: Locator,
  day: string,
  routine: string,
) {
  await erpDay(agenda, day)
    .getByRole("button", { name: "Editar rutina", exact: true })
    .click();
  const panel = bridge.erp.getByRole("dialog", {
    name: `Rutina · ${day}`,
    exact: true,
  });
  await panel
    .getByRole("listitem")
    .filter({ hasText: routine })
    .getByRole("button", { name: "Elegir rutina", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("Cambio guardado");
  await panel.getByRole("button", { name: "Cerrar", exact: true }).click();
}
async function upcomingDay(bridge: Bridge, date: string) {
  const day = bridge.app.locator(`.pg-upcoming ion-accordion[value="${date}"]`);
  await day.locator('ion-item[slot="header"]').click();
  return day;
}
async function openExercise(bridge: Bridge) {
  await bridge.app
    .locator("button.pcard")
    .filter({ hasText: "Ejercicio" })
    .click();
  await expect(bridge.app.locator(".exercise-session")).toBeVisible();
}

test("2.26 · dos rutinas distintas y descanso coinciden entre la agenda ERP, próximos días y Hoy de app", async ({
  bridge,
}, info) => {
  const { erp, app, routines, routineB, routineC } = bridge;
  const agenda = await bridge.openErpWeek();
  const force = routines.get(routineB)!.name,
    balance = routines.get(routineC)!.name;
  await chooseRoutine(bridge, agenda, "Lunes", force);
  await chooseRoutine(bridge, agenda, "Martes", balance);
  await expect(
    erpDay(agenda, "Lunes").getByRole("region", {
      name: "Rutina",
      exact: true,
    }),
  ).toContainText(force);
  await expect(
    erpDay(agenda, "Martes").getByRole("region", {
      name: "Rutina",
      exact: true,
    }),
  ).toContainText(balance);
  await expect(
    erpDay(agenda, "Miércoles").getByRole("region", {
      name: "Rutina",
      exact: true,
    }),
  ).toContainText("Descanso");
  await bridge.openApp();
  await expect(
    (await upcomingDay(bridge, "2026-11-16")).getByText(force, { exact: true }),
  ).toBeVisible();
  await expect(
    (await upcomingDay(bridge, "2026-11-17")).getByText(balance, {
      exact: true,
    }),
  ).toBeVisible();
  const rest = await upcomingDay(bridge, "2026-11-18");
  await expect(
    rest.getByText("Descanso de ejercicio", { exact: true }),
  ).toBeVisible();
  await expect(rest.locator('[slot="content"]')).not.toContainText("Ejercicio");
  expect(
    bridge.state.writes
      .filter((write) => write.client === "erp")
      .map((write) => write.body),
  ).toEqual([
    [
      {
        weekday: 1,
        taskCode: "ejercicio",
        points: 80,
        sortOrder: 1,
        routineId: routineB,
      },
    ],
    [
      {
        weekday: 2,
        taskCode: "ejercicio",
        points: 80,
        sortOrder: 1,
        routineId: routineC,
      },
    ],
  ]);
  await erp.screenshot({
    path: info.outputPath("erp-two-routines-rest.png"),
    animations: "disabled",
  });
  await bridge.activate("2026-11-16");
  await bridge.setDate("2026-11-18");
  await bridge.openApp();
  await expect(
    app.getByRole("heading", {
      name: "Hoy descansas del ejercicio",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    app.locator("button.pcard").filter({ hasText: "Ejercicio" }),
  ).toHaveCount(0);
  await expect(
    app.locator("button.pcard").filter({ hasText: "Podcast" }),
  ).toBeVisible();
  expect(
    bridge.state.writes.filter((write) => write.client === "app"),
  ).toHaveLength(0);
  await app.screenshot({
    path: info.outputPath("app-rest-today.png"),
    animations: "disabled",
  });
});

test("2.26 · semana pasada no ofrece escritura ni permite cambiar la rutina desde el ERP", async ({
  bridge,
}) => {
  await bridge.activate("2026-11-16");
  const agenda = await bridge.openErpWeek(1);
  await erpDay(agenda, "Lunes")
    .getByRole("button", { name: "Editar rutina", exact: true })
    .click();
  const panel = bridge.erp.getByRole("dialog", {
    name: "Rutina · Lunes",
    exact: true,
  });
  await expect(panel).toContainText(
    "Esta semana ya empezó; no se puede modificar.",
  );
  await expect(
    panel.getByRole("button", { name: "Elegir rutina", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Día de descanso", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Restablecer al programa", exact: true }),
  ).toHaveCount(0);
  expect(bridge.state.writes).toHaveLength(0);
});

test("2.26 · editar catálogo después de completar conserva la sesión histórica en ERP y app", async ({
  bridge,
}, info) => {
  await bridge.activate("2026-11-16");
  await bridge.openApp();
  await openExercise(bridge);
  const original = structuredClone(bridge.routines.get(bridge.routineA)!);
  await expect(
    bridge.app.getByRole("heading", { name: original.name, exact: true }),
  ).toBeVisible();
  await bridge.app
    .getByRole("button", { name: "Ya lo hice · +80 pts", exact: true })
    .click();
  await expect.poll(() => bridge.state.sessions.size).toBe(1);
  const historical = JSON.stringify(bridge.state.sessions.get("2026-11-16"));
  await bridge.erp.goto("/wellness/exercise-routines");
  await bridge.erp
    .getByRole("row")
    .filter({ hasText: original.name })
    .getByTitle("Editar", { exact: true })
    .click();
  await bridge.erp
    .locator("#routine-name")
    .fill("Rutina modificada después QA");
  await bridge.erp
    .getByLabel("Nombre del ejercicio *", { exact: true })
    .fill("Movimiento nuevo QA");
  await bridge.erp.getByLabel("Series", { exact: true }).fill("8");
  await bridge.erp.getByLabel("Repeticiones", { exact: true }).fill("20");
  await bridge.erp
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect
    .poll(() => bridge.routines.get(bridge.routineA)!.name)
    .toBe("Rutina modificada después QA");
  const agenda = await bridge.openErpWeek();
  await expect(
    erpDay(agenda, "Lunes").getByRole("region", {
      name: "Rutina",
      exact: true,
    }),
  ).toContainText(original.name);
  await expect(erpDay(agenda, "Lunes")).not.toContainText(
    "Rutina modificada después QA",
  );
  await bridge.openApp();
  await openExercise(bridge);
  await expect(
    bridge.app.getByRole("heading", { name: original.name, exact: true }),
  ).toBeVisible();
  await expect(
    bridge.app.getByText("Rutina de hoy completada", { exact: true }),
  ).toBeVisible();
  await expect(
    bridge.app.getByRole("button", { name: /^Ya lo hice/ }),
  ).toHaveCount(0);
  await bridge.app
    .getByRole("button", {
      name: "Ver indicaciones de Movimiento original QA",
      exact: true,
    })
    .click();
  const indication = bridge.app.getByRole("region", {
    name: "Indicaciones del ejercicio",
    exact: true,
  });
  await expect(
    indication.getByText("Series", { exact: true }).locator("..").locator("dd"),
  ).toHaveText("3");
  await expect(
    indication
      .getByText("Repeticiones", { exact: true })
      .locator("..")
      .locator("dd"),
  ).toHaveText("12");
  await expect(
    bridge.app.getByText("Movimiento nuevo QA", { exact: true }),
  ).toHaveCount(0);
  expect(JSON.stringify(bridge.state.sessions.get("2026-11-16"))).toBe(
    historical,
  );
  expect(
    bridge.state.writes.filter((write) => write.client === "app"),
  ).toHaveLength(1);
  expect(
    bridge.state.writes.filter((write) => write.method === "PUT"),
  ).toHaveLength(1);
  await bridge.app.screenshot({
    path: info.outputPath("app-historical-prescription.png"),
    animations: "disabled",
  });
});

test("2.26 · personalización anticipada sigue visible después de activar con un programa distinto", async ({
  bridge,
}) => {
  let agenda = await bridge.openErpWeek();
  const custom = bridge.routines.get(bridge.routineB)!.name;
  await chooseRoutine(bridge, agenda, "Lunes", custom);
  await bridge.openApp();
  await expect(
    (await upcomingDay(bridge, "2026-11-16")).getByText(custom, {
      exact: true,
    }),
  ).toBeVisible();
  // El evento viene del contrato simulado; no llama ni reproduce el motor real.
  bridge.state.programRoutine = bridge.routineC;
  await bridge.activate("2026-11-16");
  agenda = await bridge.openErpWeek();
  await expect(
    erpDay(agenda, "Lunes").getByRole("region", {
      name: "Rutina",
      exact: true,
    }),
  ).toContainText(custom);
  await expect(
    erpDay(agenda, "Martes").getByRole("region", {
      name: "Rutina",
      exact: true,
    }),
  ).toContainText(bridge.routines.get(bridge.routineC)!.name);
  await bridge.openApp();
  await openExercise(bridge);
  await expect(
    bridge.app.getByRole("heading", { name: custom, exact: true }),
  ).toBeVisible();
  await expect(
    bridge.app
      .getByText("Sentadilla personalizada QA", { exact: true })
      .first(),
  ).toBeVisible();
  expect(bridge.state.writes).toHaveLength(1);
  expect(
    bridge.state.snapshots.some(
      (read) => read.client === "app" && read.date === "2026-11-16",
    ),
  ).toBe(true);
});
