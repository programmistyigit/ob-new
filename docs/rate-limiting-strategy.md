# Telegram Rate Limiting & IP Blocking Prevention

## ⚠️ Xavf: IP va Account Bloklash

### **Ha, IP bloklanishi mumkin agar:**

1. **Juda ko'p requestlar** - 30+ message/minute bitta accountdan
2. **Juda ko'p connectionlar** - Bir IP dan ko'p transport connection
3. **Flood Wait ignore qilish** - Error ni e'tiborsiz qoldirish
4. **Yangi accountlar** - Temp SMS dan olingan accountlar tezroq bloklanadi

---

## 📊 Telegram Rate Limits (2025)

### **Bot API Limits:**
```
✅ ~30 messages/second turli userlarga
✅ 1 message/second bitta chatga
✅ 20 messages/minute bitta guruhga
✅ 100 concurrent connections max

⚠️ Limit BOT_TOKEN ga bog'liq, IP ga emas
```

### **User API (MTProto - Userbot) Limits:**
```
⚠️ ~30 messages/minute - xavfsiz chegara
⚠️ 40-50 messages - SLOW_MODE boshlanadi
⚠️ 50+ messages - FLOOD_WAIT_ERROR (majburiy kutish)

🔴 Error 429 (Transport Flood) - IP level block!
   - Juda ko'p transport connection bir IPdan
   - Barcha accountlar bloklanadi
```

### **Account Age Factor:**
```
🆕 Yangi account (temp SMS): ~5 message keyin limit
📅 Aged account (2+ yil): Oylab ishlaydi
💎 Premium + Aged: Eng ko'p limit (recommended!)
```

---

## 🚨 Error Codes

| Error | Code | Ma'nosi | Javob |
|-------|------|---------|--------|
| `FLOOD_WAIT_X` | 420 | X sekund kutish | Sleep X sekund, keyin retry |
| `Too Many Requests` | 429 | **IP-level limit!** | Barcha activityni to'xtat |
| `SLOW_MODE` | - | Sekinlashtirilgan | Delay oshir |

### **Penalty Scale:**
```
1-chi marta: 60-300 sekund
Takroriy: 70,000+ sekund (~19 soat!)
Severe: Temporary IP/account ban
```

---

## ✅ OblivionLog uchun Prevention Strategy

### **1. Request Queue System (RECOMMENDED)**

Har bir userbot uchun queue:

```typescript
// src/userbot/rateLimiter.ts
import PQueue from 'p-queue';

const queueMap = new Map<number, PQueue>();

export function getUserQueue(userId: number): PQueue {
  if (!queueMap.has(userId)) {
    queueMap.set(userId, new PQueue({
      interval: 60000,      // 1 minute
      intervalCap: 25,      // Max 25 requests/minute (safe margin)
      concurrency: 1,       // One at a time
    }));
  }
  return queueMap.get(userId)!;
}

export async function queuedRequest<T>(
  userId: number, 
  fn: () => Promise<T>
): Promise<T> {
  const queue = getUserQueue(userId);
  return queue.add(fn);
}
```

### **2. Flood Wait Handler**

```typescript
// src/utils/floodWaitHandler.ts
import { createLogger } from './logger';

const logger = createLogger('FloodWaitHandler');

export async function handleFloodWait<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T | null> {
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.message?.includes('FLOOD_WAIT')) {
        const waitMatch = error.message.match(/FLOOD_WAIT_(\\d+)/);
        if (waitMatch) {
          const waitTime = parseInt(waitMatch[1]);
          logger.warn({ waitTime, retries }, 'FLOOD_WAIT detected, sleeping');
          
          // Sleep + 10% buffer
          await new Promise(resolve => setTimeout(resolve, (waitTime + 5) * 1000));
          retries++;
          continue;
        }
      }
      
      if (error.code === 429) {
        logger.error('ERROR 429: IP-level block! Stopping all activity.');
        throw new Error('IP_BLOCKED: Stop all clients immediately!');
      }
      
      throw error;
    }
  }
  
  logger.error('Max retries reached for FLOOD_WAIT');
  return null;
}
```

### **3. Message Sending with Queue**

```typescript
// src/userbot/archiveHandler.ts (yangilash kerak)

import { queuedRequest } from './rateLimiter';
import { handleFloodWait } from '../utils/floodWaitHandler';

// Old:
// await client.sendMessage(channelPeer, { message: text });

// New:
await queuedRequest(userId, async () => {
  return handleFloodWait(async () => {
    return client.sendMessage(channelPeer, { message: text });
  });
});
```

---

## 🏗️ Distributed Architecture (50k+ Users uchun)

### **Problem:**
```
1 IP → 100 userbot → Har biri 30 msg/min
= 3000 requests/minute bir IPdan
= 🔴 IP BLOCKED!
```

### **Solution: Multi-IP Distribution**

#### **Option 1: Proxy Rotation**
```typescript
// src/userbot/proxyManager.ts
interface ProxyConfig {
  ip: string;
  port: number;
  secret?: string;
}

const proxyPool: ProxyConfig[] = [
  { ip: '1.2.3.4', port: 443 },
  { ip: '5.6.7.8', port: 443 },
  // ... more proxies
];

export function getProxyForUser(userId: number): ProxyConfig {
  const index = userId % proxyPool.length;
  return proxyPool[index];
}

// Use when creating client:
const client = new TelegramClient(
  session,
  apiId,
  apiHash,
  {
    connectionRetries: 5,
    useWSS: false,
    proxy: getProxyForUser(userId),  // ← Different proxy per user
  }
);
```

