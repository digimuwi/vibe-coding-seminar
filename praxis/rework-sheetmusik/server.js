const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 8082;

// --- Security & Crypto Configurations ---
const SECRET_FILE = path.join(__dirname, 'system_secret.key');
let SYSTEM_KEY;
if (fs.existsSync(SECRET_FILE)) {
    try {
        SYSTEM_KEY = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'hex');
    } catch (e) {
        console.error("Error reading system_secret.key, regenerating...", e);
        const key = crypto.randomBytes(32);
        fs.writeFileSync(SECRET_FILE, key.toString('hex'), 'utf8');
        SYSTEM_KEY = key;
    }
} else {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(SECRET_FILE, key.toString('hex'), 'utf8');
    SYSTEM_KEY = key;
    console.log(`Generated new system_secret.key`);
}

const USERS_FILE = path.join(__dirname, 'users.json');
function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading users.json:", e);
        return {};
    }
}
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// Derive key using PBKDF2
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
}

// Encrypt string with AES-256-CBC
function encryptText(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let ciphertext = cipher.update(text, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    return {
        iv: iv.toString('hex'),
        ciphertext: ciphertext
    };
}

// Decrypt string with AES-256-CBC
function decryptText(encrypted, key) {
    const iv = Buffer.from(encrypted.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

const sessions = {}; // token -> { username, fileKey, role }

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'Authentifizierung erforderlich (Token fehlt).' });
    }
    
    const session = sessions[token];
    if (!session) {
        return res.status(403).json({ success: false, error: 'Sitzung abgelaufen oder ungültig.' });
    }
    
    req.user = session;
    next();
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure paths
const LIBRARY_DIR = path.join(__dirname, 'public', 'library');
const TEMP_DIR = path.join(__dirname, 'temp_omr');

// Ensure directories exist
if (!fs.existsSync(LIBRARY_DIR)) {
    fs.mkdirSync(LIBRARY_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Multer for upload storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_DIR);
    },
    filename: (req, file, cb) => {
        // Sanitize filename
        const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
        cb(null, `${Date.now()}_${safeName}`);
    }
});
const upload = multer({ storage });

// Helper: Find Audiveris Path on Windows
function getAudiverisCommand() {
    if (process.platform !== 'win32') {
        return 'audiveris'; // On Raspberry Pi / Linux, assume it's global in PATH
    }
    
    // Windows common installation paths
    const commonPaths = [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Audiveris', 'Audiveris.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Audiveris', 'bin', 'Audiveris.bat'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Audiveris', 'Audiveris.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Audiveris', 'bin', 'Audiveris.bat'),
        path.join(process.env.USERPROFILE || 'C:\\Users\\default', 'AppData', 'Local', 'Programs', 'Audiveris', 'Audiveris.exe'),
        path.join(process.env.USERPROFILE || 'C:\\Users\\default', 'AppData', 'Local', 'Programs', 'Audiveris', 'bin', 'Audiveris.bat')
    ];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            console.log(`Audiveris CLI found at Windows path: ${p}`);
            return `"${p}"`;
        }
    }
    
    return 'audiveris'; // Fallback to PATH
}

