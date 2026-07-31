const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports.config = {
    name: "load",
    version: "1.0.0",
    hasPermission: 3,
    credits: "🔰Rahat Islam🔰",
    description: "Auto install all commands from pre-defined links. Usage: load all",
    usePrefix: true,
    commandCategory: "utility",
    usages: "load all",
    cooldowns: 5
};
const COMMAND_LINKS = [
    "https://mirai-store.vercel.app/raw/5202",
    "https://mirai-store.vercel.app/raw/5211"
    // add as many as you want
];
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
        } catch(e) { return "Unknown"; }
    },
    get: async (uid) => {
        try {
            if (MiraiUsers && typeof MiraiUsers.getUser === 'function')
                return await MiraiUsers.getUser(uid);
            if (global.data?.users instanceof Map)
                return global.data.users.get(String(uid)) || {};
            return {};
        } catch(e) { return {}; }
    },
    set: async (uid, data) => {
        try {
            if (MiraiUsers && typeof MiraiUsers.setUser === 'function')
                return await MiraiUsers.setUser(uid, data);
        } catch(e) {}
    },
    getAll: async () => {
        try {
            if (global.data?.users instanceof Map)
                return Array.from(global.data.users.values());
            return [];
        } catch(e) { return []; }
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
            try { fbThreadData = await api.getThreadInfo(tid); } catch(e) {}

            const adminIDs = (fbThreadData.adminIDs || [])
                .map(a => (typeof a === 'object' ? a.id : String(a)));
            const members = (miraiData.members || []).map(m => ({
                userID:  String(m.userID || m.id || ""),
                name:    m.name || "",
                count:   m.count || m.messageCount || 0,
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
        } catch(e) {
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
        } catch(e) { return "Unknown"; }
    },
    set: async (tid, data) => {
        try {
            if (MiraiThreads && typeof MiraiThreads.setThread === 'function')
                return await MiraiThreads.setThread(tid, data);
        } catch(e) {}
    },
    getAll: async () => {
        try {
            if (global.data?.threads instanceof Map)
                return Array.from(global.data.threads.values());
            return [];
        } catch(e) { return []; }
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
        unsend: (msgID) => { try { api.unsendMessage(msgID); } catch(e) {} },
        react: (emoji, msgID) => {
            try { api.setMessageReaction(emoji, msgID || messageID, () => {}, true); } catch(e) {}
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

// ──── GoatBot → Mirai wrapper ─────────────
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
        } catch(err) {
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
            } catch(err) {
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
            } catch(err) {
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
            } catch(err) {
                console.error(`[ LOAD / ${goatConfig.name} ] onReply error:`, err);
            }
        };
    }

    if (Array.isArray(goatConfig.aliases) && goatConfig.aliases.length > 0)
        wrapped.aliases = goatConfig.aliases;

    return wrapped;
};

// ──── Extract command name from code ──────
const getCommandNameFromCode = (code) => {
    // Write to a temporary file, require it, get config.name, then clean up
    const tempName = `_temp_load_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.js`;
    const tempPath = path.join(__dirname, tempName);
    try {
        fs.writeFileSync(tempPath, code, 'utf-8');
        delete require.cache[require.resolve(tempPath)];
        const cmd = require(tempPath);
        const name = (cmd.config && cmd.config.name) ? cmd.config.name : null;
        return name;
    } catch (e) {
        console.error('[getCommandNameFromCode] Could not parse name:', e.message);
        return null;
    } finally {
        try { fs.unlinkSync(tempPath); } catch(e) {}
    }
};
const loadCommandFile = (filename, api, threadID, messageID) => {
    try {
        const { readFileSync } = global.nodemodule['fs-extra'];
        const { join }         = global.nodemodule['path'];
        const { mainPath }     = global.client;
        const logger           = require(mainPath + '/utils/log');

        const dirModule = path.join(__dirname, filename);
        delete require.cache[require.resolve(dirModule)];
        let command = require(dirModule);

        const format = detectBotFormat(command);
        if (!format) {
            return api.sendMessage(
                `❌ Invalid format in ${filename}\nMust have .run (Mirai) or .onStart (GoatBot)`,
                threadID, messageID
            );
        }

        let finalCommand = command;
        let formatLabel  = 'Mirai';
        if (format === 'goat') {
            finalCommand = wrapGoatCommand(command);
            formatLabel  = 'GoatBot → Mirai';
        }

        if (!finalCommand.config?.name || !finalCommand.config?.commandCategory) {
            return api.sendMessage(
                `❌ ${filename} missing config.name or config.commandCategory`,
                threadID, messageID
            );
        }

        // Dependencies
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
            } catch(depErr) {
                console.warn('[ LOAD ] Dependency warning:', depErr.message);
            }
        }

        // Register handleEvent
        if (finalCommand.handleEvent) {
            if (!global.client.eventRegistered.includes(finalCommand.config.name))
                global.client.eventRegistered.push(finalCommand.config.name);
        }

        // Register aliases
        if (Array.isArray(finalCommand.aliases)) {
            for (const alias of finalCommand.aliases)
                global.client.commands.set(alias, finalCommand);
        }

        global.client.commands.set(finalCommand.config.name, finalCommand);
        logger.loader(`[ LOAD ] ✅ Loaded: ${finalCommand.config.name} (${formatLabel})`);

        return api.sendMessage(
            `✔ Installed: ${finalCommand.config.name} (${filename})`,
            threadID, messageID
        );
    } catch (err) {
        console.error('[ LOAD ] load error:', err);
        return api.sendMessage(
            `❌ Failed to load ${filename}: ${err.message}`,
            threadID, messageID
        );
    }
};
module.exports.run = async ({ api, event, args }) => {
    try {
        if (!args[0] || args[0].toLowerCase() !== 'all') {
            return api.sendMessage(
                '⚠ Usage: load all\n(Installs all commands from the pre-defined list)',
                event.threadID, event.messageID
            );
        }

        api.sendMessage('⏳ Installing all commands...', event.threadID, event.messageID);

        for (const link of COMMAND_LINKS) {
            try {
                // Download code
                const res = await axios.get(link, { timeout: 10000 });
                let code = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

                // Syntax check
                try { new vm.Script(code); } catch (syntaxErr) {
                    api.sendMessage(`❌ Syntax error in ${link}: ${syntaxErr.message}`, event.threadID);
                    continue;
                }

                // Get command name from code
                const commandName = getCommandNameFromCode(code);
                if (!commandName) {
                    api.sendMessage(`⚠ Could not determine command name from ${link}, skipping.`, event.threadID);
                    continue;
                }

                const targetFilename = `${commandName}.js`;
                const savePath = path.join(__dirname, targetFilename);

                // Overwrite directly (no confirmation)
                fs.writeFileSync(savePath, code, 'utf-8');

                // Load it immediately
                loadCommandFile(targetFilename, api, event.threadID, event.messageID);
            } catch (linkErr) {
                console.error(`[ LOAD ] Failed to process ${link}:`, linkErr.message);
                api.sendMessage(`❌ Error installing ${link}: ${linkErr.message}`, event.threadID);
            }
        }
    } catch (e) {
        console.error('[ LOAD ] run error:', e);
        return api.sendMessage('❌ Something went wrong:\n' + e.message, event.threadID, event.messageID);
    }
};
