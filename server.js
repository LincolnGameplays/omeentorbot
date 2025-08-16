// server.js - oMeentor Shop (final, ready for Square Cloud)
// ------------------------------------------------------------------
// NOTAS IMPORTANTES (leia antes de rodar):
// - Configure DISCORD_TOKEN, PARADISEPAG_ACCESS_TOKEN, PARADISEPAG_OFFER_HASH,
//   PARADISEPAG_PRODUCT_HASH e PUBLIC_URL nas env vars do Square Cloud.
// - REDIS_URL está definido por padrão com a string que você enviou.
//   Recomendo mover para a configuração de variáveis do Square Cloud.
// ------------------------------------------------------------------

import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import {
  Client,
  GatewayIntentBits,
  Routes,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ChannelType,
  MessageFlags
} from 'discord.js';
import { REST } from '@discordjs/rest';
import path from 'path';
import { fileURLToPath } from 'url';
// import { Runner } from './public/game-logic.js'; // Import the new game logic (renamed from HeadlessRunner)

// Sistema de validação de inputs
class InputValidator {
    constructor() {
        this.inputHistory = new Map();
        this.MIN_INPUT_DELAY = 16; // ~60fps
        this.MAX_INPUTS_PER_SECOND = 70;
        this.inputCounts = new Map();
        this.lastCleanup = Date.now();
    }

    validate(playerId, input) {
        const now = Date.now();
        
        // Limpar contadores antigos
        if (now - this.lastCleanup > 1000) {
            this.cleanupCounters();
            this.lastCleanup = now;
        }

        // Verificar delay entre inputs
        const lastInput = this.inputHistory.get(playerId);
        if (lastInput && now - lastInput < this.MIN_INPUT_DELAY) {
            throw new Error('Input too fast');
        }

        // Verificar quantidade de inputs por segundo
        const count = this.inputCounts.get(playerId) || 0;
        if (count > this.MAX_INPUTS_PER_SECOND) {
            throw new Error('Too many inputs');
        }

        // Validar tipo de input
        if (!this.isValidInput(input)) {
            throw new Error('Invalid input type');
        }

        // Atualizar histórico
        this.inputHistory.set(playerId, now);
        this.inputCounts.set(playerId, count + 1);

        return true;
    }

    isValidInput(input) {
        const validTypes = ['jump', 'duck'];
        const validActions = ['keydown', 'keyup'];
        
        return validTypes.includes(input.cmd) && 
               validActions.includes(input.action);
    }

    cleanupCounters() {
        this.inputCounts.clear();
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------- Config / Env ----------------------
process.env.NODE_ENV = 'production';
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || '';
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || null;
const DISCORD_ANNOUNCE_CHANNEL = process.env.DISCORD_ANNOUNCE_CHANNEL || null;
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id=>id.trim()) : [];
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || null;
const DISCORD_SALES_CHANNEL = process.env.DISCORD_SALES_CHANNEL || null;
const DISCORD_LEADERBOARD_CHANNEL = process.env.DISCORD_LEADERBOARD_CHANNEL || null;
const DISCORD_VERIFIED_ROLE_ID = process.env.DISCORD_VERIFIED_ROLE_ID || null;
const DISCORD_UNVERIFIED_ROLE_ID = process.env.DISCORD_UNVERIFIED_ROLE_ID || null;
const DISCORD_CLIENT_ROLE_ID = process.env.DISCORD_CLIENT_ROLE_ID || null;
const DISCORD_BUYER_ROLE_ID = process.env.DISCORD_BUYER_ROLE_ID || null;
const DISCORD_TERMS_CHANNEL_ID = process.env.DISCORD_TERMS_CHANNEL_ID || null;
const DISCORD_QUEUE_CATEGORY_ID = process.env.DISCORD_QUEUE_CATEGORY_ID || null;

const PARADISEPAG_ACCESS_TOKEN = process.env.PARADISEPAG_ACCESS_TOKEN || '';
const PARADISEPAG_OFFER_HASH = process.env.PARADISEPAG_OFFER_HASH || '';
const PARADISEPAG_PRODUCT_HASH = process.env.PARADISEPAG_PRODUCT_HASH || '';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_for_dev';
const ADMIN_TOKEN_ID = 'admin-super-secret-token'; // Your new persistent admin token
const STREAMER_TOKEN_ID = process.env.STREAMER_TOKEN_ID || null;
const TURN_MAX_MS = Number(process.env.TURN_MAX_MS || 30 * 60 * 1000);
const MAX_DEATHS = Number(process.env.MAX_DEATHS || 2);

// If you provided REDIS_URL via env, it will be used. Otherwise the default below is set
// to the Redis URI you gave me — it's recommended to move it to the environment settings.
const REDIS_URL = process.env.REDIS_URL || 'redis://default:hu0PN57qgwxi8j9CaTXRO7ALA8hBNvUU@redis-19456.crce181.sa-east-1-2.ec2.redns.redis-cloud.com:19456';
const USE_REDIS = !!REDIS_URL;

// ---------------------- Redis init ----------------------
let redis = null;
if (USE_REDIS) {
  redis = new Redis(REDIS_URL);
  redis.on('connect', () => console.log('Redis connected'));
  redis.on('error', (e)=> console.warn('Redis error', e));
} else {
  console.log('Redis not configured - using in-memory fallback (not persistent).');
}

// ---------------------- In-memory fallback ----------------------
const memory = {
  queue: [],
  tokenIdToQueueEntry: new Map(),
  pendingPayments: new Map(),
  purchaseChannels: new Map()
};

const userLastKnownPosition = new Map(); // discordId -> position

// ---------------------- Persistence helpers ----------------------
async function setPending(tokenId, obj) {
  if (USE_REDIS) {
    await redis.set(`pending:${tokenId}`, JSON.stringify(obj), 'EX', 60*60*24);
  } else {
    memory.pendingPayments.set(tokenId, obj);
  }
}
async function getPending(tokenId) {
  if (USE_REDIS) {
    const v = await redis.get(`pending:${tokenId}`);
    return v ? JSON.parse(v) : null;
  } else {
    return memory.pendingPayments.get(tokenId) || null;
  }
}
async function delPending(tokenId) {
  if (USE_REDIS) await redis.del(`pending:${tokenId}`);
  else memory.pendingPayments.delete(tokenId);
}
async function getQueue() {
  if (USE_REDIS) {
    const v = await redis.get('queue');
    return v ? JSON.parse(v) : [];
  } else {
    return memory.queue;
  }
}
async function setQueue(q) {
  if (USE_REDIS) await redis.set('queue', JSON.stringify(q));
  else memory.queue = q;
}
async function pushQueueEntry(entry, insertAt = null) {
  const q = await getQueue();
  if (insertAt === null) q.push(entry);
  else q.splice(insertAt, 0, entry);
  await setQueue(q);
  await notifyQueuePositionChange(); // Notify after queue change
}
async function mapTokenToEntry(tokenId, entry) {
  if (USE_REDIS) await redis.set(`entry:${tokenId}`, JSON.stringify(entry), 'EX', 60*60*24);
  else memory.tokenIdToQueueEntry.set(tokenId, entry);
}
async function getTokenEntry(tokenId) {
  if (USE_REDIS) {
    const v = await redis.get(`entry:${tokenId}`);
    return v ? JSON.parse(v) : null;
  } else {
    return memory.tokenIdToQueueEntry.get(tokenId) || null;
  }
}
async function delTokenEntry(tokenId) {
  if (USE_REDIS) await redis.del(`entry:${tokenId}`);
  else memory.tokenIdToQueueEntry.delete(tokenId);
  await notifyQueuePositionChange(); // Notify after queue change
}

async function hasPurchased(discordId) {
  if (USE_REDIS) {
    return await redis.sismember('purchased_users', discordId);
  } else {
    memory.purchasedUsers = memory.purchasedUsers || new Set();
    return memory.purchasedUsers.has(discordId);
  }
}

async function markAsPurchased(discordId) {
  if (USE_REDIS) {
    await redis.sadd('purchased_users', discordId);
  } else {
    memory.purchasedUsers = memory.purchasedUsers || new Set();
    memory.purchasedUsers.add(discordId);
  }
}

// ---------------------- Ranking/Score Persistence Helpers ----------------------
const SCORE_KEY = 'user_scores'; // Redis hash key
const LEADERBOARD_KEY = 'leaderboard_top3';
const LEADERBOARD_MSG_ID_KEY = 'leaderboard_msg_id';

// Caching for ranking data
let cachedRankingData = null;
let lastRankingCacheTime = 0;
const RANKING_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function setUserBestScore(discordId, score) {
  if (USE_REDIS) {
    await redis.hset(SCORE_KEY, discordId, score);
  } else {
    memory.userScores = memory.userScores || new Map();
    memory.userScores.set(discordId, score);
  }
  cachedRankingData = null; // Invalidate cache on score update
}

async function getUserBestScore(discordId) {
  let score = 0;
  if (USE_REDIS) {
    score = await redis.hget(SCORE_KEY, discordId);
  } else {
    memory.userScores = memory.userScores || new Map();
    score = memory.userScores.get(discordId);
  }
  return score ? parseInt(score, 10) : 0;
}

async function getAllUserScores() {
  let allScores = [];
  if (USE_REDIS) {
    const data = await redis.hgetall(SCORE_KEY);
    for (const discordId in data) {
      allScores.push({ discordId, score: parseInt(data[discordId], 10) });
    }
  } else {
    memory.userScores = memory.userScores || new Map();
    for (const [discordId, score] of memory.userScores.entries()) {
      allScores.push({ discordId, score });
    }
  }
  return allScores;
}

async function getLeaderboard() {
  if (USE_REDIS) {
    const data = await redis.get(LEADERBOARD_KEY);
    return data ? JSON.parse(data) : [];
  } else {
    memory.leaderboard = memory.leaderboard || [];
    return memory.leaderboard;
  }
}

async function setLeaderboard(leaderboard) {
  if (USE_REDIS) {
    await redis.set(LEADERBOARD_KEY, JSON.stringify(leaderboard));
  } else {
    memory.leaderboard = leaderboard;
  }
}

async function getLeaderboardMessageId() {
  if (USE_REDIS) return await redis.get(LEADERBOARD_MSG_ID_KEY);
  return memory.leaderboardMessageId || null;
}

async function setLeaderboardMessageId(messageId) {
  if (USE_REDIS) {
    await redis.set(LEADERBOARD_MSG_ID_KEY, messageId);
  } else {
    memory.leaderboardMessageId = messageId;
  }
}

async function updateLeaderboardMessage() {
  if (!DISCORD_LEADERBOARD_CHANNEL) return;

  try {
    const channel = await discordClient.channels.fetch(DISCORD_LEADERBOARD_CHANNEL);
    if (!channel) {
      console.warn(`[Leaderboard] Channel ${DISCORD_LEADERBOARD_CHANNEL} not found.`);
      return;
    }

    const leaderboard = await getLeaderboard();

    const embed = new EmbedBuilder()
      .setTitle('🏆 Ranking Top 3 - Melhores Jogadores')
      .setColor(0xFFD700) // Gold color
      .setTimestamp();

    if (leaderboard.length === 0) {
      embed.setDescription('O ranking ainda está vazio. Jogue para ser o primeiro a marcar pontos!');
    } else {
      let description = '';
      const medals = ['🥇', '🥈', '🥉'];
      for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        description += `${medals[i]} **${entry.username}** - ${entry.score} pontos\n`;
      }
      embed.setDescription(description);

      // Set the thumbnail to the #1 player's avatar
      if (leaderboard[0] && leaderboard[0].avatar) {
        embed.setThumbnail(leaderboard[0].avatar);
      }
    }

    const messageId = await getLeaderboardMessageId();
    if (messageId) {
      try {
        const message = await channel.messages.fetch(messageId);
        await message.edit({ embeds: [embed] });
        console.log('[Leaderboard] Updated existing leaderboard message.');
        return;
      } catch (e) {
        console.warn('[Leaderboard] Could not find or edit previous message, creating a new one.', e.message);
      }
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await setLeaderboardMessageId(newMessage.id);
    console.log('[Leaderboard] Created new leaderboard message.');

  } catch (e) {
    console.error('[Leaderboard] Error updating leaderboard message:', e);
  }
}

// ---------------------- Express & WS ----------------------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());



app.get('/dino', (req, res) => {
  const token = req.query.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      // Token is valid, now check if this token is the active player's token
      // For now, just send the file. Active player logic will be added later.
      res.sendFile('index.html', { root: 'public' });
    } catch (e) {
      res.status(403).send('Access Denied: Invalid token.');
    }
  } else {
    res.status(403).send('Access Denied: No token provided.');
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const wsClients = new Map();
const inputValidator = new InputValidator(); // Instantiate InputValidator

function broadcastAll(obj) {
  const s = JSON.stringify(obj);
  for (const ws of wsClients.keys()) {
    try { ws.send(s); } catch {}
  }
}

let activePlayerToken = null;
let activeGame = null; // Holds the current game simulation instance
let gameLoopInterval = null; // Holds the game loop interval

async function setActivePlayer(tokenId) {
  activePlayerToken = tokenId;

  if (tokenId) {
    const entry = await getTokenEntry(tokenId);
    if (entry) {
        // Don't start the game immediately. Wait for the client to be ready.
        // activeGame = new Runner(); // Use Runner (renamed from HeadlessRunner)
        // activeGame.playing = false; // Ensure game doesn't start updating
        activeGame = { update: () => {}, getState: () => ({ crashed: false, distance: 0 }), handleInput: () => {}, handleKeyUp: () => {} }; // Placeholder for server-side game logic
        broadcastAll({ type: 'activePlayerChange', activePlayerToken, isActiveGame: true, playerName: entry.username });
        console.log(`Player ${entry.username} is now active. Waiting for client to be ready...`);
    } else {
        activeGame = null;
        broadcastAll({ type: 'activePlayerChange', activePlayerToken: null, isActiveGame: false });
    }
  } else {
    activeGame = null;
    broadcastAll({ type: 'activePlayerChange', activePlayerToken: null, isActiveGame: false });
    console.log('No active player. Game stopped.');
  }
}

// --- Server-side Game Loop ---
function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);

