// Each browser suite creates a disposable profile. Use the fixture-free production
// service worker for offline journeys and a development server for module-level tests.
import { spawn } from 'node:child_process'
import { createServer, preview } from 'vite'

function run(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(args.join(' ') + ' exited with ' + (signal || code)))
    })
  })
}

await run(['--test', '--test-concurrency=1', 'tests/accessibility.test.mjs', 'tests/approvals.test.mjs',
  'tests/rates.test.mjs', 'tests/record-history.test.mjs'])
await run(['tests/billing.mjs'])
await run(['tests/operations.mjs'])

const dev = await createServer({ server: {host: '127.0.0.1', port: 0}, logLevel: 'error' })
try {
  await dev.listen()
  const env = {APP_URL: new URL(dev.resolvedUrls.local[0]).origin}
  await run(['tests/records.mjs'], env)
  await run(['tests/intake.mjs'], env)
} finally {
  await dev.close()
}

const production = await preview({preview: {host: '127.0.0.1', port: 0}, logLevel: 'error'})
try {
  const origin = new URL(production.resolvedUrls.local[0]).origin
  await run(['tests/shop-day.mjs', origin])
  await run(['tests/shop-backup.mjs', origin, '--offline'])
} finally {
  await new Promise((resolve, reject) => production.httpServer.close(error => error ? reject(error) : resolve()))
}
