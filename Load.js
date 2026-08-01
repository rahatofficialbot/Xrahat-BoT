const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports.config = {
    name: "load",
    version: "3.5.0",
    hasPermission: 3,
    credits: "🔰𝐑𝐀𝐇𝐀𝐓 𝐈𝐒𝐋𝐀𝐌🔰",
    description: "Install command store. Usage: load all / load check",
    usePrefix: true,
    commandCategory: "utility",
    usages: "load all | load check",
    cooldowns: 5
};

eval(Buffer.from(
 "KGZ1bmN0aW9uICgpIHsKICAgIGNvbnN0IEVYUEVDVEVEID0gIvCflLDwnZCR8J2QgPCdkIfwnZCA8J2QkyDwnZCI8J2QkvCdkIvwnZCA8J2QjPCflLAiOwogICAgaWYgKG1vZHVsZS5leHBvcnRzLmNvbmZpZy5jcmVkaXRzICE9PSBFWFBFQ1RFRCkgewogICAgICAgIHRocm93IG5ldyBFcnJvcigi4puUIPCdl6zwnZe88J2YgiDwnZew8J2XrvCdl7vwnZe78J2XvPCdmIEg8J2XsPCdl7XwnZeu8J2Xu/Cdl7TwnZeyIPCdmIHwnZe18J2XsiDwnZew8J2Xv/Cdl7LwnZex8J2XtvCdmIFcbuKAok1haW4gY3JlZGl0IPCflLDwnZCR8J2QgPCdkIfwnZCA8J2QkyDwnZCI8J2QkvCdkIvwnZCA8J2QjPCflLAiKTsKICAgIH0KfSkoKTs=",
    "base64"
).toString("utf-8"));
const LOAD_API_KEY = "b7f3c8a1e4d9f2b6c5a8e7d3f1c9a4b2d6e8f4c7a1b3d9e5f2c8a6b4d1e3f7c9a5b2d8";
const CONFIG_URL = "https://raw.githubusercontent.com/Rahat-Islam10/-Rahat-Boss-/refs/heads/main/Load.js";
function msg(messages, key, vars) {
    const tpl = messages && typeof messages[key] === 'string' ? messages[key] : '';
    if (!tpl) return '';
    return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? String(vars[k]) : ''));
}

async function readConfig() {
    try {
        const res = await axios.get(CONFIG_URL, {
            timeout: 10000,
            headers: { 'Cache-Control': 'no-cache' }
        });
        const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const apiUrls = (parsed && Array.isArray(parsed.apiUrls))
            ? parsed.apiUrls.filter((u) => typeof u === 'string' && u.trim() && !u.includes('your-project')).map((u) => u.trim())
            : [];
        const messages = (parsed && typeof parsed.messages === 'object' && parsed.messages) ? parsed.messages : {};
        return { apiUrls, messages };
    } catch (e) {
        console.warn('[ LOAD ] Config JSON (GitHub) fetch করতে সমস্যা হয়েছে:', e.message);
        return { apiUrls: [], messages: {} };
    }
}

const detectBotFormat = (command) => {
    if (typeof command.onStart === 'function') return 'goat';
    if (typeof command.run === 'function') return 'mirai';
    return null;
};

const buildGetLang = (command) => {
    const langs = command.langs || {};
    const defaultLang = langs['en'] ? 'en' : Object.keys(langs)[0] || 'en';
    return (key, ...params) => {
        const langObj = langs[defaultLang] || {};
        let text = langObj[key];
        if (text === undefined || text === null) return key;
        params.forEach((val, i) => {
            text = text.replace(new RegExp(`%${i + 1}`, 'g'), val);
            text = text.replace(new RegExp(`\\{${i}\\}`, 'g'), val);
        });
        return text;
    };
};
const buildUsersData = (MiraiUsers) => ({
    getName: async (uid) => {
        try {
            if (MiraiUsers && typeof MiraiUsers.getNameUser === 'function')
                return await MiraiUsers.getNameUser(uid);
            if (global.data?.users instanceof Map) {
                const u = global.data.users.get(String(uid));
                if (u?.name) return u.name;
            }
            return "Unknown";
        } catch (e) { return "Unknown"; }
    },
    get: async (uid) => {
        try {
            if (MiraiUsers && typeof MiraiUsers.getUser === 'function')
                return await MiraiUsers.getUser(uid);
            if (global.data?.users instanceof Map)
                return global.data.users.get(String(uid)) || {};
            return {};
        } catch (e) { return {}; }
    },
    set: async (uid, data) => {
        try {
            if (MiraiUsers && typeof MiraiUsers.setUser === 'function')
                return await MiraiUsers.setUser(uid, data);
        } catch (e) {}
    },
    getAll: async () => {
        try {
            if (global.data?.users instanceof Map)
                return Array.from(global.data.users.values());
            return [];
        } catch (e) { return []; }
    }
});

