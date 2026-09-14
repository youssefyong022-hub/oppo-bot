const express = require('express');
const https = require('https');
const http = require('http');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    const isReady = client && client.user;
    const uptimeSec = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bot Status | 24/7 Active</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 420px; width: 90%; border: 1px solid #334155; }
                .badge { display: inline-block; padding: 0.35rem 0.8rem; border-radius: 9999px; font-weight: bold; font-size: 0.875rem; margin-bottom: 1rem; background: #22c55e22; color: #4ade80; border: 1px solid #22c55e44; }
                h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
                p { color: #94a3b8; margin: 0.25rem 0; font-size: 0.95rem; }
                .stats { margin-top: 1.5rem; padding-top: 1.2rem; border-top: 1px solid #334155; display: flex; justify-content: space-around; }
                .stat-num { font-size: 1.25rem; font-weight: bold; color: #38bdf8; }
                .stat-label { font-size: 0.75rem; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="badge">● Online & 24/7 Active</div>
                <h1>${isReady ? client.user.tag : 'Discord Bot'}</h1>
                <p>Status: ${isReady ? 'Connected to Discord' : 'Starting up...'}</p>
                <div class="stats">
                    <div>
                        <div class="stat-num">${hours}h ${minutes}m ${seconds}s</div>
                        <div class="stat-label">Uptime</div>
                    </div>
                    <div>
                        <div class="stat-num">${isReady ? client.guilds.cache.size : 0}</div>
                        <div class="stat-label">Servers</div>
                    </div>
                    <div>
                        <div class="stat-num">${isReady ? Math.round(client.ws.ping) + 'ms' : '-'}</div>
                        <div class="stat-label">Ping</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

app.get('/ping', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        bot: client && client.user ? client.user.tag : 'starting',
        uptime: `${Math.floor(process.uptime())}s`, 
        timestamp: new Date().toISOString() 
    });
});

app.listen(port, () => {
    console.log(`Web server is listening on port ${port}`);
    startKeepAlive();
});

// Self-ping to prevent Render from going idle when URL is provided
function startKeepAlive() {
    const serviceUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVICE_URL || process.env.RENDER_URL;
    if (!serviceUrl) {
        console.log('ℹ️ [Keep-Alive] RENDER_EXTERNAL_URL not detected. Using UptimeRobot is highly recommended to keep Render awake 24/7.');
        return;
    }

    console.log(`[Keep-Alive] Keep-alive service active for: ${serviceUrl}`);
    const pingUrl = serviceUrl.endsWith('/') ? `${serviceUrl}ping` : `${serviceUrl}/ping`;

    // Ping every 8 minutes (Render sleeps after 15 mins of inactivity)
    setInterval(() => {
        try {
            const clientHttp = pingUrl.startsWith('https') ? https : http;
            clientHttp.get(pingUrl, (res) => {
                console.log(`[Keep-Alive] Self-ping successful (${res.statusCode}) at ${new Date().toLocaleTimeString()}`);
            }).on('error', (err) => {
                console.warn(`[Keep-Alive] Ping error:`, err.message);
            });
        } catch (e) {
            console.warn(`[Keep-Alive] Ping execution error:`, e.message);
        }
    }, 8 * 60 * 1000);
}


const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    UserSelectMenuBuilder, 
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    ChannelType
} = require('discord.js');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
let createCanvas, loadImage;
let hasCanvas = false;
try {
    const canvasModule = require('@napi-rs/canvas');
    createCanvas = canvasModule.createCanvas;
    loadImage = canvasModule.loadImage;
    hasCanvas = true;
} catch (err) {
    console.warn('⚠️ @napi-rs/canvas is not installed or failed to load. The bot will use Embeds as fallback for profile cards. Error:', err.message);
}
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// منع توقف البوت عند حدوث أي خطأ في الاتصال أو التفاعلات (Crash Prevention)
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

client.on('error', (err) => {
    console.error('Discord Client Error:', err);
});

// الاتصال بقاعدة البيانات وإعداد الجداول
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Error opening database', err.message);
    else console.log('Connected to SQLite database successfully.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        userId TEXT,
        guildId TEXT,
        points INTEGER DEFAULT 1000,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        mvps INTEGER DEFAULT 0,
        matches INTEGER DEFAULT 0,
        organize INTEGER DEFAULT 0,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        messages INTEGER DEFAULT 0,
        voiceTime INTEGER DEFAULT 0,
        PRIMARY KEY (userId, guildId)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS active_matches (
        matchId TEXT PRIMARY KEY,
        data TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS blacklist (
        userId TEXT,
        guildId TEXT,
        expiresAt INTEGER,
        reason TEXT,
        PRIMARY KEY (userId, guildId)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        guildId TEXT,
        reporterId TEXT,
        targetId TEXT,
        device TEXT,
        cost INTEGER DEFAULT 50,
        status TEXT DEFAULT 'pending',
        createdAt INTEGER,
        adminId TEXT,
        reviewedAt INTEGER
    )`);

    const requiredColumns = [
        { name: 'points', type: 'INTEGER DEFAULT 1000' },
        { name: 'wins', type: 'INTEGER DEFAULT 0' },
        { name: 'losses', type: 'INTEGER DEFAULT 0' },
        { name: 'mvps', type: 'INTEGER DEFAULT 0' },
        { name: 'matches', type: 'INTEGER DEFAULT 0' },
        { name: 'organize', type: 'INTEGER DEFAULT 0' },
        { name: 'streak', type: 'INTEGER DEFAULT 0' }
    ];

    requiredColumns.forEach(col => {
        db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`, (err) => {
            // تجاهل إن كان موجوداً
        });
    });

    db.run(`CREATE TABLE IF NOT EXISTS server_protection (
        guildId TEXT PRIMARY KEY,
        antiLink INTEGER DEFAULT 0,
        antiImage INTEGER DEFAULT 0,
        antiSpam INTEGER DEFAULT 0,
        logChannelId TEXT DEFAULT NULL
    )`);
});

// ذاكرة كاش لإعدادات الحماية لتوفير أقصى سرعة استجابة بدون إرهاق قاعدة البيانات
const protectionCache = new Map();
const userSpamTracker = new Map();

function getProtectionSettings(guildId) {
    return new Promise((resolve) => {
        if (protectionCache.has(guildId)) {
            return resolve(protectionCache.get(guildId));
        }
        db.get(`SELECT * FROM server_protection WHERE guildId = ?`, [guildId], (err, row) => {
            if (err || !row) {
                const defaultSettings = {
                    guildId,
                    antiLink: 0,
                    antiImage: 0,
                    antiSpam: 0,
                    logChannelId: null
                };
                protectionCache.set(guildId, defaultSettings);
                return resolve(defaultSettings);
            }
            const settings = {
                guildId: row.guildId,
                antiLink: row.antiLink ? 1 : 0,
                antiImage: row.antiImage ? 1 : 0,
                antiSpam: row.antiSpam ? 1 : 0,
                logChannelId: row.logChannelId || null
            };
            protectionCache.set(guildId, settings);
            resolve(settings);
        });
    });
}

function updateProtectionSetting(guildId, updates) {
    return new Promise((resolve, reject) => {
        getProtectionSettings(guildId).then(current => {
            const updated = { ...current, ...updates };
            protectionCache.set(guildId, updated);
            db.run(
                `INSERT INTO server_protection (guildId, antiLink, antiImage, antiSpam, logChannelId)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(guildId) DO UPDATE SET
                    antiLink = excluded.antiLink,
                    antiImage = excluded.antiImage,
                    antiSpam = excluded.antiSpam,
                    logChannelId = excluded.logChannelId`,
                [guildId, updated.antiLink ? 1 : 0, updated.antiImage ? 1 : 0, updated.antiSpam ? 1 : 0, updated.logChannelId || null],
                (err) => {
                    if (err) return reject(err);
                    resolve(updated);
                }
            );
        }).catch(reject);
    });
}

async function sendSecurityLog(guild, title, description, color = '#ff3366', fields = []) {
    try {
        const settings = await getProtectionSettings(guild.id);
        if (!settings.logChannelId) return;
        const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`🛡️ سجل الحماية والأمان | ${title}`)
            .setDescription(description)
            .setFooter({ text: `${guild.name} • Security System`, iconURL: guild.iconURL() })
            .setTimestamp();

        if (fields && fields.length > 0) {
            embed.addFields(fields);
        }

        await channel.send({ embeds: [embed] }).catch(() => {});
    } catch (e) {
        console.error('Error sending security log:', e);
    }
}

function generateSecurityPanelEmbed(guild, settings) {
    const antiLinkStatus = settings.antiLink ? '🟢 **مفعّل (ON)**' : '🔴 **معطّل (OFF)**';
    const antiImageStatus = settings.antiImage ? '🟢 **مفعّل (ON)**' : '🔴 **معطّل (OFF)**';
    const antiSpamStatus = settings.antiSpam ? '🟢 **مفعّل (ON)**' : '🔴 **معطّل (OFF)**';
    const logChannelStatus = settings.logChannelId ? `<#${settings.logChannelId}>` : '`غير محدد (None)`';

    return new EmbedBuilder()
        .setColor('#2b2d31')
        .setAuthor({ 
            name: `${guild.name} • لوحة تحكم حماية السيرفر`, 
            iconURL: guild.iconURL() || client.user.displayAvatarURL() 
        })
        .setThumbnail(guild.iconURL() || client.user.displayAvatarURL())
        .setDescription(
            `تحكم بخصائص الأمان والحماية لسيرفرك بسهولة عبر الضغط على الأزرار التفاعلية بالأسفل.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔗 **نظام منع الروابط (Anti-Link):** ${antiLinkStatus}\n` +
            `> يمنع نشر روابط الديسكورد، دعوات السيرفرات، وأي روابط خارجية أو ترويج.\n\n` +
            `🖼️ **نظام منع الصور (Anti-Image):** ${antiImageStatus}\n` +
            `> يمنع إرسال الصور والميديا والصور المتحركة لمنع التخريب.\n\n` +
            `⚡ **نظام منع السبام والتباطؤ (Slow Mode 5s):** ${antiSpamStatus}\n` +
            `> يمنع إرسال الرسائل أسرع من رسالة كل 5 ثوانٍ، مع منع التكرار وكتم تلقائي للمخالفين.\n\n` +
            `📜 **روم سجلات الحماية (Security Logs):** ${logChannelStatus}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: 'Apostado Security Manager • للإدارة فقط' })
        .setTimestamp();
}

function generateSecurityPanelComponents(settings) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sec_toggle_antilink')
            .setLabel(settings.antiLink ? 'تعطيل أنتي ليان' : 'تفعيل أنتي ليان')
            .setStyle(settings.antiLink ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji('🔗'),
        new ButtonBuilder()
            .setCustomId('sec_toggle_antiimage')
            .setLabel(settings.antiImage ? 'تعطيل أنتي صور' : 'تفعيل أنتي صور')
            .setStyle(settings.antiImage ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji('🖼️'),
        new ButtonBuilder()
            .setCustomId('sec_toggle_antispam')
            .setLabel(settings.antiSpam ? 'تعطيل أنتي سبام' : 'تفعيل أنتي سبام')
            .setStyle(settings.antiSpam ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji('⚡'),
        new ButtonBuilder()
            .setCustomId('sec_refresh')
            .setLabel('تحديث الحالة')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
    );
    return [row];
}

// دوال مساعدة لنظام الفحص والتقارير (Player Check & Report Helpers)
function getCheckStats(guildId) {
    return new Promise((resolve) => {
        db.get(`SELECT 
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
            COUNT(CASE WHEN status = 'cheater' THEN 1 END) as cheaters,
            COUNT(CASE WHEN status = 'clean' THEN 1 END) as clean
            FROM reports WHERE guildId = ?`, [guildId], (err, row) => {
            if (err || !row) return resolve({ pending: 0, cheaters: 0, clean: 0 });
            resolve({
                pending: row.pending || 0,
                cheaters: row.cheaters || 0,
                clean: row.clean || 0
            });
        });
    });
}

function createCheckReport(reportId, guildId, reporterId, targetId, device) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO reports (id, guildId, reporterId, targetId, device, cost, status, createdAt) VALUES (?, ?, ?, ?, ?, 50, 'pending', ?)`,
            [reportId, guildId, reporterId, targetId, device, Date.now()],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}

function getReport(reportId) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM reports WHERE id = ?`, [reportId], (err, row) => {
            if (err) return resolve(null);
            resolve(row);
        });
    });
}

function updateReportStatus(reportId, status, adminId) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE reports SET status = ?, adminId = ?, reviewedAt = ? WHERE id = ?`,
            [status, adminId, Date.now(), reportId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}

function getUserReports(reporterId, guildId) {
    return new Promise((resolve) => {
        db.all(
            `SELECT * FROM reports WHERE reporterId = ? AND guildId = ? ORDER BY createdAt DESC LIMIT 10`,
            [reporterId, guildId],
            (err, rows) => {
                if (err || !rows) return resolve([]);
                resolve(rows);
            }
        );
    });
}

async function processCheckSubmission(interaction, targetId, device) {
    const reporterId = interaction.user.id;
    const guildId = interaction.guild.id;

    if (targetId === reporterId) {
        return interaction.reply({ content: '❌ لا يمكنك طلب فحص لنفسك!', ephemeral: true });
    }

    const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
        return interaction.reply({ content: '❌ لم يتم العثور على هذا العضو في السيرفر!', ephemeral: true });
    }
    if (targetMember.user.bot) {
        return interaction.reply({ content: '❌ لا يمكنك الإبلاغ عن بوت!', ephemeral: true });
    }

    const stats = await getUserStats(reporterId, guildId);
    if ((stats.points || 0) < 50) {
        return interaction.reply({ 
            content: `❌ ليس لديك نقاط كافية! رصيدك الحالي هو **${stats.points || 0}** نقطة، وتحتاج إلى **50 نقطة** لطلب الفحص.`, 
            ephemeral: true 
        });
    }

    const reportId = crypto.randomBytes(3).toString('hex');

    // Deduct 50 points
    db.run(`UPDATE users SET points = points - 50 WHERE userId = ? AND guildId = ?`, [reporterId, guildId]);
    await createCheckReport(reportId, guildId, reporterId, targetId, device);

    const deviceFormatted = device === 'PC' ? '💻 PC' : '📱 Phone';
    const submittedEmbed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setAuthor({ 
            name: 'Request Submitted', 
            iconURL: 'https://cdn-icons-png.flaticon.com/512/5610/5610944.png' 
        })
        .setDescription(
            `### ✅ Check Request Submitted!\n\n` +
            `**Report ID:** \`${reportId}\`\n` +
            `**Target:** ${targetMember}\n` +
            `**Device:** ${deviceFormatted}\n` +
            `**Cost:** \`-50\` points\n\n` +
            `Staff will review your report soon.`
        )
        .setTimestamp();

    await interaction.reply({ embeds: [submittedEmbed], ephemeral: true });

    const adminChannel = interaction.guild.channels.cache.find(c => 
        c.name === 'check-services' || c.name === 'check-place-user' || c.name === 'reports' || c.name === 'staff-logs'
    ) || interaction.channel;

    const adminEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('🚨 Player Check Request 🚨')
        .setDescription(
            `**Report ID:** \`${reportId}\`\n` +
            `**Target:** ${targetMember} (\`${targetId}\`)\n` +
            `**Device:** ${deviceFormatted}\n` +
            `**Requested by:** ${interaction.user} (\`${reporterId}\`)\n` +
            `**Cost:** \`50\` points paid\n` +
            `**Status:** ⏳ \`Pending Review\``
        )
        .setFooter({ text: 'Apostado Anti-Cheat Division', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

    const adminActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`check_clean_${reportId}`).setLabel('Clean').setStyle(ButtonStyle.Success).setEmoji('🟢'),
        new ButtonBuilder().setCustomId(`check_cheater_${reportId}`).setLabel('Cheater').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
        new ButtonBuilder().setCustomId(`check_cancel_${reportId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('❌')
    );

    await adminChannel.send({ 
        content: `📢 **تنبيه إداري جديد:** ${interaction.user} قام بالإبلاغ عن لاعب للفحص!`, 
        embeds: [adminEmbed], 
        components: [adminActionRow] 
    });
}

// دوال البلاك ليست (Blacklist Database Functions)
function setUserBlacklist(userId, guildId, durationMinutes, reason = 'مخالفة القوانين') {
    return new Promise((resolve) => {
        const expiresAt = Date.now() + durationMinutes * 60 * 1000;
        db.run(`INSERT OR REPLACE INTO blacklist (userId, guildId, expiresAt, reason) VALUES (?, ?, ?, ?)`, [userId, guildId, expiresAt, reason], () => resolve());
    });
}

function removeUserBlacklist(userId, guildId) {
    return new Promise((resolve) => {
        db.run(`DELETE FROM blacklist WHERE userId = ? AND guildId = ?`, [userId, guildId], () => resolve());
    });
}

function isUserBlacklisted(userId, guildId) {
    return new Promise((resolve) => {
        db.get(`SELECT * FROM blacklist WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, row) => {
            if (err || !row) return resolve({ blacklisted: false });
            if (Date.now() >= row.expiresAt) {
                db.run(`DELETE FROM blacklist WHERE userId = ? AND guildId = ?`, [userId, guildId]);
                return resolve({ blacklisted: false });
            }
            const remainingMs = row.expiresAt - Date.now();
            resolve({ blacklisted: true, remainingMs, reason: row.reason || 'مخالفة القوانين' });
        });
    });
}

function getBlacklistedUsers(guildId) {
    return new Promise((resolve) => {
        db.all(`SELECT * FROM blacklist WHERE guildId = ?`, [guildId], (err, rows) => {
            if (err || !rows) return resolve([]);
            const now = Date.now();
            const valid = [];
            for (const r of rows) {
                if (r.expiresAt > now) {
                    valid.push({ ...r, remainingMs: r.expiresAt - now });
                } else {
                    db.run(`DELETE FROM blacklist WHERE userId = ? AND guildId = ?`, [r.userId, r.guildId]);
                }
            }
            resolve(valid);
        });
    });
}

function formatRemainingTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins > 0) return `${mins} دقيقة و ${secs} ثانية`;
    return `${secs} ثانية`;
}

function formatDurationEnglish(minutes) {
    if (!minutes || minutes <= 0) return 'Permanent';
    if (minutes >= 1440 && minutes % 1440 === 0) {
        return `${minutes / 1440} day(s)`;
    }
    if (minutes >= 60 && minutes % 60 === 0) {
        return `${minutes / 60} hour(s)`;
    }
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours} hour(s) ${mins} minute(s)`;
    }
    return `${minutes} minute(s)`;
}

// دوال حفظ واسترجاع المباريات في قاعدة البيانات (Match Persistence)
function saveMatchToDb(match) {
    if (!match || !match.id) return;
    try {
        const serializable = {
            id: match.id,
            guildId: match.guildId,
            channelId: match.channelId,
            hostId: match.hostId,
            mode: match.mode,
            teamSize: match.teamSize,
            roomId: match.roomId,
            password: match.password,
            privateKey: match.privateKey,
            team1: match.team1 || [],
            team2: match.team2 || [],
            originalVoiceChannels: Array.from(match.originalVoiceChannels?.entries() || []),
            state: match.state,
            promptMessageId: match.promptMessageId,
            lobbyMessageId: match.lobbyMessageId,
            threadId: match.threadId,
            parentChannelId: match.parentChannelId,
            matchChannelId: match.matchChannelId || match.threadId,
            team1VoiceId: match.team1VoiceId,
            team2VoiceId: match.team2VoiceId,
            winnerVotes: Array.from(match.winnerVotes?.entries() || []),
            loserVotes: Array.from(match.loserVotes?.entries() || []),
            winnerVoteMessageId: match.winnerVoteMessageId || null,
            winnerVotingActive: match.winnerVotingActive || false,
            winnerVotingConcluded: match.winnerVotingConcluded || false,
            winningMvpUid: match.winningMvpUid || null,
            winningTeam: match.winningTeam || null,
            loserVoteMessageId: match.loserVoteMessageId || null,
            loserVotingActive: match.loserVotingActive || false,
            losingMvpUid: match.losingMvpUid || null,
            cancelVotes: Array.from(match.cancelVotes || []),
            cancelInitiatorId: match.cancelInitiatorId || null,
            cancelMessageId: match.cancelMessageId || null,
            cancelVoteActive: match.cancelVoteActive || false,
            votingCompleted: match.votingCompleted || false
        };
        db.run(`INSERT OR REPLACE INTO active_matches (matchId, data) VALUES (?, ?)`, [match.id, JSON.stringify(serializable)]);
    } catch (e) {
        console.error('Error saving match to DB:', e);
    }
}

function removeMatchFromDb(matchId) {
    db.run(`DELETE FROM active_matches WHERE matchId = ?`, [matchId]);
}

function loadMatchesFromDb() {
    return new Promise((resolve) => {
        db.all(`SELECT * FROM active_matches`, [], (err, rows) => {
            if (err || !rows) return resolve();
            for (const row of rows) {
                try {
                    const parsed = JSON.parse(row.data);
                    parsed.originalVoiceChannels = new Map(parsed.originalVoiceChannels || []);
                    parsed.winnerVotes = new Map(parsed.winnerVotes || []);
                    parsed.loserVotes = new Map(parsed.loserVotes || []);
                    parsed.cancelVotes = new Set(parsed.cancelVotes || []);
                    parsed.winnerVotingActive = parsed.winnerVotingActive || false;
                    parsed.winnerVotingConcluded = parsed.winnerVotingConcluded || false;
                    parsed.loserVotingActive = parsed.loserVotingActive || false;
                    parsed.cancelVoteActive = parsed.cancelVoteActive || false;

                    if (parsed.state === 'WAITING_INFO') {
                        removeMatchFromDb(parsed.id);
                        continue;
                    }

                    if (parsed.state === 'LOBBY') {
                        parsed.lobbyTimeout = setTimeout(async () => {
                            const currentMatch = activeMatches.get(parsed.id);
                            if (currentMatch && currentMatch.state === 'LOBBY') {
                                activeMatches.delete(parsed.id);
                                removeMatchFromDb(parsed.id);
                                try {
                                    const guild = client.guilds.cache.get(currentMatch.guildId);
                                    if (guild && currentMatch.channelId && currentMatch.lobbyMessageId) {
                                        const ch = await guild.channels.fetch(currentMatch.channelId).catch(() => null);
                                        if (ch) {
                                            const msg = await ch.messages.fetch(currentMatch.lobbyMessageId).catch(() => null);
                                            if (msg) {
                                                const timeoutEmbed = new EmbedBuilder()
                                                    .setColor(0xED4245)
                                                    .setTitle('❌ Match Cancelled - Timeout')
                                                    .setDescription(`**${currentMatch.mode}** match created by <@${currentMatch.hostId}> was automatically cancelled.\n\n⏰ Reason: Teams did not fill up within 5 minutes.\n\nUse \`!play ${currentMatch.mode.toLowerCase()}\` to start a new match.`)
                                                    .setFooter({ text: new Date().toLocaleString() });
                                                const expiredRow = new ActionRowBuilder().addComponents(
                                                    new ButtonBuilder().setCustomId('expired_btn').setLabel('Match Expired').setStyle(ButtonStyle.Secondary).setDisabled(true)
                                                );
                                                await msg.edit({ embeds: [timeoutEmbed], components: [expiredRow] }).catch(() => {});
                                            }
                                        }
                                    }
                                } catch (e) {}
                            }
                        }, 300000);
                    }

                    activeMatches.set(parsed.id, parsed);
                } catch (e) {}
            }
            console.log(`Restored ${rows.length} active matches from database.`);
            resolve();
        });
    });
}

