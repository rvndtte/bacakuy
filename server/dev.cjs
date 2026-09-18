import('../api/index.js').then(({ default: app }) => {
  const port = process.env.PORT || 3001
  app.listen(port, () => console.log(`BacaKuy API (dev) running on http://localhost:${port}`))
})
