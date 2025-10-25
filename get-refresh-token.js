const { google } = require('googleapis');
const readline = require('readline');

// Tus credenciales OAuth
const CLIENT_ID = '714460777411-b08q27c51re2a6u83evmj4786ne2ef79.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

// IMPORTANTE: Estos son los scopes necesarios para Sheets y Calendar
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
    prompt: 'consent' // Fuerza a mostrar la pantalla de consentimiento
});

console.log('\n🔐 PASO 1: Autoriza esta aplicación visitando esta URL:\n');
console.log(authUrl);
console.log('\n📋 PASO 2: Copia el código que te dan y pégalo aquí:\n');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('Pega el código aquí: ', async (code) => {
    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('\n✅ ¡Token generado exitosamente!\n');
        console.log('📝 Copia este REFRESH TOKEN y reemplázalo en tu archivo .env:\n');
        console.log('OAUTH_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('\n');
    } catch (error) {
        console.error('❌ Error al obtener el token:', error.message);
    }
    rl.close();
});