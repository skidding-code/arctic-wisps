#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import WebSocket from 'ws'

const here = dirname(fileURLToPath(import.meta.url))
const SEED = resolve(here, 'wisp.seed.txt')
const OUT = resolve(here, 'wisp.txt')

const PROBE_TIMEOUT_MS = 8000
const CONCURRENCY = 12

function normalize(line) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return null
  let url
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'wss:') return null
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`
  return url.toString()
}

function probe(url) {
  return new Promise((done) => {
    const started = Date.now()
    const socket = new WebSocket(url, { handshakeTimeout: PROBE_TIMEOUT_MS })
    let settled = false

    const finish = (ok) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.terminate()
      } catch {
        /* already closed */
      }
      done(ok ? { url, latencyMs: Date.now() - started } : null)
    }

    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS)

    socket.on('message', (data) => {
      const buffer = data instanceof Buffer ? data : Buffer.from(data)
      if (buffer.length >= 5 && buffer.readUInt8(0) === 0x03 && buffer.readUInt32LE(1) === 0) {
        finish(true)
      }
    })
    socket.on('error', () => finish(false))
    socket.on('close', () => finish(false))
  })
}

async function pool(items, worker, size) {
  const results = []
  let index = 0
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current])
    }
  })
  await Promise.all(runners)
  return results
}

function pack(text) {
  const salt = randomBytes(9).toString('base64url')
  const chars = [97, 114, 99, 116, 105, 99, 45, 108, 105, 115, 116, 45, 109, 97, 115, 107]
  const key = Buffer.from(`${String.fromCharCode(...chars)}:${salt}:1`)
  const body = Buffer.from(text)
  const out = Buffer.alloc(body.length)
  for (let index = 0; index < body.length; index += 1) out[index] = body[index] ^ key[index % key.length]
  return `aw1.${salt}.${out.toString('base64url')}`
}

async function main() {
  const seedText = await readFile(SEED, 'utf8')
  const candidates = [...new Set(seedText.split('\n').map(normalize).filter((v) => v !== null))]

  process.stderr.write(`probing ${candidates.length} wisp endpoints\n`)
  const probed = await pool(candidates, probe, CONCURRENCY)
  const live = probed.filter((v) => v !== null).sort((a, b) => a.latencyMs - b.latencyMs)

  const body = `${live.map((v) => v.url).join('\n')}\n`
  await writeFile(OUT, `${pack(body)}\n`)

  process.stderr.write(`wrote ${live.length} live endpoints to wisp.txt\n`)
}

main().catch((error) => {
  process.stderr.write(`health-check failed: ${error.message}\n`)
  process.exit(1)
})
