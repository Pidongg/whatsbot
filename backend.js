const express = require('express');
const MessageMedia = require('whatsapp-web.js').MessageMedia;
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require("fs");
const fetch = require("node-fetch");
const { start } = require('repl');
require('dotenv').config();
const { HarmBlockThreshold, HarmCategory } = require("@google/generative-ai");


const app = express();
const port = 3000;

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ];

const model = genai.getGenerativeModel({ model: "gemini-1.5-pro",
    systemInstruction: `You are acting on behalf of an user, messaging someone on WHATSAPP. 
Please:
- Act as the user. Be succinct and natural.
- Do NOT say something you can't do. You can ONLY text. Do NOT make any promises for the user.
- Do NOT escalate things such that it needs to be handled by the user. If you can't handle the situation, STOP texting. Do NOT respond anymore.
- Do NOT expect more information from the user, or use place-holders for new information (ie. [Insert your name])
- Do NOT use any information you are NOT given. Do NOT make assumptions.
- Do NOT repeat messages you were given.`,
safetySettings: safetySettings});

async function generateText(context, msg) {
    const chat = model.startChat({
        history: context,
        generationConfig: {
            maxOutputTokens:100,
            temperature: 0.1
        }
    });

    const result = await chat.sendMessage(msg);
    const response = await result.response.text();
    return response;
}

async function generateImage(prompt, callback) {
    const options = {
        url: 'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.STABILITY_KEY}`
        },
        json: {
            prompt: prompt,
            num_images: 1,
            size: 1024,
        }
    };

    request(options, (error, response, body) => {
        if (error) {
            callback(error);
            return;
        }

        if (response.statusCode !== 200) {
            callback(new Error(`API Error: ${response.statusCode}`));
            return;
        }

        callback(null, body);
    });
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: false
    }
});

async function authenticateUser() {
    return new Promise((resolve, reject) => {
        client.initialize();

        client.on('loading_screen', (percent, message) => {
            console.log('LOADING SCREEN', percent, message);
        });

        client.on('qr', (qr) => {
            console.log('QR RECEIVED', qr);
        });

        client.on('authenticated', () => {
            console.log('AUTHENTICATED');
            resolve(true);
        });

        client.on('auth_failure', msg => {
            console.error('AUTHENTICATION FAILURE', msg);
            resolve(false);
        });
    });
}

let isReady = false;

async function clientReady() {
    return new Promise((resolve, reject) => {
        if (isReady) {
            resolve(true);
            return;
        }

        client.on('ready', () => {
            isReady = true;
            console.log('READY');
            resolve(true);
        });
    });
}

client.promises ??= {};
client.promises.sendMessage = (number, message) => {
    return new Promise((resolve, reject) => {
        client.sendMessage(number, message);
        resolve();
    });
}

const clientOnMessageHandlers = [];
const addClientOnMessageHandler = (handler) => {
    clientOnMessageHandlers.push(handler);
    return handler;
}

const removeClientOnMessageHandler = (handler) => {
    const index = clientOnMessageHandlers.indexOf(handler);
    if (index > -1) {
        clientOnMessageHandlers.splice(index, 1);
    }
}

client.on('message', async msg => {
    for (const handler of clientOnMessageHandlers) {
        await handler(msg);
    }
});

async function sends_message(number, reason, relation, context) {
    await clientReady();

    const history = [];
    const system_instruction = `Instructions specific to this conversation:
    - The reason for your conversation: ${reason}
    - The recipient is your: ${relation}
    - A bit of context: ${context}`;

    history.push({ role: "user", parts: [{ text: system_instruction }] });

    const sendMessage = async (message) => {
        await client.promises.sendMessage(number, message);
        history.push({ "role": "model", parts:[{text: message}] });
    }

    const initial_msg = "You now become the user who gave you the guidelines, messaging on whatsapp. Please give your initial message to the person you are texting:";

    const agent_message = await generateText(history, initial_msg);
    history.push({ "role": "user", parts:[{text: initial_msg}]});
    await sendMessage(agent_message);
    startTimestamp = Date.now();
    const handler = addClientOnMessageHandler(async msg => {
        // if (msg.from === number && msg.timestamp * 1000 > startTimestamp) {
        if (msg.from === number) {

            if (history.length > 10){
                history.push({ "role": "user", parts:[{text: `Reminder from the user you are acting on behalf of:  
Please:
- Act as the user. Be succinct and natural.
- Do NOT say something you can't do. You can ONLY text. Do NOT make any promises for the user.
- Do NOT escalate things such that it needs to be handled by the user. If you can't handle the situation, STOP texting. Do NOT respond anymore.
- Do NOT expect more information from the user, or use place-holders for new information (ie. [Insert your name])
- Do NOT use any information you are NOT given. Do NOT make assumptions.
- Do NOT repeat messages you were given.
- The reason for your conversation: ${reason}
- The recipient is your: ${relation}
- Your context given at the start of the conversation: ${context}.`}]});
            }
            console.log(msg);
            const response = await generateText(history, msg.body);
            history.push({ "role": "user", parts:[{text: msg.body}]});
            await sendMessage(response);
            startTimestamp = Date.now();
        }
    });

    return agent_message;
}

const path = "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image";
const headers = {
    Accept: "application/json",
    Authorization: "Bearer " + process.env.STABILITY_KEY,
    "Content-Type": "application/json",
};

const generateAvatar = async (prompt) => {
    const body = {
        steps: 50,
        width: 1024,
        height: 1024,
        seed: 0,
        cfg_scale: 8,
        samples: 1,
        text_prompts: [
            {
                "text": prompt,
                "weight": 1
            }
        ],
    };
    const response = await fetch(
        path,
        {
            headers,
            method: "POST",
            body: JSON.stringify(body),
        }
    );
    if (!response.ok) {
        throw new Error(`Non-200 response: ${await response.text()}`)
    }
    const responseJSON = await response.json();
    responseJSON.artifacts.forEach((image, index) => {
        fs.writeFileSync(
            `avatar.png`,
            Buffer.from(image.base64, 'base64')
        )
    });
}

async function change_avatar(prompt) {
    await clientReady();
    await client.setProfilePicture(MessageMedia.fromFilePath("avatar.png"));
}

const setupWhatsappWeb = async () => {
    const isAuthenticated = await authenticateUser();
    console.log('isAuthenticated', isAuthenticated);
    if (!isAuthenticated) {
        console.error("Authentication failed. Message not sent.");
    }

    await clientReady();
}

app.use(bodyParser.json());
app.use(cors());

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});

app.post('/sends-message', async (req, res) => {
    await setupWhatsappWeb();

    const { number: rawNumber, reason, relation, context} = req.body;
    const number = rawNumber.replace('+', ''); // remove + from number

    const agent_initial_message = await sends_message(number + '@c.us', reason, relation, context);
    res.send({ msg: agent_initial_message });
});

app.post('/change-avatar', async (req, res) => {
    await setupWhatsappWeb();

    const { data } = req.body;
    change_avatar(data);
    res.send({ msg: "Avatar changed" });
});

app.post('/generate-avatar', async (req, res) => {
    const { data } = req.body;
    const ans = await generateAvatar(data);
    console.log("ans", ans)
    res.send({ img: "generated" });
});