    gameLoopInterval = setInterval(async () => {
        if (activeGame && activeGame.playing) {
            // activeGame.update(performance.now()); // Server-side game logic is currently disabled
            const gameState = activeGame.getState();
            broadcastAll({ type: 'gameState', state: gameState });

            // Check for game over
            if (gameState.crashed) {
                console.log(`Game over detected for token: ${activePlayerToken}`);
                await handlePlayerDeath(activePlayerToken, gameState.distance);
                activeGame = null; // Stop the game
            }
        }
    }, 1000 / 60); // 60 FPS
}

wss.on('connection', (ws) => {
  wsClients.set(ws, { tokenId: null });
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // Input Validation
    if (msg.type === 'login') {
        if (typeof msg.jwt !== 'string' || !msg.jwt) {
            console.warn('Invalid login message: missing or invalid jwt');
            ws.send(JSON.stringify({ type: 'loginResult', success: false }));
            return;
        }
        if (typeof msg.clientTime !== 'number') {
            console.warn('Invalid login message: missing or invalid clientTime');
            ws.send(JSON.stringify({ type: 'loginResult', success: false }));
            return;
        }
        if (!msg.resolution || typeof msg.resolution.width !== 'number' || typeof msg.resolution.height !== 'number' || typeof msg.resolution.dpr !== 'number') {
            console.warn('Invalid login message: missing or invalid resolution');
            ws.send(JSON.stringify({ type: 'loginResult', success: false }));
            return;
        }

        let tokenToVerify = msg.jwt;
        let isStaticAdminToken = false;

        if (tokenToVerify === ADMIN_TOKEN_ID) {
            isStaticAdminToken = true;
            // Create a JWT on the fly for the admin so the rest of the logic works
            tokenToVerify = makeJwtForToken(ADMIN_TOKEN_ID);
            
            // Create a temporary entry for the admin if one doesn't exist
            let adminEntry = await getTokenEntry(ADMIN_TOKEN_ID);
            if (!adminEntry) {
                adminEntry = {
                    discordId: 'admin',
                    username: 'Admin',
                    tokenId: ADMIN_TOKEN_ID,
                    jwtToken: tokenToVerify,
                    createdAt: Date.now(),
                    deaths: 0,
                    notified: true,
                    productId: 'admin_access',
                    productTitle: 'Acesso de Administrador'
                };
                await mapTokenToEntry(ADMIN_TOKEN_ID, adminEntry);
                const q = await getQueue();
                q.unshift(adminEntry);
                await setQueue(q);
            }
        }

        try {
            const payload = jwt.verify(tokenToVerify, JWT_SECRET);
            const tokenId = payload.tokenId;
            const entry = await getTokenEntry(tokenId);

            if (!entry) {
                ws.send(JSON.stringify({ type: 'loginResult', success: false }));
                return;
            }

            wsClients.set(ws, { tokenId });

            if (!activePlayerToken) {
                await setActivePlayer(tokenId);
            }

            ws.send(JSON.stringify({
                type: 'loginResult',
                success: true,
                username: entry.username,
                tokenId,
                activePlayerToken: activePlayerToken
            }));

        } catch (e) {
            console.error('JWT verification failed:', e);
            ws.send(JSON.stringify({ type: 'loginResult', success: false }));
        }
    }

    if (msg.type === 'input') {
      const info = wsClients.get(ws);
      if (!info?.tokenId || info.tokenId !== activePlayerToken || !activeGame) return;
      
      try {
          inputValidator.validate(info.tokenId, msg); // Validate input
          // Apply input to the server-side game instance
          // if (msg.action === 'keydown') {
          //     activeGame.handleInput(msg.cmd);
          // } else if (msg.action === 'keyup') {
          //     activeGame.handleKeyUp(msg.cmd);
          // }
      } catch (error) {
          console.warn(`Invalid input from player ${info.tokenId}:`, error.message);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid input' }));
      }
    }

    if (msg.type === 'clientReady') {
        const info = wsClients.get(ws);
        if (info?.tokenId && info.tokenId === activePlayerToken && activeGame) {
            console.log(`Client for ${info.tokenId} is ready. Starting game.`);
            activeGame.playing = true;
        }
    }

    if (msg.type === 'get_ranking') {
      const now = Date.now();
      if (cachedRankingData && (now - lastRankingCacheTime < RANKING_CACHE_DURATION)) {
        ws.send(JSON.stringify({ type: 'rankingUpdate', players: cachedRankingData }));
        return;
      }

      const allScores = await getAllUserScores();
      const players = [];
      for (const entry of allScores) {
        const user = await discordClient.users.fetch(entry.discordId).catch(() => null);
        if (user) {
          players.push({ name: user.username, highScore: entry.score });
        }
      }
      // Sort by highScore descending
      players.sort((a, b) => b.highScore - a.highScore);
      cachedRankingData = players; // Cache the data
      lastRankingCacheTime = now; // Update cache time
      ws.send(JSON.stringify({ type: 'rankingUpdate', players: players }));
    }
    // The 'death' message from the client is now ignored, as the server determines death.
  });
  ws.on('close', async () => {
    const client = wsClients.get(ws);
    if (client && client.tokenId) {
      const q = await getQueue();
      const playerIndex = q.findIndex(entry => entry.tokenId === client.tokenId);
      if (playerIndex !== -1) {
        q.splice(playerIndex, 1);
        await setQueue(q);
        await delTokenEntry(client.tokenId);
        console.log(`Player with token ${client.tokenId} disconnected and was removed from the queue.`);
        await notifyQueuePositionChange();
        if (client.tokenId === activePlayerToken) {
          if (q.length > 0) {
            const nextPlayer = q[0];
            console.log('Next player:', nextPlayer.username);
            if (!nextPlayer.notified) {
              try {
                const user = await discordClient.users.fetch(nextPlayer.discordId);
                const jwtToken = makeJwtForToken(nextPlayer.tokenId);
                const gameLink = `${PUBLIC_URL}?token=${encodeURIComponent(jwtToken)}`;
                await user.send(`🎮 Sua vez de jogar! Clique aqui: ${gameLink}`);
                console.log(`Notified and activated token for next player: ${nextPlayer.username}`);
                nextPlayer.notified = true;
                await setQueue(q);
                setActivePlayer(nextPlayer.tokenId);
              } catch (e) {
                console.warn(`Could not activate token for next player ${nextPlayer.username}:`, e);
              }
            } else {
              setActivePlayer(nextPlayer.tokenId);
            }
          } else {
            console.log('Queue is empty.');
            setActivePlayer(null);
          }
        }
      }
    }
    wsClients.delete(ws);
  });
});

