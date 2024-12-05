import { Schema, model } from "mongoose";

const channelSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    channelName: { type: String, require: true },
    groupId: { type: String, required: true }, //OZON CLIENT_ID
    token: { type: String, required: true }, //OZON API_KEY
    chatId: { type: String, required: true }, // admin
    type: { type: String, require: true }, // тип площадки - vk || ozon
    operatorsChatIds: {
        type: [Number],
        default: [],
        required: true,
    },
});

export const Channel = model("Channel", channelSchema);
