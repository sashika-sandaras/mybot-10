const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID; // උදා: hg80f6ipqhzl
    const voeKey = process.env.VOE_KEY;

    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Error"); }
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

    async function sendMsg(text) {
        await sock.sendMessage(userJid, { text: text });
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                await sendMsg("✅ *Request Received...*");
                await delay(500);
                await sendMsg("📥 *Generating Direct Link...*");

                const pyScript = `
import os, requests, re, sys, subprocess

f_id = "${fileId}"
v_key = "${voeKey}"
ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

def fetch_link():
    # ක්‍රමය 1: VOE Direct Link API (බොහෝවිට සාර්ථකයි)
    try:
        api = f"https://voe.sx/api/file/direct_link?key={v_key}&file_code={f_id}"
        r = requests.get(api, timeout=10).json()
        if r.get('success'):
            return r['result']['url'], r['result'].get('name', 'video.mp4')
    except: pass

    # ක්‍රමය 2: VOE Info API
    try:
        api = f"https://voe.sx/api/drive/v2/file/info?key={v_key}&file_code={f_id}"
        r = requests.get(api, timeout=10).json()
        if r.get('success') and r['result'].get('direct_url'):
            return r['result']['direct_url'], r['result'].get('name', 'video.mp4')
    except: pass
    
    return None, None

try:
    d_url, name = fetch_link()
    
    if not d_url:
        sys.stderr.write("Unable to generate link. Please check if your VOE_KEY is correct and 'Direct Download' is enabled in settings.")
        sys.exit(1)

    # Curl හරහා බාගැනීම
    cmd = f'curl -L -k -s -A "{ua}" -o "{name}" "{d_url}"'
    res = subprocess.call(cmd, shell=True)
    if res == 0: print(name)
    else: sys.exit(1)

except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);

                let fileName;
                try {
                    fileName = execSync('python3 downloader.py').toString().trim();
                } catch (pyErr) {
                    let errorMsg = pyErr.stderr.toString() || "API Error";
                    await sendMsg("❌ *දෝෂය:* " + errorMsg);
                    throw pyErr;
                }

                if (!fileName || !fs.existsSync(fileName)) throw new Error("File missing");

                await sendMsg("📤 *Uploading to WhatsApp...*");

                const ext = path.extname(fileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                const mime = isSub ? 'text/plain' : (ext === '.mp4' ? 'video/mp4' : 'video/x-matroska');

                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `💚 *Upload Success*\n\n📦 *File:* ${fileName}\n🏷️ *Mflix WhDownloader*`
                });

                await sendMsg("☺️ *Done!*");
                
                fs.unlinkSync(fileName);
                fs.unlinkSync('downloader.py');
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                process.exit(1);
            }
        }
    });
}

startBot();
