"""Fixtures sintéticas locales 1.22/1.23; nunca imprime secretos ni datos clínicos."""
import json
import datetime as dt
import os
from pathlib import Path
import sys
import uuid
from zoneinfo import ZoneInfo
from psycopg.types.json import Jsonb

ROOT = Path(os.environ.get('COP_WORKSPACE_ROOT', str(Path(__file__).resolve().parents[4])))

def connect():
    import psycopg
    config = json.loads((ROOT / 'coppAddresdBack/src/CoppAddresd.Api/appsettings.Development.json').read_text(encoding='utf-8-sig'))
    parts = {k.strip().lower(): v.strip() for k,v in (item.split('=',1) for item in config['ConnectionStrings']['DefaultConnection'].split(';') if '=' in item)}
    assert parts['host'] in ('localhost','127.0.0.1'), 'Solo PostgreSQL local'
    return psycopg.connect(host='127.0.0.1',port=int(parts.get('port','5432')),dbname=parts['database'],user=parts['username'],password=parts['password'])

def seed(mode):
    run = 'qa' + mode + '-' + uuid.uuid4().hex[:8]
    ids = {key: str(uuid.uuid4()) for key in ['template', 'draft', 'original', 'replacement', 'wrongType', 'unpublished', 'routine', 'plan', 'patient1', 'patient2', 'enrollment1', 'enrollment2']}
    fixture = {'run': run, 'mode': mode, **ids}
    today = dt.datetime.now(ZoneInfo('America/Bogota')).date()
    start = today - dt.timedelta(days=today.weekday())
    with connect() as db:
        db.execute("SET LOCAL lock_timeout='5s'")
        sources = db.execute("SELECT id,storage_key,content_type,duration_secs FROM app.media_items WHERE media_type='Podcast' AND status='Published' AND trim(storage_key)<>'' AND storage_key<>'media/podcasts/demo-copp.mp3' AND storage_key NOT LIKE 'media/qa/%%' ORDER BY created_at,id LIMIT 2").fetchall()
        assert len(sources)==2, 'Se requieren dos podcasts existentes publicados'
        video = db.execute("SELECT id,storage_key,content_type,duration_secs FROM app.media_items WHERE media_type='Video' AND status='Published' AND trim(storage_key)<>'' ORDER BY created_at,id LIMIT 1").fetchone()
        assert video, 'Se requiere un video existente para validar el filtro'
        fixture['reusedMediaIds'] = [str(s[0]) for s in sources] + [str(video[0])]
        for key in ['original', 'replacement', 'wrongType', 'unpublished']:
            source = video if key=='wrongType' else sources[1] if key=='replacement' else sources[0]
            db.execute("INSERT INTO app.media_items(id,title,author,media_type,storage_key,content_type,duration_secs,status,sort_order,category) VALUES(%s,%s,'QA local',%s,%s,%s,%s,%s,0,'Nutricion')", (ids[key], run + ' ' + key, 'Video' if key == 'wrongType' else 'Podcast', source[1],source[2],source[3], 'Draft' if key == 'unpublished' else 'Published'))
        db.execute("INSERT INTO app.exercise_routines(id,name,difficulty,category,status) VALUES(%s,%s,0,0,2)", (ids['routine'],run))
        db.execute("INSERT INTO app.nutrition_plans(id,name,duration_days,status,is_template) VALUES(%s,%s,7,2,true)",(ids['plan'],run))
        db.execute("INSERT INTO app.nutrition_plan_days(plan_id,day_number,meal_type,foods,sort_order) SELECT %s,n,0,'Menú sintético QA',0 FROM generate_series(1,7) n",(ids['plan'],))
        for key in ['template','draft']:
            db.execute("INSERT INTO app.program_templates(id,code,name,total_weeks,status,version) VALUES(%s,%s,%s,12,%s,7)",(ids[key],run+'-'+key,run+' '+key,'Active' if mode=='123' and key=='template' else 'Draft'))
            for task, column, value in [('podcast','media_id',ids['original']),('ejercicio','routine_id',ids['routine']),('nut','nutrition_plan_id',ids['plan'])]:
                # Columna elegida exclusivamente de esta lista estática; valores parametrizados.
                db.execute(f"INSERT INTO app.weekly_day_templates(template_id,weekday,task_code,points,sort_order,{column}) SELECT %s,n,%s,10,0,%s FROM generate_series(1,7) n",(ids[key],task,value))
        if mode=='122':
            # Falta un podcast el día 8; las demás 248 comprobaciones están completas.
            db.execute("DELETE FROM app.weekly_day_templates WHERE template_id=%s AND task_code='podcast' AND weekday=1",(ids['template'],))
            db.execute("INSERT INTO app.weekly_day_templates(template_id,week_number,weekday,task_code,points,media_id) SELECT %s,n,1,'podcast',10,%s FROM generate_series(1,12) n WHERE n<>2",(ids['template'],ids['original']))
        for n in [1,2]:
            db.execute("INSERT INTO app.patient_profiles(id,first_name,last_name,status,timezone,league_opt_in) VALUES(%s,'QA local',%s,'Activo','America/Bogota',false)",(ids['patient'+str(n)],run))
            db.execute("INSERT INTO app.program_enrollments(id,patient_id,template_id,start_local_date,current_week_number,status) VALUES(%s,%s,%s,%s,1,'Active')",(ids['enrollment'+str(n)],ids['patient'+str(n)],ids['template'],start))
            for week in [1,2]:
                rows = [{'weekday':day,'task_code':'podcast','points':10,'sort_order':day,'media_id':ids['original'],'origin':'individual' if week==2 and n==1 and day==1 else 'program', 'routine_id':None,'nutrition_plan_id':None,'rest':None,'edited_at':None,'edited_by':None,'backfill_version':None} for day in [1,2]]
                db.execute("INSERT INTO app.program_weeks(enrollment_id,week_number,status,week_start_date_local,week_end_date_local,tasks_snapshot,template_version_at_start,activated_at) VALUES(%s,%s,%s,%s,%s,%s,7,%s)",(ids['enrollment'+str(n)],week,'Active' if week==1 else 'Locked',start+dt.timedelta(days=(week-1)*7),start+dt.timedelta(days=week*7-1),Jsonb(rows),dt.datetime.now(dt.timezone.utc) if week==1 else None))
    return fixture

