export default () => ({
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vs-cms',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiration: process.env.JWT_EXPIRATION || '24h',
  },
  totp: {
    encryptionKey: process.env.TOTP_ENCRYPTION_KEY || 'dev-encryption-key-change-me-32ch',
  },
  ssh: {
    privateKeyPath: process.env.SSH_PRIVATE_KEY_PATH || '',
    defaultServer: process.env.SSH_DEFAULT_SERVER || '68.183.188.19',
    defaultUser: process.env.SSH_DEFAULT_USER || 'root',
  },
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
  },
  discord: {
    webhookUrl:
      process.env.DISCORD_WEBHOOK_URL || '',
  },
  app: {
    port: parseInt(process.env.API_PORT || '3001', 10),
    adminUrl: process.env.ADMIN_URL || 'http://localhost:5173',
  },
});
