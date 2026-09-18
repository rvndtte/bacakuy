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

const storyGradients: Record<string, [string, string]> = {
  coral: ["#f0a48d", "#d9614a"],
  sage: ["#a8c2ac", "#6d8f72"],
  ink: ["#5a6f69", "#29352f"],
};
const loadImageAsync = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});
const wrapCanvasText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
};
const renderStoryImage = async ({ mode, title, author, quote, coverData, color }: { mode: "current" | "quote"; title: string; author: string; quote: string; coverData?: string; color?: string }): Promise<Blob | null> => {
  const width = 1080;
  const height = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const drawGradientBackground = () => {
    const [from, to] = storyGradients[color || "ink"] || storyGradients.ink;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  };
  if (coverData) {
    try {
      const img = await loadImageAsync(coverData);
      const scale = Math.max(width / img.width, height / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      ctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
    } catch {
      drawGradientBackground();
    }
  } else {
    drawGradientBackground();
  }
  const scrim = ctx.createLinearGradient(0, 0, 0, height);
  scrim.addColorStop(0, "rgba(5,9,7,0.3)");
  scrim.addColorStop(0.4, "rgba(5,9,7,0.5)");
  scrim.addColorStop(1, "rgba(4,7,6,0.94)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffd60a";
  ctx.font = "700 32px Arial, sans-serif";
  ctx.fillText(mode === "current" ? "C U R R E N T   R E A D" : "K U T I P A N", 64, 130);

  const authorY = height - 90;
  ctx.fillStyle = "#ffffff";
  if (mode === "current") {
    ctx.font = "500 60px Georgia, serif";
    const lines = wrapCanvasText(ctx, title || "Buku saat ini", width - 128).slice(0, 5);
    const lineHeight = 70;
    const startY = authorY - 56 - (lines.length - 1) * lineHeight;
    lines.forEach((line, index) => ctx.fillText(line, 64, startY + index * lineHeight));
  } else {
    ctx.font = "italic 500 46px Georgia, serif";
    const lines = wrapCanvasText(ctx, `“${quote}”`, width - 128).slice(0, 8);
    const lineHeight = 58;
    const startY = authorY - 56 - (lines.length - 1) * lineHeight;
    lines.forEach((line, index) => ctx.fillText(line, 64, startY + index * lineHeight));
  }
  ctx.font = "400 30px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(author, 64, authorY);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
};

function PdfReader({ src, onWord, onQuote, screenshotMode, onCapture, onProgress, initialProgress }: { src: string; onWord: (word: string) => void; onQuote: (quote: string) => void; screenshotMode: boolean; onCapture: (dataUrl: string) => void; onProgress: (percent: number) => void; initialProgress: number }) {
  const readerRef = useRef<HTMLDivElement>(null);
  const onWordRef = useRef(onWord);
  const onQuoteRef = useRef(onQuote);
  const onCaptureRef = useRef(onCapture);
  const onProgressRef = useRef(onProgress);
  const screenshotModeRef = useRef(screenshotMode);
  const [error, setError] = useState("");

  useEffect(() => {
    onWordRef.current = onWord;
    onQuoteRef.current = onQuote;
    onCaptureRef.current = onCapture;
    onProgressRef.current = onProgress;
    screenshotModeRef.current = screenshotMode;
  }, [onQuote, onWord, onCapture, onProgress, screenshotMode]);

  useEffect(() => {
    const container = readerRef.current;
    if (!container) return;
    let activePage: HTMLElement | null = null;
    let box: HTMLDivElement | null = null;
    let startX = 0;
    let startY = 0;
    const handlePointerDown = (event: PointerEvent) => {
      if (!screenshotModeRef.current) return;
      const page = (event.target as HTMLElement).closest(".pdf-page") as HTMLElement | null;
      if (!page) return;
      const rect = page.getBoundingClientRect();
      startX = event.clientX - rect.left;
      startY = event.clientY - rect.top;
      activePage = page;
      box = document.createElement("div");
      box.className = "capture-box";
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      page.append(box);
      event.preventDefault();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!activePage || !box) return;
      const rect = activePage.getBoundingClientRect();
      const currentX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const currentY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.abs(currentX - startX)}px`;
      box.style.height = `${Math.abs(currentY - startY)}px`;
    };
    const handlePointerUp = () => {
      if (!activePage || !box) { activePage = null; box = null; return; }
      const left = parseFloat(box.style.left);
      const top = parseFloat(box.style.top);
      const width = parseFloat(box.style.width);
      const height = parseFloat(box.style.height);
      const canvas = activePage.querySelector("canvas");
      box.remove();
      if (canvas && width > 8 && height > 8) {
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = width;
        cropCanvas.height = height;
        const ctx = cropCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, left, top, width, height, 0, 0, width, height);
          onCaptureRef.current(cropCanvas.toDataURL("image/png"));
        }
      }
      activePage = null;
      box = null;
    };
    container.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | undefined;
    let detachScroll: (() => void) | undefined;
    const pageElements: HTMLElement[] = [];
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
          pageElement.dataset.page = String(pageNumber);
          pageElement.style.width = `${viewport.width}px`;
          pageElement.style.height = `${viewport.height}px`;
          pageElements.push(pageElement);
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          pageElement.append(canvas);
          const cssScale = viewport.scale * viewport.userUnit;
          const textLayerElement = document.createElement("div");
          textLayerElement.className = "textLayer";
          textLayerElement.style.setProperty("--total-scale-factor", String(cssScale));
          pageElement.append(textLayerElement);
          readerRef.current.append(pageElement);
          const originalWarn = console.warn;
          let hasUndecodedImage = false;
          console.warn = (...args: unknown[]) => {
            if (typeof args[0] === "string" && /Unable to decode image/i.test(args[0])) hasUndecodedImage = true;
            originalWarn(...args);
          };
          try {
            await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          } finally {
            console.warn = originalWarn;
          }
          if (hasUndecodedImage) {
            const notice = document.createElement("div");
            notice.className = "pdf-page-notice";
            notice.textContent = "Sebagian gambar di halaman ini gagal dimuat (format file tidak didukung).";
            pageElement.append(notice);
          }
          const textContent = await page.getTextContent();
          const textLayer = new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerElement, viewport });
          await textLayer.render();
          // pdf.js sizes spans by measuring text on an offscreen canvas, which drifts from the real
          // DOM width (font fallback, min-font-size clamp), so word hit-boxes miss the glyphs.
          const measuredItems: { textDiv: HTMLElement; expectedWidth: number; actualWidth: number }[] = [];
          let textDivIndex = 0;
          for (const item of textContent.items) {
            if (!("str" in item)) continue;
            const textDiv = textLayer.textDivs[textDivIndex];
            textDivIndex += 1;
            if (!textDiv || !item.str || item.width <= 0) continue;
            if (item.transform[1] !== 0 || item.transform[2] !== 0) continue;
            measuredItems.push({ textDiv, expectedWidth: item.width * cssScale, actualWidth: textDiv.getBoundingClientRect().width });
          }
          measuredItems.forEach(({ textDiv, expectedWidth, actualWidth }) => {
            if (actualWidth <= 0) return;
            const currentScaleX = Number(textDiv.style.getPropertyValue("--scale-x")) || 1;
            textDiv.style.setProperty("--scale-x", String(currentScaleX * expectedWidth / actualWidth));
          });
          textLayer.textDivs.forEach(textDiv => {
            const clearPreviousSelection = () => window.getSelection()?.removeAllRanges();
            const handleTextClick = (event: Event) => {
              const mouseEvent = event as MouseEvent;
              const textNode = textDiv.firstChild;
              if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
              const selection = window.getSelection();
              const hasManualSelection = selection && !selection.isCollapsed && (textDiv.contains(selection.anchorNode) || textDiv.contains(selection.focusNode));
              if (hasManualSelection && selection) {
                const selectedWord = selection.toString().replace(/\s+/g, " ").trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
                if (selectedWord && !selectedWord.includes(" ")) onWordRef.current(selectedWord);
                return;
              }
              const caret = document.caretRangeFromPoint?.(mouseEvent.clientX, mouseEvent.clientY);
              if (!caret || caret.startContainer !== textNode) return;
              const text = textNode.textContent || "";
              let start = caret.startOffset;
              let end = caret.startOffset;
              while (start > 0 && /[A-Za-z'-]/.test(text[start - 1])) start -= 1;
              while (end < text.length && /[A-Za-z'-]/.test(text[end])) end += 1;
              const word = text.slice(start, end).replace(/^[-']+|[-']+$/g, "");
              if (!word) return;
              const selectedRange = document.createRange();
              selectedRange.setStart(textNode, start);
              selectedRange.setEnd(textNode, end);
              selection?.removeAllRanges();
              selection?.addRange(selectedRange);
              onWordRef.current(word);
            };
            textDiv.addEventListener("pointerdown", clearPreviousSelection);
            textDiv.addEventListener("click", handleTextClick);
          });
        }
        if (cancelled || !readerRef.current || !pageElements.length) return;
        const scrollContainer = readerRef.current.parentElement;
        if (!scrollContainer) return;
        if (initialProgress > 0) {
          const resumePage = pageElements[Math.min(pageElements.length, Math.max(1, Math.round((initialProgress / 100) * pdf.numPages) || 1)) - 1];
          if (resumePage) {
            // offsetTop is relative to the nearest positioned ancestor, which is
            // .reader-overlay (position: fixed) here, not the scrollable .pdf-stage -
            // so it must be computed relative to the scroll container itself instead.
            const target = resumePage.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
            scrollContainer.scrollTop = target;
          }
        }
        // Track reading progress as how far the user has scrolled through the document,
        // rather than IntersectionObserver thresholds, which can miss updates on fast/short scrolls.
        let ticking = false;
        const reportProgress = () => {
          ticking = false;
          const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
          const percent = maxScroll > 4 ? Math.round((scrollContainer.scrollTop / maxScroll) * 100) : 100;
          onProgressRef.current(Math.min(100, Math.max(0, percent)));
        };
        const handleScroll = () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(reportProgress);
        };
        scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
        reportProgress();
        detachScroll = () => scrollContainer.removeEventListener("scroll", handleScroll);
      } catch (renderError) {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : "PDF gagal dibaca");
      }
    };
    void renderPdf();
    return () => {
      cancelled = true;
      detachScroll?.();
      void loadingTask?.destroy();
    };
  }, [src]);

  const captureQuote = () => {
    if (screenshotMode) return;
    const selection = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
    if (selection && selection.split(" ").length >= 2) onQuoteRef.current(selection);
  };
  return <div className={screenshotMode ? "pdf-reader capture-mode" : "pdf-reader"} ref={readerRef} onMouseUp={captureQuote}>{error && <div className="pdf-error">PDF tidak bisa dirender: {error}</div>}</div>;
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
  const [translateDraft, setTranslateDraft] = useState("");
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrDraft, setOcrDraft] = useState("");
  const [showOcrReview, setShowOcrReview] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showCustomQuote, setShowCustomQuote] = useState(false);
  const [customQuoteDraft, setCustomQuoteDraft] = useState("");
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [search, setSearch] = useState("");
  const [ocr, setOcr] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const progressSaveTimeout = useRef<number | null>(null);
  useEffect(() => { api.me().then((currentUser) => { setAuthUser(currentUser); setUser(currentUser); }).catch(() => undefined).finally(() => setAuthLoading(false)); }, []);
  useEffect(() => {
    const handleUnauthorized = () => setAuthUser(null);
    window.addEventListener("bacakuy:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("bacakuy:unauthorized", handleUnauthorized);
  }, []);
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
  useEffect(() => { setSelectedQuote(""); setQuoteError(""); setScreenshotMode(false); setOcrError(""); }, [selectedBook?.id]);
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
  const sharedBook = books.find((book) => book.id === shareBookId);
  const publishShare = async () => {
    try {
      await api.createShare(shareBookId, shareQuote);
      const blob = await renderStoryImage({
        mode: shareMode,
        title: sharedBook?.title || "Buku saat ini",
        author: shareMode === "current" ? sharedBook?.author || "" : sharedBook?.title || "Kutipan dari buku",
        quote: shareQuote,
        coverData: sharedBook?.coverData,
        color: sharedBook?.color,
      }).catch(() => null);
      const file = blob ? new File([blob], "bacakuy-story.png", { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "BacaKuy", text: shareQuote, files: [file] });
        setShareStatus("Foto story siap dibagikan ke Instagram atau aplikasi lain.");
      } else if (file) {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = "bacakuy-story.png";
        link.click();
        URL.revokeObjectURL(url);
        setShareStatus("Foto story tersimpan ke perangkat. Unggah manual ke Instagram Story.");
      } else if (navigator.share) {
        await navigator.share({ title: "BacaKuy", text: shareQuote });
        setShareStatus("Berhasil disimpan dan dibagikan ke story.");
      } else {
        setShareStatus("Kutipan tersimpan ke riwayat share.");
      }
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : "Story gagal dibagikan");
    }
  };
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
  const translateText = async (rawText: string) => {
    const selectedText = rawText.length < 80 ? rawText : window.getSelection()?.toString().trim() || rawText;
    const clean = selectedText.toLowerCase().trim().replace(/[^a-z' -]/g, "").replace(/\s+/g, " ").trim();
    if (!clean || clean.length < 2) return;
    setTranslateDraft(clean);
    setSelectedWord({
      id: 0,
      word: clean,
      translation: "Menerjemahkan...",
      context: "Klik kata di halaman, atau ketik sendiri kata/frasa untuk diterjemahkan.",
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
  const openWord = (word: string) => { void translateText(word); };
  const handleProgress = (percent: number) => {
    setSelectedBook((current) => current && current.progress !== percent ? { ...current, progress: percent } : current);
    setBooks((current) => current.map((book) => book.id === selectedBook?.id && book.progress !== percent ? { ...book, progress: percent } : book));
    if (!selectedBook || selectedBook.progress === percent) return;
    const bookToSave = { ...selectedBook, progress: percent };
    if (progressSaveTimeout.current) window.clearTimeout(progressSaveTimeout.current);
    progressSaveTimeout.current = window.setTimeout(() => { api.updateBook(bookToSave).catch(() => undefined); }, 1500);
  };
  const toggleScreenshotMode = () => { setScreenshotMode((current) => !current); setOcrError(""); };
  const handleCapture = async (dataUrl: string) => {
    setScreenshotMode(false);
    setOcrLoading(true);
    setOcrError("");
    try {
      const Tesseract = await import("tesseract.js");
      const { data } = await Tesseract.recognize(dataUrl, "eng");
      const text = data.text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
      if (!text) { setOcrError("Tidak ada teks yang terdeteksi, coba pilih area lain."); return; }
      setOcrDraft(text);
      setShowOcrReview(true);
    } catch {
      setOcrError("Deteksi teks gagal. Coba lagi.");
    } finally {
      setOcrLoading(false);
    }
  };
  const useOcrQuote = () => {
    const cleaned = ocrDraft.replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    setShowOcrReview(false);
    openShare(selectedBook?.id ?? null, cleaned, "quote");
  };
  const useCustomQuote = () => {
    const cleaned = customQuoteDraft.replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    setShowCustomQuote(false);
    openShare(selectedBook?.id ?? null, cleaned, "quote");
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
              <button className="notes-toggle" onClick={() => setShowNotes(true)}>
                <Share2 size={18} />
                Catatan
              </button>
            </aside>
            <div className="pdf-stage">
              {selectedBook.fileUrl ? (
                <PdfReader src={selectedBook.fileUrl} onWord={openWord} onQuote={handleQuoteSelection} screenshotMode={screenshotMode} onCapture={handleCapture} onProgress={handleProgress} initialProgress={selectedBook.progress} />
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
            <div className={showNotes ? "reader-notes-backdrop open" : "reader-notes-backdrop"} onClick={() => setShowNotes(false)} />
            <aside className={showNotes ? "reader-notes open" : "reader-notes"}>
              <button className="notes-close" onClick={() => setShowNotes(false)}>
                <ArrowLeft size={14} />
                Tutup
              </button>
              <span className="eyebrow">CATATAN BACA</span>
              <h3>“Stay curious.”</h3>
              <p>Tambahkan highlight dan kata baru saat kamu membaca.</p>
              <button className="outline" onClick={() => { setTranslateDraft(selectedWord?.word || ""); setShowWord(true); }}>
                <Languages size={15} />
                Terjemahkan kata
              </button>
              <div className="quote-options">
                <span className="eyebrow">BAGIKAN KUTIPAN</span>
                {selectedQuote ? (
                  <button className="quote-share reader-quote-share" onClick={() => openShare(selectedBook.id, selectedQuote, "quote")}><Share2 size={15} />Bagikan kutipan terpilih</button>
                ) : (
                  <p className="quote-hint">Seret (drag) teks di halaman PDF untuk memilih kutipan dari teks asli.</p>
                )}
                {quoteError && <p className="quote-error">{quoteError}</p>}
                <button className={screenshotMode ? "outline tool-active" : "outline"} onClick={toggleScreenshotMode}>
                  <Sparkles size={15} />
                  {screenshotMode ? "Batal ambil screenshot" : "Kutipan dari screenshot"}
                </button>
                {screenshotMode && <p className="quote-hint">Seret area di halaman untuk menangkap & mendeteksi teksnya.</p>}
                {ocrLoading && <p className="quote-hint">Mendeteksi teks dari screenshot...</p>}
                {ocrError && <p className="quote-error">{ocrError}</p>}
                <button className="outline" onClick={() => { setCustomQuoteDraft(selectedQuote); setShowCustomQuote(true); }}>
                  <Pencil size={15} />
                  Tulis kutipan sendiri
                </button>
              </div>
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
            <input
              className="translate-input"
              value={translateDraft}
              onChange={(event) => setTranslateDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void translateText(translateDraft); } }}
              placeholder="Ketik kata atau frasa untuk diterjemahkan"
            />
            <div className="translate-line">
              <ArrowLeft size={15} />
              <span>INDONESIA</span>
              <strong>{selectedWord?.translation || "Belum ada kata dipilih"}</strong>
            </div>
          </div>
          <div className="translate-actions">
            <button className="outline" disabled={!translateDraft.trim()} onClick={() => void translateText(translateDraft)}>
              <Languages size={15} />
              Terjemahkan
            </button>
            <button className="primary modal-submit" disabled={!selectedWord || selectedWord.word !== translateDraft.toLowerCase().trim().replace(/[^a-z' -]/g, "").replace(/\s+/g, " ").trim() || selectedWord.translation === "Menerjemahkan..."} onClick={saveWord}>
              <Plus size={16} />
              Simpan ke bank kata
            </button>
          </div>
        </Modal>
      )}
      {showShare && (
        <Modal title="Bagikan ke story" onClose={() => setShowShare(false)}>
          {shareMode === "current" ? (
            <div className={`story-preview current-cover ${!sharedBook?.coverData ? sharedBook?.color || "ink" : ""}`} style={sharedBook?.coverData ? { backgroundImage: `url(${sharedBook.coverData})` } : undefined}>
              <span className="story-kicker">CURRENT READ</span>
              <div className="current-cover-text">
                <h3>{sharedBook?.title || "Buku saat ini"}</h3>
                <small>{sharedBook?.author || ""}</small>
              </div>
            </div>
          ) : (
            <div className="story-preview">
              <div className={`story-cover ${sharedBook?.color || "ink"} ${sharedBook?.coverData ? "has-image" : ""}`} style={sharedBook?.coverData ? { backgroundImage: `url(${sharedBook.coverData})` } : undefined}><span>{sharedBook?.title.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).map((word) => word[0]).join("").slice(0, 3) || "BK"}</span><BookOpen size={18} /></div>
              <h3>“{shareQuote}”</h3>
              <small>{sharedBook?.title || "Kutipan dari buku"}</small>
            </div>
          )}
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
      {showOcrReview && (
        <Modal title="Kutipan dari screenshot" onClose={() => setShowOcrReview(false)}>
          <p className="quote-hint">Periksa dan edit teks hasil deteksi sebelum dijadikan kutipan.</p>
          <textarea
            className="ocr-textarea"
            value={ocrDraft}
            onChange={(event) => setOcrDraft(event.target.value)}
          />
          <button className="primary modal-submit" disabled={!ocrDraft.trim()} onClick={useOcrQuote}>
            <Share2 size={16} />
            Gunakan sebagai kutipan
          </button>
        </Modal>
      )}
      {showCustomQuote && (
        <Modal title="Tulis kutipan sendiri" onClose={() => setShowCustomQuote(false)}>
          <p className="quote-hint">Ketik atau edit bebas teks yang mau dijadikan kutipan.</p>
          <textarea
            className="ocr-textarea"
            value={customQuoteDraft}
            onChange={(event) => setCustomQuoteDraft(event.target.value)}
            placeholder="Tulis kutipan di sini..."
          />
          <button className="primary modal-submit" disabled={!customQuoteDraft.trim()} onClick={useCustomQuote}>
            <Share2 size={16} />
            Gunakan sebagai kutipan
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
