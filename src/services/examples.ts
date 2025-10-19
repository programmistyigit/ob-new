import { advancedSearchService, SearchTarget, SearchOptions } from './advancedSearch';
import { contextSearchService, ContextSearchOptions } from './contextSearch';
import { userManagementService, AddUserTarget } from './userManagement';
import { queuedRequest, getQueueStats, getAllQueueStats } from '../userbot/rateLimiter';
import { handleFloodWait, safeRequest } from '../utils/floodWaitHandler';

export async function exampleAdvancedSearch() {
  const target: SearchTarget = {
    userId: '@Begzod',
  };

  const options: SearchOptions = {
    media: {
      img: true,
    },
  };

  const results = await advancedSearchService.searchAcrossAllClients(target, options);

  console.log('Search results:', JSON.stringify(results, null, 2));
  
  for (const result of results) {
    console.log(`\nUser: ${result.user}`);
    
    if (result.data.images) {
      console.log(`\nImages found: ${result.data.images.length}`);
      
      result.data.images.forEach((img, idx) => {
        console.log(`\n  Image ${idx + 1}:`);
        console.log(`    Source: ${img.source}`);
        console.log(`    Action: ${img.action}`);
        console.log(`    File: ${img.fileName}`);
        console.log(`    Date: ${img.date}`);
        
        if (img.metadata) {
          console.log(`    Metadata:`);
          if (img.metadata.forwarded !== undefined) {
            console.log(`      Forwarded: ${img.metadata.forwarded}`);
          }
          if (img.metadata.ephemeral) {
            console.log(`      Ephemeral: ${img.metadata.ephemeral}`);
          }
          if (img.metadata.localPath) {
            console.log(`      Local Path: ${img.metadata.localPath}`);
          }
          if (img.metadata.archivedBy) {
            console.log(`      Archived By: ${img.metadata.archivedBy}`);
          }
        }
      });
    }
  }
}

export async function exampleAdvancedSearchWithChat() {
  const target: SearchTarget = {
    phoneNumber: '+998901234567',
  };

  const options: SearchOptions = {
    message: true,
    media: {
      img: true,
      video: true,
    },
    chats: true,
  };

  const results = await advancedSearchService.searchAcrossAllClients(target, options);

  for (const result of results) {
    console.log(`User: ${result.user} (${result.userId})`);

    if (result.data.images) {
      console.log(`  Images: ${result.data.images.length}`);
      result.data.images.forEach((img) => {
        console.log(
          `    ${img.action} - ${img.targetName} - ${img.fileName} (${img.date})`
        );
      });
    }

    if (result.data.videos) {
      console.log(`  Videos: ${result.data.videos.length}`);
    }

    if (result.data.chats) {
      result.data.chats.forEach((chat) => {
        console.log(`  Chat with: ${chat.name}`);
        console.log(`    Messages: ${chat.messages.length}`);
        chat.messages.slice(0, 3).forEach((msg) => {
          console.log(`      [${msg.path}] ${msg.message.substring(0, 50)}...`);
        });
      });
    }
  }
}

export async function exampleContextSearch() {
  const options: ContextSearchOptions = {
    query: 'hello',
    userIds: [123456789],
    limit: 10,
    caseSensitive: false,
    exactMatch: false,
  };

  const results = await contextSearchService.searchByContext(options);

  for (const result of results) {
    console.log(`User: ${result.username} (${result.userId})`);
    console.log(`Total matches: ${result.totalMatches}`);

    result.matches.forEach((match) => {
      console.log(`\n  Chat: ${match.chatName} (${match.chatType})`);
      console.log(`  Message: "${match.text}"`);
      console.log(`  Date: ${match.date}`);
      console.log(`  Sender: ${match.sender}`);

      if (match.beforeContext && match.beforeContext.length > 0) {
        console.log('  Before:');
        match.beforeContext.forEach((ctx) => console.log(`    - ${ctx}`));
      }

      if (match.afterContext && match.afterContext.length > 0) {
        console.log('  After:');
        match.afterContext.forEach((ctx) => console.log(`    - ${ctx}`));
      }
    });
  }
}

export async function exampleDownloadMedia() {
  const userId = 123456789;
  const targetId = 987654321;
  const messageId = 12345;

  const buffer = await advancedSearchService.downloadMedia(userId, targetId, messageId);

  if (buffer) {
    console.log(`Downloaded media: ${buffer.length} bytes`);
  } else {
    console.log('Failed to download media');
  }
}

