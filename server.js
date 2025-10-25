const express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

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

    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
        refresh_token: refreshToken
    });

    auth = oauth2Client;
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
 * Función para generar el HTML del email estilo Epic Games
 */
function generarEmailHTML(datos) {
    const { nombre, apellido, tipoCita, fechaFormateada, calendarLink } = datos;

    const servicios = {
        'consulta': { nombre: 'Consulta Nutricional', duracion: '60 minutos', precio: '50€', emoji: '🥗' },
        'seguimiento': { nombre: 'Seguimiento', duracion: '30 minutos', precio: '30€', emoji: '📊' },
        'plan': { nombre: 'Plan Personalizado', duracion: '90 minutos', precio: '80€', emoji: '📋' }
    };

    const servicio = servicios[tipoCita] || servicios['consulta'];

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0e27; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    
    <!-- Contenedor principal -->
    <div style="max-width: 600px; margin: 0 auto; background-color: #0a0e27;">
        
        <!-- Header con gradiente -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 0; margin: 0;">
            <div style="text-align: center; padding: 40px 20px;">
                <img src="https://i.postimg.cc/JhmhZ1bh/Eva-Vidal.png" alt="Eva Vidal" style="width: 120px; height: auto; display: block; margin: 0 auto 20px auto;">
                <h1 style="color: #ffffff; font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">RESERVA CONFIRMADA</h1>
            </div>
        </div>

        <!-- Banner de estado -->
        <div style="background-color: #10b981; padding: 16px; text-align: center;">
            <p style="margin: 0; color: #ffffff; font-size: 15px; font-weight: 600; letter-spacing: 0.5px;">✓ PAGO RECIBIDO • CITA GARANTIZADA</p>
        </div>

        <!-- Contenido principal -->
        <div style="background-color: #1a1f3a; padding: 0;">
            
            <!-- Saludo -->
            <div style="padding: 40px 30px 30px 30px;">
                <p style="color: #ffffff; font-size: 18px; margin: 0 0 10px 0; font-weight: 600;">Hola ${nombre},</p>
                <p style="color: #94a3b8; font-size: 15px; margin: 0; line-height: 1.6;">Tu cita ha sido confirmada exitosamente. Aquí están todos los detalles de tu reserva:</p>
            </div>

            <!-- Card de servicio -->
            <div style="margin: 0 30px 30px 30px; background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); border: 2px solid #667eea; border-radius: 12px; overflow: hidden;">
                
                <!-- Header del card -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                    <div style="font-size: 40px; margin-bottom: 10px;">${servicio.emoji}</div>
                    <h2 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700;">${servicio.nombre}</h2>
                </div>

                <!-- Detalles del servicio -->
                <div style="padding: 25px;">
                    
                    <!-- Fecha y hora -->
                    <div style="margin-bottom: 20px;">
                        <div style="display: inline-block; background-color: #667eea; color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px;">FECHA Y HORA</div>
                        <p style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 600;">${fechaFormateada}</p>
                    </div>

                    <!-- Duración -->
                    <div style="margin-bottom: 20px;">
                        <div style="display: inline-block; background-color: #764ba2; color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px;">DURACIÓN</div>
                        <p style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 600;">${servicio.duracion}</p>
                    </div>

                    <!-- Precio -->
                    <div style="border-top: 1px solid #667eea40; padding-top: 20px;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <span style="color: #94a3b8; font-size: 14px; font-weight: 600;">INVERSIÓN TOTAL</span>
                            <span style="color: #10b981; font-size: 28px; font-weight: 800;">${servicio.precio}</span>
                        </div>
                    </div>

                </div>
            </div>

            <!-- Botón de calendario -->
            <div style="padding: 0 30px 30px 30px;">
                <a href="${calendarLink}" style="display: block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-align: center; padding: 18px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                    📅 AÑADIR A MI CALENDARIO
                </a>
            </div>

            <!-- Información importante -->
            <div style="margin: 0 30px 30px 30px; background-color: #0f1629; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 8px;">
                <h3 style="color: #f59e0b; font-size: 14px; margin: 0 0 12px 0; font-weight: 700; letter-spacing: 0.5px;">⚡ RECORDATORIOS AUTOMÁTICOS</h3>
                <ul style="color: #94a3b8; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                    <li>Email 24 horas antes de tu cita</li>
                    <li>Notificación 10 minutos antes</li>
                    <li>Evento añadido a tu calendario</li>
                </ul>
            </div>

            <!-- Preparación -->
            <div style="margin: 0 30px 40px 30px; background-color: #0f1629; padding: 20px; border-radius: 8px;">
                <h3 style="color: #ffffff; font-size: 14px; margin: 0 0 12px 0; font-weight: 700; letter-spacing: 0.5px;">📋 PREPÁRATE PARA TU CITA</h3>
                <ul style="color: #94a3b8; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                    <li>Llega 5 minutos antes</li>
                    <li>Ten a mano análisis médicos recientes</li>
                    <li>Prepara tus objetivos nutricionales</li>
                    <li>Verifica tu conexión si es online</li>
                </ul>
            </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #0a0e27; padding: 30px; text-align: center; border-top: 1px solid #1a1f3a;">
            
            <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 15px 0; font-weight: 600;">¿Necesitas ayuda?</h3>
            
            <div style="margin-bottom: 25px;">
                <a href="tel:644137667" style="display: inline-block; background-color: #1a1f3a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 0 8px 8px 8px; border: 1px solid #667eea;">
                    📞 644 137 667
                </a>
                <a href="mailto:japaradah@gmail.com" style="display: inline-block; background-color: #1a1f3a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; margin: 0 8px 8px 8px; border: 1px solid #667eea;">
                    📧 Email
                </a>
            </div>

            <div style="border-top: 1px solid #1a1f3a; padding-top: 20px; margin-top: 20px;">
                <p style="color: #667eea; font-size: 15px; margin: 0 0 8px 0; font-weight: 600;">Eva Vidal</p>
                <p style="color: #64748b; font-size: 13px; margin: 0;">Nutrición y Bienestar</p>
                <p style="color: #475569; font-size: 11px; margin: 12px 0 0 0;">© ${new Date().getFullYear()} Todos los derechos reservados</p>
            </div>
        </div>

        <!-- Nota legal -->
        <div style="background-color: #0a0e27; padding: 20px 30px; text-align: center;">
            <p style="color: #475569; font-size: 11px; line-height: 1.6; margin: 0;">
                Este es un mensaje automático. Por favor no respondas a este correo.<br>
                Para modificar o cancelar tu cita, contacta con nosotros con 24h de antelación.
            </p>
        </div>

    </div>

</body>
</html>
    `;
}

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

        // 5. Enviar email estilo Epic Games
        const fechaFormateada = startTime.toLocaleString('es-ES', {
            timeZone: 'Europe/Madrid',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const emailHTML = generarEmailHTML({
            nombre,
            apellido,
            tipoCita,
            fechaFormateada,
            calendarLink: calendarEvent.data.htmlLink
        });

        const mailOptions = {
            from: `"Eva Vidal - Nutrición" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '✅ Reserva Confirmada - Eva Vidal Nutrición',
            html: emailHTML
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log('✅ Email de confirmación enviado correctamente');
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