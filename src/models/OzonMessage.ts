import { model, Schema } from "mongoose";

const ozonMsgSchema = new Schema({
    chat_id: { type: String, require: true },
    message_id: { type: String, require: true },
    user_id: { type: String, require: true },
    text: { type: String, require: true },
    date: { type: String, require: true },
});

export const OzonMsg = model("OzonMsg", ozonMsgSchema);