// دالة فحص وجود مباراة حقيقية للاعب
function getRealActiveMatchForUser(guild, userId, excludeMatchId = null) {
    if (!guild) return null;
    for (const m of activeMatches.values()) {
        if (m.guildId === guild.id && (!excludeMatchId || m.id !== excludeMatchId) && (m.team1.includes(userId) || m.team2.includes(userId)) && !m.votingCompleted) {
            return m;
        }
    }
    return null;
}

// تنظيف تلقائي للمباريات عند قيام الإدارة بحذف أي روم ماتش يدوياً
client.on('channelDelete', (channel) => {
    for (const match of activeMatches.values()) {
        if (match.matchChannelId === channel.id || match.threadId === channel.id || match.channelId === channel.id) {
            activeMatches.delete(match.id);
            removeMatchFromDb(match.id);
            console.log(`Auto-cleaned match ${match.id} because channel ${channel.id} was deleted.`);
        }
    }
});

// دوال مساعدة لقاعدة البيانات
function getUserStats(userId, guildId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, row) => {
            if (err) return reject(err);
            if (!row) {
                db.run(`INSERT INTO users (userId, guildId, points, wins, losses, mvps, matches, organize, xp, level, messages, voiceTime) VALUES (?, ?, 1000, 0, 0, 0, 0, 0, 0, 1, 0, 0)`, [userId, guildId], function(insertErr) {
                    if (insertErr) return reject(insertErr);
                    resolve({ userId, guildId, points: 1000, wins: 0, losses: 0, mvps: 0, matches: 0, organize: 0, xp: 0, level: 1, messages: 0, voiceTime: 0, rank: 1 });
                });
            } else {
                db.get(`SELECT COUNT(*) as rankHigher FROM users WHERE guildId = ? AND points > ?`, [guildId, row.points || 0], (rErr, rRow) => {
                    const rank = rRow ? rRow.rankHigher + 1 : 1;
                    resolve({ ...row, rank });
                });
            }
        });
    });
}

function updateMatchStats(guildId, winners, losers, mvpWinnerId, mvpLoserId, hostId) {
    return new Promise((resolve) => {
        winners.forEach(uid => {
            const isMvp = uid === mvpWinnerId;
            const pts = isMvp ? 80 : 50;
            const mvpInc = isMvp ? 1 : 0;
            db.run(`UPDATE users SET points = points + ?, wins = wins + 1, matches = matches + 1, mvps = mvps + ? WHERE userId = ? AND guildId = ?`, [pts, mvpInc, uid, guildId]);
        });

        losers.forEach(uid => {
            const isMvp = uid === mvpLoserId;
            const pts = isMvp ? 30 : -30;
            const mvpInc = isMvp ? 1 : 0;
            db.run(`UPDATE users SET points = MAX(0, points + ?), losses = losses + 1, matches = matches + 1, mvps = mvps + ? WHERE userId = ? AND guildId = ?`, [pts, mvpInc, uid, guildId]);
        });

        if (hostId) {
            db.run(`UPDATE users SET organize = organize + 1, points = points + 5 WHERE userId = ? AND guildId = ?`, [hostId, guildId]);
        }
        resolve();
    });
}

