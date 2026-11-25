import {test, expect, type BrowserContext, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import type {MedicationTreatment, MedicationDose} from '../features/medications/types';

// API/Auth/PostgreSQL reales y pacientes sintéticos. Sin intercepción de negocio.
const fixturePath = process.env.COP_MEDICATION_FIXTURE!;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('Explicit private QA fixture required');
const f = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (!f.database.startsWith('copp_review_medications_assigned_')) throw new Error('Dedicated assigned-plan QA database required');
const app = 'http://127.0.0.1:5189';
const erp = 'http://127.0.0.1:3160';
const gateway = 'http://127.0.0.1:5160';
async function auth(c: BrowserContext, role: string) {
  const r = await c.request.post(gateway+'/api/auth/login', {data: {
    email:f.accounts[role].login, password:f.accounts[role].password,
    application: role==='patient' || role==='otherPatient' ? 'app':'erp',
  }});
  expect(r.status(), role+' real login').toBe(200);
  const headers = {Authorization:'Bearer '+(await r.json()).accessToken};
  await c.clearCookies(); // Login API no debe omitir el login UI del mismo contexto.
  return headers;
}
async function erpLogin(p: Page) {
  await p.goto(erp+'/login');
  await p.locator('#email').fill(f.accounts.manager.login);
  await p.locator('#password').fill(f.accounts.manager.password);
  await p.getByRole('slider', {name:'Comencemos',exact:true}).press('End');
  await expect(p).toHaveURL(/\/dashboard/);
}
async function appLogin(p: Page) {
  await p.goto(app); console.log('App: loaded');
  await p.locator('#login-id input').fill(f.accounts.patient.documentNumber); console.log('App: login form');
  await p.locator('#login-password input').fill(f.accounts.patient.password);
  await p.getByRole('button',{name:'Ingresar',exact:true}).click();
  await expect(p.locator('.wheel')).toBeVisible({timeout:40000}); console.log('App: home ready');
  await p.locator('.wheel').getByRole('button',{name:'Medicamentos',exact:true}).click();
}
const date = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const baseBody = {medicationId:null,productType:'medication',dosage:1,unit:'tableta',route:'oral',instructions:'QA sintético',times:['00:01'],timeZone:'America/Bogota',startDate:date,endDate:null};

test('ERP asigna → paciente registra otro → no sustituye plan → toma asignada cumple; protección real', async ({browser}, info) => {
  const staffContext = await browser.newContext({timezoneId:'America/Bogota',locale:'es-CO'});
  const patientContext = await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Bogota',locale:'es-CO'});
  const staff = await staffContext.newPage();
  const patient = await patientContext.newPage();
  staff.setDefaultTimeout(15000); patient.setDefaultTimeout(15000);
  try {
    console.log('Step: real authentication');
    const staffHeaders = await auth(staffContext,'manager');
    const patientHeaders = await auth(patientContext,'patient');
    const suffix = randomUUID().slice(0,8);
    const name = 'Plan obligatorio QA '+suffix;
    const extraName = 'Otro medicamento QA '+suffix;
    console.log('Step: ERP assignment');
    await erpLogin(staff);
    await staff.goto(erp+'/medications/'+f.patientId);
    await staff.getByRole('button',{name:"Nuevo plan de medicación",exact:true}).click();
    await staff.getByRole("button", { name: "Entrada manual", exact: true }).click();
    await staff.getByLabel('Nombre del producto',{exact:true}).fill(name);
    await staff.getByLabel('Horario 1',{exact:true}).fill('00:01');
    await staff.getByRole('button',{name:"Guardar plan de medicación",exact:true}).click();
    const treatment = staff.locator('.medication-treatment-row').filter({hasText:name});
    await expect(treatment).toBeVisible();
    await expect(treatment).toContainText('Plan asignado'); // rojo: UI antigua no distingue el plan
    console.log('Step: app plan and extra intake');
    await appLogin(patient);
    const adherence = patient.getByRole('region',{name:'Adherencia al plan',exact:true});
    await expect(adherence).toContainText('0%');
    await patient.getByRole('button',{name:'Añadir medicamento',exact:true}).first().click();
    await patient.locator('ion-input').filter({hasText:'Nombre del medicamento'}).locator('input').fill(extraName);
    await patient.locator('ion-input').filter({hasText:'Cantidad por toma'}).locator('input').fill('1');
    await patient.locator('ion-input').filter({hasText:'Unidad'}).locator('input').fill('tableta');
    await patient.locator('ion-input').filter({hasText:'Horarios'}).locator('input').fill('00:01');
    await patient.getByRole('button',{name:'Guardar medicamento',exact:true}).click();
    const extras = patient.getByRole('region',{name:'Fuera del plan',exact:true});
    const extra = extras.locator('.medications-dose').filter({hasText:extraName});
    await expect(extra).toBeVisible();
    await extra.getByRole('button',{name:'Ya lo tomé',exact:true}).click();
    await expect(extra).toContainText('Tomado');
    await expect(adherence).toContainText('0%');
    await expect(adherence).toContainText('No estás siguiendo el plan asignado');
    console.log('Step: ownership and adherence');
    const wsUrl=gateway+'/api/v1/me/medications?timeZone=America%2FBogota';
    let ws=await (await patientContext.request.get(wsUrl,{headers:patientHeaders})).json();
    const assigned = ws.treatments.find((t:MedicationTreatment)=>t.name===name);
    const reported = ws.treatments.find((t:MedicationTreatment)=>t.name===extraName);
    expect(assigned.isRequired).toBe(true);
    expect(reported.isRequired).toBe(false);
    expect(ws.adherence).toMatchObject({dueDoses:1,takenDoses:0,percent:0,offPlanTakenDoses:1});
    for(const status of ['paused','completed','active']) {
      const denied=await patientContext.request.put(gateway+'/api/v1/me/medications/treatments/'+assigned.id+'/status', {
        headers:patientHeaders,data:{status,expectedRevision:assigned.revision},
      });
      expect(denied.status(),'assigned '+status+' rejected').toBe(403);
    }
    await patient.locator('ion-segment-button[value="treatments"]').click();
    const assignedCard=patient.locator('.medications-treatment').filter({hasText:name});
    await expect(assignedCard).toContainText('Plan asignado');
    await expect(assignedCard.getByRole('button',{name:/Pausar|Finalizar/})).toHaveCount(0);
    await patient.locator('ion-segment-button[value="today"]').click();
    await patient.getByRole('region',{name:'Plan asignado',exact:true}).locator('.medications-dose').filter({hasText:name}).getByRole('button',{name:'Ya lo tomé',exact:true}).click();
    await expect(adherence).toContainText('100%');
    await expect(adherence).not.toContainText('No estás siguiendo');
    await staff.getByRole('tab',{name:'Hoy',exact:true}).click();
    await staff.getByRole('button',{name:'Actualizar seguimiento',exact:true}).click();
    await expect(staff.getByRole('region',{name:'Adherencia al plan',exact:true})).toContainText('100%');
    await patient.locator('.medications-scroll').evaluate(el => el.scrollTop = 0);
    await patient.screenshot({path:info.outputPath('patient-assigned-plan.png')});
    await staff.screenshot({path:info.outputPath('erp-assigned-plan.png')});
    // El paciente no puede falsificar el origen ni declarar obligatorio un registro propio.
    const spoof=await patientContext.request.post(gateway+'/api/v1/me/medications/treatments', {
      headers:patientHeaders,data:{...baseBody,clientRequestId:randomUUID(),name:'Origen falso '+suffix,origin:'staff_recorded',isRequired:true,times:['23:59']},
    });
    expect(spoof.status()).toBe(201);
    expect(await spoof.json()).toMatchObject({origin:'patient_reported',isRequired:false});
    const deniedStaff=await patientContext.request.post(gateway+'/api/v1/medications/patients/'+f.patientId+'/treatments', {
      headers:patientHeaders,data:{...baseBody,clientRequestId:randomUUID(),name:'No permitido'},
    });
    expect(deniedStaff.status()).toBe(403);
    const otherHeaders=await auth(patientContext,'otherPatient');
    const foreignDose=await patientContext.request.post(gateway+'/api/v1/me/medications/doses/'+ws.doses.find((d:MedicationDose)=>d.treatmentId===assigned.id).id+'/events', {
      headers:otherHeaders,data:{clientRequestId:randomUUID(),status:'taken',scheduledAt:ws.doses.find((d:MedicationDose)=>d.treatmentId===assigned.id).scheduledAt},
    });
    expect(foreignDose.status()).toBe(404);
    // Ni un suplemento asignado ni un registro propio futuro inflan el denominador obligatorio.
    const supplement=await staffContext.request.post(gateway+'/api/v1/medications/patients/'+f.patientId+'/treatments', {
      headers:staffHeaders,data:{...baseBody,clientRequestId:randomUUID(),name:'Nutracéutico QA '+suffix,productType:'supplement'},
    });
    expect(supplement.status()).toBe(201);
    ws=await (await patientContext.request.get(wsUrl,{headers:patientHeaders})).json();
    expect(ws.adherence).toMatchObject({dueDoses:1,takenDoses:1,percent:100});
    const future=await staffContext.request.post(gateway+'/api/v1/medications/patients/'+f.patientId+'/treatments', {
      headers:staffHeaders,data:{...baseBody,clientRequestId:randomUUID(),name:'Asignado futuro '+suffix,times:['23:59']},
    });
    expect(future.status()).toBe(201);
    ws=await (await patientContext.request.get(wsUrl,{headers:patientHeaders})).json();
    expect(ws.adherence).toMatchObject({scheduledDoses:2,dueDoses:1,takenDoses:1,percent:100});
    const assignedDose=ws.doses.find((d:MedicationDose)=>d.treatmentId===assigned.id);
    const correction=await staffContext.request.post(gateway+'/api/v1/medications/patients/'+f.patientId+'/doses/'+assignedDose.id+'/events', {
      headers:staffHeaders,data:{clientRequestId:randomUUID(),status:'omitted',expectedRevision:assignedDose.revision,reason:'Corrección de QA',scheduledAt:assignedDose.scheduledAt},
    });
    expect(correction.status()).toBe(200);
    await patient.getByRole('button',{name:'Actualizar medicamentos',exact:true}).click();
    await expect(adherence).toContainText('0%');
    await expect(adherence).toContainText('No estás siguiendo el plan asignado');
    await patient.locator('.medications-header .lang-toggle').click();
    const englishAdherence=patient.getByRole('region',{name:'Plan adherence',exact:true});
    await expect(englishAdherence).toContainText('0%');
    await expect(englishAdherence).toContainText('You are not following your assigned plan');
    await expect(patient.getByRole('region',{name:'Outside the plan',exact:true})).toBeVisible();
    for (const width of [320,390,768]) {
      await patient.setViewportSize({width,height:844});
      expect(await patient.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await patient.setViewportSize({width:390,height:844});
    await patient.locator('.medications-scroll').evaluate(el => el.scrollTop = 0);
    await patient.screenshot({path:info.outputPath('patient-plan-deviation-en.png')});
    const tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
    await staff.getByLabel('Día de seguimiento',{exact:true}).fill(tomorrow);
    await expect(staff.getByRole('region',{name:'Adherencia al plan',exact:true})).toContainText('Sin tomas asignadas para evaluar');
    await expect(staff.getByRole('region',{name:'Adherencia al plan',exact:true})).not.toContainText('100%');
    // Permisos de staff de solo lectura y propiedad del paciente se conservan.
    const reader=await auth(staffContext,'reader');
    expect((await staffContext.request.post(gateway+'/api/v1/medications/patients/'+f.patientId+'/treatments',{headers:reader,data:{...baseBody,clientRequestId:randomUUID(),name:'Reader denied'}})).status()).toBe(403);
    expect((await patientContext.request.put(gateway+'/api/v1/me/medications/treatments/'+reported.id+'/status',{headers:patientHeaders,data:{status:'paused',expectedRevision:reported.revision}})).status()).toBe(200);
  } catch (error) {
    await patient.screenshot({path:info.outputPath('patient-failure.png')}).catch(()=>{});
    await staff.screenshot({path:info.outputPath('erp-failure.png')}).catch(()=>{});
    throw error;
  } finally {
    await staffContext.close(); await patientContext.close();
  }
});
