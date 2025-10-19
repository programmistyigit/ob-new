# OblivionLog

🌟 **Telegram Message Archiving System** - Automated PM archiving with bot interface and userbot automation.

## Features

- 📝 **Auto-Archive PM Messages** - Messages automatically saved to private channels
- 🔐 **Secure Session Management** - StringSession-based authentication
- 💳 **Telegram Stars Payment** - 30-day subscription model
- 🌐 **Multi-language Support** - UZ, EN, RU translations
- 📱 **Smart Archiving** - Forward messages or create meta backups
- 💾 **Media Handling** - Download and re-upload ephemeral content
- ⚙️ **User Settings** - Customize archive behavior

## Architecture

```
OblivionLog/
├── src/
│   ├── bot/              # Telegraf bot interface
│   ├── userbot/          # GramJS automation
│   ├── connect/          # Bot ↔ Userbot bridge
│   ├── mongodb/          # Database schemas
│   ├── config/           # Environment config
│   └── utils/            # Helpers & logging
```

## Installation

### 1. Clone and Install

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Telegram API (from https://my.telegram.org)
API_ID=123456
API_HASH=your_api_hash

# Bot Token (from @BotFather)
BOT_TOKEN=your_bot_token

# Payment Settings
ENABLE_STARS=true
STAR_PRICE=100

# MongoDB
MONGO_URI=mongodb://localhost:27017/oblivionlog
```

### 3. Start MongoDB

```bash
# If using local MongoDB
mongod --dbpath ./data/db

# Or use the provided Docker setup
docker-compose up -d
```

### 4. Run the Application

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Bot Commands

- `/start` - Welcome message and payment options
- `/connect` - Connect your Telegram account
- `/settings` - Configure archive preferences
- `/deleteme` - Delete all data and sessions
- `/help` - Show help message

## How It Works

### 1. **Payment & Activation**
- User pays with Telegram Stars (100 ⭐)
- 30-day subscription activated

### 2. **Account Connection**
- User shares phone number
- Enters SMS code via inline keyboard (0-9)
- Completes 2FA if enabled
- Session saved securely

### 3. **Automated Archiving**
- Userbot monitors private messages
- Creates archive channel per contact
- Forwards messages or creates metadata
- Downloads ephemeral media
- Optionally forwards to Saved Messages

### 4. **Session Monitoring**
- Detects disconnections
- Handles logout events
- Cleans up invalid sessions

## Database Schemas

### BotUser
```typescript
{
  userId: number;
  status: "active" | "disabled";
  action: "guest" | "awaiting_code" | "awaiting_2fa" | "done";
  pay: "stars" | "share" | "none";
  expiresAt?: Date;
  settings: {
    savedMessage?: boolean;
    archiveMode?: "channel" | "saved" | "both";
    language?: "uz" | "en" | "ru";
  }
}
```

### UserChannel
```typescript
{
  user_id: number;
  channel_id: number;
  channel_title?: string;
  created_at: Date;
}
```

### Archive
```typescript
{
  user_id: number;
  other_id: number;
  message_id: number;
  direction: "me->other" | "other->me";
  text?: string;
  forwarded: boolean;
  media?: { ephemeral?: boolean };
  date: Date;
}
```

## Security

- 🔐 Sessions encrypted with StringSession
- 🚫 No password logging or storage
- ✅ Environment validation with Zod
- 🔒 File permissions restricted
- ⚠️ Never commit `.env` to repository

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Bot**: Telegraf
- **Userbot**: GramJS (telegram library)
- **Database**: MongoDB + Mongoose
- **Logging**: Pino (structured JSON)
- **Validation**: Zod
- **Testing**: Vitest

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Privacy & Terms

- [Privacy Policy](docs/privacy.md)
- [Terms of Service](docs/terms.md)

## Compliance Notice

⚠️ **Important**: This application uses Telegram userbot functionality. Please ensure compliance with:
- Telegram Terms of Service
- Local data protection regulations
- Anti-spam laws

Automated messaging should only be used with explicit user consent.

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [Repository URL]
- Email: support@oblivionlog.com
- Telegram: @oblivionlog_support

---

**Made with ❤️ for Telegram power users**
