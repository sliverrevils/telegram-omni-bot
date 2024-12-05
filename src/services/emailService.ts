import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const USER = process.env.EMAIL_USER!;
const PASS = process.env.EMAIL_PASS!;

interface SendConfirmationEmailOptions {
    email: string;
    code: string;
}

export async function sendConfirmationEmail({ email, code }: SendConfirmationEmailOptions): Promise<void> {
    const transporter = nodemailer.createTransport({
        service: "yandex",
        auth: {
            user: USER,
            pass: PASS,
        },
    });

    // const transporter = nodemailer.createTransport({
    //     host: ",
    //     port: 587,
    //     secure: false, // false для портов 587 и 25, true для порта 465
    //     auth: {
    //         user: USER, // Замените на ваш email Microsoft 365
    //         pass: PASS, // Замените на пароль
    //     },
    //     tls: {
    //         ciphers: "SSLv3", // Убедитесь, что используется безопасное соединение
    //     },
    // });

    // Настройки письма
    const mailOptions = {
        from: USER, // Имя и email отправителя
        to: email, // Email получателя
        subject: "Код подтверждения регистрации в чате",
        text: `Подтверждение регистрации`,
        html: `<p>Ваш код авторизации: <p><b>${code}</b></p></p>`,
    };
    console.log("PREPARE TO SEND", transporter);

    // Отправка письма
    await transporter
        .sendMail(mailOptions)
        .then((data) => console.log("EMAIL SEND", data))
        .catch((err) => console.log("EMAIL ERR", err));
}
