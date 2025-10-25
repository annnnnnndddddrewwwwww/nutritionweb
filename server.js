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
 * Función para generar el HTML del email profesional
 */
function generarEmailHTML(datos) {
    const { nombre, apellido, tipoCita, fechaFormateada, calendarLink, precio } = datos;
    
    const servicios = {
        'consulta': { nombre: 'Consulta Nutricional', duracion: '60 minutos', precio: '50€' },
        'seguimiento': { nombre: 'Seguimiento', duracion: '30 minutos', precio: '30€' },
        'plan': { nombre: 'Plan Personalizado', duracion: '90 minutos', precio: '80€' }
    };

    const servicio = servicios[tipoCita] || servicios['consulta'];

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmación de Cita - Eva Vidal Nutrición</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f5f5f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <!-- Contenedor principal -->
                <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
                    
                    <!-- Header con logo -->
                    <tr>
                        <td align="center" style="padding: 40px 40px 30px 40px;">
                            <img src="https://i.postimg.cc/JhmhZ1bh/Eva-Vidal.png" alt="Eva Vidal Nutrición" style="width: 150px; height: auto; margin-bottom: 20px;">
                            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">¡Cita Confirmada!</h1>
                        </td>
                    </tr>

                    <!-- Contenido principal -->
                    <tr>
                        <td style="background-color: white; padding: 40px;">
                            <p style="color: #333; font-size: 18px; margin: 0 0 20px 0;">Hola <strong>${nombre}</strong>,</p>
                            
                            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                                Tu cita ha sido <strong style="color: #667eea;">confirmada exitosamente</strong>. Estamos emocionados de acompañarte en tu camino hacia una mejor nutrición y bienestar.
                            </p>

                            <!-- Tarjeta de detalles de la cita -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #667eea15, #764ba215); border-radius: 15px; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 25px;">
                                        <h2 style="color: #667eea; font-size: 20px; margin: 0 0 20px 0; font-weight: 700;">📋 Detalles de tu cita</h2>
                                        
                                        <table width="100%" cellpadding="8" cellspacing="0">
                                            <tr>
                                                <td style="color: #666; font-size: 15px; padding: 8px 0;">
                                                    <strong>🎯 Servicio:</strong>
                                                </td>
                                                <td style="color: #333; font-size: 15px; padding: 8px 0; text-align: right;">
                                                    ${servicio.nombre}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="color: #666; font-size: 15px; padding: 8px 0;">
                                                    <strong>📅 Fecha y Hora:</strong>
                                                </td>
                                                <td style="color: #333; font-size: 15px; padding: 8px 0; text-align: right;">
                                                    ${fechaFormateada}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="color: #666; font-size: 15px; padding: 8px 0;">
                                                    <strong>⏱️ Duración:</strong>
                                                </td>
                                                <td style="color: #333; font-size: 15px; padding: 8px 0; text-align: right;">
                                                    ${servicio.duracion}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="color: #666; font-size: 15px; padding: 8px 0; border-top: 2px solid #667eea30; padding-top: 15px;">
                                                    <strong>💰 Inversión:</strong>
                                                </td>
                                                <td style="color: #667eea; font-size: 18px; font-weight: 700; padding: 8px 0; text-align: right; border-top: 2px solid #667eea30; padding-top: 15px;">
                                                    ${servicio.precio}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Información de pago -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8f9fa; border-left: 4px solid #11998e; border-radius: 8px; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="margin: 0; color: #11998e; font-weight: 700; font-size: 16px; margin-bottom: 8px;">✅ Pago Procesado</p>
                                        <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.5;">
                                            El pago de <strong>${servicio.precio}</strong> ha sido recibido correctamente. Te enviaremos la factura por separado en las próximas 24 horas.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Botón de calendario -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                                <tr>
                                    <td align="center">
                                        <a href="${calendarLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; text-decoration: none; padding: 16px 40px; border-radius: 10px; font-weight: 700; font-size: 16px; box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);">
                                            📅 Añadir a mi Calendario
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Recordatorios -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background: #fff8e1; border-radius: 8px; margin-bottom: 25px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="margin: 0 0 15px 0; color: #f57c00; font-weight: 700; font-size: 15px;">⏰ Recordatorios Automáticos</p>
                                        <ul style="margin: 0; padding-left: 20px; color: #666; font-size: 14px; line-height: 1.8;">
                                            <li>Recibirás un recordatorio <strong>24 horas antes</strong> por email</li>
                                            <li>Una notificación <strong>10 minutos antes</strong> de la cita</li>
                                            <li>El evento se ha añadido automáticamente a tu calendario</li>
                                        </ul>
                                    </td>
                                </tr>
                            </table>

                            <!-- Preparación para la cita -->
                            <div style="border-top: 2px solid #f0f0f0; padding-top: 25px; margin-top: 25px;">
                                <h3 style="color: #667eea; font-size: 18px; margin: 0 0 15px 0;">📝 Preparación para tu cita</h3>
                                <ul style="color: #666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                                    <li>Llega 5 minutos antes si es presencial</li>
                                    <li>Ten a mano cualquier análisis o informe médico reciente</li>
                                    <li>Prepara una lista de tus objetivos nutricionales</li>
                                    <li>Si es online, verifica tu conexión a internet</li>
                                </ul>
                            </div>

                            <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                                Si necesitas <strong>modificar o cancelar</strong> tu cita, por favor contáctanos con al menos <strong>24 horas de antelación</strong>.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 40px; text-align: center;">
                            <p style="color: white; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">¿Tienes alguna pregunta?</p>
                            <p style="color: rgba(255,255,255,0.9); margin: 0 0 20px 0; font-size: 14px;">Estamos aquí para ayudarte</p>
                            
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center">
                                        <a href="tel:644137667" style="color: white; text-decoration: none; font-size: 18px; font-weight: 700; display: inline-block; margin: 0 15px;">
                                            📞 644 137 667
                                        </a>
                                        <a href="mailto:japaradah@gmail.com" style="color: white; text-decoration: none; font-size: 16px; display: inline-block; margin: 0 15px;">
                                            📧 Email
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <div style="margin-top: 25px; padding-top: 25px; border-top: 1px solid rgba(255,255,255,0.3);">
                                <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 13px;">
                                    Eva Vidal - Nutrición y Bienestar
                                </p>
                                <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0 0; font-size: 12px;">
                                    © ${new Date().getFullYear()} Todos los derechos reservados
                                </p>
                            </div>
                        </td>
                    </tr>
                </table>

                <!-- Nota final -->
                <table width="600" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
                    <tr>
                        <td align="center">
                            <p style="color: #999; font-size: 12px; line-height: 1.5; margin: 0;">
                                Este es un correo automático generado por el sistema de reservas.<br>
                                Por favor no respondas directamente a este mensaje.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
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

        // 5. Enviar email de confirmación PROFESIONAL
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
            from: `"Eva Vidal - Nutrición y Bienestar" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '✅ Confirmación de Cita - Eva Vidal Nutrición',
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