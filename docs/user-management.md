# User Management Service

## 🎯 Overview

User Management Service - bu 3 ta asosiy funksiyani taqdim etadi:

1. **addPredefinedUser** - TARGET_IDs ga user qo'shish
2. **getAllUsers** - Barcha userlar/chatlar/guruhlar soni va ismlari
3. **getAccountDetails** - Account ma'lumotlari (kontaktlar, guruhlar, chatlar, messagelar, medialar)

---

## 📋 Functions

### 1. **addPredefinedUser(target: AddUserTarget)**

TARGET_IDs ro'yxatiga user qo'shadi. Qo'shilgan userlarning barcha media fayllari permanent storage ga saqlanadi va ma'lumotlari MongoDB da saqlanadi.

#### Parameters:
```typescript
interface AddUserTarget {
  id?: number;          // Telegram user ID
  userID?: string;      // Username (@username)
  phone?: string;       // Phone number (+998...)
}
```

#### Returns:
```typescript
interface AddUserResult {
  success: boolean;
  message: string;
  target?: AddUserTarget;
}
```

#### Example:
```typescript
import { userManagementService } from './services';

const result = await userManagementService.addPredefinedUser({
  id: 123456789,
  userID: '@Begzod',
  phone: '+998901234567',
});

if (result.success) {
  console.log('✅ User added:', result.target);
} else {
  console.log('❌ Error:', result.message);
}
```

#### Notes:
- Kamida bitta identifier (id, userID, yoki phone) talab qilinadi
- Agar user allaqachon ro'yxatda bo'lsa, `success: false` qaytaradi
- Ma'lumotlar `target_ids.json` faylida saqlanadi (gitignore)

---

### 2. **getAllUsers(userId: number)**

Berilgan user accountidagi barcha userlar, chatlar va guruhlarni qaytaradi.

#### Parameters:
- `userId: number` - Active userbot client ning ID si

#### Returns:
```typescript
interface AllUsersResult {
  totalCount: number;
  users: UserInfo[];
}

interface UserInfo {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  isBot: boolean;
  type: 'user' | 'group' | 'channel';
}
```

#### Example:
```typescript
const result = await userManagementService.getAllUsers(123456789);

if (result) {
  console.log(`Total: ${result.totalCount}`);
  
  result.users.forEach(user => {
    console.log(`[${user.type}] ${user.firstName || user.username}`);
    console.log(`  ID: ${user.id}`);
    if (user.username) console.log(`  @${user.username}`);
    if (user.phone) console.log(`  ${user.phone}`);
  });
}
```

#### Output Example:
```
📊 Total users/chats/groups: 234

1. [user] Begzod
   Username: @Begzod
   Phone: +998901234567
   ID: 123456789

2. [group] Developers Group
   ID: 987654321

3. [channel] News Channel
   Username: @newschannel
   ID: 456789123
```

---

### 3. **getAccountDetails(userId: number, targetIdentifier: number | string)**

Berilgan account yoki guruh haqida batafsil ma'lumot oladi:
- Kontaktlar
- Guruhlar
- Kanallar
- Chatlar va messagelar
- Media statistikasi

#### Parameters:
- `userId: number` - Active userbot client ning ID si
- `targetIdentifier: number | string` - Target ID yoki username

#### Returns:
```typescript
interface AccountDetails {
  contacts: ContactInfo[];        // Kontaktlar
  groups: GroupInfo[];            // Guruhlar
  channels: GroupInfo[];          // Kanallar
  chats: ChatDetails[];           // Chatlar va messagelar
  totalMessages: number;          // Jami messagelar
  totalMedia: number;            // Jami medialar
}

interface ContactInfo {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  isBot: boolean;
  mutual: boolean;               // Mutual contact (ikki tomonlama)
}

interface GroupInfo {
  id: number;
  title: string;
  username?: string;
  participantsCount?: number;
  type: 'group' | 'supergroup' | 'channel';
}

interface ChatDetails {
  id: number;
  title?: string;
  type: 'user' | 'group' | 'channel';
  messagesCount: number;
  mediaCount: number;
  messages: MessageInfo[];
}

interface MessageInfo {
  id: number;
  text?: string;
  date: Date;
  out: boolean;                  // Outgoing message
  hasMedia: boolean;
  mediaType?: string;            // 'photo' | 'video' | 'document' | 'audio'
}
```

