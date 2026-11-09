#!/usr/bin/env python3
"""Local harness regression tests; ONLY the independent owner's disposable seed.
Requires TEST_CLUSTER_DIR with PostgreSQL 17.11, no TCP and a marked
shiftly_disposable_seed database containing the nine unchanged migrations.
Creates temporary clones, injects local test failures and checks whole-DB drops.
Never use on Cloud; the external owner must finally destroy the entire cluster.
"""
import os,subprocess,hashlib,signal,time
from pathlib import Path
root=os.environ['TEST_CLUSTER_DIR']; script=str(Path(__file__).with_name('v3_1_concurrency.sh').resolve())
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env.update(TEST_CLUSTER_DIR=root,TEST_DB_NAME='shiftly_disposable_seed',TEST_DB_PORT='54399',SHIFTLY_LOCAL_TEST_CONFIRM='DESTROY_DISPOSABLE_LOCAL_DATABASE',PGOPTIONS='-c app.shiftly_test_env=on')
def sql(q,db='postgres'):
 return subprocess.check_output(['psql','-X','-h',root,'-p','54399','-U','postgres','-d',db,'-tAc',q],env={k:v for k,v in env.items() if not k.startswith('PG')},text=True).strip()
def fingerprint():
 return hashlib.sha256(b'\n'.join(x for x in subprocess.check_output(['pg_dump','-h',root,'-p','54399','-U','postgres','--no-comments','shiftly_disposable_seed'],env={k:v for k,v in env.items() if not k.startswith('PG')}).splitlines() if not x.startswith((b'\\restrict',b'\\unrestrict')))).hexdigest()
def denied(label,changes):
 before=fingerprint(); e=env|changes
 p=subprocess.run(['bash',script],env=e,capture_output=True,text=True)
 assert p.returncode!=0,(label,p.stdout)
 assert before==fingerprint(),label+' changed database'
 print(label,'REFUSED, unchanged')
assert sql("SELECT current_setting('data_directory') || '|' || current_setting('server_version') || '|' || coalesce(inet_server_addr()::text,'unix')",'shiftly_disposable_seed')==root+'/data|17.11|unix'
assert sql("SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname='shiftly_disposable_seed'")=='shiftly-disposable-local-v1'
denied('no external confirmation',{'SHIFTLY_LOCAL_TEST_CONFIRM':''})
denied('no external GUC',{'PGOPTIONS':''})
denied('remote DSN',{'TEST_DB_DSN':'host=example.com dbname=production'})
denied('unsafe database name',{'TEST_DB_NAME':'production'})
sql('CREATE ROLE supabase_admin NOLOGIN');denied('hosted role marker',{});sql('DROP ROLE supabase_admin')
sql("INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111')",'shiftly_disposable_seed');denied('existing Auth user',{});sql('DELETE FROM auth.users','shiftly_disposable_seed')
sql('ALTER ROLE anon RENAME TO missing_anon');denied('missing test role',{});sql('ALTER ROLE missing_anon RENAME TO anon')
for i in range(1,4):
 db=f'shiftly_disposable_run_{i}';sql(f'CREATE DATABASE {db} TEMPLATE shiftly_disposable_seed');sql(f"COMMENT ON DATABASE {db} IS 'shiftly-disposable-local-v1'")
 e=env|{'TEST_DB_NAME':db,'PGHOST':'remote.invalid','PGSERVICE':'production','PGDATABASE':'production'}
 p=subprocess.run(['bash',script],env=e,capture_output=True,text=True,timeout=90)
 print(p.stderr) if p.returncode else None
 assert p.returncode==0,(i,p.stderr,p.stdout[-1000:])
 assert sql(f"SELECT count(*) FROM pg_database WHERE datname='{db}'")=='0'
 print('round',i, '\n'.join(x for x in p.stdout.splitlines() if 'OK' in x or 'PASSED' in x))

for mode in ('error','TERM','INT'):
 db='shiftly_disposable_cleanup_'+mode.lower()
 sql(f'CREATE DATABASE {db} TEMPLATE shiftly_disposable_seed')
 sql(f"COMMENT ON DATABASE {db} IS 'shiftly-disposable-local-v1'")
 body="RAISE EXCEPTION 'injected fixture failure';" if mode=='error' else 'PERFORM pg_sleep(3); RETURN NEW;'
 sql("CREATE FUNCTION auth.test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "+body+" END $$; CREATE TRIGGER test_fault BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.test_fault();",db)
 p=subprocess.Popen(['bash',script],env=env|{'TEST_DB_NAME':db},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
 if mode!='error':
  for _ in range(100):
   if sql(f"SELECT count(*) FROM pg_stat_activity WHERE datname='{db}' AND wait_event='PgSleep'")=='1': break
   if p.poll() is not None: raise AssertionError('ended before signal')
   time.sleep(.05)
  else: raise AssertionError('fixture never reached sleep')
  os.killpg(p.pid,signal.SIGTERM if mode=='TERM' else signal.SIGINT)
 out,err=p.communicate(timeout=15)
 assert p.returncode!=0,(mode,out,err)
 assert sql(f"SELECT count(*) FROM pg_database WHERE datname='{db}'")=='0',(mode,out,err)
 print(mode,'cleanup destroyed database, exit',p.returncode)
