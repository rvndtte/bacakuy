import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  BookOpenText,
  Check,
  ChevronRight,
  CirclePlus,
  Folder,
  Heart,
  Home,
  Languages,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Upload,
  X,
  Play,
  Trash2,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./App.css";
import { api, type ApiBook, type ApiUser, type ApiWord } from "./api";

type Book = ApiBook;
type Word = ApiWord;
const initialBooks: Book[] = [
  {
    id: 1,
    title: "The Creative Act",
    author: "Rick Rubin",
    folder: "Sedang dibaca",
    progress: 68,
    color: "coral",
  },
  {
    id: 2,
    title: "Atomic Habits",
    author: "James Clear",
    folder: "Selesai dibaca",
    progress: 100,
    color: "sage",
  },
  {
    id: 3,
    title: "The Midnight Library",
    author: "Matt Haig",
    folder: "Ingin dibaca",
    progress: 0,
    color: "ink",
  },
];
const translations: Record<string, string> = {
  creative: "kreatif",
  attention: "perhatian",
  practice: "latihan",
  curious: "penasaran",
  focus: "fokus",
  idea: "gagasan",
};

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function PdfReader({ src, onWord, onQuote }: { src: string; onWord: (word: string) => void; onQuote: (quote: string) => void }) {
  const readerRef = useRef<HTMLDivElement>(null);
  const onWordRef = useRef(onWord);
  const onQuoteRef = useRef(onQuote);
  const [error, setError] = useState("");

  useEffect(() => {
    onWordRef.current = onWord;
    onQuoteRef.current = onQuote;
  }, [onQuote, onWord]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
    const renderPdf = async () => {
      if (!readerRef.current) return;
      readerRef.current.replaceChildren();
      setError("");
      try {
        loadingTask = pdfjsLib.getDocument({ url: src });
        const pdf = await loadingTask.promise;
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled || !readerRef.current) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const pageElement = document.createElement("div");
          pageElement.className = "pdf-page";
          pageElement.style.width = `${viewport.width}px`;
          pageElement.style.height = `${viewport.height}px`;
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          pageElement.append(canvas);
          const textLayerElement = document.createElement("div");
          textLayerElement.className = "textLayer";
          pageElement.append(textLayerElement);
          readerRef.current.append(pageElement);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          const textContent = await page.getTextContent();
          const textLayer = new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerElement, viewport });
          await textLayer.render();
          textLayer.textDivs.forEach(textDiv => {
            const clearPreviousSelection = () => window.getSelection()?.removeAllRanges();
            const handleTextClick = (event: Event) => {
              const mouseEvent = event as MouseEvent;
              const textNode = textDiv.firstChild;
              const text = textDiv.textContent || "";
              const compactText = text.replace(/\s+/g, "");
              if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
              const selection = window.getSelection();
              const hasManualSelection = selection && !selection.isCollapsed && (textDiv.contains(selection.anchorNode) || textDiv.contains(selection.focusNode));
              if (hasManualSelection && selection) {
                const selectedWord = selection.toString().replace(/\s+/g, " ").trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
                if (selectedWord) onWordRef.current(selectedWord);
                return;
              }
              const spacedSingleWord = /^(?:[A-Za-z]\s+)+[A-Za-z]$/.test(text.trim());
              const wordPattern = /[A-Za-z]+(?:[-'][A-Za-z]+)*/g;
              let match: RegExpExecArray | null;
              while ((match = wordPattern.exec(text))) {
                const wordRange = document.createRange();
                wordRange.setStart(textNode, match.index);
                wordRange.setEnd(textNode, match.index + match[0].length);
                const hit = Array.from(wordRange.getClientRects()).some(rect => mouseEvent.clientX >= rect.left && mouseEvent.clientX <= rect.right && mouseEvent.clientY >= rect.top && mouseEvent.clientY <= rect.bottom);
                if (hit) {
                  const selectedRange = document.createRange();
                  selectedRange.setStart(textNode, spacedSingleWord ? 0 : match.index);
                  selectedRange.setEnd(textNode, spacedSingleWord ? text.length : match.index + match[0].length);
                  selection?.removeAllRanges();
                  selection?.addRange(selectedRange);
                  onWordRef.current(spacedSingleWord ? compactText : match[0]);
                  break;
                }
              }
            };
            textDiv.addEventListener("pointerdown", clearPreviousSelection);
            textDiv.addEventListener("click", handleTextClick);
          });
        }
      } catch (renderError) {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : "PDF gagal dibaca");
      }
    };
    void renderPdf();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [src]);

  const captureQuote = () => {
    const selection = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
    if (selection && selection.split(" ").length >= 2) onQuoteRef.current(selection);
  };
  return <div className="pdf-reader" ref={readerRef} onMouseUp={captureQuote}>{error && <div className="pdf-error">PDF tidak bisa dirender: {error}</div>}</div>;
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: ApiUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("demo@bacakuy.id");
  const [password, setPassword] = useState("bacakuy123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setLoading(true); setError(""); try { const user = mode === "login" ? await api.login(email, password) : await api.register(name, email, password); onAuthenticated(user); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Autentikasi gagal"); } finally { setLoading(false); } };
  return <main className="auth-page"><section className="auth-art"><div className="auth-logo"><span className="brand-mark">bk</span><span>BacaKuy</span></div><div className="auth-art-copy"><span className="eyebrow">YOUR QUIET READING ROOM</span><h1>Temukan ruang<br /><em>untuk membaca.</em></h1><p>Simpan buku, tangkap ide, dan biarkan setiap halaman tinggal lebih lama.</p></div><div className="auth-paper"><BookOpen size={22} /><span>read slowly<br /><strong>remember deeply</strong></span></div></section><section className="auth-panel"><div className="auth-panel-inner"><span className="eyebrow">SELAMAT DATANG DI BACAKUY</span><h2>{mode === "login" ? "Kembali ke ruang bacamu." : "Buat ruang bacamu."}</h2><p className="auth-subtitle">{mode === "login" ? "Lanjutkan perjalanan membaca yang sempat kamu tinggalkan." : "Mulai menyimpan buku dan menemukan ide baru."}</p><div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Masuk</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Daftar</button></div><form onSubmit={submit}>{mode === "register" && <label className="modal-label">Nama<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama kamu" required /></label>}<label className="modal-label">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com" required /></label><label className="modal-label">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 6 karakter" minLength={6} required /></label>{error && <p className="auth-error">{error}</p>}<button className="primary auth-submit" disabled={loading}>{loading ? "Memproses..." : mode === "login" ? "Masuk ke BacaKuy" : "Buat akun"}</button></form>{mode === "login" && <p className="demo-hint">Demo: `demo@bacakuy.id` · `bacakuy123`</p>}</div></section></main>;
}

