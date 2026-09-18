import express from 'express'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import { admin as supabaseAdmin, authClient as supabaseAuth, enabled as supabaseEnabled, createUserClient } from '../server/supabase.cjs'

if (!supabaseEnabled) {
  throw new Error('Supabase belum dikonfigurasi: set SUPABASE_URL, SUPABASE_ANON_KEY, dan SUPABASE_SERVICE_ROLE_KEY')
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const getToken = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')

const requireAuth = async (req, res, next) => {
  const token = getToken(req)
  if (!token) return res.status(401).json({ error: 'Sesi tidak valid' })
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Sesi tidak valid' })
  req.user = data.user
  req.token = token
  req.supabase = createUserClient(token)
  next()
}

const getProfile = async authUser => {
  const { data: profile } = await supabaseAdmin.from('profiles').select('name, role, avatar').eq('id', authUser.id).maybeSingle()
  return { id: authUser.id, name: profile?.name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Pembaca', role: profile?.role || 'Pembaca aktif', avatar: profile?.avatar || 'BK' }
}

const defaultFolderNames = ['Sedang dibaca', 'Selesai dibaca', 'Ingin dibaca']
const ensureDefaultFolders = async (supabase, userId) => {
  const { count } = await supabase.from('folders').select('id', { count: 'exact', head: true })
  if (count) return
  await supabase.from('folders').insert(defaultFolderNames.map(name => ({ name, user_id: userId })))
}

const getFolderIdByName = async (supabase, name) => {
  const { data } = await supabase.from('folders').select('id').eq('name', name).maybeSingle()
  return data?.id
}

const bookSelect = 'id, title, author, progress, color, cover_url, file_name, file_path, folders(name)'
const formatBook = (row, fileUrl) => ({
  id: row.id,
  title: row.title,
  author: row.author,
  folder: row.folders?.name,
  progress: row.progress,
  color: row.color,
  coverData: row.cover_url || undefined,
  fileName: row.file_name || undefined,
  fileUrl: fileUrl || undefined,
})
const attachFileUrls = async books => {
  const paths = books.filter(book => book.file_path).map(book => book.file_path)
  const urlMap = {}
  if (paths.length) {
    const { data } = await supabaseAdmin.storage.from('books').createSignedUrls(paths, 3600)
    data?.forEach(item => { if (item.signedUrl) urlMap[item.path] = item.signedUrl })
  }
  return books.map(book => formatBook(book, urlMap[book.file_path]))
}

app.get('/api/bootstrap', requireAuth, async (req, res) => {
  await ensureDefaultFolders(req.supabase, req.user.id)
  const [{ data: folders }, { data: books }, { data: words }] = await Promise.all([
    req.supabase.from('folders').select('name').order('id'),
    req.supabase.from('books').select(bookSelect).order('created_at', { ascending: false }),
    req.supabase.from('words').select('id, word, translation, context, saved_at').order('saved_at', { ascending: false }),
  ])
  const formattedBooks = await attachFileUrls(books || [])
  res.json({
    folders: (folders || []).map(folder => folder.name),
    books: formattedBooks,
    words: (words || []).map(word => ({ id: word.id, word: word.word, translation: word.translation, context: word.context, savedAt: word.saved_at })),
  })
})

app.post('/api/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  if (!name || !email || password.length < 6) return res.status(400).json({ error: 'Nama, email, dan password minimal 6 karakter wajib diisi' })
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
  if (error) return res.status(error.status || 409).json({ error: error.message })
  const avatar = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
  await supabaseAdmin.from('profiles').upsert({ id: data.user.id, name, role: 'Pembaca aktif', avatar })
  const { data: session, error: sessionError } = await supabaseAuth.auth.signInWithPassword({ email, password })
  if (sessionError) return res.status(201).json({ token: null, user: { id: data.user.id, name, role: 'Pembaca aktif', avatar }, message: 'Akun dibuat. Silakan login.' })
  res.status(201).json({ token: session.session.access_token, user: { id: data.user.id, name, role: 'Pembaca aktif', avatar } })
})
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password })
  if (error || !data.user || !data.session) return res.status(401).json({ error: error?.message || 'Email atau password salah' })
  res.json({ token: data.session.access_token, user: await getProfile(data.user) })
})
app.get('/api/auth/me', requireAuth, async (req, res) => res.json(await getProfile(req.user)))
app.post('/api/auth/logout', requireAuth, async (req, res) => { await supabaseAdmin.auth.admin.signOut(req.token); res.sendStatus(204) })

app.get('/api/user', requireAuth, async (req, res) => res.json(await getProfile(req.user)))
app.put('/api/user', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim()
  const role = String(req.body.role || 'Pembaca aktif').trim()
  const avatar = String(req.body.avatar || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)).trim().toUpperCase()
  if (!name) return res.status(400).json({ error: 'Nama wajib diisi' })
  const { data, error } = await req.supabase.from('profiles').upsert({ id: req.user.id, name, role, avatar }).select('name, role, avatar').single()
  if (error) return res.status(400).json({ error: error.message })
  res.json({ id: req.user.id, ...data })
})

