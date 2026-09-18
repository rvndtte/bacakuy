const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { admin: supabaseAdmin } = require('../server/supabase.cjs')

let serverProcess
let baseUrl
let token
let testUserId
let testEmail
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
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${baseUrl}${route}`, { ...options, headers })
  const body = response.status === 204 ? null : await response.json()
  return { response, body }
}

before(async () => {
  const port = 3200 + Math.floor(Math.random() * 500)
  baseUrl = `http://127.0.0.1:${port}`
  serverProcess = spawn(process.execPath, ['server/dev.cjs'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  })
  await waitForHealth(baseUrl)

  testEmail = `test-${Date.now()}@bacakuy.id`
  const register = await jsonRequest('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Reader', email: testEmail, password: 'rahasia123' }) })
  token = register.body.token
  testUserId = register.body.user.id
})

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    await new Promise(resolve => {
      serverProcess.once('exit', resolve)
      serverProcess.kill()
    })
  }
  if (testUserId) await supabaseAdmin.auth.admin.deleteUser(testUserId)
})

test('health check memastikan API memakai Supabase', async () => {
  const { response, body } = await jsonRequest('/api/health')
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true, database: 'supabase' })
})

test('auth login menghasilkan session token', async () => {
  const result = await jsonRequest('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: testEmail, password: 'rahasia123' }) })
  assert.equal(result.response.status, 200)
  assert.equal(result.body.user.name, 'Test Reader')
  assert.ok(result.body.token)
})

test('bootstrap membuat folder default untuk user baru', async () => {
  const { response, body } = await jsonRequest('/api/bootstrap')
  assert.equal(response.status, 200)
  assert.deepEqual(body.folders, ['Sedang dibaca', 'Selesai dibaca', 'Ingin dibaca'])
  assert.deepEqual(body.books, [])
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

test('CRUD buku dan file PDF: upload langsung ke storage, update metadata, download, delete', async () => {
  const uploadUrlResult = await jsonRequest('/api/books/upload-url', { method: 'POST' })
  assert.equal(uploadUrlResult.response.status, 200)
  const { path: storagePath, signedUrl } = uploadUrlResult.body

  const uploadResponse = await fetch(signedUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: Buffer.from('%PDF-1.4 test document') })
  assert.ok(uploadResponse.ok)

  let result = await jsonRequest('/api/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Buku test PDF', author: 'Penulis Test', folder: 'Sedang dibaca', filePath: storagePath, fileName: 'buku-test.pdf' }) })
  assert.equal(result.response.status, 201)
  assert.equal(result.body.title, 'Buku test PDF')
  assert.equal(result.body.author, 'Penulis Test')
  assert.equal(result.body.folder, 'Sedang dibaca')
  assert.match(result.body.fileUrl, /^https?:\/\//)
  createdBookId = result.body.id

  result = await jsonRequest(`/api/books/${createdBookId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Buku test PDF diedit', author: 'Editor Test', folder: 'Ingin dibaca', progress: 42, color: 'sage' }) })
  assert.equal(result.response.status, 200)
  assert.deepEqual({ title: result.body.title, author: result.body.author, folder: result.body.folder, progress: result.body.progress, color: result.body.color }, { title: 'Buku test PDF diedit', author: 'Editor Test', folder: 'Ingin dibaca', progress: 42, color: 'sage' })

  const fileResponse = await fetch(result.body.fileUrl)
  assert.equal(fileResponse.status, 200)
  assert.match(await fileResponse.text(), /%PDF-1\.4/)

  result = await jsonRequest(`/api/books/${createdBookId}`, { method: 'DELETE' })
  assert.equal(result.response.status, 204)
  result = await jsonRequest('/api/bootstrap')
  assert.equal(result.response.status, 200)
  assert.equal(result.body.books.some(book => book.id === createdBookId), false)
})

test('folder berisi buku tidak dapat dihapus', async () => {
  const created = await jsonRequest('/api/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Folder terisi' }) })
  assert.equal(created.response.status, 201)
  const book = await jsonRequest('/api/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Buku penghuni folder', folder: 'Folder terisi' }) })
  assert.equal(book.response.status, 201)

  const result = await jsonRequest('/api/folders/Folder%20terisi', { method: 'DELETE' })
  assert.equal(result.response.status, 409)
  assert.match(result.body.error, /masih berisi buku/)

  await jsonRequest(`/api/books/${book.body.id}`, { method: 'DELETE' })
  await jsonRequest('/api/folders/Folder%20terisi', { method: 'DELETE' })
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
  const result = await jsonRequest('/api/shares', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookId: null, quote: 'Kutipan test untuk story' }) })
  assert.equal(result.response.status, 201)
  assert.equal(typeof result.body.id, 'number')
})

test('CRUD profil user menyimpan nama, role, dan avatar', async () => {
  let result = await jsonRequest('/api/user')
  assert.equal(result.response.status, 200)
  assert.equal(result.body.id, testUserId)

  result = await jsonRequest('/api/user', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Reader Edited', role: 'Pembaca malam', avatar: 'TR' }) })
  assert.equal(result.response.status, 200)
  assert.deepEqual({ name: result.body.name, role: result.body.role, avatar: result.body.avatar }, { name: 'Test Reader Edited', role: 'Pembaca malam', avatar: 'TR' })
})

test('validasi request menolak input wajib yang kosong', async () => {
  let result = await jsonRequest('/api/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '' }) })
  assert.equal(result.response.status, 400)
  result = await jsonRequest('/api/words', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ word: 'attention' }) })
  assert.equal(result.response.status, 400)
  result = await jsonRequest('/api/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ folder: 'Folder tidak ada' }) })
  assert.equal(result.response.status, 400)
})

test('request tanpa token ditolak', async () => {
  const savedToken = token
  token = undefined
  const result = await jsonRequest('/api/bootstrap')
  assert.equal(result.response.status, 401)
  token = savedToken
})