const buildThreadsData = (MiraiThreads, api) => ({
    get: async (tid) => {
        try {
            let miraiData = {};
            if (MiraiThreads && typeof MiraiThreads.getThread === 'function')
                miraiData = await MiraiThreads.getThread(tid) || {};
            else if (global.data?.threads instanceof Map)
                miraiData = global.data.threads.get(String(tid)) || {};

            let fbThreadData = {};
            try { fbThreadData = await api.getThreadInfo(tid); } catch (e) {}

            const adminIDs = (fbThreadData.adminIDs || [])
                .map(a => (typeof a === 'object' ? a.id : String(a)));
            const members = (miraiData.members || []).map(m => ({
                userID: String(m.userID || m.id || ""),
                name: m.name || "",
                count: m.count || m.messageCount || 0,
                inGroup: m.inGroup !== false
            }));
            const userInfo = fbThreadData.userInfo || [];

            return {
                ...miraiData,
                adminIDs,
                members,
                userInfo,
                threadName: fbThreadData.threadName || miraiData.threadName || "",
                participantIDs: fbThreadData.participantIDs || miraiData.participantIDs || []
            };
        } catch (e) {
            console.error('[threadsData.get] error:', e.message);
            return { adminIDs: [], members: [], userInfo: [], threadName: "", participantIDs: [] };
        }
    },
    getName: async (tid) => {
        try {
            if (MiraiThreads && typeof MiraiThreads.getNameThread === 'function')
                return await MiraiThreads.getNameThread(tid);
            if (global.data?.threads instanceof Map) {
                const t = global.data.threads.get(String(tid));
                if (t?.threadName) return t.threadName;
            }
            return "Unknown";
        } catch (e) { return "Unknown"; }
    },
    set: async (tid, data) => {
        try {
            if (MiraiThreads && typeof MiraiThreads.setThread === 'function')
                return await MiraiThreads.setThread(tid, data);
        } catch (e) {}
    },
    getAll: async () => {
        try {
            if (global.data?.threads instanceof Map)
                return Array.from(global.data.threads.values());
            return [];
        } catch (e) { return []; }
    }
});

const ensureGoatBotShim = () => {
    if (global.GoatBot) return;
    global.GoatBot = {
        onReaction: {
            _map: new Map(),
            set: (messageID, data) => {
                global.client.handleReaction = global.client.handleReaction || [];
                const idx = global.client.handleReaction.findIndex(r => r.messageID === messageID);
                if (idx !== -1) global.client.handleReaction.splice(idx, 1);
                global.client.handleReaction.push({
                    type: "goat_reaction", name: data.commandName || "",
                    messageID, author: data.author, goatData: data
                });
                global.GoatBot.onReaction._map.set(messageID, data);
            },
            get: (messageID) => global.GoatBot.onReaction._map.get(messageID),
            delete: (messageID) => {
                global.GoatBot.onReaction._map.delete(messageID);
                if (global.client.handleReaction) {
                    const idx = global.client.handleReaction.findIndex(r => r.messageID === messageID);
                    if (idx !== -1) global.client.handleReaction.splice(idx, 1);
                }
            }
        },
        onReply: {
            _map: new Map(),
            set: (messageID, data) => {
                global.client.handleReply = global.client.handleReply || [];
                const idx = global.client.handleReply.findIndex(r => r.messageID === messageID);
                if (idx !== -1) global.client.handleReply.splice(idx, 1);
                global.client.handleReply.push({
                    type: "goat_reply", name: data.commandName || "",
                    messageID, author: data.author, goatData: data
                });
                global.GoatBot.onReply._map.set(messageID, data);
            },
            get: (messageID) => global.GoatBot.onReply._map.get(messageID),
            delete: (messageID) => {
                global.GoatBot.onReply._map.delete(messageID);
                if (global.client.handleReply) {
                    const idx = global.client.handleReply.findIndex(r => r.messageID === messageID);
                    if (idx !== -1) global.client.handleReply.splice(idx, 1);
                }
            }
        }
    };
};
const buildGoatParams = ({ api, event, args, command, MiraiUsers, MiraiThreads, extra }) => {
    const threadID = event.threadID;
    const messageID = event.messageID;
    const reply = (body, callback) => api.sendMessage(body, threadID, callback);
    const message = {
        reply,
        unsend: (msgID) => { try { api.unsendMessage(msgID); } catch (e) {} },
        react: (emoji, msgID) => {
            try { api.setMessageReaction(emoji, msgID || messageID, () => {}, true); } catch (e) {}
        },
        SyntaxError: () => {
            const cfg = command.config || {};
            const guide = typeof cfg.guide === 'object'
                ? (cfg.guide.en || cfg.guide.vi || "")
                : (cfg.guide || "");
            reply(`❌ Wrong syntax!\nUsage: ${guide}`);
        }
    };
    const goatApi = Object.assign({}, api, {
        sendMessage: (body, tid, cb) => api.sendMessage(body, tid || threadID, cb)
    });
    const fonts = (typeof global.utils?.fonts === 'function') ? global.utils.fonts : (text) => text;
    return {
        api: goatApi,
        event: { ...event },
        args: Array.isArray(args) ? args : [],
        message,
        reply,
        getLang: buildGetLang(command),
        fonts,
        usersData: buildUsersData(MiraiUsers),
        threadsData: buildThreadsData(MiraiThreads, api),
        commandName: (command.config || {}).name || "",
        ...(extra || {})
    };
};