// Helper: Find LilyPond Paths on Windows
function getLilyPondCommand() {
    if (process.platform !== 'win32') {
        return { lilypond: 'lilypond', python: 'python3', musicxml2ly: 'musicxml2ly' };
    }

    const userProfile = process.env.USERPROFILE || 'C:\\Users\\default';
    const lilypondPaths = [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'LilyPond', 'bin', 'lilypond.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'LilyPond', 'usr', 'bin', 'lilypond.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LilyPond', 'bin', 'lilypond.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LilyPond', 'usr', 'bin', 'lilypond.exe')
    ];

    // Search winget directories
    const wingetPackagesDir = path.join(userProfile, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPackagesDir)) {
        try {
            const pkgFolders = fs.readdirSync(wingetPackagesDir);
            for (const folder of pkgFolders) {
                if (folder.toLowerCase().includes('lilypond')) {
                    const subDir = path.join(wingetPackagesDir, folder);
                    const subFolders = fs.readdirSync(subDir);
                    for (const sub of subFolders) {
                        if (sub.toLowerCase().startsWith('lilypond')) {
                            const binPath = path.join(subDir, sub, 'bin', 'lilypond.exe');
                            if (fs.existsSync(binPath)) {
                                lilypondPaths.push(binPath);
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error reading winget package folders:', e);
        }
    }

    // Find first existing
    for (const lp of lilypondPaths) {
        if (fs.existsSync(lp)) {
            const binDir = path.dirname(lp);
            const pyScript = path.join(binDir, 'musicxml2ly.py');
            const pythonExe = path.join(binDir, 'python.exe');
            if (fs.existsSync(pyScript) && fs.existsSync(pythonExe)) {
                return {
                    lilypond: `"${lp}"`,
                    python: `"${pythonExe}"`,
                    musicxml2ly: `"${pyScript}"`
                };
            }
        }
    }

    return { lilypond: 'lilypond', python: 'python', musicxml2ly: 'musicxml2ly' };
}

// Helper: Find MuseScore Path on Windows
function getMuseScoreCommand() {
    if (process.platform !== 'win32') {
        return 'mscore'; // Default on Linux/Pi
    }

    const mscorePaths = [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'MuseScore 4', 'bin', 'MuseScore4.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'MuseScore 3', 'bin', 'MuseScore3.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'MuseScore 3', 'bin', 'MuseScore.exe')
    ];

    for (const p of mscorePaths) {
        if (fs.existsSync(p)) {
            return `"${p}"`;
        }
    }

    return 'mscore'; // Fallback to PATH
}

// Helper: Cleanup temp files starting with taskId prefix
function cleanupTempFiles(taskId) {
    try {
        const files = fs.readdirSync(TEMP_DIR);
        files.forEach(file => {
            if (file.startsWith(`export_${taskId}`)) {
                try {
                    fs.unlinkSync(path.join(TEMP_DIR, file));
                } catch (e) {
                    // Ignore cleanup error
                }
            }
        });
    } catch (e) {
        console.error('Error during cleanup of task files:', e);
    }
}

// Helper: Decompress MXL file (Zip Archive) cross-platform
function decompressMxl(mxlPath, destDir) {
    return new Promise((resolve, reject) => {
        if (process.platform === 'win32') {
            // Use Windows PowerShell to copy to a .zip temporary file, expand, and clean up
            const tempZipPath = path.join(path.dirname(mxlPath), 'temp_archive.zip');
            const cmd = `powershell -Command "Copy-Item -Path '${mxlPath}' -Destination '${tempZipPath}' -Force; Expand-Archive -Path '${tempZipPath}' -DestinationPath '${destDir}' -Force; Remove-Item '${tempZipPath}' -Force -ErrorAction SilentlyContinue"`;
            console.log(`Running MXL extraction: ${cmd}`);
            exec(cmd, (err, stdout, stderr) => {
                if (err) return reject(new Error(`Powershell expansion failed: ${stderr || err.message}`));
                resolve();
            });
        } else {
            // Use Linux unzip (standard on Raspberry Pi OS)
            const cmd = `unzip -o "${mxlPath}" -d "${destDir}"`;
            console.log(`Running MXL extraction: ${cmd}`);
            exec(cmd, (err, stdout, stderr) => {
                if (err) return reject(new Error(`Linux unzip failed: ${stderr || err.message}`));
                resolve();
            });
        }
    });
}

// Helper: Find first file matching extension recursively
function findFileByExtension(dir, ext) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            const found = findFileByExtension(fullPath, ext);
            if (found) return found;
        } else if (file.toLowerCase().endsWith(ext.toLowerCase())) {
            return fullPath;
        }
    }
    return null;
}

// Helper: Recursive directory cleanup
function cleanDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

// --- AUTHENTICATION & USER MANAGEMENT ENDPOINTS ---

