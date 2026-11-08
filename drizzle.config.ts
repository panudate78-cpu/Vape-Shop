import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Auto-load .env so `npx drizzle-kit push` works without passing --url or
// manually sourcing env vars (important for PowerShell on Windows).
config({ path: '.env' });
config({ path: '.env.local', override: true });
config({ path: '.env.production', override: true });

export default defineConfig({
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
