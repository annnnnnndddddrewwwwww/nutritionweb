const express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// *** CORRECCIÓN CLAVE para Render/Deploy: Servir archivos estáticos desde la carpeta 'public' ***
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Configurar Google Sheets y Calendar con OAuth 2.0
let auth;
let sheets;
let calendar;

try {
    console.log('✅ Inicializando autenticación OAuth 2.0...');
    
    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    const refreshToken = process.env.OAUTH_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('❌ Faltan credenciales OAuth en las variables de entorno');
    }

    // Crear cliente OAuth2
    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'urn:ietf:wg:oauth:2.0:oob'
    );

    // Establecer el refresh token
    oauth2Client.setCredentials({
        refresh_token: refreshToken
    });

    auth = oauth2Client;
    
    // Inicializar servicios
    sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    console.log('✅ OAuth 2.0 configurado correctamente');

} catch (error) {
    console.error('❌ Error al configurar la autenticación:', error.message);
    process.exit(1);
}

const SHEET_ID = process.env.SHEET_ID;
const CALENDAR_ID = process.env.CALENDAR_ID;
const CALENDAR_OWNER_EMAIL = process.env.CALENDAR_OWNER_EMAIL;

// Configurar Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Valida que una fecha/hora no esté ya reservada en Google Calendar.
 */
async function isTimeSlotAvailable(startTime, endTime) {
    try {
        const response = await calendar.events.list({
            calendarId: CALENDAR_ID,
            timeMin: startTime,
            timeMax: endTime,
            timeZone: 'Europe/Madrid',
            singleEvents: true,
            orderBy: 'startTime',
        });

        const busyEvents = response.data.items.filter(event =>
            event.status !== 'cancelled' && event.summary.toLowerCase().includes('cita')
        );

        return busyEvents.length === 0;

    } catch (error) {
        console.error('❌ Error al verificar disponibilidad:', error.message);
        throw new Error('Error al verificar disponibilidad en el calendario');
    }
}

// Endpoint para verificar disponibilidad
app.post('/check-availability', async (req, res) => {
    const { date, type } = req.body;

    if (!date || !type) {
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan parámetros de fecha o tipo de cita.' 
        });
    }

    const durationMinutes = 60;
    const timeSlot = date.split(' ')[1];
    const [hours, minutes] = timeSlot.split(':').map(Number);

    const selectedDate = new Date(date);
    selectedDate.setHours(hours, minutes, 0, 0);

    const startTime = selectedDate;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    try {
        const isAvailable = await isTimeSlotAvailable(
            startTime.toISOString(), 
            endTime.toISOString()
        );
        res.json({ success: true, isAvailable });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Endpoint para procesar la reserva
app.post('/reservar', async (req, res) => {
    const {
        date,
        type: tipoCita,
        nombre,
        apellido,
        email,
        telefono
    } = req.body;

    console.log('📝 Nueva solicitud de reserva:', { date, tipoCita, nombre, email });

    if (!date || !tipoCita || !nombre || !apellido || !email || !telefono) {
        return res.status(400).json({
            success: false,
            message: 'Faltan campos obligatorios para la reserva.'
        });
    }

    try {
        // 1. Preparar la hora
        const durationMinutes = 60;
        const [datePart, timePart] = date.split(' ');
        const [hours, minutes] = timePart.split(':').map(Number);

        const dateObj = new Date(datePart);
        dateObj.setHours(hours, minutes, 0, 0);

        const startTime = dateObj;
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

        console.log('🕐 Horario solicitado:', {
            start: startTime.toISOString(),
            end: endTime.toISOString()
        });

        // 2. Verificar disponibilidad
        const isAvailable = await isTimeSlotAvailable(
            startTime.toISOString(), 
            endTime.toISOString()
        );

        if (!isAvailable) {
            console.log('⚠️ Horario no disponible');
            return res.status(409).json({
                success: false,
                message: 'El horario seleccionado ya no está disponible.'
            });
        }

        // 3. Crear evento en Google Calendar
        console.log('📅 Creando evento en Calendar...');
        const event = {
            summary: `Cita: ${nombre} ${apellido} (${tipoCita})`,
            description: `Tipo: ${tipoCita}\nEmail: ${email}\nTeléfono: ${telefono}`,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'Europe/Madrid',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'Europe/Madrid',
            },
            attendees: [
                { email: email },
                { email: CALENDAR_OWNER_EMAIL }
            ],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 24 * 60 },
                    { method: 'popup', minutes: 10 },
                ],
            },
        };

        const calendarEvent = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: event,
            sendNotifications: true,
            sendUpdates: 'all',
        });

        console.log('✅ Evento creado en Calendar:', calendarEvent.data.id);

        // 4. Guardar en Google Sheets
        console.log('📊 Guardando en Google Sheets...');
        const row = [
            new Date().toISOString(),
            nombre,
            apellido,
            email,
            telefono,
            tipoCita,
            startTime.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
            calendarEvent.data.htmlLink,
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: 'Reservas!A:H',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [row],
            },
        });

        console.log('✅ Datos guardados en Sheets');

        // 5. Enviar email de confirmación
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Confirmación de Cita con Eva Vidal Nutrición',
            html: `
                <p>Hola ${nombre},</p>
                <p>Tu cita de <b>${tipoCita}</b> ha sido confirmada:</p>
                <ul>
                    <li>Fecha y Hora: <b>${startTime.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</b></li>
                    <li>Enlace al evento: <a href="${calendarEvent.data.htmlLink}">Ver en Google Calendar</a></li>
                </ul>
                <p>Recibirás un recordatorio por email antes de la cita. ¡Gracias!</p>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log('✅ Email enviado correctamente');
        } catch (error) {
            console.error('⚠️ Error al enviar email (no crítico):', error.message);
        }

        console.log('✅ Reserva completada exitosamente');
        res.json({
            success: true,
            message: 'Cita creada exitosamente',
            calendarEventId: calendarEvent.data.id,
            calendarLink: calendarEvent.data.htmlLink
        });

    } catch (error) {
        console.error('❌ Error al crear la cita:', error);
        console.error('Detalles del error:', JSON.stringify(error, null, 2));
        res.status(500).json({
            success: false,
            message: 'Error al procesar la reserva',
            error: error.message
        });
    }
});

// Endpoint de salud
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        env: {
            hasClientId: !!process.env.OAUTH_CLIENT_ID,
            hasClientSecret: !!process.env.OAUTH_CLIENT_SECRET,
            hasRefreshToken: !!process.env.OAUTH_REFRESH_TOKEN,
            hasSheetId: !!process.env.SHEET_ID,
            hasCalendarId: !!process.env.CALENDAR_ID,
            hasOwnerEmail: !!process.env.CALENDAR_OWNER_EMAIL
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});