def state(f):
    with connect() as db:
        db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        template = db.execute('SELECT status,version,published_at FROM app.program_templates WHERE id=%s',(f['template'],)).fetchone()
        weeks = db.execute('SELECT enrollment_id,week_number,status,tasks_snapshot FROM app.program_weeks WHERE enrollment_id=ANY(%s::uuid[]) ORDER BY enrollment_id,week_number',([f['enrollment1'],f['enrollment2']],)).fetchall()
        refs = db.execute("SELECT template_id,week_number,weekday,media_id FROM app.weekly_day_templates WHERE template_id=ANY(%s::uuid[]) AND task_code='podcast' ORDER BY template_id,week_number NULLS FIRST,weekday",([f['template'],f['draft']],)).fetchall()
        media = db.execute('SELECT id,status FROM app.media_items WHERE id=ANY(%s::uuid[]) ORDER BY id',([f[k] for k in ['original','replacement','wrongType','unpublished']],)).fetchall()
        return {'template':template,'weeks':weeks,'references':refs,'media':media}

def repair(f):
    assert f['mode']=='122'
    with connect() as db:
        template = db.execute('SELECT code FROM app.program_templates WHERE id=%s',(f['template'],)).fetchone()
        assert template is not None and template[0]==f['run']+'-template'
        db.execute("INSERT INTO app.weekly_day_templates(template_id,week_number,weekday,task_code,points,media_id) VALUES(%s,2,1,'podcast',10,%s)",(f['template'],f['original']))
    return {'repaired':True}

def cleanup(f):
    assert f['run'].startswith('qa'+f['mode']+'-')
    with connect() as db:
        template = db.execute('SELECT code FROM app.program_templates WHERE id=%s',(f['template'],)).fetchone()
        assert template is None or template[0]==f['run']+'-template'
        db.execute('DELETE FROM app.program_weeks WHERE enrollment_id=ANY(%s::uuid[])',([f['enrollment1'],f['enrollment2']],))
        db.execute('DELETE FROM app.program_enrollments WHERE id=ANY(%s::uuid[])',([f['enrollment1'],f['enrollment2']],))
        db.execute('DELETE FROM app.weekly_day_templates WHERE template_id=ANY(%s::uuid[])',([f['template'],f['draft']],))
        db.execute('DELETE FROM app.program_templates WHERE id=ANY(%s::uuid[])',([f['template'],f['draft']],))
        db.execute('DELETE FROM app.patient_profiles WHERE id=ANY(%s::uuid[])',([f['patient1'],f['patient2']],))
        db.execute('DELETE FROM app.nutrition_plan_days WHERE plan_id=%s',(f['plan'],))
        db.execute('DELETE FROM app.nutrition_plans WHERE id=%s',(f['plan'],))
        db.execute('DELETE FROM app.exercise_routines WHERE id=%s',(f['routine'],))
        # Solo metadata QA. Los blobs son compartidos: nunca DELETE de medios ni storage.
        db.execute('DELETE FROM app.media_items WHERE id=ANY(%s::uuid[])',([f[k] for k in ['original','replacement','wrongType','unpublished']],))
    return {'cleaned':True,'run':f['run'],'remaining':state(f)}

try:
    action = sys.argv[1]
    if action.startswith('seed'):
        result = seed(action[-3:])
    else:
        fixture = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
        result = {'state':state,'repair':repair,'cleanup':cleanup}[action](fixture)
    print(json.dumps(result, default=str))
except Exception as error:
    print(json.dumps({'failed': True, 'error': type(error).__name__}))
    raise SystemExit(1) from None
