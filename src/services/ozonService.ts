import axios from "axios";
import { OzonMsg } from "../models/OzonMessage";
import mongoose from "mongoose";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
dotenv.config();

const OZON_API_URL = "https://api-seller.ozon.ru";
const CLIENT_ID = "453435"; // Укажите ваш Client ID
const API_KEY = "dbfc0638-5956-443d-b0d1-1d304eb1256c"; // Укажите ваш API Key

const chatIdsChash = new Map<string, string>();

mongoose.connect(process.env.MONGODB_URI!);

interface IChatOzon {
    chat_id: string;
    chat_status: "Opened" | "Closed";
    chat_type: string;
    created_at: string;
    unread_count: number;
    last_message_id: string;
    first_unread_message_id: string;
}

interface IChatsOzonRes {
    client_id: string;
    api_key: string;
    chats: IChatOzon[];
}

interface IMessageOzon {
    message_id: string;
    user: {
        id: string;
        type: "Customer" | "Seller";
    };
    created_at: string;
    is_read: true;
    data: [string];
    context: {
        sku: string;
        order_number: string;
    };
}
// mychatId-  190dd439-217f-4dae-aae0-cfd2e86b6180
//! - ПОЛУЧИТЬ ВСЕ ЧАТЫ
export const getChats_Ozon = async (client_id: string, api_key: string): Promise<IChatsOzonRes> => {
    const result: IChatsOzonRes = {
        client_id,
        api_key,
        chats: [],
    };
    try {
        const response = await axios.post(
            `${OZON_API_URL}/v2/chat/list`, // Проверьте, что этот эндпоинт актуален
            {
                filter: {
                    chat_status: "Opened",
                    unread_only: true,
                },
                limit: 1000,
                offset: 0,
            },
            {
                headers: {
                    "Client-Id": client_id,
                    "Api-Key": api_key,
                    "Content-Type": "application/json",
                },
            }
        );

        result.chats = response.data.chats;

        return result;
    } catch (error: any) {
        console.error("Ошибка:", error.response?.data || error.message);
        return result;
    }
};

//! - ПОМЕТИТЬ ЧАТ КАК ПРОЧИТАННЫЙ
export const setAsReadChat_Ozon = async (client_id: string, api_key: string, chat_id: string, from_message_id: string): Promise<boolean> => {
    try {
        const response = await axios.post(
            `${OZON_API_URL}/v2/chat/read`, // Проверьте, что этот эндпоинт актуален
            {
                chat_id,
                from_message_id,
            },
            {
                headers: {
                    "Client-Id": client_id,
                    "Api-Key": api_key,
                    "Content-Type": "application/json",
                },
            }
        );

        const res: number = response.data.unread_count;

        return !!!res;
    } catch (error: any) {
        console.error("Ошибка:", error.response?.data || error.message);
        return false;
    }
};
//! - ОТПРАВИТЬ СООБЩЕНИЕ
export const sendMsgToChat_Ozon = async (client_id: string, api_key: string, chat_id: string, text: string): Promise<boolean> => {
    try {
        const response = await axios.post(
            `${OZON_API_URL}/v1/chat/send/message`, // Проверьте, что этот эндпоинт актуален
            {
                chat_id,
                text,
            },
            {
                headers: {
                    "Client-Id": client_id,
                    "Api-Key": api_key,
                    "Content-Type": "application/json",
                },
            }
        );

        const res: number = response.data.unread_count;

        return !!!res;
    } catch (error: any) {
        console.error("Ошибка:", error.response?.data || error.message);
        return false;
    }
};