// تنظيف صلاحيات الفويس والشات وإعادة إغلاق الرومات للاعبين
async function cleanupMatchVoicePermissions(guild, match) {
    if (!guild || !match) return;
    try {
        if (match.team1VoiceId) {
            const v1 = guild.channels.cache.get(match.team1VoiceId) || await guild.channels.fetch(match.team1VoiceId).catch(() => null);
            if (v1 && v1.permissionOverwrites) {
                for (const uid of (match.team1 || [])) {
                    await v1.permissionOverwrites.delete(uid).catch(() => {});
                }
            }
        }
        if (match.team2VoiceId) {
            const v2 = guild.channels.cache.get(match.team2VoiceId) || await guild.channels.fetch(match.team2VoiceId).catch(() => null);
            if (v2 && v2.permissionOverwrites) {
                for (const uid of (match.team2 || [])) {
                    await v2.permissionOverwrites.delete(uid).catch(() => {});
                }
            }
        }
        // تنظيف صلاحيات القناة الأم للثريد إن وجدت
        const parentId = match.parentChannelId;
        if (parentId) {
            const parentCh = guild.channels.cache.get(parentId) || await guild.channels.fetch(parentId).catch(() => null);
            if (parentCh && parentCh.permissionOverwrites) {
                const allPlayers = [...(match.team1 || []), ...(match.team2 || [])];
                for (const uid of allPlayers) {
                    await parentCh.permissionOverwrites.delete(uid).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error('Error cleaning up match voice and channel permissions:', e);
    }
}

// دالة شاملة لتنظيف وإعادة ضبط جميع المباريات المعلقة والرسائل العالقة في السيرفر
async function clearAllMatches(guild, executorUser, currentChannel = null) {
    if (!guild) return { matchCount: 0, strandedCount: 0 };

    let matchCount = 0;
    let strandedCount = 0;

    // 1. تنظيف المباريات النشطة في الذاكرة
    for (const [id, m] of activeMatches.entries()) {
        if (m.guildId === guild.id) {
            matchCount++;
            if (m.lobbyTimeout) clearTimeout(m.lobbyTimeout);
            if (m.infoTimeout) clearTimeout(m.infoTimeout);

            // تعطيل رسالة اللوبي إذا كانت موجودة
            if (m.channelId && m.lobbyMessageId) {
                try {
                    const playCh = await guild.channels.fetch(m.channelId).catch(() => null);
                    if (playCh) {
                        const lobbyMsg = await playCh.messages.fetch(m.lobbyMessageId).catch(() => null);
                        if (lobbyMsg) {
                            const cancelEmbed = new EmbedBuilder()
                                .setColor(0xED4245)
                                .setTitle('✖ Match Cancelled')
                                .setDescription(`This match was cancelled by administrator <@${executorUser.id}>.\n\nUse \`!play\` to start a new match.`)
                                .setFooter({ text: new Date().toLocaleString() });
                            await lobbyMsg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
                        }
                    }
                } catch (e) {}
            }

            // حذف قناة/ثريد الماتش إن وجد
            const matchChId = m.matchChannelId || m.threadId;
            if (matchChId) {
                try {
                    const ch = await guild.channels.fetch(matchChId).catch(() => null);
                    if (ch) await ch.delete('Match cleared by admin').catch(() => {});
                } catch (e) {}
            }

            // إعادة اللاعبين للانتظار وتنظيف الصلاحيات
            await returnPlayersToWaiting(guild, m).catch(() => {});
            await cleanupMatchVoicePermissions(guild, m).catch(() => {});

            activeMatches.delete(id);
            removeMatchFromDb(id);
        }
    }

    // 2. تنظيف قاعدة البيانات تحسباً لأي مباريات قديمة معلقة
    try {
        db.run(`DELETE FROM active_matches WHERE data LIKE ?`, [`%"guildId":"${guild.id}"%`]);
    } catch (e) {}

    // 3. مسح وتعطيل أي رسائل لوبي عالقة في القناة الحالية أو قنوات اللعب المعتمدة
    const channelsToCheck = new Set();
    if (currentChannel) channelsToCheck.add(currentChannel);
    guild.channels.cache.filter(c => isAllowedPlayChannel(c)).forEach(c => channelsToCheck.add(c));

    for (const ch of channelsToCheck) {
        if (!ch || !ch.messages) continue;
        try {
            const messages = await ch.messages.fetch({ limit: 25 }).catch(() => null);
            if (messages) {
                for (const msg of messages.values()) {
                    if (msg.author.id === client.user.id && msg.components?.length > 0) {
                        const hasMatchButton = msg.components.some(row => 
                            row.components.some(comp => 
                                comp.customId?.startsWith('join_team') || 
                                comp.customId?.startsWith('cancel_match_') ||
                                comp.customId?.startsWith('enter_room_info_') ||
                                comp.customId?.startsWith('leave_match_')
                            )
                        );
                        if (hasMatchButton) {
                            const disabledRows = msg.components.map(row => {
                                const newRow = ActionRowBuilder.from(row);
                                newRow.components.forEach(c => c.setDisabled(true));
                                return newRow;
                            });
                            await msg.edit({ components: disabledRows }).catch(() => {});
                            strandedCount++;
                        }
                    }
                }
            }
        } catch (e) {}
    }

    return { matchCount, strandedCount };
}

// دالة إنهاء المباراة وتوزيع النقاط وإغلاق الروم
async function finalizeMatch(guild, match, channel = null) {
    if (!guild || !match || match.finalized) return;
    match.finalized = true;
    match.votingCompleted = true;

    const winningPlayers = match.winningTeam === 1 ? match.team1 : match.team2;
    const losingPlayers = match.winningTeam === 1 ? match.team2 : match.team1;
    const winningTeamName = match.winningTeam === 1 ? 'Team 1' : 'Team 2';
    const losingTeamName = match.winningTeam === 1 ? 'Team 2' : 'Team 1';

    await updateMatchStats(guild.id, winningPlayers, losingPlayers, match.winningMvpUid, match.losingMvpUid, match.hostId);

    const gameOverEmbed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎮 GAME OVER - All MVPs Selected!')
        .setDescription(
            `🏆 **MVP Winners**\n<@${match.winningMvpUid}> (+80 points)\n\n` +
            `🎯 **MVP Losers**\n<@${match.losingMvpUid}> (+30 points)\n\n` +
            `✅ **Winners (${winningTeamName})**\n${winningPlayers.map(id => `<@${id}>`).join(' , ')}\nEach player received **+50 Win point!**\n\n` +
            `❌ **Losers (${losingTeamName})**\n${losingPlayers.map(id => `<@${id}>`).join(' , ')}\nEach player received **-30 Lose point.**\n\n` +
            `*Moving players back to original channels...*`
        )
        .setFooter({ text: 'Apostado Manager' })
        .setTimestamp();

    const targetChannel = channel || guild.channels.cache.get(match.matchChannelId || match.threadId);
    if (targetChannel) {
        await targetChannel.send({ embeds: [gameOverEmbed] }).catch(() => {});
    }

    // إعادة اللاعبين للغرف الصوتية
    await returnPlayersToWaiting(guild, match);

    // سحب صلاحيات الفويس من اللاعبين لإغلاقه مجدداً
    await cleanupMatchVoicePermissions(guild, match);

    activeMatches.delete(match.id);
    removeMatchFromDb(match.id);

    // إغلاق وحذف الروم / الـ Thread بعد 15 ثانية
    if (targetChannel) {
        setTimeout(async () => {
            try {
                await targetChannel.delete('Match finished and concluded.');
            } catch (e) {}
        }, 15000);
    }
}

// دالة بناء دليل الأوامر الشامل والاحترافي (Official Commands Guide Embed)
function generateCommandsEmbed(guild) {
    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setAuthor({ 
            name: `${guild.name} • Official Commands Guide`, 
            iconURL: guild.iconURL() || client.user.displayAvatarURL() 
        })
        .setThumbnail(guild.iconURL() || client.user.displayAvatarURL())
        .setDescription(
            `Welcome to **${guild.name}**! Here is the complete list of bot commands and automated matchmaking systems.\n\u200b`
        )
        .addFields(
            {
                name: '🎮 ┃ PLAYER COMMANDS',
                value: 
                    `\` /profile \` or \` !p \` • View player stats, winrate & rank\n` +
                    `\` /leaderboard \` or \` !top \` • Server Top 10 rankings\n` +
                    `\` /rank \` • View your level & activity XP\n` +
                    `\` /rules \` • View matchmaking & tournament rules\n\u200b`,
                inline: false
            },
            {
                name: '🛡️ ┃ STAFF & MODERATION',
                value: 
                    `\` /security \` or \` !security \` • Server Protection (Anti-Link / Anti-Image / Anti-Spam)\n` +
                    `\` &move <@user/ID> \` • Drag a member into your voice channel\n` +
                    `\` /blacklist add \` or \` !bl \` • Ban player with auto DM alert\n` +
                    `\` /blacklist remove \` or \` !unbl \` • Unban player from matches\n` +
                    `\` /blacklist list \` • View active bans & remaining time\n` +
                    `\` /unblock <@user> \` • Unlock player from stuck matches\n` +
                    `\` /clearmatches \` • Clean & reset all stuck match rooms\n` +
                    `\` !w @user \` • Set Winning Team MVP (+80 pts)\n` +
                    `\` !l @user \` • Set Losing Team MVP (+30 pts)\n` +
                    `\` /giverole \` / \` /removerole \` • Manage member roles\n` +
                    `\` /live <link> \` • Announce stream in channel\n\u200b`,
                inline: false
            },
            {
                name: '🕹️ ┃ AUTOMATED SYSTEMS',
                value: 
                    `🔍 **Player Check** • Report cheaters via \`/checker\` (PC / Phone)\n` +
                    `📁 **Support Tickets** • Open Help / Abuse tickets via \`/ticket\`\n` +
                    `👾 **Matchmaking Engine** • Join \`⏳ Waiting\` voice, enter Room ID & play!`,
                inline: false
            }
        )
        .setFooter({ text: `© ${new Date().getFullYear()} ${guild.name}. All Rights Reserved.` })
        .setTimestamp();

    return embed;
}

// دالة مساعدة ذكية للعثور على المباراة من التفاعل أو الروم لتجنب أي أخطاء
function findMatchFromInteraction(interaction, prefix = null) {
    if (!interaction) return null;
    let matchId = null;
    if (prefix && interaction.customId?.startsWith(prefix)) {
        matchId = interaction.customId.replace(prefix, '');
        if (prefix.startsWith('modal_join_key_')) {
            matchId = matchId.replace(/_[12]$/, '');
        }
    }
    let match = matchId ? activeMatches.get(matchId) : null;
    if (!match && interaction.customId) {
        for (const [id, m] of activeMatches.entries()) {
            if (interaction.customId.includes(id)) {
                match = m;
                break;
            }
        }
    }
    if (!match && interaction.guild) {
        const chId = interaction.channelId || interaction.channel?.id;
        if (chId) {
            match = Array.from(activeMatches.values()).find(m => 
                m.guildId === interaction.guild.id && (m.matchChannelId === chId || m.threadId === chId || m.channelId === chId)
            );
        }
    }
    return match;
}

// دالة توليد بطاقة الكانفاس للبروفايل !p
async function generateProfileCard(user, member, stats) {
    if (!hasCanvas || !createCanvas || !loadImage) {
        return null;
    }
    const width = 740;
    const height = 330;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // خلفية الحاوية الكبرى
    ctx.fillStyle = '#0f1013';
    roundRect(ctx, 0, 0, width, height, 22);
    ctx.fill();

    // البطاقة الداخلية
    ctx.fillStyle = '#17181c';
    roundRect(ctx, 12, 12, width - 24, height - 24, 18);
    ctx.fill();

    // إطار خفيف
    ctx.strokeStyle = '#23252b';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 12, 12, width - 24, height - 24, 18);
    ctx.stroke();

    // رسم صورة العضو الدائرية
    const avatarX = 68;
    const avatarY = 68;
    const avatarRadius = 38;

    try {
        const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
        const avatarImage = await loadImage(avatarURL);

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImage, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
        ctx.restore();
    } catch (e) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#34373c';
        ctx.fill();
        ctx.restore();
    }

    // إطار الأفاتار
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#2e3038';
    ctx.lineWidth = 3;
    ctx.stroke();

    // اسم المستخدم
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    const displayName = member ? member.displayName : user.username;
    ctx.fillText(displayName.length > 20 ? displayName.slice(0, 18) + '...' : displayName, 125, 62);

    // الرتبة / اللقب
    ctx.fillStyle = '#8e9297';
    ctx.font = '14px sans-serif';
    ctx.fillText('Top Player!', 125, 86);

    // خط فاصل أنيق
    ctx.strokeStyle = '#24262c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(35, 125);
    ctx.lineTo(width - 35, 125);
    ctx.stroke();

    // حساب نسبة الفوز
    const totalMatches = stats.matches || (stats.wins + stats.losses);
    const winrate = totalMatches > 0 ? Math.round((stats.wins / totalMatches) * 100) : 0;

    // شبكة الإحصائيات (2 صفوف × 4 أعمدة)
    const statsGrid = [
        [
            { label: 'POINTS', value: `${stats.points || 0}` },
            { label: 'WINS', value: `${stats.wins || 0}` },
            { label: 'LOSSES', value: `${stats.losses || 0}` },
            { label: 'MVPS', value: `${stats.mvps || 0}` }
        ],
        [
            { label: 'MATCHES', value: `${totalMatches || 0}` },
            { label: 'ORGANIZE', value: `${stats.organize || 0}` },
            { label: 'WINRATE', value: `${winrate}%` },
            { label: 'RANK', value: `#${stats.rank || 1}` }
        ]
    ];

    const colWidth = (width - 70) / 4;
    const startX = 35;

    // رسم الصف الأول
    statsGrid[0].forEach((item, i) => {
        const x = startX + i * colWidth + colWidth / 2;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#72767d';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(item.label, x, 160);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(item.value, x, 195);
    });

    // رسم الصف الثاني
    statsGrid[1].forEach((item, i) => {
        const x = startX + i * colWidth + colWidth / 2;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#72767d';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(item.label, x, 240);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(item.value, x, 275);
    });

    return canvas.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// تخزين المباريات الحالية النشطة
const activeMatches = new Map();
const activeCheckSessions = new Map();
const voiceJoinTimes = new Map();
const actionDebounceLocks = new Set();
let checkStats = { pending: 1, cheaters: 7, clean: 5 };

// التحقق من القنوات المسموح بها حصراً لتشغيل وإنشاء المباريات (!play)
function isAllowedPlayChannel(channel) {
    if (!channel) return false;
    // منع أي قناة صوتية أو شات داخل الفويس نهائياً
    if (channel.isVoiceBased?.() || channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
        return false;
    }
    const name = (channel.name || '').toLowerCase();
    const isApostada = name.includes('apostada') && name.includes('play');
    const isZelika = name.includes('zelika') && name.includes('play');
    const isHighlight = name.includes('highlight') && name.includes('play');

    return isApostada || isZelika || isHighlight;
}

client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.id || oldState.id;
    const guildId = newState.guild.id || oldState.guild.id;
    const key = `${userId}_${guildId}`;

    if (!oldState.channelId && newState.channelId) {
        voiceJoinTimes.set(key, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
        const joinTime = voiceJoinTimes.get(key);
        if (joinTime) {
            const durationSec = Math.floor((Date.now() - joinTime) / 1000);
            voiceJoinTimes.delete(key);
            db.run(`UPDATE users SET voiceTime = voiceTime + ? WHERE userId = ? AND guildId = ?`, [durationSec, userId, guildId]);
        }
    }

    // تفعيل وتأكيد صلاحيات الكتابة في الماتش للاعب عند دخوله إلى فويس فريقه (الغرفة الأولى أو الثانية)
    if (newState.channelId && newState.guild) {
        const activeMatch = Array.from(activeMatches.values()).find(m => 
            m.guildId === newState.guild.id &&
            (m.team1VoiceId === newState.channelId || m.team2VoiceId === newState.channelId) &&
            ((m.team1 && m.team1.includes(userId)) || (m.team2 && m.team2.includes(userId))) &&
            !m.votingCompleted
        );

        if (activeMatch) {
            const parentChannelId = activeMatch.parentChannelId || activeMatch.channelId;
            if (parentChannelId) {
                const parentCh = newState.guild.channels.cache.get(parentChannelId) || await newState.guild.channels.fetch(parentChannelId).catch(() => null);
                if (parentCh && parentCh.permissionOverwrites) {
                    await parentCh.permissionOverwrites.edit(userId, {
                        ViewChannel: true,
                        SendMessages: true,
                        SendMessagesInThreads: true,
                        ReadMessageHistory: true,
                        AttachFiles: true,
                        EmbedLinks: true
                    }).catch(() => {});
                }
            }

            const threadId = activeMatch.matchChannelId || activeMatch.threadId;
            if (threadId) {
                const threadCh = newState.guild.channels.cache.get(threadId) || await newState.guild.channels.fetch(threadId).catch(() => null);
                if (threadCh && threadCh.isThread()) {
                    await threadCh.members.add(userId).catch(() => {});
                }
            }
        }
    }

});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag} (Apostado Manager Active)`);

    const commands = [
        new SlashCommandBuilder()
            .setName('profile')
            .setDescription('عرض بروفايل العضو الإحصائي')
            .addUserOption(option => option.setName('user').setDescription('اختر عضواً').setRequired(false)),
        new SlashCommandBuilder()
            .setName('rank')
            .setDescription('عرض مستوى ورتبة العضو')
            .addUserOption(option => option.setName('user').setDescription('اختر عضواً').setRequired(false)),
        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('عرض لوحة المتصدرين بالنقاط'),
        new SlashCommandBuilder()
            .setName('rules')
            .setDescription('عرض قوانين السيرفر الرسمية'),
        new SlashCommandBuilder()
            .setName('giverole')
            .setDescription('إعطاء رتبة لعضو معين')
            .addUserOption(option => option.setName('member').setDescription('العضو المستهدف').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('الرتبة المراد إعطاؤها').setRequired(true)),
        new SlashCommandBuilder()
            .setName('removerole')
            .setDescription('سحب رتبة من عضو معين')
            .addUserOption(option => option.setName('member').setDescription('العضو المستهدف').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('الرتبة المراد سحبها').setRequired(true)),
        new SlashCommandBuilder()
            .setName('ticket')
            .setDescription('إرسال لوحة التذاكر والدعم الفني')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('القناة التي ستُرسل فيها لوحة التذاكر')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('checker')
            .setDescription('إرسال لوحة فحص اللاعبين V2 المطابقة تماماً')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('القناة التي ستُرسل فيها لوحة الفحص')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('live')
            .setDescription('إرسال إشعار البث المباشر لسيرفر OVER M9WDN')
            .addStringOption(option =>
                option.setName('link')
                    .setDescription('رابط البث المباشر')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('title')
                    .setDescription('عنوان البث (اختياري)')
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName('blacklist')
            .setDescription('إدارة قائمة الحظر المؤقت (Blacklist)')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addSubcommand(sub =>
                sub.setName('add')
                    .setDescription('إضافة لاعب إلى قائمة الحظر')
                    .addUserOption(opt => opt.setName('user').setDescription('اللاعب المراد حظره').setRequired(true))
                    .addIntegerOption(opt => opt.setName('minutes').setDescription('مدة الحظر بالدقائق (مثال: 15)').setRequired(true))
                    .addStringOption(opt => opt.setName('reason').setDescription('سبب الحظر').setRequired(false))
            )
            .addSubcommand(sub =>
                sub.setName('remove')
                    .setDescription('إزالة لاعب من قائمة الحظر')
                    .addUserOption(opt => opt.setName('user').setDescription('اللاعب المراد فك حظره').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('عرض قائمة اللاعبين المحظورين حالياً والوقت المتبقي')
            ),
        new SlashCommandBuilder()
            .setName('unblock')
            .setDescription('فك التعليق أو الحظر عن لاعب فوراً لحل مشكلة الماتشات المعلقة')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addUserOption(opt => opt.setName('user').setDescription('اللاعب').setRequired(true)),
        new SlashCommandBuilder()
            .setName('clearmatches')
            .setDescription('تنظيف وإعادة ضبط جميع المباريات المعلقة وفك القفل عن جميع اللاعبين')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        new SlashCommandBuilder()
            .setName('move')
            .setDescription('سحب عضو إلى الروم الصوتي الحالي الخاص بك')
            .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
            .addUserOption(opt => opt.setName('member').setDescription('العضو المراد سحبه').setRequired(true)),
        new SlashCommandBuilder()
            .setName('apos')
            .setDescription('⚡ إرسال دليل أنظمة وأوامر Apostado الرسمي في بطاقة فاخرة')
            .addChannelOption(opt => opt.setName('channel').setDescription('القناة التي ستُرسل فيها البطاقة (اختياري)').setRequired(false)),
        new SlashCommandBuilder()
            .setName('guide')
            .setDescription('📖 إرسال الدليل الشامل للسيرفر والأوامر')
            .addChannelOption(opt => opt.setName('channel').setDescription('القناة التي ستُرسل فيها البطاقة (اختياري)').setRequired(false)),
        new SlashCommandBuilder()
            .setName('commands')
            .setDescription('إرسال لوحة دليل الأوامر الرسمي في بطاقة Embed احترافية')
            .addChannelOption(opt => opt.setName('channel').setDescription('القناة التي ستُرسل فيها البطاقة (اختياري)').setRequired(false)),
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('عرض دليل الأوامر الرسمي الشامل')
            .addChannelOption(opt => opt.setName('channel').setDescription('القناة التي ستُرسل فيها البطاقة (اختياري)').setRequired(false)),
        new SlashCommandBuilder()
            .setName('security')
            .setDescription('🛡️ إدارة وإعدادات حماية السيرفر (أنتي روابط، أنتي صور، أنتي سبام)')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addSubcommand(sub =>
                sub.setName('panel')
                    .setDescription('عرض لوحة تحكم الحماية التفاعلية بالأزرار')
            )
            .addSubcommand(sub =>
                sub.setName('antilink')
                    .setDescription('تفعيل أو تعطيل نظام منع الروابط والترويج')
                    .addBooleanOption(opt => opt.setName('enable').setDescription('تفعيل (True) أو تعطيل (False)').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('antiimage')
                    .setDescription('تفعيل أو تعطيل نظام منع الصور والوسائط')
                    .addBooleanOption(opt => opt.setName('enable').setDescription('تفعيل (True) أو تعطيل (False)').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('antispam')
                    .setDescription('تفعيل أو تعطيل نظام منع السبام وتكرار الرسائل')
                    .addBooleanOption(opt => opt.setName('enable').setDescription('تفعيل (True) أو تعطيل (False)').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('logchannel')
                    .setDescription('تعيين روم سجلات وإشعارات الحماية والأمان')
                    .addChannelOption(opt => opt.setName('channel').setDescription('القناة المراد إرسال السجلات إليها').setRequired(true))
            )
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }

    await loadMatchesFromDb();
});

// معالجة الرسائل العادية
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    // التحقق من صلاحيات العضو للاستثناء (Staff / Admin Bypass)
    let member = message.member;
    if (!member && message.guild) {
        member = await message.guild.members.fetch(userId).catch(() => null);
    }

    const isStaff = member && (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        member.roles.cache.some(r => {
            const n = r.name.toLowerCase();
            return n.includes('owner') || n.includes('admin') || n.includes('staff') || n.includes('mod');
        })
    );

    // --- فلاتر حماية السيرفر (Server Protection Filters) ---
    if (!isStaff) {
        const secSettings = await getProtectionSettings(guildId);

        // 1. أنتي ليان / Anti-Link (منع نشر الروابط والدعوات والترويج)
        if (secSettings.antiLink) {
            const rawContent = message.content || '';
            const hasInvite = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9_-]+/i.test(rawContent);
            const hasUrl = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.(com|net|org|io|gg|me|tv|xyz|app|dev|top|site|online|live|store|link|info|ru|co|uk)[^\s]*)/i.test(rawContent);

            if (hasInvite || hasUrl) {
                await message.delete().catch(() => {});
                const warnMsg = await message.channel.send({
                    content: `⚠️ عذراً ${message.author}، **يُمنع منعاً باتاً إرسال الروابط أو الترويج** في هذا السيرفر! 🛡️`
                }).catch(() => null);
                if (warnMsg) {
                    setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
                }
                sendSecurityLog(message.guild, 'منع إرسال رابط (Anti-Link)', `قام العضو بمحاولة إرسال رابط في الشات وتم حذف رسالته تلقائياً.`, '#ed4245', [
                    { name: '👤 العضو', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
                    { name: '💬 القناة', value: `${message.channel}`, inline: true },
                    { name: '🔗 المحتوى المخالف', value: `\`\`\`${rawContent.slice(0, 500)}\`\`\``, inline: false }
                ]);
                return;
            }
        }

        // 2. أنتي صور / Anti-Image (منع الصور والميديا والصور المتحركة)
        if (secSettings.antiImage) {
            let hasImage = false;
            if (message.attachments.size > 0) {
                hasImage = message.attachments.some(att => {
                    const ct = (att.contentType || '').toLowerCase();
                    const name = (att.name || '').toLowerCase();
                    return ct.startsWith('image/') || ct.startsWith('video/') || /\.(png|jpe?g|gif|webp|bmp|svg|mp4|mov|webm)$/i.test(name);
                });
            }

            if (!hasImage && message.content) {
                hasImage = /https?:\/\/(tenor\.com|giphy\.com|media\.giphy\.com|cdn\.discordapp\.com\/attachments|images-ext-\d+\.discordapp\.net|imgur\.com)\/[^\s]+/i.test(message.content) ||
                           /https?:\/\/[^\s]+\.(png|jpe?g|gif|webp|bmp)($|\?)/i.test(message.content);
            }

            if (hasImage) {
                await message.delete().catch(() => {});
                const warnMsg = await message.channel.send({
                    content: `🖼️🚫 عذراً ${message.author}، **يُمنع إرسال الصور والوسائط** في هذا الشات! 🛡️`
                }).catch(() => null);
                if (warnMsg) {
                    setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
                }
                sendSecurityLog(message.guild, 'منع إرسال صورة/ميديا (Anti-Image)', `قام العضو بإرسال صورة أو وسائط وتم حذف رسالته فوراً.`, '#ed4245', [
                    { name: '👤 العضو', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
                    { name: '💬 القناة', value: `${message.channel}`, inline: true }
                ]);
                return;
            }
        }

        // 3. أنتي سبام ووضع التباطؤ / Anti-Spam & Slow Mode (5 Seconds Cooldown)
        if (secSettings.antiSpam) {
            const now = Date.now();
            const spamKey = `${guildId}_${userId}`;
            let userRecord = userSpamTracker.get(spamKey);
            if (!userRecord) {
                userRecord = { lastTimestamp: 0, lastMessage: '', strikes: 0, lastStrike: 0 };
                userSpamTracker.set(spamKey, userRecord);
            }

            const timeSinceLastMsg = now - (userRecord.lastTimestamp || 0);
            const isSlowModeViolation = timeSinceLastMsg < 5000 && userRecord.lastTimestamp > 0;
            const cleanContent = (message.content || '').trim().toLowerCase();
            const isDuplicate = cleanContent && cleanContent === userRecord.lastMessage && timeSinceLastMsg < 10000;

            if (isSlowModeViolation || isDuplicate) {
                await message.delete().catch(() => {});

                if (now - userRecord.lastStrike > 60000) {
                    userRecord.strikes = 1;
                } else {
                    userRecord.strikes += 1;
                }
                userRecord.lastStrike = now;

                if (userRecord.strikes >= 3 && member && member.moderatable) {
                    await member.timeout(60 * 1000, 'Slow Mode (5s) / Anti-Spam Auto Timeout').catch(() => {});
                    const muteMsg = await message.channel.send({
                        content: `⛔ تم كتم ${message.author} لمدة دقيقة واحدة تلقائياً بسبب تكرار مخالفة التباطؤ (Slow Mode) والسبام! 🛡️`
                    }).catch(() => null);
                    if (muteMsg) setTimeout(() => muteMsg.delete().catch(() => {}), 7000);

                    sendSecurityLog(message.guild, 'كتم عضو بسبب مخالفة التباطؤ (Slow Mode Timeout)', `تم كتم العضو تلقائياً لمدة 60 ثانية بعد محاولات إرسال رسائل متتالية في أقل من 5 ثوانٍ.`, '#fee75c', [
                        { name: '👤 العضو', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
                        { name: '💬 القناة', value: `${message.channel}`, inline: true },
                        { name: '⚡ سبب الإجراء', value: isSlowModeViolation ? 'مخالفة وضع التباطؤ (أقل من 5 ثوانٍ)' : 'تكرار نفس الرسالة', inline: false }
                    ]);
                } else {
                    const remainingSec = Math.max(1, Math.ceil((5000 - timeSinceLastMsg) / 1000));
                    const warnMsg = await message.channel.send({
                        content: isDuplicate
                            ? `⚡🚫 عذراً ${message.author}، **يرجى عدم تكرار نفس الرسالة!** 🛡️`
                            : `⏳ عذراً ${message.author}، **وضع التباطؤ مفعّل (Slow Mode)!** يرجى الانتظار \`${remainingSec}\` ثانية بين كل رسالة. 🛡️`
                    }).catch(() => null);
                    if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 4000);
                }
                return;
            }

            // تحديث آخر توقيت عند قبول الرسالة
            userRecord.lastTimestamp = now;
            userRecord.lastMessage = cleanContent;
        }
    }

    // تتبع الـ XP
    db.get(`SELECT * FROM users WHERE userId = ? AND guildId = ?`, [userId, guildId], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (userId, guildId, xp, level, messages) VALUES (?, ?, 15, 1, 1)`, [userId, guildId]);
        } else {
            const newXp = row.xp + 15;
            const newMessages = row.messages + 1;
            let newLevel = row.level;
            if (newXp >= row.level * 100) newLevel += 1;
            db.run(`UPDATE users SET xp = ?, level = ?, messages = ? WHERE userId = ? AND guildId = ?`, [newXp, newLevel, newMessages, userId, guildId]);
        }
    });

    const content = message.content.trim();

    // أمر البروفايل !p أو !profile
    if (content.toLowerCase() === '!p' || content.toLowerCase() === '!profile') {
        try {
            const stats = await getUserStats(userId, guildId);
            const buffer = await generateProfileCard(message.author, message.member, stats);
            if (buffer) {
                const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });
                return message.reply({ files: [attachment] });
            } else {
                const totalMatches = stats.matches || (stats.wins + stats.losses);
                const winrate = totalMatches > 0 ? Math.round((stats.wins / totalMatches) * 100) : 0;
                const profileEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`📊 بروفايل اللاعب | ${message.author.username}`)
                    .setThumbnail(message.author.displayAvatarURL({ extension: 'png', size: 256 }))
                    .addFields(
                        { name: '🏆 النقاط (Points)', value: `**${stats.points || 0}**`, inline: true },
                        { name: '⚔️ الانتصارات (Wins)', value: `**${stats.wins || 0}**`, inline: true },
                        { name: '💀 الهزائم (Losses)', value: `**${stats.losses || 0}**`, inline: true },
                        { name: '🎖️ MVP', value: `**${stats.mvps || 0}**`, inline: true },
                        { name: '🎮 المباريات', value: `**${totalMatches || 0}**`, inline: true },
                        { name: '📈 نسبة الفوز', value: `**${winrate}%**`, inline: true },
                        { name: '📋 تنظيم', value: `**${stats.organize || 0}**`, inline: true },
                        { name: '⭐ المستوى (Level)', value: `**${stats.level || 1}**`, inline: true },
                        { name: '💬 الرسائل', value: `**${stats.messages || 0}**`, inline: true }
                    )
                    .setFooter({ text: 'Apostado Manager', iconURL: message.guild.iconURL() })
                    .setTimestamp();
                return message.reply({ embeds: [profileEmbed] });
            }
        } catch (err) {
            console.error(err);
            return message.reply('❌ حدث خطأ أثناء إنشاء بطاقة البروفايل.');
        }
    }

    // أمر لوحة المتصدرين !top
    if (content.toLowerCase() === '!top' || content.toLowerCase() === '!leaderboard') {
        db.all(`SELECT * FROM users WHERE guildId = ? ORDER BY points DESC LIMIT 10`, [guildId], (err, rows) => {
            if (err || !rows || rows.length === 0) {
                return message.reply('📊 لا توجد إحصائيات كافية بعد.');
            }
            const desc = rows.map((r, i) => `**#${i + 1}** <@${r.userId}> — 🏆 **${r.points}** pts | ⚔️ **${r.wins}** W / **${r.losses}** L`).join('\n');
            const topEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('🏆 Apostado Leaderboard')
                .setDescription(desc)
                .setFooter({ text: 'Apostado Manager', iconURL: message.guild.iconURL() })
                .setTimestamp();
            return message.reply({ embeds: [topEmbed] });
        });
        return;
    }

    // أمر دليل الأوامر المميز &apos أو !apos أو &guide أو !guide
    const helpTriggers = ['&apos', '!apos', '&guide', '!guide', '&rules', '!help', '!commands', '&help', '&commands'];
    if (helpTriggers.includes(content.toLowerCase())) {
        const embed = generateCommandsEmbed(message.guild);
        return message.reply({ embeds: [embed] });
    }

    // أمر إدارة حماية السيرفر النصي !security أو !protect
    if (content.toLowerCase().startsWith('!security') || content.toLowerCase().startsWith('!protect')) {
        const hasAdminPerm = message.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                             message.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!hasAdminPerm) {
            return message.reply('❌ هذا الأمر مخصص لطاقم إدارة السيرفر فقط!');
        }

        const parts = content.trim().split(/\s+/);
        const sub = parts[1]?.toLowerCase();
        const curSettings = await getProtectionSettings(guildId);

        if (sub === 'antilink') {
            const val = parts[2]?.toLowerCase();
            const enable = ['on', '1', 'enable', 'true'].includes(val) ? 1 : (['off', '0', 'disable', 'false'].includes(val) ? 0 : (curSettings.antiLink ? 0 : 1));
            const updated = await updateProtectionSetting(guildId, { antiLink: enable });
            return message.reply(`✅ **تم ${updated.antiLink ? 'تفعيل 🟢' : 'تعطيل 🔴'} نظام منع الروابط والترويج (Anti-Link)!**`);
        }

        if (sub === 'antiimage' || sub === 'images' || sub === 'photo' || sub === 'photos') {
            const val = parts[2]?.toLowerCase();
            const enable = ['on', '1', 'enable', 'true'].includes(val) ? 1 : (['off', '0', 'disable', 'false'].includes(val) ? 0 : (curSettings.antiImage ? 0 : 1));
            const updated = await updateProtectionSetting(guildId, { antiImage: enable });
            return message.reply(`✅ **تم ${updated.antiImage ? 'تفعيل 🟢' : 'تعطيل 🔴'} نظام منع الصور والوسائط (Anti-Image)!**`);
        }

        if (sub === 'antispam' || sub === 'spam') {
            const val = parts[2]?.toLowerCase();
            const enable = ['on', '1', 'enable', 'true'].includes(val) ? 1 : (['off', '0', 'disable', 'false'].includes(val) ? 0 : (curSettings.antiSpam ? 0 : 1));
            const updated = await updateProtectionSetting(guildId, { antiSpam: enable });
            return message.reply(`✅ **تم ${updated.antiSpam ? 'تفعيل 🟢' : 'تعطيل 🔴'} نظام منع السبام وتكرار الرسائل (Anti-Spam)!**`);
        }

        if (sub === 'logchannel' || sub === 'log' || sub === 'logs') {
            const targetChannel = message.mentions.channels.first() || (parts[2] ? message.guild.channels.cache.get(parts[2]) : null);
            if (!targetChannel) {
                return message.reply('ℹ️ **الاستخدام:** `!security logchannel #channel` لتحديد روم سجلات الحماية.');
            }
            await updateProtectionSetting(guildId, { logChannelId: targetChannel.id });
            return message.reply(`✅ **تم تعيين روم سجلات الحماية بنجاح إلى:** ${targetChannel}`);
        }

        const embed = generateSecurityPanelEmbed(message.guild, curSettings);
        const components = generateSecurityPanelComponents(curSettings);
        return message.reply({ embeds: [embed], components });
    }

    // أمر النقل الصوتي &move أو !move
    if (content.toLowerCase().startsWith('&move') || content.toLowerCase().startsWith('!move')) {
        const hasPermission = message.member.permissions.has(PermissionFlagsBits.MoveMembers) || 
                              message.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                              message.member.permissions.has(PermissionFlagsBits.Administrator) || 
                              message.member.roles.cache.some(r => {
                                  const name = r.name.toLowerCase();
                                  return name.includes('staff') || name.includes('admin') || name.includes('moderator') || name.includes('mod') || name.includes('apos');
                              });

        if (!hasPermission) {
            const noPermEmbed = new EmbedBuilder()
                .setColor('#ed4245')
                .setDescription('❌ You do not have permission');
            return message.reply({ embeds: [noPermEmbed] });
        }

        const authorVoiceChannel = message.member.voice.channel;
        if (!authorVoiceChannel) {
            const noVoiceEmbed = new EmbedBuilder()
                .setColor('#ed4245')
                .setDescription('❌ You must be in a voice channel to move members.');
            return message.reply({ embeds: [noVoiceEmbed] });
        }

        const parts = content.trim().split(/\s+/);
        const targetRaw = parts[1];

        if (!targetRaw) {
            const usageEmbed = new EmbedBuilder()
                .setColor('#ed4245')
                .setDescription('❌ Please specify a user to move: `&move <@user / ID>`');
            return message.reply({ embeds: [usageEmbed] });
        }

        let targetMember = message.mentions.members.first();
        if (!targetMember) {
            const cleanId = targetRaw.replace(/[<@!>]/g, '');
            if (/^\d{17,20}$/.test(cleanId)) {
                targetMember = await message.guild.members.fetch(cleanId).catch(() => null);
            } else {
                targetMember = message.guild.members.cache.find(m => 
                    m.user.username.toLowerCase() === targetRaw.toLowerCase() || 
                    m.displayName.toLowerCase() === targetRaw.toLowerCase() ||
                    m.user.tag.toLowerCase() === targetRaw.toLowerCase()
                );
                if (!targetMember) {
                    try {
                        const searched = await message.guild.members.search({ query: targetRaw, limit: 1 });
                        if (searched && searched.size > 0) targetMember = searched.first();
                    } catch (e) {}
                }
            }
        }

        if (!targetMember) {
            const notFoundEmbed = new EmbedBuilder()
                .setColor('#ed4245')
                .setDescription('❌ Member not found in this server.');
            return message.reply({ embeds: [notFoundEmbed] });
        }

        if (!targetMember.voice.channel) {
            const notInVoiceEmbed = new EmbedBuilder()
                .setColor('#ed4245')
                .setDescription('❌ The target member is not in any voice channel.');
            return message.reply({ embeds: [notInVoiceEmbed] });
        }

        try {
            await targetMember.voice.setChannel(authorVoiceChannel);
            const successEmbed = new EmbedBuilder()
                .setColor('#57f287')
                .setTitle('✔ • Member moved')
                .setDescription(
                    `\n` +
                    `╰┈➤ User: ${targetMember.displayName}\n` +
                    `╰┈➤ Channel: ${authorVoiceChannel.name}`
                )
                .setFooter({ text: `© ${new Date().getFullYear()} ${message.guild.name}. All Rights Reserved.` });

            return message.reply({ embeds: [successEmbed] });
        } catch (err) {
            console.error('Error moving member:', err);
            const failEmbed = new EmbedBuilder()
                .setColor('#ed4245')
                .setDescription('❌ Failed to move member. Please check bot permissions.');
            return message.reply({ embeds: [failEmbed] });
        }
    }

    // أوامر البلاك ليست النصية للإدارة (!blacklist / !unblacklist / !bl)
    if (content.toLowerCase().startsWith('!blacklist') || content.toLowerCase().startsWith('!bl ') || content.toLowerCase().startsWith('!unblacklist') || content.toLowerCase().startsWith('!unbl ')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ هذا الأمر مخصص لطاقم الإدارة فقط!');
        }

        const parts = content.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();

        if (cmd === '!blacklist' || cmd === '!bl') {
            if (parts[1]?.toLowerCase() === 'list') {
                const list = await getBlacklistedUsers(guildId);
                if (!list || list.length === 0) {
                    return message.reply('ℹ️ **لا يوجد أي لاعبين في قائمة البلاك ليست حالياً.**');
                }
                const desc = list.map((item, idx) => {
                    return `**#${idx + 1}** <@${item.userId}> (\`${item.userId}\`)\n⏳ **الوقت المتبقي:** \`${formatRemainingTime(item.remainingMs)}\`\n📝 **السبب:** \`${item.reason}\``;
                }).join('\n\n');
                const listEmbed = new EmbedBuilder()
                    .setColor('#ff0033')
                    .setTitle('📋 قائمة المحظورين حالياً (Blacklist)')
                    .setDescription(desc)
                    .setFooter({ text: `${message.guild.name} • Total: ${list.length}` })
                    .setTimestamp();
                return message.reply({ embeds: [listEmbed] });
            }

            const targetUser = message.mentions.users.first() || (parts[1] ? await client.users.fetch(parts[1]).catch(() => null) : null);
            if (!targetUser) {
                return message.reply('ℹ️ **الاستخدام:** `!blacklist @user [minutes] [reason]` أو `!blacklist list`');
            }

            const minutes = parseInt(parts[2]) || 15;
            const reason = parts.slice(3).join(' ') || 'مخالفة القوانين';

            await setUserBlacklist(targetUser.id, guildId, minutes, reason);

            const blEmbed = new EmbedBuilder()
                .setColor('#ff0033')
                .setTitle('⛔ تم إضافة اللاعب إلى البلاك ليست (Blacklist)')
                .setDescription(`👤 **اللاعب:** ${targetUser} (\`${targetUser.id}\`)\n⏰ **المدة:** \`${minutes}\` دقيقة\n📝 **السبب:** \`${reason}\`\n👑 **بواسطة:** ${message.author}`)
                .setFooter({ text: `${message.guild.name} • Blacklist System` })
                .setTimestamp();

            return message.reply({ embeds: [blEmbed] });
        }

        if (cmd === '!unblacklist' || cmd === '!unbl') {
            const targetUser = message.mentions.users.first() || (parts[1] ? await client.users.fetch(parts[1]).catch(() => null) : null);
            if (!targetUser) {
                return message.reply('ℹ️ **الاستخدام:** `!unblacklist @user`');
            }

            await removeUserBlacklist(targetUser.id, guildId);

            const unblEmbed = new EmbedBuilder()
                .setColor('#00ff88')
                .setTitle('✅ تم فك حظر اللاعب من البلاك ليست')
                .setDescription(`👤 **اللاعب:** ${targetUser} (\`${targetUser.id}\`)\n👑 **تم فك الحظر بواسطة:** ${message.author}`)
                .setFooter({ text: `${message.guild.name} • Blacklist System` })
                .setTimestamp();

            return message.reply({ embeds: [unblEmbed] });
        }
    }

    // أمر فك التعليق عن لاعب !unblock أو !free
    if (content.toLowerCase().startsWith('!unblock') || content.toLowerCase().startsWith('!free')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ هذا الأمر مخصص لطاقم الإدارة فقط!');
        }

        const parts = content.trim().split(/\s+/);
        const targetUser = message.mentions.users.first() || (parts[1] ? await client.users.fetch(parts[1]).catch(() => null) : null);
        if (!targetUser) {
            return message.reply('ℹ️ **الاستخدام:** `!unblock @user` لفك التعليق أو البلاك ليست عن لاعب');
        }

        await removeUserBlacklist(targetUser.id, guildId);

        for (const m of activeMatches.values()) {
            if (m.guildId === guildId) {
                m.team1 = m.team1.filter(id => id !== targetUser.id);
                m.team2 = m.team2.filter(id => id !== targetUser.id);
                if (m.hostId === targetUser.id || (m.team1.length === 0 && m.team2.length === 0)) {
                    activeMatches.delete(m.id);
                    removeMatchFromDb(m.id);
                } else {
                    saveMatchToDb(m);
                }
            }
        }

        return message.reply(`✅ **تم فك التعليق والحظر عن ${targetUser} بنجاح!** يمكنه الآن إنشاء أو الانضمام لأي مباراة فوراً.`);
    }

    // أمر مسح جميع المباريات المعلقة وإعادة ضبط السيرفر !clearmatches أو !resetmatches
    if (content.toLowerCase() === '!clearmatches' || content.toLowerCase() === '!resetmatches') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply('❌ هذا الأمر مخصص لطاقم الإدارة فقط!');
        }

        const { matchCount, strandedCount } = await clearAllMatches(message.guild, message.author, message.channel);
        return message.reply(`🧹 **تم تنظيف جميع المباريات المعلقة (${matchCount}) وتعطيل (${strandedCount}) رسالة لوبي معلقة وفك التعليق عن جميع اللاعبين في السيرفر بنجاح!**`);
    }

    // أمر تعيين MVP Winner للإدارة !w
    if (content.toLowerCase().startsWith('!w ') || content.toLowerCase() === '!w') {
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                        message.member.permissions.has(PermissionFlagsBits.Administrator) ||
                        message.member.roles.cache.some(r => r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('admin'));
        
        if (!isAdmin) {
            return message.reply('❌ هذا الأمر مخصص لطاقم الإدارة فقط!');
        }

        const parts = content.trim().split(/\s+/);
        const targetUser = message.mentions.users.first() || (parts[1] ? await client.users.fetch(parts[1]).catch(() => null) : null);
        if (!targetUser) {
            return message.reply('ℹ️ **الاستخدام:** `!w @user` لتحديد MVP الفائز للفريق الفائز.');
        }

        // البحث عن الماتش في القناة الحالية أو باللاعب
        let match = Array.from(activeMatches.values()).find(m => 
            m.guildId === guildId && (m.matchChannelId === message.channel.id || m.threadId === message.channel.id)
        );

        if (!match) {
            match = Array.from(activeMatches.values()).find(m => 
                m.guildId === guildId && (m.team1.includes(targetUser.id) || m.team2.includes(targetUser.id))
            );
        }

        if (!match) {
            return message.reply('❌ لم يتم العثور على مباراة نشطة لهذا اللاعب أو في هذه القناة.');
        }

        const isT1 = match.team1.includes(targetUser.id);
        const isT2 = match.team2.includes(targetUser.id);

        if (!isT1 && !isT2) {
            return message.reply(`❌ اللاعب <@${targetUser.id}> ليس مشاركاً في هذه المباراة (Match ID: \`${match.id}\`).`);
        }

        match.winningMvpUid = targetUser.id;
        match.winningTeam = isT1 ? 1 : 2;
        match.winnerVotingConcluded = true;
        saveMatchToDb(match);

        const bothSelected = !!match.losingMvpUid;

        const dateStr = new Date().toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        const winEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('✔ MVP Winner Set')
            .setDescription(`✅ MVP Winner has been set to <@${targetUser.id}> by staff.\n\n**Match ID:** \`${match.id}\``)
            .setFooter({ text: dateStr });

        await message.channel.send({ embeds: [winEmbed] });

        if (bothSelected) {
            await message.channel.send({ content: '🎉 **Both MVPs selected! Finalizing match...**' });
            await finalizeMatch(message.guild, match, message.channel);
        }
        return;
    }

    // أمر تعيين MVP Loser للإدارة !l
    if (content.toLowerCase().startsWith('!l ') || content.toLowerCase() === '!l') {
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                        message.member.permissions.has(PermissionFlagsBits.Administrator) ||
                        message.member.roles.cache.some(r => r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('admin'));
        
        if (!isAdmin) {
            return message.reply('❌ هذا الأمر مخصص لطاقم الإدارة فقط!');
        }

        const parts = content.trim().split(/\s+/);
        const targetUser = message.mentions.users.first() || (parts[1] ? await client.users.fetch(parts[1]).catch(() => null) : null);
        if (!targetUser) {
            return message.reply('ℹ️ **الاستخدام:** `!l @user` لتحديد MVP الخاسر للفريق الخاسر.');
        }

        // البحث عن الماتش في القناة الحالية أو باللاعب
        let match = Array.from(activeMatches.values()).find(m => 
            m.guildId === guildId && (m.matchChannelId === message.channel.id || m.threadId === message.channel.id)
        );

        if (!match) {
            match = Array.from(activeMatches.values()).find(m => 
                m.guildId === guildId && (m.team1.includes(targetUser.id) || m.team2.includes(targetUser.id))
            );
        }

        if (!match) {
            return message.reply('❌ لم يتم العثور على مباراة نشطة لهذا اللاعب أو في هذه القناة.');
        }

        const isT1 = match.team1.includes(targetUser.id);
        const isT2 = match.team2.includes(targetUser.id);

        if (!isT1 && !isT2) {
            return message.reply(`❌ اللاعب <@${targetUser.id}> ليس مشاركاً في هذه المباراة (Match ID: \`${match.id}\`).`);
        }

        match.losingMvpUid = targetUser.id;
        if (!match.winningTeam) {
            match.winningTeam = isT1 ? 2 : 1;
        }
        saveMatchToDb(match);

        const bothSelected = !!match.winningMvpUid;

        const dateStr = new Date().toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });

        const loseEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('✔ MVP Loser Set')
            .setDescription(
                `✅ MVP Loser has been set to <@${targetUser.id}> by staff.\n\n**Match ID:** \`${match.id}\`` +
                (bothSelected ? '\n\n🎉 **Both MVPs selected! Finalizing match...**' : '')
            )
            .setFooter({ text: dateStr });

        await message.channel.send({ embeds: [loseEmbed] });

        if (bothSelected) {
            await finalizeMatch(message.guild, match, message.channel);
        }
        return;
    }

    // أمر إنشاء المباريات !play (فقط 2v2, 3v3, 4v4)
    if (content.toLowerCase().startsWith('!play') || content.toLowerCase().startsWith('! play')) {
        // 1. التحقق من القناة المسموح بها حصراً (apostada play, zelika play, highlight play)
        if (!isAllowedPlayChannel(message.channel)) {
            const allowedChannels = message.guild.channels.cache.filter(c => isAllowedPlayChannel(c));
            const channelsList = allowedChannels.size > 0 
                ? allowedChannels.map(c => `• <#${c.id}>`).join('\n')
                : '• `🎮-l-apostada-·-play`\n• `🎮-l-highlight-play`\n• `🎮-l-zelika-play`';

            return message.reply({
                content: `❌ **لا يمكن إنشاء المباريات في هذه القناة!**\n\nيُسمح باستخدام أمر \`!play\` حصراً داخل قنوات اللعب التالية:\n${channelsList}\n\n*ملاحظة: لا يُسمح بإنشاء الرومات في الشات العام أو داخل القنوات الصوتية وشات الفويس.*`
            });
        }

        // التحقق من البلاك ليست
        const bl = await isUserBlacklisted(userId, guildId);
        if (bl.blacklisted) {
            return message.reply(`⛔ **أنت في قائمة الحظر (Blacklist)!**\n⏳ **متبقي على فك الحظر:** \`${formatRemainingTime(bl.remainingMs)}\`\n📝 **السبب:** \`${bl.reason}\``);
        }

        // التحقق من التواجد في مباراة نشطة حقيقية لم يكتمل تصويتها (مع تنظيف الرومات المحذوفة تلقائياً)
        const activeMatchForUser = getRealActiveMatchForUser(message.guild, userId);
        if (activeMatchForUser) {
            const chId = activeMatchForUser.matchChannelId || activeMatchForUser.threadId;
            return message.reply(`❌ **لا يمكنك إنشاء مباراة جديدة!**\nأنت مشارك بالفعل في مباراة نشطة (<#${chId}>) حتى ينتهي التصويت بالكامل.`);
        }

        const cleanContent = content.replace(/\s+/g, ' ').trim();
        const parts = cleanContent.split(' ');
        
        let modeArg = parts[1] ? parts[1].toLowerCase() : '';
        if (cleanContent.toLowerCase().startsWith('! play')) {
            modeArg = parts[2] ? parts[2].toLowerCase() : '';
        }

        const validModes = {
            '2v2': 2,
            '3v3': 3,
            '4v4': 4
        };

        if (!modeArg || !validModes[modeArg]) {
            const invalidEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle('ℹ️ Invalid Mode')
                .setDescription('Please specify a valid mode: `!play 2v2`, `!play 3v3`, or `!play 4v4`')
                .setFooter({ text: new Date().toLocaleString() });

            return message.reply({ embeds: [invalidEmbed] });
        }

        // التحقق من أن المستضيف متواجد في إحدى غرف الانتظار
        const hostVoice = message.member?.voice?.channel;
        if (!hostVoice || !hostVoice.name.toLowerCase().includes('waiting')) {
            return message.reply('❌ **يجب أن تكون متواجداً في إحدى غرف الانتظار (waiting 1 / waiting 2 / waiting 3...) أولاً** لإنشاء المباراة!');
        }

        const teamSize = validModes[modeArg];
        const matchId = Math.floor(10000 + Math.random() * 90000).toString();

        const match = {
            id: matchId,
            guildId: message.guild.id,
            channelId: message.channel.id,
            hostId: message.author.id,
            mode: modeArg.toUpperCase(),
            teamSize: teamSize,
            roomId: null,
            password: null,
            privateKey: null,
            team1: [],
            team2: [],
            originalVoiceChannels: new Map(), // userId -> original waiting channel ID
            state: 'WAITING_INFO',
            promptMessageId: null,
            lobbyMessageId: null,
            threadId: null,
            parentChannelId: null,
            matchChannelId: null,
            team1VoiceId: null,
            team2VoiceId: null,
            infoTimeout: null,
            lobbyTimeout: null,
            winnerVotes: new Map(), // userId -> { candidateId, team }
            loserVotes: new Map(),  // userId -> candidateId
            winnerVoteMessageId: null,
            winnerVotingActive: false,
            winnerVotingConcluded: false,
            winningMvpUid: null,
            winningTeam: null,
            loserVoteMessageId: null,
            loserVotingActive: false,
            losingMvpUid: null,
            cancelVotes: new Set(), // userIds who voted to cancel match
            cancelInitiatorId: null,
            cancelMessageId: null,
            cancelVoteActive: false,
            votingCompleted: false
        };

        activeMatches.set(matchId, match);

        const createEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`✔ Create ${match.mode} Match`)
            .setDescription(`**Host:** <@${message.author.id}>\n\nClick the button below to enter the room information.\nThis will create the match and allow players to join.`)
            .setFooter({ text: new Date().toLocaleString() });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`enter_room_info_${matchId}`)
                .setLabel('Enter Room Info')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👾')
        );

        const promptMsg = await message.reply({ embeds: [createEmbed], components: [row] });
        match.promptMessageId = promptMsg.id;
        saveMatchToDb(match);

        // مهلة 30 ثانية لإدخال معلومات الروم
        match.infoTimeout = setTimeout(async () => {
            const currentMatch = activeMatches.get(matchId);
            if (currentMatch && currentMatch.state === 'WAITING_INFO') {
                activeMatches.delete(matchId);
                removeMatchFromDb(matchId);
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setDescription(`You didn't enter room information within 30 seconds\n\nMode: ${match.mode}\nUse \`!play ${modeArg}\` to try again.`)
                    .setFooter({ text: new Date().toLocaleString() });

                await promptMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        }, 30000);
    }
});

