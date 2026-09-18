const express = require('express')
const cors = require('cors')
const multer = require('multer')
const Database = require('better-sqlite3')
const crypto = require('crypto')
const { admin: supabaseAdmin, authClient: supabaseAuth, enabled: supabaseEnabled } = require('./supabase.cjs')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const dataDir = path.join(root, 'data')
const uploadDir = path.join(dataDir, 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })
const db = new Database(process.env.BACAKUY_DB_PATH || path.join(dataDir, 'bacakuy.sqlite'))
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT NOT NULL DEFAULT 'Impor baru', folder_id INTEGER NOT NULL, progress INTEGER NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT 'coral', file_name TEXT, file_path TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(folder_id) REFERENCES folders(id) ON UPDATE CASCADE ON DELETE RESTRICT);
  CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL UNIQUE, translation TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS shares (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER, quote TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE SET NULL);
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Pembaca aktif', avatar TEXT NOT NULL DEFAULT 'RA');
  CREATE TABLE IF NOT EXISTS auth_tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES auth_users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS auth_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Pembaca aktif', avatar TEXT NOT NULL);
`)
try { db.exec('ALTER TABLE books ADD COLUMN cover_data TEXT') } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error }
try { db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT 'demo@bacakuy.id'") } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error }
try { db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''") } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error }
const hashPassword = password => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}` }
const verifyPassword = (password, stored) => { const [salt, key] = String(stored || '').split(':'); if (!salt || !key) return false; const derived = crypto.scryptSync(password, salt, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex')) }
db.prepare('INSERT OR IGNORE INTO users (id, name, role, avatar) VALUES (1, ?, ?, ?)').run('Ravena Aditya', 'Pembaca aktif', 'RA')
if (!db.prepare('SELECT password_hash FROM users WHERE id = 1').get().password_hash) db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = 1').run('demo@bacakuy.id', hashPassword('bacakuy123'))
if (!db.prepare('SELECT id FROM auth_users WHERE email = ?').get('demo@bacakuy.id')) db.prepare('INSERT INTO auth_users (name, email, password_hash, role, avatar) VALUES (?, ?, ?, ?, ?)').run('Ravena Aditya', 'demo@bacakuy.id', hashPassword('bacakuy123'), 'Pembaca aktif', 'RA')
const folderCount = db.prepare('SELECT COUNT(*) AS count FROM folders').get().count
const defaultFolderNames = ['Sedang dibaca', 'Selesai dibaca', 'Ingin dibaca']
const ensureDefaultFolders = () => {
  const insert = db.prepare('INSERT OR IGNORE INTO folders (name) VALUES (?)')
  defaultFolderNames.forEach(name => insert.run(name))
}
if (!folderCount) {
  ensureDefaultFolders()
  const folderId = db.prepare('SELECT id FROM folders WHERE name = ?').get('Sedang dibaca').id
  db.prepare('INSERT INTO books (title, author, folder_id, progress, color) VALUES (?, ?, ?, ?, ?)').run('The Creative Act', 'Rick Rubin', folderId, 68, 'coral')
  const doneId = db.prepare('SELECT id FROM folders WHERE name = ?').get('Selesai dibaca').id
  db.prepare('INSERT INTO books (title, author, folder_id, progress, color) VALUES (?, ?, ?, ?, ?)').run('Atomic Habits', 'James Clear', doneId, 100, 'sage')
  const wantId = db.prepare('SELECT id FROM folders WHERE name = ?').get('Ingin dibaca').id
  db.prepare('INSERT INTO books (title, author, folder_id, progress, color) VALUES (?, ?, ?, ?, ?)').run('The Midnight Library', 'Matt Haig', wantId, 0, 'ink')
}
const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
const upload = multer({ dest: uploadDir, limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf') })
const bookSelect = `SELECT books.id, books.title, books.author, folders.name AS folder, books.progress, books.color, books.cover_data AS coverData, books.file_name AS fileName, CASE WHEN books.file_path IS NOT NULL THEN '/api/books/' || books.id || '/file' ELSE NULL END AS fileUrl FROM books JOIN folders ON folders.id = books.folder_id`
const getBook = id => db.prepare(`${bookSelect} WHERE books.id = ?`).get(id)
const publicUser = user => ({ id: user.id, name: user.name, role: user.role, avatar: user.avatar })
const getToken = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
const supabaseUser = async token => {
  if (!supabaseEnabled || !token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null
  const { data: profile } = await supabaseAdmin.from('profiles').select('name, role, avatar').eq('id', data.user.id).maybeSingle()
  return { id: data.user.id, name: profile?.name || data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'Pembaca', role: profile?.role || 'Pembaca aktif', avatar: profile?.avatar || 'BK' }
}

app.get('/api/bootstrap', (_req, res) => { ensureDefaultFolders(); res.json({ folders: db.prepare('SELECT name FROM folders ORDER BY id').all().map(row => row.name), books: db.prepare(`${bookSelect} ORDER BY books.created_at DESC`).all(), words: db.prepare('SELECT id, word, translation, context, saved_at AS savedAt FROM words ORDER BY saved_at DESC').all() }) })
app.post('/api/auth/register', async (req, res) => { const name = String(req.body.name || '').trim(); const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || ''); if (!name || !email || password.length < 6) return res.status(400).json({ error: 'Nama, email, dan password minimal 6 karakter wajib diisi' }); if (supabaseEnabled) { const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } }); if (error) return res.status(error.status || 409).json({ error: error.message }); const avatar = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); await supabaseAdmin.from('profiles').upsert({ id: data.user.id, name, role: 'Pembaca aktif', avatar }); const { data: session, error: sessionError } = await supabaseAuth.auth.signInWithPassword({ email, password }); if (sessionError) return res.status(201).json({ token: null, user: { id: data.user.id, name, role: 'Pembaca aktif', avatar }, message: 'Akun dibuat. Silakan login.' }); return res.status(201).json({ token: session.session.access_token, user: { id: data.user.id, name, role: 'Pembaca aktif', avatar } }); } try { const avatar = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(); const result = db.prepare('INSERT INTO auth_users (name, email, password_hash, role, avatar) VALUES (?, ?, ?, ?, ?)').run(name, email, hashPassword(password), 'Pembaca aktif', avatar); const token = crypto.randomBytes(32).toString('hex'); db.prepare('INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)').run(token, result.lastInsertRowid); res.status(201).json({ token, user: publicUser({ id: result.lastInsertRowid, name, role: 'Pembaca aktif', avatar }) }) } catch { res.status(409).json({ error: 'Email sudah terdaftar' }) } })
app.post('/api/auth/login', async (req, res) => { const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || ''); if (supabaseEnabled) { const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password }); if (error || !data.user || !data.session) return res.status(401).json({ error: error?.message || 'Email atau password salah' }); const user = await supabaseUser(data.session.access_token); return res.json({ token: data.session.access_token, user }); } const user = db.prepare('SELECT * FROM auth_users WHERE email = ?').get(email); if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Email atau password salah' }); const token = crypto.randomBytes(32).toString('hex'); db.prepare('INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)').run(token, user.id); res.json({ token, user: publicUser(user) }) })
app.get('/api/auth/me', async (req, res) => { const token = getToken(req); const remoteUser = await supabaseUser(token); if (remoteUser) return res.json(remoteUser); const session = db.prepare('SELECT users.* FROM auth_tokens JOIN users ON users.id = auth_tokens.user_id WHERE auth_tokens.token = ?').get(token); if (!session) return res.status(401).json({ error: 'Sesi tidak valid' }); res.json(publicUser(session)) })
app.post('/api/auth/logout', async (req, res) => { const token = getToken(req); if (supabaseEnabled && token) await supabaseAdmin.auth.admin.signOut(token); db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token); res.sendStatus(204) })
app.get('/api/user', (_req, res) => res.json(db.prepare('SELECT id, name, role, avatar FROM users WHERE id = 1').get()))
app.put('/api/user', (req, res) => { const name = String(req.body.name || '').trim(); const role = String(req.body.role || 'Pembaca aktif').trim(); const avatar = String(req.body.avatar || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)).trim().toUpperCase(); if (!name) return res.status(400).json({ error: 'Nama wajib diisi' }); db.prepare('UPDATE users SET name = ?, role = ?, avatar = ? WHERE id = 1').run(name, role, avatar); res.json(db.prepare('SELECT id, name, role, avatar FROM users WHERE id = 1').get()) })
app.post('/api/folders', (req, res) => { const name = String(req.body.name || '').trim(); if (!name) return res.status(400).json({ error: 'Nama folder wajib diisi' }); try { const result = db.prepare('INSERT INTO folders (name) VALUES (?)').run(name); res.status(201).json({ id: result.lastInsertRowid, name }) } catch { res.status(409).json({ error: 'Folder sudah ada' }) } })
app.put('/api/folders/:name', (req, res) => { const next = String(req.body.name || '').trim(); if (!next) return res.status(400).json({ error: 'Nama folder wajib diisi' }); const result = db.prepare('UPDATE folders SET name = ? WHERE name = ?').run(next, req.params.name); if (!result.changes) return res.sendStatus(404); res.json({ name: next }) })
app.delete('/api/folders/:name', (req, res) => { const folder = db.prepare('SELECT id FROM folders WHERE name = ?').get(req.params.name); if (!folder) return res.sendStatus(404); const count = db.prepare('SELECT COUNT(*) AS count FROM books WHERE folder_id = ?').get(folder.id).count; if (count) return res.status(409).json({ error: 'Folder masih berisi buku' }); db.prepare('DELETE FROM folders WHERE id = ?').run(folder.id); res.sendStatus(204) })
app.post('/api/books', upload.single('file'), (req, res) => { const title = String(req.body.title || req.file?.originalname?.replace(/\.pdf$/i, '') || 'Buku baru'); const author = String(req.body.author || 'Impor baru'); const folderName = String(req.body.folder || 'Sedang dibaca'); const folder = db.prepare('SELECT id FROM folders WHERE name = ?').get(folderName); if (!folder) return res.status(400).json({ error: 'Folder tidak ditemukan' }); const result = db.prepare('INSERT INTO books (title, author, folder_id, progress, color, file_name, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)').run(title, author, folder.id, 0, String(req.body.color || 'coral'), req.file?.originalname || null, req.file?.path || null); res.status(201).json(getBook(result.lastInsertRowid)) })
app.put('/api/books/:id', (req, res) => { const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id); if (!book) return res.sendStatus(404); const folder = req.body.folder ? db.prepare('SELECT id FROM folders WHERE name = ?').get(req.body.folder) : { id: book.folder_id }; if (!folder) return res.status(400).json({ error: 'Folder tidak ditemukan' }); db.prepare('UPDATE books SET title = ?, author = ?, folder_id = ?, progress = ?, color = ?, cover_data = ? WHERE id = ?').run(req.body.title ?? book.title, req.body.author ?? book.author, folder.id, req.body.progress ?? book.progress, req.body.color ?? book.color, req.body.coverData ?? book.cover_data, book.id); res.json(getBook(book.id)) })
app.delete('/api/books/:id', (req, res) => { const book = db.prepare('SELECT file_path FROM books WHERE id = ?').get(req.params.id); if (!book) return res.sendStatus(404); if (book.file_path) fs.rmSync(book.file_path, { force: true }); db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id); res.sendStatus(204) })
app.get('/api/books/:id/file', (req, res) => { const book = db.prepare('SELECT file_path FROM books WHERE id = ?').get(req.params.id); if (!book?.file_path || !fs.existsSync(book.file_path)) return res.sendStatus(404); res.type('application/pdf').set('Content-Disposition', 'inline').sendFile(path.resolve(book.file_path)) })
app.post('/api/words', (req, res) => { const word = String(req.body.word || '').trim().toLowerCase(); const translation = String(req.body.translation || '').trim(); if (!word || !translation) return res.status(400).json({ error: 'Kata dan terjemahan wajib diisi' }); db.prepare('INSERT INTO words (word, translation, context) VALUES (?, ?, ?) ON CONFLICT(word) DO UPDATE SET translation = excluded.translation, context = excluded.context').run(word, translation, String(req.body.context || '')); res.status(201).json(db.prepare('SELECT id, word, translation, context, saved_at AS savedAt FROM words WHERE word = ?').get(word)) })
app.put('/api/words/:id', (req, res) => { db.prepare('UPDATE words SET word = ?, translation = ?, context = ? WHERE id = ?').run(req.body.word, req.body.translation, req.body.context || '', req.params.id); res.json(db.prepare('SELECT id, word, translation, context, saved_at AS savedAt FROM words WHERE id = ?').get(req.params.id)) })
app.delete('/api/words/:id', (req, res) => { db.prepare('DELETE FROM words WHERE id = ?').run(req.params.id); res.sendStatus(204) })
app.post('/api/translate', async (req, res) => {
  const word = String(req.body.word || '').trim().toLowerCase()
  if (!word) return res.status(400).json({ error: 'Kata wajib diisi' })
  const fallback = { creative: 'kreatif', attention: 'perhatian', practice: 'latihan', curious: 'penasaran', focus: 'fokus', idea: 'gagasan', research: 'penelitian', open: 'terbuka', access: 'akses', producing: 'menghasilkan' }
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|id`)
    const data = await response.json()
    const translation = String(data?.responseData?.translatedText || fallback[word] || '').trim()
    if (!translation) return res.status(502).json({ error: 'Terjemahan tidak ditemukan' })
    res.json({ word, translation })
  } catch {
    const translation = fallback[word]
    if (!translation) return res.status(502).json({ error: 'Layanan terjemahan tidak tersedia' })
    res.json({ word, translation })
  }
})
app.post('/api/shares', (req, res) => { const result = db.prepare('INSERT INTO shares (book_id, quote) VALUES (?, ?)').run(req.body.bookId || null, String(req.body.quote || '')); res.status(201).json({ id: result.lastInsertRowid }) })
app.get('/api/health', (_req, res) => res.json({ ok: true, database: supabaseEnabled ? 'supabase' : 'sqlite', ...(supabaseEnabled ? { supabase: true } : {}) }))
if (require.main === module) {
  process.on('SIGTERM', () => { db.close(); process.exit(0) })
  process.on('SIGINT', () => { db.close(); process.exit(0) })
  app.listen(process.env.PORT || 3001, () => console.log(`BacaKuy API running on http://localhost:${process.env.PORT || 3001}`))
}

module.exports = { app, db }
