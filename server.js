const express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Configurar Google Sheets y Calendar
let auth;
try {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  let credentials;

  // Prioritiza variables de entorno (para Render)
  if (process.env.CLIENT_EMAIL && process.env.PRIVATE_KEY) {
    console.log('✅ Usando credentials desde variables de entorno');
    let privateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');

    // Corregir comillas y formato (si se colaron al copiar en Render)
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
      console.log('ℹ️ Se eliminaron comillas de la variable PRIVATE_KEY');
    }

    credentials = {
      client_email: process.env.CLIENT_EMAIL,
      private_key: privateKey
    };
  } 
  // Fallback a archivo local (para desarrollo)
  else if (fs.existsSync(credentialsPath)) {
    credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    console.log('✅ Usando credentials.json desde archivo (local fallback)');
  } 
  // Si no hay credenciales
  else {
    console.error('❌ ERROR: No se encontraron credenciales.');
    console.error('Asegúrate de tener credentials.json o las variables de entorno CLIENT_EMAIL y PRIVATE_KEY.');
    throw new Error('Faltan credenciales de autenticación');
  }

  auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar'
    ]
  });
  console.log('✅ Google Auth configurado correctamente');
} catch (error) {
  console.error('❌ Error al configurar Google Auth:', error.message);
}

const sheets = google.sheets({ version: 'v4', auth });
const calendar = google.calendar({ version: 'v3', auth });

// Configurar Nodemailer
let transporter;
try {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  console.log('✅ Nodemailer configurado correctamente');
} catch (error) {
  console.error('❌ Error al configurar Nodemailer:', error.message);
}

// Servir archivos estáticos PRIMERO
app.use(express.static('public'));

// Endpoint para crear una reserva EN LA RAÍZ
app.post('/', async (req, res) => {
  console.log('📥 Nueva solicitud de reserva recibida');
  console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));

  try {
    const { name, email, phone, date, time, service } = req.body;

    // Validar datos
    if (!name || !email || !phone || !date || !time || !service) {
      console.error('❌ Faltan datos requeridos');
      return res.status(400).json({
        success: false,
        message: 'Faltan datos requeridos',
        error: 'Todos los campos son obligatorios'
      });
    }

    console.log('1️⃣ Guardando en Google Sheets...');
    const sheetId = process.env.SHEET_ID;
    const timestamp = new Date().toISOString();
    
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'Citas!A:G',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[timestamp, name, email, phone, date, time, service]]
        }
      });
      console.log('✅ Guardado en Google Sheets');
    } catch (error) {
      console.error('❌ Error en Google Sheets:', error.message);
      throw new Error(`Error al guardar en Google Sheets: ${error.message}`);
    }

    console.log('2️⃣ Creando evento en Google Calendar...');
    const [hours, minutes] = time.split(':');
    const startDateTime = new Date(date);
    startDateTime.setHours(parseInt(hours), parseInt(minutes), 0);
    
    // Asume una cita de 1 hora
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(startDateTime.getHours() + 1);

    const event = {
      summary: `Cita: ${service} - ${name}`,
      description: `Cliente: ${name}\nTeléfono: ${phone}\nEmail: ${email}\nServicio: ${service}`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Europe/Madrid'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'Europe/Madrid'
      },
      // MODIFICACIÓN CLAVE: Solo incluimos al administrador como asistente para evitar el error
      attendees: [
        { email: process.env.ADMIN_EMAIL }
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 }
        ]
      },
      sendUpdates: 'all'
    };

    let calendarEvent;
    try {
      calendarEvent = await calendar.events.insert({
        calendarId: process.env.CALENDAR_ID,
        resource: event
      });
      console.log('✅ Evento creado en Google Calendar');
    } catch (error) {
      console.error('❌ Error en Google Calendar:', error.message);
      throw new Error(`Error al crear evento en calendario: ${error.message}`);
    }

    console.log('3️⃣ Enviando email de confirmación...');
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      cc: process.env.ADMIN_EMAIL,
      subject: '✅ Confirmación de Cita - Nutrición',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px;">
          <div style="background: white; padding: 30px; border-radius: 10px;">
            <h1 style="color: #667eea; margin-bottom: 20px;">¡Cita Confirmada! ✅</h1>
            <p style="font-size: 16px; color: #333;">Hola <strong>${name}</strong>,</p>
            <p style="font-size: 16px; color: #333;">Tu cita ha sido reservada exitosamente.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="color: #667eea; margin-top: 0;">Detalles de tu Cita</h2>
              <p style="margin: 10px 0;"><strong>📅 Fecha:</strong> ${date}</p>
              <p style="margin: 10px 0;"><strong>🕐 Hora:</strong> ${time}</p>
              <p style="margin: 10px 0;"><strong>💼 Servicio:</strong> ${service}</p>
              <p style="margin: 10px 0;"><strong>📞 Teléfono:</strong> ${phone}</p>
            </div>

            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #1565c0;">
                📧 Recibirás todos los detalles en este correo. Te esperamos a la hora indicada.
              </p>
            </div>

            <p style="font-size: 14px; color: #666; margin-top: 20px;">
              Si necesitas cancelar o reprogramar, por favor contacta con nosotros con al menos 24 horas de antelación.
            </p>
          </div>
        </div>
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
      hasClientEmail: !!process.env.CLIENT_EMAIL,
      hasPrivateKey: !!process.env.PRIVATE_KEY,
      hasSheetId: !!process.env.SHEET_ID,
      hasCalendarId: !!process.env.CALENDAR_ID,
      hasEmailUser: !!process.env.EMAIL_USER,
      hasEmailPass: !!process.env.EMAIL_PASS,
      hasCredentialsFile: fs.existsSync(path.join(__dirname, 'credentials.json'))
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📊 Google Sheet ID: ${process.env.SHEET_ID}`);
  console.log(`📅 Calendar ID: ${process.env.CALENDAR_ID}`);
  console.log(`📧 Email User: ${process.env.EMAIL_USER}`);
});