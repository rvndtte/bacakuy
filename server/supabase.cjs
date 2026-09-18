const { createClient } = require('@supabase/supabase-js')

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY
const enabled = Boolean(url && serviceRoleKey)

const admin = enabled
  ? createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

const authClient = enabled
  ? createClient(url, anonKey || serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

module.exports = { admin, authClient, enabled }