#### Example:
```typescript
const details = await userManagementService.getAccountDetails(
  123456789,
  '@Begzod'
);

if (details) {
  console.log('📋 Account Details:\n');
  
  console.log(`👥 Contacts: ${details.contacts.length}`);
  details.contacts.slice(0, 5).forEach(contact => {
    console.log(`  - ${contact.firstName} (@${contact.username})`);
  });

  console.log(`\n👨‍👩‍👧‍👦 Groups: ${details.groups.length}`);
  details.groups.slice(0, 5).forEach(group => {
    console.log(`  - ${group.title} (${group.participantsCount} members)`);
  });

  console.log(`\n📢 Channels: ${details.channels.length}`);
  
  console.log(`\n💬 Chats: ${details.chats.length}`);
  details.chats.forEach(chat => {
    console.log(`  - ${chat.title}`);
    console.log(`    Messages: ${chat.messagesCount}`);
    console.log(`    Media: ${chat.mediaCount}`);
  });

  console.log(`\n📊 Total:`);
  console.log(`  Messages: ${details.totalMessages}`);
  console.log(`  Media: ${details.totalMedia}`);
}
```

#### Output Example:
```
📋 Account Details:

👥 Contacts: 45
  1. Begzod (@Begzod)
  2. Alice Smith (@alice)
  3. Bob Johnson (no username)
  4. Charlie Brown (@charlie)
  5. Diana Prince (@wonder)

👨‍👩‍👧‍👦 Groups: 12
  1. Developers Group (150 members)
  2. Family Chat (5 members)
  3. Work Team (25 members)
  4. Friends (30 members)
  5. Study Group (20 members)

📢 Channels: 8
  1. News Channel (5000 subscribers)
  2. Tech Updates (3000 subscribers)
  3. Daily News (1000 subscribers)

💬 Chats with messages: 25
  1. Begzod (543 messages, 120 media)
     → [photo] Check this out!
     ← Hello! How are you?
     → Great, thanks!

  2. Developers Group (1234 messages, 450 media)
     ← [document] project_report.pdf
     → Let's discuss this tomorrow
     ← Sounds good!

  3. Family Chat (890 messages, 200 media)
     → [video] birthday_celebration.mp4
     ← Happy birthday!
     → Thank you all!

📊 Total Statistics:
   Total Messages: 15,430
   Total Media: 3,245
```

---

## 🔄 Use Cases

### **Use Case 1: TARGET_ID qo'shish**

User Begzod ni TARGET_ID qilib belgilash uchun:

```typescript
const result = await userManagementService.addPredefinedUser({
  userID: '@Begzod',
});

// Result:
// ✅ User added to TARGET_IDs
// - Media permanent storage ga saqlanadi
// - MongoDB da metadata saqlanadi
```

### **Use Case 2: Barcha kontaktlarni ko'rish**

```typescript
const users = await userManagementService.getAllUsers(myUserId);

// Filter by type:
const onlyUsers = users?.users.filter(u => u.type === 'user');
const onlyGroups = users?.users.filter(u => u.type === 'group');
const onlyChannels = users?.users.filter(u => u.type === 'channel');

console.log(`Users: ${onlyUsers?.length}`);
console.log(`Groups: ${onlyGroups?.length}`);
console.log(`Channels: ${onlyChannels?.length}`);
```

### **Use Case 3: Guruh ma'lumotlarini olish**

```typescript
const details = await userManagementService.getAccountDetails(
  myUserId,
  -1001234567890  // Group ID (negative number)
);

if (details) {
  console.log('Group participants:', details.contacts.length);
  console.log('Total messages:', details.totalMessages);
  console.log('Total media:', details.totalMedia);
  
  // Find most active members:
  const messagesByUser = new Map<number, number>();
  
  details.chats.forEach(chat => {
    chat.messages.forEach(msg => {
      if (!msg.out) {  // Incoming messages
        const count = messagesByUser.get(chat.id) || 0;
        messagesByUser.set(chat.id, count + 1);
      }
    });
  });
  
  console.log('Most active members:', Array.from(messagesByUser.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  );
}
```

