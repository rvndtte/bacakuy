# React + TypeScript + Vite

## Serverless deployment

Untuk deployment serverless, gunakan Turso/libSQL untuk database dan object storage terpisah untuk PDF. Jangan commit `.env`, token Turso, database SQLite lokal, atau folder `data/uploads`.

1. Install dan login Turso CLI:

```bash
turso auth login
turso db create bacakuy
turso db show bacakuy
turso db tokens create bacakuy
```

2. Salin `.env.example` menjadi `.env` dan isi:

```env
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
VITE_API_URL=https://api-bacakuy.example.com
```

3. Tambahkan `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` pada Vercel Project Settings sebagai Environment Variables. Tambahkan `VITE_API_URL` pada environment frontend.

Catatan: `server/index.cjs` saat ini masih memakai SQLite lokal untuk development. Migrasi endpoint backend ke `@libsql/client` dan pemindahan PDF ke Vercel Blob/R2 diperlukan sebelum backend dijalankan sebagai Vercel Function.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