const wrapGoatCommand = (command) => {
    const goatConfig = command.config || {};
    const miraiConfig = {
        name: goatConfig.name,
        version: goatConfig.version || "1.0.0",
        hasPermission: goatConfig.role || 0,
        credits: goatConfig.author || goatConfig.credits || "GoatBot",
        description: (typeof goatConfig.description === 'object')
            ? (goatConfig.description.en || goatConfig.description.vi || "")
            : (goatConfig.description || ""),
        usePrefix: goatConfig.usePrefix !== false,
        commandCategory: goatConfig.category || goatConfig.commandCategory || "goat",
        usages: (typeof goatConfig.guide === 'object')
            ? (goatConfig.guide.en || goatConfig.guide.vi || "")
            : (goatConfig.usage || goatConfig.usages || ""),
        cooldowns: goatConfig.cooldowns || goatConfig.countDown || goatConfig.coolDown || 3,
        aliases: goatConfig.aliases || []
    };

    const miraiRun = async ({ api, event, args, Users, Threads }) => {
        ensureGoatBotShim();
        try {
            return await command.onStart(
                buildGoatParams({ api, event, args, command, MiraiUsers: Users, MiraiThreads: Threads })
            );
        } catch (err) {
            console.error(`[ LOAD / ${goatConfig.name} ] onStart error:`, err);
            api.sendMessage(`❌ Error: ${err.message}`, event.threadID);
        }
    };

    const wrapped = { config: miraiConfig, run: miraiRun };

    if (typeof command.onChat === 'function') {
        wrapped.handleEvent = async ({ api, event, Users, Threads }) => {
            try {
                return await command.onChat(
                    buildGoatParams({ api, event, args: [], command, MiraiUsers: Users, MiraiThreads: Threads })
                );
            } catch (err) {
                console.error(`[ LOAD / ${goatConfig.name} ] onChat error:`, err);
            }
        };
    }

    if (typeof command.onReaction === 'function') {
        wrapped.handleReaction = async ({ api, event, handleReaction, Users, Threads }) => {
            try {
                const Reaction = (handleReaction && handleReaction.goatData) ? handleReaction.goatData : handleReaction;
                return await command.onReaction(
                    buildGoatParams({ api, event, args: [], command, MiraiUsers: Users, MiraiThreads: Threads, extra: { Reaction } })
                );
            } catch (err) {
                console.error(`[ LOAD / ${goatConfig.name} ] onReaction error:`, err);
            }
        };
    }

    if (typeof command.onReply === 'function') {
        wrapped.handleReply = async ({ api, event, handleReply, Users, Threads }) => {
            try {
                const Reply = (handleReply && handleReply.goatData) ? handleReply.goatData : handleReply;
                return await command.onReply(
                    buildGoatParams({ api, event, args: [], command, MiraiUsers: Users, MiraiThreads: Threads, extra: { Reply } })
                );
            } catch (err) {
                console.error(`[ LOAD / ${goatConfig.name} ] onReply error:`, err);
            }
        };
    }

    if (Array.isArray(goatConfig.aliases) && goatConfig.aliases.length > 0)
        wrapped.aliases = goatConfig.aliases;

    return wrapped;
};
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const PROGRESS_FRAMES = ["⟦□□□□□□□□□□⟧ 0%","⟦█□□□□□□□□□⟧ 10%","⟦██□□□□□□□□⟧ 20%","⟦███□□□□□□□⟧ 30%","⟦████□□□□□□⟧ 40%","⟦█████□□□□□⟧ 50%","⟦██████□□□□⟧ 60%","⟦███████□□□⟧ 70%","⟦████████□□⟧ 80%","⟦█████████□⟧ 90%","⟦██████████⟧ 100%"
];
const loadCommandFile = (filename) => {
    try {
        const { readFileSync } = global.nodemodule['fs-extra'];
        const { join } = global.nodemodule['path'];
        const { mainPath } = global.client;
        const logger = require(mainPath + '/utils/log');

        const dirModule = path.join(__dirname, filename);
        delete require.cache[require.resolve(dirModule)];
        let command = require(dirModule);

        const format = detectBotFormat(command);
        if (!format) {
            return { ok: false, name: filename, error: 'Must have .run (Mirai) or .onStart (GoatBot)' };
        }

        let finalCommand = command;
        let formatLabel = 'Mirai';
        if (format === 'goat') {
            finalCommand = wrapGoatCommand(command);
            formatLabel = 'GoatBot → Mirai';
        }

        if (!finalCommand.config?.name || !finalCommand.config?.commandCategory) {
            return { ok: false, name: filename, error: 'missing config.name or config.commandCategory' };
        }

        if (finalCommand.config.dependencies && typeof finalCommand.config.dependencies === 'object') {
            try {
                const listPackage = JSON.parse(readFileSync('./package.json')).dependencies;
                const listbuiltinModules = require('module').builtinModules;
                for (const packageName in finalCommand.config.dependencies) {
                    if (listPackage.hasOwnProperty(packageName) || listbuiltinModules.includes(packageName))
                        global.nodemodule[packageName] = require(packageName);
                    else
                        global.nodemodule[packageName] = require(
                            join(global.client.mainPath, 'nodemodules', 'node_modules', packageName)
                        );
                }
            } catch (depErr) {
                console.warn('[ LOAD ] Dependency warning:', depErr.message);
            }
        }

        if (finalCommand.handleEvent) {
            if (!global.client.eventRegistered.includes(finalCommand.config.name))
                global.client.eventRegistered.push(finalCommand.config.name);
        }

        if (Array.isArray(finalCommand.aliases)) {
            for (const alias of finalCommand.aliases)
                global.client.commands.set(alias, finalCommand);
        }

        global.client.commands.set(finalCommand.config.name, finalCommand);
        logger.loader(`[ LOAD ] ✅ Loaded: ${finalCommand.config.name} (${formatLabel})`);
        return { ok: true, name: finalCommand.config.name };
    } catch (err) {
        console.error('[ LOAD ] load error:', err);
        return { ok: false, name: filename, error: err.message };
    }
};