async function handlePlayerDeath(tokenId, score) {
    if (!tokenId) return;

    const info = await getTokenEntry(tokenId);
    if (!info) return;

    console.log(`Handling death for ${info.username} with score ${score}`);

    // --- Ranking Logic ---
    if (score > 0) {
        const currentBest = await getUserBestScore(info.discordId);
        if (score > currentBest) {
            await setUserBestScore(info.discordId, score);
            console.log(`[Ranking] New personal best for ${info.username}: ${score}`);

            // Check and update Top 3 Leaderboard
            const leaderboard = await getLeaderboard();
            const userOnBoard = leaderboard.find(e => e.discordId === info.discordId);

            if (!userOnBoard || score > userOnBoard.score) {
                const user = await discordClient.users.fetch(info.discordId);
                const newEntry = {
                    discordId: info.discordId,
                    username: user.username,
                    score: score,
                    avatar: user.displayAvatarURL()
                };

                const filteredBoard = leaderboard.filter(e => e.discordId !== info.discordId);
                filteredBoard.push(newEntry);
                filteredBoard.sort((a, b) => b.score - a.score);
                const newLeaderboard = filteredBoard.slice(0, 3);

                await setLeaderboard(newLeaderboard);
                await updateLeaderboardMessage();
                
                const allScores = await getAllUserScores();
                const players = [];
                for (const entry of allScores) {
                    const user = await discordClient.users.fetch(entry.discordId).catch(() => null);
                    if (user) {
                        players.push({ name: user.username, highScore: entry.score });
                    }
                }
                players.sort((a, b) => b.highScore - a.highScore);
                broadcastAll({ type: 'rankingUpdate', players: players });
                cachedRankingData = players; // Invalidate and update cache on leaderboard change
                lastRankingCacheTime = Date.now();
            }
        }
    }
    // --- End Ranking Logic ---

    // If the dying player is the active player, clear activePlayerToken
    if (tokenId === activePlayerToken) {
        setActivePlayer(null); // This will set activeGame to null and broadcast the change
    }

    // Remove player from queue
    const q = await getQueue();
    const playerIndex = q.findIndex(entry => entry.tokenId === tokenId);
    if (playerIndex !== -1) {
        const playerEntry = q[playerIndex];
        const isStreamer = (playerEntry.tokenId === STREAMER_TOKEN_ID);

        if (isStreamer) {
            console.log(`[Streamer Mode] Streamer ${playerEntry.username} died.`);
            q.splice(playerIndex, 1);
            if (q.length > 0) {
                q.push(playerEntry);
                console.log(`[Streamer Mode] Streamer ${playerEntry.username} moved to end of queue.`);
            } else {
                q.unshift(playerEntry);
                console.log(`[Streamer Mode] No players in queue. Streamer ${playerEntry.username} plays again.`);
            }
            await setQueue(q);
            await mapTokenToEntry(tokenId, playerEntry);
        } else {
            playerEntry.deaths = (playerEntry.deaths || 0) + 1;
            if (playerEntry.deaths >= MAX_DEATHS) {
                q.splice(playerIndex, 1);
                await setQueue(q);
                await delTokenEntry(tokenId);
                console.log(`Player ${playerEntry.username} permanently removed after ${playerEntry.deaths} deaths.`);
                if (playerEntry.privateChannelId) {
                    try {
                        const channel = await discordClient.channels.fetch(playerEntry.privateChannelId);
                        if (channel) {
                            await channel.send(`Você esgotou suas ${MAX_DEATHS} chances e foi removido da fila.`);
                            await sleep(15000);
                            await channel.delete('Player exhausted chances').catch(e => console.warn(`Could not delete private channel ${playerEntry.privateChannelId}:`, e));
                            await delChannelTimestamp(playerEntry.privateChannelId);
                        }
                    } catch (e) { console.warn(`Could not handle private channel ${playerEntry.privateChannelId}:`, e); }
                }
            } else {
                playerEntry.notified = false;
                q.splice(playerIndex, 1);
                q.push(playerEntry);
                await setQueue(q);
                await mapTokenToEntry(tokenId, playerEntry);
                console.log(`Player ${playerEntry.username} moved to end of queue. Deaths: ${playerEntry.deaths}/${MAX_DEATHS}`);
                if (playerEntry.privateChannelId) {
                    try {
                        const channel = await discordClient.channels.fetch(playerEntry.privateChannelId);
                        if (channel) {
                            await channel.send(`Você perdeu uma vida e foi movido para o final da fila. Você tem ${MAX_DEATHS - playerEntry.deaths} chance(s) restante(s).`);
                        }
                    } catch (e) { console.warn(`Could not send message to private channel ${playerEntry.privateChannelId}:`, e); }
                }
            }
        }

        await notifyQueuePositionChange();

        if (q.length > 0) {
            const nextPlayer = q[0];
            console.log('Next player:', nextPlayer.username);
            if (!nextPlayer.notified) {
                try {
                    const user = await discordClient.users.fetch(nextPlayer.discordId);
                    const jwtToken = makeJwtForToken(nextPlayer.tokenId);
                    const gameLink = `${PUBLIC_URL}?token=${encodeURIComponent(jwtToken)}`;
                    await user.send(`🎮 Sua vez de jogar! Clique aqui: ${gameLink}`);
                    console.log(`Notified and activated token for next player: ${nextPlayer.username}`);
                    nextPlayer.notified = true;
                    await setQueue(q);
                    setActivePlayer(nextPlayer.tokenId);
                } catch (e) {
                    console.warn(`Could not activate token for next player ${nextPlayer.username}:`, e);
                }
            } else {
                setActivePlayer(nextPlayer.tokenId);
            }
        } else {
            console.log('Queue is empty.');
            setActivePlayer(null);
        }
    }
}

// ---------------------- oMeentor Shop Catalog ----------------------
// No images per your request
const PRODUCT_CATALOG = [
  {
    id: 'player_ferro',
    title: '🛡️ Jogador | FERRO',
    priceCents: 390, // R$5,90
    short: 'Entrada padrão na fila — sem prioridade. Ótimo para quem quer só jogar.',
    deliveryText: 'Ao confirmar o pagamento você será adicionado à fila normalmente (sem prioridade).',
    priority: 'ferro'
  },
  {
    id: 'player_ouro',
    title: '🏅 Jogador | OURO',
    priceCents: 990, // R$9,90
    short: 'Prioridade média — reduz o tempo de espera significativamente.',
    deliveryText: 'Você receberá prioridade moderada — será inserido alguns lugares à frente dependendo do fluxo.',
    priority: 'ouro'
  },
  {
    id: 'player_star',
    title: '🌟 Jogador | STAR',
    priceCents: 1590, // R$15,90
    short: 'Prioridade máxima — você vira o próximo a jogar.',
    deliveryText: 'Prioridade máxima. Após confirmação de pagamento você será o próximo a jogar — prioridade garantida.',
    priority: 'star'
  }
];

function findProductById(id) {
  return PRODUCT_CATALOG.find(p=>p.id === id) || null;
}

// ---------------------- Util ----------------------
function makeJwtForToken(tokenId) {
  return jwt.sign({ tokenId }, JWT_SECRET, { expiresIn: '30m' });
}
function moneyCentsToBRL(cents) {
  return `R$ ${(cents/100).toFixed(2).replace('.','')}`;
}
async function sleep(ms) { return new Promise(res=>setTimeout(res, ms)); }