//! - ПОЛУЧЕНИЕ ВСЕХ СООБЩЕНИЙ ЧАТА
export const getMessagesFromChat_Ozon = async (client_id: string, api_key: string, ozonChatId: string, from_message_id: string | null, direction: "Forward" | "Backward" | null, limit = 1): Promise<IMessageOzon[]> => {
    try {
        const response = await axios.post(
            `${OZON_API_URL}/v2/chat/history`, // Проверьте, что этот эндпоинт актуален
            {
                chat_id: ozonChatId,
                limit,
                direction: direction ? direction : limit > 1 ? "Forward" : "Backward",
                //direction: "Backward",
                from_message_id,
            },
            {
                headers: {
                    "Client-Id": client_id,
                    "Api-Key": api_key,
                    "Content-Type": "application/json",
                },
            }
        );

        const messages: IMessageOzon[] = response.data.messages;
        // console.log("➡️СCHAT ID ", ozonChatId, from_message_id, response.data.messages);
        return messages;
    } catch (error: any) {
        console.error("Ошибка:", error.response?.data || error.message);
        return [];
    }
};

// Вызов функции

export async function checkLastMessagesOzon(client_id: string, api_key: string, bot: TelegramBot, chatsIds: number[], channelName: string) {
    const showMsg_Ozon = async (message: IMessageOzon, chat_id: string, info: "LAST" | "RPE-LAST") => {
        console.log(`${info}✉️ ${new Date(message.created_at).toLocaleString()}`, message.data[0]);

        chatsIds.map((chatId) => bot.sendMessage(chatId, `${channelName} : ${message.data[0]}`));
        //сохраняем/обновляем в базу последнее сообщение чата
        const chatMsg = await OzonMsg.findOne({ chat_id });

        if (chatMsg) {
            if (chatMsg.message_id !== message.message_id) {
                chatMsg.message_id = message.message_id;
                chatMsg.text = message.data[0];
                chatMsg.date = message.created_at;
                await chatMsg.save();
            }
        } else {
            const newMsg = new OzonMsg({
                chat_id,
                message_id: message.message_id,
                user_id: message.user.id,
                text: message.data[0],
                date: message.created_at,
            });
            await newMsg.save();
        }
    };
    //заполняем кэш отправленных
    if (!chatIdsChash.size) {
        (await OzonMsg.find()).forEach((savedMsg) => chatIdsChash.set(savedMsg.chat_id!, savedMsg.message_id!));
    }
    //console.log("start----", chatIdsChash);

    //получаем список чатов
    const chats = (await getChats_Ozon(client_id, api_key)).chats.filter((chat) => chat.chat_type == "Buyer_Seller");

    for (const chat of chats) {
        if (chatIdsChash.get(chat.chat_id)) {
            if (chatIdsChash.get(chat.chat_id) !== String(chat.last_message_id)) {
                //если есть читаем все после последнего записанного и без своих
                const lastMsgs = (await getMessagesFromChat_Ozon(client_id, api_key, chat.chat_id, chatIdsChash.get(chat.chat_id)!, null, 10)).filter((msg) => String(msg.message_id) !== String(chatIdsChash.get(chat.chat_id)) && msg.user.type !== "Seller");

                for (const msg of lastMsgs) {
                    chatIdsChash.set(chat.chat_id, String(msg.message_id));
                    await showMsg_Ozon(msg, chat.chat_id, "RPE-LAST");
                }
            }
        } else {
            //если сообщений чата нет в кэше , то читаем последнее
            const msgs = await getMessagesFromChat_Ozon(client_id, api_key, chat.chat_id, null, null, 1);
            const lastMsg = msgs[0];

            if (lastMsg) {
                chatIdsChash.set(chat.chat_id, String(lastMsg.message_id));
                await showMsg_Ozon(lastMsg, chat.chat_id, "LAST");
            } else {
                console.log("❌ MSG ERROR ❌", { chat_id: chat.chat_id, last_message_id: chat.last_message_id, msgs });
            }
        }
    }

    //console.log("CHASH 📅\n", chatIdsChash);
    //setTimeout(() => checkLastMessagesOzon(client_id, api_key, bot, chatsIds, channelName), 10000);
}

//checkLastMessagesOzon(CLIENT_ID, API_KEY);