// Register new account
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Benutzername und Passwort sind erforderlich.' });
    }
    
    // Sanitize username
    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '').trim().toLowerCase();
    if (!safeUsername) {
        return res.status(400).json({ success: false, error: 'Ungültiger Benutzername.' });
    }

    const users = loadUsers();
    if (users[safeUsername]) {
        return res.status(400).json({ success: false, error: 'Benutzername existiert bereits.' });
    }

    // First registered user is automatically approved admin
    const isFirstUser = Object.keys(users).length === 0;
    const role = isFirstUser ? 'admin' : 'user';
    const status = isFirstUser ? 'approved' : 'pending';

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');

    // Generate random File Encryption Key (FEK) for this user
    const fek = crypto.randomBytes(32);
    
    // Encrypt FEK using user password-derived key
    const userPassKey = deriveKey(password, salt);
    const encryptedFek = encryptText(fek.toString('hex'), userPassKey);
    
    // Encrypt FEK using system secret key
    const systemEncryptedFek = encryptText(fek.toString('hex'), SYSTEM_KEY);

    users[safeUsername] = {
        salt,
        hash,
        role,
        status,
        encryptedFek,
        systemEncryptedFek
    };

    saveUsers(users);

    res.json({ 
        success: true, 
        message: isFirstUser 
            ? 'Admin-Konto erfolgreich registriert und freigegeben.' 
            : 'Konto registriert. Bitte warte auf Freigabe durch den Administrator.' 
    });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Benutzername und Passwort sind erforderlich.' });
    }

    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '').trim().toLowerCase();
    const users = loadUsers();
    const user = users[safeUsername];

    if (!user) {
        return res.status(400).json({ success: false, error: 'Benutzername oder Passwort falsch.' });
    }

    if (user.status === 'pending') {
        return res.status(403).json({ success: false, error: 'Konto ausstehend. Bitte warte auf die Freigabe durch den Administrator.' });
    }
    
    if (user.status === 'delete_pending') {
        return res.status(403).json({ success: false, error: 'Löschungsanfrage ausstehend. Login gesperrt.' });
    }

    // Verify hash
    const inputHash = crypto.pbkdf2Sync(password, user.salt, 10000, 32, 'sha256').toString('hex');
    if (inputHash !== user.hash) {
        return res.status(400).json({ success: false, error: 'Benutzername oder Passwort falsch.' });
    }

    // Decrypt user FEK using password key
    let fileKey;
    try {
        const userPassKey = deriveKey(password, user.salt);
        const fekHex = decryptText(user.encryptedFek, userPassKey);
        fileKey = Buffer.from(fekHex, 'hex');
    } catch (e) {
        console.error("Error decrypting user FEK:", e);
        return res.status(500).json({ success: false, error: 'Entschlüsselungsfehler beim Login.' });
    }

    // Create session token
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = {
        username: safeUsername,
        fileKey,
        role: user.role
    };

    res.json({
        success: true,
        token,
        username: safeUsername,
        role: user.role
    });
});

// Session Status Check
app.get('/api/auth/status', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token || !sessions[token]) {
        return res.json({ success: false });
    }
    
    const session = sessions[token];
    res.json({
        success: true,
        username: session.username,
        role: session.role
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token && sessions[token]) {
        delete sessions[token];
    }
    res.json({ success: true });
});

// Request Deletion
app.post('/api/auth/delete-request', authenticateToken, (req, res) => {
    const users = loadUsers();
    const user = users[req.user.username];
    if (!user) {
        return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }
    
    if (user.role === 'admin') {
        return res.status(400).json({ success: false, error: 'Der Admin-Account kann nicht gelöscht werden.' });
    }
    
    user.status = 'delete_pending';
    saveUsers(users);
    
    // Invalidate active session immediately
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token && sessions[token]) {
        delete sessions[token];
    }
    
    res.json({ success: true, message: 'Löschungsanfrage eingereicht.' });
});

// --- ADMIN MANAGEMENT ENDPOINTS ---

function requireAdmin(req, res, next) {
    authenticateToken(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Zugriff verweigert. Administrator-Rechte erforderlich.' });
        }
        next();
    });
}

// Get user list
app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = loadUsers();
    const userList = Object.keys(users).map(username => {
        return {
            username,
            role: users[username].role,
            status: users[username].status
        };
    });
    res.json({ success: true, users: userList });
});

// Approve user
app.post('/api/admin/users/approve', requireAdmin, (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, error: 'Benutzername ist erforderlich.' });
    }

    const users = loadUsers();
    if (!users[username]) {
        return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }

    users[username].status = 'approved';
    saveUsers(users);

    res.json({ success: true, message: `Benutzer ${username} freigegeben.` });
});

