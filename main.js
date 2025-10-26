// main.js - Aplicación Electron
const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;
let tray;

// Iniciar servidor Express
function startServer() {
    console.log('🚀 Iniciando servidor backend...');

    serverProcess = spawn('node', ['server.js'], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    serverProcess.on('error', (error) => {
        console.error('❌ Error al iniciar servidor:', error);
    });

    serverProcess.on('exit', (code) => {
        console.log(`Servidor terminado con código ${code}`);
    });
}

// Crear ventana principal
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        title: 'NovaShop - Sistema de Reservas',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        backgroundColor: '#0f0c29',
        show: false, // No mostrar hasta que esté listo
    });

    // Cargar el HTML
    mainWindow.loadFile('index.html');

    // Mostrar cuando esté listo
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // Abrir DevTools en desarrollo
        // mainWindow.webContents.openDevTools();
    });

    // Cerrar ventana
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Crear menú de aplicación
    createApplicationMenu();
}

// Crear menú de la aplicación
function createApplicationMenu() {
    const template = [
        {
            label: 'Archivo',
            submenu: [
                {
                    label: 'Recargar',
                    accelerator: 'CmdOrCtrl+R',
                    click: () => {
                        if (mainWindow) mainWindow.reload();
                    }
                },
                {
                    label: 'Cerrar Ventana',
                    accelerator: 'CmdOrCtrl+W',
                    role: 'close'
                },
                { type: 'separator' },
                {
                    label: 'Salir',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Editar',
            submenu: [
                { role: 'undo', label: 'Deshacer' },
                { role: 'redo', label: 'Rehacer' },
                { type: 'separator' },
                { role: 'cut', label: 'Cortar' },
                { role: 'copy', label: 'Copiar' },
                { role: 'paste', label: 'Pegar' },
                { role: 'selectAll', label: 'Seleccionar Todo' }
            ]
        },
        {
            label: 'Ver',
            submenu: [
                { role: 'reload', label: 'Recargar' },
                { role: 'toggleDevTools', label: 'Herramientas de Desarrollo' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Zoom Normal' },
                { role: 'zoomIn', label: 'Aumentar Zoom' },
                { role: 'zoomOut', label: 'Reducir Zoom' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Pantalla Completa' }
            ]
        },
        {
            label: 'Ayuda',
            submenu: [
                {
                    label: 'Acerca de NovaShop',
                    click: () => {
                        const { dialog } = require('electron');
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Acerca de NovaShop',
                            message: 'NovaShop Sistema de Reservas',
                            detail: 'Versión 1.0.0\n\nSistema de gestión de reservas con integración a Google Calendar y notificaciones por email.\n\n© 2024 NovaShop',
                            buttons: ['OK']
                        });
                    }
                },
                {
                    label: 'Documentación',
                    click: async () => {
                        const { shell } = require('electron');
                        await shell.openExternal('https://github.com/tu-repo');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Crear tray icon (opcional)
function createTray() {
    tray = new Tray(path.join(__dirname, 'icon.png'));

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Mostrar Aplicación',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                } else {
                    createWindow();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Salir',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setToolTip('NovaShop - Sistema de Reservas');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
    });
}

// IPC handlers para comunicación con renderer
ipcMain.on('server-status', (event) => {
    event.reply('server-status-reply', {
        running: serverProcess !== null,
        port: process.env.PORT || 3000
    });
});

ipcMain.on('restart-server', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
    setTimeout(() => {
        startServer();
    }, 1000);
});

// Cuando la app está lista
app.whenReady().then(() => {
    startServer();

    // Esperar 2 segundos para que el servidor se inicie
    setTimeout(() => {
        createWindow();
        createTray();
    }, 2000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Cerrar servidor al salir
app.on('before-quit', () => {
    if (serverProcess) {
        console.log('🛑 Cerrando servidor...');
        serverProcess.kill();
    }
});

// Cerrar todas las ventanas (excepto en macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    console.error('Error no capturado:', error);
});