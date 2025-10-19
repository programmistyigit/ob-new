# Qidiruv Tizimi Arxitekturasi

## 1️⃣ Umumiy Arxitektura

```
┌─────────────────────────────────────────────────────────────┐
│                    User Request                              │
│              (API/Bot command/Direct call)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   Search Service Layer      │
         │  (advancedSearch.ts /       │
         │   contextSearch.ts)         │
         └─────────────┬───────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  getAllActiveUserIds()      │
         │  (runUserBot.ts)            │
         └─────────────┬───────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   activeClients Map         │
         │   userId → TelegramClient   │
         └─────────────┬───────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌────────────────┐          ┌────────────────┐
│  Client 1      │          │  Client N      │
│  (User 123)    │   ...    │  (User 999)    │
└────────┬───────┘          └────────┬───────┘
         │                           │
         ▼                           ▼
┌────────────────┐          ┌────────────────┐
│ Telegram API   │          │ Telegram API   │
│ (GramJS)       │          │ (GramJS)       │
└────────┬───────┘          └────────┬───────┘
         │                           │
         ▼                           ▼
┌────────────────┐          ┌────────────────┐
│ Search Results │          │ Search Results │
└────────┬───────┘          └────────┬───────┘
         │                           │
         └─────────────┬─────────────┘
                       ▼
         ┌─────────────────────────────┐
         │   Aggregate & Filter        │
         │   (Combine all results)     │
         └─────────────┬───────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   Return to User            │
         └─────────────────────────────┘
```

---

## 2️⃣ Advanced Search Flow (Media & Chat qidiruv)

```
Request: searchAcrossAllClients(target, options)
   │
   ├─ Step 1: Get all active client IDs
   │  └─> getAllActiveUserIds() → [123, 456, 789, ...]
   │
   ├─ Step 2: Loop through each client (PARALLEL)
   │  │
   │  ├─ Client 123:
   │  │  ├─ Get TelegramClient from activeClients Map
   │  │  ├─ Resolve target (phone/userId/id → Entity)
   │  │  │  └─> client.getEntity(target) → User/Chat object
   │  │  │
   │  │  ├─ If options.media:
   │  │  │  ├─ client.iterMessages(targetUser) → ALL MESSAGES ✅
   │  │  │  ├─ Filter messages by media type:
   │  │  │  │  ├─ message.photo → images[]
   │  │  │  │  ├─ message.video → videos[]
   │  │  │  │  └─ message.audio → audios[]
   │  │  │  └─ Extract metadata:
   │  │  │     ├─ action: out/input (message.out)
   │  │  │     ├─ fileName, mimeType, size
   │  │  │     └─ date, messageId
   │  │  │
   │  │  └─ If options.chats:
   │  │     ├─ client.iterMessages(targetUser) → ALL MESSAGES ✅
   │  │     └─ Map to ChatMessage format:
   │  │        ├─ path: user/otherUser
   │  │        ├─ message text
   │  │        └─ date, messageId
   │  │
   │  ├─ Client 456: (same process)
   │  └─ Client 789: (same process)
   │
   ├─ Step 3: Aggregate results
   │  └─> Filter out empty results
   │
   └─ Step 4: Return
      └─> [{user, userId, data}, ...]
```

---

## 3️⃣ Context Search Flow (Matn bo'yicha qidiruv)