function App() {
  const [authUser, setAuthUser] = useState<ApiUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("Beranda");
  const [books, setBooks] = useState<Book[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [folders, setFolders] = useState([
    "Sedang dibaca",
    "Selesai dibaca",
    "Ingin dibaca",
  ]);
  const [apiError, setApiError] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showFolder, setShowFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [showBookEdit, setShowBookEdit] = useState(false);
  const [showUserEdit, setShowUserEdit] = useState(false);
  const [importFolder, setImportFolder] = useState("Sedang dibaca");
  const [showShare, setShowShare] = useState(false);
  const [shareBookId, setShareBookId] = useState<number | null>(null);
  const [shareQuote, setShareQuote] = useState("");
  const [shareMode, setShareMode] = useState<"current" | "quote">("quote");
  const [shareStatus, setShareStatus] = useState("");
  const [selectedQuote, setSelectedQuote] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [user, setUser] = useState<ApiUser>({ id: 1, name: "Ravena Aditya", role: "Pembaca aktif", avatar: "RA" });
  const [showWord, setShowWord] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [search, setSearch] = useState("");
  const [ocr, setOcr] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { api.me().then((currentUser) => { setAuthUser(currentUser); setUser(currentUser); }).catch(() => undefined).finally(() => setAuthLoading(false)); }, []);
  useEffect(() => {
    api
      .bootstrap()
      .then((data) => {
        setBooks(data.books);
        setWords(data.words);
        setFolders(data.folders);
        setApiError("");
      })
      .catch(() => {
        setBooks(initialBooks);
        setApiError("Backend belum aktif, menampilkan data contoh.");
      });
  }, []);
  useEffect(() => { if (authUser) api.getUser().then(setUser).catch(() => undefined); }, [authUser]);
  useEffect(() => {
    if (showWord && !selectedWord) setShowWord(false);
  }, [showWord, selectedWord]);
  useEffect(() => { setSelectedQuote(""); setQuoteError(""); }, [selectedBook?.id]);
  useEffect(() => {
    const reader = document.querySelector(".sample-reader");
    if (!reader || selectedBook?.fileUrl) return;
    const handleReaderClick = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const range = document.caretRangeFromPoint?.(
        mouseEvent.clientX,
        mouseEvent.clientY,
      );
      if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return;
      const text = range.startContainer.textContent || "";
      const before = text.slice(0, range.startOffset);
      const after = text.slice(range.startOffset);
      const word = `${before.match(/[A-Za-z]+$/)?.[0] || ""}${after.match(/^[A-Za-z]+/)?.[0] || ""}`;
      if (word) openWord(word);
    };
    reader.addEventListener("click", handleReaderClick);
    return () => reader.removeEventListener("click", handleReaderClick);
  }, [selectedBook]);
  const visibleBooks = useMemo(
    () =>
      books.filter((book) =>
        book.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [books, search],
  );
  const currentCard = words[flashcardIndex % Math.max(words.length, 1)];
  const importBook = async (file: File) => {
    try {
      const newBook = await api.importBook(file, importFolder);
      setBooks((current) => [newBook, ...current]);
      setShowImport(false);
      setSelectedBook(newBook);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Import gagal");
    }
  };
  const createFolder = async (name: string) => {
    try {
      const created = await api.createFolder(name);
      setFolders((current) => [...current, created.name]);
      setShowFolder(false);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Folder gagal dibuat");
    }
  };
  const renameFolder = async (name: string, nextName: string) => {
    const renamed = await api.renameFolder(name, nextName);
    setFolders((current) => current.map((folder) => folder === name ? renamed.name : folder));
    setBooks((current) => current.map((book) => book.folder === name ? { ...book, folder: renamed.name } : book));
    setEditingFolder(null);
  };
  const deleteFolder = async (name: string) => {
    try {
      await api.deleteFolder(name);
      setFolders((current) => current.filter((folder) => folder !== name));
      if (activeNav === name) setActiveNav("Beranda");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Folder gagal dihapus";
      setApiError(message);
      window.alert(message);
    }
  };
  const openShare = (bookId: number | null, quote: string, mode: "current" | "quote" = "quote") => { setShareBookId(bookId); setShareQuote(quote); setShareMode(mode); setShareStatus(""); setShowShare(true); };
  const handleQuoteSelection = (quote: string) => {
    const sentenceCount = (quote.match(/[.!?]+(?=\s|$)/g) || []).length || 1;
    if (quote.length > 280 || sentenceCount > 3) { setSelectedQuote(""); setQuoteError("Kutipan maksimal 3 kalimat atau 280 karakter."); return; }
    setQuoteError(""); setSelectedQuote(quote);
  };
  const saveUser = async (nextUser: ApiUser) => { try { const saved = await api.updateUser(nextUser); setUser(saved); setShowUserEdit(false); } catch (error) { setApiError(error instanceof Error ? error.message : "Profil gagal diperbarui"); } };
  const publishShare = async () => { try { await api.createShare(shareBookId, shareQuote); if (navigator.share) { await navigator.share({ title: "BacaKuy", text: shareQuote }); } setShareStatus("Berhasil disimpan dan dibagikan ke story."); } catch (error) { setShareStatus(error instanceof Error ? error.message : "Story gagal dibagikan"); } };
  const sharedBook = books.find((book) => book.id === shareBookId);
  if (authLoading) return <div className="auth-loading"><span className="brand-mark">bk</span><p>Menyiapkan ruang baca...</p></div>;
  if (!authUser) return <LoginScreen onAuthenticated={(currentUser) => { setAuthUser(currentUser); setUser(currentUser); }} />;
  const updateBook = async (book: Book) => {
    try {
      const saved = await api.updateBook(book);
      setBooks((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelectedBook(saved);
      setShowBookEdit(false);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Buku gagal diperbarui");
    }
  };
  const deleteBook = async (book: Book) => {
    if (!window.confirm(`Hapus buku "${book.title}"?`)) return;
    try {
      await api.deleteBook(book.id);
      setBooks((current) => current.filter((item) => item.id !== book.id));
      setSelectedBook(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Buku gagal dihapus");
    }
  };
  const openWord = async (word: string) => {
    const selectedText = word.length < 80 ? word : window.getSelection()?.toString().trim() || word;
    const clean = selectedText.toLowerCase().replace(/[^a-z]/g, "");
    if (!clean || clean.length < 3) return;
    setSelectedWord({
      id: 0,
      word: clean,
      translation: "Menerjemahkan...",
      context: "Klik kata di halaman untuk menyimpannya ke bank kata.",
      savedAt: "Baru saja",
    });
    setShowWord(true);
    try {
      const translated = await api.translateWord(clean);
      setSelectedWord((current) => current?.word === clean ? { ...current, translation: translated.translation } : current);
    } catch {
      setSelectedWord((current) => current?.word === clean ? { ...current, translation: translations[clean] || "Terjemahan tidak tersedia" } : current);
    }
  };
  const saveWord = async () => {
    if (selectedWord) {
      try {
        const saved = await api.saveWord(selectedWord);
        setWords((current) => [
          saved,
          ...current.filter((word) => word.word !== saved.word),
        ]);
        setShowWord(false);
      } catch (error) {
        setApiError(
          error instanceof Error ? error.message : "Kata gagal disimpan",
        );
      }
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">bk</span>
          <span>BacaKuy</span>
        </div>
        <nav>
          {[
            ["Beranda", Home],
            ["Perpustakaan", Library],
            ["Bank kata", Languages],
          ].map(([label, Icon]) => (
            <button
              key={label as string}
              className={activeNav === label ? "nav-item active" : "nav-item"}
              onClick={() => setActiveNav(label as string)}
            >
              <Icon size={18} />
              {label as string}
              {label === "Bank kata" && words.length > 0 && (
                <b>{words.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="folder-heading">
          <span>FOLDER</span>
          <button
            aria-label="Tambah folder"
            onClick={() => setShowFolder(true)}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="folder-list">
          {folders.map((folder) => (
            <div className="folder-row" key={folder}>
              <button onClick={() => { setActiveNav(folder); setImportFolder(folder); }}><Folder size={16} />{folder}<span>{books.filter((book) => book.folder === folder).length}</span></button>
              <div className="folder-actions"><button aria-label={`Rename ${folder}`} onClick={() => setEditingFolder(folder)}><Pencil size={12} /></button><button aria-label={`Hapus ${folder}`} onClick={() => deleteFolder(folder)}><Trash2 size={12} /></button></div>
            </div>
          ))}
        </div>
        <button className="settings">
          <Settings2 size={18} />
          Pengaturan
        </button>
        <button className="profile" onClick={() => setShowUserEdit(true)}>
          <div className="avatar">{user.avatar}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
          <MoreHorizontal size={17} />
        </button>
      </aside>
      <main className="main-content">
        {apiError && <div className="api-banner">{apiError}</div>}
        <header className="topbar">
          <div className="breadcrumb">
            Ruang baca <ChevronRight size={14} /> <strong>{activeNav}</strong>
          </div>
          <div className="top-actions">
            <label className="search">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari buku..."
              />
            </label>
            <button className="icon-button" aria-label="Favorit">
              <Heart size={18} />
            </button>
            <div className="mini-avatar">RA</div>
          </div>
        </header>
        {activeNav === "Bank kata" ? (
          <WordBank
            words={words}
            onFlashcard={() => setActiveNav("Flashcard")}
          />
        ) : activeNav === "Flashcard" ? (
          <Flashcards
            words={words}
            currentCard={currentCard}
            showAnswer={showAnswer}
            setShowAnswer={setShowAnswer}
            flashcardIndex={flashcardIndex}
            setFlashcardIndex={setFlashcardIndex}
            onBack={() => setActiveNav("Bank kata")}
            onQuiz={() => setActiveNav("Kuis")}
          />
        ) : activeNav === "Kuis" ? (
          <MatchingQuiz words={words} onBack={() => setActiveNav("Flashcard")} />
        ) : activeNav === "Perpustakaan" || folders.includes(activeNav) ? (
          <LibraryView books={books} folder={folders.includes(activeNav) ? activeNav : undefined} onOpen={setSelectedBook} onImport={() => { if (folders.includes(activeNav)) setImportFolder(activeNav); setShowImport(true); }} />
        ) : (
          <>
            <section className="welcome">
              <div>
                <span className="eyebrow">KAMIS, 18 SEPTEMBER 2026</span>
                <h1>
                  Selamat membaca,
                  <br />
                  <em>Raven.</em>
                </h1>
                <p>
                  Lanjutkan satu halaman lagi. Ide bagus sering menunggu di
                  sana.
                </p>
              </div>
              <div className="reading-streak">
                <span>STREAK MEMBACA</span>
                <strong>
                  07 <small>hari</small>
                </strong>
                <div className="streak-dots">
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <i key={day} className="filled" />
                  ))}
                </div>
              </div>
            </section>
            <section className="section-head">
              <div>
                <h2>Lanjutkan membaca</h2>
                <p>Terakhir dibuka 12 menit lalu</p>
              </div>
              <button
                className="text-button"
                onClick={() => setActiveNav("Perpustakaan")}
              >
                Lihat semua <ChevronRight size={16} />
              </button>
            </section>
            <section className="book-row">
              {visibleBooks
                .filter((book) => book.progress > 0 && book.progress < 100)
                .map((book) => (
                  <BookCard
                    book={book}
                    key={book.id}
                    onOpen={setSelectedBook}
                  />
                ))}
              <button className="add-book" onClick={() => setShowImport(true)}>
                <CirclePlus size={23} />
                <span>Tambah buku</span>
                <small>PDF atau scan buku</small>
              </button>
            </section>
            <section className="lower-grid">
              <div className="library-section">
                <div className="section-head">
                  <div>
                    <h2>Perpustakaanmu</h2>
                    <p>{books.length} buku tersimpan</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setActiveNav("Perpustakaan")}
                  >
                    Kelola <ChevronRight size={16} />
                  </button>
                </div>
                <div className="library-list">
                  {books.slice(0, 3).map((book) => (
                    <button
                      className="library-item"
                      key={book.id}
                      onClick={() => setSelectedBook(book)}
                    >
                      <div className={`mini-cover ${book.color}`}>
                        <BookOpen size={20} />
                      </div>
                      <span>
                        <strong>{book.title}</strong>
                        <small>{book.author}</small>
                      </span>
                      <span className="list-progress">{book.progress}%</span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="quote-panel">
                <div className="quote-top">
                  <span>KUTIPAN HARI INI</span>
                  <Share2 size={17} onClick={() => openShare(books.find((book) => book.title === "The Creative Act")?.id || null, "The act of creating is not a search for an answer, but a way of asking a better question.")} />
                </div>
                <blockquote>
                  “The act of creating is not a search for an answer, but a way
                  of asking a better question.”
                </blockquote>
                <p>— The Creative Act, Rick Rubin</p>
                <button
                  className="quote-share"
                  onClick={() => openShare(books.find((book) => book.title === "The Creative Act")?.id || null, "The act of creating is not a search for an answer, but a way of asking a better question.")}
                >
                  Bagikan ke story <Share2 size={15} />
                </button>
              </div>
            </section>
          </>
        )}
      </main>
      {selectedBook && (
        <div className="reader-overlay">
          <header className="reader-top">
            <button className="back-link" onClick={() => setSelectedBook(null)}>
              <ArrowLeft size={17} />
              Kembali
            </button>
            <div>
              <strong>{selectedBook.title}</strong>
              <small>{selectedBook.author}</small>
            </div>
            <div className="reader-actions">
              <button className="icon-button" onClick={() => setShowBookEdit(true)} aria-label="Edit buku"><Pencil size={18} /></button>
              <button className="icon-button danger" onClick={() => deleteBook(selectedBook)} aria-label="Hapus buku"><Trash2 size={18} /></button>
              <button
                className="icon-button"
                onClick={() => openShare(selectedBook.id, `Sedang membaca: ${selectedBook.title}`, "current")}
                aria-label="Bagikan"
              >
                <Share2 size={18} />
              </button>
              <button
                className="primary small"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={15} />
                Impor PDF
              </button>
            </div>
          </header>
          <div className="reader-body">
            <aside className="reader-tools">
              <button className="tool-active">
                <BookOpenText size={18} />
                Baca
              </button>
              <button
                onClick={() => setOcr(!ocr)}
                className={ocr ? "tool-active" : ""}
              >
                <Sparkles size={18} />
                OCR {ocr && <Check size={13} />}
              </button>
              <button onClick={() => setActiveNav("Bank kata")}>
                <Languages size={18} />
                Kata
              </button>
            </aside>
            <div className="pdf-stage">
              {selectedBook.fileUrl ? (
                <PdfReader src={selectedBook.fileUrl} onWord={openWord} onQuote={handleQuoteSelection} />
              ) : (
                <div
                  className="sample-reader"
                  onDoubleClick={(e) =>
                    openWord((e.target as HTMLElement).innerText.split(" ")[0])
                  }
                >
                  <div className="paper">
                    <span className="book-chapter">CHAPTER 04</span>
                    <h2>The power of attention</h2>
                    <p>
                      Attention is the beginning of devotion. The things we
                      choose to notice shape the life we experience.
                    </p>
                    <p>
                      When we practice staying curious, even ordinary moments
                      begin to reveal a new idea. Reading is one way to return
                      to that attention, again and again.
                    </p>
                    <div className="reader-note">
                      <Sparkles size={15} />
                      <span>
                        OCR aktif. Klik dua kali teks untuk menerjemahkan kata.
                      </span>
                    </div>
                    <p>
                      Creative work asks us to stay open long enough for an
                      unexpected connection to appear. That is where the work
                      begins.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <aside className="reader-notes">
              <span className="eyebrow">CATATAN BACA</span>
              <h3>“Stay curious.”</h3>
              <p>Tambahkan highlight dan kata baru saat kamu membaca.</p>
              <button className="outline" onClick={() => setShowWord(true)}>
                <Languages size={15} />
                Terjemahkan kata
              </button>
              {selectedQuote && <button className="quote-share reader-quote-share" onClick={() => openShare(selectedBook.id, selectedQuote, "quote")}><Share2 size={15} />Bagikan kutipan terpilih</button>}
              {quoteError && <p className="quote-error">{quoteError}</p>}
            </aside>
          </div>
        </div>
      )}
      {showImport && (
        <Modal title="Tambahkan buku" onClose={() => setShowImport(false)}>
          <div className="upload-zone" onClick={() => fileRef.current?.click()}>
            <Upload size={25} />
            <strong>Upload PDF atau scan buku</strong>
            <span>Drag & drop atau pilih file dari perangkat</span>
            <small>OCR otomatis untuk PDF berbasis gambar</small>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) =>
              e.target.files?.[0] && importBook(e.target.files[0])
            }
          />
          <div className="modal-fields">
            <label>
              Folder tujuan import
              <select value={importFolder} onChange={(event) => setImportFolder(event.target.value)}>
                {folders.map((folder) => <option key={folder}>{folder}</option>)}
              </select>
            </label>
          </div>
        </Modal>
      )}
      {showFolder && (
        <Modal title="Folder baru" onClose={() => setShowFolder(false)}>
          <FolderForm onSubmit={createFolder} submitLabel="Buat folder" />
        </Modal>
      )}
      {editingFolder && <Modal title="Edit folder" onClose={() => setEditingFolder(null)}><FolderForm initialValue={editingFolder} onSubmit={(name) => renameFolder(editingFolder, name)} submitLabel="Simpan perubahan" /></Modal>}
      {showBookEdit && selectedBook && <Modal title="Edit buku" onClose={() => setShowBookEdit(false)}><BookForm book={selectedBook} folders={folders} onSubmit={updateBook} /></Modal>}
      {showUserEdit && <Modal title="Edit profil" onClose={() => setShowUserEdit(false)}><UserForm user={user} onSubmit={saveUser} onLogout={async () => { await api.logout(); setAuthUser(null); setShowUserEdit(false); }} /></Modal>}
      {showWord && (
        <Modal title="Terjemahkan kata" onClose={() => setShowWord(false)}>
          <div className="translate-box">
            <span className="eyebrow">INGGRIS</span>
            <h2>{selectedWord?.word || "Pilih kata dari halaman"}</h2>
            <div className="translate-line">
              <ArrowLeft size={15} />
              <span>INDONESIA</span>
              <strong>{selectedWord?.translation || "Belum ada kata dipilih"}</strong>
            </div>
          </div>
          <button className="primary modal-submit" disabled={!selectedWord || selectedWord.translation === "Menerjemahkan..."} onClick={saveWord}>
            <Plus size={16} />
            Simpan ke bank kata
          </button>
        </Modal>
      )}
      {showShare && (
        <Modal title="Bagikan ke story" onClose={() => setShowShare(false)}>
          <div className="story-preview">
            <div className={`story-cover ${sharedBook?.color || "ink"} ${sharedBook?.coverData ? "has-image" : ""}`} style={sharedBook?.coverData ? { backgroundImage: `url(${sharedBook.coverData})` } : undefined}><span>{sharedBook?.title.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).map((word) => word[0]).join("").slice(0, 3) || "BK"}</span><BookOpen size={18} /></div>
            {shareMode === "current" ? <><h3>{sharedBook?.title || "Buku saat ini"}</h3><small>CURRENT READ</small></> : <><h3>“{shareQuote}”</h3><small>{sharedBook?.title || "Kutipan dari buku"}</small></>}
          </div>
          {shareStatus && <p className="share-status">{shareStatus}</p>}
          <button
            className="primary modal-submit"
            onClick={publishShare}
          >
            <Share2 size={16} />
            Bagikan story
          </button>
        </Modal>
      )}
    </div>
  );
}
function BookCard({
  book,
  onOpen,
}: {
  book: Book;
  onOpen: (book: Book) => void;
}) {
  return (
    <button className="book-card" onClick={() => onOpen(book)}>
      <div className={`book-cover ${book.color} ${book.coverData ? "has-image" : ""}`} style={book.coverData ? { backgroundImage: `url(${book.coverData})` } : undefined}>
        <span>
          {book.title
            .split(" ")
            .map((word) => word[0])
            .join("")
            .slice(0, 3)}
        </span>
        <BookOpen size={19} />
      </div>
      <div className="book-info">
        <strong>{book.title}</strong>
        <small>{book.author}</small>
        <div className="progress-line">
          <i style={{ width: `${book.progress}%` }} />
        </div>
        <span>{book.progress}% selesai</span>
      </div>
    </button>
  );
}
function LibraryView({ books, folder, onOpen, onImport }: { books: Book[]; folder?: string; onOpen: (book: Book) => void; onImport: () => void }) {
  const filtered = folder ? books.filter((book) => book.folder === folder) : books;
  return <section className="library-page"><div className="page-heading"><div><span className="eyebrow">PERPUSTAKAAN</span><h1>{folder || "Semua buku"}</h1><p>{filtered.length} buku tersimpan di sini.</p></div><button className="primary" onClick={onImport}><Upload size={16} />Import PDF</button></div><div className="library-grid">{filtered.map((book) => <BookCard book={book} key={book.id} onOpen={onOpen} />)}{!filtered.length && <div className="empty-state"><BookOpenText size={30} /><h3>Folder masih kosong</h3><p>Import buku untuk mengisinya.</p></div>}</div></section>;
}
function WordBank({
  words,
  onFlashcard,
}: {
  words: Word[];
  onFlashcard: () => void;
}) {
  return (
    <section className="word-bank-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">KOSAKATA PRIBADI</span>
          <h1>Bank kata</h1>
          <p>Kata-kata yang kamu temukan dalam perjalanan membaca.</p>
        </div>
        <button className="primary" onClick={onFlashcard}>
          <Play size={16} />
          Mulai flashcard
        </button>
      </div>
      <div className="word-grid">
        {words.length ? (
          words.map((word) => (
            <article className="word-card" key={word.word}>
              <span className="word-english">{word.word}</span>
              <span className="word-translation">{word.translation}</span>
              <span className="word-context">{word.context}</span>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <Languages size={28} />
            <h3>Belum ada kata</h3>
            <p>Klik kata saat membaca untuk mengisinya.</p>
          </div>
        )}
      </div>
    </section>
  );
}
function Flashcards({
  words,
  currentCard,
  showAnswer,
  setShowAnswer,
  flashcardIndex,
  setFlashcardIndex,
  onBack,
  onQuiz,
}: {
  words: Word[];
  currentCard?: Word;
  showAnswer: boolean;
  setShowAnswer: (value: boolean) => void;
  flashcardIndex: number;
  setFlashcardIndex: (value: number) => void;
  onBack: () => void;
  onQuiz: () => void;
}) {
  return (
    <section className="flashcard-page">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        Kembali ke bank kata
      </button>
      <div className="flashcard-intro">
        <span className="eyebrow">LATIHAN SINGKAT</span>
        <h1>Ingat kembali.</h1>
        <p>Satu kartu kecil setiap hari membuat kosakata tinggal lebih lama.</p>
      </div>
      {currentCard ? (
        <div className="flashcard" onClick={() => setShowAnswer(!showAnswer)}>
          <span className="card-count">
            {flashcardIndex + 1} / {words.length}
          </span>
          <Sparkles size={25} />
          <span className="flash-word">
            {showAnswer ? currentCard.translation : currentCard.word}
          </span>
          <span className="flash-hint">
            {showAnswer
              ? "Klik untuk kembali ke kata"
              : "Klik kartu untuk melihat arti"}
          </span>
        </div>
      ) : (
        <div className="empty-state">
          <BookOpenText size={30} />
          <h3>Bank kata masih kosong</h3>
          <p>Simpan kata dari reader untuk mulai latihan.</p>
        </div>
      )}
      {words.length > 0 && (
        <div className="flash-actions">
          <button
            onClick={() => {
              setFlashcardIndex((flashcardIndex + 1) % words.length);
              setShowAnswer(false);
            }}
          >
            Berikutnya <ChevronRight size={16} />
          </button>
          <button onClick={onQuiz}><Languages size={15} />Kuis matching</button>
        </div>
      )}
    </section>
  );
}

function FolderForm({ initialValue = "", onSubmit, submitLabel }: { initialValue?: string; onSubmit: (name: string) => void; submitLabel: string }) {
  const [name, setName] = useState(initialValue);
  return <><label className="modal-label">Nama folder<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Buku kuliah" /></label><button className="primary modal-submit" disabled={!name.trim()} onClick={() => onSubmit(name.trim())}>{submitLabel}</button></>;
}

function BookForm({ book, folders, onSubmit }: { book: Book; folders: string[]; onSubmit: (book: Book) => void }) {
  const [draft, setDraft] = useState(book);
  const update = (field: keyof Book, value: string | number) => setDraft((current) => ({ ...current, [field]: value }));
  const chooseCover = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setDraft((current) => ({ ...current, coverData: String(reader.result) })); reader.readAsDataURL(file); };
  return <div className="book-form"><label className="modal-label">Nama buku<input value={draft.title} onChange={(event) => update("title", event.target.value)} /></label><label className="modal-label">Penulis<input value={draft.author} onChange={(event) => update("author", event.target.value)} /></label><label className="modal-label">Folder<select value={draft.folder} onChange={(event) => update("folder", event.target.value)}>{folders.map((folder) => <option key={folder}>{folder}</option>)}</select></label><label className="modal-label">Progress <input type="number" min="0" max="100" value={draft.progress} onChange={(event) => update("progress", Number(event.target.value))} /></label><label className="modal-label">Cover image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseCover} /></label><div className="cover-picker"><span>Warna cover</span><div>{["coral", "sage", "ink"].map((color) => <button type="button" aria-label={`Cover ${color}`} className={`cover-swatch ${color} ${draft.color === color ? "selected" : ""}`} key={color} onClick={() => update("color", color)} />)}</div></div><button className="primary modal-submit" disabled={!draft.title.trim()} onClick={() => onSubmit(draft)}>Simpan buku</button></div>;
}

function MatchingQuiz({ words, onBack }: { words: Word[]; onBack: () => void }) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedTranslation, setSelectedTranslation] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [message, setMessage] = useState("Pilih satu kata dan pasangannya.");
  const translations = [...words].sort((a, b) => a.translation.localeCompare(b.translation));
  const chooseWord = (word: string) => { if (matched.includes(word)) return; setSelectedWord(word); checkPair(word, selectedTranslation); };
  const chooseTranslation = (translation: string) => { if (matched.includes(words.find((item) => item.translation === translation)?.word || "")) return; setSelectedTranslation(translation); checkPair(selectedWord, translation); };
  const checkPair = (word: string | null, translation: string | null) => { if (!word || !translation) return; const item = words.find((candidate) => candidate.word === word); if (item?.translation === translation) { setMatched((current) => [...current, word]); setSelectedWord(null); setSelectedTranslation(null); setMessage("Benar. Pasangan berikutnya!"); } else { setMessage("Belum cocok, coba lagi."); setTimeout(() => { setSelectedWord(null); setSelectedTranslation(null); }, 450); } };
  return <section className="quiz-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} />Kembali ke flashcard</button><div className="flashcard-intro"><span className="eyebrow">KUIS KOSAKATA</span><h1>Pasangkan.</h1><p>{matched.length} dari {words.length} pasangan benar. {message}</p></div>{words.length ? <div className="matching-board"><div>{words.map((item) => <button key={item.word} className={matched.includes(item.word) ? "match-tile matched" : selectedWord === item.word ? "match-tile selected" : "match-tile"} onClick={() => chooseWord(item.word)}>{item.word}</button>)}</div><div>{translations.map((item) => <button key={item.translation} className={matched.includes(item.word) ? "match-tile matched" : selectedTranslation === item.translation ? "match-tile selected" : "match-tile"} onClick={() => chooseTranslation(item.translation)}>{item.translation}</button>)}</div></div> : <div className="empty-state"><Languages size={30} /><h3>Bank kata masih kosong</h3><p>Simpan beberapa kata untuk memainkan kuis.</p></div>}{matched.length === words.length && words.length > 0 && <div className="quiz-complete"><Check size={18} /> Semua pasangan benar!</div>}</section>;
}

function UserForm({ user, onSubmit, onLogout }: { user: ApiUser; onSubmit: (user: ApiUser) => void; onLogout: () => Promise<void> }) {
  const [draft, setDraft] = useState(user);
  return <div className="book-form"><label className="modal-label">Nama<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, avatar: event.target.value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() })} /></label><label className="modal-label">Status pembaca<input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} /></label><label className="modal-label">Inisial avatar<input maxLength={2} value={draft.avatar} onChange={(event) => setDraft({ ...draft, avatar: event.target.value.toUpperCase() })} /></label><button className="primary modal-submit" disabled={!draft.name.trim()} onClick={() => onSubmit(draft)}>Simpan profil</button><button type="button" className="logout-button" onClick={onLogout}>Keluar dari akun</button></div>;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default App;