### **Use Case 4: User statistikasi**

```typescript
const details = await userManagementService.getAccountDetails(
  myUserId,
  '@Begzod'
);

if (details) {
  // Message types analysis
  let photoCount = 0;
  let videoCount = 0;
  let documentCount = 0;
  
  details.chats.forEach(chat => {
    chat.messages.forEach(msg => {
      if (msg.mediaType === 'photo') photoCount++;
      if (msg.mediaType === 'video') videoCount++;
      if (msg.mediaType === 'document') documentCount++;
    });
  });
  
  console.log('Media breakdown:');
  console.log(`  Photos: ${photoCount}`);
  console.log(`  Videos: ${videoCount}`);
  console.log(`  Documents: ${documentCount}`);
  
  // Message activity by time
  const messagesByHour = new Array(24).fill(0);
  
  details.chats.forEach(chat => {
    chat.messages.forEach(msg => {
      const hour = msg.date.getHours();
      messagesByHour[hour]++;
    });
  });
  
  console.log('\nMost active hours:');
  messagesByHour.forEach((count, hour) => {
    if (count > 0) {
      console.log(`  ${hour}:00 - ${count} messages`);
    }
  });
}
```

---

## ⚠️ Important Notes

### **1. TARGET_IDs System:**
- Faqat TARGET_IDs ro'yxatidagi userlarning media fayllari permanent storage ga saqlanadi
- `target_ids.json` faylida saqlanadi (gitignore)
- Auto-resolve: agar faqat username berilsa, ID keyin avtomatik resolve bo'ladi

### **2. Performance:**
- `getAllUsers` - tez (faqat dialog list)
- `getAccountDetails` - sekinroq (har bir chatdan messagelar oladi)
- Limit: Har bir chatdan 100 ta message (User uchun), 1000 ta (Group/Channel uchun)

### **3. Privacy:**
- Har bir user faqat o'z accountining ma'lumotlarini ko'ra oladi
- Boshqa userlarning private ma'lumotlari ko'rinmaydi
- `getAccountDetails` faqat accessible chatlarni ko'rsatadi

### **4. Error Handling:**
- Agar client topilmasa: `null` qaytaradi
- Entity topilmasa: `null` qaytaradi
- Permission yo'q bo'lsa: warning log, lekin boshqa ma'lumotlar qaytariladi

---

## 📊 Combined Workflow Example

```typescript
// Step 1: Get all users
const allUsers = await userManagementService.getAllUsers(myUserId);

if (allUsers) {
  console.log(`Found ${allUsers.totalCount} users/chats/groups`);
  
  // Step 2: Filter users with username
  const usersWithUsername = allUsers.users.filter(u => u.username);
  
  // Step 3: Add important users to TARGET_IDs
  for (const user of usersWithUsername.slice(0, 5)) {
    const result = await userManagementService.addPredefinedUser({
      id: user.id,
      userID: user.username,
    });
    
    if (result.success) {
      console.log(`✅ Added ${user.username} to TARGET_IDs`);
      
      // Step 4: Get detailed info
      const details = await userManagementService.getAccountDetails(
        myUserId,
        user.id
      );
      
      if (details) {
        console.log(`  Messages: ${details.totalMessages}`);
        console.log(`  Media: ${details.totalMedia}`);
      }
    }
  }
}
```

---

## ✅ Summary

**User Management Service provides:**

1. **addPredefinedUser** - TARGET_IDs ga user qo'shish
   - Permanent storage
   - MongoDB metadata
   - Flexible identifiers (id/username/phone)

2. **getAllUsers** - Barcha dialogs ro'yxati
   - Users, groups, channels
   - Type filtering
   - Fast execution

3. **getAccountDetails** - Batafsil ma'lumot
   - Contacts
   - Groups/Channels
   - Messages/Media
   - Statistics

**Key Features:**
- 🎯 Flexible user identification
- 📊 Rich statistics
- 🔒 Privacy-aware
- ⚡ Efficient queries
- 🛡️ Error resilient

Endi user management to'liq tayyor! 🎉
