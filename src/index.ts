import TelegramBot from "node-telegram-bot-api";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./models/User";

import { Channel } from "./models/Channel";

import { ContextDefaultState, MessageContext, VK } from "vk-io";
import { Message } from "./models/Message";
import { UsersUserFull } from "vk-io/lib/api/schemas/objects";
import { sendConfirmationEmail } from "./services/emailService";
import { sendMail365 } from "./services/mail365";
import { checkLastMessagesOzon, getChats_Ozon, getMessagesFromChat_Ozon, sendMsgToChat_Ozon, setAsReadChat_Ozon } from "./services/ozonService";
//import { startListenVk } from "./services/vkService";

dotenv.config();
let token = process.env.BOT_TOKEN_DEV!;
const args = process.argv.slice(2);
const varieable = args.find((arg) => arg.startsWith("--start="));

if (varieable) {
    const start = varieable.split("=")[1];
    console.log("MY_VARIABLE:", start);

    if (start == "prod") {
        token = process.env.BOT_TOKEN_PROD!;
    }
}

//!---------------------------------------

function truncateText(text: string, maxLength: number = 300): string {
    if (text.length > maxLength) {
        return text.slice(0, maxLength) + "...";
    }
    return text;
}

function formatPhoneNumber(phone: string): string | null {
    // Удаляем все символы, кроме цифр и "+" в начале
    phone = phone.replace(/[^\d+]/g, "");

    // Убираем "+" в начале, чтобы проверить длину только цифр
    const phoneDigits = phone.startsWith("+") ? phone.slice(1) : phone;
    if (phoneDigits.length !== 11) {
        console.error("Номер должен содержать ровно 11 цифр.");
        return null;
    }

    // Если номер начинается с "8", меняем её на "7"
    if (phone.startsWith("8")) {
        phone = "7" + phone.slice(1);
    }

    // Если номер не начинается с "+", добавляем его
    if (!phone.startsWith("+")) {
        phone = "+" + phone;
    }

    return phone;
}

// Интерфейс для пользователя, возвращаемого из MongoDB
export interface IUser extends Document {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    chatId: number;
    isConfirmed: boolean;
}

// Интерфейс для группы
export interface IChannel extends Document {
    userId: string;
    groupId: string;
    token: string;
    channelName: string;
    operatorsChatIds: number[];
    chatId: number;
    type: "vk" | "ozon";
}

interface IMessage extends Document {
    channelName: string;
    text: string;
    time: number;
}

type TStatusChat = {
    [key: number]: string; //main addOperator_:  addvkGroup userReg
};

type TTempDataChat = {
    [key: number]: any; //main addOperator_:  addvkGroup userReg
};
type TConversationChatVK = {
    [key: number]: { vk: VK; peer: UsersUserFull; groupId: string }; //main addOperator_:  addvkGroup userReg
};

//Диалог с клиентом Ozone.\nCLIENT_ID: ${channel.groupId}, API_KEY :${channel.token}\nOzonChatId: ${ozonChatId}`);
type TConversationChatOzon = {
    [key: number]: { clientId: string; apiKey: string; ozonChatId: string }; //main addOperator_:  addvkGroup userReg
};

type TUserInfoChat = {
    [key: number]: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        code?: string;
    };
};

//STATUS CHATS

const statusChats: TStatusChat = {};
const conversationChatsVK: TConversationChatVK = {};
const conversationChatsOZON: TConversationChatOzon = {};
const usersInfoChats: TUserInfoChat = {};
const tempDataChats: TTempDataChat = {};

//Массив для завершения слушания токенов VK
const activeListeners: Map<string, () => void> = new Map();

function generateConfirmationCode(length = 10) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        code += characters[randomIndex];
    }

    return code;
}

