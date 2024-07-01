const http = require('http');
const express = require('express');
const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const events = new EventEmitter();

app.use(express.json());

let qrCodeData = '';
let logs = [];

// Helper function to log and send data to the client
const logAndSend = (message, data = null) => {
    const logEntry = { message, data };
    console.log(message);
    logs.push(logEntry);
};

const client = new Client({
    webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    },
});

client.on('qr', (qr) => {
    qrCodeData = qr;
    logAndSend('QR code generated');
});

client.on('ready', () => {
    logAndSend('Client is ready!');
    events.emit('ready');
});

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
        logAndSend(`Replied to ${msg.from}: pong`);
    } else {
        logAndSend(`Message from ${msg.from}: ${msg.body}`);
    }
});

client.initialize();

app.post('/sendMessage', async (req, res) => {
    const { number, message, attachment_path } = req.body;

    // Sanitize and format the phone number
    const sanitized_number = number.toString().replace(/[- )(]/g, "");
    const final_number = sanitized_number.startsWith('62') ? sanitized_number : `62${sanitized_number}`;

    try {
        const number_details = await client.getNumberId(final_number);

        if (number_details) {
            // Send the text message
            await client.sendMessage(number_details._serialized, message);
            logAndSend(`Message sent successfully to ${final_number}`, { number: final_number, message });

            // Send attachment if it exists
            if (attachment_path) {
                const media = MessageMedia.fromFilePath(attachment_path);
                await client.sendMessage(number_details._serialized, media);
                
                const attachmentBase64 = fs.readFileSync(attachment_path, { encoding: 'base64' });
                logAndSend(`Attachment sent to ${final_number}`, { number: final_number, attachment: attachmentBase64 });
            }

            res.status(200).json({ status: 'success', response: 'Message sent successfully' });
        } else {
            logAndSend(`${final_number} Mobile number is not registered`);
            res.status(400).json({ status: 'error', error: 'Mobile number is not registered' });
        }
    } catch (err) {
        logAndSend(`Error sending message to ${final_number}: ${err.message}`);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Endpoint to get QR code
app.get('/getQR', async (req, res) => {
    try {
        if (qrCodeData) {
            const qrCodeUrl = await qrcode.toDataURL(qrCodeData);
            res.json({ qr: qrCodeUrl });
        } else {
            res.json({ qr: null });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Endpoint to get logs
app.get('/getLogs', (req, res) => {
    res.json({ logs: logs });
});

// Endpoint to notify client is ready
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const readyListener = () => {
        res.write('event: ready\n');
        res.write('data: Client is ready\n\n');
        res.end();
    };

    events.on('ready', readyListener);

    req.on('close', () => {
        events.removeListener('ready', readyListener);
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the logs page
app.get('/logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

const PORT = 3001;
server.listen(PORT, () => {
    logAndSend(`Server is running on port ${PORT}`);
});