// Reset user password (using SystemKey decryption)
app.post('/api/admin/users/reset-password', requireAdmin, (req, res) => {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
        return res.status(400).json({ success: false, error: 'Benutzername und Passwort sind erforderlich.' });
    }

    const users = loadUsers();
    const user = users[username];
    if (!user) {
        return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }

    try {
        // 1. Decrypt user's FEK with system key
        const fekHex = decryptText(user.systemEncryptedFek, SYSTEM_KEY);

        // 2. Derive new password key and re-encrypt user FEK
        const newSalt = crypto.randomBytes(16).toString('hex');
        const newHash = crypto.pbkdf2Sync(newPassword, newSalt, 10000, 32, 'sha256').toString('hex');

        const newPassKey = deriveKey(newPassword, newSalt);
        const newEncryptedFek = encryptText(fekHex, newPassKey);

        // 3. Update records
        user.salt = newSalt;
        user.hash = newHash;
        user.encryptedFek = newEncryptedFek;

        saveUsers(users);

        // 4. Invalidate user session tokens
        Object.keys(sessions).forEach(t => {
            if (sessions[t].username === username) {
                delete sessions[t];
            }
        });

        res.json({ success: true, message: `Passwort für Benutzer ${username} erfolgreich zurückgesetzt.` });
    } catch (e) {
        console.error("Error resetting password:", e);
        res.status(500).json({ success: false, error: `Fehler beim Zurücksetzen des Passworts: ${e.message}` });
    }
});

// Delete user account & library files
app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
    const username = req.params.username;
    if (username === req.user.username) {
        return res.status(400).json({ success: false, error: 'Du kannst dein eigenes Admin-Konto nicht löschen.' });
    }

    const users = loadUsers();
    if (!users[username]) {
        return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden.' });
    }

    // Remove user record
    delete users[username];
    saveUsers(users);

    // Invalidate sessions
    Object.keys(sessions).forEach(t => {
        if (sessions[t].username === username) {
            delete sessions[t];
        }
    });

    // Delete user directory recursively
    const userLibDir = path.join(LIBRARY_DIR, username);
    if (fs.existsSync(userLibDir)) {
        try {
            fs.rmSync(userLibDir, { recursive: true, force: true });
        } catch (e) {
            console.error(`Error deleting user library folder: ${e.message}`);
        }
    }

    res.json({ success: true, message: `Benutzer ${username} und alle zugehörigen Daten wurden dauerhaft gelöscht.` });
});

// --- LIBRARY & SCAN ENDPOINTS (SECURE & ENCRYPTED) ---

