import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const path='dist/server/wrangler.json';
const config=JSON.parse(readFileSync(path,'utf8'));
for(const binding of config.d1_databases||[])if(binding.binding==='DB')binding.migrations_dir='../../drizzle';
writeFileSync(path,JSON.stringify(config,null,2));
const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config',path,'--persist-to','.wrangler/state'],{stdio:'inherit'});
process.exit(result.status??1);
