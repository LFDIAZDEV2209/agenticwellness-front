"""Puente QA4.11: snapshots READ ONLY; caída HTTP con handlers F4 reales, sin host ni jobs."""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

REPO=Path(__file__).resolve().parents[2]
ROOT=Path(os.environ.get('COP_WORKSPACE_ROOT',str(REPO.parents[1]))).resolve()
OPS=ROOT/'.ai/operations/organizar-experiencia-bienestar'
FIXTURE=OPS/'4.11-back-fixture.json'
SOURCE=Path(os.environ.get('COP_F4_SOURCE',str(ROOT/'.tmp/back-f4-412-e0a9c29'))).resolve()
EVIDENCE=Path(os.environ['COP_411_EVIDENCE']).resolve()

def require(condition,message):
    if not condition:raise AssertionError(message)

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),default=str).encode()).hexdigest()

def backend():
    spec=importlib.util.spec_from_file_location('qa411',OPS/'4.11-back-fixture-helper.py')
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
    value=h.load()
    require(value['commit']=='e0a9c29dfbf551eaa3d51a97173fe72b55a0781b','Fixture de otro SHA')
    actual=subprocess.check_output(['git','-C',str(SOURCE),'rev-parse','HEAD'],text=True).strip()
    require(actual==value['commit'],'Checkout F4 distinto al contrato')
    return h,value

def snapshot(h,value):
    state=h.read_state(value);protected=h.protected(value)
    require(protected==value['protectedBefore'],'Sentinelas históricos modificados')
    result={'state':state,'protected':protected,'rows':{},'podcasts':[],'backendSha':value['commit'],'mainWeekStatuses':[]}
    patient=value['accounts']['patient']['patientId'];ai=value['accounts']['aiPatient']['patientId']
    with h.h.connect() as db:
        db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        require(db.execute('SHOW transaction_read_only').fetchone()[0]=='on','Snapshot debe ser READ ONLY')
        for name,query in {
            'enrollments':'SELECT to_jsonb(t) FROM app.program_enrollments t WHERE patient_id=ANY(%s::uuid[]) ORDER BY id',
            'weeks':'SELECT to_jsonb(t) FROM app.program_weeks t WHERE enrollment_id IN(SELECT id FROM app.program_enrollments WHERE patient_id=ANY(%s::uuid[])) ORDER BY id',
            'briefs':'SELECT to_jsonb(t) FROM app.patient_ai_briefs t WHERE patient_id=ANY(%s::uuid[]) ORDER BY id',
            'nutrition':'SELECT to_jsonb(t) FROM app.nutrition_prescriptions t WHERE patient_id=ANY(%s::uuid[]) ORDER BY id',
            'completions':'SELECT to_jsonb(t) FROM app.task_completions t WHERE enrollment_id IN(SELECT id FROM app.program_enrollments WHERE patient_id=ANY(%s::uuid[])) ORDER BY id',
            'evaluations':'SELECT to_jsonb(t) FROM app.health_test_evaluations t WHERE patient_id=ANY(%s::uuid[]) ORDER BY id',
        }.items():
            rows=[r[0] for r in db.execute(query,([patient,ai],)).fetchall()]
            result['rows'][name]={'count':len(rows),'sha256':digest(rows)}
        sequence=state['patient']['recommendations'][0]['podcastSequence']
        result['mainWeekStatuses']=[r[0] for r in db.execute('SELECT status FROM app.program_weeks WHERE enrollment_id IN(SELECT id FROM app.program_enrollments WHERE patient_id=%s) ORDER BY week_number',(patient,)).fetchall()]
        ids=[x['mediaId'] for x in sequence if x.get('mediaId')]
        result['podcasts']=[{'id':str(r[0]),'status':r[1],'blankKey':not bool((r[2] or '').strip()),'demo':(r[2] or '').strip().lower()=='media/podcasts/demo-copp.mp3'} for r in db.execute('SELECT id,status,storage_key FROM app.media_items WHERE id=ANY(%s::uuid[]) ORDER BY id',(ids,)).fetchall()]
        result['podcastCells']=len(sequence)
        db.rollback()
    return result

def outage(h,value):
    before=snapshot(h,value)
    me=h.h.request('GET',h.h.AUTH+'/api/auth/me',token=h.token(value['accounts']['generator']))
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    input_path=EVIDENCE/'outage-input.json'
    input_path.write_text(json.dumps({'fixture':str(FIXTURE),'userId':value['accounts']['generator']['userId'],'permissions':me['permissions']})+'\n',encoding='utf-8')
    build=REPO/'qa-reports/program-phase4-outage-build';build.mkdir(parents=True,exist_ok=True)
    source=REPO/'e2e/support/program-phase4-outage'
    for name in ['Outage.csproj','Program.cs']:shutil.copyfile(source/name,build/name)
    config=json.loads((ROOT/'coppAddresdBack/src/CoppAddresd.Api/appsettings.Development.json').read_text(encoding='utf-8-sig'))
    env=dict(os.environ);env['COP_TEST_DB_CONNECTION']=config['ConnectionStrings']['DefaultConnection']
    config_dir=Path(os.environ.get('COP_F4_CONFIG_DIR',str(ROOT/'coppAddresdBack/src/CoppAddresd.Api')))
    command=['dotnet','run','--project',str(build/'Outage.csproj'),'-p:QaBackendRoot='+str(SOURCE),'--',str(input_path),str(EVIDENCE/'outage.json'),str(config_dir/'appsettings.json'),str(config_dir/'appsettings.Development.json')]
    with (EVIDENCE/'outage-runner.log').open('w',encoding='utf-8') as log:
        done=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=150)
    require(done.returncode==0,'Runner de caída falló; ver log sanitizado')
    after=snapshot(h,value)
    require(before==after,'Caída IA alteró DB/sentinelas')
    result=json.loads((EVIDENCE/'outage.json').read_text())
    result['databaseUnchanged']=True
    return result

try:
    h,value=backend()
    result=outage(h,value) if sys.argv[1]=='outage' else snapshot(h,value)
    print(json.dumps(result,default=str))
except Exception as error:
    # Los errores de conexiones/HTTP pueden contener secretos; solo aserciones propias.
    print(json.dumps({'failed':True,'error':type(error).__name__,'reason':str(error) if isinstance(error,AssertionError) else 'Detalle omitido'}))
    raise SystemExit(1) from None