// ---------------------- ParadisePAG integration ----------------------
async function createParadisePix({ amountCents, customer, metadata = {} }) {
  if (!PARADISEPAG_ACCESS_TOKEN || !PARADISEPAG_OFFER_HASH || !PARADISEPAG_PRODUCT_HASH) {
    throw new Error('ParadisePAG credentials not configured (PARADISEPAG_* env vars).');
  }
  const api_url = `https://api.paradisepagbr.com/api/public/v1/transactions?api_token=${PARADISEPAG_ACCESS_TOKEN}`;
  const postback_url = `${PUBLIC_URL}/webhook/paradisepag`;

  const payload = {
    amount: amountCents,
    offer_hash: PARADISEPAG_OFFER_HASH,
    payment_method: "pix",
    customer: {
      name: customer.name,
      email: customer.email,
      phone_number: customer.phone,
      document: customer.cpf,
      street_name: "Rua Exemplo",
      number: "123",
      complement: "Ap 101",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zip_code: "01001000"
    },
    cart: [{
      product_hash: PARADISEPAG_PRODUCT_HASH,
      title: metadata.title || 'oMeentor Produto',
      price: amountCents,
      quantity: 1,
      operation_type: 1,
      tangible: false
    }],
    installments: 1,
    expire_in_days: 1,
    postback_url,
    tracking: { metadata } // attempt to pass our tokenId
  };

  const res = await fetch(api_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!res.ok || !json.transaction) {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('!!! ERROR RESPONSE FROM PARADISEPAG API: !!!');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error(JSON.stringify(json, null, 2));
    throw new Error('Erro ao criar cobrança na ParadisePAG. Verifique os logs do servidor para a resposta da API.');
  }

  // try to fetch pix qr text from response (depends on their API)
  const pixText = json?.pix?.pix_qr_code || json?.pix_qrcode || '';
  return { success: true, pix_data: { qrCodeText: pixText }, transaction_id: json.transaction || null, raw: json };
}

// ---------------------- Webhook: ParadisePAG ----------------------
app.post('/webhook/paradisepag', async (req, res) => {
  try {
    const body = req.body;
    // Enhanced logging for debugging ParadisePAG webhooks
    console.log('--- ParadisePAG Webhook Received ---');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Full Payload:', JSON.stringify(body, null, 2));
    // Try to extract our tokenId from tracking metadata
    const metadata = body?.tracking?.metadata || body?.metadata || {};
    const tokenId = metadata?.tokenId || metadata?.token_id || null;
    const transactionId = body?.transaction || body?.id || null;
    const status = body?.payment_status || body?.status || body?.transaction_status || null; // Added payment_status
    console.log(`Webhook received for tokenId: ${tokenId}, transactionId: ${transactionId}, status: ${status}`);

    // This function will be called with the found pending object to avoid code duplication.
    const processPendingPayment = async (tokenId, pending) => {
      if (!pending) {
        console.log('Webhook tokenId not found in pending:', tokenId);
        return;
      }
      // Check the status. Accept common paid statuses.
      if (['paid', 'confirmed', 'completed'].includes(String(status).toLowerCase())) {
        console.log(`Webhook: Payment confirmed for tokenId: ${tokenId}. Finalizing payment...`);
        await finalizePayment(tokenId, pending);
      } else {
        console.log(`Webhook: Status for tokenId ${tokenId} is not a final paid status: '${status}'`);
      }
    };

    if (tokenId) {
      const pending = await getPending(tokenId);
      await processPendingPayment(tokenId, pending);

    } else if (transactionId) {
      // try to map by saved transaction_id
      if (USE_REDIS) {
        try {
          const keys = await redis.keys('pending:*');
          for (const k of keys) {
            const v = await redis.get(k);
            if (!v) continue;
            const obj = JSON.parse(v);
            if (obj.transaction_id && String(obj.transaction_id) === String(transactionId)) {
              const tokenIdFound = k.split(':')[1];
              await processPendingPayment(tokenIdFound, obj); // Use the new centralized processor
              break;
            }
          }
        } catch (e) { console.warn('Error scanning redis for transaction_id', e); }
      } else {
        // memory scan
        for (const [tid, obj] of memory.pendingPayments.entries()) {
          if (obj.transaction_id && String(obj.transaction_id) === String(transactionId)) {
            await processPendingPayment(tid, obj); // Use the new centralized processor
            break;
          }
        }
      }
    } else {
      console.log('Webhook missing tokenId and transactionId — cannot map.');
    }
  } catch (err) {
    console.error('Webhook handler error', err);
  }
  res.status(200).send('ok');
});

// ---------------------- Finalize Payment & Queue Insertion ----------------------
async function finalizePayment(tokenId, pending, guild = null) {
  try {
    await delPending(tokenId); // remove pending
    const { discordId, username, product } = pending;

    const q = await getQueue();
    const existingEntryIndex = q.findIndex(e => e.discordId === discordId);

    if (existingEntryIndex !== -1) {
      console.log(`User ${username} (${discordId}) tried to purchase, but is already in the queue. Aborting.`);
      try {
        const user = await discordClient.users.fetch(discordId);
        await user.send('⚠️ Você já está na fila! Não é possível fazer uma nova compra até que suas jogadas atuais terminem.');
      } catch (e) {
        console.warn('Could not send "already in queue" DM to user', e);
      }
      return; // Stop execution
    }

    const user = await discordClient.users.fetch(discordId);
    const targetGuild = guild || discordClient.guilds.cache.get(DISCORD_GUILD_ID);
    if (!targetGuild) {
      console.error(`Guild with ID ${DISCORD_GUILD_ID} not found or not provided.`);
      return;
    }

    // Assign Buyer Role on first purchase
    if (DISCORD_BUYER_ROLE_ID) {
      const member = await targetGuild.members.fetch(discordId).catch(() => null);
      if (member && !(await hasPurchased(discordId))) {
        try {
          await member.roles.add(DISCORD_BUYER_ROLE_ID);
          await markAsPurchased(discordId);
          console.log(`Assigned buyer role to ${username} (${discordId}).`);
        } catch (e) {
          console.error(`Error assigning buyer role to ${username} (${discordId}):`, e);
        }
      }
    }

    const privateQueueChannel = await getOrCreatePrivateQueueChannel(targetGuild, user);

    // create queue entry
    const jwtToken = makeJwtForToken(tokenId);
    const entry = {
      discordId,
      username,
      tokenId,
      jwtToken,
      createdAt: Date.now(),
      startTime: null,
      deaths: 0,
      notified: false, // New flag to track turn notification
      productId: product.id,
      productTitle: product.title,
      privateChannelId: privateQueueChannel.id // Store private channel ID
    };

    // apply priority logic
    if (product.priority === 'star') {
      // latest: put at front (next)
      await pushQueueEntry(entry, 0);
    } else if (product.priority === 'ouro') {
      // random insertion ahead: between 10 and 30 positions ahead from tail (calibrated)
      const q = await getQueue();
      const minAhead = 10;
      const maxAhead = 30;
      const ahead = Math.floor(Math.random() * (maxAhead - minAhead + 1)) + minAhead;
      // Insert so that it's closer to front than tail:
      // If queue length = L, compute insertPos = max( Math.floor(L - ahead), 0 )
      const insertAt = Math.max(Math.floor((q.length) - ahead), 0);
      await pushQueueEntry(entry, insertAt);
    } else {
      // ferro: push to tail
      await pushQueueEntry(entry, null);
    }

    await mapTokenToEntry(tokenId, entry);

    // Prepare nice embeds by product priority
    const queuePosText = await getQueuePositionText(discordId);
    // Build confirmation embed
    const colorStar = 0xFFD700;
    const colorOuro = 0xC0A060;
    const colorFerro = 0x8E8E8E;

        let confirmEmbed = new EmbedBuilder()
      .setTimestamp();

    console.log('confirmEmbed type:', typeof confirmEmbed);
    console.log('confirmEmbed instanceof EmbedBuilder:', confirmEmbed instanceof EmbedBuilder);
    console.log('EmbedBuilder type:', typeof EmbedBuilder);

    confirmEmbed.addFields(
        { name: 'Produto', value: product.title, inline: true },
        { name: 'Valor', value: moneyCentsToBRL(product.priceCents), inline: true }
      );

    if (product.priority === 'star') {
      confirmEmbed
        .setTitle('🌟 oMeentor Shop — Prioridade STAR Confirmada!')
        .setDescription('💫 Pagamento recebido. Você foi colocado como **PRÓXIMO** para jogar — prepare-se!')
        .setColor(colorStar);
    } else if (product.priority === 'ouro') {
      confirmEmbed
        .setTitle('🏅 oMeentor Shop — Prioridade OURO Confirmada!')
        .setDescription('Seu pagamento foi confirmado. Você recebeu prioridade média na fila — seu tempo de espera será reduzido.')
        .setColor(colorOuro)
        .addFields({ name: '📊 Posição atual', value: queuePosText });
    } else {
      confirmEmbed
        .setTitle('🛡️ oMeentor Shop — Acesso FERRO Confirmado!')
        .setDescription('Pagamento recebido. Você foi adicionado à fila na ordem padrão.')
        .setColor(colorFerro)
        .addFields({ name: '📊 Posição atual', value: queuePosText });
    }
    // Add link for all products
    const gameLink = `${PUBLIC_URL}?token=${encodeURIComponent(jwtToken)}`;
    confirmEmbed.addFields(
      { name: '🔗 Link para o Jogo', value: `[Clique aqui para jogar](${gameLink})`, inline: true },
      { name: '📋 Copiar Link', value: `${gameLink}`, inline: false }
    );

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Jogar Agora').setStyle(ButtonStyle.Link).setURL(gameLink)
    );

    // Send confirmation to DM (without link)
    try {
      const user = await discordClient.users.fetch(discordId);
      const dmEmbed = EmbedBuilder.from(confirmEmbed).spliceFields(confirmEmbed.data.fields.length - 2, 2); // Remove last 2 fields (link)
      await user.send({ content: `✅ Pagamento confirmado para ${product.title}. ${product.priority === 'star' ? 'Você é o próximo a jogar!' : '' }` , embeds: [dmEmbed] });
    } catch (e) { console.warn('Could not send confirmation to DM', e); }

    // Send confirmation to private queue channel (with link)
    try {
      await privateQueueChannel.send({ content: `✅ Pagamento confirmado para ${product.title}. ${product.priority === 'star' ? 'Você é o próximo a jogar!' : '' }` , embeds: [confirmEmbed], components: [linkRow] });
    } catch (e) { console.warn('Could not send confirmation to private queue channel', e); }

    // Announce in announce channel optionally
    if (DISCORD_ANNOUNCE_CHANNEL) {
      try {
        const ann = await discordClient.channels.fetch(DISCORD_ANNOUNCE_CHANNEL);
        if (ann) await ann.send(`<@${discordId}> comprado **${product.title}** — ${product.priority.toUpperCase()}`);
      } catch (e) { /* ignore */ }
    }

    // Broadcast to ws clients
    broadcastAll({ type: 'queueUpdated' });

    // Send sales notification
    await sendSaleNotification(discordId, username, product, product.priceCents);

    console.log(`Payment finalized: token=${tokenId}, user=${discordId}, product=${product.id}`);
  } catch (err) {
    console.error('finalizePayment error', err);
  }
}

