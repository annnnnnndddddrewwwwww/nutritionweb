"""
Sistema de Gestión de Citas - PyQt6
Aplicación moderna para administrar reservas con integración REAL a Google Calendar y Sheets
"""

import sys
import os
import json
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from dotenv import load_dotenv

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QFrame, QScrollArea, QMessageBox, QDialog, QLineEdit, QTextEdit,
    QComboBox, QDateEdit, QTimeEdit, QGridLayout, QProgressBar
)
from PyQt6.QtCore import Qt, QTimer, QDate, QTime, pyqtSignal, QThread
from PyQt6.QtGui import QFont, QColor

# Cargar variables de entorno
load_dotenv()

# ===== CONFIGURACIÓN GOOGLE =====
SHEET_ID = os.getenv('SHEET_ID')
CALENDAR_ID = os.getenv('CALENDAR_ID')
CALENDAR_OWNER_EMAIL = os.getenv('CALENDAR_OWNER_EMAIL')

# Credenciales OAuth
OAUTH_CLIENT_ID = os.getenv('OAUTH_CLIENT_ID')
OAUTH_CLIENT_SECRET = os.getenv('OAUTH_CLIENT_SECRET')
OAUTH_REFRESH_TOKEN = os.getenv('OAUTH_REFRESH_TOKEN')

