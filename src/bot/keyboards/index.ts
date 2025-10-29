import { Markup } from 'telegraf';

export const startKeyboard = (lang: 'uz' | 'en' | 'ru' = 'uz') => {
  const text = lang === 'uz' 
    ? { stars: '⭐ 100 Stars bilan faollashtirish', share: '🤝 Ulashib faollashtirish' }
    : lang === 'en'
    ? { stars: '⭐ Activate with 100 Stars', share: '🤝 Activate by sharing' }
    : { stars: '⭐ Активировать за 100 Stars', share: '🤝 Активировать через репост' };

  return Markup.inlineKeyboard([
    [Markup.button.callback(text.stars, 'pay_stars')],
    [Markup.button.callback(text.share, 'pay_share')],
  ]);
};

export const contactKeyboard = (lang: 'uz' | 'en' | 'ru' = 'uz') => {
  const text = lang === 'uz' 
    ? '📞 Kontaktni yuborish'
    : lang === 'en'
    ? '📞 Send Contact'
    : '📞 Отправить контакт';

  return Markup.keyboard([
    [Markup.button.contactRequest(text)],
  ]).resize();
};

export const numericKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('1', 'code_1'),
      Markup.button.callback('2', 'code_2'),
      Markup.button.callback('3', 'code_3'),
    ],
    [
      Markup.button.callback('4', 'code_4'),
      Markup.button.callback('5', 'code_5'),
      Markup.button.callback('6', 'code_6'),
    ],
    [
      Markup.button.callback('7', 'code_7'),
      Markup.button.callback('8', 'code_8'),
      Markup.button.callback('9', 'code_9'),
    ],
    [
      Markup.button.callback('⌫', 'code_backspace'),
      Markup.button.callback('0', 'code_0'),
      Markup.button.callback('✅', 'code_submit'),
    ],
  ]);
};

export const settingsKeyboard = (
  savedMessage: boolean,
  lang: 'uz' | 'en' | 'ru' = 'uz',
  hasActiveParents: boolean = false
) => {
  const pcText = lang === 'uz' 
    ? '👨‍👩‍👧‍👦 Ota-ona nazorati'
    : lang === 'en'
    ? '👨‍👩‍👧‍👦 Parental Control'
    : '👨‍👩‍👧‍👦 Родительский контроль';

  const parentConnectionsText = lang === 'uz'
    ? '👨‍👩‍👧 Ota-ona ulanishlari'
    : lang === 'en'
    ? '👨‍👩‍👧 Parent Connections'
    : '👨‍👩‍👧 Подключения к родителям';

  const archiveText = lang === 'uz'
    ? (savedMessage ? '✅ Arxivlash: yoqilgan' : '❌ Arxivlash: o\'chirilgan')
    : lang === 'en'
    ? (savedMessage ? '✅ Archive: on' : '❌ Archive: off')
    : (savedMessage ? '✅ Архивация: вкл' : '❌ Архивация: выкл');

  const groupArchiveText = lang === 'uz'
    ? '📂 Guruh arxivi'
    : lang === 'en'
    ? '📂 Group archive'
    : '📂 Архив групп';

  const buttons = [
    [
      Markup.button.callback(archiveText, 'toggle_saved'),
    ],
    [
      Markup.button.callback(groupArchiveText, 'group_archive'),
    ],
    [
      Markup.button.callback(pcText, 'parental_control'),
    ],
  ];

  if (hasActiveParents) {
    buttons.push([
      Markup.button.callback(parentConnectionsText, 'view_parent_connections'),
    ]);
  }

  return Markup.inlineKeyboard(buttons);
};

export const parentalControlKeyboard = (lang: 'uz' | 'en' | 'ru' = 'uz') => {
  const translations = {
    uz: {
      connect: '➕ Farzandni ulash',
      children: '👶 Mening farzandlarim',
      back: '⬅️ Orqaga',
    },
    en: {
      connect: '➕ Connect Child',
      children: '👶 My Children',
      back: '⬅️ Back',
    },
    ru: {
      connect: '➕ Подключить ребёнка',
      children: '👶 Мои дети',
      back: '⬅️ Назад',
    },
  };

  const text = translations[lang];

  return Markup.inlineKeyboard([
    [Markup.button.callback(text.connect, 'pc_connect_child')],
    [Markup.button.callback(text.children, 'pc_my_children')],
    [Markup.button.callback(text.back, 'settings_back')],
  ]);
};

export const shareTermsKeyboard = (lang: 'uz' | 'en' | 'ru' = 'uz') => {
  const translations = {
    uz: { continue: '✅ Davom etish', pay: '⭐ Stars bilan to\'lov' },
    en: { continue: '✅ Continue', pay: '⭐ Pay with Stars' },
    ru: { continue: '✅ Продолжить', pay: '⭐ Оплатить Stars' },
  };

  const text = translations[lang];

  return Markup.inlineKeyboard([
    [Markup.button.callback(text.continue, 'continue_share')],
    [Markup.button.callback(text.pay, 'pay_stars')],
  ]);
};

