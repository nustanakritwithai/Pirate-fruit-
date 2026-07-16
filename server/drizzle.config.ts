import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/persistence/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Schema generation is offline. Runtime migration commands still require a
    // real DATABASE_URL and never use this local placeholder.
    url: process.env.DATABASE_URL ?? 'postgresql://pirate_fruit@localhost:5432/pirate_fruit',
  },
  strict: true,
  verbose: true,
});