// معالجة التفاعلات
client.on('interactionCreate', async interaction => {
    try {
        // --- 1. أوامر Slash Commands ---
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'profile') {
                await interaction.deferReply();
                const targetUser = interaction.options.getUser('user') || interaction.user;
                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                const stats = await getUserStats(targetUser.id, interaction.guild.id);

                // حساب الوقت الصوتي
                let voiceSec = stats.voiceTime || 0;
                const currentJoin = voiceJoinTimes.get(`${targetUser.id}_${interaction.guild.id}`);
                if (currentJoin) {
                    voiceSec += Math.floor((Date.now() - currentJoin) / 1000);
                }
                const hours = Math.floor(voiceSec / 3600);
                const mins = Math.floor((voiceSec % 3600) / 60);
                const secs = voiceSec % 60;
                const voiceStr = hours > 0 ? `${hours}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;

                // تاريخ الانضمام
                let joinedStr = 'Unknown';
                if (member && member.joinedTimestamp) {
                    joinedStr = `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`;
                }

                // الرتب
                let rolesStr = 'No Roles';
                if (member) {
                    const memberRoles = member.roles.cache.filter(r => r.id !== interaction.guild.id);
                    if (memberRoles.size > 0) {
                        rolesStr = memberRoles.map(r => `<@&${r.id}>`).slice(0, 10).join(' ');
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`📊 Profile — ${targetUser.username}`)
                    .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
                    .addFields(
                        { name: '⭐ Level', value: `${stats.level || 1}`, inline: true },
                        { name: '✨ XP', value: `${stats.xp || 0}`, inline: true },
                        { name: '🏆 Rank', value: `#${stats.rank || 1}`, inline: true },
                        { name: '💬 Messages', value: `${stats.messages || 0}`, inline: true },
                        { name: '🎙️ Voice Time', value: voiceStr, inline: true },
                        { name: '📅 Joined Server', value: joinedStr, inline: false },
                        { name: '🎭 Roles', value: rolesStr, inline: false }
                    )
                    .setFooter({ text: `${interaction.guild.name} • Management System`, iconURL: interaction.guild.iconURL() || client.user.displayAvatarURL() })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (commandName === 'rank') {
                await interaction.deferReply();
                const targetUser = interaction.options.getUser('user') || interaction.user;
                const stats = await getUserStats(targetUser.id, interaction.guild.id);

                const nextLevelXp = (stats.level || 1) * 100;
                const currentXp = stats.xp || 0;

                const embed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle(`🏆 Rank Stats — ${targetUser.username}`)
                    .setDescription('إليك إحصائيات المستوى والـ XP يا أسطى!')
                    .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
                    .addFields(
                        { name: '⭐ Level', value: `${stats.level || 1}`, inline: true },
                        { name: '✨ XP', value: `${currentXp}`, inline: true },
                        { name: '📊 Server Rank', value: `#${stats.rank || 1}`, inline: true },
                        { name: '📈 Next Level', value: `${currentXp} / ${nextLevelXp} XP`, inline: false }
                    )
                    .setFooter({ text: `${interaction.guild.name} • Management System`, iconURL: interaction.guild.iconURL() || client.user.displayAvatarURL() })
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            if (commandName === 'leaderboard') {
                await interaction.deferReply();
                db.all(`SELECT * FROM users WHERE guildId = ? ORDER BY points DESC LIMIT 10`, [interaction.guild.id], async (err, rows) => {
                    if (err || !rows || rows.length === 0) {
                        return interaction.editReply({ content: '📊 لا توجد إحصائيات كافية بعد.' });
                    }
                    const desc = rows.map((r, i) => `**#${i + 1}** <@${r.userId}> — 🏆 **${r.points}** pts | ⚔️ **${r.wins}** W / **${r.losses}** L`).join('\n');
                    const topEmbed = new EmbedBuilder()
                        .setColor('#2b2d31')
                        .setTitle('🏆 Apostado Leaderboard')
                        .setDescription(desc)
                        .setFooter({ text: `${interaction.guild.name} • Management System`, iconURL: interaction.guild.iconURL() || client.user.displayAvatarURL() })
                        .setTimestamp();
                    return interaction.editReply({ embeds: [topEmbed] });
                });
                return;
            }

            if (commandName === 'rules') {
                const rulesText = `
╭━━━ 🛡️ **[ APOSTADO ACADEMY - SERVER RULES ]** 🛡️ ━━━╮
✨ **أهلاً بك يا بطل في مجتمعنا الرسمي!** لضمان بيئة لعب نزيهة واحترافية:
> 🔹 **الاحترام المتبادل:** يمنع الشتم والسب منعاً باتاً داخل الرومات أو الشات.
> 🔹 **ممنوع الغش والهاكات:** أي لاعب يُثبت استخدامه لأي برنامج غير قانوني يُطرد فوراً.
> 🔹 **الالتزام بالرومات الصوتية:** يجب التواجد في غرف الانتظار (waiting) قبل الدخول للماتش.
📌 **Apostado Manager • Fair Play System**
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
                return interaction.reply({ content: rulesText });
            }

            if (commandName === 'giverole') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return interaction.reply({ content: '❌ ليس لديك صلاحية لإدارة الرتب!', ephemeral: true });
                }
                const targetMember = interaction.options.getMember('member');
                const targetRole = interaction.options.getRole('role');
                if (!targetMember) return interaction.reply({ content: '❌ لم يتم العثور على هذا العضو!', ephemeral: true });
                if (interaction.guild.members.me.roles.highest.position <= targetRole.position) {
                    return interaction.reply({ content: '❌ رتبة البوت أدنى أو مساوية لهذه الرتبة!', ephemeral: true });
                }
                await targetMember.roles.add(targetRole);
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('⚡ ROLE ASSIGNED SUCCESSFULLY ⚡')
                    .setDescription('تم إعطاء الرتبة بنجاح وعليها ختم الجوده يا أسطى!')
                    .setThumbnail(targetMember.user.displayAvatarURL({ size: 512 }))
                    .addFields(
                        { name: '👤 Target Member', value: `${targetMember} (\`${targetMember.user.username}\`)`, inline: false },
                        { name: '🛡️ Granted Role', value: `${targetRole}`, inline: true },
                        { name: '👑 Managed By', value: `${interaction.user}`, inline: true }
                    )
                    .setFooter({ text: `${interaction.guild.name} • Management System`, iconURL: interaction.guild.iconURL() || client.user.displayAvatarURL() })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'removerole') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return interaction.reply({ content: '❌ ليس لديك صلاحية لإدارة الرتب!', ephemeral: true });
                }
                const targetMember = interaction.options.getMember('member');
                const targetRole = interaction.options.getRole('role');
                if (!targetMember) return interaction.reply({ content: '❌ لم يتم العثور على هذا العضو!', ephemeral: true });
                if (interaction.guild.members.me.roles.highest.position <= targetRole.position) {
                    return interaction.reply({ content: '❌ رتبة البوت أدنى أو مساوية لهذه الرتبة!', ephemeral: true });
                }
                await targetMember.roles.remove(targetRole);
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('⚠️ ROLE REMOVED SUCCESSFULLY ⚠️')
                    .setDescription('تم سحب الرتبة بنجاح يا أسطى!')
                    .setThumbnail(targetMember.user.displayAvatarURL({ size: 512 }))
                    .addFields(
                        { name: '👤 Target Member', value: `${targetMember} (\`${targetMember.user.username}\`)`, inline: false },
                        { name: '🛡️ Removed Role', value: `${targetRole}`, inline: true },
                        { name: '👑 Managed By', value: `${interaction.user}`, inline: true }
                    )
                    .setFooter({ text: `${interaction.guild.name} • Management System`, iconURL: interaction.guild.iconURL() || client.user.displayAvatarURL() })
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'ticket') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }
                const targetChannel = interaction.options.getChannel('channel');
                const ticketEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('📁 Tickets')
                    .setDescription('Select a category to open a ticket.');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('create_ticket_help').setLabel('Help').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
                    new ButtonBuilder().setCustomId('create_ticket_abuse').setLabel('Server Abuse').setStyle(ButtonStyle.Danger).setEmoji('⚔️')
                );
                await targetChannel.send({ embeds: [ticketEmbed], components: [row] });
                return interaction.reply({ content: `✅ تم إرسال لوحة التذاكر بنجاح إلى ${targetChannel}`, ephemeral: true });
            }

            if (commandName === 'checker') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام هذا الأمر!', ephemeral: true });
                }
                const targetChannel = interaction.options.getChannel('channel');
                const stats = await getCheckStats(interaction.guild.id);
                const v2CheckerEmbed = new EmbedBuilder()
                    .setColor('#2f3136')
                    .setTitle('Player Check System')
                    .setDescription('Report suspicious players for verification\n\n🚨 **How it works:**\n• Click **Check a user** → @tag a **server member**\n• Choose if they play on **Phone** or **PC**\n• Pay **50 points** to request a check\n• If the player is a **cheater** → Your **50 points** are recovered and you get **+20 points** 🤌\n• If the player is **clean** → You lose **30 points**\n\nStats:\n> Pending: `' + stats.pending + '` | Cheaters Found: `' + stats.cheaters + '` | Clean: `' + stats.clean + '`')
                    .setFooter({ text: 'Apostado Anti-Cheat Division', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();
                const v2CheckerRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('open_checker_interactive').setLabel('Check a user').setStyle(ButtonStyle.Secondary).setEmoji('🔍'),
                    new ButtonBuilder().setCustomId('view_my_reports').setLabel('See my reports').setStyle(ButtonStyle.Secondary).setEmoji('📋')
                );
                await targetChannel.send({ embeds: [v2CheckerEmbed], components: [v2CheckerRow] });
                return interaction.reply({ content: `✅ تم إرسال لوحة الفحص بنجاح إلى ${targetChannel}`, ephemeral: true });
            }

            if (commandName === 'live') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة فقط!', ephemeral: true });
                }
                const streamLink = interaction.options.getString('link');
                const streamTitle = interaction.options.getString('title') || 'البث المباشر بدأ الان! انضم إلينا';
                const liveEmbed = new EmbedBuilder()
                    .setColor(0xff0055)
                    .setTitle(`🔴 ${streamTitle}`)
                    .setDescription(`**يا شباب، تم فتح البث المباشر الآن!**\n\n🔗 **رابط البث:** [اضغط هنا للدخول](${streamLink})`)
                    .setFooter({ text: 'Apostado Live Notifications', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();
                await interaction.reply({ content: '✅ جاري إرسال إشعار البث...', ephemeral: true });
                await interaction.channel.send({ content: `🚀 **هجوم يا أبطال، البث فتح!**`, embeds: [liveEmbed] });
            }

            if (commandName === 'blacklist') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: '❌ هذا الأمر مخصص لطاقم الإدارة فقط!', ephemeral: true });
                }
                const sub = interaction.options.getSubcommand();
                const guildId = interaction.guild.id;

                if (sub === 'add') {
                    const targetUser = interaction.options.getUser('user');
                    const minutes = interaction.options.getInteger('minutes');
                    const reason = interaction.options.getString('reason') || 'مخالفة القوانين';

                    await setUserBlacklist(targetUser.id, guildId, minutes, reason);

                    const durationText = formatDurationEnglish(minutes);

                    // Send DM to target user matching Image 1
                    const blacklistDmEmbed = new EmbedBuilder()
                        .setColor('#ffffff')
                        .setTitle('⚠️ You Have Been Blacklisted')
                        .setDescription(
                            `**Server:** - ${interaction.guild.name}\n` +
                            `**Duration:** ${durationText}\n` +
                            `**Reason:** ${reason}\n\n` +
                            `You can no longer use the bot in this server.`
                        )
                        .setTimestamp();

                    try {
                        await targetUser.send({ embeds: [blacklistDmEmbed] });
                    } catch (e) {}

                    const blEmbed = new EmbedBuilder()
                        .setColor('#ff0033')
                        .setTitle('⛔ تم إضافة اللاعب إلى البلاك ليست (Blacklist)')
                        .setDescription(`👤 **اللاعب:** ${targetUser} (\`${targetUser.id}\`)\n⏰ **المدة:** \`${durationText}\` (\`${minutes}\` دقيقة)\n📝 **السبب:** \`${reason}\`\n👑 **بواسطة:** ${interaction.user}`)
                        .setFooter({ text: `${interaction.guild.name} • Blacklist System` })
                        .setTimestamp();

                    return interaction.reply({ embeds: [blEmbed] });
                }

                if (sub === 'remove') {
                    const targetUser = interaction.options.getUser('user');
                    await removeUserBlacklist(targetUser.id, guildId);

                    const unblEmbed = new EmbedBuilder()
                        .setColor('#00ff88')
                        .setTitle('✅ تم فك حظر اللاعب من البلاك ليست')
                        .setDescription(`👤 **اللاعب:** ${targetUser} (\`${targetUser.id}\`)\n👑 **تم فك الحظر بواسطة:** ${interaction.user}`)
                        .setFooter({ text: `${interaction.guild.name} • Blacklist System` })
                        .setTimestamp();

                    return interaction.reply({ embeds: [unblEmbed] });
                }

                if (sub === 'list') {
                    const list = await getBlacklistedUsers(guildId);
                    if (!list || list.length === 0) {
                        return interaction.reply({ content: 'ℹ️ **لا يوجد أي لاعبين في قائمة البلاك ليست حالياً.**', ephemeral: true });
                    }

                    const desc = list.map((item, idx) => {
                        return `**#${idx + 1}** <@${item.userId}> (\`${item.userId}\`)\n⏳ **الوقت المتبقي:** \`${formatRemainingTime(item.remainingMs)}\`\n📝 **السبب:** \`${item.reason}\``;
                    }).join('\n\n');

                    const listEmbed = new EmbedBuilder()
                        .setColor('#ff0033')
                        .setTitle('📋 قائمة المحظورين حالياً (Blacklist)')
                        .setDescription(desc)
                        .setFooter({ text: `${interaction.guild.name} • Total Blacklisted: ${list.length}` })
                        .setTimestamp();

                    return interaction.reply({ embeds: [listEmbed] });
                }
            }

            if (commandName === 'unblock') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة فقط!', ephemeral: true });
                }
                const targetUser = interaction.options.getUser('user');
                const guildId = interaction.guild.id;

                await removeUserBlacklist(targetUser.id, guildId);

                for (const m of activeMatches.values()) {
                    if (m.guildId === guildId) {
                        m.team1 = m.team1.filter(id => id !== targetUser.id);
                        m.team2 = m.team2.filter(id => id !== targetUser.id);
                        if (m.hostId === targetUser.id || (m.team1.length === 0 && m.team2.length === 0)) {
                            activeMatches.delete(m.id);
                            removeMatchFromDb(m.id);
                        } else {
                            saveMatchToDb(m);
                        }
                    }
                }

                return interaction.reply({ content: `✅ **تم فك التعليق والحظر عن ${targetUser} بنجاح!** يمكنه الآن إنشاء مباريات جديدة أو الانضمام لأي فريق فوراً.` });
            }

            if (commandName === 'clearmatches') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة فقط!', ephemeral: true });
                }
                await interaction.deferReply();
                const { matchCount, strandedCount } = await clearAllMatches(interaction.guild, interaction.user, interaction.channel);
                return interaction.editReply({ content: `🧹 **تم تنظيف جميع المباريات المعلقة (${matchCount}) وتعطيل (${strandedCount}) رسالة لوبي معلقة وفك التعليق عن جميع لاعبي السيرفر بنجاح!**` });
            }

            if (commandName === 'move') {
                const hasPermission = interaction.member.permissions.has(PermissionFlagsBits.MoveMembers) || 
                                      interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || 
                                      interaction.member.permissions.has(PermissionFlagsBits.Administrator) || 
                                      interaction.member.roles.cache.some(r => {
                                          const name = r.name.toLowerCase();
                                          return name.includes('staff') || name.includes('admin') || name.includes('moderator') || name.includes('mod') || name.includes('apos');
                                      });

                if (!hasPermission) {
                    const noPermEmbed = new EmbedBuilder()
                        .setColor('#ed4245')
                        .setDescription('❌ You do not have permission');
                    return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
                }

                const authorVoiceChannel = interaction.member.voice.channel;
                if (!authorVoiceChannel) {
                    const noVoiceEmbed = new EmbedBuilder()
                        .setColor('#ed4245')
                        .setDescription('❌ You must be in a voice channel to move members.');
                    return interaction.reply({ embeds: [noVoiceEmbed], ephemeral: true });
                }

                const targetMember = interaction.options.getMember('member');
                if (!targetMember) {
                    const notFoundEmbed = new EmbedBuilder()
                        .setColor('#ed4245')
                        .setDescription('❌ Member not found in this server.');
                    return interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
                }

                if (!targetMember.voice.channel) {
                    const notInVoiceEmbed = new EmbedBuilder()
                        .setColor('#ed4245')
                        .setDescription('❌ The target member is not in any voice channel.');
                    return interaction.reply({ embeds: [notInVoiceEmbed], ephemeral: true });
                }

                try {
                    await targetMember.voice.setChannel(authorVoiceChannel);
                    const successEmbed = new EmbedBuilder()
                        .setColor('#57f287')
                        .setTitle('✔ • Member moved')
                        .setDescription(
                            `\n` +
                            `╰┈➤ User: ${targetMember.displayName}\n` +
                            `╰┈➤ Channel: ${authorVoiceChannel.name}`
                        )
                        .setFooter({ text: `© ${new Date().getFullYear()} ${interaction.guild.name}. All Rights Reserved.` });

                    return interaction.reply({ embeds: [successEmbed] });
                } catch (err) {
                    const failEmbed = new EmbedBuilder()
                        .setColor('#ed4245')
                        .setDescription('❌ Failed to move member. Please check bot permissions.');
                    return interaction.reply({ embeds: [failEmbed], ephemeral: true });
                }
            }

            if (['apos', 'guide', 'commands', 'help'].includes(commandName)) {
                const targetChannel = interaction.options.getChannel('channel');
                const embed = generateCommandsEmbed(interaction.guild);

                if (targetChannel) {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                        return interaction.reply({ content: '❌ يجب أن تمتلك صلاحية إدارة السيرفر لإرسال الدليل في قناة أخرى!', ephemeral: true });
                    }
                    await targetChannel.send({ embeds: [embed] });
                    return interaction.reply({ content: `✅ **تم إرسال بطاقة دليل الأوامر بنجاح إلى القناة:** ${targetChannel}`, ephemeral: true });
                }

                return interaction.reply({ embeds: [embed] });
            }

            if (commandName === 'security') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ هذا الأمر مخصص لطاقم إدارة السيرفر فقط!', ephemeral: true });
                }

                const subCmd = interaction.options.getSubcommand();
                const currentSettings = await getProtectionSettings(interaction.guild.id);

                if (subCmd === 'panel') {
                    const embed = generateSecurityPanelEmbed(interaction.guild, currentSettings);
                    const components = generateSecurityPanelComponents(currentSettings);
                    return interaction.reply({ embeds: [embed], components });
                }

                if (subCmd === 'antilink') {
                    const enable = interaction.options.getBoolean('enable');
                    const updated = await updateProtectionSetting(interaction.guild.id, { antiLink: enable ? 1 : 0 });
                    return interaction.reply({
                        content: `✅ **تم ${updated.antiLink ? 'تفعيل 🟢' : 'تعطيل 🔴'} نظام منع الروابط (Anti-Link) بنجاح!**`,
                        ephemeral: true
                    });
                }

                if (subCmd === 'antiimage') {
                    const enable = interaction.options.getBoolean('enable');
                    const updated = await updateProtectionSetting(interaction.guild.id, { antiImage: enable ? 1 : 0 });
                    return interaction.reply({
                        content: `✅ **تم ${updated.antiImage ? 'تفعيل 🟢' : 'تعطيل 🔴'} نظام منع الصور (Anti-Image) بنجاح!**`,
                        ephemeral: true
                    });
                }

                if (subCmd === 'antispam') {
                    const enable = interaction.options.getBoolean('enable');
                    const updated = await updateProtectionSetting(interaction.guild.id, { antiSpam: enable ? 1 : 0 });
                    return interaction.reply({
                        content: `✅ **تم ${updated.antiSpam ? 'تفعيل 🟢' : 'تعطيل 🔴'} نظام منع السبام (Anti-Spam) بنجاح!**`,
                        ephemeral: true
                    });
                }

                if (subCmd === 'logchannel') {
                    const channel = interaction.options.getChannel('channel');
                    if (!channel.isTextBased()) {
                        return interaction.reply({ content: '❌ يرجى اختيار قناة كتابية صالحة (Text Channel).', ephemeral: true });
                    }
                    await updateProtectionSetting(interaction.guild.id, { logChannelId: channel.id });
                    return interaction.reply({
                        content: `✅ **تم تعيين روم سجلات الحماية بنجاح إلى:** ${channel}`,
                        ephemeral: true
                    });
                }
            }
        }

        // --- 2. أزرار الماتش والمودال ولوحة الحماية ---
        if (interaction.isButton()) {
            const { customId } = interaction;

            // التعامل مع أزرار لوحة حماية السيرفر التفاعلية (Security Dashboard Buttons)
            if (customId.startsWith('sec_')) {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ فقط طاقم الإدارة يمكنهم تغيير إعدادات الحماية!', ephemeral: true });
                }

                const currentSettings = await getProtectionSettings(interaction.guild.id);
                let updated = currentSettings;

                if (customId === 'sec_toggle_antilink') {
                    updated = await updateProtectionSetting(interaction.guild.id, { antiLink: currentSettings.antiLink ? 0 : 1 });
                } else if (customId === 'sec_toggle_antiimage') {
                    updated = await updateProtectionSetting(interaction.guild.id, { antiImage: currentSettings.antiImage ? 0 : 1 });
                } else if (customId === 'sec_toggle_antispam') {
                    updated = await updateProtectionSetting(interaction.guild.id, { antiSpam: currentSettings.antiSpam ? 0 : 1 });
                } else if (customId === 'sec_refresh') {
                    updated = await getProtectionSettings(interaction.guild.id);
                }

                const newEmbed = generateSecurityPanelEmbed(interaction.guild, updated);
                const newComponents = generateSecurityPanelComponents(updated);

                return interaction.update({ embeds: [newEmbed], components: newComponents });
            }

            // فتح نموذج إدخال معلومات الروم
            if (customId.startsWith('enter_room_info_')) {
                const match = findMatchFromInteraction(interaction, 'enter_room_info_');

                if (!match) {
                    return interaction.reply({ content: '❌ هذه المباراة لم تعد متوفرة.', ephemeral: true });
                }

                if (interaction.user.id !== match.hostId) {
                    return interaction.reply({ content: '❌ فقط منشئ المباراة (Host) يمكنه إدخال معلومات الروم!', ephemeral: true });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`modal_room_info_${match.id}`)
                    .setTitle('👾 Enter Room Information');

                const roomIdInput = new TextInputBuilder()
                    .setCustomId('room_id')
                    .setLabel('Room ID (Numbers Only) *')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter the game room ID (numbers only)')
                    .setRequired(true);

                const passwordInput = new TextInputBuilder()
                    .setCustomId('room_password')
                    .setLabel('Password (Optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter room password if any')
                    .setRequired(false);

                const keyInput = new TextInputBuilder()
                    .setCustomId('private_key')
                    .setLabel('Private Match Key (Optional)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('If set, players must enter this key to join')
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(roomIdInput),
                    new ActionRowBuilder().addComponents(passwordInput),
                    new ActionRowBuilder().addComponents(keyInput)
                );

                return interaction.showModal(modal);
            }

            // الانضمام للفريق 1 أو الفريق 2
            if (customId.startsWith('join_team1_') || customId.startsWith('join_team2_')) {
                const isTeam1 = customId.startsWith('join_team1_');
                const match = findMatchFromInteraction(interaction, isTeam1 ? 'join_team1_' : 'join_team2_');

                if (!match || match.state !== 'LOBBY') {
                    if (interaction.message && interaction.message.editable) {
                        try {
                            const disabledRows = interaction.message.components.map(row => {
                                const newRow = ActionRowBuilder.from(row);
                                newRow.components.forEach(c => c.setDisabled(true));
                                return newRow;
                            });
                            await interaction.message.edit({ components: disabledRows }).catch(() => {});
                        } catch (e) {}
                    }
                    return interaction.reply({ content: '❌ هذه المباراة لم تعد متاحة للانضمام أو انتهت صلاحيتها.', ephemeral: true });
                }

                // التحقق الدقيق: يجب أن يكون اللاعب داخل إحدى غرف الانتظار (waiting)
                const voiceChannel = interaction.member?.voice?.channel;
                if (!voiceChannel || !voiceChannel.name.toLowerCase().includes('waiting')) {
                    return interaction.reply({ 
                        content: '❌ **يجب أن تكون متواجداً في إحدى غرف الانتظار (waiting 1 / waiting 2 / waiting 3...) أولاً** حتى يتمكن البوت من نقلك تلقائياً عند اكتمال الفرق!', 
                        ephemeral: true 
                    });
                }

                // التحقق من المفتاح الخاص إن وجد
                if (match.privateKey && interaction.user.id !== match.hostId) {
                    const keyModal = new ModalBuilder()
                        .setCustomId(`modal_join_key_${match.id}_${isTeam1 ? '1' : '2'}`)
                        .setTitle('🔑 Private Match Key');

                    const keyInput = new TextInputBuilder()
                        .setCustomId('entered_key')
                        .setLabel('Enter Match Key')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Enter the private key set by host')
                        .setRequired(true);

                    keyModal.addComponents(new ActionRowBuilder().addComponents(keyInput));
                    return interaction.showModal(keyModal);
                }

                return handleTeamJoin(interaction, match, isTeam1 ? 1 : 2);
            }

            // مغادرة الفريق
            if (customId.startsWith('leave_match_')) {
                const match = findMatchFromInteraction(interaction, 'leave_match_');

                if (!match || match.state !== 'LOBBY') {
                    if (interaction.message && interaction.message.editable) {
                        try {
                            const disabledRows = interaction.message.components.map(row => {
                                const newRow = ActionRowBuilder.from(row);
                                newRow.components.forEach(c => c.setDisabled(true));
                                return newRow;
                            });
                            await interaction.message.edit({ components: disabledRows }).catch(() => {});
                        } catch (e) {}
                    }
                    return interaction.reply({ content: '❌ هذه المباراة لم تعد نشطة.', ephemeral: true });
                }

                const uid = interaction.user.id;
                match.team1 = match.team1.filter(id => id !== uid);
                match.team2 = match.team2.filter(id => id !== uid);
                saveMatchToDb(match);

                await updateLobbyMessage(interaction.guild, match);
                return interaction.reply({ content: '✅ لقد غادرت التشكيلة بنجاح.', ephemeral: true });
            }

            // إلغاء المباراة من قبل الهوست
            if (customId.startsWith('cancel_match_')) {
                const lockKey = `${interaction.user.id}_${customId}`;
                if (actionDebounceLocks.has(lockKey)) {
                    return interaction.reply({ content: '⏳ يرجى الانتظار ثانية...', ephemeral: true }).catch(() => {});
                }
                actionDebounceLocks.add(lockKey);
                setTimeout(() => actionDebounceLocks.delete(lockKey), 3000);

                await interaction.deferReply({ ephemeral: true }).catch(() => {});

                const match = findMatchFromInteraction(interaction, 'cancel_match_');

                if (!match) {
                    if (interaction.message && interaction.message.editable) {
                        try {
                            const disabledRows = interaction.message.components.map(row => {
                                const newRow = ActionRowBuilder.from(row);
                                newRow.components.forEach(c => c.setDisabled(true));
                                return newRow;
                            });
                            await interaction.message.edit({ components: disabledRows }).catch(() => {});
                        } catch (e) {}
                    }
                    return interaction.editReply({ content: '❌ هذه المباراة غير موجودة أو تم إلغاؤها بالفعل.' });
                }

                if (match.isCancelling) {
                    return interaction.editReply({ content: '⏳ جاري إلغاء المباراة بالفعل...' });
                }

                const isHost = interaction.user.id === match.hostId;
                const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

                if (!isHost && !isAdmin) {
                    return interaction.editReply({ content: '❌ فقط منشئ المباراة أو الإدارة يمكنهم إلغاء المباراة!' });
                }

                match.isCancelling = true;
                if (match.lobbyTimeout) clearTimeout(match.lobbyTimeout);
                activeMatches.delete(match.id);
                removeMatchFromDb(match.id);

                const cancelEmbed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('✖ Match Cancelled')
                    .setDescription(`**${match.mode}** match created by <@${match.hostId}> was cancelled by the host.\n\nUse \`!play ${match.mode.toLowerCase()}\` to start a new match.`)
                    .setFooter({ text: new Date().toLocaleString() });

                if (interaction.message) {
                    await interaction.message.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
                }
                return interaction.editReply({ content: '✅ تم إلغاء المباراة بنجاح.' });
            }

            // نسخ معلومات الروم
            if (customId.startsWith('copy_room_info_')) {
                const match = findMatchFromInteraction(interaction, 'copy_room_info_');
                if (!match) {
                    return interaction.reply({ content: '❌ معلومات الروم غير متوفرة حالياً (المباراة غير نشطة).', ephemeral: true });
                }
                const passText = match.password ? match.password : 'No Password';
                return interaction.reply({ 
                    content: `📋 **معلومات الروم:**\n**Room ID:** \`${match.roomId}\`\n**Password:** \`${passText}\``, 
                    ephemeral: true 
                });
            }

            // حذف الروم القديم غير النشط
            if (customId === 'delete_orphan_channel') {
                const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
                if (!isAdmin) {
                    return interaction.reply({ content: '❌ فقط المشرف أو الإدارة يمكنهم حذف الروم!', ephemeral: true });
                }
                await interaction.reply({ content: '🔒 **جاري إغلاق وحذف هذا الروم المؤقت...**' });
                setTimeout(async () => {
                    try { await interaction.channel.delete('Old match channel deleted.'); } catch (e) {}
                }, 2000);
                return;
            }

            // أزرار التذاكر وفحص اللاعبين
            if (customId === 'create_ticket_help' || customId === 'create_ticket_abuse') {
                await interaction.deferReply({ ephemeral: true });
                const ticketType = customId === 'create_ticket_help' ? 'Help' : 'Server Abuse';
                const channelName = `ticket-${interaction.user.username.toLowerCase()}`;
                const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName);
                if (existingChannel) {
                    return interaction.editReply({ content: `❌ لديك تذكرة مفتوحة بالفعل هنا: ${existingChannel}` });
                }
                const ticketChannel = await interaction.guild.channels.create({
                    name: channelName,
                    type: 0,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: ['ViewChannel'] },
                        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                        { id: client.user.id, allow: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ReadMessageHistory'] }
                    ],
                });
                const welcomeEmbed = new EmbedBuilder()
                    .setColor(ticketType === 'Help' ? '#0099ff' : '#ff0000')
                    .setTitle(`📁 ${ticketType} Ticket`)
                    .setDescription(`مرحباً بك ${interaction.user}، سيقوم أحد أعضاء فريق الإدارة بمساعدتك قريباً.`);
                const ticketControlRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
                );
                await ticketChannel.send({ content: `${interaction.user} أهلاً بك!`, embeds: [welcomeEmbed], components: [ticketControlRow] });
                return interaction.editReply({ content: `✅ تم إنشاء تذكرتك بنجاح في القناة: ${ticketChannel}` });
            }

            if (customId === 'close_ticket') {
                if (!interaction.member.permissions.has('ManageChannels')) {
                    return interaction.reply({ content: '❌ فقط الإدارة يمكنها إغلاق التذكرة!', ephemeral: true });
                }
                await interaction.reply({ content: '🔒 جاري إغلاق وحذف التذكرة...' });
                setTimeout(async () => {
                    try { await interaction.channel.delete(); } catch (e) {}
                }, 4000);
            }

            if (customId === 'open_checker_interactive') {
                const deviceRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('check_select_device_pc').setLabel('PC').setStyle(ButtonStyle.Secondary).setEmoji('💻'),
                    new ButtonBuilder().setCustomId('check_select_device_phone').setLabel('Phone').setStyle(ButtonStyle.Secondary).setEmoji('📱')
                );
                return interaction.reply({
                    content: '**Choose the device / platform the suspect is playing on:**',
                    components: [deviceRow],
                    ephemeral: true
                });
            }

            if (customId === 'check_select_device_pc' || customId === 'check_select_device_phone') {
                const device = customId === 'check_select_device_pc' ? 'PC' : 'Phone';
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`submit_check_target_${device}`)
                    .setPlaceholder('Type username or pick a member below (no @)...')
                    .setMinValues(1)
                    .setMaxValues(1);
                const selectRow = new ActionRowBuilder().addComponents(userSelect);
                const manualButtonRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`check_enter_modal_${device}`)
                        .setLabel('Or enter ID / @tag manually')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✏️')
                );
                return interaction.update({
                    content: '**Select the player to check**\nType username (without @) or pick a member from the list. They must be in this server.',
                    embeds: [],
                    components: [selectRow, manualButtonRow]
                });
            }

            if (customId === 'check_enter_modal_pc' || customId === 'check_enter_modal_phone') {
                const device = customId === 'check_enter_modal_pc' ? 'PC' : 'Phone';
                const modal = new ModalBuilder()
                    .setCustomId(`modal_check_manual_${device}`)
                    .setTitle(`Check Player (${device})`);
                const userInput = new TextInputBuilder()
                    .setCustomId('user_input')
                    .setLabel('Username, @tag, or User ID')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('e.g. Taraji 1919, @Taraji 1919, or ID')
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(userInput));
                return interaction.showModal(modal);
            }

            if (customId === 'view_my_reports') {
                const reports = await getUserReports(interaction.user.id, interaction.guild.id);
                if (!reports || reports.length === 0) {
                    return interaction.reply({ content: `📋 **سجل تقاريرك:** ليس لديك أي بلاغات سابقة حتى الآن.`, ephemeral: true });
                }

                const desc = reports.map((r, i) => {
                    let statusLabel = '⏳ Pending';
                    if (r.status === 'cheater') statusLabel = '🔴 Cheater (+20 pts)';
                    else if (r.status === 'clean') statusLabel = '🟢 Clean (-30 pts)';
                    else if (r.status === 'cancelled') statusLabel = '❌ Cancelled (Refunded)';
                    
                    const dev = r.device === 'PC' ? '💻 PC' : '📱 Phone';
                    const time = `<t:${Math.floor(r.createdAt / 1000)}:R>`;
                    return `**#${i + 1}** • ID: \`${r.id}\` | Target: <@${r.targetId}>\n> **Device:** ${dev} | **Status:** ${statusLabel}\n> **Date:** ${time}`;
                }).join('\n\n');

                const historyEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('📋 Check Reports History')
                    .setDescription(desc)
                    .setFooter({ text: `${interaction.guild.name} • Anti-Cheat Division` })
                    .setTimestamp();

                return interaction.reply({ embeds: [historyEmbed], ephemeral: true });
            }

            if (customId.startsWith('check_clean') || customId.startsWith('check_cheater') || customId.startsWith('check_cancel')) {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.reply({ content: '❌ هذه الأزرار مخصصة لطاقم الإدارة فقط!', ephemeral: true });
                }

                const parts = customId.split('_');
                const action = parts[1]; // 'clean', 'cheater', 'cancel'
                const reportId = parts[2];

                if (!reportId) {
                    return interaction.update({ content: `✅ **تم تحديث حالة البلاغ بواسطة ${interaction.user}.**`, components: [] });
                }

                const report = await getReport(reportId);
                if (!report) {
                    return interaction.reply({ content: '❌ لم يتم العثور على هذا البلاغ في قاعدة البيانات.', ephemeral: true });
                }

                if (report.status !== 'pending') {
                    return interaction.reply({ content: `⚠️ هذا البلاغ تمت معالجته بالفعل وحالته الحالية: **${report.status.toUpperCase()}**`, ephemeral: true });
                }

                const guildId = interaction.guild.id;
                const reporterId = report.reporterId;
                const targetId = report.targetId;

                if (action === 'cheater') {
                    await updateReportStatus(reportId, 'cheater', interaction.user.id);
                    const reporterStats = await getUserStats(reporterId, guildId);
                    const newStreak = (reporterStats.streak || 0) + 1;
                    db.run(`UPDATE users SET points = points + 70, streak = ? WHERE userId = ? AND guildId = ?`, [newStreak, reporterId, guildId]);

                    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                        .setColor('#ff0033')
                        .setTitle('🚨 Player Check Request - CHEATER CONFIRMED 🔴')
                        .addFields(
                            { name: '⚖️ Staff Verdict', value: `🔴 **Cheater (Confirmed)** by ${interaction.user}`, inline: false },
                            { name: '💰 Points Reward', value: `Reporter awarded **+20 points** (+50 cost refunded = +70 pts total)`, inline: false }
                        );

                    await interaction.update({ embeds: [updatedEmbed], components: [] });

                    try {
                        const reporterUser = await client.users.fetch(reporterId);
                        if (reporterUser) {
                            const cheaterDmEmbed = new EmbedBuilder()
                                .setColor('#ff3333')
                                .setTitle('🚨 Cheater Confirmed!')
                                .setDescription(
                                    `Your check report in **- ${interaction.guild.name}** has been reviewed.\n\n` +
                                    `**Target:** <@${targetId}>\n` +
                                    `**Result:** CHEATER FOUND ✅\n` +
                                    `**Cost Recovered:** +50 points\n` +
                                    `**Reward:** +20 points\n` +
                                    `**Streak:** ${newStreak}/5 consecutive cheaters\n` +
                                    `**Marked by:** ${interaction.user}\n\n` +
                                    `Thank you for keeping the community clean!`
                                );
                            await reporterUser.send({ embeds: [cheaterDmEmbed] });
                        }
                    } catch (e) {}
                    return;
                } else if (action === 'clean') {
                    await updateReportStatus(reportId, 'clean', interaction.user.id);
                    db.run(`UPDATE users SET points = points + 20, streak = 0 WHERE userId = ? AND guildId = ?`, [reporterId, guildId]);

                    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                        .setColor('#00ff88')
                        .setTitle('🛡️ Player Check Request - CLEAN PLAYER 🟢')
                        .addFields(
                            { name: '⚖️ Staff Verdict', value: `🟢 **Clean Player** verified by ${interaction.user}`, inline: false },
                            { name: '💰 Points Cost', value: `Reporter lost **30 points** (20 pts refunded from the 50 paid)`, inline: false }
                        );

                    await interaction.update({ embeds: [updatedEmbed], components: [] });

                    try {
                        const reporterUser = await client.users.fetch(reporterId);
                        if (reporterUser) {
                            const cleanDmEmbed = new EmbedBuilder()
                                .setColor('#00ff88')
                                .setTitle('🛡️ Clean Confirmed!')
                                .setDescription(
                                    `Your check report in **- ${interaction.guild.name}** has been reviewed.\n\n` +
                                    `**Target:** <@${targetId}>\n` +
                                    `**Result:** PLAYER IS CLEAN 🟢\n` +
                                    `**Cost Lost:** -30 points\n` +
                                    `**Refunded:** +20 points\n` +
                                    `**Marked by:** ${interaction.user}\n\n` +
                                    `Thank you for helping keep the community clean!`
                                );
                            await reporterUser.send({ embeds: [cleanDmEmbed] });
                        }
                    } catch (e) {}
                    return;
                } else if (action === 'cancel') {
                    await updateReportStatus(reportId, 'cancelled', interaction.user.id);
                    db.run(`UPDATE users SET points = points + 50 WHERE userId = ? AND guildId = ?`, [reporterId, guildId]);

                    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                        .setColor('#888888')
                        .setTitle('⚠️ Player Check Request - CANCELLED ❌')
                        .addFields(
                            { name: '⚖️ Staff Verdict', value: `❌ **Cancelled** by ${interaction.user}`, inline: false },
                            { name: '💰 Refund', value: `Full **50 points** refunded to reporter`, inline: false }
                        );

                    await interaction.update({ embeds: [updatedEmbed], components: [] });

                    try {
                        const reporterUser = await client.users.fetch(reporterId);
                        if (reporterUser) {
                            const cancelDmEmbed = new EmbedBuilder()
                                .setColor('#888888')
                                .setTitle('⚠️ Check Report Cancelled')
                                .setDescription(
                                    `Your check report in **- ${interaction.guild.name}** has been reviewed.\n\n` +
                                    `**Target:** <@${targetId}>\n` +
                                    `**Result:** CANCELLED ❌\n` +
                                    `**Refunded:** +50 points (Full Refund)\n` +
                                    `**Marked by:** ${interaction.user}`
                                );
                            await reporterUser.send({ embeds: [cancelDmEmbed] });
                        }
                    } catch (e) {}
                    return;
                }
            }
        }

        // --- 3. استقبال نماذج المودال (Modals) ---
        if (interaction.isModalSubmit()) {
            const { customId } = interaction;

            if (customId.startsWith('modal_check_manual_')) {
                const device = customId.replace('modal_check_manual_', '');
                const input = interaction.fields.getTextInputValue('user_input').trim();
                
                let targetId = null;
                const mentionMatch = input.match(/^<@!?(\d+)>$/);
                if (mentionMatch) {
                    targetId = mentionMatch[1];
                } else if (/^\d{17,20}$/.test(input)) {
                    targetId = input;
                } else {
                    const cleanName = input.replace(/^@/, '').trim().toLowerCase();
                    let found = interaction.guild.members.cache.find(m => 
                        m.user.username.toLowerCase() === cleanName ||
                        m.displayName.toLowerCase() === cleanName ||
                        m.user.tag.toLowerCase() === cleanName
                    );
                    
                    if (!found) {
                        try {
                            const searched = await interaction.guild.members.search({ query: cleanName, limit: 1 });
                            if (searched && searched.size > 0) {
                                found = searched.first();
                            }
                        } catch (e) {}
                    }
                    if (found) targetId = found.id;
                }

                if (!targetId) {
                    return interaction.reply({ content: `❌ لم يتم العثور على اللاعب \`${input}\` في هذا السيرفر! تأكد من كتابة الاسم أو الـ ID بشكل صحيح.`, ephemeral: true });
                }

                return processCheckSubmission(interaction, targetId, device);
            }

            // استلام معلومات الروم من الهوست
            if (customId.startsWith('modal_room_info_')) {
                const match = findMatchFromInteraction(interaction, 'modal_room_info_');

                if (!match) {
                    return interaction.reply({ content: '❌ هذه المباراة غير موجودة.', ephemeral: true });
                }

                const roomId = interaction.fields.getTextInputValue('room_id').trim();
                const password = interaction.fields.getTextInputValue('room_password')?.trim() || '';
                const privateKey = interaction.fields.getTextInputValue('private_key')?.trim() || '';

                if (!/^\d+$/.test(roomId)) {
                    return interaction.reply({ content: '❌ يجب أن يتكون Room ID من أرقام فقط!', ephemeral: true });
                }

                if (match.infoTimeout) clearTimeout(match.infoTimeout);

                // حذف رسالة الإنشاء الأولية فوراً
                if (match.promptMessageId) {
                    const promptMsg = await interaction.channel.messages.fetch(match.promptMessageId).catch(() => null);
                    if (promptMsg) {
                        await promptMsg.delete().catch(() => {});
                    }
                }

                match.roomId = roomId;
                match.password = password;
                match.privateKey = privateKey;
                match.state = 'LOBBY';

                // إضافة الهوست تلقائياً لتيم 1
                match.team1.push(match.hostId);

                // إرسال اللوبي في الشات مع منشن للرتبة إن وجدت
                const seasonRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('season') || r.name.toLowerCase().includes('apostado'));
                const roleMention = seasonRole ? `<@&${seasonRole.id}>` : '@here';

                const lobbyEmbed = buildLobbyEmbed(match, interaction.guild);
                const lobbyButtons = buildLobbyButtons(match);

                await interaction.deferUpdate();

                const lobbyMsg = await interaction.channel.send({
                    content: `${roleMention}`,
                    embeds: [lobbyEmbed],
                    components: [lobbyButtons]
                });

                match.lobbyMessageId = lobbyMsg.id;
                saveMatchToDb(match);

                // مؤقت 5 دقائق لملء الفرق (5 Minutes Timeout)
                const matchId = match.id;
                match.lobbyTimeout = setTimeout(async () => {
                    const currentMatch = activeMatches.get(matchId);
                    if (currentMatch && currentMatch.state === 'LOBBY') {
                        activeMatches.delete(matchId);
                        removeMatchFromDb(matchId);

                        const timeoutEmbed = new EmbedBuilder()
                            .setColor(0xED4245)
                            .setTitle('❌ Match Cancelled - Timeout')
                            .setDescription(`**${match.mode}** match created by <@${match.hostId}> was automatically cancelled.\n\n⏰ **Reason:** Teams did not fill up within 5 minutes.\n\nUse \`!play ${match.mode.toLowerCase()}\` to start a new match.`)
                            .setFooter({ text: new Date().toLocaleString() });

                        const expiredRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('expired_btn').setLabel('Match Expired').setStyle(ButtonStyle.Secondary).setDisabled(true)
                        );

                        try {
                            const ch = await interaction.guild.channels.fetch(match.channelId).catch(() => null);
                            if (ch && match.lobbyMessageId) {
                                const msg = await ch.messages.fetch(match.lobbyMessageId).catch(() => null);
                                if (msg) {
                                    await msg.edit({ embeds: [timeoutEmbed], components: [expiredRow] }).catch(() => {});
                                }
                            }
                        } catch (e) {}
                    }
                }, 300000);
            }

            // التحقق من البرايفت كي عند الانضمام
            if (customId.startsWith('modal_join_key_')) {
                const match = findMatchFromInteraction(interaction, 'modal_join_key_');
                const teamNum = customId.endsWith('_2') ? 2 : 1;

                if (!match || match.state !== 'LOBBY') {
                    return interaction.reply({ content: '❌ الماتش لم يعد متاحاً.', ephemeral: true });
                }

                const enteredKey = interaction.fields.getTextInputValue('entered_key').trim();
                if (enteredKey !== match.privateKey) {
                    return interaction.reply({ content: '❌ مفتاح الدخول غير صحيح!', ephemeral: true });
                }

                return handleTeamJoin(interaction, match, teamNum);
            }
        }

        // --- 4. القوائم المنسدلة والتصويت بالأغلبية ---
        if (interaction.isStringSelectMenu()) {
            const { customId, values } = interaction;

            // قائمة الإجراءات داخل روم الماتش
            if (customId.startsWith('match_action_select_')) {
                await interaction.deferReply({ ephemeral: true });

                const match = findMatchFromInteraction(interaction, 'match_action_select_');
                const selectedAction = values[0];

                if (!match) {
                    const isMatchChannel = interaction.channel?.name?.toLowerCase().includes('match') || interaction.channel?.isThread?.();
                    const rows = [];
                    if (isMatchChannel) {
                        rows.push(new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('delete_orphan_channel').setLabel('حذف هذه القناة القديمة').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
                        ));
                    }
                    return interaction.editReply({ 
                        content: '❌ **هذه المباراة غير نشطة** (تم إنشاؤها في جلسة سابقة أو انتهت).\nيمكنك كتابة `!play 1v1` أو `!play 2v2` في شات اللعب لبدء مباراة جديدة وممتعة!', 
                        components: rows
                    });
                }

                const allPlayers = [...match.team1, ...match.team2];
                const isParticipant = allPlayers.includes(interaction.user.id);
                const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

                // 1. تصويت MVP Winners (المرحلة الأولى من التصويت المتسلسل)
                if (selectedAction === 'mvp_winners') {
                    if (!isParticipant && !isAdmin) {
                        return interaction.editReply({ content: '❌ فقط المشاركون في المباراة أو الإدارة يمكنهم التصويت!' });
                    }

                    // التحقق مما إذا كان قد تم تحديد MVP الفائز بالفعل
                    if (match.winnerVotingConcluded || match.winningMvpUid) {
                        return interaction.editReply({ 
                            content: `ℹ️ **تم الانتهاء من اختيار MVP الفائز بالفعل!** (<@${match.winningMvpUid}>)\n👉 يرجى اختيار **MVP Losers** من القائمة لتحديد خاسر المباراة.` 
                        });
                    }

                    // التحقق مما إذا كان هناك تصويت نشط بالفعل في الأعلى
                    if (match.winnerVotingActive) {
                        return interaction.editReply({ 
                            content: '⚠️ **تصويت الـ MVP للفريق الفائز نشط بالفعل في الأعلى!**\nيرجى التمرير للأعلى والتصويت من القائمة المعروضة سابقاً لتجنب التكرار.' 
                        });
                    }

                    match.winnerVotingActive = true;
                    if (!match.winnerVotes) match.winnerVotes = new Map();
                    if (!match.loserVotes) match.loserVotes = new Map();
                    match.winnerVotingConcluded = false;
                    match.votingCompleted = false;

                    const winnerSelect = buildWinnerSelectMenu(match, interaction.guild);

                    const voteMsg = await interaction.channel.send({
                        content: `**Mvp winner vote :**\n${allPlayers.map(uid => `<@${uid}>`).join(' ')}`,
                        components: [new ActionRowBuilder().addComponents(winnerSelect)]
                    });

                    match.winnerVoteMessageId = voteMsg.id;
                    saveMatchToDb(match);

                    return interaction.editReply({ content: '✅ تم فتح تصويت الـ MVP للفريق الفائز بنجاح! يرجى الاختيار من القائمة أعلاه.' });
                }

                // 2. تصويت MVP Losers
                if (selectedAction === 'mvp_losers') {
                    if (!isParticipant && !isAdmin) {
                        return interaction.editReply({ content: '❌ فقط المشاركون في المباراة أو الإدارة يمكنهم التصويت!' });
                    }

                    if (!match.winningTeam) {
                        return interaction.editReply({ content: '⚠️ يجب التصويت على الفريق الفائز أولاً (MVP Winners) لتحديد الفريق الخاسر!' });
                    }

                    // التحقق مما إذا كان قد تم تحديد MVP الخاسر واكتملت المباراة
                    if (match.votingCompleted || match.losingMvpUid) {
                        return interaction.editReply({ 
                            content: `ℹ️ **تم الانتهاء من اختيار MVP الخاسر واكتملت نتائج المباراة بالفعل!** (<@${match.losingMvpUid}>)` 
                        });
                    }

                    // التحقق مما إذا كان تصويت الخاسر نشطاً بالفعل في الأعلى
                    if (match.loserVotingActive) {
                        return interaction.editReply({ 
                            content: '⚠️ **تصويت الـ MVP للفريق الخاسر نشط بالفعل في الأعلى!**\nيرجى التمرير للأعلى والتصويت من القائمة المعروضة سابقاً لتجنب التكرار.' 
                        });
                    }

                    match.loserVotingActive = true;
                    if (!match.loserVotes) match.loserVotes = new Map();
                    match.votingCompleted = false;

                    const loserSelect = buildLoserSelectMenu(match, interaction.guild);
                    const voteMsg = await interaction.channel.send({
                        content: `**Mvp loser vote :**\n${allPlayers.map(uid => `<@${uid}>`).join(' ')}`,
                        components: [new ActionRowBuilder().addComponents(loserSelect)]
                    });

                    match.loserVoteMessageId = voteMsg.id;
                    saveMatchToDb(match);

                    return interaction.editReply({ content: '✅ تم فتح تصويت الـ MVP للفريق الخاسر بنجاح! يرجى الاختيار من القائمة أعلاه.' });
                }

                // 3. طلب مساعدة الإدارة Call Staff
                if (selectedAction === 'call_staff') {
                    const staffRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('admin'));
                    const staffMention = staffRole ? `<@&${staffRole.id}>` : '@here';
                    await interaction.channel.send({ content: `🚨 **طلب تدخل إداري:** اللاعب ${interaction.user} استدعى طاقم الإدارة! ${staffMention}` });
                    return interaction.editReply({ content: '📞 تم إرسال نداء فوري لطاقم الإدارة.' });
                }

                // 4. إعادة تعيين التصويت Reset MVP Vote
                if (selectedAction === 'reset_mvp') {
                    if (!isAdmin && interaction.user.id !== match.hostId) {
                        return interaction.editReply({ content: '❌ فقط الإدارة أو منشئ المباراة يمكنهم إعادة ضبط التصويت!' });
                    }
                    if (match.winnerVotes) match.winnerVotes.clear();
                    if (match.loserVotes) match.loserVotes.clear();
                    match.winnerVotingActive = false;
                    match.loserVotingActive = false;
                    match.winnerVoteMessageId = null;
                    match.loserVoteMessageId = null;
                    match.winnerVotingConcluded = false;
                    match.votingCompleted = false;
                    match.winningMvpUid = null;
                    match.losingMvpUid = null;
                    match.winningTeam = null;
                    saveMatchToDb(match);
                    await interaction.channel.send({ content: `🔄 **تمت إعادة تعيين جميع أصوات المباراة بواسطة ${interaction.user}.**` });
                    return interaction.editReply({ content: '🔄 تم إعادة تعيين أصوات MVP بنجاح.' });
                }

                // 5. إلغاء المباراة من الإدارة Staff Cancel
                if (selectedAction === 'staff_cancel') {
                    if (!isAdmin) {
                        return interaction.editReply({ content: '❌ هذا الإجراء مخصص لطاقم الإدارة فقط!' });
                    }
                    activeMatches.delete(match.id);
                    removeMatchFromDb(match.id);
                    await interaction.channel.send({ content: `🛑 **تم إلغاء المباراة رسمياً وإغلاق الروم بواسطة الإدارة:** ${interaction.user}\n🔒 سيتم إعادة اللاعبين وحذف الغرفة المؤقتة خلال 5 ثوانٍ...` });
                    await returnPlayersToWaiting(interaction.guild, match);
                    await cleanupMatchVoicePermissions(interaction.guild, match);
                    setTimeout(async () => {
                        try { await interaction.channel.delete(); } catch (e) {}
                    }, 5000);
                    return interaction.editReply({ content: '✅ تم إلغاء المباراة وإغلاق الروم.' });
                }

                // 6. الإبلاغ عن خطأ Report Bug
                if (selectedAction === 'report_bug') {
                    return interaction.editReply({ content: '🚨 **للإبلاغ عن خطأ أو مشكلة تقنية:** يرجى فتح تذكرة عبر قسم الدعم الفني أو التواصل مع طاقم الإدارة مباشرة.' });
                }

                // 7. إلغاء المباراة Cancel Match
                if (selectedAction === 'cancel_match_request') {
                    if (!isParticipant && !isAdmin) {
                        return interaction.editReply({ content: '❌ فقط اللاعبون المشاركون في هذه المباراة أو الإدارة يمكنهم طلب الإلغاء!' });
                    }

                    // إذا كان من طلب الإلغاء إدارياً، يتم الإلغاء فوراً
                    if (isAdmin) {
                        activeMatches.delete(match.id);
                        removeMatchFromDb(match.id);
                        await interaction.channel.send({ content: `🛑 **تم إلغاء المباراة رسمياً بواسطة الإدارة:** ${interaction.user}\n🔒 سيتم إعادة الجميع وحذف الروم خلال 5 ثوانٍ...` });
                        await returnPlayersToWaiting(interaction.guild, match);
                        await cleanupMatchVoicePermissions(interaction.guild, match);
                        setTimeout(async () => {
                            try { await interaction.channel.delete(); } catch (e) {}
                        }, 5000);
                        return interaction.editReply({ content: '✅ تم إلغاء المباراة بواسطة الإدارة.' });
                    }

                    if (!match.cancelVotes) {
                        match.cancelVotes = new Set();
                    }

                    const allPlayers = [...match.team1, ...match.team2];
                    const requiredVotes = Math.max(2, Math.ceil(allPlayers.length / 2));

                    // إذا كان هناك تصويت إلغاء نشط بالفعل
                    if (match.cancelVoteActive && match.cancelMessageId) {
                        if (match.cancelVotes.has(interaction.user.id)) {
                            return interaction.editReply({ 
                                content: `⚠️ **هناك تصويت نشط بالفعل لإلغاء المباراة بالأعلى!**\nوأنت قمت بالتصويت مسبقاً (${match.cancelVotes.size}/${requiredVotes}). في انتظار انضمام بقية اللاعبين.` 
                            });
                        }

                        // تسجيل صوت اللاعب في التصويت النشط فوراً دون إنشاء لوحة جديدة
                        match.cancelVotes.add(interaction.user.id);
                        saveMatchToDb(match);

                        if (match.cancelVotes.size >= requiredVotes) {
                            activeMatches.delete(match.id);
                            removeMatchFromDb(match.id);

                            const cancelEmbed = new EmbedBuilder()
                                .setColor('#ed4245')
                                .setTitle('🛑 تم إلغاء المباراة بالموافقة!')
                                .setDescription(`تمت الموافقة على إلغاء المباراة رسمياً بناءً على اكتمال تصويت اللاعبين (${match.cancelVotes.size}/${requiredVotes}).\n🔒 سيتم إعادة الجميع وحذف الروم خلال 5 ثوانٍ...`)
                                .setTimestamp();

                            await interaction.channel.send({ embeds: [cancelEmbed] }).catch(() => {});
                            await returnPlayersToWaiting(interaction.guild, match);
                            await cleanupMatchVoicePermissions(interaction.guild, match);
                            setTimeout(async () => {
                                try { await interaction.channel.delete(); } catch (e) {}
                            }, 5000);
                            return interaction.editReply({ content: '🛑 تم إلغاء المباراة باكتمال أصوات اللاعبين.' });
                        }

                        // تحديث لوحة التصويت القائمة بالأعلى
                        try {
                            const cancelMsg = await interaction.channel.messages.fetch(match.cancelMessageId).catch(() => null);
                            if (cancelMsg) {
                                const payload = buildCancelVotePayload(match, interaction.guild);
                                await cancelMsg.edit(payload);
                            }
                        } catch (e) {}

                        return interaction.editReply({ 
                            content: `✅ تم تسجيل صوتك لإلغاء المباراة ضمن التصويت النشط بالأعلى! (الأصوات: ${match.cancelVotes.size}/${requiredVotes}).` 
                        });
                    }

                    // بدء تصويت إلغاء جديد للمباراة
                    match.cancelVoteActive = true;
                    match.cancelVotes.add(interaction.user.id);
                    match.cancelInitiatorId = interaction.user.id;
                    saveMatchToDb(match);

                    const payload = buildCancelVotePayload(match, interaction.guild);
                    const cancelMsg = await interaction.channel.send(payload);
                    match.cancelMessageId = cancelMsg.id;
                    saveMatchToDb(match);

                    return interaction.editReply({ 
                        content: `✅ تم بدء تصويت إلغاء المباراة وإرسال اللوحة في الشات! (الأصوات الحالية: 1/${requiredVotes}). يجب أن ينضم بقية اللاعبين للتصويت للموافقة.` 
                    });
                }
            }

            // استقبال صوت الفائز والـ MVP (المرحلة 1)
            if (customId.startsWith('vote_winner_mvp_select_')) {
                const lockKey = `${interaction.user.id}_${customId}`;
                if (actionDebounceLocks.has(lockKey)) {
                    return interaction.reply({ content: '⏳ يرجى الانتظار ثانية قبل المحاولة مجدداً...', ephemeral: true }).catch(() => {});
                }
                actionDebounceLocks.add(lockKey);
                setTimeout(() => actionDebounceLocks.delete(lockKey), 2000);

                await interaction.deferReply({ ephemeral: true }).catch(() => {});

                const match = findMatchFromInteraction(interaction, 'vote_winner_mvp_select_');
                if (!match) return interaction.editReply({ content: '❌ المباراة غير نشطة.' });

                const voterId = interaction.user.id;
                const allPlayers = [...match.team1, ...match.team2];
                const isParticipant = allPlayers.includes(voterId);
                const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

                if (!isParticipant && !isAdmin) {
                    return interaction.editReply({ content: '❌ فقط المشاركون في المباراة يمكنهم التصويت!' });
                }

                if (match.winnerVotingConcluded || match.winningMvpUid) {
                    return interaction.editReply({ content: `ℹ️ تم الانتهاء من تصويت الفائز بالفعل! الفائز: <@${match.winningMvpUid}>` });
                }

                if (match.winnerVotes.has(voterId)) {
                    return interaction.editReply({ content: '❌ You have already voted for MVP winner! Waiting for other voters.' });
                }

                const candidateId = values[0].replace('win_cand_', '');
                const isT1 = match.team1.includes(candidateId);
                match.winnerVotes.set(voterId, { candidateId, team: isT1 ? 1 : 2 });
                saveMatchToDb(match);

                await interaction.editReply({ content: '✅ You have voted for MVP winner!' });

                // تحديث قائمة التصويت في نفس الرسالة
                try {
                    const updatedSelect = buildWinnerSelectMenu(match, interaction.guild);
                    await interaction.message.edit({
                        components: [new ActionRowBuilder().addComponents(updatedSelect)]
                    });
                } catch (e) {}

                // التحقق من تصويت كلا الفريقين (يجب أن يصوت لاعب من Team 1 ولاعب من Team 2 على الأقل)
                const t1WinnerVoters = allPlayers.filter(uid => match.team1.includes(uid) && match.winnerVotes.has(uid));
                const t2WinnerVoters = allPlayers.filter(uid => match.team2.includes(uid) && match.winnerVotes.has(uid));
                const hasBothTeamsVoted = t1WinnerVoters.length >= 1 && t2WinnerVoters.length >= 1;
                const totalVoted = match.winnerVotes.size;

                // إذا لم يصوت كلا الفريقين بعد، ننتظر تصويت الفريق الآخر
                if (!hasBothTeamsVoted && totalVoted < allPlayers.length) {
                    return;
                }

                // تحديد اللاعب الأكثر أصواتاً وفحص التعادل بين الفريقين
                const candidateCounts = {};
                for (const v of match.winnerVotes.values()) {
                    candidateCounts[v.candidateId] = (candidateCounts[v.candidateId] || 0) + 1;
                }
                let topCandidate = candidateId;
                let maxVotes = 0;
                let isTie = false;
                for (const [cId, count] of Object.entries(candidateCounts)) {
                    if (count > maxVotes) {
                        maxVotes = count;
                        topCandidate = cId;
                        isTie = false;
                    } else if (count === maxVotes) {
                        isTie = true;
                    }
                }

                // إذا كان هناك تعادل أو اختلاف بين الفريقين (Vote Mismatch) ولم يصوت جميع اللاعبين بعد
                if (isTie && totalVoted < allPlayers.length) {
                    await interaction.channel.send({
                        content: `⚠️ **Vote Mismatch!** The voters selected different players for MVP Winners. Remaining players in both teams please vote to decide the winner!`
                    });
                    return;
                }

                if (match.winnerVotingConcluded) return;
                match.winnerVotingConcluded = true;
                match.winnerVotingActive = false;

                match.winningMvpUid = topCandidate;
                match.winningTeam = match.team1.includes(topCandidate) ? 1 : 2;
                saveMatchToDb(match);

                const votersMentions = Array.from(match.winnerVotes.keys()).map(id => `<@${id}>`).join(', ');

                const winnerSelectedEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('👾 MVP Winners Selected!')
                    .setDescription(
                        `Winner: <@${match.winningMvpUid}>\n\n` +
                        `+80 MVP point(s) will be awarded after both MVPs are selected.\n\n` +
                        `📊 Total Votes: ${totalVoted}/${match.teamSize * 2}\n` +
                        `✅ Voters: ${votersMentions}`
                    );

                await interaction.channel.send({ embeds: [winnerSelectedEmbed] });
                await interaction.channel.send({
                    content: `👾 **MVP Winners Selected!**\n\n<@${match.winningMvpUid}> has been voted as MVP Winners.\n👉 Please choose **MVP Losers** from the Select Action menu above to start the losing team vote.`
                });
                saveMatchToDb(match);
                return;
            }

            // استقبال صوت MVP الخاسر (المرحلة 2)
            if (customId.startsWith('vote_loser_mvp_select_')) {
                const lockKey = `${interaction.user.id}_${customId}`;
                if (actionDebounceLocks.has(lockKey)) {
                    return interaction.reply({ content: '⏳ يرجى الانتظار ثانية قبل المحاولة مجدداً...', ephemeral: true }).catch(() => {});
                }
                actionDebounceLocks.add(lockKey);
                setTimeout(() => actionDebounceLocks.delete(lockKey), 2000);

                await interaction.deferReply({ ephemeral: true }).catch(() => {});

                const match = findMatchFromInteraction(interaction, 'vote_loser_mvp_select_');
                if (!match) return interaction.editReply({ content: '❌ المباراة غير نشطة.' });

                const voterId = interaction.user.id;
                const allPlayers = [...match.team1, ...match.team2];
                const isParticipant = allPlayers.includes(voterId);
                const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

                if (!isParticipant && !isAdmin) {
                    return interaction.editReply({ content: '❌ فقط المشاركون في المباراة يمكنهم التصويت!' });
                }

                if (match.votingCompleted || match.losingMvpUid) {
                    return interaction.editReply({ content: 'ℹ️ تم الانتهاء من تصويت الخاسر واكتملت نتائج المباراة بالفعل!' });
                }

                if (match.loserVotes.has(voterId)) {
                    return interaction.editReply({ content: '❌ You have already voted for MVP loser! Waiting for other voters.' });
                }

                const candidateId = values[0].replace('loser_cand_', '');
                match.loserVotes.set(voterId, candidateId);
                saveMatchToDb(match);

                await interaction.editReply({ content: '✅ You have voted for MVP loser!' });

                // تحديث قائمة التصويت في نفس الرسالة
                try {
                    const updatedSelect = buildLoserSelectMenu(match, interaction.guild);
                    await interaction.message.edit({
                        components: [new ActionRowBuilder().addComponents(updatedSelect)]
                    });
                } catch (e) {}

                // التحقق من تصويت كلا الفريقين على الخاسر
                const t1LoserVoters = allPlayers.filter(uid => match.team1.includes(uid) && match.loserVotes.has(uid));
                const t2LoserVoters = allPlayers.filter(uid => match.team2.includes(uid) && match.loserVotes.has(uid));
                const hasBothTeamsLoserVoted = t1LoserVoters.length >= 1 && t2LoserVoters.length >= 1;
                const totalVoted = match.loserVotes.size;

                if (!hasBothTeamsLoserVoted && totalVoted < allPlayers.length) {
                    return;
                }

                const loserCounts = {};
                for (const candId of match.loserVotes.values()) {
                    loserCounts[candId] = (loserCounts[candId] || 0) + 1;
                }
                let topLoser = candidateId;
                let maxLoserVotes = 0;
                let isTieLoser = false;
                for (const [cId, count] of Object.entries(loserCounts)) {
                    if (count > maxLoserVotes) {
                        maxLoserVotes = count;
                        topLoser = cId;
                        isTieLoser = false;
                    } else if (count === maxLoserVotes) {
                        isTieLoser = true;
                    }
                }

                if (isTieLoser && totalVoted < allPlayers.length) {
                    await interaction.channel.send({
                        content: `⚠️ **Vote Mismatch!** The voters selected different players for MVP Losers. Remaining players please vote to decide!`
                    });
                    return;
                }

                if (match.votingCompleted) return;
                match.votingCompleted = true;
                match.loserVotingActive = false;

                match.losingMvpUid = topLoser;
                saveMatchToDb(match);

                const loserVotersMentions = Array.from(match.loserVotes.keys()).map(id => `<@${id}>`).join(', ');

                const loserSelectedEmbed = new EmbedBuilder()
                    .setColor('#2b2d31')
                    .setTitle('🔴 MVP Losers Selected!')
                    .setDescription(
                        `Winner: <@${match.losingMvpUid}>\n\n` +
                        `+30 MVP point(s) will be awarded after both MVPs are selected.\n\n` +
                        `📊 Total Votes: ${totalVoted}/${match.teamSize * 2}\n` +
                        `✅ Voters: ${loserVotersMentions}`
                    );

                await interaction.channel.send({ embeds: [loserSelectedEmbed] });
                await interaction.channel.send({
                    content: `🔴 **MVP Losers Selected!**\n\n<@${match.losingMvpUid}> has been voted as MVP Losers.\nMVP points will be awarded after **both** MVPs are selected.`
                });

                // إنهاء الماتش وتوزيع النقاط عبر دالة finalizeMatch
                await finalizeMatch(interaction.guild, match, interaction.channel);
                return;
            }

            // التصويت على إلغاء المباراة (Vote Cancel Button)
            if (customId.startsWith('vote_cancel_') || customId.startsWith('confirm_cancel_match_')) {
                const lockKey = `${interaction.user.id}_${customId}`;
                if (actionDebounceLocks.has(lockKey)) {
                    return interaction.reply({ content: '⏳ يرجى الانتظار ثانية...', ephemeral: true }).catch(() => {});
                }
                actionDebounceLocks.add(lockKey);
                setTimeout(() => actionDebounceLocks.delete(lockKey), 3000);

                // استجابة فورية للديسكورد لمنع حدوث BOT did not respond in time
                await interaction.deferUpdate().catch(() => {});

                const prefix = customId.startsWith('vote_cancel_') ? 'vote_cancel_' : 'confirm_cancel_match_';
                const match = findMatchFromInteraction(interaction, prefix);
                if (!match) {
                    return interaction.followUp({ content: '❌ المباراة غير نشطة أو انتهت بالفعل.', ephemeral: true }).catch(() => {});
                }

                const allPlayers = [...match.team1, ...match.team2];
                const isParticipant = allPlayers.includes(interaction.user.id);
                const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

                if (!isParticipant && !isAdmin) {
                    return interaction.followUp({ content: '❌ فقط المشاركون في هذه المباراة أو الإدارة يمكنهم التصويت على الإلغاء!', ephemeral: true }).catch(() => {});
                }

                if (!match.cancelVotes) match.cancelVotes = new Set();

                if (match.cancelVotes.has(interaction.user.id) && !isAdmin) {
                    return interaction.followUp({ content: '⚠️ لقد قمت بالتصويت لإلغاء المباراة بالفعل! في انتظار انضمام بقية اللاعبين للتصويت.', ephemeral: true }).catch(() => {});
                }

                match.cancelVotes.add(interaction.user.id);
                saveMatchToDb(match);

                const requiredVotes = Math.max(2, Math.ceil(allPlayers.length / 2));

                // إذا اكتمل النصاب المطلوب أو كان المصوت إدارياً
                if (match.cancelVotes.size >= requiredVotes || isAdmin) {
                    activeMatches.delete(match.id);
                    removeMatchFromDb(match.id);

                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#ed4245')
                        .setTitle('🛑 تم إلغاء المباراة بالموافقة!')
                        .setDescription(`تمت الموافقة على إلغاء المباراة رسمياً بناءً على اكتمال تصويت اللاعبين (${match.cancelVotes.size}/${requiredVotes}).\n🔒 سيتم إعادة الجميع إلى غرف الانتظار وحذف الروم خلال 5 ثوانٍ...`)
                        .setTimestamp();

                    await interaction.editReply({ embeds: [cancelEmbed], components: [] }).catch(async () => {
                        await interaction.channel.send({ embeds: [cancelEmbed] }).catch(() => {});
                    });

                    await returnPlayersToWaiting(interaction.guild, match);
                    await cleanupMatchVoicePermissions(interaction.guild, match);

                    setTimeout(async () => {
                        try { await interaction.channel.delete(); } catch (e) {}
                    }, 5000);
                    return;
                }

                // تحديث اللوحة بالأصوات الجديدة
                const payload = buildCancelVotePayload(match, interaction.guild);
                await interaction.editReply(payload).catch(async () => {
                    await interaction.message?.edit(payload).catch(() => {});
                });
                return;
            }

            if (customId.startsWith('keep_match_')) {
                const lockKey = `${interaction.user.id}_${customId}`;
                if (actionDebounceLocks.has(lockKey)) {
                    return interaction.reply({ content: '⏳ يرجى الانتظار ثانية...', ephemeral: true }).catch(() => {});
                }
                actionDebounceLocks.add(lockKey);
                setTimeout(() => actionDebounceLocks.delete(lockKey), 3000);

                await interaction.deferUpdate().catch(() => {});

                const match = findMatchFromInteraction(interaction, 'keep_match_');
                if (!match) {
                    return interaction.followUp({ content: '❌ هذه المباراة غير نشطة.', ephemeral: true }).catch(() => {});
                }

                const allPlayers = [...match.team1, ...match.team2];
                const isParticipant = allPlayers.includes(interaction.user.id);
                const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

                if (!isParticipant && !isAdmin) {
                    return interaction.followUp({ content: '❌ فقط المشاركون في المباراة يمكنهم التفاعل مع اللوحة.', ephemeral: true }).catch(() => {});
                }

                // إذا كان صاحب الطلب أو الإدارة ضغط Keep Match يتم إلغاء التصويت والعودة للماتش
                if (interaction.user.id === match.cancelInitiatorId || isAdmin) {
                    match.cancelVotes = new Set();
                    match.cancelInitiatorId = null;
                    match.cancelVoteActive = false;
                    match.cancelMessageId = null;
                    saveMatchToDb(match);

                    const keepEmbed = new EmbedBuilder()
                        .setColor('#57f287')
                        .setTitle('🎮 استمرار المباراة!')
                        .setDescription(`تم إلغاء طلب إنهاء المباراة بواسطة ${interaction.user}. استمتعوا باللعب!`)
                        .setTimestamp();

                    return interaction.editReply({ embeds: [keepEmbed], components: [] }).catch(async () => {
                        await interaction.message?.edit({ embeds: [keepEmbed], components: [] }).catch(() => {});
                    });
                }

                const requiredVotes = Math.max(2, Math.ceil(allPlayers.length / 2));
                return interaction.followUp({ 
                    content: `✅ صوتك محتسب للاستمرار في اللعب. لن يتم إلغاء المباراة إلا إذا اكتمل تصويت ${requiredVotes} لاعبين على الإلغاء.`, 
                    ephemeral: true 
                }).catch(() => {});
            }

        }

        if (interaction.isUserSelectMenu() && interaction.customId.startsWith('submit_check_target_')) {
            const device = interaction.customId.replace('submit_check_target_', '');
            const targetId = interaction.values[0];
            return processCheckSubmission(interaction, targetId, device);
        }

    } catch (err) {
        console.error('Interaction error:', err);
        if (interaction.deferred) {
            interaction.editReply({ content: '❌ حدث خطأ غير متوقع أثناء معالجة الطلب.' }).catch(() => {});
        } else if (!interaction.replied) {
            interaction.reply({ content: '❌ حدث خطأ غير متوقع أثناء معالجة الطلب.', ephemeral: true }).catch(() => {});
        }
    }
});