#### **Option 2: Multiple Replit Instances**
```
Instance 1 (IP: 1.2.3.4) → Users 1-1000
Instance 2 (IP: 5.6.7.8) → Users 1001-2000
Instance 3 (IP: 9.10.11.12) → Users 2001-3000
...
```

MongoDB bir xil bo'ladi, faqat userbot clientlar distributed.

#### **Option 3: Telegram Premium + Aged Accounts**
```
✅ Premium subscription → Higher limits
✅ Aged accounts (2+ years) → More trusted
✅ Each account: 30 msg/min safely

50,000 users ÷ 30 msg/min = ~1667 minutes per cycle
= ~28 hours for full cycle (acceptable!)
```

---

## 📈 Scaling Strategy

### **Phase 1: 0-100 Users (Current)**
```
✅ Single IP
✅ Basic queue (25 msg/min per account)
✅ Flood wait handling
✅ No proxy needed
```

### **Phase 2: 100-1,000 Users**
```
✅ Rate limiter per account
✅ Monitoring dashboard
✅ Alert on FLOOD_WAIT
⚠️ Consider proxy if >500 concurrent users
```

### **Phase 3: 1,000-10,000 Users**
```
⚠️ **MUST USE PROXIES or Multiple IPs**
✅ 10 proxies → 100 accounts each
✅ Load balancer
✅ Auto-pause on Error 429
```

### **Phase 4: 10,000-50,000 Users**
```
🔴 **DISTRIBUTED ARCHITECTURE REQUIRED**
✅ Multiple Replit instances or VPS
✅ 50+ proxies (MTProto proxies)
✅ Central MongoDB
✅ Auto-scaling based on load
✅ Premium accounts only
```

---

## 🔍 Monitoring & Alerts

### **Dashboard Metrics:**
```typescript
interface RateLimitMetrics {
  userId: number;
  requestsPerMinute: number;
  floodWaitCount: number;
  lastFloodWaitTime?: number;
  totalRequests: number;
  blockedUntil?: Date;
}

// Track in Redis or MongoDB
const metrics = new Map<number, RateLimitMetrics>();

// Alert if:
- FLOOD_WAIT > 1000 sekund → Critical
- Error 429 → STOP ALL
- Same account 3+ FLOOD_WAIT in 1 hour → Pause account
```

### **Auto-Pause System:**
```typescript
// If IP blocked (Error 429):
1. Stop ALL userbot clients
2. Wait penalty time (check error message)
3. Log incident
4. Alert admin
5. Resume after penalty + 10 minutes buffer
```

---

## 🛡️ Best Practices Summary

### **DO ✅**
1. **Queue all requests** - Never direct send
2. **Respect FLOOD_WAIT** - Always sleep full duration + buffer
3. **Use aged accounts** - 2+ years old preferred
4. **Add delays** - 2-3 seconds between actions
5. **Monitor metrics** - Track FLOOD_WAIT frequency
6. **Distribute load** - Use proxies or multiple IPs for 1k+ users
7. **Premium accounts** - Higher limits, worth it for scaling
8. **Exponential backoff** - Increase delays on repeated errors

### **DON'T ❌**
1. **Ignore errors** - Never retry immediately on FLOOD_WAIT
2. **Aggressive loops** - No tight loops without delays
3. **Same chat spam** - >1 msg/sec to same chat
4. **New accounts** - Temp SMS accounts get blocked fast
5. **Bypass limits** - Don't try to "hack" around limits
6. **Multiple connections** - Don't open many connections from 1 IP

---

## 💡 OblivionLog Implementation Plan

### **Immediate (Now - 100 users):**
```typescript
1. ✅ Add PQueue rate limiter per user
2. ✅ Implement FLOOD_WAIT handler with retry
3. ✅ Add 2-3 second delays between archive operations
4. ✅ Log all FLOOD_WAIT incidents
```

### **Near Future (100-1000 users):**
```typescript
1. ⚠️ Monitoring dashboard (FLOOD_WAIT frequency)
2. ⚠️ Auto-pause accounts with repeated violations
3. ⚠️ Alert system (Telegram notification to admin)
4. ⚠️ Consider proxy pool if >500 users
```

### **Long Term (1000+ users):**
```typescript
1. 🔴 Distributed architecture (multiple instances)
2. 🔴 Proxy rotation (MTProto proxies)
3. 🔴 Load balancer
4. 🔴 Premium account requirement
5. 🔴 Auto-scaling based on metrics
```

---

## 📊 Cost Estimate for Scaling

### **Option 1: Proxies**
```
- MTProto Proxy: $5-10/month per proxy
- 10 proxies: $50-100/month (supports 1000 users)
- 50 proxies: $250-500/month (supports 10k+ users)
```

### **Option 2: Multiple Replit Instances**
```
- Replit Core: $20/month per instance
- 5 instances: $100/month (supports 500 users each = 2500 total)
- 20 instances: $400/month (supports 10k users)
```

### **Option 3: VPS + Proxies (Best for 10k+)**
```
- VPS (8GB RAM): $40/month
- 50 MTProto proxies: $250/month
- Total: $290/month for 10k+ users
```

---

## ✅ Conclusion

**Current Status:**
- ✅ Single IP works for 100-500 users
- ✅ Basic rate limiting needed NOW
- ⚠️ Proxies needed at 500-1000 users
- 🔴 Distributed architecture needed at 5k+ users

**Immediate Action:**
1. Implement rate limiter (PQueue)
2. Add FLOOD_WAIT handler
3. Monitor metrics
4. Plan for proxy integration

**Key Takeaway:**
> IP bloklanmaydi agar to'g'ri rate limiting va queue system bo'lsa. Lekin 1000+ users uchun proxy yoki distributed architecture **SHART**!

🎯 **50k users uchun = Distributed + Proxies + Premium accounts + Monitoring**
