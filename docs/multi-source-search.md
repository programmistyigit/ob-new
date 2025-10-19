# Multi-Source Media Search (3-Layer Search)

## 🎯 Umumiy Tushuncha

Media qidiruv tizimi **3 ta manbadan** ham ma'lumot to'playdi:

```
┌──────────────────────────────────────────────────┐
│           Media Search Request                   │
│        (target: @Begzod, media: {img: true})     │
└────────────────┬─────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │  PARALLEL SEARCH │
        └────────┬────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Source 1│ │ Source 2│ │ Source 3│
│ Direct  │ │Archive  │ │Archive  │
│Messages │ │Database │ │Channels │
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┼───────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │ Aggregated Results   │
      │ (Deduplicated)       │
      └──────────────────────┘
```

---

## 📊 Uchta Manba:

### **1. Direct Messages (To'g'ridan-to'g'ri messagelar)**

**Qayerdan:**
- Telegram API: `client.iterMessages(targetUser)`
- To'g'ri PM (Private Message) chat

**Qanday ma'lumot:**
- ✅ Hozirgi mavjud messagelar
- ✅ O'chirilmagan media
- ✅ Real-time ma'lumot

**Metadata:**
- `source: 'direct'`
- fileName, mimeType, size, date, messageId
- action (out/input)

---

### **2. Archive Database (Arxiv ma'lumotlar bazasi)**

**Qayerdan:**
- MongoDB: `Archive` collection
- Faqat **TARGET_IDs** uchun

**Qanday ma'lumot:**
- ✅ O'chirilgan messagelar (agar arxivlangan bo'lsa)
- ✅ Ephemeral media metadata
- ✅ Permanent storage path
- ✅ Forward status

