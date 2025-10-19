# OblivionLog - Telegram Message Archiving System

## Overview

OblivionLog is a Telegram message archiving system designed to automatically back up private messages to dedicated channels. It utilizes a Telegraf bot for user interaction and GramJS userbots for monitoring and archiving. Key features include Telegram Stars payment integration, multi-language support, and a robust parental control system for monitoring child communications. The project aims to provide a reliable and customizable solution for personal and parental message archiving with a focus on user privacy and control over data.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Components
The system consists of a Telegraf-based **Bot Layer** for user interaction (multi-language UI, session management, payment flows) and a GramJS-based **Userbot Layer** for message monitoring and archiving (StringSession authentication, event-driven processing, media handling). A **Connect Module** acts as a bridge, orchestrating communication, login flows, and session lifecycle management between these layers. **MongoDB with Mongoose** serves as the data layer, storing user profiles, archive records, and session persistence.

### Key Features

-   **Authentication Flow:** Secure user login via Telegram sessions (phone number, SMS code, 2FA password) generating and persisting StringSessions.
-   **Message Archiving:** Monitors private chats, filters based on user settings, creates dedicated private channels per contact, and forwards/sends messages. It supports granular control over archiving text and media, dual-mode archiving (channel/Saved Messages/both), and intelligent media handling (direct forward or download/re-upload). A "Target ID Whitelist" ensures only messages from/to specified users are stored in the database, preserving privacy for others.
-   **Payment System:** Integrates Telegram Stars for a 30-day subscription model, with invoice generation, pre-checkout validation, and webhook handling. Payments stack to extend subscriptions. A "Share-Based Activation" alternative allows free access in exchange for sharing a promotional message.
-   **Parental Control System:** Enables parents to monitor child communications with a many-to-many relationship and approval flow. It offers separate monitoring subscriptions via Telegram Stars and provides dual-layer monitoring: either forwarding messages to a parent's dedicated channels (if connected) or sending bot notifications as a fallback.
-   **Session Management:** Monitors session health (AUTH_KEY_UNREGISTERED, logout events), persists sessions in individual JSON files, and caches active clients in-memory.
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