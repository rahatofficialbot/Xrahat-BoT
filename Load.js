const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports.config = {
    name: "load",
    version: "3.0.0",
    hasPermission: 3,
    credits: "Rahat Islam",
    description: "Install/check commands from the private Firebase-backed command store. Usage: load all / load check",
    usePrefix: true,
    commandCategory: "utility",
    usages: "load all | load check",
    cooldowns: 5
};
(function () {
    const EXPECTED = "Rahat Islam";
    if (module.exports.config.credits !== EXPECTED) {
        throw new Error("❌ You are not allowed to modify the credits of this module!");
    }
})();
const LOAD_API_BASE = "https://xrahat-dev-load-cmd.vercel.app";
const LOAD_API_KEY = "b7f3c8a1e4d9f2b6c5a8e7d3f1c9a4b2d6e8f4c7a1b3d9e5f2c8a6b4d1e3f7c9a5b2d8"; 

function readSecret() {
    if (!LOAD_API_BASE || LOAD_API_BASE.includes("your-project") || !LOAD_API_KEY || LOAD_API_KEY.startsWith("PASTE_")) {
        return null;
    }
    return { LOAD_API_BASE, LOAD_API_KEY };
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

async function callStoreApi(endpoint, secret, threadID, messageID, api) {
    try {
        const res = await axios.get(`${secret.LOAD_API_BASE.replace(/\/$/, '')}${endpoint}`, {
            headers: {
                'x-api-key': secret.LOAD_API_KEY,
                'x-credit': module.exports.config.credits,
            },
            timeout: 15000,
        });
        return { ok: true, data: res.data };
    } catch (err) {
        const status = err.response?.status;
        let reason = err.message || 'Unknown error';
        if (status === 401) reason = 'API key ভুল - load.js এর LOAD_API_KEY চেক করুন';
        else if (status === 403) reason = 'Credit check ব্যর্থ - এই bot ফাইল modify করা হয়েছে';
        return { ok: false, reason };
    }
}

module.exports.run = async ({ api, event, args }) => {
    try {
        const sub = (args[0] || '').toLowerCase();

        if (sub !== 'all' && sub !== 'check') {
            return api.sendMessage(
                '⚠ Usage:\n• load all   - সব কমান্ড ইনস্টল করবে\n• load check - store এ কতগুলো কমান্ড আছে দেখাবে',
                event.threadID, event.messageID
            );
        }

        const secret = readSecret();
        if (!secret) {
            return api.sendMessage(
                '❌ load.js এর উপরের দিকে LOAD_API_BASE এবং LOAD_API_KEY বসানো হয়নি।',
                event.threadID, event.messageID
            );
        }

        if (sub === 'check') {
            const result = await callStoreApi('/api/bot/check', secret, event.threadID, event.messageID, api);
            if (!result.ok) {
                return api.sendMessage(`❌ Check ব্যর্থ: ${result.reason}`, event.threadID, event.messageID);
            }
            const { count, names } = result.data;
            const list = names.length ? names.map((n) => `• ${n}`).join('\n') : '(খালি)';
            return api.sendMessage(
                `📦 Store এ মোট ${count} টা কমান্ড আছে:\n\n${list}`,
                event.threadID, event.messageID
            );
        }

        // sub === 'all'
        api.sendMessage('⏳ Private store থেকে কমান্ড আনা হচ্ছে...', event.threadID, event.messageID);

        const result = await callStoreApi('/api/bot/all', secret, event.threadID, event.messageID, api);
        if (!result.ok) {
            return api.sendMessage(`❌ Store থেকে ডেটা আনতে ব্যর্থ: ${result.reason}`, event.threadID);
        }

        const list = result.data?.commands || [];
        if (list.length === 0) {
            return api.sendMessage('⚠ Store এ এখনো কোনো কমান্ড নাই।', event.threadID);
        }

        const results = [];
        for (const { name, code } of list) {
            if (!name || !code || !SAFE_NAME_RE.test(name)) {
                results.push(`❌ ${name || '(unnamed)'}: invalid name`);
                continue;
            }

            try { new vm.Script(code); } catch (syntaxErr) {
                results.push(`❌ ${name}: syntax error - ${syntaxErr.message}`);
                continue;
            }

            const filename = `${name}.js`;
            const savePath = path.join(__dirname, filename);
            fs.writeFileSync(savePath, code, 'utf-8');

            const loadResult = loadCommandFile(filename);
            results.push(loadResult.ok ? `✅ ${loadResult.name}` : `❌ ${loadResult.name}: ${loadResult.error}`);
        }

        return api.sendMessage(
            `📦 Installed ${list.length} command(s):\n\n${results.join('\n')}`,
            event.threadID, event.messageID
        );
    } catch (e) {
        console.error('[ LOAD ] run error:', e);
        return api.sendMessage('❌ Something went wrong:\n' + e.message, event.threadID, event.messageID);
    }
};