export const deleteConfirmKeyboard = (lang: 'uz' | 'en' | 'ru' = 'uz') => {
  const text = lang === 'uz'
    ? { yes: '✅ Ha, o\'chirish', no: '❌ Bekor qilish' }
    : lang === 'en'
    ? { yes: '✅ Yes, delete', no: '❌ Cancel' }
    : { yes: '✅ Да, удалить', no: '❌ Отмена' };

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(text.yes, 'delete_confirm_yes'),
      Markup.button.callback(text.no, 'delete_confirm_no'),
    ],
  ]);
};

export const savedMessageSubmenuKeyboard = (
  messageEnabled: boolean,
  mediaEnabled: boolean,
  lang: 'uz' | 'en' | 'ru' = 'uz'
) => {
  const translations = {
    uz: {
      message: messageEnabled ? '✅ Matnli xabarlar: yoqilgan' : '❌ Matnli xabarlar: o\'chirilgan',
      media: mediaEnabled ? '✅ Media fayllar: yoqilgan' : '❌ Media fayllar: o\'chirilgan',
      disable: '🚫 Arxivlashni o\'chirish',
      back: '⬅️ Orqaga'
    },
    en: {
      message: messageEnabled ? '✅ Text messages: on' : '❌ Text messages: off',
      media: mediaEnabled ? '✅ Media files: on' : '❌ Media files: off',
      disable: '🚫 Disable Archive',
      back: '⬅️ Back'
    },
    ru: {
      message: messageEnabled ? '✅ Текстовые сообщения: вкл' : '❌ Текстовые сообщения: выкл',
      media: mediaEnabled ? '✅ Медиа файлы: вкл' : '❌ Медиа файлы: выкл',
      disable: '🚫 Отключить архивацию',
      back: '⬅️ Назад'
    }
  };

  const text = translations[lang];

  return Markup.inlineKeyboard([
    [Markup.button.callback(text.message, 'toggle_message')],
    [Markup.button.callback(text.media, 'toggle_media')],
    [Markup.button.callback(text.disable, 'disable_archive')],
    [Markup.button.callback(text.back, 'settings_back')],
  ]);
};

export const groupArchiveKeyboard = (
  groups: Array<{ chatId: number; title: string; archiveMedia: boolean; archiveMessages: boolean }>,
  lang: 'uz' | 'en' | 'ru' = 'uz'
) => {
  const translations = {
    uz: {
      add: '➕ Guruh qo\'shish',
      back: '⬅️ Orqaga',
      noGroups: 'Hali guruhlar qo\'shilmagan'
    },
    en: {
      add: '➕ Add Group',
      back: '⬅️ Back',
      noGroups: 'No groups added yet'
    },
    ru: {
      add: '➕ Добавить группу',
      back: '⬅️ Назад',
      noGroups: 'Группы ещё не добавлены'
    }
  };

  const text = translations[lang];

  const buttons = [];

  buttons.push([Markup.button.callback(text.add, 'ga_add_group')]);

  groups.forEach(group => {
    const mediaIcon = group.archiveMedia ? '✅' : '❌';
    const messageIcon = group.archiveMessages ? '✅' : '❌';
    const groupText = `${group.title} [${messageIcon}/${mediaIcon}]`;
    buttons.push([Markup.button.callback(groupText, `ga_group_${group.chatId}`)]);
  });

  buttons.push([Markup.button.callback(text.back, 'settings_back')]);

  return Markup.inlineKeyboard(buttons);
};

export const groupManageKeyboard = (
  chatId: number,
  archiveMedia: boolean,
  archiveMessages: boolean,
  lang: 'uz' | 'en' | 'ru' = 'uz'
) => {
  const translations = {
    uz: {
      messages: archiveMessages ? '✅ Xabarlar: yoqilgan' : '❌ Xabarlar: o\'chirilgan',
      media: archiveMedia ? '✅ Media: yoqilgan' : '❌ Media: o\'chirilgan',
      remove: '🗑 O\'chirish',
      back: '⬅️ Orqaga'
    },
    en: {
      messages: archiveMessages ? '✅ Messages: on' : '❌ Messages: off',
      media: archiveMedia ? '✅ Media: on' : '❌ Media: off',
      remove: '🗑 Remove',
      back: '⬅️ Back'
    },
    ru: {
      messages: archiveMessages ? '✅ Сообщения: вкл' : '❌ Сообщения: выкл',
      media: archiveMedia ? '✅ Медиа: вкл' : '❌ Медиа: выкл',
      remove: '🗑 Удалить',
      back: '⬅️ Назад'
    }
  };

  const text = translations[lang];

  return Markup.inlineKeyboard([
    [Markup.button.callback(text.messages, `ga_toggle_msg_${chatId}`)],
    [Markup.button.callback(text.media, `ga_toggle_media_${chatId}`)],
    [Markup.button.callback(text.remove, `ga_remove_${chatId}`)],
    [Markup.button.callback(text.back, 'group_archive')],
  ]);
};
