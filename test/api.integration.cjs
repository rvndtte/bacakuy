const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

let serverProcess
let baseUrl
let tempDir
let createdBookId
let createdWordId

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch {
      // The server may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Server tidak siap dalam waktu yang diharapkan')
}

async function jsonRequest(route, options) {
  const response = await fetch(`${baseUrl}${route}`, options)
  const body = response.status === 204 ? null : await response.json()
  return { response, body }
}

before(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'bacakuy-test-'))
  const port = 3200 + Math.floor(Math.random() * 500)
  baseUrl = `http://127.0.0.1:${port}`
  serverProcess = spawn(process.execPath, ['server/index.cjs'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), BACAKUY_DB_PATH: path.join(tempDir, 'test.sqlite') },
    stdio: 'ignore',
  })
  await waitForHealth(baseUrl)
})

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    await new Promise(resolve => {
      serverProcess.once('exit', resolve)
      serverProcess.kill()
    })
  }
  await rm(tempDir, { recursive: true, force: true })
})

test('health check memastikan API memakai SQLite', async () => {
  const { response, body } = await jsonRequest('/api/health')
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true, database: 'sqlite' })
})

test('auth login dan register menghasilkan session token', async () => {
  let result = await jsonRequest('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@bacakuy.id', password: 'bacakuy123' }) })
  assert.equal(result.response.status, 200)
  assert.equal(result.body.user.name, 'Ravena Aditya')
  assert.equal(result.body.token.length, 64)

  result = await jsonRequest('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'New Reader', email: `reader-${Date.now()}@bacakuy.id`, password: 'rahasia123' }) })
  assert.equal(result.response.status, 201)
  assert.equal(result.body.user.name, 'New Reader')
})

test('bootstrap mengembalikan folder dan buku seed', async () => {
  const { response, body } = await jsonRequest('/api/bootstrap')
  assert.equal(response.status, 200)
  assert.deepEqual(body.folders, ['Sedang dibaca', 'Selesai dibaca', 'Ingin dibaca'])
  assert.equal(body.books.length, 3)
  assert.deepEqual(body.words, [])
})

test('CRUD folder: create, rename, duplicate validation, dan delete', async () => {
  let result = await jsonRequest('/api/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Buku kuliah' }) })
  assert.equal(result.response.status, 201)
  assert.deepEqual(result.body.name, 'Buku kuliah')

  result = await jsonRequest('/api/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Buku kuliah' }) })
  assert.equal(result.response.status, 409)

  result = await jsonRequest('/api/folders/Buku%20kuliah', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Kuliah semester 1' }) })
  assert.equal(result.response.status, 200)
  assert.equal(result.body.name, 'Kuliah semester 1')

  result = await jsonRequest('/api/folders/Kuliah%20semester%201', { method: 'DELETE' })
  assert.equal(result.response.status, 204)
})

test('CRUD buku dan file PDF: import, update metadata, download, delete', async () => {
  const form = new FormData()
  form.append('title', 'Buku test PDF')
  form.append('author', 'Penulis Test')
  form.append('folder', 'Sedang dibaca')
  form.append('progress', '12')
  form.append('file', new Blob(['%PDF-1.4 test document'], { type: 'application/pdf' }), 'buku-test.pdf')

  let result = await jsonRequest('/api/books', { method: 'POST', body: form })
  assert.equal(result.response.status, 201)
  assert.equal(result.body.title, 'Buku test PDF')
  assert.equal(result.body.author, 'Penulis Test')
  assert.equal(result.body.folder, 'Sedang dibaca')
  assert.match(result.body.fileUrl, /^\/api\/books\/\d+\/file$/)
  createdBookId = result.body.id

  result = await jsonRequest(`/api/books/${createdBookId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Buku test PDF diedit', author: 'Editor Test', folder: 'Ingin dibaca', progress: 42, color: 'sage' }) })
  assert.equal(result.response.status, 200)
  assert.deepEqual({ title: result.body.title, author: result.body.author, folder: result.body.folder, progress: result.body.progress, color: result.body.color }, { title: 'Buku test PDF diedit', author: 'Editor Test', folder: 'Ingin dibaca', progress: 42, color: 'sage' })

  const fileResponse = await fetch(`${baseUrl}${result.body.fileUrl}`)
  assert.equal(fileResponse.status, 200)
  assert.equal(fileResponse.headers.get('content-type'), 'application/pdf')
  assert.match(await fileResponse.text(), /%PDF-1\.4/)

  result = await jsonRequest(`/api/books/${createdBookId}`, { method: 'DELETE' })
  assert.equal(result.response.status, 204)
  result = await jsonRequest('/api/bootstrap')
  assert.equal(result.response.status, 200)
  assert.equal(result.body.books.some(book => book.id === createdBookId), false)
})

test('folder berisi buku tidak dapat dihapus', async () => {
  const result = await jsonRequest('/api/folders/Sedang%20dibaca', { method: 'DELETE' })
  assert.equal(result.response.status, 409)
  assert.match(result.body.error, /masih berisi buku/)
})

test('CRUD bank kata: save/upsert, update, dan delete', async () => {
  let result = await jsonRequest('/api/words', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ word: 'creative', translation: 'kreatif', context: 'creative work' }) })
  assert.equal(result.response.status, 201)
  assert.equal(result.body.word, 'creative')
  createdWordId = result.body.id

  result = await jsonRequest('/api/words', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ word: 'CREATIVE', translation: 'berkreasi', context: 'updated context' }) })
  assert.equal(result.response.status, 201)
  assert.equal(result.body.id, createdWordId)
  assert.equal(result.body.translation, 'berkreasi')

  result = await jsonRequest(`/api/words/${createdWordId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ word: 'creating', translation: 'mencipta', context: 'creating daily' }) })
  assert.equal(result.response.status, 200)
  assert.deepEqual({ word: result.body.word, translation: result.body.translation, context: result.body.context }, { word: 'creating', translation: 'mencipta', context: 'creating daily' })

  result = await jsonRequest(`/api/words/${createdWordId}`, { method: 'DELETE' })
  assert.equal(result.response.status, 204)
})

test('share story menyimpan current read atau kutipan', async () => {
  let result = await jsonRequest('/api/shares', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookId: null, quote: 'Kutipan test untuk story' }) })
  assert.equal(result.response.status, 201)
  assert.equal(typeof result.body.id, 'number')
})

test('CRUD profil user menyimpan nama, role, dan avatar', async () => {
  let result = await jsonRequest('/api/user')
  assert.equal(result.response.status, 200)
  assert.equal(result.body.id, 1)

  result = await jsonRequest('/api/user', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 1, name: 'Test Reader', role: 'Pembaca malam', avatar: 'TR' }) })
  assert.equal(result.response.status, 200)
  assert.deepEqual({ name: result.body.name, role: result.body.role, avatar: result.body.avatar }, { name: 'Test Reader', role: 'Pembaca malam', avatar: 'TR' })
})

test('validasi request menolak input wajib yang kosong', async () => {
  let result = await jsonRequest('/api/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '' }) })
  assert.equal(result.response.status, 400)
  result = await jsonRequest('/api/words', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ word: 'attention' }) })
  assert.equal(result.response.status, 400)
  result = await jsonRequest('/api/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder: 'Folder tidak ada' }) })
  assert.equal(result.response.status, 400)
})