# ===== CLIENTE GOOGLE =====
class GoogleAPIClient:
    """Cliente para interactuar con Google Sheets y Calendar"""
    
    def __init__(self):
        self.creds = None
        self.sheets_service = None
        self.calendar_service = None
        self._authenticate()
    
    def _authenticate(self):
        """Autenticar con Google usando OAuth2"""
        try:
            # Crear credenciales desde el refresh token
            self.creds = Credentials(
                None,
                refresh_token=OAUTH_REFRESH_TOKEN,
                token_uri='https://oauth2.googleapis.com/token',
                client_id=OAUTH_CLIENT_ID,
                client_secret=OAUTH_CLIENT_SECRET
            )
            
            # Refrescar el token si es necesario
            if self.creds.expired or not self.creds.valid:
                self.creds.refresh(Request())
            
            # Crear servicios
            self.sheets_service = build('sheets', 'v4', credentials=self.creds)
            self.calendar_service = build('calendar', 'v3', credentials=self.creds)
            
            print('✅ Autenticación exitosa con Google')
            
        except Exception as e:
            print(f'❌ Error en autenticación: {e}')
            raise
    
    def get_citas_from_sheets(self):
        """Obtener todas las citas desde Google Sheets"""
        try:
            result = self.sheets_service.spreadsheets().values().get(
                spreadsheetId=SHEET_ID,
                range='Reservas!A2:H'
            ).execute()
            
            values = result.get('values', [])
            return values
            
        except Exception as e:
            print(f'❌ Error obteniendo citas de Sheets: {e}')
            return []
    
    def get_eventos_calendar(self):
        """Obtener eventos futuros del calendario"""
        try:
            now = datetime.utcnow().isoformat() + 'Z'
            
            events_result = self.calendar_service.events().list(
                calendarId=CALENDAR_ID,
                timeMin=now,
                maxResults=100,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            return events
            
        except Exception as e:
            print(f'❌ Error obteniendo eventos de Calendar: {e}')
            return []
    
    def crear_cita(self, data):
        """Crear una nueva cita en Calendar y Sheets"""
        try:
            # 1. Preparar fechas
            fecha_str = data['date']
            fecha_obj = datetime.strptime(fecha_str, '%Y-%m-%d %H:%M')
            
            start_time = fecha_obj.isoformat()
            end_time = (fecha_obj + timedelta(hours=1)).isoformat()
            
            # 2. Crear evento en Calendar
            event = {
                'summary': f"Cita: {data['nombre']} {data['apellido']} ({data['type']})",
                'description': f"Tipo: {data['type']}\nEmail: {data['email']}\nTeléfono: {data['telefono']}",
                'start': {
                    'dateTime': start_time,
                    'timeZone': 'Europe/Madrid',
                },
                'end': {
                    'dateTime': end_time,
                    'timeZone': 'Europe/Madrid',
                },
                'attendees': [
                    {'email': data['email']},
                    {'email': CALENDAR_OWNER_EMAIL}
                ],
                'reminders': {
                    'useDefault': False,
                    'overrides': [
                        {'method': 'email', 'minutes': 24 * 60},
                        {'method': 'popup', 'minutes': 10},
                    ],
                },
            }
            
            calendar_event = self.calendar_service.events().insert(
                calendarId=CALENDAR_ID,
                body=event,
                sendNotifications=True
            ).execute()
            
            print(f'✅ Evento creado en Calendar: {calendar_event["id"]}')
            
            # 3. Guardar en Sheets
            fecha_formateada = fecha_obj.strftime('%d/%m/%Y %H:%M')
            
            row = [
                datetime.now().isoformat(),
                data['nombre'],
                data['apellido'],
                data['email'],
                data['telefono'],
                data['type'],
                fecha_formateada,
                calendar_event.get('htmlLink', '')
            ]
            
            self.sheets_service.spreadsheets().values().append(
                spreadsheetId=SHEET_ID,
                range='Reservas!A:H',
                valueInputOption='USER_ENTERED',
                body={'values': [row]}
            ).execute()
            
            print('✅ Datos guardados en Sheets')
            
            return {
                'success': True,
                'event_id': calendar_event['id'],
                'link': calendar_event.get('htmlLink', '')
            }
            
        except Exception as e:
            print(f'❌ Error creando cita: {e}')
            return {'success': False, 'error': str(e)}
    
    def cancelar_cita(self, event_id):
        """Cancelar una cita en Google Calendar"""
        try:
            self.calendar_service.events().delete(
                calendarId=CALENDAR_ID,
                eventId=event_id,
                sendNotifications=True
            ).execute()
            
            print(f'✅ Evento {event_id} cancelado en Calendar')
            return True
            
        except Exception as e:
            print(f'❌ Error cancelando cita: {e}')
            return False

# ===== ESTILOS QSS =====
QSS_STYLE = """
/* ===== VENTANA PRINCIPAL ===== */
QMainWindow {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                stop:0 #1e3a8a, stop:0.5 #3b82f6, stop:1 #60a5fa);
}

/* ===== WIDGETS GENERALES ===== */
QWidget {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 14px;
}

/* ===== FRAMES DE CONTENIDO ===== */
QFrame#mainCard {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.5);
}

QFrame#headerFrame {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #667eea, stop:1 #764ba2);
    border-radius: 15px;
    padding: 20px;
}

QFrame#statCard {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #f8fafc, stop:1 #e0f2fe);
    border-radius: 15px;
    border: 2px solid #3b82f6;
    padding: 20px;
}

/* ===== LABELS ===== */
QLabel#titleLabel {
    color: white;
    font-size: 32px;
    font-weight: bold;
    padding: 10px;
}

QLabel#subtitleLabel {
    color: rgba(255, 255, 255, 0.95);
    font-size: 16px;
    padding: 5px;
}

QLabel#statNumber {
    color: #1e3a8a;
    font-size: 42px;
    font-weight: bold;
}

QLabel#statLabel {
    color: #64748b;
    font-size: 14px;
    font-weight: 600;
}

QLabel#statusLabel {
    color: white;
    font-size: 13px;
    padding: 8px 15px;
    border-radius: 8px;
    font-weight: 600;
}

/* ===== BOTONES ===== */
QPushButton {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #1e3a8a, stop:0.5 #3b82f6, stop:1 #60a5fa);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 15px 30px;
    font-size: 16px;
    font-weight: bold;
}

QPushButton:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #1e40af, stop:0.5 #2563eb, stop:1 #3b82f6);
}

QPushButton:pressed {
    background: #1e3a8a;
}

QPushButton:disabled {
    background: #94a3b8;
    color: #cbd5e1;
}

QPushButton#dangerButton {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #dc2626, stop:1 #ef4444);
}

QPushButton#dangerButton:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #b91c1c, stop:1 #dc2626);
}

QPushButton#successButton {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #059669, stop:1 #10b981);
}

QPushButton#successButton:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #047857, stop:1 #059669);
}

/* ===== INPUTS ===== */
QLineEdit, QTextEdit, QComboBox, QDateEdit, QTimeEdit {
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 15px;
    color: #1e293b;
    font-size: 15px;
}

QLineEdit:focus, QTextEdit:focus, QComboBox:focus, 
QDateEdit:focus, QTimeEdit:focus {
    border: 2px solid #3b82f6;
    background: white;
}

QComboBox::drop-down {
    border: none;
    width: 30px;
}

QComboBox::down-arrow {
    image: none;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 8px solid #3b82f6;
}

/* ===== TABLA ===== */
QTableWidget {
    background: white;
    border: none;
    border-radius: 12px;
    gridline-color: #e2e8f0;
    selection-background-color: #dbeafe;
}

QTableWidget::item {
    padding: 12px;
    border-bottom: 1px solid #f1f5f9;
}

QTableWidget::item:selected {
    background: #dbeafe;
    color: #1e3a8a;
}

QHeaderView::section {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #1e3a8a, stop:1 #3b82f6);
    color: white;
    padding: 12px;
    border: none;
    font-weight: bold;
    font-size: 14px;
}

/* ===== SCROLLBAR ===== */
QScrollBar:vertical {
    background: #f1f5f9;
    width: 12px;
    border-radius: 6px;
}

QScrollBar::handle:vertical {
    background: #3b82f6;
    border-radius: 6px;
    min-height: 30px;
}

QScrollBar::handle:vertical:hover {
    background: #2563eb;
}

QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}

/* ===== DIÁLOGOS ===== */
QDialog {
    background: white;
    border-radius: 15px;
}

/* ===== PROGRESS BAR ===== */
QProgressBar {
    border: 2px solid #3b82f6;
    border-radius: 8px;
    text-align: center;
    background: #f1f5f9;
}

QProgressBar::chunk {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 #1e3a8a, stop:1 #3b82f6);
    border-radius: 6px;
}
"""

# ===== WORKER PARA CARGAR DATOS =====
class DataLoader(QThread):
    finished = pyqtSignal(dict)
    error = pyqtSignal(str)
    
    def __init__(self, google_client):
        super().__init__()
        self.google_client = google_client
    
    def run(self):
        try:
            # Obtener datos de Sheets
            rows = self.google_client.get_citas_from_sheets()
            
            # Obtener eventos de Calendar
            events = self.google_client.get_eventos_calendar()
            
            # Procesar datos
            citas = []
            now = datetime.now()
            
            # Crear un mapa de eventos por nombre para relacionar
            event_map = {}
            for event in events:
                summary = event.get('summary', '')
                event_map[summary] = event
            
            for row in rows:
                if len(row) >= 7:
                    timestamp, nombre, apellido, email, telefono, tipo, fecha_hora = row[:7]
                    calendar_link = row[7] if len(row) > 7 else ''
                    
                    # Parsear fecha
                    try:
                        # Intentar varios formatos
                        for fmt in ['%d/%m/%Y %H:%M', '%Y-%m-%d %H:%M:%S', '%d/%m/%Y, %H:%M:%S']:
                            try:
                                fecha_obj = datetime.strptime(fecha_hora, fmt)
                                break
                            except:
                                continue
                        else:
                            fecha_obj = datetime.now()
                        
                        # Solo citas futuras
                        if fecha_obj > now:
                            # Buscar evento en Calendar
                            event_key = f"Cita: {nombre} {apellido} ({tipo})"
                            calendar_event = event_map.get(event_key)
                            event_id = calendar_event.get('id') if calendar_event else None
                            
                            citas.append({
                                'fecha': fecha_obj.strftime('%d/%m/%Y'),
                                'hora': fecha_obj.strftime('%H:%M'),
                                'cliente': f"{nombre} {apellido}",
                                'nombre': nombre,
                                'apellido': apellido,
                                'email': email,
                                'telefono': telefono,
                                'tipo': tipo.capitalize(),
                                'fecha_obj': fecha_obj,
                                'event_id': event_id,
                                'calendar_link': calendar_link
                            })
                    except Exception as e:
                        print(f"Error procesando fila: {e}")
                        continue
            
            # Ordenar por fecha
            citas.sort(key=lambda x: x['fecha_obj'])
            
            # Calcular estadísticas
            hoy = now.replace(hour=0, minute=0, second=0, microsecond=0)
            inicio_semana = hoy - timedelta(days=hoy.weekday())
            inicio_mes = hoy.replace(day=1)
            
            stats = {
                'hoy': len([c for c in citas if c['fecha_obj'].date() == hoy.date()]),
                'semana': len([c for c in citas if c['fecha_obj'] >= inicio_semana]),
                'mes': len([c for c in citas if c['fecha_obj'] >= inicio_mes]),
                'total': len(rows)
            }
            
            self.finished.emit({'citas': citas, 'stats': stats})
            
        except Exception as e:
            self.error.emit(str(e))

# ===== DIÁLOGO NUEVA CITA =====
class NuevaCitaDialog(QDialog):
    def __init__(self, google_client, parent=None):
        super().__init__(parent)
        self.google_client = google_client
        self.setWindowTitle("Nueva Cita")
        self.setMinimumWidth(500)
        self.setup_ui()
    
    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(20)
        layout.setContentsMargins(30, 30, 30, 30)
        
        # Título
        title = QLabel("📅 Nueva Reserva")
        title.setStyleSheet("font-size: 24px; font-weight: bold; color: #1e3a8a;")
        layout.addWidget(title)
        
        # Grid de inputs
        grid = QGridLayout()
        grid.setSpacing(15)
        
        # Nombre
        grid.addWidget(QLabel("Nombre:"), 0, 0)
        self.nombre_input = QLineEdit()
        self.nombre_input.setPlaceholderText("Nombre completo")
        grid.addWidget(self.nombre_input, 0, 1)
        
        # Email
        grid.addWidget(QLabel("Email:"), 1, 0)
        self.email_input = QLineEdit()
        self.email_input.setPlaceholderText("correo@ejemplo.com")
        grid.addWidget(self.email_input, 1, 1)
        
        # Teléfono
        grid.addWidget(QLabel("Teléfono:"), 2, 0)
        self.telefono_input = QLineEdit()
        self.telefono_input.setPlaceholderText("644 137 667")
        grid.addWidget(self.telefono_input, 2, 1)
        
        # Tipo de cita
        grid.addWidget(QLabel("Tipo de Cita:"), 3, 0)
        self.tipo_combo = QComboBox()
        self.tipo_combo.addItems([
            "🥗 Consulta Nutricional (50€)",
            "📊 Seguimiento (30€)",
            "📋 Plan Personalizado (80€)"
        ])
        grid.addWidget(self.tipo_combo, 3, 1)
        
        # Fecha
        grid.addWidget(QLabel("Fecha:"), 4, 0)
        self.fecha_input = QDateEdit()
        self.fecha_input.setCalendarPopup(True)
        self.fecha_input.setDate(QDate.currentDate())
        self.fecha_input.setMinimumDate(QDate.currentDate())
        grid.addWidget(self.fecha_input, 4, 1)
        
        # Hora
        grid.addWidget(QLabel("Hora:"), 5, 0)
        self.hora_input = QTimeEdit()
        self.hora_input.setTime(QTime(9, 0))
        grid.addWidget(self.hora_input, 5, 1)
        
        layout.addLayout(grid)
        
        # Progress bar (oculta por defecto)
        self.progress = QProgressBar()
        self.progress.setVisible(False)
        layout.addWidget(self.progress)
        
        # Botones
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        cancel_btn = QPushButton("Cancelar")
        cancel_btn.setObjectName("dangerButton")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        self.save_btn = QPushButton("Guardar Cita")
        self.save_btn.setObjectName("successButton")
        self.save_btn.clicked.connect(self.guardar_cita)
        button_layout.addWidget(self.save_btn)
        
        layout.addLayout(button_layout)
    
    def guardar_cita(self):
        # Validar
        if not self.nombre_input.text() or not self.email_input.text() or not self.telefono_input.text():
            QMessageBox.warning(self, "Error", "Por favor completa todos los campos")
            return
        
        # Mostrar progreso
        self.progress.setVisible(True)
        self.progress.setRange(0, 0)  # Modo indeterminado
        self.save_btn.setEnabled(False)
        
        # Preparar datos
        tipo_map = {0: "consulta", 1: "seguimiento", 2: "plan"}
        
        nombre_completo = self.nombre_input.text().split()
        nombre = nombre_completo[0]
        apellido = " ".join(nombre_completo[1:]) if len(nombre_completo) > 1 else ""
        
        data = {
            "nombre": nombre,
            "apellido": apellido,
            "email": self.email_input.text(),
            "telefono": self.telefono_input.text(),
            "type": tipo_map[self.tipo_combo.currentIndex()],
            "date": f"{self.fecha_input.date().toString('yyyy-MM-dd')} {self.hora_input.time().toString('HH:mm')}"
        }
        
        # Crear cita
        result = self.google_client.crear_cita(data)
        
        self.progress.setVisible(False)
        self.save_btn.setEnabled(True)
        
        if result['success']:
            QMessageBox.information(
                self,
                "Éxito",
                "✅ Cita creada correctamente\n\nSe ha enviado confirmación al cliente"
            )
            self.accept()
        else:
            QMessageBox.critical(
                self,
                "Error",
                f"Error al crear la cita:\n{result.get('error', 'Error desconocido')}"
            )

# ===== VENTANA PRINCIPAL =====
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Sistema de Gestión de Citas - Eva Vidal")
        self.setMinimumSize(1400, 900)
        
        # Inicializar cliente Google
        try:
            self.google_client = GoogleAPIClient()
            self.status_msg = "✅ Conectado a Google"
        except Exception as e:
            self.google_client = None
            self.status_msg = f"❌ Error: {str(e)}"
            QMessageBox.critical(
                self,
                "Error de Conexión",
                f"No se pudo conectar con Google:\n{str(e)}\n\nVerifica tus credenciales en .env"
            )
        
        # Aplicar estilos
        self.setStyleSheet(QSS_STYLE)
        
        self.setup_ui()
        
        if self.google_client:
            self.load_data()
            
            # Auto-refresh cada 60 segundos
            self.timer = QTimer()
            self.timer.timeout.connect(self.load_data)
            self.timer.start(60000)
    
    def setup_ui(self):
        # Widget central
        central = QWidget()
        self.setCentralWidget(central)
        
        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(40, 40, 40, 40)
        main_layout.setSpacing(30)
        
        # ===== HEADER =====
        header = QFrame()
        header.setObjectName("headerFrame")
        header.setFixedHeight(140)
        
        header_layout = QVBoxLayout(header)
        
        # Fila superior
        top_row = QHBoxLayout()
        
        # Logo y título
        title_layout = QVBoxLayout()
        title = QLabel("Sistema de Gestión de Citas")
        title.setObjectName("titleLabel")
        subtitle = QLabel("Eva Vidal - Nutrición y Bienestar")
        subtitle.setObjectName("subtitleLabel")
        
        title_layout.addWidget(title)
        title_layout.addWidget(subtitle)
        top_row.addLayout(title_layout)
        
        top_row.addStretch()
        
        # Botones
        nueva_cita_btn = QPushButton("➕ Nueva Cita")
        nueva_cita_btn.setFixedSize(200, 50)
        nueva_cita_btn.clicked.connect(self.nueva_cita)
        top_row.addWidget(nueva_cita_btn)
        
        refresh_btn = QPushButton("🔄")
        refresh_btn.setFixedSize(50, 50)
        refresh_btn.setToolTip("Actualizar datos")
        refresh_btn.clicked.connect(self.load_data)
        top_row.addWidget(refresh_btn)
        
        header_layout.addLayout(top_row)
        
        # Status bar
        self.status_label = QLabel(self.status_msg)
        self.status_label.setObjectName("statusLabel")
        self.status_label.setStyleSheet("background: #10b981;" if "✅" in self.status_msg else "background: #dc2626;")
        header_layout.addWidget(self.status_label, alignment=Qt.AlignmentFlag.AlignRight)
        
        main_layout.addWidget(header)
        
        # ===== ESTADÍSTICAS =====
        stats_layout = QHBoxLayout()
        stats_layout.setSpacing(20)
        
        self.stat_hoy = self.create_stat_card("0", "Citas Hoy", "📅")
        self.stat_semana = self.create_stat_card("0", "Esta Semana", "📊")
        self.stat_mes = self.create_stat_card("0", "Este Mes", "📈")
        self.stat_total = self.create_stat_card("0", "Total", "💼")
        
        stats_layout.addWidget(self.stat_hoy)
        stats_layout.addWidget(self.stat_semana)
        stats_layout.addWidget(self.stat_mes)
        stats_layout.addWidget(self.stat_total)
        
        main_layout.addLayout(stats_layout)
        
        # ===== TABLA DE CITAS =====
        card = QFrame()
        card.setObjectName("mainCard")
        
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(30, 30, 30, 30)
        
        table_title = QLabel("📋 Próximas Citas")
        table_title.setStyleSheet("font-size: 22px; font-weight: bold; color: #1e3a8a; margin-bottom: 15px;")
        card_layout.addWidget(table_title)
        
        self.table = QTableWidget()
        self.table.setColumnCount(7)
        self.table.setHorizontalHeaderLabels([
            "Fecha", "Hora", "Cliente", "Email", "Teléfono", "Tipo", "Acciones"
        ])
        
        # Configurar tabla
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(6, QHeaderView.ResizeMode.Fixed)
        self.table.setColumnWidth(6, 150)
        
        self.table.verticalHeader().setVisible(False)
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        
        card_layout.addWidget(self.table)
        main_layout.addWidget(card)
    
    def create_stat_card(self, number, label, emoji):
        card = QFrame()
        card.setObjectName("statCard")
        card.setMinimumHeight(140)
        
        layout = QVBoxLayout(card)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        emoji_label = QLabel(emoji)
        emoji_label.setStyleSheet("font-size: 40px;")
        emoji_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        num_label = QLabel(number)
        num_label.setObjectName("statNumber")
        num_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        text_label = QLabel(label)
        text_label.setObjectName("statLabel")
        text_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        layout.addWidget(emoji_label)
        layout.addWidget(num_label)
        layout.addWidget(text_label)
        
        # Guardar referencia al número
        card.number_label = num_label
        
        return card
    
    def load_data(self):
        """Cargar datos desde Google"""
        if not self.google_client:
            return
        
        self.status_label.setText("🔄 Actualizando datos...")
        self.status_label.setStyleSheet("background: #f59e0b;")
        
        # Crear worker thread
        self.loader = DataLoader(self.google_client)
        self.loader.finished.connect(self.on_data_loaded)
        self.loader.error.connect(self.on_data_error)
        self.loader.start()
    
    def on_data_loaded(self, data):
        """Callback cuando los datos se cargan exitosamente"""
        citas = data['citas']
        stats = data['stats']
        
        # Actualizar estadísticas
        self.stat_hoy.number_label.setText(str(stats['hoy']))
        self.stat_semana.number_label.setText(str(stats['semana']))
        self.stat_mes.number_label.setText(str(stats['mes']))
        self.stat_total.number_label.setText(str(stats['total']))
        
        # Actualizar tabla
        self.populate_table(citas)
        
        # Actualizar status
        now = datetime.now().strftime('%H:%M:%S')
        self.status_label.setText(f"✅ Actualizado: {now}")
        self.status_label.setStyleSheet("background: #10b981;")
    
    def on_data_error(self, error_msg):
        """Callback cuando hay error al cargar datos"""
        self.status_label.setText(f"❌ Error: {error_msg}")
        self.status_label.setStyleSheet("background: #dc2626;")
        
        QMessageBox.warning(
            self,
            "Error al Cargar Datos",
            f"No se pudieron cargar los datos:\n{error_msg}"
        )
    
    def populate_table(self, citas):
        """Poblar la tabla con las citas"""
        self.table.setRowCount(len(citas))
        
        for row, cita in enumerate(citas):
            self.table.setItem(row, 0, QTableWidgetItem(cita["fecha"]))
            self.table.setItem(row, 1, QTableWidgetItem(cita["hora"]))
            self.table.setItem(row, 2, QTableWidgetItem(cita["cliente"]))
            self.table.setItem(row, 3, QTableWidgetItem(cita["email"]))
            self.table.setItem(row, 4, QTableWidgetItem(cita["telefono"]))
            self.table.setItem(row, 5, QTableWidgetItem(cita["tipo"]))
            
            # Botones de acción
            actions = QWidget()
            actions_layout = QHBoxLayout(actions)
            actions_layout.setContentsMargins(5, 5, 5, 5)
            
            delete_btn = QPushButton("🗑️")
            delete_btn.setFixedSize(40, 40)
            delete_btn.setObjectName("dangerButton")
            delete_btn.setToolTip("Cancelar cita")
            delete_btn.clicked.connect(lambda checked, event_id=cita.get('event_id'), r=row: self.delete_cita(event_id, r))
            
            actions_layout.addWidget(delete_btn)
            actions_layout.addStretch()
            
            self.table.setCellWidget(row, 6, actions)
    
    def nueva_cita(self):
        """Abrir diálogo para crear nueva cita"""
        if not self.google_client:
            QMessageBox.warning(
                self,
                "Error",
                "No hay conexión con Google. Verifica tus credenciales."
            )
            return
        
        dialog = NuevaCitaDialog(self.google_client, self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            # Recargar datos
            self.load_data()
    
    def delete_cita(self, event_id, row):
        """Cancelar una cita"""
        if not event_id:
            QMessageBox.warning(
                self,
                "Error",
                "No se encontró el evento en Google Calendar"
            )
            return
        
        reply = QMessageBox.question(
            self,
            "Confirmar",
            "¿Estás seguro de cancelar esta cita?\n\nSe notificará al cliente por email.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # Cancelar en Google Calendar
            success = self.google_client.cancelar_cita(event_id)
            
            if success:
                self.table.removeRow(row)
                QMessageBox.information(
                    self,
                    "Éxito",
                    "✅ Cita cancelada correctamente\n\nSe ha notificado al cliente"
                )
                # Recargar para actualizar stats
                self.load_data()
            else:
                QMessageBox.critical(
                    self,
                    "Error",
                    "No se pudo cancelar la cita en Google Calendar"
                )

# ===== MAIN =====
def main():
    # Verificar que existe el archivo .env
    if not os.path.exists('.env'):
        print("❌ ERROR: No se encontró el archivo .env")
        print("\nCrea un archivo .env con:")
        print("SHEET_ID=tu_sheet_id")
        print("CALENDAR_ID=tu_calendar_id")
        print("CALENDAR_OWNER_EMAIL=tu_email")
        print("OAUTH_CLIENT_ID=tu_client_id")
        print("OAUTH_CLIENT_SECRET=tu_client_secret")
        print("OAUTH_REFRESH_TOKEN=tu_refresh_token")
        sys.exit(1)
    
    app = QApplication(sys.argv)
    
    # Configurar fuente global
    font = QFont("Segoe UI", 10)
    app.setFont(font)
    
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())

if __name__ == "__main__":
    main()