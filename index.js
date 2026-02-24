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

// === CONFIG ===
const GUILD_ID = '1463759149585141828';          // Server
const WELCOME_CHANNEL_ID = '1475341839493238945'; // #welcome-start-here

const MENTEE_ROLE_ID = '1475669096082440333';       // Mentee
const MENTOR_ROLE_ID = '1475668627570036786';       // Mentor = Caseworker
const CASEWORKER_ROLE_ID = '1475668627570036786';   // Caseworker
const ADMIN_ROLE_ID = '1475668109372424275';        // Admin

// === ON READY: SEND WELCOME MESSAGE WITH BUTTON ===
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

  await channel.send({
    content: 'Welcome to ProPath! 🎓\n\nClick the button below to create your private 1:1 mentorship channel.',
    components: [row]
  });
});

// === BUTTON CLICK HANDLER ===
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'propath_join') return;

  const guild = interaction.guild;
  const member = interaction.member;

  // Display name: first try server nickname, then global name, then username
  const displayName = member.nickname || member.user.globalName || member.user.username;

  // 1) Check if a 1:1 text channel already exists for this mentee
  const existingChannel = guild.channels.cache.find(ch => 
    ch.type === ChannelType.GuildText &&
    ch.topic &&
    ch.topic.startsWith(`MENTEE_${member.id}`)
  );

  if (existingChannel) {
    await interaction.reply({ 
      content: `You already have a 1:1 channel: ${existingChannel}.`,
      ephemeral: true 
    });
    return;
  }

  // 2) If they already have the mentee role, don't let them create again
  if (member.roles.cache.has(MENTEE_ROLE_ID)) {
    await interaction.reply({
      content: 'You are already registered as a mentee. Please use your existing 1:1 channel or contact an admin if something is wrong.',
      ephemeral: true
    });
    return;
  }

  // 3) Give mentee role
  try {
    await member.roles.add(MENTEE_ROLE_ID);
  } catch (err) {
    console.error('Error while adding mentee role:', err);
  }

  // 4) Build base names
  const cleanName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // spaces & specials -> "-"
    .replace(/^-|-$/g, '');      // trim leading/trailing "-"

  const baseChannelName = `1-1-${cleanName}`.slice(0, 90);
  const categoryName = `1:1 - ${displayName}`;
  const channelTopic = `MENTEE_${member.id} | ${displayName}`;

  // Permissions shared by category + children
  const permissionOverwrites = [
    {
      id: guild.roles.everyone,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks
      ],
    },
    {
      id: MENTOR_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ],
    },
    {
      id: CASEWORKER_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageMessages
      ],
    },
    {
      id: ADMIN_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel, 
        PermissionsBitField.Flags.ManageChannels
      ],
    }
  ].filter(o => o.id);

  // 5) Create per-mentee CATEGORY
  const category = await guild.channels.create({
    name: categoryName,                 // e.g. "1:1 - Talha Karal"
    type: ChannelType.GuildCategory,
    permissionOverwrites
  });

  // 6) Create TEXT channel inside that category
  const textChannel = await guild.channels.create({
    name: baseChannelName,              // e.g. "1-1-talha-karal"
    type: ChannelType.GuildText,
    parent: category.id,
    topic: channelTopic                 // contains mentee id + display name
  });

  // 7) Create VOICE channel inside that category
  const voiceChannel = await guild.channels.create({
    name: `${baseChannelName}-voice`,   // e.g. "1-1-talha-karal-voice"
    type: ChannelType.GuildVoice,
    parent: category.id
  });

  // 8) Send structured opening messages
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

client.login(process.env.BOT_TOKEN);