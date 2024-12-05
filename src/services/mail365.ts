import axios from "axios";

import dotenv from "dotenv";
dotenv.config();

const mail365ApiKey = process.env.EMAIL_PASS!;
const mailFrom = process.env.EMAIL_USER!;

console.log(mail365ApiKey);

export async function sendMail365(email: string, code: string) {
    try {
        const mail = new FormData();
        mail.append("apiKey", mail365ApiKey);
        mail.append("Subject", "Омниканальный чат: код подтверждения регистрации");
        mail.append("Body", code);
        mail.append("FromAddress", mailFrom);
        mail.append("ToAddress", email);

        const res = await axios.post("https://www.mail365.ru/phpAPI/PostSingleEmail.php", mail, {
            headers: {
                "Content-Type": "text/html; charset=UTF-8",
            },
        });

        console.log(`SENDED CODE to ${email} ✅`);
        return true;
    } catch (error) {
        console.log(`SEND ERROR to ${email}  ❌`, error);
        return false;
    }
}
