// Loads .env.local for scripts run with tsx (Next.js loads it by itself).
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: rely on the real environment
}