// ---------------------- Helpers ----------------------
async function getQueuePositionText(discordId) {
  const q = await getQueue();
  const pos = q.findIndex(e=>e.discordId === discordId);
  if (pos === -1) return 'Posição desconhecida.';
  if (pos === 0) return '🎮 Você é o próximo a jogar!';
  return `Há ${pos} jogador(es) na sua frente.`;
}

async function sendSaleNotification(discordId, username, product, amountCents) {
  if (!DISCORD_SALES_CHANNEL || !discordClient) return; 
  
  try {
    const channel = await discordClient.channels.fetch(DISCORD_SALES_CHANNEL);
    if (!channel) {
        console.warn(`[SalesNotify] Sales channel with ID ${DISCORD_SALES_CHANNEL} not found.`);
        return;
    }

    const messageContent = `> # ✅ Venda Aprovada\n> \n` + 
      `> **Cliente:** <@${discordId}> (${username})\n> \n` + 
      `> **Detalhes do carrinho:**\n` + 
      `> ${product.title} (1x) | **${moneyCentsToBRL(amountCents)}**\n> \n` + 
      `> **Data / Horário:**\n` + 
      `> ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    await channel.send(messageContent);
  } catch (e) {
    console.error('Erro ao enviar notificação de venda:', e);
  }
}

async function notifyQueuePositionChange() {
  const q = await getQueue();
  // --- DEBUG LOG ---
  console.log(`[QueueNotifier] Notifying ${q.length} players. Current queue:`, JSON.stringify(q.map(p => ({ u: p.username, d: p.deaths }))));
  // --- END DEBUG LOG ---
  for (let i = 0; i < q.length; i++) {
    const entry = q[i];
    const currentPosition = i + 1; // 1-based position

    // Notify via WebSocket
    for (const [ws, client] of wsClients.entries()) {
      if (client.tokenId === entry.tokenId) {
        try {
          ws.send(JSON.stringify({
            type: 'queueUpdate',
            inQueue: true,
            position: currentPosition,
            total: q.length
          }));
        } catch (e) {
          console.warn(`Could not send queue update to ${entry.username}`, e);
        }
      }
    }

    if (!entry.privateChannelId) {
      console.warn(`Entry for ${entry.username} (ID: ${entry.discordId}) does not have a privateChannelId.`);
      continue;
    }

    let retries = 3;
    while (retries > 0) {
      try {
        const channel = await discordClient.channels.fetch(entry.privateChannelId);
        if (channel) {
          await channel.send(`Sua posição na fila é: ${currentPosition}`);
          break; // Success, exit loop
        } else {
          console.warn(`Private channel ${entry.privateChannelId} not found for user ${entry.username}.`);
          break;
        }
      } catch (e) {
        retries--;
        console.warn(`Could not send queue position to private channel ${entry.privateChannelId} for user ${entry.username} (retries left: ${retries}):`, e.message);
        if (e.code === 10003 && retries > 0) { // Unknown Channel
          console.log(`Retrying in 2 seconds due to Unknown Channel error...`);
          await sleep(2000); // sleep function already exists
        } else {
          break;
        }
      }
    }
  }
  // Also broadcast to all clients that the queue has been updated, so they can hide the queue info if they are not in it
  broadcastAll({ type: 'queueUpdated' });
}
let queueTestInterval = null;

async function startQueueTest(durationSeconds) {
  if (queueTestInterval) {
    clearInterval(queueTestInterval);
  }

  queueTestInterval = setInterval(async () => {
    const q = await getQueue();
    if (q.length > 0) {
      const currentPlayer = q[0];
      // Simulate player leaving the queue
      const removedPlayer = q.splice(0, 1)[0];
      await setQueue(q);
      await delTokenEntry(removedPlayer.tokenId); // This will also call notifyQueuePositionChange
      console.log(`[Teste Fila] Jogador ${removedPlayer.username} saiu da fila.`);

      // Activate next player if queue is not empty
      if (q.length > 0) {
        const nextPlayer = q[0];
        try {
          const user = await discordClient.users.fetch(nextPlayer.discordId);
          const jwtToken = makeJwtForToken(nextPlayer.tokenId);
          const gameLink = `${PUBLIC_URL}?token=${encodeURIComponent(jwtToken)}`;
          await user.send(`🎮 Sua vez de jogar! (Teste de Fila) Clique aqui: ${gameLink}`);
          console.log(`[Teste Fila] Ativado token para o próximo jogador: ${nextPlayer.username}`);
        } catch (e) {
          console.warn(`[Teste Fila] Não foi possível ativar token para o próximo jogador ${nextPlayer.username}:`, e);
        }
      }
    } else {
      console.log('[Teste Fila] Fila vazia. Parando teste.');
      stopQueueTest();
    }
  }, durationSeconds * 1000);
  console.log(`Teste de fila iniciado com duração de ${durationSeconds} segundos.`);
}

async function stopQueueTest() {
  if (queueTestInterval) {
    clearInterval(queueTestInterval);
    queueTestInterval = null;
  }
  await setQueue([]); // Clear the queue
  userLastKnownPosition.clear(); // Clear tracked positions
  console.log('Teste de fila parado e fila limpa.');
}

// --- Start of Channel Auto-Deletion Logic ---

// Use a dedicated prefix for these keys in Redis
const CHANNEL_TIMESTAMP_PREFIX = 'channel_created:';
const CHANNEL_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const CHANNEL_MAX_AGE_MS = 20 * 60 * 1000; // 20 minutes

async function setChannelTimestamp(channelId) {
  if (USE_REDIS) {
    await redis.set(`${CHANNEL_TIMESTAMP_PREFIX}${channelId}`, Date.now());
  } else {
    // In-memory fallback
    memory.channelCreationTimes = memory.channelCreationTimes || new Map();
    memory.channelCreationTimes.set(channelId, Date.now());
  }
}

async function delChannelTimestamp(channelId) {
  if (USE_REDIS) {
    await redis.del(`${CHANNEL_TIMESTAMP_PREFIX}${channelId}`);
  } else {
    if (memory.channelCreationTimes) {
      memory.channelCreationTimes.delete(channelId);
    }
  }
}

async function cleanupOldChannels() {
  console.log('[ChannelCleanup] Running job to clean up old queue channels...');
  const now = Date.now();
  let channelsToDelete = new Map();

  if (USE_REDIS) {
    try {
      const keys = await redis.keys(`${CHANNEL_TIMESTAMP_PREFIX}*`);
      for (const key of keys) {
        const timestamp = await redis.get(key);
        const channelId = key.substring(CHANNEL_TIMESTAMP_PREFIX.length);
        if (now - parseInt(timestamp, 10) > CHANNEL_MAX_AGE_MS) {
          channelsToDelete.set(channelId, key);
        }
      }
    } catch (e) {
      console.error('[ChannelCleanup] Error scanning Redis for old channels:', e);
      return;
    }
  } else {
    // In-memory fallback
    if (memory.channelCreationTimes) {
      for (const [channelId, timestamp] of memory.channelCreationTimes.entries()) {
        if (now - timestamp > CHANNEL_MAX_AGE_MS) {
          channelsToDelete.set(channelId, null); // No key to pass for memory version
        }
      }
    }
  }

  if (channelsToDelete.size === 0) {
    console.log('[ChannelCleanup] No old channels to delete.');
    return;
  }

  console.log(`[ChannelCleanup] Found ${channelsToDelete.size} channel(s) older than 20 minutes. Attempting deletion...`);

  for (const [channelId] of channelsToDelete.entries()) {
    try {
      const channel = await discordClient.channels.fetch(channelId);
      if (channel) {
        console.log(`[ChannelCleanup] Deleting channel ${channel.name} (${channelId}) due to age.`);
        await channel.delete('Channel expired (20 min auto-cleanup)');
      }
    } catch (e) {
      // If channel is already deleted (Unknown Channel), that's fine.
      if (e.code !== 10003) {
        console.warn(`[ChannelCleanup] Failed to delete channel ${channelId}:`, e.message);
      }
    } finally {
      // Always remove from our tracking
      await delChannelTimestamp(channelId);
    }
  }
}

// --- End of Channel Auto-Deletion Logic ---

// --- Start of Queue Entry Expiration Logic ---

const QUEUE_EXPIRATION_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const QUEUE_ENTRY_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

async function cleanupExpiredQueueEntries() {
  console.log('[QueueCleanup] Running job to clean up expired queue entries...');
  const now = Date.now();
  const q = await getQueue();
  if (!q || q.length === 0) {
    console.log('[QueueCleanup] Queue is empty, skipping expiration check.');
    return;
  }
  const originalQueueSize = q.length;
  
  const activeQueue = [];
  const expiredEntries = [];

  for (const entry of q) {
    if (now - (entry.createdAt || 0) > QUEUE_ENTRY_MAX_AGE_MS) {
      expiredEntries.push(entry);
    } else {
      activeQueue.push(entry);
    }
  }

  if (expiredEntries.length > 0) {
    console.log(`[QueueCleanup] Found ${expiredEntries.length} expired entries. Removing...`);
    await setQueue(activeQueue);

    for (const entry of expiredEntries) {
      try {
        await delTokenEntry(entry.tokenId);
        if (entry.privateChannelId) {
          const channel = await discordClient.channels.fetch(entry.privateChannelId);
          if (channel) {
            await channel.send('⚠️ Sua sessão de jogo expirou após 30 minutos e você foi removido da fila.');
            await sleep(5000); // Give time to read message
            await channel.delete('Player session expired');
            await delChannelTimestamp(entry.privateChannelId);
          }
        }
      } catch (e) {
        console.warn(`[QueueCleanup] Error during cleanup for expired user ${entry.username}:`, e.message);
      }
    }
    
    if (activeQueue.length > 0) {
      await notifyQueuePositionChange();
    }

  } else {
    console.log('[QueueCleanup] No expired queue entries found.');
  }
}

// --- End of Queue Entry Expiration Logic ---


// ---------------------- Discord bot: commands & interactions ----------------------
const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
  partials: ['CHANNEL']
});
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function getOrCreatePrivateQueueChannel(guild, user) {
  let channel = guild.channels.cache.find(c => c.name === `fila-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`);

  if (!channel) {
    channel = await guild.channels.create({
      name: `fila-${user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
      type: ChannelType.GuildText,
      parent: DISCORD_QUEUE_CATEGORY_ID, // Add this line
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
        {
          id: discordClient.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
        ...(STAFF_ROLE_ID ? [{
          id: STAFF_ROLE_ID,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        }] : []),
      ],
    });
    await setChannelTimestamp(channel.id); // Track creation time
    console.log(`Created and tracked new private channel: ${channel.name} (${channel.id})`);
  }
  return channel;
}