**Metadata:**
- `source: 'archive_db'`
- fileName, mimeType, size, date, messageId
- **metadata.forwarded** - Forward qilingan/yo'q
- **metadata.ephemeral** - View-once media
- **metadata.localPath** - Disk da saqlangan yo'l
- **metadata.archivedBy** - Kim arxivlagan
- **metadata.text** - Message matni (agar bor bo'lsa)

**Query:**
```typescript
Archive.find({
  $or: [
    { user_id: myId, other_id: targetId },
    { user_id: targetId, other_id: myId },
  ],
  'media': { $exists: true, $ne: null }
})
```

---

### **3. Archive Channels (Shaxsiy arxiv kanallar)**

**Qayerdan:**
- Private Telegram Channels
- `UserChannel` collection (channel_id, access_hash)

**Qanday ma'lumot:**
- ✅ Barcha arxivlangan media
- ✅ Forward qilingan va manual yuborilganlar
- ✅ Caption ma'lumotlari

**Metadata:**
- `source: 'archive_channel'`
- fileName, mimeType, size, date, messageId
- **metadata.archivedBy** - Kim arxivlagan
- **metadata.text** - Caption (Direction, With, Time, etc.)

**Kanal topish:**
```typescript
UserChannel.findOne({ user_id: targetId })
```

**Kanal messagelar:**
```typescript
client.iterMessages(channelPeer)
```

---

## 🔄 Search Flow (Qidiruv jarayoni):

```
Step 1: Direct Messages Search
├─ client.iterMessages(targetUser)
├─ Filter by media type (img/video/audio)
├─ Extract metadata
└─ Add to results with source: 'direct'

Step 2: Archive Database Search
├─ Archive.find({user_id, other_id, media exists})
├─ Filter by media type (mimeType/fileName)
├─ Extract rich metadata (forwarded, ephemeral, localPath)
└─ Add to results with source: 'archive_db'

Step 3: Archive Channels Search
├─ UserChannel.findOne({user_id: targetId})
├─ client.iterMessages(channelPeer)
├─ Filter by media type
├─ Parse caption for direction
└─ Add to results with source: 'archive_channel'

Step 4: Aggregate & Return
└─ Combine all results (no deduplication - show all sources)
```

---

## 📋 Result Structure:

```typescript
{
  user: "alice",
  userId: 123456789,
  data: {
    images: [
      // From direct messages
      {
        action: "out",
        targetName: "Begzod",
        targetId: 987654321,
        fileName: "photo_123.jpg",
        mimeType: "image/jpeg",
        date: "2025-10-15...",
        messageId: 123,
        source: "direct"  // ← Source indicator
      },
      
      // From archive database
      {
        action: "input",
        targetName: "Begzod",
        targetId: 987654321,
        fileName: "msg_456_ephemeral.jpg",
        mimeType: "image/jpeg",
        size: 52340,
        date: "2025-10-10...",
        messageId: 456,
        source: "archive_db",  // ← Archive metadata
        metadata: {
          forwarded: false,
          ephemeral: true,  // View-once media!
          localPath: "target_archives/user_123/contact_987/msg_456.jpg",
          archivedBy: 123456789,
          text: "Check this out!"
        }
      },
      
      // From archive channel
      {
        action: "out",
        targetName: "Begzod",
        targetId: 987654321,
        fileName: "photo_789.jpg",
        mimeType: "image/jpeg",
        date: "2025-10-05...",
        messageId: 789,
        source: "archive_channel",  // ← From private channel
        metadata: {
          archivedBy: 123456789,
          text: "📝 Direction: me->other\n👤 With: Begzod\n🕒 Time: ..."
        }
      }
    ]
  }
}
```

---

## 🎯 Use Cases:

### **Scenario 1: O'chirilgan media topish**

```
User o'z PM dan rasmni o'chirdi.

Source 1 (Direct): ❌ Yo'q (o'chirilgan)
Source 2 (Archive DB): ✅ Bor (metadata + localPath)
Source 3 (Archive Channel): ✅ Bor (actual media)

Result: Eski rasmni topa oladi! ✅
```

### **Scenario 2: Ephemeral media (View Once)**

```
User view-once rasm yubordi.

Source 1 (Direct): ❌ Yo'q (ephemeral - 1 marta ko'rilgandan keyin yo'qoladi)
Source 2 (Archive DB): ✅ Bor (metadata.ephemeral: true, localPath)
Source 3 (Archive Channel): ✅ Bor (⚠️ EPHEMERAL MEDIA caption bilan)

Result: View-once mediani topadi va metadata ko'rsatadi! ✅
```

### **Scenario 3: TARGET_ID bo'lmagan user**

```
User TARGET_ID da yo'q.

Source 1 (Direct): ✅ Hozirgi messagelar
Source 2 (Archive DB): ❌ Yo'q (faqat TARGET_ID lar uchun)
Source 3 (Archive Channel): ✅ Bor (har kim uchun arxivlanadi)

Result: Partial data (direct + channel) ✅
```

### **Scenario 4: Boshqa odam arxivida saqlagan**

```
Alice: Begzod bilan muloqot qilgan
Bob: Begzod bilan muloqot qilgan

Alice qidiryapti (target: Begzod):
  Source 1: Alice → Begzod direct messages
  Source 2: Alice → Begzod archive DB (agar Alice TARGET_ID bo'lsa)
  Source 3: Alice → Begzod archive channel (Alice o'zi yaratgan)

Bob qidiryapti (target: Begzod):
  Source 1: Bob → Begzod direct messages
  Source 2: Bob → Begzod archive DB (agar Bob TARGET_ID bo'lsa)
  Source 3: Bob → Begzod archive channel (Bob o'zi yaratgan)

✅ Har bir user o'z arxivini ko'radi
✅ Boshqa odamning arxivi ko'rinmaydi (privacy)
```

---

## 💡 Afzalliklar:

### **Comprehensive (To'liq):**
- ✅ Hech narsa miss qilmaydi
- ✅ O'chirilgan media ham topiladi
- ✅ Ephemeral media metadata

### **Privacy-Aware:**
- ✅ Har bir user o'z arxivini ko'radi
- ✅ TARGET_ID tizimi (selective logging)
- ✅ Boshqa odamning ma'lumotlari ko'rinmaydi

### **Rich Metadata:**
- ✅ Source ko'rsatiladi
- ✅ Forward status
- ✅ Local path (agar saqlanganbo'lsa)
- ✅ Archived by (kim arxivlagan)
- ✅ Original text/caption

### **Reliable:**
- ✅ Parallel execution (tez)
- ✅ Error isolation (bir manba xato bo'lsa, boshqalari ishlaydi)
- ✅ Multiple fallbacks

---

## 🔍 Query Examples:

### **Example 1: Barcha rasmlar**
```typescript
const results = await advancedSearchService.searchAcrossAllClients(
  { userId: '@Begzod' },
  { media: { img: true } }
);

// Returns:
// - Direct PM images
// - Archive DB metadata (if TARGET_ID)
// - Archive channel images
```

### **Example 2: Videolar + Audiolar**
```typescript
const results = await advancedSearchService.searchAcrossAllClients(
  { phoneNumber: '+998901234567' },
  { media: { video: true, audio: true } }
);

// Returns all videos & audios from all 3 sources
```

### **Example 3: Filter by source**
```typescript
const results = await advancedSearchService.searchAcrossAllClients(
  { userId: '@Begzod' },
  { media: { img: true } }
);

// Client-side filtering:
const directOnly = results[0].data.images?.filter(img => img.source === 'direct');
const archivedOnly = results[0].data.images?.filter(img => img.source === 'archive_db');
const channelOnly = results[0].data.images?.filter(img => img.source === 'archive_channel');
```

---

## ⚠️ Important Notes:

### **1. TARGET_ID Dependency:**
- Archive DB faqat TARGET_ID lar uchun
- Agar user TARGET_ID bo'lmasa, Source 2 bo'sh bo'ladi
- Lekin Source 1 va 3 hali ishlaydi

### **2. Privacy:**
- Har bir user faqat o'z arxivini ko'radi
- `UserChannel.findOne({ user_id: targetId })` faqat o'z kanalini topadi
- Boshqa odamning arxiv kanaliga access yo'q

### **3. Performance:**
- 3 ta manba parallel tekshiriladi (tez)
- Archive DB eng tez (indexed MongoDB query)
- Archive Channel o'rtacha (Telegram API)
- Direct Messages ham o'rtacha (Telegram API)

### **4. Deduplication:**
- Hozirda deduplication YO'Q
- Bir media 3 ta joyda ham ko'rinishi mumkin
- Bu feature - user qayerda saqlanganini bilishi uchun

---

## 📊 Statistics Example:

```typescript
const results = await advancedSearchService.searchAcrossAllClients(
  { userId: '@Begzod' },
  { media: { img: true, video: true, audio: true } }
);

for (const result of results) {
  const images = result.data.images || [];
  const videos = result.data.videos || [];
  const audios = result.data.audios || [];
  
  console.log(`\nUser: ${result.user}`);
  console.log(`Total Images: ${images.length}`);
  console.log(`  - Direct: ${images.filter(i => i.source === 'direct').length}`);
  console.log(`  - Archive DB: ${images.filter(i => i.source === 'archive_db').length}`);
  console.log(`  - Archive Channel: ${images.filter(i => i.source === 'archive_channel').length}`);
  
  console.log(`Total Videos: ${videos.length}`);
  console.log(`Total Audios: ${audios.length}`);
  
  // Ephemeral media count
  const ephemeralCount = images.filter(i => i.metadata?.ephemeral).length;
  console.log(`Ephemeral Media: ${ephemeralCount}`);
}
```

---

## ✅ Summary:

**3-Layer Search System:**
1. **Direct Messages** - Real-time, current data
2. **Archive Database** - Rich metadata, TARGET_IDs only, deleted messages
3. **Archive Channels** - Full media archive, everyone

**Benefits:**
- 🎯 Comprehensive coverage
- 🔒 Privacy-aware
- 📊 Rich metadata
- ⚡ Parallel execution
- 🛡️ Error resilient

Endi media qidiruv to'liq va ishonchli! 🎉