const startBot = () => {
    //? Инициализация бота

    //const token = process.env.BOT_TOKEN!;
    const bot = new TelegramBot(token, { polling: true });

    //? Подключение к MongoDB

    mongoose
        .connect(process.env.MONGODB_URI!)
        .then(async () => {
            console.log("MongoDB connected");
            const users = await User.find().then((arr) => {
                arr.forEach((user) => {
                    usersInfoChats[user.chatId] = {
                        firstName: user.firstName,
                        lastName: user.lastName,
                        email: user.email,
                        phone: user.phone,
                    };
                });
            });
            console.log("USERS", usersInfoChats);
        })
        .catch((err) => console.error("MongoDB connection error:", err));

    //Меню начальное
    bot.setMyCommands([
        { command: "/start", description: "Старт 🤖" },
        { command: "/dialogs", description: "Диалоги ✉️" },
        { command: "/channels", description: "Каналы 📬" },
        { command: "/operators", description: "Операторы 🛂" },
        { command: "/settings", description: "Настройки ⚙️" },
    ]);

    // Меню для добавления группы VK
    const menuAddChannel = {
        reply_markup: {
            keyboard: [[{ text: "Добавить сообщество VK" }], [{ text: "Добавить OZON Seller" }]],
            resize_keyboard: true,
            one_time_keyboard: true,
        },
    };

    const exitBtn = {
        reply_markup: {
            keyboard: [[{ text: "Отмена действий ❌" }]],
            resize_keyboard: true,
            one_time_keyboard: true,
        },
    };

    const menuButtons = {
        reply_markup: {
            keyboard: [
                [
                    //  { text: "/start", callback_data: "menu_start" },
                    { text: "Диалоги ✉️", callback_data: "menu_dialogs" },
                ],
                [
                    { text: "Каналы 📬", callback_data: "menu_dialogs" },
                    { text: "Операторы 🛂", callback_data: "menu_operators" },
                    { text: "Настройки ⚙️", callback_data: "menu_settings" },
                ],

                [{ text: "Отмена действий ❌", callback_data: "btn_exit" }],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    };

    const menuSettings = {
        reply_markup: {
            keyboard: [[{ text: "Изменить параметры регистрации" }], [{ text: "Отмена действий ❌", callback_data: "btn_exit" }]],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    };

    const menuEndDialogVK = ({ peerName }: { peerName: string }) => {
        return {
            reply_markup: {
                keyboard: [[{ text: `Выйти из диалога ` }], [{ text: `Завершить диалог c ${peerName} ` }], [{ text: `Удалить диалог c ${peerName} ` }]],
                resize_keyboard: true,
                one_time_keyboard: false,
            },
        };
    };
    const menuEndDialogOzon = ({ peerName }: { peerName: string }) => {
        return {
            reply_markup: {
                keyboard: [[{ text: `Выйти из диалога ` }], [{ text: `Завершить диалог c ${peerName} ` }]],
                resize_keyboard: true,
                one_time_keyboard: false,
            },
        };
    };

    //Функции КАНАЛОВ
    const showChannels = async ({ chatId }: { chatId: number }) => {
        const channels = await Channel.find({ chatId });
        console.log("Channels📅", channels);

        const userChannels = channels.map((channel) => {
            return [
                {
                    text: `${channel.channelName} 👑`,
                    callback_data: `viewChannel_:${channel.channelName}`,
                },
                {
                    text: `[${channel.operatorsChatIds.length}] ➕ оператора`,
                    callback_data: `addOperator_:${channel.channelName}`,
                },
                {
                    text: `❌ канал`,
                    callback_data: `deleteChannel_:${channel.channelName}`,
                },
            ];
        });

        bot.sendMessage(chatId, "Список каналов", {
            reply_markup: {
                inline_keyboard: [
                    ...userChannels,
                    [
                        {
                            text: "➕ канал",
                            callback_data: `addChannel`,
                        },
                        {
                            text: "➕ оператора на все каналы",
                            callback_data: `addAllChannelsOperator`,
                        },
                    ],
                ],
            },
        });
    };

    const dropChannel = async ({ chatId, channelName }: { chatId: number; channelName: string }) => {
        const channel = await Channel.findOne({ chatId, channelName });
        if (channel) {
            const delRes = await Channel.deleteOne({ _id: channel._id });
            console.log("DEL RES", delRes);
            startListenVk();
            bot.sendMessage(chatId, `Канал "${channel.channelName}" удален`);
        } else {
            bot.sendMessage(chatId, "Канал не найден");
        }
    };

    //!Функции VK
    //Получаем информацию о пользователе VK
    async function getUserVKInfo(vk: VK, senderId: number): Promise<UsersUserFull | undefined> {
        // let userInfo:UsersUserFull={

        // }
        try {
            const response = await vk.api.users.get({
                user_ids: [senderId],
            });

            const user = response[0];
            return user;
            //console.log(`Сообщение от: ${user.first_name} ${user.last_name}`);
        } catch (error) {
            console.error("Ошибка при получении информации о пользователе:", error);
            return undefined;
        }
    }
    //помечаем прочиттаным
    async function markMessagesAsRead(vk: VK, peerId: number) {
        try {
            await vk.api.messages.markAsRead({
                peer_id: peerId,
            });
        } catch (error) {
            console.error("Ошибка при пометке сообщений как прочитанные:", error);
        }
    }

    //Функции операторов

    const addOperator = async ({ chatId, channelName, email }: { chatId: number; channelName: string; email: string }) => {
        const channel = await Channel.findOne({ chatId, channelName });
        const operator = await User.findOne({ email: email.toLowerCase() });
        if (!operator) return bot.sendMessage(chatId, `Пользователь с email "${email}" не найден ! \n Укажите корректный email пользователя`);
        if (channel) {
            channel.operatorsChatIds = [...new Set([...channel.operatorsChatIds, operator.chatId])];
            await channel.save();
            await bot.sendMessage(chatId, `В канал "${channelName}" добавлен новый оператор - ${operator.firstName} ${operator.lastName}`);
            await bot.sendMessage(operator.chatId, `Вас сделали оператором канала [${channel.channelName}]`);
            statusChats[chatId] = "main";
        }
        startListenVk();
    };

    async function addOperatorForAllChannels({ chatId, email }: { chatId: number; email: string }) {
        const channels = await Channel.find({ chatId });
        const operator = await User.findOne({ email: email.toLowerCase() });
        if (!operator) return bot.sendMessage(chatId, `Пользователь с email "${email}" не найден ! \n Укажите корректный email пользователя`);

        channels.forEach(async (channel) => {
            channel.operatorsChatIds = [...new Set([...channel.operatorsChatIds, operator.chatId])];
            await channel.save();

            await bot.sendMessage(operator.chatId, `Вас сделали оператором канала [${channel.channelName}]`);
        });
        statusChats[chatId] = "main";
        await bot.sendMessage(chatId, `У всех ваших групп новый оператор - ${operator.firstName} ${operator.lastName}`, menuButtons);
        startListenVk();
    }

    async function showMyOperators({ chatId }: { chatId: number }) {
        const channels = await Channel.find({ chatId });
        let noOperators = true;

        for (const channel of channels) {
            for (const operatorChatId of channel.operatorsChatIds) {
                const operator = await User.findOne({ chatId: operatorChatId });
                if (operator) {
                    noOperators = false;
                    await bot.sendMessage(chatId, `[${channel.channelName}] - 🛂 ${operator.firstName} ${operator.lastName}`, {
                        reply_markup: {
                            inline_keyboard: [[{ text: `убрать доступ к каналу`, callback_data: `delOperator_:${channel.groupId}_:${operator.chatId}` }]],
                        },
                    });
                }
            }
        }
        if (noOperators) await bot.sendMessage(chatId, `Сечас нет назначенных операторов.`);

        await bot.sendMessage(chatId, "Добавление оператора на все каналы", {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "➕",
                            callback_data: `addAllChannelsOperator`,
                        },
                    ],
                ],
            },
        });
    }

    //Функции диалогов

    async function showMyDialogs({ chatId }: { chatId: number }) {
        //ищем все каналы где мы либо админ либо операторы
        const myChannels = await Channel.find({
            $or: [{ chatId }, { operatorsChatIds: { $in: [chatId] } }],
            type: "vk",
        });

        let isNoConversations = true;

        for (const channel of myChannels) {
            const vk = new VK({
                token: channel.token,
            });

            let dialogs: {
                text: string;
                callback_data?: string;
            }[][] = [];

            const conversations = await vk.api.messages.getConversations({
                filter: "unread", // Например, получить только непрочитанные
                count: 20, // Количество сообщений
            });

            conversations.items.length && (await bot.sendMessage(chatId, `📬[${channel.channelName}]`));

            for (const item of conversations.items) {
                const { conversation, last_message } = item;
                //console.log("conversation item", item);
                const fromUserFullInfo = await getUserVKInfo(vk, conversation.peer.id);
                isNoConversations = false;

                await bot.sendMessage(chatId, `\t\t\t${new Date(last_message.date * 1000).toLocaleString()}\n✉️ ${fromUserFullInfo?.first_name} ${fromUserFullInfo?.last_name}: ${truncateText(last_message.text, 300)}`, {
                    reply_markup: {
                        inline_keyboard: [[{ text: `перейти к диалогу c 👤 ${fromUserFullInfo?.first_name} ${fromUserFullInfo?.last_name}`, callback_data: `conversation_:${channel.groupId}_:${conversation.peer.id}` }]],
                    },
                });
            }
        }
        if (isNoConversations) {
            bot.sendMessage(chatId, "Сейчас нет открытых диалогов в VK.", menuButtons);
        }

        //console.log("myChannels 📬", myChannels);
        //TODO OZON CHATS
        const myChannelsOzon = await Channel.find({
            $or: [{ chatId }, { operatorsChatIds: { $in: [chatId] } }],
            type: "ozon",
        });
        for (const channel of myChannelsOzon) {
            try {
                //console.log("CHAT", channel.groupId, channel.token);
                const chats = (await getChats_Ozon(channel.groupId, channel.token)).chats.filter((chat) => chat.chat_type === "Buyer_Seller").sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                for (const chat of chats) {
                    bot.sendMessage(chatId, `📬[${channel.channelName}]\nЧат Ozon, создан: ${new Date(chat.created_at).toLocaleString()}\nне прочитанных сообщений : ${chat.unread_count}`, {
                        reply_markup: {
                            inline_keyboard: [[{ text: `перейти к диалогу с клиентом Ozon`, callback_data: `zn ${channel.id} ${chat.chat_id}` }]],
                        },
                    });
                }
            } catch (error) {
                console.log("❌CHATS OZON ERROR", error);
            }
        }
    }

    async function showHistoryOfConverstationVK({ vkGroupId, chatId, vk, currentPeer }: { vkGroupId: string; chatId: number; vk: VK; currentPeer: UsersUserFull }) {
        try {
            const { items } = await vk.api.messages.getHistory({
                peer_id: currentPeer.id,
                count: 20,
                rev: 0,
            });

            for (const item of items.reverse()) {
                console.log("ITEM✉️", item);
                const isAdmin = item.from_id !== currentPeer.id;
                if (isAdmin) {
                    await bot.sendMessage(chatId, `⤴️${vkGroupId} : <i>${item.text}</i>`, { parse_mode: "HTML" });
                } else {
                    await bot.sendMessage(chatId, `✉️ ${currentPeer.first_name} ${currentPeer.last_name}: ${item.text}`);
                }
            }
        } catch (error) {
            console.error("Ошибка при получении сообщений:", error);
        }
    }

    async function showHistoryOfConverstationOzon({ chatId, clientId, apiKey, ozonChatId }: { chatId: number; clientId: string; apiKey: string; ozonChatId: string }) {
        try {
            const msgs = await getMessagesFromChat_Ozon(clientId, apiKey, ozonChatId, null, "Backward", 10);
            console.log("OZON MSGS", msgs);

            for (const msg of msgs.reverse()) {
                // console.log("ITEM✉️", item);
                const isAdmin = msg.user.type === "Seller";
                if (isAdmin) {
                    await bot.sendMessage(chatId, `⤴️ : ${msg.data[0]}`, { parse_mode: "HTML" });
                } else {
                    await bot.sendMessage(chatId, `✉️ : ${msg.data[0]}`);
                }
            }
        } catch (error) {
            console.error("Ошибка при получении сообщений:", error);
        }
    }

    async function conversationNow({ chatId, text }: { chatId: number; text: string }) {
        if (conversationChatsVK[chatId]) {
            const { vk, peer } = conversationChatsVK[chatId];
            console.log("MSG✉️", { vk, peer, text });

            const msgRes = await vk.api.messages.send({
                peer_id: peer.id,
                message: text,
                random_id: Math.floor(Math.random() * 100000),
            });
            console.log("MSG RES VK✉️", msgRes);
        }

        if (conversationChatsOZON[chatId]) {
            const { apiKey, clientId, ozonChatId } = conversationChatsOZON[chatId];

            console.log("SEND TO OZON ✉️", { apiKey, clientId, ozonChatId, text });
            await sendMsgToChat_Ozon(clientId, apiKey, ozonChatId, text);
        }
    }

    // Регистрация пользователя

    const initNewUser = (chatId: number) => {
        usersInfoChats[chatId] = {
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
        };
    };

    //! Обработка текстовых сообщений
    bot.on("message", async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        console.log("STATUS ", usersInfoChats[chatId]);

        if (/\/start/.test(text!) || !statusChats?.[chatId]) {
            const existingUser = await User.findOne({ chatId });
            if (existingUser) {
                statusChats[chatId] = "main";
                usersInfoChats[chatId] = {
                    firstName: existingUser.firstName,
                    lastName: existingUser.lastName,
                    email: existingUser.email,
                    phone: existingUser.phone,
                };

                await bot.sendMessage(chatId, `Привет ${existingUser.firstName} ${existingUser.lastName}`, menuButtons);
            } else {
                initNewUser(chatId);
                statusChats[chatId] = "userReg_firstName";
                bot.sendMessage(chatId, "Здравствуйте. Необходимо зарегистрироваться.\nВведите свое имя:");
                return;
            }
        }
        if (text === "Выйти из диалога") {
            statusChats[chatId] = "main";
            delete conversationChatsVK[chatId];
            delete conversationChatsOZON[chatId];
            await bot.sendMessage(chatId, `Вы вышли из диалога. \nСообщения пользователя не помечены как прочитанные.`, menuButtons);
            return;
        }

        if (text?.startsWith("Завершить диалог c")) {
            if (conversationChatsVK[chatId]) {
                const peerName = text.split("c")[1];

                await markMessagesAsRead(conversationChatsVK[chatId].vk, conversationChatsVK[chatId].peer.id);
                statusChats[chatId] = "main";
                delete conversationChatsVK[chatId];
                await bot.sendMessage(chatId, `Диалог с ${peerName} завершен. \nСообщения помечены как прочитанные.`, menuButtons);
                return;
            }

            if (conversationChatsOZON[chatId]) {
                statusChats[chatId] = "main";
                delete conversationChatsVK[chatId];
                const { apiKey, clientId, ozonChatId } = conversationChatsOZON[chatId];
                try {
                    const msgs = await getMessagesFromChat_Ozon(clientId, apiKey, ozonChatId, null, "Backward", 10);

                    for (const msg of msgs) {
                        const { message_id } = msg;
                        console.log("END", message_id);
                        await setAsReadChat_Ozon(clientId, apiKey, ozonChatId, message_id);
                    }

                    await bot.sendMessage(chatId, `Диалог с клиентом Ozon завершен. \nСообщения помечены как прочитанные.`, menuButtons);
                } catch (error) {
                    ("❌CHAT END OZON ERROR❌");
                }
            }
        }
        if (text?.startsWith("Удалить диалог c")) {
            const { vk, peer, groupId } = conversationChatsVK[chatId];
            try {
                await vk.api.messages.deleteConversation({ peer_id: peer.id });

                await bot.sendMessage(chatId, `Диалог с ${peer.first_name}  ${peer.last_name} удален ! `, menuButtons);
                statusChats[chatId] = "main";
                delete conversationChatsVK[chatId];
            } catch (error) {
                console.log("DELETE CONVERSATION ERROR", error);
            }
            return;
        }
        if (text === "Отмена действий ❌") {
            //const existingUser = await User.findOne({ chatId });
            statusChats[chatId] = "main";
            delete conversationChatsOZON[chatId];
            delete conversationChatsVK[chatId];
            delete tempDataChats[chatId];
            delete statusChats[chatId];
            bot.sendMessage(chatId, `Главный канал`, menuButtons);
            return;
        }

        if (text === "Изменить параметры регистрации") {
            statusChats[chatId] = "userReg_firstName";
            tempDataChats[chatId] = {};
            tempDataChats[chatId].update = true;
            bot.sendMessage(chatId, " Введите свое имя:");

            return;
        }

        if (text === "Настройки ⚙️" || text === "/settings") {
            if (usersInfoChats[chatId]) {
                await bot.sendMessage(chatId, `Имя : ${usersInfoChats[chatId].firstName}\nФамилия : ${usersInfoChats[chatId].lastName}\nТелефон : ${usersInfoChats[chatId].phone}\nEmail : ${usersInfoChats[chatId].email}`, menuSettings);
            }

            return;
        }

        //! SING IN
        if (statusChats[chatId] && statusChats[chatId].startsWith("userReg")) {
            const position = statusChats[chatId].split("_")[1];

            if (!text) return;

            if (position === "firstName") {
                if (/^[A-Za-zА-Яа-я]{2,15}$/.test(text)) {
                    usersInfoChats[chatId].firstName = text;
                    statusChats[chatId] = "userReg_lastName";
                    bot.sendMessage(chatId, "Введите свою фамилию:");
                } else {
                    bot.sendMessage(chatId, "⚠️ Ваше имя должно состоять от 2 до 15 букв и не содержать символов! \nУкажите своё имя:");
                }
            }
            if (position === "lastName") {
                if (/^[A-Za-zА-Яа-я]{2,15}$/.test(text)) {
                    usersInfoChats[chatId].lastName = text;
                    statusChats[chatId] = "userReg_phone";
                    bot.sendMessage(chatId, "Укажите свой мобильный телефон в формате +79491112233:");
                } else {
                    bot.sendMessage(chatId, "⚠️ Ваша фамилия длжна состоять от 2 до 15 букв и не содержать символов! \nУкажите свою фамилию:");
                }
            }
            if (position === "phone") {
                const nowPhone = formatPhoneNumber(text);
                if (!!nowPhone) {
                    usersInfoChats[chatId].phone = nowPhone;
                    statusChats[chatId] = "userReg_email";
                    bot.sendMessage(chatId, "Укажите свой email:");
                } else {
                    bot.sendMessage(chatId, "⚠️ Не верный формат телефона! \nУкажите свой мобильный телефон в формате +79491112233:");
                }
            }
            if (position === "email") {
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
                    usersInfoChats[chatId].email = text.toLowerCase();
                    usersInfoChats[chatId].code = generateConfirmationCode();
                    //await sendConfirmationEmail({ email: usersInfoChats[chatId].email, code: usersInfoChats[chatId].code });

                    if (await sendMail365(usersInfoChats[chatId].email, usersInfoChats[chatId].code)) {
                        statusChats[chatId] = "userReg_confirm";
                        bot.sendMessage(chatId, ` Код подверждения регистрации отправлен вам на указанную почту "${usersInfoChats[chatId].email}".\n⚠️"Если письмо не пришло, пожалуйста, проверьте папку «Спам» или «Нежелательная почта»."\nВведите код подтверждения:`, exitBtn);
                    } else {
                        statusChats[chatId] = "userReg_confirm";
                        bot.sendMessage(chatId, `❌ Ошибка отправки почты ! ❌\nВаш код подтверждения регистрации: ${usersInfoChats[chatId].code}\nВведите код подтверждения:`, exitBtn);
                    }
                } else {
                    bot.sendMessage(chatId, "⚠️ Не верный формат email!\nУкажите свой email:", exitBtn);
                }
            }

            if (position === "confirm") {
                if (usersInfoChats[chatId].code === text) {
                    if (tempDataChats?.[chatId]?.update) {
                        const currentUser = await User.findOne({ chatId });
                        if (currentUser) {
                            currentUser.firstName = usersInfoChats[chatId].firstName;
                            currentUser.lastName = usersInfoChats[chatId].lastName;
                            currentUser.email = usersInfoChats[chatId].email;
                            currentUser.phone = usersInfoChats[chatId].phone;
                            currentUser.isConfirmed = true;
                            await currentUser.save();
                            statusChats[chatId] = "main";
                            bot.sendMessage(chatId, "Ваши данные успешно обновлены!", menuButtons);

                            return;
                        }
                    }

                    const user = new User({ firstName: usersInfoChats[chatId].firstName, lastName: usersInfoChats[chatId].lastName, email: usersInfoChats[chatId].email, phone: usersInfoChats[chatId].phone, chatId, isConfirmed: true });
                    await user.save();
                    await bot.sendMessage(chatId, `🌟 Вы успешно зарегестрированы ! 🌟`, menuButtons);
                    statusChats[chatId] = "main";
                    startListenVk();
                } else {
                    await bot.sendMessage(chatId, `⚠️ Вы ввели не верный код!\nУкажите код отправленный на "${usersInfoChats[chatId].email}":`, exitBtn);
                }
            }

            return;
        }

        if (text === "Добавить сообщество VK") {
            statusChats[chatId] = "addvkGroup_channelName";
            bot.sendMessage(chatId, "Введите название Канала:");
        } else if (statusChats[chatId] && statusChats[chatId].startsWith("addvkGroup")) {
            if (!text) return;
            const position = statusChats[chatId].split("_")[1];
            if (position === "channelName") {
                if (text.length > 2 && text.length <= 30) {
                    const isExist = await Channel.findOne({ channelName: text });
                    if (isExist) return bot.sendMessage(chatId, "⚠️ Канал с таким названием уже существует!\nВведите название канала:");
                    tempDataChats[chatId] = {
                        channelName: text,
                    };
                    statusChats[chatId] = "addvkGroup_groupId";
                    bot.sendMessage(chatId, "Введите ID сообщества VK:", menuButtons);
                } else {
                    bot.sendMessage(chatId, "⚠️ Название канала должно состоять от 2 до 30 букв и не содержать символов!\nВведите название канала:");
                }
            }
            if (position === "groupId") {
                if (text.length > 2 && text.length < 30) {
                    const isExist = await Channel.findOne({ groupId: text });
                    if (isExist) return bot.sendMessage(chatId, "⚠️ Канал с таким ID сообщества VK уже существует!\nВведите ID сообщества VK:");
                    tempDataChats[chatId].groupId = text;
                    statusChats[chatId] = "addvkGroup_token";
                    bot.sendMessage(chatId, "Введите TOKEN сообщества VK:");
                } else {
                    bot.sendMessage(chatId, "⚠️ ID сообщества VK для  канала должно состоять от 2 до 30 символов и не содержать пробелов!\nВведите ID сообщества VK");
                }
            }
            if (position === "token") {
                const vk = new VK({ token: text });

                try {
                    const res = await vk.api.groups.getById({
                        group_id: tempDataChats[chatId].groupId,
                    });
                    console.log(res);
                    const user = await User.findOne({ chatId });

                    if (user) {
                        const group = new Channel({ userId: user._id, channelName: tempDataChats[chatId].channelName, groupId: tempDataChats[chatId].groupId, token: text, chatId, type: "vk" });
                        await group.save();

                        statusChats[chatId] = "main";
                        await bot.sendMessage(chatId, `Канал "${tempDataChats[chatId].channelName}" успешно связан с сообществом VK ${tempDataChats[chatId].groupId}.`, menuButtons);
                        startListenVk();
                    } else {
                        bot.sendMessage(chatId, "Пожалуйста, зарегистрируйтесь перед добавлением группы.");
                    }
                } catch (error) {
                    console.log(error);
                    bot.sendMessage(chatId, "⚠️ Не верный токкен сообщества vk.com!\nВведите TOKEN сообщества VK:", menuButtons);
                }
            }

            return;
        }

        //TODO ADD OZON CHANNEL
        if (text === "Добавить OZON Seller") {
            statusChats[chatId] = "addOzon_channelName";
            bot.sendMessage(chatId, "Введите название Канала:");
        } else if (statusChats[chatId] && statusChats[chatId].startsWith("addOzon_")) {
            if (!text) return;
            const position = statusChats[chatId].split("_")[1];

            if (position === "channelName") {
                if (text.length > 2 && text.length <= 30) {
                    const isExist = await Channel.findOne({ channelName: text });
                    if (isExist) return bot.sendMessage(chatId, "⚠️ Канал с таким названием уже существует!\nВведите название канала:");
                    tempDataChats[chatId] = {
                        channelName: text,
                    };
                    statusChats[chatId] = "addOzon_clientId";
                    bot.sendMessage(chatId, "Введите CLIENT_ID продавца OZON:", menuButtons);
                } else {
                    bot.sendMessage(chatId, "⚠️ Название канала должно состоять от 2 до 30 букв и не содержать символов!\nВведите название канала:");
                }
            }

            if (position === "clientId") {
                if (text.length > 2 && text.length < 30) {
                    const isExist = await Channel.findOne({ groupId: text });
                    if (isExist) return bot.sendMessage(chatId, "⚠️ Канал с CLIENT_ID у OZON продавца уже существует!\nВведите CLIENT_ID продавца OZON:");
                    tempDataChats[chatId].groupId = text;
                    statusChats[chatId] = "addOzon_apiKey";
                    bot.sendMessage(chatId, "Введите API_KEY продавца OZON:");
                } else {
                    bot.sendMessage(chatId, "⚠️ CLIENT_ID у OZON продавца должен состоять от 2 до 30 символов и не содержать пробелов!\nВведите CLIENT_ID продавца OZON:");
                }
            }

            if (position === "apiKey") {
                if (text.length > 30 && text.length < 50) {
                    const user = await User.findOne({ chatId });

                    if (user) {
                        const group = new Channel({ userId: user._id, channelName: tempDataChats[chatId].channelName, groupId: tempDataChats[chatId].groupId, token: text, chatId, type: "ozon" });
                        await group.save();

                        statusChats[chatId] = "main";
                        await bot.sendMessage(chatId, `Канал "${tempDataChats[chatId].channelName}" успешно связан с OZON SELLER ${tempDataChats[chatId].groupId}.`, menuButtons);
                    } else {
                        bot.sendMessage(chatId, "Пожалуйста, зарегистрируйтесь перед добавлением группы.");
                    }
                } else {
                    bot.sendMessage(chatId, "⚠️ Не верный API_KEY !\nВведите API_KEY продавца OZON:");
                }
            }
        }

        // Channels
        if (text === "Каналы 📬" || text === "/channels") {
            showChannels({ chatId });
            return;
        }
        //Добавление оператора

        if (statusChats[chatId] && statusChats[chatId].startsWith("addOperator_:")) {
            const [_, channelName] = statusChats[chatId].split("_:");
            const email = text!;
            console.log("OPERATOR ADD", { channelName, email });
            addOperator({ chatId, channelName, email });
            return;
        }

        //Operators
        if (text === "Операторы 🛂" || text === "/operators") {
            showMyOperators({ chatId });
            return;
        }
        //Operators for all channels
        if (statusChats[chatId] && statusChats[chatId] === "addAllChannelsOperator") {
            addOperatorForAllChannels({ chatId, email: text! });
            return;
        }

        //Dialogs
        if (text === "Диалоги ✉️" || text === "/dialogs") {
            showMyDialogs({ chatId });
            return;
        }

        //Dialog SEND MSG VK
        if (text && statusChats[chatId] && statusChats[chatId] === "conversation") {
            //console.log("TO CONVERSATION");
            conversationNow({ chatId, text });
            return;
        }
    });

    //! Обработка нажатий на инлайн-кнопки
    bot.on("callback_query", async (query) => {
        const chatId = query!.message!.chat.id;
        const data = query.data!;
        console.log("callback_query", data);

        // Проверяем, что это кнопка для удаления пользователя
        if (data.startsWith("menu")) {
            const menu = data.split("_")[1];
            console.log(menu);
            bot.sendMessage(chatId, `/${menu}`);
        }
        if (data.startsWith("viewChannel_:")) {
            const channelName = data.split("_:")[1];
            console.log(`VIEW CHANNEL ${channelName}`);
        } else if (data.startsWith("deleteChannel_:")) {
            const channelName = data.split("_:")[1];
            // console.log(`DELETE CHANNEL ${channelName}`);
            dropChannel({ chatId, channelName });
        } else if (data == "addChannel") {
            bot.sendMessage(chatId, "Для добавления нового канала, пожалуйста, выберите его тип", menuAddChannel);
        } else if (data.startsWith("addOperator_:")) {
            const channelName = data.split("_:")[1];
            statusChats[chatId] = `addOperator_:${channelName}`;
            bot.sendMessage(chatId, "Укажите email оператора");
        } else if (data === "addAllChannelsOperator") {
            statusChats[chatId] = `addAllChannelsOperator`;
            bot.sendMessage(chatId, "Укажите email оператора для всех ваших групп : ");
        } else if (data.startsWith(`conversation_:`)) {
            console.log(data);
            const [_, groupId, peerId] = data.split("_:");
            console.log({ groupId, peerId });
            const currentChannel = await Channel.findOne({ groupId });
            const vk = new VK({ token: currentChannel!.token });
            const currentPeer = await getUserVKInfo(vk, Number(peerId));

            if (currentChannel && currentPeer) {
                const userNameStr = `${currentPeer?.first_name} ${currentPeer?.last_name}`;
                await bot.sendMessage(chatId, `Диалог в канале 📬[<a href="https://vk.com/${currentChannel.groupId}">${currentChannel.channelName}</a>] c ${userNameStr}  `, { parse_mode: "HTML", ...menuEndDialogVK({ peerName: userNameStr }) });
                await showHistoryOfConverstationVK({ vkGroupId: currentChannel.groupId, chatId, vk, currentPeer });
                statusChats[chatId] = `conversation`;
                conversationChatsVK[chatId] = { vk, groupId: currentChannel.groupId, peer: currentPeer };
            }
        } else if (data.startsWith(`delOperator_:`)) {
            const [_, groupId, operatorChatId] = data.split("_:");
            const channel = await Channel.findOne({ groupId });
            if (channel) {
                channel.operatorsChatIds = channel.operatorsChatIds.filter((id) => id !== Number(operatorChatId));
                await channel.save();
                await bot.sendMessage(chatId, `Оператор удален с канала [${channel.channelName}]!`);
                await bot.sendMessage(operatorChatId, `Вас убрали с канала [${channel.channelName}]!`);
                startListenVk();
            }
            // `delOperator_:${channel.groupId}_:${operator.chatId}`
        } else if (data.startsWith("zn")) {
            ("zn ${channel.id} ${chat.chat_id}");
            const [_, channelId, ozonChatId] = data.split(" ");
            const channel = await Channel.findById(channelId);
            if (channel) {
                bot.sendMessage(chatId, `Диалог с клиентом Ozone.\nCLIENT_ID: ${channel.groupId}, API_KEY :${channel.token}\nOzonChatId: ${ozonChatId}`, { parse_mode: "HTML", ...menuEndDialogOzon({ peerName: "Клиент с Ozon" }) });
                statusChats[chatId] = `conversation`;
                conversationChatsOZON[chatId] = {
                    clientId: channel.groupId,
                    apiKey: channel.token,
                    ozonChatId,
                };
                showHistoryOfConverstationOzon({ chatId, clientId: channel.groupId, apiKey: channel.token, ozonChatId });
            } else {
                console.log("❌CHANNEL NOT FOUND❌");
            }

            //СОЗДАНИЕ ДИАЛОГОВ
        }
    });

    //!ПРОСЛУШКА VK ГРУП

    async function startListenVk() {
        //завершаем активные прослушки групп
        activeListeners.forEach((stopListenToken, key) => stopListenToken());
        activeListeners.clear();

        try {
            const users: IUser[] = await User.find();

            for (const user of users) {
                const userChannels: IChannel[] = await Channel.find({ chatId: user.chatId, type: "vk" });

                for (const channel of userChannels) {
                    const vk = new VK({ token: channel.token });
                    vk.updates.on("message_new", async (msgContext: MessageContext<ContextDefaultState>) => {
                        //! на новом сообщении - сохраняем в базу и отправляем админу и операторам
                        const senderId = msgContext.senderId; // Используем senderId вместо message.from_id
                        const peerId = msgContext.peerId; // Используем peerId вместо message.peer_id
                        const isMsgFromAdmin = msgContext.isOutbox; //сообщение от группы или от пользователя
                        console.log("✉️", msgContext.text, msgContext as MessageContext<ContextDefaultState>);

                        const newMessage = new Message({
                            channelName: channel.channelName,
                            text: msgContext.text,
                            time: msgContext.updatedAt,
                        });
                        const fromUser = await getUserVKInfo(vk, senderId);

                        //находим канал - вдруг он обновился
                        const currentChannel = await Channel.findOne({ channelName: channel.channelName });
                        if (currentChannel) {
                            if (isMsgFromAdmin) {
                            } else {
                                //!если мы в переписке , то отображаем только сообщения с этого канала и с этим пользователем
                                if (conversationChatsVK[user.chatId] && (conversationChatsVK[user.chatId].groupId !== currentChannel.groupId || conversationChatsVK[user.chatId]?.peer?.id !== peerId)) return;

                                bot.sendMessage(user.chatId, `👑[${currentChannel.channelName}] ${fromUser?.first_name} ${fromUser?.last_name}: ${msgContext.text}`);
                            }

                            currentChannel.operatorsChatIds.forEach((chatId) => bot.sendMessage(chatId, `🛂[${channel.channelName}] ${fromUser?.first_name} ${fromUser?.last_name}: ${msgContext.text}`));
                        }

                        await newMessage.save();
                    });
                    vk.updates
                        .startPolling()
                        .then(() => {
                            console.log(`Прослушка кнала: ${channel.channelName} - ${channel.groupId}`);
                        })
                        .catch(console.error);
                    activeListeners.set(channel.token, () => vk.updates.stop());
                }
            }
        } catch (error) {
            console.error(`Ошибка получения сообщений для группы :`, error);
        }
    }
    //TODO LISTEN OZON
    async function startListenOzon() {
        console.log("🔄️ OZON UPDATE 🔄️");

        try {
            const users: IUser[] = await User.find();

            for (const user of users) {
                const userChannels: IChannel[] = await Channel.find({ chatId: user.chatId, type: "ozon" });

                for (const channel of userChannels) {
                    //собираем чаты в которые рассылаем и бзе активного диалога VK
                    const chatsIds = [channel.chatId, ...channel.operatorsChatIds].filter((chatId) => !!!conversationChatsVK[chatId]);

                    checkLastMessagesOzon(channel.groupId, channel.token, bot, chatsIds, channel.channelName);
                }
            }
        } catch (error) {}

        setTimeout(() => startListenOzon(), 5000);
    }

    //!- ЗАПУСК ПРОСЛУШЕК
    startListenVk();
    startListenOzon();
};

try {
    startBot();
} catch (error) {
    console.log(error);
    startBot();
}
