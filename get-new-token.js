const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config();

// Tus credenciales OAuth desde .env
const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

// CRÍTICO: Estos son TODOS los scopes que necesitas
const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
];

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

// Genera la URL de autorización
const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // IMPORTANTE: Fuerza a pedir consentimiento de nuevo
});

console.log('\n🔗 PASO 1: Abre esta URL en tu navegador:\n');
console.log(authUrl);
console.log('\n📝 PASO 2: Inicia sesión con: japaradah@gmail.com');
console.log('⚠️  IMPORTANTE: Acepta TODOS los permisos (Calendar + Sheets)');
console.log('\n📋 PASO 3: Copia el código que te dan y pégalo aquí abajo:\n');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('Pega el código aquí: ', async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code);

        console.log('\n✅ ¡Token generado exitosamente!\n');
        console.log('═══════════════════════════════════════════════════');
        console.log('📝 COPIA ESTE NUEVO REFRESH TOKEN:');
        console.log('═══════════════════════════════════════════════════\n');
        console.log(tokens.refresh_token);
        console.log('\n═══════════════════════════════════════════════════');
        console.log('\n🔧 Reemplázalo en tu archivo .env:');
        console.log(`OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('\n🌐 Y también actualízalo en Render → Environment Variables');
        console.log('═══════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Error al obtener el token:', error.message);
    }
    rl.close();
});