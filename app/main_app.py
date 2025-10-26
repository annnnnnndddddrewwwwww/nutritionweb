"""
Sistema de Gestión de Citas - PyQt6
Aplicación moderna para administrar reservas con integración a Google Calendar y Sheets
"""

import sys
import json
import requests
from datetime import datetime, timedelta
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QFrame, QScrollArea, QMessageBox, QDialog, QLineEdit, QTextEdit,
    QComboBox, QDateEdit, QTimeEdit, QGridLayout, QStackedWidget
)
from PyQt6.QtCore import Qt, QTimer, QDate, QTime, pyqtSignal, QThread
from PyQt6.QtGui import QFont, QColor, QPalette, QIcon

# ===== CONFIGURACIÓN =====
SERVER_URL = "https://nutritionweb.onrender.com"  # Cambia esto por tu URL de Render

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

/* ===== TOOLTIPS ===== */
QToolTip {
    background: #1e3a8a;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 8px;
    font-size: 13px;
}
"""

# ===== WORKER PARA CARGAR DATOS =====
class DataLoader(QThread):
    finished = pyqtSignal(list)
    error = pyqtSignal(str)
    
    def __init__(self, url):
        super().__init__()
        self.url = url
    
    def run(self):
        try:
            response = requests.get(f"{self.url}/citas", timeout=10)
            if response.ok:
                self.finished.emit(response.json())
            else:
                self.error.emit("Error al cargar datos del servidor")
        except Exception as e:
            self.error.emit(f"Error de conexión: {str(e)}")

# ===== DIÁLOGO NUEVA CITA =====
class NuevaCitaDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
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
        
        # Botones
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        cancel_btn = QPushButton("Cancelar")
        cancel_btn.setObjectName("dangerButton")
        cancel_btn.clicked.connect(self.reject)
        button_layout.addWidget(cancel_btn)
        
        self.save_btn = QPushButton("Guardar Cita")
        self.save_btn.setObjectName("successButton")
        self.save_btn.clicked.connect(self.accept)
        button_layout.addWidget(self.save_btn)
        
        layout.addLayout(button_layout)
    
    def get_data(self):
        tipo_map = {
            0: "consulta",
            1: "seguimiento",
            2: "plan"
        }
        
        return {
            "nombre": self.nombre_input.text().split()[0] if self.nombre_input.text() else "",
            "apellido": " ".join(self.nombre_input.text().split()[1:]) if len(self.nombre_input.text().split()) > 1 else "",
            "email": self.email_input.text(),
            "telefono": self.telefono_input.text(),
            "type": tipo_map[self.tipo_combo.currentIndex()],
            "date": f"{self.fecha_input.date().toString('yyyy-MM-dd')} {self.hora_input.time().toString('HH:mm')}"
        }

# ===== VENTANA PRINCIPAL =====
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Sistema de Gestión de Citas - Eva Vidal")
        self.setMinimumSize(1400, 900)
        
        # Aplicar estilos
        self.setStyleSheet(QSS_STYLE)
        
        self.setup_ui()
        self.load_data()
        
        # Auto-refresh cada 30 segundos
        self.timer = QTimer()
        self.timer.timeout.connect(self.load_data)
        self.timer.start(30000)
    
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
        header.setFixedHeight(120)
        
        header_layout = QHBoxLayout(header)
        
        # Logo y título
        title_layout = QVBoxLayout()
        title = QLabel("Sistema de Gestión de Citas")
        title.setObjectName("titleLabel")
        subtitle = QLabel("Eva Vidal - Nutrición y Bienestar")
        subtitle.setObjectName("subtitleLabel")
        
        title_layout.addWidget(title)
        title_layout.addWidget(subtitle)
        header_layout.addLayout(title_layout)
        
        header_layout.addStretch()
        
        # Botón nueva cita
        nueva_cita_btn = QPushButton("➕ Nueva Cita")
        nueva_cita_btn.setFixedSize(200, 50)
        nueva_cita_btn.clicked.connect(self.nueva_cita)
        header_layout.addWidget(nueva_cita_btn)
        
        # Botón refrescar
        refresh_btn = QPushButton("🔄")
        refresh_btn.setFixedSize(50, 50)
        refresh_btn.setToolTip("Actualizar datos")
        refresh_btn.clicked.connect(self.load_data)
        header_layout.addWidget(refresh_btn)
        
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
        # Aquí deberías hacer la petición real a tu servidor
        # Por ahora, usamos datos de ejemplo
        self.update_stats(5, 12, 45, 234)
        self.populate_table([
            {
                "fecha": "2024-10-27",
                "hora": "10:00",
                "cliente": "Ana García",
                "email": "ana@email.com",
                "telefono": "644123456",
                "tipo": "Consulta"
            },
            {
                "fecha": "2024-10-27",
                "hora": "11:30",
                "cliente": "Carlos Ruiz",
                "email": "carlos@email.com",
                "telefono": "655987654",
                "tipo": "Seguimiento"
            }
        ])
    
    def update_stats(self, hoy, semana, mes, total):
        self.stat_hoy.number_label.setText(str(hoy))
        self.stat_semana.number_label.setText(str(semana))
        self.stat_mes.number_label.setText(str(mes))
        self.stat_total.number_label.setText(str(total))
    
    def populate_table(self, citas):
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
            delete_btn.clicked.connect(lambda checked, r=row: self.delete_cita(r))
            
            actions_layout.addWidget(delete_btn)
            actions_layout.addStretch()
            
            self.table.setCellWidget(row, 6, actions)
    
    def nueva_cita(self):
        dialog = NuevaCitaDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            data = dialog.get_data()
            
            # Validar datos
            if not all([data["nombre"], data["email"], data["telefono"]]):
                QMessageBox.warning(self, "Error", "Por favor completa todos los campos")
                return
            
            # Aquí harías la petición POST a tu servidor
            try:
                response = requests.post(
                    f"{SERVER_URL}/reservar",
                    json=data,
                    timeout=10
                )
                
                if response.ok:
                    QMessageBox.information(
                        self,
                        "Éxito",
                        "✅ Cita creada correctamente\n\nSe ha enviado confirmación por email"
                    )
                    self.load_data()
                else:
                    QMessageBox.critical(
                        self,
                        "Error",
                        f"Error al crear la cita:\n{response.text}"
                    )
            except Exception as e:
                QMessageBox.critical(
                    self,
                    "Error de Conexión",
                    f"No se pudo conectar con el servidor:\n{str(e)}"
                )
    
    def delete_cita(self, row):
        reply = QMessageBox.question(
            self,
            "Confirmar",
            "¿Estás seguro de cancelar esta cita?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # Aquí harías la petición DELETE a tu servidor
            self.table.removeRow(row)
            QMessageBox.information(self, "Éxito", "Cita cancelada correctamente")

# ===== MAIN =====
def main():
    app = QApplication(sys.argv)
    
    # Configurar fuente global
    font = QFont("Segoe UI", 10)
    app.setFont(font)
    
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())

if __name__ == "__main__":
    main()