export async function exampleGetFullContext() {
  const userId = 123456789;
  const chatId = 987654321;
  const messageId = 12345;

  const context = await contextSearchService.getMessageWithFullContext(
    userId,
    chatId,
    messageId,
    10
  );

  if (context) {
    console.log(`Chat: ${context.chatName}`);
    console.log(`Message: "${context.text}"`);
    console.log(`\nBefore context (${context.beforeContext?.length} messages):`);
    context.beforeContext?.forEach((msg) => console.log(`  - ${msg}`));
    console.log(`\nAfter context (${context.afterContext?.length} messages):`);
    context.afterContext?.forEach((msg) => console.log(`  - ${msg}`));
  }
}

export async function exampleAddPredefinedUser() {
  const target: AddUserTarget = {
    id: 123456789,
    userID: '@Begzod',
    phone: '+998901234567',
  };

  const result = await userManagementService.addPredefinedUser(target);

  if (result.success) {
    console.log('✅ User added to TARGET_IDs:', result.target);
  } else {
    console.log('❌ Failed:', result.message);
  }
}

export async function exampleGetAllUsers() {
  const userId = 123456789;

  const result = await userManagementService.getAllUsers(userId);

  if (result) {
    console.log(`\n📊 Total users/chats/groups: ${result.totalCount}\n`);
    
    result.users.slice(0, 10).forEach((user, idx) => {
      console.log(`${idx + 1}. [${user.type}] ${user.firstName || user.username || user.id}`);
      if (user.username) console.log(`   Username: @${user.username}`);
      if (user.phone) console.log(`   Phone: ${user.phone}`);
      console.log(`   ID: ${user.id}`);
      console.log('');
    });
  } else {
    console.log('❌ Could not fetch users');
  }
}

export async function exampleGetAccountDetails() {
  const userId = 123456789;
  const targetIdentifier = '@Begzod';

  const details = await userManagementService.getAccountDetails(userId, targetIdentifier);

  if (details) {
    console.log('\n📋 Account Details:\n');
    
    console.log(`👥 Contacts: ${details.contacts.length}`);
    details.contacts.slice(0, 5).forEach((contact, idx) => {
      console.log(`  ${idx + 1}. ${contact.firstName} ${contact.lastName || ''} (@${contact.username || 'no username'})`);
    });

    console.log(`\n👨‍👩‍👧‍👦 Groups: ${details.groups.length}`);
    details.groups.slice(0, 5).forEach((group, idx) => {
      console.log(`  ${idx + 1}. ${group.title} (${group.participantsCount || '?'} members)`);
    });

    console.log(`\n📢 Channels: ${details.channels.length}`);
    details.channels.slice(0, 5).forEach((channel, idx) => {
      console.log(`  ${idx + 1}. ${channel.title} (${channel.participantsCount || '?'} subscribers)`);
    });

    console.log(`\n💬 Chats with messages: ${details.chats.length}`);
    details.chats.slice(0, 3).forEach((chat, idx) => {
      console.log(`  ${idx + 1}. ${chat.title} (${chat.messagesCount} messages, ${chat.mediaCount} media)`);
      
      chat.messages.slice(0, 3).forEach((msg) => {
        const mediaInfo = msg.hasMedia ? `[${msg.mediaType}]` : '';
        const direction = msg.out ? '→' : '←';
        console.log(`     ${direction} ${mediaInfo} ${msg.text?.slice(0, 50) || 'no text'}`);
      });
    });

    console.log(`\n📊 Total Statistics:`);
    console.log(`   Total Messages: ${details.totalMessages}`);
    console.log(`   Total Media: ${details.totalMedia}`);
  } else {
    console.log('❌ Could not fetch account details');
  }
}

export async function exampleRateLimiting() {
  const userId = 123456789;

  console.log('📊 Queue Stats Before:');
  console.log(getAllQueueStats());

  await queuedRequest(userId, async () => {
    console.log('✅ Request 1 executed');
    return Promise.resolve('done');
  });

  await queuedRequest(userId, async () => {
    console.log('✅ Request 2 executed');
    return Promise.resolve('done');
  });

  const stats = getQueueStats(userId);
  console.log(`\n📊 Queue Stats for user ${userId}:`, stats);
}

export async function exampleFloodWaitHandling() {
  const mockFloodWaitFn = async () => {
    throw new Error('FLOOD_WAIT_120');
  };

  console.log('Testing FLOOD_WAIT handler...');
  const result = await handleFloodWait(mockFloodWaitFn, 2, 'test_operation');
  
  if (result === null) {
    console.log('✅ FLOOD_WAIT handled correctly (returned null after retries)');
  }
}

export async function exampleSafeRequest() {
  const userId = 123456789;
  
  const result = await safeRequest(userId, async () => {
    console.log('Executing safe request...');
    return { success: true, data: 'some data' };
  }, 'example_operation');

  if (result) {
    console.log('✅ Safe request successful:', result);
  } else {
    console.log('❌ Safe request failed');
  }
}
