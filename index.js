require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message]
});

// ==== CONFIG ====

const GUILD_ID = '1463759149585141828';          // ProPath sunucusu
const WELCOME_CHANNEL_ID = '1475341839493238945'; // #welcome-start-here

const MENTEE_ROLE_ID = '1475669096082440333';       // Mentee
const MENTOR_ROLE_ID = '1475668627570036786';       // Mentor = Caseworker
const CASEWORKER_ROLE_ID = '1475668627570036786';   // Caseworker
const ADMIN_ROLE_ID = '1475668109372424275';        // Admin

// ==== READY: welcome mesajı (duplicate korumalı) ====

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.fetch(WELCOME_CHANNEL_ID);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('propath_join')
      .setLabel('Start ProPath Mentorship')
      .setStyle(ButtonStyle.Primary)
  );

  // Kanaldaki son mesajlara bak: bot daha önce butonlu mesaj göndermiş mi?
  const messages = await channel.messages.fetch({ limit: 50 });
  const existing = messages.find(
    (m) =>
      m.author.id === client.user.id &&
      m.components.length > 0 &&
      m.components[0].components.some(
        (c) => c.customId === 'propath_join'
      )
  );

  if (existing) {
    console.log('Welcome message already exists, not sending a new one.');
    return;
  }

  await channel.send({
    content:
      'Welcome to ProPath! 🎓\n\nClick the button below to create your private 1:1 mentorship channel.',
    components: [row]
  });
});

// ==== BUTTON HANDLER ====

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'propath_join') return;

  const guild = interaction.guild;
  const member = interaction.member;

  // Display name: nickname > global name > username
  const displayName =
    member.nickname || member.user.globalName || member.user.username;

  // --- 1) TÜM KANALLARI FETCH ET VE VAR OLAN 1:1 TEXT CHANNEL'I BUL ---
  const allChannels = await guild.channels.fetch(); // cache yerine API'den taze liste
  const existingTextChannel = [...allChannels.values()].find(
    (ch) =>
      ch &&
      ch.type === ChannelType.GuildText &&
      ch.topic &&
      ch.topic.startsWith(`MENTEE_${member.id}`)
  );

  if (existingTextChannel) {
    console.log(
      `Existing 1:1 channel found for ${member.id}: ${existingTextChannel.name}`
    );
    await interaction.reply({
      content: `You already have a 1:1 channel: ${existingTextChannel}.`,
      ephemeral: true
    });
    return;
  }

  // 2) Zaten mentee rolü varsa ikinci kez oluşturmaya izin verme
  if (member.roles.cache.has(MENTEE_ROLE_ID)) {
    await interaction.reply({
      content:
        'You are already registered as a mentee. Please use your existing 1:1 channel or contact an admin if something is wrong.',
      ephemeral: true
    });
    return;
  }

  // 3) Mentee rolü ver
  try {
    await member.roles.add(MENTEE_ROLE_ID);
  } catch (err) {
    console.error('Error while adding mentee role:', err);
    // Rol eklenemese bile kanalları oluşturmaya devam edelim
  }

  // 4) İsimleri hazırla
  const cleanName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // boşluk ve özel karakterleri "-" yap
    .replace(/^-|-$/g, ''); // baştaki/sondaki "-" leri temizle

  const baseChannelName = `1-1-${cleanName}`.slice(0, 90); // Discord limit güvenlik payı
  const categoryName = `1:1 - ${displayName}`;
  const channelTopic = `MENTEE_${member.id} | ${displayName}`;

  // Kategori + alt kanallar için ortak permissionOverwrites
  const permissionOverwrites = [
    {
      id: guild.roles.everyone,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks
      ]
    },
    {
      id: MENTOR_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },
    {
      id: CASEWORKER_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages
      ]
    },
    {
      id: ADMIN_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ManageChannels
      ]
    }
  ].filter((o) => o.id);

  // 5) Her mentee için ayrı CATEGORY oluştur
  const category = await guild.channels.create({
    name: categoryName, // örn. "1:1 - Talha Karal"
    type: ChannelType.GuildCategory,
    permissionOverwrites
  });

  // 6) Kategori altında TEXT channel
  const textChannel = await guild.channels.create({
    name: baseChannelName, // örn. "1-1-talha-karal"
    type: ChannelType.GuildText,
    parent: category.id,
    topic: channelTopic
  });

  // 7) Kategori altında VOICE channel
  const voiceChannel = await guild.channels.create({
    name: `${baseChannelName}-voice`, // örn. "1-1-talha-karal-voice"
    type: ChannelType.GuildVoice,
    parent: category.id
  });

  // 8) Açılış mesajları
  const welcomeMessage = await textChannel.send(
    `Welcome ${displayName}! 👋\n\n` +
      `This is your private 1:1 mentorship text channel.\n` +
      `You also have a private voice channel named **${voiceChannel.name}** inside the same category.\n\n` +
      `You can ask questions, share updates, and work with your mentor here.`
  );
  await welcomeMessage.pin();

  const roadmapMessage = await textChannel.send(
    `**ProPath Mentorship Roadmap**\n\n` +
      `1️⃣ **Setup** – Understanding your background and goals\n` +
      `2️⃣ **Preparation** – Self-discovery, career directions, and market research\n` +
      `3️⃣ **Capability Growth** – CV, LinkedIn, and skill-building\n` +
      `4️⃣ **Execution** – Applications, interview prep, and offer decisions\n` +
      `5️⃣ **Sustainability** – On-the-job support and long-term career growth\n\n` +
      `We will move through these phases together, step by step. 😊`
  );
  await roadmapMessage.pin();

  await interaction.reply({
    content: `Your private 1:1 channels have been created: ${textChannel} (text) and ${voiceChannel} (voice).`,
    ephemeral: true
  });
});

// ==== LOGIN ====

client.login(process.env.BOT_TOKEN);