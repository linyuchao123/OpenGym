import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const root = fileURLToPath(new URL('../', import.meta.url))
for (const file of ['frontend/node_modules/vite/bin/vite.js', 'api/node_modules/@simplewebauthn/server/package.json']) {
  if (!existsSync(resolve(root, file))) {
    console.error('请先安装依赖：在 frontend 中运行 npm ci --ignore-scripts，在 api 中运行 npm ci --omit=optional。')
    process.exit(1)
  }
}
if (existsSync(resolve(root, '.env.ai.local'))) process.loadEnvFile(resolve(root, '.env.ai.local'))
const port = process.env.GYM_DEV_PORT || '13000'
const apiPort = process.env.GYM_API_PORT || '13001'
const hostname = process.env.GYM_DEV_HOSTNAME || 'localhost'
const origin = `http://${hostname}:${port}`
const localData = process.env.GYM_DATA_DIR || resolve(root, '.local-data')
let hasProfiles = false
try { hasProfiles = JSON.parse((await import('node:fs')).readFileSync(resolve(localData, 'db.json'), 'utf8')).users?.length > 0 } catch {}
const api = spawn(process.execPath, ['server.js'], {
  cwd: resolve(root, 'api'), stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: apiPort, ORIGIN: origin, RP_ID: hostname,
    DATA_DIR: localData, DEFAULT_LANG: 'zh', FIRST_USER_ADMIN: '1', ALLOW_GUEST: '1', INVITE_ONLY: process.env.INVITE_ONLY || (hasProfiles ? '1' : '0') },
})
const webEnv = { ...process.env }
for (const key of ['FOOD_AI_API_KEY', 'FOOD_AI_BASE_URL', 'FOOD_AI_MODEL']) delete webEnv[key]
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: resolve(root, 'frontend'), stdio: 'inherit',
  env: { ...webEnv, API_TARGET: `http://127.0.0.1:${apiPort}`, API_ORIGIN: origin },
})
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  api.kill('SIGTERM'); web.kill('SIGTERM')
  process.exitCode = code
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
for (const child of [api, web]) {
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code || 0) })
}
console.log(`\n中文版本地预览：${origin}\n账号记录保存在此实例的数据目录；未登录的访客记录只保存在当前浏览器。\n`)
