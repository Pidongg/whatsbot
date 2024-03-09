'use strict';

const apiKey = "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";

const OpenAI = require('openai');

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

const openai = new OpenAI({apiKey: apiKey});

async function generateText(message) {
    const completion = await openai.chat.completions.create({
        messages: [{"role": "user", "content": message}],
        model: "gpt-3.5-turbo",
    });

    return completion.choices[0].message.content;
}

const { Client, Location, Poll, List, Buttons, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth(),
    // proxyAuthentication: { username: 'username', password: 'password' },
    puppeteer: { 
        // args: ['--proxy-server=proxy-server-that-requires-authentication.example.com'],
        headless: false
    }
});
function authenticateUser() {
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

async function sends_message(number, message) {
    const isAuthenticated = await authenticateUser();
    console.log('isAuthenticated', isAuthenticated);
    if (!isAuthenticated) {
        // Handle failed authentication (e.g., display error message)
        console.error("Authentication failed. Message not sent.");
    }

    client.on('ready', () => {
        console.log('READY');
        client.sendMessage(number, message);
        console.log('MESSAGE SENT');
    });

    // when receive message from number
    client.on('message', async msg => {
        console.log('MESSAGE RECEIVED', msg);

        if (msg.from === '447529181976@c.us') {
            const response = await generateText(message);
            msg.reply(response);
        }
    });
}

app.use(bodyParser.json());

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});

app.post('/sends-message', async (req, res) => {
    const {number, message} = req.body;
    const to_send = await generateText(message);
    sends_message(number + '@c.us', to_send);
    res.send({msg:to_send});
});