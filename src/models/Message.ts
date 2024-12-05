import { Schema, model } from "mongoose";

const messageSchema = new Schema({
    channelName: { type: String, require: true },
    text: { type: String, require: true },
    time: { type: Number, required: true },
});

export const Message = model("Message", messageSchema);