app.post('/api/folders', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Nama folder wajib diisi' })
  const { error } = await req.supabase.from('folders').insert({ name, user_id: req.user.id })
  if (error) return res.status(409).json({ error: 'Folder sudah ada' })
  res.status(201).json({ name })
})
app.put('/api/folders/:name', requireAuth, async (req, res) => {
  const next = String(req.body.name || '').trim()
  if (!next) return res.status(400).json({ error: 'Nama folder wajib diisi' })
  const { data, error } = await req.supabase.from('folders').update({ name: next }).eq('name', req.params.name).select('id').maybeSingle()
  if (error || !data) return res.sendStatus(404)
  res.json({ name: next })
})
app.delete('/api/folders/:name', requireAuth, async (req, res) => {
  const { data: folder } = await req.supabase.from('folders').select('id').eq('name', req.params.name).maybeSingle()
  if (!folder) return res.sendStatus(404)
  const { count } = await req.supabase.from('books').select('id', { count: 'exact', head: true }).eq('folder_id', folder.id)
  if (count) return res.status(409).json({ error: 'Folder masih berisi buku' })
  await req.supabase.from('folders').delete().eq('id', folder.id)
  res.sendStatus(204)
})

app.post('/api/books/upload-url', requireAuth, async (req, res) => {
  const path = `${req.user.id}/${randomUUID()}.pdf`
  const { data, error } = await supabaseAdmin.storage.from('books').createSignedUploadUrl(path)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ path: data.path, token: data.token, signedUrl: data.signedUrl })
})
app.post('/api/books', requireAuth, async (req, res) => {
  const folderName = String(req.body.folder || 'Sedang dibaca')
  const folderId = await getFolderIdByName(req.supabase, folderName)
  if (!folderId) return res.status(400).json({ error: 'Folder tidak ditemukan' })
  const title = String(req.body.title || String(req.body.fileName || '').replace(/\.pdf$/i, '') || 'Buku baru')
  const { data, error } = await req.supabase.from('books').insert({
    user_id: req.user.id,
    title,
    author: String(req.body.author || 'Impor baru'),
    folder_id: folderId,
    progress: 0,
    color: String(req.body.color || 'coral'),
    file_name: req.body.fileName || null,
    file_path: req.body.filePath || null,
  }).select(bookSelect).single()
  if (error) return res.status(400).json({ error: error.message })
  const [formatted] = await attachFileUrls([data])
  res.status(201).json(formatted)
})
app.put('/api/books/:id', requireAuth, async (req, res) => {
  const { data: book } = await req.supabase.from('books').select('*').eq('id', req.params.id).maybeSingle()
  if (!book) return res.sendStatus(404)
  let folderId = book.folder_id
  if (req.body.folder) {
    const found = await getFolderIdByName(req.supabase, req.body.folder)
    if (!found) return res.status(400).json({ error: 'Folder tidak ditemukan' })
    folderId = found
  }
  const { data, error } = await req.supabase.from('books').update({
    title: req.body.title ?? book.title,
    author: req.body.author ?? book.author,
    folder_id: folderId,
    progress: req.body.progress ?? book.progress,
    color: req.body.color ?? book.color,
    cover_url: req.body.coverData ?? book.cover_url,
  }).eq('id', book.id).select(bookSelect).single()
  if (error) return res.status(400).json({ error: error.message })
  const [formatted] = await attachFileUrls([data])
  res.json(formatted)
})
app.delete('/api/books/:id', requireAuth, async (req, res) => {
  const { data: book } = await req.supabase.from('books').select('file_path').eq('id', req.params.id).maybeSingle()
  if (!book) return res.sendStatus(404)
  if (book.file_path) await supabaseAdmin.storage.from('books').remove([book.file_path])
  await req.supabase.from('books').delete().eq('id', req.params.id)
  res.sendStatus(204)
})

app.post('/api/words', requireAuth, async (req, res) => {
  const word = String(req.body.word || '').trim().toLowerCase()
  const translation = String(req.body.translation || '').trim()
  if (!word || !translation) return res.status(400).json({ error: 'Kata dan terjemahan wajib diisi' })
  const { data, error } = await req.supabase.from('words')
    .upsert({ user_id: req.user.id, word, translation, context: String(req.body.context || '') }, { onConflict: 'user_id,word' })
    .select('id, word, translation, context, saved_at').single()
  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ id: data.id, word: data.word, translation: data.translation, context: data.context, savedAt: data.saved_at })
})
app.put('/api/words/:id', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('words')
    .update({ word: req.body.word, translation: req.body.translation, context: req.body.context || '' })
    .eq('id', req.params.id).select('id, word, translation, context, saved_at').single()
  if (error) return res.status(400).json({ error: error.message })
  res.json({ id: data.id, word: data.word, translation: data.translation, context: data.context, savedAt: data.saved_at })
})
app.delete('/api/words/:id', requireAuth, async (req, res) => { await req.supabase.from('words').delete().eq('id', req.params.id); res.sendStatus(204) })

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
app.post('/api/shares', requireAuth, async (req, res) => {
  const { data, error } = await req.supabase.from('shares')
    .insert({ user_id: req.user.id, book_id: req.body.bookId || null, quote: String(req.body.quote || '') })
    .select('id').single()
  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json({ id: data.id })
})
app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'supabase' }))

export default app
