import { expect, test } from "@playwright/test";
import { mockWeekAgendaEditor } from "./fixtures/week-agenda-editor-http";

test("2.18 · elegir rutina guarda solo la celda, conserva XP y permite deshacer", async ({
  page,
}) => {
  const http = await mockWeekAgendaEditor(page);
  const agenda = await http.open();
  await agenda
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Editar rutina", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Rutina · Lunes",
    exact: true,
  });
  await expect(panel.getByRole("note")).toContainText("Aviso sintético QA");
  await panel
    .getByRole("listitem")
    .filter({ hasText: "Rutina B QA" })
    .getByRole("button", { name: "Elegir rutina", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("Cambio guardado");
  expect(http.state.writes).toEqual([
    {
      week: 2,
      tasks: [
        {
          weekday: 1,
          taskCode: "ejercicio",
          points: 80,
          sortOrder: 2,
          routineId: http.routineB,
        },
      ],
    },
  ]);
  await panel.getByRole("button", { name: "Deshacer", exact: true }).click();
  await expect.poll(() => http.state.writes.length).toBe(2);
  expect(http.state.writes[1].tasks).toEqual([
    {
      weekday: 1,
      taskCode: "ejercicio",
      points: 80,
      sortOrder: 2,
      reset: true,
    },
  ]);
  await expect(
    panel.getByRole("button", { name: "Deshacer", exact: true }),
  ).toHaveCount(0);
});

test("2.18 · descanso depende del interruptor, restablecer y permutar son parciales", async ({
  page,
}) => {
  const http = await mockWeekAgendaEditor(page);
  const agenda = await http.open();
  await agenda
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Editar rutina", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Rutina · Lunes",
    exact: true,
  });
  const rest = panel.getByRole("button", {
    name: "Día de descanso",
    exact: true,
  });
  if (process.env.E2E_REST_ENABLED === "true") {
    await expect(rest).toBeEnabled();
    await rest.click();
    await expect.poll(() => http.state.writes.length).toBe(1);
    expect(http.state.writes[0].tasks[0]).toMatchObject({
      rest: true,
      taskCode: "ejercicio",
    });
    expect(http.state.writes[0].tasks[0].routineId).toBeUndefined();
    await panel.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect.poll(() => http.state.writes.length).toBe(2);
  } else {
    await expect(rest).toBeDisabled();
    await expect(panel).toContainText(
      "Disponible cuando la app de los pacientes lo soporte.",
    );
  }
  await panel
    .getByRole("button", { name: "Intercambiar con Martes", exact: true })
    .click();
  await expect
    .poll(() => http.state.writes.length)
    .toBe(process.env.E2E_REST_ENABLED === "true" ? 3 : 1);
  expect(http.state.writes.at(-1)?.tasks).toHaveLength(2);
  expect(http.state.writes.at(-1)?.tasks.map((task) => task.weekday)).toEqual([
    1, 2,
  ]);
});

test("2.18 · semana pasada en lectura y 409 impide nuevas escrituras", async ({
  page,
}) => {
  const http = await mockWeekAgendaEditor(page);
  let agenda = await http.open(1);
  await agenda
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Editar rutina", exact: true })
    .click();
  let panel = page.getByRole("dialog", { name: "Rutina · Lunes", exact: true });
  await expect(panel).toContainText(
    "Esta semana ya empezó; no se puede modificar.",
  );
  await expect(
    panel.getByRole("button", { name: "Elegir rutina", exact: true }),
  ).toHaveCount(0);
  expect(http.state.writes).toHaveLength(0);
  agenda = await http.open();
  http.state.started = true;
  await agenda
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Editar rutina", exact: true })
    .click();
  panel = page.getByRole("dialog", { name: "Rutina · Lunes", exact: true });
  await panel
    .getByRole("listitem")
    .filter({ hasText: "Rutina B QA" })
    .getByRole("button", { name: "Elegir rutina", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Esta semana ya empezó");
  await expect(
    panel.getByRole("button", { name: "Elegir rutina", exact: true }),
  ).toHaveCount(0);
  expect(http.state.writes).toHaveLength(1);
});

test("2.18 · fallo visible, sin éxito ni reintento automático; móvil sin desbordar", async ({
  page,
}, info) => {
  const http = await mockWeekAgendaEditor(page);
  http.state.fail = true;
  const agenda = await http.open();
  await page.setViewportSize({ width: 390, height: 844 });
  await agenda
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Editar rutina", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Rutina · Lunes",
    exact: true,
  });
  await panel
    .getByRole("listitem")
    .filter({ hasText: "Rutina B QA" })
    .getByRole("button", { name: "Elegir rutina", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toContainText(
    "No se pudo guardar el cambio",
  );
  await expect(panel).not.toContainText("interno que no debe mostrarse");
  await expect(
    panel.getByRole("button", { name: "Deshacer", exact: true }),
  ).toHaveCount(0);
  expect(http.state.writes).toHaveLength(1);
  expect(
    await panel.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("cell-panel-mobile.png") });
});

test("2.18 · sin Program.Edit no abre panel ni copia", async ({ page }) => {
  const http = await mockWeekAgendaEditor(page, { readOnly: true });
  const agenda = await http.open();
  await expect(
    agenda.getByRole("button", { name: "Editar rutina", exact: true }),
  ).toHaveCount(0);
  expect(http.state.writes).toHaveLength(0);
});

test("2.18 · una celda cambiada por otro profesional se recarga sin sobrescribir", async ({
  page,
}) => {
  const http = await mockWeekAgendaEditor(page);
  const agenda = await http.open();
  await agenda
    .getByRole("article")
    .first()
    .getByRole("button", { name: "Editar rutina", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Rutina · Lunes",
    exact: true,
  });
  const choose = panel
    .getByRole("listitem")
    .filter({ hasText: "Rutina B QA" })
    .getByRole("button", { name: "Elegir rutina", exact: true });
  await expect(choose).toBeEnabled();
  http.state.conflict = true;
  await choose.click();
  await expect(panel.getByRole("alert")).toContainText(
    "Esto cambió hace un momento",
  );
  expect(http.state.writes).toHaveLength(0);
});
