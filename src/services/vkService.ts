// import { User } from "./models/User";

// import { Channel } from "./models/Channel";
// import { IChannel, IUser } from "..";
// import { ContextDefaultState, MessageContext, VK } from "vk-io";

// //Массив для завершения слушания токенов VK
// const activeListeners: Map<string, () => void> = new Map();

// export async function startListenVk() {
//     //завершаем активные прослушки групп
//     activeListeners.forEach((stopListenToken, key) => stopListenToken());
//     activeListeners.clear();

//     try {
//         const users: IUser[] = await User.find();

//         for (const user of users) {
//             const userChannels: IChannel[] = await Channel.find({ chatId: user.chatId });

//             for (const channel of userChannels) {
//                 const vk = new VK({ token: channel.token });
//                 vk.updates.on("message_new", async (msgContext: MessageContext<ContextDefaultState>) => {
//                     //! на новом сообщении - сохраняем в базу и отправляем админу и операторам
//                     const senderId = msgContext.senderId; // Используем senderId вместо message.from_id
//                     const peerId = msgContext.peerId; // Используем peerId вместо message.peer_id
//                     const isMsgFromAdmin = msgContext.isOutbox; //сообщение от группы или от пользователя
//                     console.log("✉️", msgContext.text, msgContext as MessageContext<ContextDefaultState>);

//                     const newMessage = new Message({
//                         channelName: channel.channelName,
//                         text: msgContext.text,
//                         time: msgContext.updatedAt,
//                     });
//                     const fromUser = await getUserVKInfo(vk, senderId);

//                     //находим канал - вдруг он обновился
//                     const currentChannel = await Channel.findOne({ channelName: channel.channelName });
//                     if (currentChannel) {
//                         if (isMsgFromAdmin) {
//                         } else {
//                             //!если мы в переписке , то отображаем только сообщения с этого канала и с этим пользователем
//                             if (conversationChatsVK[user.chatId] && (conversationChatsVK[user.chatId].groupId !== currentChannel.groupId || conversationChatsVK[user.chatId]?.peer?.id !== peerId)) return;

//                             bot.sendMessage(user.chatId, `👑[${currentChannel.channelName}] ${fromUser?.first_name} ${fromUser?.last_name}: ${msgContext.text}`);
//                         }

//                         currentChannel.operatorsChatIds.forEach((chatId) => bot.sendMessage(chatId, `🛂[${channel.channelName}] ${fromUser?.first_name} ${fromUser?.last_name}: ${msgContext.text}`));
//                     }

//                     await newMessage.save();
//                 });
//                 vk.updates
//                     .startPolling()
//                     .then(() => {
//                         console.log(`Прослушка кнала: ${channel.channelName} - ${channel.groupId}`);
//                     })
//                     .catch(console.error);
//                 activeListeners.set(channel.token, () => vk.updates.stop());
//             }
//         }
//     } catch (error) {
//         console.error(`Ошибка получения сообщений для группы :`, error);
//     }
// }