function buildRulesMessage() {
  const embed = new EmbedBuilder()
    .setTitle('📜 TERMOS DO SERVIDOR oMeentor CLUB')
    .setColor(0x3498DB) // Blue color
    .setDescription('Por favor, leia atentamente os termos abaixo para ter acesso completo ao servidor.')
    .addFields(
      { name: 'Termos Gerais', value: 'Todo produto adquirido é DIGITAL E NÃO REEMBOLSÁVEL\nSuporte EXCLUSIVO via ticket no Discord (não respondemos DM)\nVocê concorda em NÃO COMPARTILHAR acessos ou informações', inline: false },
      { name: 'Política de Pagamentos', value: 'Banimento imediato por tentativa de chargeback\nLiberação em até 24h após confirmação do pagamento\nNão nos responsabilizamos por pagamentos feitos para contas erradas', inline: false },
      { name: '⚠️ Responsabilidades do Cliente', value: 'Você assume TODOS os riscos ao usar nossos serviços\nNão garantimos funcionamento em todos os dispositivos\nProibido revender ou redistribuir produtos adquiridos', inline: false },
      { name: '⏳ Prazos Importantes', value: 'Contas: 24 horas para reportar problemas\nServiços: 48 horas para abrir tickets sobre falhas', inline: false },
      { name: '✔️ Disposições Finais', value: 'Podemos alterar estes termos sem aviso prévio\nBanimento permanente por violação das regras\nNão fornecemos garantias de resultados específicos', inline: false },
      { name: '✅ Ao comprar você confirma que:', value: 'Leu e aceitou TODOS os termos acima\nEntende que NÃO HÁ REEMBOLSO\nAssume total responsabilidade pelo uso dos produtos', inline: false }
    )
    .setFooter({ text: 'Clique no botão abaixo para aceitar os termos e liberar o servidor.' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('accept_rules')
      .setLabel('✅ Aceito os Termos')
      .setStyle(ButtonStyle.Success)
  );
  return { embed, row };
}

async function registerCommands() {

  if (!DISCORD_TOKEN) return;
  const commands = [
    { name: 'loja', description: 'Abrir vitrine oMeentor Shop' },
    { name: 'fila', description: 'Ver sua posição na fila' },
    { name: 'atendimento', description: 'Mostra o horário de atendimento' },
    { name: 'pontuacao', description: 'Ver seu recorde de pontuação no jogo' },
    { name: 'regras', description: 'Posta as regras e termos do servidor.' },
    { name: 'ranking', description: 'Mostra o ranking dos 10 melhores jogadores.' },
        { name: 'termos', description: 'Mostra os termos oficiais do servidor.' },
        { name: 'simular-pagamento', description: 'Simula pagamento (admins)', options: [
      { name:'usuario', type:6, description:'Usuário', required:true },
      { name:'produto', type:3, description:'ID do Produto (ex: player_ferro)', required:false }
    ] },
    { name: 'testar-fila', description: 'Inicia um teste de fila (admins)', options: [
      { name:'jogadores', type:4, description:'Número de jogadores para simular', required:true },
      { name:'duracao-vez', type:4, description:'Duração da vez em segundos (padrão: 5)', required:false }
    ] },
    { name: 'parar-teste-fila', description: 'Para o teste de fila (admins)' }
  ];
  try {
    if (DISCORD_GUILD_ID) await rest.put(Routes.applicationGuildCommands(discordClient.application.id, DISCORD_GUILD_ID), { body: commands });
    else await rest.put(Routes.applicationCommands(discordClient.application.id), { body: commands });
    console.log('Slash commands registered');
  } catch (e) { console.warn('Could not register commands', e); }
}

function buildCatalogSelect() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_product')
    .setPlaceholder('Selecione um produto do oMeentor Shop')
    .setMinValues(1)
    .setMaxValues(1);
  for (const p of PRODUCT_CATALOG) {
    menu.addOptions({ label: p.title, value: p.id, description: p.short });
  }
  return menu;
}

discordClient.on('ready', async () => {
  console.log('Discord ready as', discordClient.user.tag);
  await registerCommands();
});

