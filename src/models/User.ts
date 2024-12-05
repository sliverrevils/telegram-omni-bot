import { Schema, model } from "mongoose";

const userSchema = new Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    isConfirmed: { type: Boolean, default: false },
    chatId: { type: Number, required: true, unique: true },
    groups: [{ groupId: String, token: String }], //vk []
    ozon: [{ clientId: String, apiKey: String }], //ozon seller[]
});

export const User = model("User", userSchema);
