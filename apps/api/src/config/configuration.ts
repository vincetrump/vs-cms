function requireEnv(key: string, fallbackForDev?: string): string {
  const value = process.env[key];
  if (value) return value;
  if (process.env.NODE_ENV !== 'production' && fallbackForDev) return fallbackForDev;
  throw new Error(`Missing required environment variable: ${key}`);
}

export default () => ({
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vs-cms',
  jwt: {
    secret: requireEnv('JWT_SECRET', 'dev-only-secret-do-not-use-in-prod'),
    expiration: process.env.JWT_EXPIRATION || '24h',
  },
  totp: {
    encryptionKey: requireEnv('TOTP_ENCRYPTION_KEY', 'dev-only-totp-key-32-characters!'),
  },
  ssh: {
    privateKeyPath: process.env.SSH_PRIVATE_KEY_PATH || '',
    defaultServer: process.env.SSH_DEFAULT_SERVER || '',
    defaultUser: process.env.SSH_DEFAULT_USER || 'root',
  },
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  },
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  },
  app: {
    port: parseInt(process.env.API_PORT || '3001', 10),
    adminUrl: process.env.ADMIN_URL || 'http://localhost:5173',
  },
});
