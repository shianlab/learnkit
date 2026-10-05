import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..');
export function loadPlaywright(){
  const candidates=[process.env.PLAYWRIGHT_RUNTIME_PACKAGE,path.join(root,'app/package.json'),path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')].filter(Boolean);
  for(const candidate of candidates){try{return createRequire(path.resolve(candidate))('playwright');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
  throw new Error('运行窗口验收需要 Playwright。请在 app 中执行 npm install --no-save --package-lock=false playwright，或设置 PLAYWRIGHT_RUNTIME_PACKAGE 指向已有运行环境的 package.json。');
}
