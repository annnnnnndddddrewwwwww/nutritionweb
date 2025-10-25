const express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// *** CORRECCIÓN CLAVE para Render/Deploy: Servir archivos estáticos desde la carpeta 'public' ***
// Soluciona el error "ENOENT: no such file or directory" y "Cannot GET /"
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Configurar Google Sheets y Calendar con Service Account
let auth;
try {
    console.log('✅ Inicializando autenticación con Service Account...');

    // Leer credenciales desde el archivo
    const credentialsPath = path.join(__dirname, 'credentials.json');

    if (!fs.existsSync(credentialsPath)) {
        throw new Error('❌ No se encontró el archivo credentials.json');
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

    // Crear cliente de autenticación
    auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ]
    });

    console.log('✅ Service Account configurada correctamente');

} catch (error) {
    console.error('❌ Error al configurar la autenticación de Google:', error.message);
    process.exit(1);
}

// Inicializar servicios de Google (se harán dinámicamente)
let sheets, calendar;

async function initializeGoogleServices() {
    const authClient = await auth.getClient();
    sheets = google.sheets({ version: 'v4', auth: authClient });
    calendar = google.calendar({ version: 'v3', auth: authClient });
    console.log('✅ Servicios de Google inicializados');
}

// Inicializar servicios al arrancar
initializeGoogleServices().catch(err => {
    console.error('❌ Error al inicializar servicios:', err.message);
    process.exit(1);
});

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
 * @param {string} startTime - Hora de inicio en formato ISO string.
 * @param {string} endTime - Hora de fin en formato ISO string.
 * @returns {Promise<boolean>} - True si está disponible, False si está ocupada.
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

        // Filtra eventos que no son citas y están confirmados
        const busyEvents = response.data.items.filter(event =>
            event.status !== 'cancelled' && event.summary.toLowerCase().includes('cita')
        );

        return busyEvents.length === 0;

    } catch (error) {
        console.error('❌ Error al verificar disponibilidad en Google Calendar:', error.message);
        throw new Error('Error al verificar disponibilidad en el calendario');
    }
}

// Endpoint para verificar la disponibilidad (útil para el frontend)
app.post('/check-availability', async (req, res) => {
    const { date, type } = req.body;

    if (!date || !type) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros de fecha o tipo de cita.' });
    }

    // Define la duración de la cita (ej. 60 minutos)
    const durationMinutes = 60;

    // Asume que el tipo de cita viene con la hora (ej. '09:00 - Consulta Nutricional')
    const timeSlot = date.split(' ')[1]; // Asume que la hora es el segundo elemento
    const [hours, minutes] = timeSlot.split(':').map(Number);

    const selectedDate = new Date(date);
    selectedDate.setHours(hours, minutes, 0, 0);

    const startTime = selectedDate;
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    try {
        const isAvailable = await isTimeSlotAvailable(startTime.toISOString(), endTime.toISOString());
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

    if (!date || !tipoCita || !nombre || !apellido || !email || !telefono) {
        return res.status(400).json({
            success: false,
            message: 'Faltan campos obligatorios para la reserva.'
        });
    }

    try {
        // 1. Preparar la hora
        const durationMinutes = 60; // 60 minutos por cita
        const [datePart, timePart] = date.split(' ');
        const [hours, minutes] = timePart.split(':').map(Number);

        const dateObj = new Date(datePart);
        dateObj.setHours(hours, minutes, 0, 0);

        const startTime = dateObj;
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

        // 2. Verificar disponibilidad final
        if (!(await isTimeSlotAvailable(startTime.toISOString(), endTime.toISOString()))) {
            return res.status(409).json({
                success: false,
                message: 'El horario seleccionado ya no está disponible.'
            });
        }

        // 3. Crear el evento en Google Calendar
        const event = {
            summary: `Cita: ${nombre} ${apellido} (${tipoCita})`,
            description: `Tipo: ${tipoCita}\nEmail Cliente: ${email}\nTeléfono: ${telefono}`,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'Europe/Madrid',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'Europe/Madrid',
            },
            // *** Asistentes con el email del dueño del calendario para enviar la invitación ***
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
            sendNotifications: true, // Importante para enviar la invitación
            sendUpdates: 'all',
        });

        // 4. Guardar en Google Sheets (Registro)
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

        // 5. Enviar email de confirmación (no crítico)
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
            hasSheetId: !!process.env.SHEET_ID,
            hasCalendarId: !!process.env.CALENDAR_ID,
            hasOwnerEmail: !!process.env.CALENDAR_OWNER_EMAIL,
            hasCredentials: fs.existsSync(path.join(__dirname, 'credentials.json'))
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});