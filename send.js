const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const https = require('https');

async function startBot() {
    // 1. Session එක සකස් කිරීම
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    const sessionData = process.env.SESSION_ID;
    
    try {
        if (sessionData) {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
            console.log("📂 Session Loaded Successfully.");
        }
    } catch (e) {
        console.log("❌ Session Error: " + e.message);
    }

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    // 2. Connection එක ඕපන් වුණාම (GitHub Action එකෙන් වීඩියෝ එවීමට)
    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log("✅ WhatsApp Connected!");

            const userJid = process.env.USER_JID;
            if (fs.existsSync('filename.txt') && userJid) {
                const originalFileName = fs.readFileSync('filename.txt', 'utf8').trim();
                const filePath = `./${originalFileName}`;

                if (fs.existsSync(filePath)) {
                    console.log(`📤 Sending Movie: ${originalFileName}`);
                    await sock.sendMessage(userJid, { 
                        document: fs.readFileSync(filePath), 
                        mimetype: 'video/x-matroska',
                        fileName: originalFileName,
                        caption: `🎬 *MFlix Original Delivery*\n\n🍿 Enjoy your movie!`
                    });
                    console.log("🚀 Sent Successfully!");
                    await delay(5000);
                    process.exit(0);
                }
            }
        }
    });

    // 3. User පණිවිඩයක් එවන විට (Google Script Trigger කිරීමට)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text.startsWith('.tv')) {
            const fileId = text.split(' ')[1];
            if (!fileId) return;

            await sock.sendMessage(from, { text: "⏳ ඔබගේ ඉල්ලීම පද්ධතියට ලැබුණා. කරුණාකර රැඳී සිටින්න..." });

            // ⚠️ වැදගත්: ඔයාගේ Google Script එකේ අලුත්ම URL එකේ තියෙන ID එක විතරක් මෙතනට පේස්ට් කරන්න
            // උදා: AKfycbzc3r7kkyAH6QhFLQyiEuI9ZAoAJuOJ9mkGDzgE8VmMHwkTcmdvguMsxDl3ThghmFC1
            const scriptId = "AKfycby2MnKbKH0etBMQReKGrm0vYgSANOibPiKgMuCeM0PUuTA0KNFNn625Bved9pqyWxQ8";
            
            const postData = JSON.stringify({
                fileId: fileId,
                userJid: from
            });

            const options = {
                hostname: 'script.google.com',
                path: `/macros/s/${scriptId}/exec`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            console.log(`🔗 Triggering Google Script for ID: ${fileId}`);

            const req = https.request(options, (res) => {
                console.log(`📡 Status Code: ${res.statusCode}`);
                // 302 (Redirect) ආවත් ශීට් එක අප්ඩේට් වෙනවා
            });

            req.on('error', (e) => {
                console.error(`❌ Error triggering script: ${e.message}`);
            });

            req.write(postData);
            req.end();
        }
    });
}

startBot();
