# BacaKuy Test Cases

## Automated integration tests

Run with:

```bash
npm test
```

The suite uses a temporary SQLite database and covers:

- API health check and SQLite connectivity
- Bootstrap seed data
- Folder create, rename, duplicate validation, and delete
- PDF book import, metadata update, file download, and delete
- Folder deletion protection when books remain inside
- Word bank save/upsert, update, and delete
- Story share creation
- Required-field validation errors

## Manual browser test cases

| ID | Feature | Steps | Expected result |
|---|---|---|---|
| UI-01 | Folder CRUD | Open the `+` action beside FOLDER, enter a name, press Enter | New folder appears in the sidebar and persists after refresh |
| UI-02 | Folder rename/delete | Rename a folder through the folder management control, then delete an empty folder | Sidebar shows the new name; empty folder is removed |
| UI-03 | Folder protection | Try to delete a folder containing a book | The action is rejected and the book remains available |
| UI-04 | Import PDF | Click `Tambah buku`, choose a valid PDF, and select a folder | Book is saved to the database, appears in the library, and opens in the reader |
| UI-05 | PDF scrolling | Open an imported PDF larger than the viewport; scroll vertically and horizontally | Both scroll directions work smoothly without changing surrounding layout |
| UI-06 | Scan/OCR mode | Open a scanned/image-based PDF and toggle OCR | OCR mode indicator changes state; recognized text can be selected for translation |
| UI-07 | Book metadata | Open book edit controls and change title, author, cover/color, folder, and progress | Updated metadata is visible immediately and remains after refresh |
| UI-08 | Translate word | In the reader, click a recognized English word | Translation modal opens with English-to-Indonesian result |
| UI-09 | Word bank CRUD | Save a translated word, edit its translation/context, then remove it | Word appears in Bank kata, edits persist, and deletion removes it |
| UI-10 | Flashcard | Open Bank kata, choose `Mulai flashcard`, click card, then choose next card | Meaning toggles on click and next card advances correctly |
| UI-11 | Current-read story | Open share from the reader/current book | Story preview contains the current book title and author; share action succeeds |
| UI-12 | Quote story | Open share from the quote panel | Story preview contains the selected quote and its book attribution |
| UI-13 | Persistence | Create a folder, import a book, and save a word; refresh the browser | All three records remain because they are loaded from SQLite, not localStorage |
| UI-14 | Invalid upload | Try to upload a non-PDF file or an oversized file | Upload is rejected with a visible error and no invalid book is created |
| UI-15 | Responsive layout | Repeat dashboard, reader, and flashcard flows at desktop and mobile widths | Controls remain reachable, text does not overlap, and reader remains scrollable |
