// 執行：npm run check（或 node scripts/check.mjs，不需任何套件）
// 1. 遞迴對所有 .js / .mjs 做語法檢查（node --check）
// 2. 檢查本地相對路徑的 static import / export-from 指向的檔案是否存在
// 略過 .git、node_modules、assets/vendor
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['.git', 'node_modules', join('assets', 'vendor')])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = relative(ROOT, full)
    if (SKIP.has(name) || SKIP.has(rel)) continue
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(m?js)$/.test(name)) out.push(full)
  }
  return out
}

// 只抓 import / export 開頭的 static 語句，避免誤判字串內容
const FROM_RE = /^\s*(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/gm
const BARE_RE = /^\s*import\s*['"]([^'"]+)['"]/gm

function localSpecifiers(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '')
  const specs = []
  for (const re of [FROM_RE, BARE_RE]) {
    re.lastIndex = 0
    for (const m of code.matchAll(re)) specs.push(m[1])
  }
  return specs.filter(s => s.startsWith('./') || s.startsWith('../'))
}

const files = walk(ROOT)
const errors = []

for (const file of files) {
  const rel = relative(ROOT, file)

  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (r.status !== 0) {
    errors.push(`語法錯誤：${rel}\n${(r.stderr || '').trim()}`)
    continue
  }

  for (const spec of localSpecifiers(readFileSync(file, 'utf8'))) {
    const clean = spec.split(/[?#]/)[0]
    const target = resolve(dirname(file), clean)
    if (!existsSync(target) || !statSync(target).isFile()) {
      errors.push(`找不到 import：${rel} → ${spec}`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n\n'))
  console.error(`\ncheck 失敗：${errors.length} 個問題（共檢查 ${files.length} 個檔案）`)
  process.exit(1)
}
console.log(`check 通過：${files.length} 個 JS/MJS 檔案（語法 + 本地 import）`)