```
Request: searchByContext({query, userIds, limit})
   │
   ├─ Step 1: Get specified clients (or all)
   │  └─> userIds → [123, 456]
   │
   ├─ Step 2: For each client (PARALLEL)
   │  │
   │  ├─ Client 123:
   │  │  ├─ Get TelegramClient from activeClients Map
   │  │  ├─ client.getDialogs({}) → ALL DIALOGS ✅
   │  │  │  └─> [Dialog1, Dialog2, Dialog3, ...]
   │  │  │
   │  │  ├─ For each dialog:
   │  │  │  ├─ Get dialog info (name, type, id)
   │  │  │  ├─ client.iterMessages(dialog) → ALL MESSAGES ✅
   │  │  │  │
   │  │  │  ├─ For each message:
   │  │  │  │  ├─ Check if text matches query
   │  │  │  │  │  ├─ Case sensitive/insensitive
   │  │  │  │  │  └─ Exact/substring match
   │  │  │  │  │
   │  │  │  │  └─ If match found:
   │  │  │  │     ├─ Get before context:
   │  │  │  │     │  └─> messages[i-3...i-1]
   │  │  │  │     ├─ Get after context:
   │  │  │  │     │  └─> messages[i+1...i+3]
   │  │  │  │     ├─ Get sender info
   │  │  │  │     └─ Add to matches[]
   │  │  │  │
   │  │  │  └─ Continue to next message
   │  │  │
   │  │  └─ Return all matches for this client
   │  │
   │  └─ Client 456: (same process)
   │
   ├─ Step 3: Filter non-empty results
   │  └─> Keep only clients with matches
   │
   └─ Step 4: Return
      └─> [{userId, username, matches[], totalMatches}, ...]
```

---

## 4️⃣ Data Flow Diagram

```
┌──────────────────┐
│  activeClients   │ ◄─── In-Memory (RAM)
│  Map<id, client> │      RUNTIME ONLY
└────────┬─────────┘
         │
         │ getActiveClient(userId)
         ▼
┌──────────────────┐
│ TelegramClient   │
│  - connect()     │
│  - getEntity()   │
│  - getMessages() │
│  - getDialogs()  │
└────────┬─────────┘
         │
         │ API Request
         ▼
┌──────────────────┐
│  Telegram API    │ ◄─── Network call
│  (MTProto)       │      EXTERNAL
└────────┬─────────┘
         │
         │ Response
         ▼
┌──────────────────┐
│  Raw Data        │
│  - Messages      │
│  - Media         │
│  - Users         │
└────────┬─────────┘
         │
         │ Transform
         ▼
┌──────────────────┐
│  Formatted       │ ◄─── TypeScript interfaces
│  SearchResult    │      TYPE-SAFE
└──────────────────┘
```

---

## 5️⃣ Key Components Interaction

```
┌─────────────────────────────────────────────────────────┐
│                  Application Startup                     │
├─────────────────────────────────────────────────────────┤
│  1. Load sessions from disk (user_X.json files)         │
│  2. Create TelegramClient for each session              │
│  3. Store in activeClients Map                          │
│  4. Setup event handlers (archiveHandler)               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Runtime State                         │
├─────────────────────────────────────────────────────────┤
│  activeClients Map:                                      │
│  ├─ 123456789 → TelegramClient (Connected, Listening)   │
│  ├─ 987654321 → TelegramClient (Connected, Listening)   │
│  └─ 111222333 → TelegramClient (Connected, Listening)   │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Search Services (On-Demand)                 │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────┐        ┌──────────────────┐        │
│  │AdvancedSearch   │        │ ContextSearch    │        │
│  │  Service        │        │   Service        │        │
│  └────────┬────────┘        └────────┬─────────┘        │
│           │                          │                   │
│           └──────────┬───────────────┘                   │
│                      │                                   │
│              Use activeClients                           │
└──────────────────────┼──────────────────────────────────┘
                       │
                       ▼
             Query Telegram API
             (No database needed)
```

---

## 6️⃣ Memory vs Disk Storage

