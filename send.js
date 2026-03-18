const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    // GitHub Workflow එකෙන් ලැබෙන Variables
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID;

    // --- Authentication ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Processing Error"); }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ["MFlix-Engine", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                // 1. WhatsApp Notification
                await sock.sendMessage(userJid, { text: "✅ *Request Received...*" });
                await delay(500);
                await sock.sendMessage(userJid, { text: "📥 *Download වෙමින් පවතී...*" });

                // 2. Google Drive Download (Using gdown to get original name)
                console.log("Starting GDown...");
                // fuzzy=True නිසා ලින්ක් එක දුන්නත් ID එක විතරක් දුන්නත් වැඩ කරනවා
                execSync(`gdown --fuzzy https://drive.google.com/uc?id=${fileId}`);

                // 3. මුල්ම ෆයිල් එකේ නම හොයාගන්නා ලොජික් එක
                const allFiles = fs.readdirSync('.');
                const originalFile = allFiles.find(f => 
                    f !== 'send.js' && 
                    f !== 'package.json' && 
                    f !== 'package-lock.json' && 
                    f !== 'node_modules' && 
                    f !== 'auth_info' && 
                    f !== '.github' && 
                    f !== 'downloader.py' &&
                    !fs.lstatSync(f).isDirectory()
                );

                if (!originalFile) throw new Error("FILE_NOT_FOUND");

                await sock.sendMessage(userJid, { text: "📤 *Upload වෙමින් පවතී...*" });

                // 4. File Type එක අඳුරගැනීම
                const extension = path.extname(originalFile).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(extension);
                
                let captionHeader = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";
                let mimeType = isSub ? "text/plain" : "application/octet-stream";

                // 5. Send as DOCUMENT (Original Format)
                await sock.sendMessage(userJid, {
                    document: { url: `./${originalFile}` },
                    fileName: originalFile,
                    mimetype: mimeType,
                    caption: `${captionHeader}\n\n📦 *File :* ${originalFile}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                // 6. Success Message
                await sock.sendMessage(userJid, { 
                    text: "☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්න...* 💝" 
                });

                // Cleanup
                if (fs.existsSync(originalFile)) fs.unlinkSync(originalFile);
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                console.error(err);
                await sock.sendMessage(userJid, { text: "❌ *වීඩියෝ හෝ Subtitles ගොනුවේ දෝෂයක්...*" });
                process.exit(1);
            }
        }
    });
}

startBot();
