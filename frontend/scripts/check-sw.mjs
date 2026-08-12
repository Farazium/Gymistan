// Runs after every build. Proves the service worker's route matchers actually
// run, instead of assuming it.
//
// Workbox does not call the `urlPattern` functions from vite.config.js — it
// converts them to source text and writes that into sw.js, where nothing from
// the config file's scope exists. A matcher that closes over so much as a
// constant therefore builds perfectly, ships, and then throws a ReferenceError
// on the first request it is asked about, silently disabling the cache it was
// meant to control. That is precisely what happened once; this stops it
// happening quietly again.
//
// The check is simple: pull each matcher out of the built file, evaluate it in
// an empty scope, and call it. A closed-over identifier fails immediately.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SW = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'sw.js')

if (!existsSync(SW)) {
  console.error('check-sw: dist/sw.js is missing — did the build run?')
  process.exit(1)
}

const source = readFileSync(SW, 'utf8')

/** Every argument-list that follows `registerRoute(`, split at the top level. */
function routeArgs(text) {
  const found = []
  const NEEDLE = 'registerRoute('
  let at = text.indexOf(NEEDLE)

  while (at !== -1) {
    let i = at + NEEDLE.length
    let depth = 1
    const start = i
    let firstArgEnd = -1

    for (; i < text.length && depth > 0; i++) {
      const c = text[i]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') depth--
      else if (c === ',' && depth === 1 && firstArgEnd === -1) firstArgEnd = i
    }
    found.push(text.slice(start, firstArgEnd === -1 ? i - 1 : firstArgEnd))
    at = text.indexOf(NEEDLE, i)
  }
  return found
}

// What a matcher is handed for a same-origin API read — enough for any of the
// checks the config makes.
const sample = {
  url: new URL('https://example.test/api/payments/?page=2'),
  request: { method: 'GET', destination: 'empty', mode: 'cors' },
  sameOrigin: true,
}

const matchers = routeArgs(source).filter((arg) => arg.includes('=>'))

if (!matchers.length) {
  console.error('check-sw: found no function matchers in sw.js — has the config changed shape?')
  process.exit(1)
}

let failed = 0
for (const [n, src] of matchers.entries()) {
  try {
    // Indirect eval, so the matcher is evaluated in global scope with nothing
    // of this file's around it — the same emptiness sw.js gives it.
    const fn = (0, eval)(`(${src})`)
    fn(sample)
  } catch (error) {
    failed++
    console.error(`check-sw: matcher ${n + 1} threw when called: ${error.message}`)
    console.error(`  source: ${src.slice(0, 160)}`)
  }
}

if (failed) {
  console.error(
    '\ncheck-sw: a route matcher cannot run inside the service worker.\n' +
    'Matchers are serialised to source, so they must not reference anything\n' +
    'declared in vite.config.js. Inline the value or match on url.pathname.'
  )
  process.exit(1)
}

console.log(`check-sw: ${matchers.length} service-worker route matchers run clean`)