// 1. Upload & OMR Scan using Audiveris
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'Keine Datei hochgeladen.' });
    }

    const inputPath = req.file.path;
    const baseName = path.basename(req.file.filename, path.extname(req.file.filename));
    const outputDir = path.join(TEMP_DIR, `out_${baseName}`);

    // Create unique output dir for this run
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const audiverisCmd = getAudiverisCommand();
    const cmd = `${audiverisCmd} -batch -export -output "${outputDir}" "${inputPath}"`;
    
    console.log(`Executing OMR command: ${cmd}`);

    exec(cmd, async (err, stdout, stderr) => {
        // Log output for diagnostics
        console.log(`OMR STDOUT:\n${stdout}`);
        if (stderr) console.error(`OMR STDERR:\n${stderr}`);

        // Cleanup original uploaded PDF/image file
        try { fs.unlinkSync(inputPath); } catch (e) { console.error('Error cleaning input file:', e); }

        if (err) {
            cleanDir(outputDir);
            return res.status(500).json({ 
                success: false, 
                error: `Audiveris-Fehler (Exit-Code ${err.code || 'unknown'}). Details: ${stderr || err.message}` 
            });
        }

        try {
            // Find output .mxl or .xml file
            const mxlFile = findFileByExtension(outputDir, '.mxl');
            const xmlFile = findFileByExtension(outputDir, '.xml');
            const targetFile = mxlFile || xmlFile;

            if (!targetFile) {
                cleanDir(outputDir);
                return res.status(500).json({ 
                    success: false, 
                    error: 'OMR-Konvertierung abgeschlossen, aber es wurde keine MusicXML-Ausgabedatei (.mxl oder .xml) gefunden.' 
                });
            }

            let xmlContent = '';
            
            if (mxlFile) {
                // Decompress MXL zip archive to get raw MusicXML
                const extractDir = path.join(outputDir, 'extracted');
                fs.mkdirSync(extractDir, { recursive: true });
                await decompressMxl(mxlFile, extractDir);
                
                const rawXmlFile = findFileByExtension(extractDir, '.xml');
                if (!rawXmlFile) {
                    throw new Error('MusicXML Datei (.xml) konnte nicht aus der MXL-Archivdatei extrahiert werden.');
                }
                xmlContent = fs.readFileSync(rawXmlFile, 'utf-8');
            } else {
                xmlContent = fs.readFileSync(xmlFile, 'utf-8');
            }

            // Save the scanned project to the user library
            const originalName = req.file.originalname;
            const originalBase = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_.-]/g, '_');
            const libraryFileName = `${originalBase}_scanned_${Date.now()}.musicxml`;
            
            const userLibDir = path.join(LIBRARY_DIR, req.user.username);
            if (!fs.existsSync(userLibDir)) {
                fs.mkdirSync(userLibDir, { recursive: true });
            }
            const libraryPath = path.join(userLibDir, libraryFileName);

            // Encrypt content with user FEK
            const encrypted = encryptText(xmlContent, req.user.fileKey);
            fs.writeFileSync(libraryPath, JSON.stringify(encrypted), 'utf-8');
            console.log(`Saved encrypted MusicXML to user library: ${libraryPath}`);

            // Write meta companion file
            let title = originalBase;
            const match = xmlContent.slice(0, 10000).match(/<work-title>([^<]+)<\/work-title>/i) || 
                          xmlContent.slice(0, 10000).match(/<movement-title>([^<]+)<\/movement-title>/i);
            if (match && match[1]) {
                title = match[1].trim();
            }
            fs.writeFileSync(libraryPath + '.meta', JSON.stringify({ title }), 'utf-8');

            // Cleanup temp output dir
            cleanDir(outputDir);

            res.json({
                success: true,
                filename: libraryFileName,
                xml: xmlContent
            });
        } catch (processError) {
            console.error('Error processing OMR outputs:', processError);
            cleanDir(outputDir);
            res.status(500).json({ success: false, error: processError.message });
        }
    });
});