// دالة بناء رسالة تصويت إلغاء المباراة التفاعلية
function buildCancelVotePayload(match, guild) {
    const allPlayers = [...(match.team1 || []), ...(match.team2 || [])];
    const requiredVotes = Math.max(2, Math.ceil(allPlayers.length / 2));
    const currentVotes = match.cancelVotes ? match.cancelVotes.size : 0;

    const votersList = match.cancelVotes && match.cancelVotes.size > 0 
        ? Array.from(match.cancelVotes).map(uid => `<@${uid}>`).join(', ') 
        : 'None';
    const t1Count = (match.team1 || []).filter(uid => match.cancelVotes?.has(uid)).length;
    const t2Count = (match.team2 || []).filter(uid => match.cancelVotes?.has(uid)).length;

    const initiatorId = match.cancelInitiatorId || (match.cancelVotes ? Array.from(match.cancelVotes)[0] : null);

    const embed = new EmbedBuilder()
        .setColor('#ed4245')
        .setTitle('⚠️ تصويت إلغاء المباراة | Match Cancel Vote')
        .setDescription(
            `بدأ اللاعب <@${initiatorId}> طلباً لإلغاء هذه المباراة.\n` +
            `لإلغاء المباراة، يجب أن يوافق **${requiredVotes}** لاعبين على الأقل بالضغط على زر التصويت أدناه.\n\n` +
            `*يمكن لأعضاء كلا الفريقين الانضمام للتصويت.*`
        )
        .addFields(
            { name: '📊 نسبة الأصوات', value: `**${currentVotes} / ${requiredVotes}** أصوات`, inline: true },
            { name: '👥 حالة الفريقين', value: `🔴 Team 1: **${t1Count}/${match.team1.length}**\n🟢 Team 2: **${t2Count}/${match.team2.length}**`, inline: true },
            { name: '🗳️ المصوتون للإلغاء', value: votersList, inline: false }
        )
        .setFooter({ text: 'Apostado Manager • Fair Play System' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`vote_cancel_${match.id}`)
            .setLabel(`Vote Cancel (${currentVotes}/${requiredVotes})`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛑'),
        new ButtonBuilder()
            .setCustomId(`keep_match_${match.id}`)
            .setLabel('Keep Match')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎮')
    );

    return { embeds: [embed], components: [row] };
}

// دالة بناء قائمة تصويت الفائز (CHOSE THE MVP - Stage 1)
function buildWinnerSelectMenu(match, guild) {
    const counts = {};
    for (const v of match.winnerVotes.values()) {
        counts[v.candidateId] = (counts[v.candidateId] || 0) + 1;
    }

    const t1Opts = match.team1.map(uid => {
        const m = guild.members.cache.get(uid);
        const name = m ? m.displayName : uid;
        const vCount = counts[uid] || 0;
        return {
            label: `${name} (${vCount} votes)`,
            description: 'Team 1',
            value: `win_cand_${uid}`,
            emoji: '🔴'
        };
    });

    const t2Opts = match.team2.map(uid => {
        const m = guild.members.cache.get(uid);
        const name = m ? m.displayName : uid;
        const vCount = counts[uid] || 0;
        return {
            label: `${name} (${vCount} votes)`,
            description: 'Team 2',
            value: `win_cand_${uid}`,
            emoji: '🟢'
        };
    });

    return new StringSelectMenuBuilder()
        .setCustomId(`vote_winner_mvp_select_${match.id}`)
        .setPlaceholder('CHOSE THE MVP')
        .addOptions([...t1Opts, ...t2Opts]);
}

// دالة بناء قائمة تصويت الخاسر (CHOSE THE MVP - Stage 2)
function buildLoserSelectMenu(match, guild) {
    const losingPlayers = match.winningTeam === 1 ? match.team2 : match.team1;
    const losingTeamLabel = match.winningTeam === 1 ? 'Team 2' : 'Team 1';
    const losingEmoji = match.winningTeam === 1 ? '🟢' : '🔴';

    const counts = {};
    for (const candId of match.loserVotes.values()) {
        counts[candId] = (counts[candId] || 0) + 1;
    }

    const opts = losingPlayers.map(uid => {
        const m = guild.members.cache.get(uid);
        const name = m ? m.displayName : uid;
        const vCount = counts[uid] || 0;
        return {
            label: `${name} (${vCount} votes)`,
            description: losingTeamLabel,
            value: `loser_cand_${uid}`,
            emoji: losingEmoji
        };
    });

    return new StringSelectMenuBuilder()
        .setCustomId(`vote_loser_mvp_select_${match.id}`)
        .setPlaceholder('CHOSE THE MVP')
        .addOptions(opts);
}

// معالجة الانضمام للفرق
async function handleTeamJoin(interaction, match, teamNum) {
    const uid = interaction.user.id;
    const guildId = interaction.guild.id;

    // 1. التحقق من البلاك ليست
    const bl = await isUserBlacklisted(uid, guildId);
    if (bl.blacklisted) {
        return interaction.reply({ 
            content: `⛔ **أنت في قائمة الحظر (Blacklist)!**\n⏳ **متبقي على فك الحظر:** \`${formatRemainingTime(bl.remainingMs)}\`\n📝 **السبب:** \`${bl.reason}\``, 
            ephemeral: true 
        });
    }

    // 2. التحقق من التواجد في مباراة أخرى نشطة لم يكتمل تصويتها بعد (مع تنظيف الرومات المحذوفة تلقائياً)
    const activeMatchForUser = getRealActiveMatchForUser(interaction.guild, uid, match.id);
    if (activeMatchForUser) {
        const chId = activeMatchForUser.matchChannelId || activeMatchForUser.threadId;
        return interaction.reply({ 
            content: `❌ **لا يمكنك الانضمام لمباراة أخرى!**\nأنت متواجد بالفعل في مباراة نشطة (<#${chId}>) حتى ينتهي التصويت بالكامل.`, 
            ephemeral: true 
        });
    }

    const team = teamNum === 1 ? match.team1 : match.team2;
    const otherTeam = teamNum === 1 ? match.team2 : match.team1;

    if (team.includes(uid)) {
        return interaction.reply({ content: 'ℹ️ أنت منضم بالفعل في هذا الفريق!', ephemeral: true });
    }

    if (team.length >= match.teamSize) {
        return interaction.reply({ content: '❌ هذا الفريق ممتلئ بالفعل!', ephemeral: true });
    }

    const idx = otherTeam.indexOf(uid);
    if (idx !== -1) {
        otherTeam.splice(idx, 1);
    }

    team.push(uid);
    saveMatchToDb(match);

    await interaction.reply({ content: `✅ تم انضمامك إلى **Team ${teamNum}** بنجاح!`, ephemeral: true });
    await updateLobbyMessage(interaction.guild, match);

    // التحقق من اكتمال الفريقين وبدء المباراة فوراً
    if (match.team1.length === match.teamSize && match.team2.length === match.teamSize) {
        if (match.lobbyTimeout) clearTimeout(match.lobbyTimeout);
        match.state = 'IN_PROGRESS';
        saveMatchToDb(match);
        await startMatch(interaction.guild, match);
    }
}

// بناء رسالة اللوبي بتصميم عريض ومطابق 100% للشاشات الأصلية
function buildLobbyEmbed(match, guild) {
    const t1List = match.team1.length > 0 
        ? match.team1.map(id => `<@${id}>`).join('\n') 
        : '*No players yet*';

    const t2List = match.team2.length > 0 
        ? match.team2.map(id => `<@${id}>`).join('\n') 
        : '*No players yet*';

    const divider = '────────────────────────────────────────';

    return new EmbedBuilder()
        .setColor('#2f3136')
        .setTitle(`👾 Free Fire ${match.mode} Match`)
        .setDescription(`| Match started by <@${match.hostId}>\n\n${divider}\n\n🔴 **Team 1 (${match.team1.length}/${match.teamSize})**\n${t1List}\n\n🟢 **Team 2 (${match.team2.length}/${match.teamSize})**\n${t2List}\n\n${divider}`)
        .setFooter({ text: 'Apostado Manager • Match Lobby' });
}

// بناء أزرار اللوبي مع تعطيل الزر في حال امتلاء الفريق
function buildLobbyButtons(match) {
    const isT1Full = match.team1.length >= match.teamSize;
    const isT2Full = match.team2.length >= match.teamSize;
    const isAllFull = isT1Full && isT2Full;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`join_team1_${match.id}`)
            .setLabel('Join Team 1')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(isT1Full),
        new ButtonBuilder()
            .setCustomId(`join_team2_${match.id}`)
            .setLabel('Join Team 2')
            .setStyle(ButtonStyle.Success)
            .setDisabled(isT2Full),
        new ButtonBuilder()
            .setCustomId(`leave_match_${match.id}`)
            .setLabel('Leave')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isAllFull),
        new ButtonBuilder()
            .setCustomId(`cancel_match_${match.id}`)
            .setLabel('Cancel Game')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(isAllFull)
    );
}

