const app = require('../api/index.cjs')
const port = process.env.PORT || 3001
app.listen(port, () => console.log(`BacaKuy API (dev) running on http://localhost:${port}`))