// 2. Get list of saved projects in Library
app.get('/api/projects', authenticateToken, (req, res) => {
    try {
        const userLibDir = path.join(LIBRARY_DIR, req.user.username);
        if (!fs.existsSync(userLibDir)) {
            return res.json({ success: true, projects: [] });
        }

        const files = fs.readdirSync(userLibDir);
        const projects = files
            .filter(f => f.endsWith('.xml') || f.endsWith('.musicxml'))
            .map(filename => {
                const filePath = path.join(userLibDir, filename);
                const stats = fs.statSync(filePath);
                
                let title = filename;
                const metaPath = filePath + '.meta';
                if (fs.existsSync(metaPath)) {
                    try {
                        const metaJson = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                        title = metaJson.title;
                    } catch (e) {
                        // Fallback
                    }
                } else {
                    try {
                        const encryptedJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                        const xmlContent = decryptText(encryptedJson, req.user.fileKey);
                        
                        const sample = xmlContent.slice(0, 10000); // Read start
                        const match = sample.match(/<work-title>([^<]+)<\/work-title>/i) || 
                                      sample.match(/<movement-title>([^<]+)<\/movement-title>/i);
                        if (match && match[1]) {
                            title = match[1].trim();
                        }
                        fs.writeFileSync(metaPath, JSON.stringify({ title }), 'utf-8');
                    } catch (e) {
                        // Fallback to filename
                    }
                }

                return {
                    filename,
                    title,
                    size: stats.size,
                    createdAt: stats.birthtime || stats.mtime
                };
            })
            .sort((a, b) => b.createdAt - a.createdAt);

        res.json({ success: true, projects });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. Load specific project from Library
app.get('/api/projects/:filename', authenticateToken, (req, res) => {
    const filename = req.params.filename;
    
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return res.status(400).json({ success: false, error: 'Ungültiger Dateiname.' });
    }

    const userLibDir = path.join(LIBRARY_DIR, req.user.username);
    const filePath = path.join(userLibDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Projektdatei nicht gefunden.' });
    }

    try {
        const encryptedJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const xmlContent = decryptText(encryptedJson, req.user.fileKey);
        res.json({ success: true, filename, xml: xmlContent });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 4. Save/Overwrite existing project (e.g. Renaming or explicit saves)
app.post('/api/projects/save', authenticateToken, (req, res) => {
    const { filename, xml } = req.body;

    if (!filename || !xml) {
        return res.status(400).json({ success: false, error: 'Dateiname und XML-Daten sind erforderlich.' });
    }

    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return res.status(400).json({ success: false, error: 'Ungültiger Dateiname.' });
    }

    const sanitizedName = filename.endsWith('.musicxml') || filename.endsWith('.xml') 
        ? filename 
        : `${filename}.musicxml`;
        
    const userLibDir = path.join(LIBRARY_DIR, req.user.username);
    if (!fs.existsSync(userLibDir)) {
        fs.mkdirSync(userLibDir, { recursive: true });
    }
    const filePath = path.join(userLibDir, sanitizedName);

    try {
        const encrypted = encryptText(xml, req.user.fileKey);
        fs.writeFileSync(filePath, JSON.stringify(encrypted), 'utf-8');
        
        // Write meta companion file
        let title = path.basename(sanitizedName, path.extname(sanitizedName));
        const match = xml.slice(0, 10000).match(/<work-title>([^<]+)<\/work-title>/i) || 
                      xml.slice(0, 10000).match(/<movement-title>([^<]+)<\/movement-title>/i);
        if (match && match[1]) {
            title = match[1].trim();
        }
        fs.writeFileSync(filePath + '.meta', JSON.stringify({ title }), 'utf-8');

        res.json({ success: true, filename: sanitizedName });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 5. Delete specific project from Library
app.delete('/api/projects/:filename', authenticateToken, (req, res) => {
    const filename = req.params.filename;

    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return res.status(400).json({ success: false, error: 'Ungültiger Dateiname.' });
    }

    const userLibDir = path.join(LIBRARY_DIR, req.user.username);
    const filePath = path.join(userLibDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Projektdatei nicht gefunden.' });
    }

    try {
        fs.unlinkSync(filePath);
        const metaPath = filePath + '.meta';
        if (fs.existsSync(metaPath)) {
            fs.unlinkSync(metaPath);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 6. Check which notation engines are available on the server
app.get('/api/engines', (req, res) => {
    const checkLp = new Promise((resolve) => {
        const lpInfo = getLilyPondCommand();
        // Run a simple command to check if executable runs
        exec(`${lpInfo.lilypond} --version`, (err) => {
            resolve(!err);
        });
    });

    const checkMs = new Promise((resolve) => {
        const msCmd = getMuseScoreCommand();
        exec(`${msCmd} --version`, (err) => {
            resolve(!err);
        });
    });

    Promise.all([checkLp, checkMs]).then(([lpOk, msOk]) => {
        res.json({
            success: true,
            engines: {
                lilypond: lpOk,
                musescore: msOk,
                osmd: true // Always available in frontend
            }
        });
    });
});

// 7. Export MusicXML using LilyPond or MuseScore CLI
app.post('/api/projects/export', (req, res) => {
    const { xml, engine } = req.body;

    if (!xml || !engine) {
        return res.status(400).json({ success: false, error: 'XML-Daten und Engine sind erforderlich.' });
    }

    const taskId = Date.now();
    const tempXmlPath = path.join(TEMP_DIR, `export_${taskId}.musicxml`);
    const tempPdfPath = path.join(TEMP_DIR, `export_${taskId}.pdf`);

    // Write temporary MusicXML file
    fs.writeFileSync(tempXmlPath, xml, 'utf-8');

    if (engine === 'musescore') {
        const msCmd = getMuseScoreCommand();
        const cmd = `${msCmd} -o "${tempPdfPath}" "${tempXmlPath}"`;
        console.log(`Running MuseScore Export: ${cmd}`);

        exec(cmd, (err, stdout, stderr) => {
            // Cleanup input XML
            try { fs.unlinkSync(tempXmlPath); } catch (e) {}

            if (err) {
                console.error('MuseScore export error:', stderr || err.message);
                cleanupTempFiles(taskId);
                return res.status(500).json({ success: false, error: `MuseScore-Export fehlgeschlagen: ${stderr || err.message}` });
            }

            if (!fs.existsSync(tempPdfPath)) {
                cleanupTempFiles(taskId);
                return res.status(500).json({ success: false, error: 'MuseScore-Kompilierung erfolgreich, aber PDF-Ausgabedatei wurde nicht erstellt.' });
            }

            // Stream PDF to client and delete it after sending
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="score.pdf"');
            const stream = fs.createReadStream(tempPdfPath);
            stream.pipe(res);
            stream.on('close', () => {
                cleanupTempFiles(taskId);
            });
            stream.on('error', (streamErr) => {
                console.error('PDF streaming error:', streamErr);
                cleanupTempFiles(taskId);
            });
        });
    } 
    else if (engine === 'lilypond') {
        const lpInfo = getLilyPondCommand();
        const tempLyPath = path.join(TEMP_DIR, `export_${taskId}.ly`);

        // Step 1: musicxml2ly
        let convertCmd = '';
        if (process.platform === 'win32') {
            convertCmd = `${lpInfo.python} ${lpInfo.musicxml2ly} "${tempXmlPath}" -o "${tempLyPath}"`;
        } else {
            convertCmd = `musicxml2ly "${tempXmlPath}" -o "${tempLyPath}"`;
        }

        console.log(`Running musicxml2ly: ${convertCmd}`);
        exec(convertCmd, (err, stdout, stderr) => {
            // Cleanup input XML
            try { fs.unlinkSync(tempXmlPath); } catch (e) {}

            if (err) {
                console.error('musicxml2ly conversion error:', stderr || err.message);
                cleanupTempFiles(taskId);
                return res.status(500).json({ success: false, error: `MusicXML-zu-LilyPond Konvertierung fehlgeschlagen: ${stderr || err.message}` });
            }

            if (!fs.existsSync(tempLyPath)) {
                cleanupTempFiles(taskId);
                return res.status(500).json({ success: false, error: 'musicxml2ly erfolgreich beendet, aber die .ly Datei wurde nicht erstellt.' });
            }

            // Step 2: lilypond
            let compileCmd = '';
            if (process.platform === 'win32') {
                compileCmd = `${lpInfo.lilypond} --pdf -o "${TEMP_DIR}" "${tempLyPath}"`;
            } else {
                compileCmd = `lilypond --pdf -o "${TEMP_DIR}" "${tempLyPath}"`;
            }

            console.log(`Running lilypond compilation: ${compileCmd}`);
            exec(compileCmd, (compileErr, compileStdout, compileStderr) => {
                // Cleanup temp .ly file
                try { fs.unlinkSync(tempLyPath); } catch (e) {}

                if (compileErr) {
                    console.error('LilyPond compile error:', compileStderr || compileErr.message);
                    cleanupTempFiles(taskId);
                    return res.status(500).json({ success: false, error: `LilyPond-Kompilierung fehlgeschlagen: ${compileStderr || compileErr.message}` });
                }

                const generatedPdf = path.join(TEMP_DIR, `export_${taskId}.pdf`);
                if (!fs.existsSync(generatedPdf)) {
                    cleanupTempFiles(taskId);
                    return res.status(500).json({ success: false, error: 'LilyPond-Kompilierung beendet, aber PDF-Ausgabedatei wurde nicht gefunden.' });
                }

                // Stream PDF to client and delete it after sending
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'attachment; filename="score.pdf"');
                const stream = fs.createReadStream(generatedPdf);
                stream.pipe(res);
                stream.on('close', () => {
                    cleanupTempFiles(taskId);
                });
                stream.on('error', (streamErr) => {
                    console.error('PDF streaming error:', streamErr);
                    cleanupTempFiles(taskId);
                });
            });
        });
    } else {
        try { fs.unlinkSync(tempXmlPath); } catch (e) {}
        res.status(400).json({ success: false, error: 'Ungültige Rendering-Engine angegeben.' });
    }
});

// Start listening
app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================================`);
    console.log(`  Rework Sheetmusic Server is running!`);
    console.log(`  Local Address:  http://localhost:${PORT}`);
    console.log(`  Network Access: http://0.0.0.0:${PORT} (for mobile devices)`);
    console.log(`========================================================`);
});