```
┌──────────────────────┬──────────────────────────┐
│    DISK (Persistent) │   MEMORY (Runtime)       │
├──────────────────────┼──────────────────────────┤
│ session files:       │ activeClients Map:       │
│  user_123.json       │  123 → TelegramClient    │
│  user_456.json       │  456 → TelegramClient    │
│  user_789.json       │  789 → TelegramClient    │
├──────────────────────┼──────────────────────────┤
│ Contains:            │ Contains:                │
│  - sessionString     │  - Live connection       │
│  - createdAt         │  - Event handlers        │
│  - lastUsed          │  - API methods           │
│  - phoneNumber       │  - State                 │
├──────────────────────┼──────────────────────────┤
│ Persists after:      │ Lost after:              │
│  ✅ Server restart   │  ❌ Server restart       │
│  ✅ App crash        │  ❌ App crash            │
├──────────────────────┼──────────────────────────┤
│ Used for:            │ Used for:                │
│  - Login/Auth        │  - Active operations     │
│  - Session recovery  │  - Real-time messaging   │
│  - Reconnection      │  - Search queries        │
└──────────────────────┴──────────────────────────┘
```

---

## 7️⃣ Search Performance Model

```
Scenario: 3 active clients, search for @Begzod's images

┌─────────────────────────────────────────────────┐
│ Sequential (OLD - Not used)                     │
├─────────────────────────────────────────────────┤
│ Client 1: ████████ (2s)                         │
│ Client 2:         ████████ (2s)                 │
│ Client 3:                 ████████ (2s)         │
│ Total: 6 seconds                                │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Parallel (CURRENT - Used)                       │
├─────────────────────────────────────────────────┤
│ Client 1: ████████ (2s)                         │
│ Client 2: ████████ (2s)                         │
│ Client 3: ████████ (2s)                         │
│ Total: 2 seconds ✅ 3x faster!                  │
└─────────────────────────────────────────────────┘
```

---

## 8️⃣ Error Handling Flow

```
Request → Service
   │
   ├─ Try: Get client from activeClients
   │  ├─ ✅ Success → Continue
   │  └─ ❌ Not found → Skip this client, log warning
   │
   ├─ Try: Resolve target entity
   │  ├─ ✅ Found → Continue
   │  └─ ❌ Not found → Skip this client, log debug
   │
   ├─ Try: Fetch messages
   │  ├─ ✅ Success → Process
   │  └─ ❌ API error → Skip, log error
   │
   └─ Return: Only successful results
      └─> No crash on partial failures ✅
```

---

## 9️⃣ Code Structure

```
src/
├─ services/
│  ├─ advancedSearch.ts     ← Media/Chat search logic
│  ├─ contextSearch.ts      ← Text search with context
│  ├─ index.ts              ← Exports
│  └─ examples.ts           ← Usage examples
│
├─ userbot/
│  ├─ runUserBot.ts         ← activeClients management
│  │  ├─ activeClients Map
│  │  ├─ getActiveClient()
│  │  ├─ getAllActiveClients()
│  │  └─ getAllActiveUserIds()
│  │
│  └─ login/
│     └─ sessionStore.ts    ← Disk storage
│
└─ utils/
   └─ logger.ts             ← Logging
```

---

## 🔟 Execution Timeline

```
T=0:  User calls searchAcrossAllClients()
      │
T=1:  Get all active client IDs
      │  getAllActiveUserIds() → [123, 456, 789]
      │
T=2:  Start parallel searches (Promise.all)
      ├─ Search in Client 123 ───┐
      ├─ Search in Client 456 ───┤ (Parallel)
      └─ Search in Client 789 ───┘
      │
T=4:  All searches complete
      │  Aggregate results
      │
T=5:  Filter & format
      │
T=6:  Return to user
```

---

## Key Advantages:

✅ **On-Demand:** Faqat chaqirilganda ishlaydi, doimiy resource sarflamaydi
✅ **Parallel:** Barcha clientlar bir vaqtda qidiradi (tez)
✅ **Scalable:** 1000 ta client bo'lsa ham ishlaydi
✅ **Isolated:** Bir clientdagi error boshqalarga ta'sir qilmaydi
✅ **No Database:** To'g'ridan-to'g'ri Telegram API dan oladi (har doim yangi)
✅ **Type-Safe:** TypeScript interfeyslari bilan xavfsiz
✅ **Flexible:** Target 3 xil formatda (phone/userId/id)
✅ **Rich Results:** Metadata bilan to'liq ma'lumot