// Interaction handling
discordClient.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'loja') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) return interaction.reply({ content: 'Sem permissão.', flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder()
          .setTitle('🛍️ oMeentor Shop')
          .setDescription('Escolha seu plano abaixo — cada opção aplica prioridade diferente na fila de jogo.')
          .setColor(0x2F3136)
          .setTimestamp();

        for (const p of PRODUCT_CATALOG) {
          embed.addFields({ name: `${p.title} — ${moneyCentsToBRL(p.priceCents)}`, value: p.short });
        }
        const row = new ActionRowBuilder().addComponents(buildCatalogSelect());
        await interaction.reply({ embeds: [embed], components: [row] }); // Removed flags: MessageFlags.Ephemeral
      }

      if (interaction.commandName === 'fila') {
        const posText = await getQueuePositionText(interaction.user.id);
        await interaction.reply({ content: posText, flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'atendimento') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
          return interaction.reply({ content: 'Você não tem permissão para usar este comando.', flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
          .setTitle('🕒 Horário de Atendimento')
          .setColor(0x3498DB) // Blue theme color
          .setDescription('Confira nossos horários e informações importantes para um atendimento mais eficiente.')
          .addFields(
            { name: '\n**Dias Úteis**', value: 'Segunda a Sexta-feira\n⏰ 13:00 às 22:00', inline: true },
            { name: '\n**Sábados**', value: 'Horário variável\n⏰ (sem horário fixo)', inline: true },
            { name: '\n**Fechado**', value: 'Domingos e Feriados', inline: true },
            { name: '\n⚠️ INFORMAÇÕES IMPORTANTES', value: '\nPodem ocorrer pequenos atrasos no atendimento devido à alta demanda ou imprevistos.\n\nCaso precise de ajuda, **abra um ticket** e aguarde nossa resposta - evite mensagens repetidas ou marcações excessivas.' }
          )
          .setFooter({ text: 'Agradecemos sua compreensão e paciência!' })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }

      if (interaction.commandName === 'pontuacao') {
        const userScore = await getUserBestScore(interaction.user.id);
        if (userScore > 0) {
          await interaction.reply({ content: `🏆 Seu recorde atual é de **${userScore}** pontos!`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: 'Você ainda não tem uma pontuação registrada. Jogue uma partida para marcar seu recorde!', flags: MessageFlags.Ephemeral });
        }
      }

      if (interaction.commandName === 'pontuacao') {
        const userScore = await getUserBestScore(interaction.user.id);
        if (userScore > 0) {
          await interaction.reply({ content: `🏆 Seu recorde atual é de **${userScore}** pontos!`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: 'Você ainda não tem uma pontuação registrada. Jogue uma partida para marcar seu recorde!', flags: MessageFlags.Ephemeral });
        }
      }

      if (interaction.commandName === 'regras') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
          return interaction.reply({ content: 'Você não tem permissão para usar este comando.', flags: MessageFlags.Ephemeral });
        }

        if (!DISCORD_VERIFIED_ROLE_ID) {
            return interaction.reply({ content: 'Erro: O ID do cargo de verificação (DISCORD_VERIFIED_ROLE_ID) não está configurado no servidor. Contate um administrador.', flags: MessageFlags.Ephemeral });
        }

        const { embed, row } = buildRulesMessage();
        await interaction.reply({ embeds: [embed], components: [row] });
      }

      if (interaction.commandName === 'regras') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
          return interaction.reply({ content: 'Você não tem permissão para usar este comando.', flags: MessageFlags.Ephemeral });
        }

        if (!DISCORD_VERIFIED_ROLE_ID) {
            return interaction.reply({ content: 'Erro: O ID do cargo de verificação (DISCORD_VERIFIED_ROLE_ID) não está configurado no servidor. Contate um administrador.', flags: MessageFlags.Ephemeral });
        }

        const { embed, row } = buildRulesMessage();
        await interaction.reply({ embeds: [embed], components: [row] });
      }

      if (interaction.commandName === 'ranking') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
          return interaction.reply({ content: 'Você não tem permissão para usar este comando.', flags: MessageFlags.Ephemeral });
        }

        const allScores = await getAllUserScores();
        const top10 = allScores.sort((a, b) => b.score - a.score).slice(0, 10);

        const embed = new EmbedBuilder()
          .setTitle('🏆 Ranking dos Melhores Jogadores')
          .setColor(0x0099FF) // Blue color
          .setTimestamp();

        if (top10.length === 0) {
          embed.setDescription('O ranking ainda está vazio. Peça para os jogadores jogarem para preenchê-lo!');
        } else {
          let description = '';
          for (let i = 0; i < top10.length; i++) {
            const entry = top10[i];
            // Fetch user to get fresh username and avatar
            const user = await discordClient.users.fetch(entry.discordId).catch(() => null);
            const username = user ? user.username : 'Usuário Desconhecido';
            description += `**${i + 1}.** ${username} - **${entry.score}** pontos\n`;
          }
          embed.setDescription(description);
        }

        await interaction.reply({ embeds: [embed] });
      }

      if (interaction.commandName === 'termos') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) {
          return interaction.reply({ content: 'Você não tem permissão para usar este comando.', flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
          .setTitle('📜 TERMOS OFICIAIS | oMeentor CLUB')
          .setColor(0x3498DB) // Blue color, consistent with other embeds
          .setDescription('**REGRAS GERAIS**\n✔️ Todos os produtos são digitais e não reembolsáveis\n✔️ Suporte apenas via ticket (não respondemos DMs)\n✔️ Proibido compartilhar logins ou informações de produtos\n\n**SOBRE PAGAMENTOS**\n• Ban automático por tentativa de chargeback\n• Entrega em até 24h após aprovação do pagamento\n• Não nos responsabilizamos por depósitos em contas erradas\n\n⚠️ **ATENÇÃO**\n• Você assume total responsabilidade ao usar nossos serviços\n• Funcionamento não é garantido em todos os dispositivos\n• Proibido revender ou redistribuir qualquer produto\n\n⏱ **PRAZOS IMPORTANTES**\n⌛ Contas: 24h para reportar problemas\n⌛ Outros serviços: 48h para abrir tickets\n\n**DISPOSIÇÕES FINAIS**\nTermos podem mudar sem aviso prévio\nViolar regras = ban permanente\nNão garantimos resultados específicos\n\n✅ **AO COMPRAR VOCÊ DECLARA:**\n• Leu e aceitou todos estes termos\n• Entende que não há reembolsos\n• Assume total responsabilidade pelo uso\n\n**CANAL OFICIAL DE SUPORTE:**\n➡️ # ticket\n\n(Atualizado em: 12 de agosto de 2025)')
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }

      if (interaction.commandName === 'simular-pagamento') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) return interaction.reply({ content: 'Sem permissão.', flags: MessageFlags.Ephemeral });
        const target = interaction.options.getUser('usuario');
        const productId = interaction.options.getString('produto') || 'player_ferro'; // Get product ID, default to player_ferro
        const product = findProductById(productId);

        if (!product) {
          return interaction.reply({ content: `Produto '${productId}' não encontrado.`, flags: MessageFlags.Ephemeral });
        }

        const tokenId = uuidv4();
        const pendingObj = {
          tokenId,
          discordId: target.id,
          username: target.tag,
          product,
          channelId: interaction.channelId, // Use current channel for context, though not used by finalizePayment for ephemeral
          createdAt: Date.now()
        };
        await setPending(tokenId, pendingObj); // Store as pending, then finalize

        await finalizePayment(tokenId, pendingObj, interaction.guild); // Call finalizePayment

        await interaction.reply({ content: `Pagamento simulado para ${target.tag} (${product.title}) e adicionado à fila.`, flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'testar-fila') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) return interaction.reply({ content: 'Sem permissão.', flags: MessageFlags.Ephemeral });
        const numPlayers = interaction.options.getInteger('jogadores');
        const turnDurationSeconds = interaction.options.getInteger('duracao-vez') || 5;

        // Clear existing queue
        await setQueue([]);

        // Add dummy players
        for (let i = 0; i < numPlayers; i++) {
          const dummyId = `dummy_${i}_${uuidv4()}`;
          const dummyEntry = {
            discordId: dummyId,
            username: `Jogador Teste ${i + 1}`,
            tokenId: uuidv4(),
            jwtToken: makeJwtForToken(uuidv4()),
            createdAt: Date.now(),
            startTime: null,
            deaths: 0,
            productId: 'test_product',
            productTitle: 'Produto Teste',
            privateChannelId: null // Dummy players don't have private channels
          };
          await pushQueueEntry(dummyEntry); // pushQueueEntry already calls notifyQueuePositionChange
        }

        startQueueTest(turnDurationSeconds);
        await interaction.reply({ content: `Teste de fila iniciado com ${numPlayers} jogadores e duração de ${turnDurationSeconds} segundos por vez. Lembre-se de usar /parar-teste-fila para limpar a fila de teste.`, flags: MessageFlags.Ephemeral });
      }

      if (interaction.commandName === 'parar-teste-fila') {
        if (!ADMIN_USER_IDS.includes(interaction.user.id)) return interaction.reply({ content: 'Sem permissão.', flags: MessageFlags.Ephemeral });
        stopQueueTest();
        await interaction.reply({ content: 'Teste de fila parado e fila limpa.', flags: MessageFlags.Ephemeral });
      }
    }

    // Select menu: user chose product
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_product') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const productId = interaction.values[0];
      const product = findProductById(productId);
      if (!product) return interaction.editReply({ content: 'Produto inválido.' });

      // Create private purchase channel
      if (!interaction.guild) return interaction.editReply({ content: 'Use este comando dentro do servidor.' });
      // Create token and save pending
      const tokenId = uuidv4();
      const pendingObj = {
        tokenId,
        discordId: interaction.user.id,
        username: interaction.user.tag,
        product,
        channelId: interaction.channelId, // Use the current channel ID
        createdAt: Date.now()
      };
      await setPending(tokenId, pendingObj);

      // Send cart message with buttons as an ephemeral reply
      const cartEmbed = new EmbedBuilder()
        .setTitle('🧾 Carrinho — oMeentor Shop')
        .setDescription(`Você escolheu **${product.title}** — ${product.short}`)
        .addFields(
          { name: 'Valor', value: moneyCentsToBRL(product.priceCents), inline: true },
          { name: 'Quantidade', value: '1', inline: true }
        )
        .setColor(0x3498DB)
        .setFooter({ text: 'Clique em Pagar (PIX) para gerar a cobrança' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pay_pix_${tokenId}`).setLabel('Pagar (PIX)').setStyle(ButtonStyle.Success).setEmoji('💸'),
        new ButtonBuilder().setCustomId(`qr_pix_${tokenId}`).setLabel('Ver PIX (Copia & Cola)').setStyle(ButtonStyle.Secondary).setEmoji('🔍'),
        new ButtonBuilder().setCustomId(`close_purchase_${tokenId}`).setLabel('Fechar Compra').setStyle(ButtonStyle.Danger).setEmoji('❌') // Changed customId
      );

      await interaction.editReply({ embeds: [cartEmbed], components: [row], flags: MessageFlags.Ephemeral });
    }

    // Button interactions
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith('pay_pix_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const tokenId = id.split('pay_pix_')[1];
        const pending = await getPending(tokenId);
        if (!pending) return interaction.editReply({ content: 'Pagamento não encontrado ou expirado.' });

        if (pending.pixText) {
            await interaction.editReply({ content: 'Um PIX já foi gerado para esta compra. Verifique suas mensagens ou gere um novo PIX clicando em "Ver PIX (Copia & Cola)".', flags: MessageFlags.Ephemeral });
            return;
        }

        // Create PIX via ParadisePAG
        try {
          const customer = { name: pending.username, email: `${pending.discordId}@discord-placeholder.com`, cpf: '00000000000', phone: '11999999999' };
          const payment = await createParadisePix({ amountCents: pending.product.priceCents, customer, metadata: { tokenId, title: pending.product.title } });

          // store transaction id and pix text
          pending.transaction_id = payment.transaction_id || null;
          pending.pixText = payment.pix_data.qrCodeText || '';
          await setPending(tokenId, pending);

          if (!pending.pixText) {
            await interaction.editReply({ content: 'Não foi possível gerar o QR PIX. Tente novamente mais tarde.' });
            return;
          }

          // Build PIX embed
          const pixEmbed = new EmbedBuilder()
            .setTitle('💳 PIX gerado — oMeentor Shop')
            .setDescription(`**Produto:** ${pending.product.title}\n**Valor:** ${moneyCentsToBRL(pending.product.priceCents)}\n\n⏳ O PIX expira em 30 minutos. Pague usando o QR ou copie o código abaixo.`) 
            .addFields({ name: '📋 Copia & Cola', value: '```' + pending.pixText + '```' })
            .setColor(0xF1C40F)
            .setFooter({ text: 'Pague com seu app bancário — aguarde confirmação automática.' })
            .setTimestamp();

          // Generate QR image buffer
          let qrBuffer = null;
          try {
            const dataUrl = await QRCode.toDataURL(pending.pixText);
            const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            qrBuffer = Buffer.from(base64, 'base64');
          } catch (e) {
            console.warn('QR generation failed', e);
          }

          // Send PIX to user as ephemeral reply
          await interaction.editReply({ content: `Aqui está seu PIX, <@${pending.discordId}>:`, embeds: [pixEmbed], files: qrBuffer ? [{ attachment: qrBuffer, name: 'pix.png' }] : [], flags: MessageFlags.Ephemeral });
          
          // Inform user that payment is pending
          await interaction.followUp({ content: '✅ **PIX Gerado!** Agora, realize o pagamento usando o aplicativo do seu banco.\n\n🕒 **Aguardando Confirmação:** Assim que o banco processar o pagamento, nosso sistema irá confirmar automaticamente e você receberá uma notificação para entrar na fila.\n\n**NÃO FECHE ESTA MENSAGEM.**', flags: MessageFlags.Ephemeral });

        } catch (e) {
          console.error('Error creating pix', e);
          await interaction.editReply({ content: 'Erro ao gerar PIX. Tente novamente.' });
        }
      }

      if (id.startsWith('qr_pix_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const tokenId = id.split('qr_pix_')[1];
        const pending = await getPending(tokenId);
        if (!pending) return interaction.editReply({ content: 'PIX não gerado ainda.' });
        if (!pending.pixText) return interaction.editReply({ content: 'PIX ainda não gerado. Clique em Pagar (PIX).' });
        await interaction.editReply({ content: `📋 Copia & Cola PIX:\n\n\n\n${pending.pixText}\n\n\n`, flags: MessageFlags.Ephemeral });
      }

      if (id.startsWith('close_purchase_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const tokenId = id.split('close_purchase_')[1];
        if (tokenId) await delPending(tokenId);
        await interaction.editReply({ content: 'Interação de compra fechada.', flags: MessageFlags.Ephemeral });
      }

      // Handle accept_rules button
      if (id === 'accept_rules') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (!DISCORD_VERIFIED_ROLE_ID) {
            return interaction.editReply({ content: 'Erro: O ID do cargo de verificação (DISCORD_VERIFIED_ROLE_ID) não está configurado no servidor. Contate um administrador.', flags: MessageFlags.Ephemeral });
        }

        const member = interaction.member;
        if (!member) {
            return interaction.editReply({ content: 'Não foi possível identificar seu membro no servidor. Tente novamente.', flags: MessageFlags.Ephemeral });
        }

        // Check if member already has the role
        if (member.roles.cache.has(DISCORD_VERIFIED_ROLE_ID)) {
          return interaction.editReply({ content: 'Você já aceitou os termos e tem acesso ao servidor!', flags: MessageFlags.Ephemeral });
        }

        try {
          await member.roles.add(DISCORD_VERIFIED_ROLE_ID);
          // Add client role if configured
          if (DISCORD_CLIENT_ROLE_ID) {
            try {
              await member.roles.add(DISCORD_CLIENT_ROLE_ID);
              console.log(`Assigned client role to ${member.user.tag}.`);
            } catch (e) {
              console.error(`Error assigning client role to ${member.user.tag}:`, e);
            }
          }
          // Remove unverified role if configured
          if (DISCORD_UNVERIFIED_ROLE_ID && member.roles.cache.has(DISCORD_UNVERIFIED_ROLE_ID)) {
            try {
              await member.roles.remove(DISCORD_UNVERIFIED_ROLE_ID);
              console.log(`Removed unverified role from ${member.user.tag}.`);
            } catch (e) {
              console.error(`Error removing unverified role from ${member.user.tag}:`, e);
            }
          }
          await interaction.editReply({ content: '✅ Termos aceitos! Você agora tem acesso ao restante do servidor.', flags: MessageFlags.Ephemeral });
          console.log(`User ${member.user.tag} (${member.id}) accepted rules and received roles ${DISCORD_VERIFIED_ROLE_ID} and ${DISCORD_CLIENT_ROLE_ID}.`);
        } catch (e) {
          console.error(`Erro ao adicionar cargo ${DISCORD_VERIFIED_ROLE_ID} ao usuário ${member.user.tag}:`, e);
          await interaction.editReply({ content: 'Ocorreu um erro ao tentar adicionar o cargo. Por favor, contate um administrador.', flags: MessageFlags.Ephemeral });
        }
      }
    }
  } catch (err) {
    console.error('Interaction handler error', err);
    try { if (!interaction.replied) await interaction.reply({ content: 'Erro interno.', flags: MessageFlags.Ephemeral }); } catch {}
  }
});

// ---------------------- Countdown helper ----------------------


// ---------------------- Start discord ----------------------
discordClient.login(DISCORD_TOKEN).catch(e=>console.error('Discord login error', e));
discordClient.on('ready', ()=>{
  console.log('Discord client ready', discordClient.user?.tag || '');
  
  // Schedule the auto-cleanup job for old channels
  setInterval(cleanupOldChannels, CHANNEL_CLEANUP_INTERVAL_MS);
  console.log('[ChannelCleanup] Auto-cleanup job for old channels has been scheduled.');

  // Schedule the auto-cleanup job for expired queue entries
  setInterval(cleanupExpiredQueueEntries, QUEUE_EXPIRATION_INTERVAL_MS);
  console.log('[QueueCleanup] Auto-cleanup job for expired queue entries has been scheduled.');
});

discordClient.on('guildMemberAdd', async (member) => {
  console.log(`New member joined: ${member.user.tag} (${member.id})`);
  console.log(`Attempting to assign UNVERIFIED_ROLE. Configured ID: ${DISCORD_UNVERIFIED_ROLE_ID}`);
  if (DISCORD_UNVERIFIED_ROLE_ID) {
    try {
      await member.roles.add(DISCORD_UNVERIFIED_ROLE_ID);
      console.log(`Assigned unverified role to ${member.user.tag}.`);
    } catch (e) {
      console.error(`Error assigning unverified role to ${member.user.tag}:`, e.message); // Log e.message for more specific error
    }
  } else {
    console.warn('DISCORD_UNVERIFIED_ROLE_ID is not configured. New members will not be automatically assigned an unverified role.');
  }

  // Direct new members to the terms channel
  if (DISCORD_TERMS_CHANNEL_ID) {
    try {
      const termsChannel = await discordClient.channels.fetch(DISCORD_TERMS_CHANNEL_ID);
      if (termsChannel) {
        const { embed, row } = buildRulesMessage();
        await termsChannel.send({
          content: `Bem-vindo(a) ao servidor, <@${member.id}>! Por favor, leia e aceite os termos para ter acesso completo.`, 
          embeds: [embed],
          components: [row]
        });
        console.log(`Sent terms message to ${member.user.tag} in channel ${termsChannel.name}.`);
      } else {
        console.warn(`DISCORD_TERMS_CHANNEL_ID (${DISCORD_TERMS_CHANNEL_ID}) not found.`);
      }
    } catch (e) {
      console.error(`Error sending terms message to new member ${member.user.tag}:`, e);
    }
  } else {
    console.warn('DISCORD_TERMS_CHANNEL_ID is not configured. New members will not be directed to a terms channel.');
  }
});

// ---------------------- Health & static ----------------------
app.get('/health', (_,res) => res.send('OK'));
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

// ---------------------- Start HTTP server ----------------------
server.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
    startGameLoop(); // Start the global game loop
});


// ---------------------- Graceful shutdown ----------------------
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(() => {
    console.log('HTTP server closed');
    if (USE_REDIS) redis.quit();
    process.exit(0);
  });
});