async function updateLobbyMessage(guild, match) {
    try {
        const channel = await guild.channels.fetch(match.channelId).catch(() => null);
        if (!channel || !match.lobbyMessageId) return;

        const msg = await channel.messages.fetch(match.lobbyMessageId).catch(() => null);
        if (!msg) return;

        const embed = buildLobbyEmbed(match, guild);
        const buttons = buildLobbyButtons(match);

        await msg.edit({ embeds: [embed], components: [buttons] });
    } catch (e) {
        console.error('Error updating lobby message:', e);
    }
}

// إعادة اللاعبين إلى غرف الانتظار waiting
async function returnPlayersToWaiting(guild, match) {
    try {
        const waitingChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes('waiting'));
        const defaultWaiting = waitingChannels.first();

        const allPlayers = [...match.team1, ...match.team2];
        for (const uid of allPlayers) {
            const member = await guild.members.fetch(uid).catch(() => null);
            if (member && member.voice && member.voice.channel) {
                const originalId = match.originalVoiceChannels?.get(uid);
                const targetChannel = (originalId ? guild.channels.cache.get(originalId) : null) || defaultWaiting;
                if (targetChannel) {
                    await member.voice.setChannel(targetChannel).catch(() => {});
                }
            }
        }
    } catch (e) {
        console.error('Error returning players to waiting voice:', e);
    }
}