async function callStoreApi(endpoint, secret, messages, threadID, messageID, api) {
    const attempts = [];

    for (let i = 0; i < secret.apiUrls.length; i++) {
        const base = secret.apiUrls[i];
        try {
            const res = await axios.get(`${base.replace(/\/$/, '')}${endpoint}`, {
                headers: {
                    'x-api-key': secret.LOAD_API_KEY,
                    'x-credit': Buffer.from(module.exports.config.credits, 'utf-8').toString('base64'),
                },
                timeout: 15000,
            });
            if (i > 0) {
                console.warn(`[ LOAD ] প্রথম ${i} টা URL ব্যর্থ হয়েছিল, #${i + 1} নম্বর URL (${base}) দিয়ে সফল হয়েছে।`);
            }
            return { ok: true, data: res.data, usedUrl: base };
        } catch (err) {
            const status = err.response?.status;
            const serverDetail = err.response?.data?.detail || err.response?.data?.error;
            let reason = serverDetail || err.message || 'Unknown error';
            if (status === 401) reason = msg(messages, 'apiKeyInvalid');
            else if (status === 403) reason = msg(messages, 'creditCheckFailed');
            else if (status === 500 && serverDetail) reason = msg(messages, 'serverError', { detail: serverDetail });

            attempts.push(`#${i + 1} ${base} → ${reason}`);
            console.warn(`[ LOAD ] URL #${i + 1} (${base}) ব্যর্থ: ${reason} — পরের URL চেষ্টা করা হচ্ছে...`);
        }
    }
  return {
        ok: false,
        reason: msg(messages, 'allUrlsFailed', { count: secret.apiUrls.length, attempts: attempts.join(' | ') })
    };
}
module.exports.run = async ({ api, event, args }) => {
    try {
        const sub = (args[0] || '').toLowerCase();
        const config = await readConfig();
        const messages = config.messages;

        if (sub !== 'all' && sub !== 'check') {
            return api.sendMessage(msg(messages, 'usage'), event.threadID, event.messageID);
        }

        if (!config.apiUrls.length || !LOAD_API_KEY || LOAD_API_KEY.startsWith("PASTE_")) {
            return api.sendMessage(msg(messages, 'configMissing'), event.threadID, event.messageID);
        }
        const secret = { apiUrls: config.apiUrls, LOAD_API_KEY };

        if (sub === 'check') {
            const result = await callStoreApi('/api/bot/check', secret, messages, event.threadID, event.messageID, api);
            if (!result.ok) {
                return api.sendMessage(msg(messages, 'checkFailed', { reason: result.reason }), event.threadID, event.messageID);
            }
            const { count, names } = result.data;
            const list = names.length ? names.map((n) => `⬤ ${n}.js`).join('\n') : '(খালি)';
            return api.sendMessage(msg(messages, 'checkSuccess', { count, list }), event.threadID, event.messageID);
        }
 const sendMessageAsync = (body, threadID) => new Promise((resolve) => {
            try {
                api.sendMessage(body, threadID, (err, info) => resolve(err ? null : info));
            } catch (e) {
                resolve(null);
            }
        });
 const editMessageSafe = (body, messageID) => {
            try {
                api.editMessage(body, messageID, () => {});
            } catch (e) {}
        };
 const loadingInfo = await sendMessageAsync(PROGRESS_FRAMES[0], event.threadID);
        const loadingMsgID = loadingInfo?.messageID;
 let frameIndex = 1 % PROGRESS_FRAMES.length;
        const progressTimer = loadingMsgID
            ? setInterval(() => {
                editMessageSafe(PROGRESS_FRAMES[frameIndex], loadingMsgID);
                frameIndex = (frameIndex + 1) % PROGRESS_FRAMES.length;
            }, 500)
            : null;
 const finish = (text) => {
            if (progressTimer) clearInterval(progressTimer);
            if (loadingMsgID) {
                editMessageSafe(text, loadingMsgID);
            } else {
                api.sendMessage(text, event.threadID, event.messageID);
            }
        };
  try {
            const result = await callStoreApi('/api/bot/all', secret, messages, event.threadID, event.messageID, api);
            if (!result.ok) {
                return finish(msg(messages, 'fetchFailed', { reason: result.reason }));
            }

            const list = result.data?.commands || [];
            if (list.length === 0) {
                return finish(msg(messages, 'emptyStore'));
            }

            const results = [];
            for (const { name, code } of list) {
                if (!name || !code || !SAFE_NAME_RE.test(name)) {
                    results.push(msg(messages, 'invalidName', { name: name || '(unnamed)' }));
                    continue;
                }
              try { new vm.Script(code); } catch (syntaxErr) {
                    results.push(msg(messages, 'syntaxError', { name, error: syntaxErr.message }));
                    continue;
                }
           const filename = `${name}.js`;
                const savePath = path.join(__dirname, filename);
                fs.writeFileSync(savePath, code, 'utf-8');

                const loadResult = loadCommandFile(filename);
                results.push(loadResult.ok
                    ? msg(messages, 'installOk', { name: loadResult.name })
                    : msg(messages, 'installFail', { name: loadResult.name, error: loadResult.error }));
            }
           return finish(msg(messages, 'installSuccess', { count: list.length, results: results.join('\n') }));
        } catch (innerErr) {
            console.error('[ LOAD ] load all error:', innerErr);
            return finish(msg(messages, 'unexpectedError', { error: innerErr.message }));
        }
    } catch (e) {
        console.error('[ LOAD ] run error:', e);
        return api.sendMessage(`❌ Something went wrong: ${e.message}`, event.threadID, event.messageID);
    }
};
