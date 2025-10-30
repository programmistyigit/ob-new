# OblivionLog - Telegram Message Archiving System v3.0.0

## Overview

OblivionLog is a Telegram message archiving system designed to automatically back up private messages to dedicated channels. It utilizes a Telegraf bot for user interaction and GramJS userbots for monitoring and archiving. Key features include Telegram Stars payment integration, multi-language support, and a robust parental control system for monitoring child communications. The project aims to provide a reliable and customizable solution for personal and parental message archiving with a focus on user privacy and control over data.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Components
The system consists of a Telegraf-based **Bot Layer** for user interaction (multi-language UI, session management, payment flows) and a GramJS-based **Userbot Layer** for message monitoring and archiving (StringSession authentication, event-driven processing, media handling). A **Connect Module** acts as a bridge, orchestrating communication, login flows, and session lifecycle management between these layers. **MongoDB with Mongoose** serves as the data layer, storing user profiles, archive records, and session persistence.

### Key Features

-   **Authentication Flow:** Secure user login via Telegram sessions (phone number, SMS code, 2FA password) generating and persisting StringSessions.
-   **Private Message Archiving:** Monitors private chats with **blacklist/exception-based control**. By default, **all private chats are archived** when global archiving is enabled. Users can add specific chats to an exceptions list to customize or disable archiving for individual contacts (toggle message/media independently or disable completely). Supports dedicated private channels per contact, dual-mode archiving (channel/Saved Messages/both), and intelligent media handling (direct forward or download/re-upload). A "Target ID Whitelist" ensures only messages from/to specified users are stored in the database. **New chats automatically archive with default settings** unless added to exceptions.
-   **Group Chat Archiving:** User-configurable group monitoring with dedicated archive channels per group. Features reply chain preservation through message ID mapping, media group/album detection and forwarding, metadata fallback for unforwardable content (sender name, timestamp, text, media type), and granular toggle controls for archiving messages and media separately. Archive channels are auto-created with naming "Archive: {GroupName}" and support both supergroups (PeerChannel) and regular groups (PeerChat) with proper ID normalization (-1001234567890 format).
-   **Payment System:** Integrates Telegram Stars for a 30-day subscription model, with invoice generation, pre-checkout validation, and webhook handling. Payments stack to extend subscriptions. A "Share-Based Activation" alternative allows free access in exchange for sharing a promotional message.
-   **Parental Control System:** Enables parents to monitor child communications with a many-to-many relationship and approval flow. It offers separate monitoring subscriptions via Telegram Stars (50 stars = 30 days) with **payment-required access** - monitoring only activates after successful payment. The system provides dual-layer monitoring: either forwarding messages to a parent's dedicated channels (if connected) or sending bot notifications as a fallback. **Critical Architecture:** Parental monitoring runs **independently** of child's private archive settings - even if a child disables archiving (message/media) for specific chats via exceptions list, monitoring continues to capture and forward all communications to parents. **Security:** Connection approval sets only `approvalStatus='approved'`; monitoring access requires valid `expiresAt` timestamp set exclusively via payment handler.
-   **Session Management & Revocation Detection:** Monitors session health with comprehensive error detection (AUTH_KEY_UNREGISTERED, SESSION_REVOKED, USER_DEACTIVATED, AUTH_KEY_DUPLICATED, logout events). When session is externally revoked (user terminates session from Telegram settings), system automatically: detects invalidation, notifies user via bot in their preferred language, cleans up session files and active connections, sets sessionStatus='revoked' in DB, and restricts all features except /connect and /start commands. Sessions persist in individual JSON files and active clients are cached in-memory with automatic reconnection on startup.
-   **Advanced Search Services:** Two specialized services (`advancedSearch.ts` and `contextSearch.ts`) allow querying messages and media across active userbot clients. `advancedSearch` uses 3-layer search (direct messages + archive database + archive channels) to find media with rich metadata including ephemeral/deleted content, while `contextSearch` performs full-text search with surrounding context across all dialogs. Both are on-demand, query Telegram API directly, and work with runtime instances.
-   **User Management Service:** Provides three key functions: `addPredefinedUser` (adds users to TARGET_IDs for permanent storage), `getAllUsers` (lists all users/chats/groups with count), and `getAccountDetails` (retrieves contacts, groups, chats, messages, and media statistics for a given account). Supports flexible user identification (ID/username/phone) and provides rich account analytics.
-   **Rate Limiting & Flood Protection:** Implements PQueue-based rate limiting (25 requests/min per account), automatic FLOOD_WAIT handling with exponential backoff, and IP-level blocking prevention. Includes queue management (pause/resume), request tracking, and metrics monitoring. Designed to scale from 100 to 50k+ users with distributed architecture support (proxies/multi-instance deployment).
-   **Error Handling:** Utilizes a custom error hierarchy and a structured Pino logger with context-specific child loggers and environment-based formatting.
-   **UI/UX:** Multi-language support (Uzbek, English, Russian) with callback-based UI for settings and payments, using message editing to avoid duplicate messages.

## External Dependencies

### Third-Party Services
-   **Telegram Platform:** Bot API (via Telegraf), MTProto API (via GramJS), Telegram Stars for payments. API_ID, API_HASH, and BOT_TOKEN are required.
-   **MongoDB:** For persistent data storage, configured via `MONGO_URI`.

### Key Libraries
-   **Telegram Clients:** `telegraf` (bot framework), `telegram` (GramJS userbot).
-   **Data & Validation:** `mongoose` (MongoDB ODM), `zod` (environment validation).
-   **Utilities:** `dotenv` (environment variables), `pino` (logging), `pino-pretty` (log formatting).

### Configuration Requirements
-   **Required Environment Variables:** `API_ID`, `API_HASH`, `BOT_TOKEN`, `MONGO_URI`.
-   **Optional Configuration:** `ENABLE_STARS`, `STAR_PRICE`, `NODE_ENV`, `LOG_LEVEL`, `MEDIA_DIR`.