// بدء المباراة والبحث عن رومات Team 1 و Team 2 الفارغة والنقل وإنشاء الثريد
async function startMatch(guild, match) {
    try {
        const playChannel = await guild.channels.fetch(match.channelId).catch(() => null);
        if (!playChannel) return;

        // حفظ الروم الصوتي الأصلي (waiting) لكل لاعب قبل النقل
        const allParticipants = [...match.team1, ...match.team2];
        for (const uid of allParticipants) {
            const member = await guild.members.fetch(uid).catch(() => null);
            if (member?.voice?.channel) {
                match.originalVoiceChannels.set(uid, member.voice.channel.id);
            }
        }

        // تحديث رسالة اللوبي لتعطيل جميع الأزرار
        await updateLobbyMessage(guild, match);

        // 1. إرسال رسالة Match Ready في شات اللعب
        const readyEmbed = new EmbedBuilder()
            .setColor('#2f3136')
            .setTitle('✔ Match Ready!')
            .setDescription('Moving players to voice channels...')
            .setFooter({ text: new Date().toLocaleString() });

        const readyMsg = await playChannel.send({ embeds: [readyEmbed] });

        // 2. البحث عن غرفتين فارغتين Team 1 و Team 2
        const t1Channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes('team 1')).sort((a, b) => a.position - b.position);
        const t2Channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes('team 2')).sort((a, b) => a.position - b.position);

        let selectedT1Voice = null;
        let selectedT2Voice = null;

        // البحث عن زوج غرف فارغ تماماً
        for (const ch1 of t1Channels.values()) {
            if (ch1.members.size === 0) {
                const ch2 = t2Channels.find(c => (c.parentId === ch1.parentId || !ch1.parentId) && c.members.size === 0 && Math.abs(c.position - ch1.position) <= 2);
                if (ch2) {
                    selectedT1Voice = ch1;
                    selectedT2Voice = ch2;
                    break;
                }
            }
        }

        if (!selectedT1Voice) selectedT1Voice = t1Channels.find(c => c.members.size === 0) || t1Channels.first();
        if (!selectedT2Voice) selectedT2Voice = t2Channels.find(c => c.members.size === 0 && c.id !== selectedT1Voice?.id) || t2Channels.first();

        match.team1VoiceId = selectedT1Voice?.id;
        match.team2VoiceId = selectedT2Voice?.id;

        // منح صلاحيات الفويس للاعبي Team 1 و Team 2 لتبقى مفتوحة لهم طوال الماتش حتى لو خرجوا
        if (selectedT1Voice) {
            for (const uid of match.team1) {
                await selectedT1Voice.permissionOverwrites.edit(uid, {
                    Connect: true,
                    ViewChannel: true,
                    Speak: true
                }).catch(() => {});
            }
        }

        if (selectedT2Voice) {
            for (const uid of match.team2) {
                await selectedT2Voice.permissionOverwrites.edit(uid, {
                    Connect: true,
                    ViewChannel: true,
                    Speak: true
                }).catch(() => {});
            }
        }

        // نقل لاعبي Team 1
        for (const uid of match.team1) {
            const member = await guild.members.fetch(uid).catch(() => null);
            if (member && member.voice && member.voice.channel && selectedT1Voice) {
                await member.voice.setChannel(selectedT1Voice).catch(() => {});
            }
        }

        // نقل لاعبي Team 2
        for (const uid of match.team2) {
            const member = await guild.members.fetch(uid).catch(() => null);
            if (member && member.voice && member.voice.channel && selectedT2Voice) {
                await member.voice.setChannel(selectedT2Voice).catch(() => {});
            }
        }

        // 3. إنشاء قناة نصية خاصة مؤقتة للمباراة مع إعطاء صلاحيات كاملة لكل لاعب في Team 1 و Team 2
        const permissionOverwrites = [
            {
                id: guild.id, // @everyone
                deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            },
            {
                id: client.user.id, // البوت
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ];

        // منح كل لاعب في الفريقين صلاحية الرؤية والكتابة الكاملة حتى لو لم يكن لديه أي رتبة في السيرفر
        for (const uid of allParticipants) {
            permissionOverwrites.push({
                id: uid,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AddReactions
                ]
            });
        }

        // منح الإدارة صلاحية المراقبة
        const staffRoles = guild.roles.cache.filter(r => 
            r.permissions.has(PermissionFlagsBits.Administrator) || 
            r.permissions.has(PermissionFlagsBits.ManageGuild) ||
            r.name.toLowerCase().includes('staff') ||
            r.name.toLowerCase().includes('admin')
        );
        for (const role of staffRoles.values()) {
            permissionOverwrites.push({
                id: role.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            });
        }

        // البحث عن روم مخصص لإنشاء الثريدات مثل paradisss أو partidasss
        const paradisChannel = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildText && 
            (c.name.toLowerCase().includes('paradis') || c.name.toLowerCase().includes('partida'))
        );
        const threadParentChannel = paradisChannel || playChannel;
        match.parentChannelId = threadParentChannel.id;

        // تطبيق صلاحيات القراءة والكتابة في الثريد لجميع لاعبي الفريقين (Team 1 و Team 2) على القناة الأم لضمان قدرتهم على الكتابة فوراً
        for (const uid of allParticipants) {
            await threadParentChannel.permissionOverwrites.edit(uid, {
                ViewChannel: true,
                SendMessages: true,
                SendMessagesInThreads: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                EmbedLinks: true
            }).catch(e => console.error(`Error adding threadParentChannel perms for ${uid}:`, e));
        }

        let matchChannel;
        try {
            matchChannel = await threadParentChannel.threads.create({
                name: `Match ${match.id}`,
                autoArchiveDuration: 60,
                type: ChannelType.PrivateThread, // Fil privé
                invitable: false,
                reason: `Private thread for Free Fire Match ${match.id}`
            });
        } catch (threadErr) {
            console.error('Failed to create private thread, creating public thread fallback:', threadErr);
            matchChannel = await threadParentChannel.threads.create({
                name: `Match ${match.id}`,
                autoArchiveDuration: 60,
                reason: `Thread for Free Fire Match ${match.id}`
            });
        }

        // إضافة جميع اللاعبين في الفريقين (Team 1 & Team 2) داخل الـ Fil Privé
        for (const uid of allParticipants) {
            await matchChannel.members.add(uid).catch(e => console.error(`Error adding ${uid} to match thread:`, e));
        }

        match.matchChannelId = matchChannel.id;
        match.threadId = matchChannel.id;
        saveMatchToDb(match);

        // تحديث رسالة Match Ready بالرابط المباشر للروم
        const readyUpdatedEmbed = new EmbedBuilder()
            .setColor('#2f3136')
            .setTitle('✔ Match Ready!')
            .setDescription(`🎮 **Match Room:** <#${matchChannel.id}>\n🔊 Players moved to voice channels.`)
            .setFooter({ text: new Date().toLocaleString() });
        await readyMsg.edit({ embeds: [readyUpdatedEmbed] }).catch(() => {});

        // 4. تجميع المنشن (Owners, Staff, Participants)
        const owners = guild.members.cache.filter(m => m.id === guild.ownerId).map(m => `<@${m.id}>`).join(' ') || `<@${guild.ownerId}>`;
        const staffMembers = guild.members.cache.filter(m => m.permissions.has(PermissionFlagsBits.ManageGuild) && !m.user.bot).map(m => `<@${m.id}>`).slice(0, 15).join(' ') || 'None';
        const participantMentions = allParticipants.map(uid => `<@${uid}>`).join(' ');

        await matchChannel.send({
            content: `**Owners Mention**\n${owners}\n\n**Staff Mention**\n${staffMembers}\n\n**Participant Mention**\n${participantMentions}`
        });

        // 5. إرسال لوحة بدء المباراة (Match Started Embed)
        const t1Display = match.team1.map(id => `<@${id}>`).join('\n');
        const t2Display = match.team2.map(id => `<@${id}>`).join('\n');

        const matchStartedEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`👾 Free Fire ${match.mode} Match Started!`)
            .setDescription(`🔴 **Team 1:**\n${t1Display}\n\n🟢 **Team 2:**\n${t2Display}\n\nPress Button to access your voice team\n\n*Good luck and have fun!*`);

        const voiceButtonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Team 1 Voice ↗')
                .setStyle(ButtonStyle.Link)
                .setURL(selectedT1Voice ? `https://discord.com/channels/${guild.id}/${selectedT1Voice.id}` : `https://discord.com/channels/${guild.id}`),
            new ButtonBuilder()
                .setLabel('Team 2 Voice ↗')
                .setStyle(ButtonStyle.Link)
                .setURL(selectedT2Voice ? `https://discord.com/channels/${guild.id}/${selectedT2Voice.id}` : `https://discord.com/channels/${guild.id}`)
        );

        await matchChannel.send({ embeds: [matchStartedEmbed], components: [voiceButtonsRow] });

        // 6. قائمة الإجراءات ومعلومات الروم
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`match_action_select_${match.id}`)
            .setPlaceholder('Select Action')
            .addOptions([
                {
                    label: 'MVP Winners',
                    description: 'Vote for the best player from winning team',
                    value: 'mvp_winners',
                    emoji: '👾'
                },
                {
                    label: 'MVP Losers',
                    description: 'Vote for the best player from losing team',
                    value: 'mvp_losers',
                    emoji: '🔴'
                },
                {
                    label: 'Call Staff',
                    description: 'Request staff assistance',
                    value: 'call_staff',
                    emoji: '📞'
                },
                {
                    label: 'Reset MVP Vote',
                    description: 'Reset active MVP voting',
                    value: 'reset_mvp',
                    emoji: '✔'
                },
                {
                    label: 'Staff Cancel Match',
                    description: 'Staff only — cancel match immediately',
                    value: 'staff_cancel',
                    emoji: '🛑'
                },
                {
                    label: 'Report Bug',
                    description: 'Report a bug with risk and details',
                    value: 'report_bug',
                    emoji: '🚨'
                },
                {
                    label: 'Cancel Match',
                    description: 'Any player can start — confirm on the cancel panel',
                    value: 'cancel_match_request',
                    emoji: '✖'
                }
            ]);

        const menuRow = new ActionRowBuilder().addComponents(selectMenu);

        const roomInfoEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle('👾 Room Information')
            .setDescription(`**Room ID :** \`${match.roomId}\`\n**Password :** \`${match.password || 'None'}\``)
            .addFields(
                {
                    name: 'How to check someone :',
                    value: 'open a ticket with check for cheating\n`# check-services`',
                    inline: false
                },
                {
                    name: 'ℹ Voice Channel Note',
                    value: 'Players will remain in their current voice channels after the match ends. You are free to leave or stay as you wish',
                    inline: false
                }
            )
            .setFooter({ text: new Date().toLocaleString() });

        const copyInfoRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`copy_room_info_${match.id}`)
                .setLabel('Copy Info')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📑')
        );

        await matchChannel.send({
            content: '🪵 **Use the menu below to vote or report problems**',
            embeds: [roomInfoEmbed],
            components: [menuRow, copyInfoRow]
        });

    } catch (err) {
        console.error('Error starting match:', err);
    }
}

client.login(process.env.DISCORD_TOKEN);