// ==========================================================================
// APPLICATION STATE
// ==========================================================================
let musicXmlDoc = null;
let osmdInstance = null;
let systemBreaks = []; // 1-indexed measure numbers AFTER which to break line (system)
let pageBreaks = [];   // 1-indexed measure numbers AFTER which to break page
let measuresCount = 0;
let activeController = null;

let currentProject = {
    filename: '',
    title: 'Demo-Noten',
    isDemo: false
};

// ==========================================================================
// SECURE AUTHENTICATION STATE & HELPER
// ==========================================================================
function getAuthToken() {
    return sessionStorage.getItem('auth_token');
}

function authFetch(url, options = {}) {
    const token = getAuthToken();
    if (!options.headers) {
        options.headers = {};
    }
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, options);
}

// ==========================================================================
// EXTENSIBLE SETTINGS SYSTEM (SettingsManager)
// ==========================================================================
const SettingsManager = {
    // Current active values of settings
    values: {},

    // Definition of layout settings - EASILY EXTENSIBLE IN THE FUTURE
    configs: [
        {
            id: 'zoom-scale',
            label: 'Notengröße (Skalierung)',
            type: 'range',
            min: 40,
            max: 220,
            step: 5,
            default: 100,
            unit: '%',
            apply: (val) => {
                if (osmdInstance) {
                    osmdInstance.Zoom = val / 100;
                }
            }
        },
        {
            id: 'system-spacing',
            label: 'Zeilenabstand (OSMD)',
            type: 'range',
            min: 10,
            max: 100,
            step: 5,
            default: 40,
            unit: '',
            apply: (val) => {
                if (osmdInstance) {
                    osmdInstance.EngravingRules.BetweenStaffLinesDistance = val / 4;
                }
            }
        },
        {
            id: 'page-format',
            label: 'Papierformat',
            type: 'select',
            options: [
                { value: 'a4', label: 'A4 Hochformat', width: '210mm', padding: '20px' },
                { value: 'a4-landscape', label: 'A4 Querformat', width: '297mm', padding: '20px' },
                { value: 'letter', label: 'Letter (US)', width: '8.5in', padding: '0.5in' },
                { value: 'tablet', label: 'Tablet / iPad (4:3)', width: '240mm', padding: '15px' },
                { value: 'fluid', label: 'Stufenlos fließend', width: '100%', padding: '25px' }
            ],
            default: 'a4',
            apply: (val, config) => {
                const previewContainer = document.getElementById('score-preview-page');
                previewContainer.className = 'score-page-preview';
                previewContainer.classList.add('format-' + val);
                
                const option = config.options.find(o => o.value === val);
                if (option) {
                    document.documentElement.style.setProperty('--paper-width', option.width);
                    document.documentElement.style.setProperty('--paper-padding', option.padding);
                }
            }
        }
        /* 
        To add a new setting in the future, just add it here! Example:
        {
            id: 'draw-composer',
            label: 'Komponist anzeigen',
            type: 'select',
            options: [{value: 'yes', label: 'Ja'}, {value: 'no', label: 'Nein'}],
            default: 'yes',
            apply: (val) => {
                if (osmdInstance) {
                    osmdInstance.setOptions({ drawComposer: val === 'yes' });
                }
            }
        }
        */
    ],

    // Render configuration inputs to UI and bind event listeners
    init() {
        const container = document.getElementById('dynamic-settings-container');
        container.innerHTML = ''; // Clear previous

        this.configs.forEach(config => {
            // Read default value
            this.values[config.id] = config.default;

            const group = document.createElement('div');
            group.className = 'control-group';

            const labelEl = document.createElement('label');
            labelEl.htmlFor = config.id;
            labelEl.textContent = config.label;
            group.appendChild(labelEl);

            if (config.type === 'range') {
                const wrapper = document.createElement('div');
                wrapper.className = 'slider-wrapper';

                const input = document.createElement('input');
                input.type = 'range';
                input.id = config.id;
                input.min = config.min;
                input.max = config.max;
                input.step = config.step || 1;
                input.value = config.default;

                const valDisplay = document.createElement('span');
                valDisplay.id = `${config.id}-val`;
                valDisplay.textContent = `${config.default}${config.unit || ''}`;

                input.addEventListener('input', (e) => {
                    const value = parseInt(e.target.value, 10);
                    this.values[config.id] = value;
                    valDisplay.textContent = `${value}${config.unit || ''}`;
                    
                    config.apply(value, config);
                    // Re-render OSMD
                    if (osmdInstance && musicXmlDoc) {
                        renderScore(false); // fast render (no full reload)
                    }
                });

                wrapper.appendChild(input);
                wrapper.appendChild(valDisplay);
                group.appendChild(wrapper);
            } 
            else if (config.type === 'select') {
                const select = document.createElement('select');
                select.id = config.id;
                select.className = 'form-select';

                config.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.label;
                    if (opt.value === config.default) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });

                select.addEventListener('change', (e) => {
                    const value = e.target.value;
                    this.values[config.id] = value;
                    config.apply(value, config);
                    
                    // Re-render score
                    if (osmdInstance && musicXmlDoc) {
                        renderScore(true); // full render
                    }
                });

                group.appendChild(select);
            }

            container.appendChild(group);
        });
    },

    // Apply all current values to OSMD rules
    applyAll() {
        this.configs.forEach(config => {
            const val = this.values[config.id];
            config.apply(val, config);
        });
    },

    // Force values back to default
    reset() {
        this.configs.forEach(config => {
            this.values[config.id] = config.default;
            const input = document.getElementById(config.id);
            if (input) {
                input.value = config.default;
                if (config.type === 'range') {
                    document.getElementById(`${config.id}-val`).textContent = `${config.default}${config.unit || ''}`;
                }
            }
        });
        this.applyAll();
    }
};

// ==========================================================================
// DOM ELEMENTS
// ==========================================================================
const screenUpload = document.getElementById('screen-upload');
const screenEditor = document.getElementById('screen-editor');
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const btnLoadDemo = document.getElementById('btn-load-demo');
const btnBackToUpload = document.getElementById('btn-back-to-upload');
const btnPrintPdf = document.getElementById('btn-print-pdf');

const autoMeasuresSelect = document.getElementById('auto-measures-per-line');
const taktGridContainer = document.getElementById('takt-grid-container');

// Multi-Engine Notation Elements
const selectPreviewMode = document.getElementById('select-preview-mode');
const groupServerEngine = document.getElementById('group-server-engine');
const selectServerEngine = document.getElementById('select-server-engine');
const btnGenerateServerPreview = document.getElementById('btn-generate-server-preview');
const selectExportEngine = document.getElementById('select-export-engine');
const exportHelpText = document.getElementById('export-help-text');
const pdfPreviewFrame = document.getElementById('pdf-preview-frame');
const scorePreviewPage = document.getElementById('score-preview-page');

let availableEngines = { lilypond: false, musescore: false, osmd: true };

const inputProjectTitle = document.getElementById('input-project-title');
const inputProjectComposer = document.getElementById('input-project-composer');
const inputProjectFilename = document.getElementById('input-project-filename');
const btnProjectSave = document.getElementById('btn-project-save');
const projectTitleDisplay = document.getElementById('project-title-display');
const projectFilenameDisplay = document.getElementById('project-filename-display');

const loadingOverlay = document.getElementById('loading-overlay');
const loadingTitle = document.getElementById('loading-title');
const loadingText = document.getElementById('loading-text');
const loadingProgress = document.getElementById('loading-progress');
const btnCancelScanning = document.getElementById('btn-cancel-scanning');
const themeToggle = document.getElementById('theme-toggle');

const libraryList = document.getElementById('library-list');
const libraryEmpty = document.getElementById('library-empty');

// ==========================================================================
// APPLICATION INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize icons
    lucide.createIcons();

    // Init Dynamic Settings
    SettingsManager.init();

    // Check system light/dark theme preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeIcon('light');
    }

    // Auth & Session Check
    checkSession();

    // Tab switching in Auth Overlay
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const authConfirmPwGroup = document.getElementById('auth-confirm-password-group');
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    const authForm = document.getElementById('auth-form');
    const authErrorMsg = document.getElementById('auth-error-message');
    const authSuccessMsg = document.getElementById('auth-success-message');
    let isRegisterMode = false;

    tabLogin.addEventListener('click', () => {
        isRegisterMode = false;
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        authConfirmPwGroup.style.display = 'none';
        document.getElementById('auth-confirm-password').required = false;
        btnAuthSubmit.textContent = 'Anmelden';
        authErrorMsg.style.display = 'none';
        authSuccessMsg.style.display = 'none';
    });

    tabRegister.addEventListener('click', () => {
        isRegisterMode = true;
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        authConfirmPwGroup.style.display = 'block';
        document.getElementById('auth-confirm-password').required = true;
        btnAuthSubmit.textContent = 'Registrieren';
        authErrorMsg.style.display = 'none';
        authSuccessMsg.style.display = 'none';
    });

    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        authErrorMsg.style.display = 'none';
        authSuccessMsg.style.display = 'none';

        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;

        if (isRegisterMode) {
            const confirmPassword = document.getElementById('auth-confirm-password').value;
            if (password !== confirmPassword) {
                authErrorMsg.textContent = 'Die Passwörter stimmen nicht überein.';
                authErrorMsg.style.display = 'block';
                return;
            }

            fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    authSuccessMsg.textContent = data.message;
                    authSuccessMsg.style.display = 'block';
                    document.getElementById('auth-password').value = '';
                    document.getElementById('auth-confirm-password').value = '';
                    setTimeout(() => {
                        tabLogin.click();
                        document.getElementById('auth-password').focus();
                    }, 2000);
                } else {
                    authErrorMsg.textContent = data.error;
                    authErrorMsg.style.display = 'block';
                }
            })
            .catch(err => {
                authErrorMsg.textContent = 'Verbindung zum Server fehlgeschlagen.';
                authErrorMsg.style.display = 'block';
            });
        } else {
            fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            .then(async res => {
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || 'Login fehlgeschlagen.');
                }
                return res.json();
            })
            .then(data => {
                if (data.success) {
                    sessionStorage.setItem('auth_token', data.token);
                    document.getElementById('auth-overlay').classList.remove('active');
                    document.getElementById('auth-username').value = '';
                    document.getElementById('auth-password').value = '';
                    setupSessionUI(data.username, data.role);
                    loadLibrary();
                    checkEngineAvailability();
                } else {
                    authErrorMsg.textContent = data.error;
                    authErrorMsg.style.display = 'block';
                }
            })
            .catch(err => {
                authErrorMsg.textContent = err.message || 'Verbindung zum Server fehlgeschlagen.';
                authErrorMsg.style.display = 'block';
            });
        }
    });

    // Logout Button Handler
    document.getElementById('btn-logout').addEventListener('click', () => {
        authFetch('/api/auth/logout', { method: 'POST' })
        .finally(() => {
            sessionStorage.removeItem('auth_token');
            document.getElementById('user-profile-widget').style.display = 'none';
            document.getElementById('admin-panel-card').style.display = 'none';
            document.getElementById('auth-overlay').classList.add('active');
            btnBackToUpload.click();
        });
    });

    // Request Deletion Button Handler
    document.getElementById('btn-request-delete').addEventListener('click', () => {
        const confirmMsg = 'Möchtest du wirklich die Löschung deines Kontos beantragen? \n\nDein Account wird sofort gesperrt. Sobald der Administrator die Löschung bestätigt, werden alle deine Noten und dein Account unwiderruflich gelöscht.';
        if (confirm(confirmMsg)) {
            authFetch('/api/auth/delete-request', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('Löschungsanfrage erfolgreich eingereicht. Du wirst nun abgemeldet.');
                    sessionStorage.removeItem('auth_token');
                    document.getElementById('user-profile-widget').style.display = 'none';
                    document.getElementById('admin-panel-card').style.display = 'none';
                    document.getElementById('auth-overlay').classList.add('active');
                    btnBackToUpload.click();
                } else {
                    alert('Fehler: ' + data.error);
                }
            })
            .catch(err => {
                alert('Fehler beim Einreichen der Löschungsanfrage: ' + err.message);
            });
        }
    });

    // Admin password reset submit
    document.getElementById('btn-admin-reset-pw').addEventListener('click', () => {
        const username = document.getElementById('admin-reset-username').value;
        const newPassword = document.getElementById('admin-reset-new-pw').value;
        const msgDiv = document.getElementById('admin-reset-message');
        
        if (!username || !newPassword) {
            msgDiv.textContent = 'Bitte Benutzername und neues Passwort eingeben.';
            msgDiv.className = 'auth-error';
            msgDiv.style.display = 'block';
            return;
        }

        authFetch('/api/admin/users/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, newPassword })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                msgDiv.textContent = data.message;
                msgDiv.className = 'auth-success';
                msgDiv.style.display = 'block';
                document.getElementById('admin-reset-new-pw').value = '';
            } else {
                msgDiv.textContent = data.error;
                msgDiv.className = 'auth-error';
                msgDiv.style.display = 'block';
            }
        })
        .catch(err => {
            msgDiv.textContent = 'Fehler beim Passwort-Reset: ' + err.message;
            msgDiv.className = 'auth-error';
            msgDiv.style.display = 'block';
        });
    });

    // Preview Mode Selection
    selectPreviewMode.addEventListener('change', () => {
        const mode = selectPreviewMode.value;
        if (mode === 'osmd') {
            groupServerEngine.style.display = 'none';
            btnGenerateServerPreview.style.display = 'none';
            pdfPreviewFrame.style.display = 'none';
            scorePreviewPage.style.display = 'block';
            
            // Re-render OSMD
            renderScore(true);
        } else {
            groupServerEngine.style.display = 'block';
            btnGenerateServerPreview.style.display = 'block';
            scorePreviewPage.style.display = 'none';
            pdfPreviewFrame.style.display = 'block';
            
            // Auto generate if not generated yet or src is empty
            if (musicXmlDoc && !pdfPreviewFrame.src) {
                generateServerPreview();
            }
        }
    });

    // Server Engine selection change
    selectServerEngine.addEventListener('change', () => {
        if (musicXmlDoc && selectPreviewMode.value === 'server') {
            generateServerPreview();
        }
    });

    // Generate Button click
    btnGenerateServerPreview.addEventListener('click', () => {
        if (musicXmlDoc) {
            generateServerPreview();
        }
    });

    // Export Engine selection change
    selectExportEngine.addEventListener('change', () => {
        const engine = selectExportEngine.value;
        if (engine === 'osmd') {
            exportHelpText.textContent = "Wähle im Druckdialog deines Browsers 'Als PDF speichern'.";
            btnPrintPdf.innerHTML = '<i data-lucide="printer"></i> PDF exportieren';
        } else if (engine === 'lilypond') {
            exportHelpText.textContent = "Kompiliert hochpräzisen Vektor-Notensatz direkt auf dem Server.";
            btnPrintPdf.innerHTML = '<i data-lucide="download"></i> Mit LilyPond exportieren';
        } else if (engine === 'musescore') {
            exportHelpText.textContent = "Konvertiert das Projekt serverseitig in ein MuseScore-Layout PDF.";
            btnPrintPdf.innerHTML = '<i data-lucide="download"></i> Mit MuseScore exportieren';
        }
        lucide.createIcons({ container: btnPrintPdf.parentElement });
    });

    // Live Title Input Change Listener
    inputProjectTitle.addEventListener('input', () => {
        if (musicXmlDoc) {
            const val = inputProjectTitle.value.trim();
            setXMLTitle(musicXmlDoc, val);
            projectTitleDisplay.textContent = val || 'Unbenannt';
            renderScore(true); // reload to show in OSMD
        }
    });

    // Live Composer Input Change Listener
    inputProjectComposer.addEventListener('input', () => {
        if (musicXmlDoc) {
            const val = inputProjectComposer.value.trim();
            setXMLComposer(musicXmlDoc, val);
            renderScore(true); // reload to show in OSMD
        }
    });
});

// OSMD Initializer
function initOSMD() {
    const container = document.getElementById('osmd-canvas-container');
    container.innerHTML = ''; // Clear previous

    osmdInstance = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
        autoResize: true,
        backend: "svg", // SVG generates sharp vectors, which print optimally
        drawTitle: true,
        drawSubtitle: true,
        drawComposer: true,
        drawCredits: true,
        drawPartNames: true,
        newSystemFromXML: true,
        newPageFromXML: true
    });
}

// Theme Toggle Click Handler
themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    const oldIcon = themeToggle.querySelector('.lucide, i');
    const newIcon = document.createElement('i');
    newIcon.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
    if (oldIcon) {
        oldIcon.replaceWith(newIcon);
    } else {
        themeToggle.appendChild(newIcon);
    }
    lucide.createIcons();
}

// ==========================================================================
// DRAG & DROP / SCAN UPLOADER LOGIC
// ==========================================================================
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFileSelection(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleFileSelection(fileInput.files[0]);
    }
});

btnCancelScanning.addEventListener('click', () => {
    if (activeController) activeController.abort();
    showLoadingOverlay(false);
});

function handleFileSelection(file) {
    showLoadingOverlay(true);
    updateLoadingStep('upload', 'active');
    updateLoadingProgress(10, 'Datei wird an Server gesendet...');

    const formData = new FormData();
    formData.append('file', file);

    activeController = new AbortController();

    // Fake upload progress simulation
    let progress = 10;
    const progressInterval = setInterval(() => {
        if (progress < 25) {
            progress += 1;
            updateLoadingProgress(progress, 'Datei wird an Server übertragen...');
        }
    }, 80);

    authFetch('/api/upload', {
        method: 'POST',
        body: formData,
        signal: activeController.signal
    })
    .then(async response => {
        clearInterval(progressInterval);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Fehler beim Hochladen oder OMR-Scan.');
        }

        updateLoadingStep('upload', 'completed');
        updateLoadingStep('omr', 'active');

        return processOMRScanProgress(response);
    })
    .then(data => {
        updateLoadingStep('xml', 'completed');
        updateLoadingStep('render', 'active');
        updateLoadingProgress(95, 'Noten werden gerendert...');

        setTimeout(() => {
            try {
                // Set active project state
                currentProject.filename = data.filename;
                currentProject.title = data.filename.split('_scanned_')[0].replace(/_/g, ' ');
                currentProject.isDemo = false;

                // Sync UI displays
                projectTitleDisplay.textContent = currentProject.title;
                projectFilenameDisplay.textContent = data.filename;

                loadMusicXML(data.xml);
                showLoadingOverlay(false);
                loadLibrary(); // Refresh library list

                // Transition screen
                switchToEditorScreen(true);
            } catch (e) {
                console.error("XML Load Error:", e);
                alert("Fehler beim Verarbeiten der MusicXML-Daten:\n" + e.message);
                showLoadingOverlay(false);
            }
        }, 300);
    })
    .catch(err => {
        clearInterval(progressInterval);
        console.error(err);
        if (err.name === 'AbortError') {
            alert('Scan abgebrochen.');
        } else {
            alert('Scan mit Audiveris fehlgeschlagen:\n' + err.message + '\n\nDu kannst stattdessen die Demodaten testen.');
        }
        showLoadingOverlay(false);
    });
}

// Poll or wait for heavy blocking Audiveris execution
async function processOMRScanProgress(response) {
    let progress = 25;
    const interval = setInterval(() => {
        if (progress < 85) {
            progress += Math.floor(Math.random() * 2) + 1;
            updateLoadingProgress(progress, 'Audiveris OMR Scan läuft. Bitte warten...');
            if (progress > 55) {
                updateLoadingStep('omr', 'active');
            }
        }
    }, 800);

    try {
        const data = await response.json();
        clearInterval(interval);

        if (!data.success) {
            throw new Error(data.error);
        }

        updateLoadingStep('omr', 'completed');
        updateLoadingStep('xml', 'active');
        updateLoadingProgress(90, 'Lade MusicXML-Ausgabe...');
        return data;
    } catch (e) {
        clearInterval(interval);
        throw e;
    }
}

// ==========================================================================
// LIBRARY & DEMO ACTIONS
// ==========================================================================

// Get list of saved projects
function loadLibrary() {
    authFetch('/api/projects')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.projects.length > 0) {
                libraryEmpty.style.display = 'none';
                libraryList.innerHTML = '';
                
                data.projects.forEach(project => {
                    const item = document.createElement('div');
                    item.className = 'library-item';
                    
                    const info = document.createElement('div');
                    info.className = 'lib-info';
                    info.innerHTML = `
                        <i data-lucide="file-music" class="lib-icon"></i>
                        <div class="lib-details">
                            <div class="lib-title" title="${project.title}">${project.title}</div>
                            <div class="lib-meta">
                                <span>${(project.size / 1024).toFixed(1)} KB</span>
                                <span>${new Date(project.createdAt).toLocaleDateString('de-DE')}</span>
                            </div>
                        </div>
                    `;
                    
                    // Clicking item loads project
                    info.addEventListener('click', (e) => {
                        e.stopPropagation();
                        loadProjectFromLibrary(project.filename);
                    });

                    const actions = document.createElement('div');
                    actions.className = 'lib-actions';
                    
                    const btnDel = document.createElement('button');
                    btnDel.className = 'btn-delete';
                    btnDel.title = 'Lied aus Bibliothek löschen';
                    btnDel.innerHTML = '<i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>';
                    btnDel.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`Möchtest du "${project.title}" wirklich aus der Bibliothek löschen?`)) {
                            deleteProject(project.filename);
                        }
                    });

                    actions.appendChild(btnDel);
                    item.appendChild(info);
                    item.appendChild(actions);
                    libraryList.appendChild(item);
                });
                
                lucide.createIcons({ container: libraryList });
            } else {
                libraryEmpty.style.display = 'flex';
                libraryList.innerHTML = '';
            }
        })
        .catch(err => {
            console.error('Error fetching library list:', err);
        });
}

// Load project from library API
function loadProjectFromLibrary(filename) {
    showLoadingOverlay(true);
    updateLoadingStep('upload', 'completed');
    updateLoadingStep('omr', 'completed');
    updateLoadingStep('xml', 'active');
    updateLoadingProgress(60, 'Lade Projektdatei aus Bibliothek...');

    authFetch(`/api/projects/${filename}`)
        .then(res => res.json())
        .then(data => {
            if (!data.success) throw new Error(data.error);

            updateLoadingStep('xml', 'completed');
            updateLoadingStep('render', 'active');
            updateLoadingProgress(90, 'Noten werden gerendert...');

            setTimeout(() => {
                try {
                    // Set active project state
                    currentProject.filename = data.filename;
                    currentProject.title = data.filename.endsWith('.musicxml') 
                        ? data.filename.slice(0, -9).replace(/_scanned_\d+/g, '').replace(/_/g, ' ')
                        : data.filename.slice(0, -4).replace(/_scanned_\d+/g, '').replace(/_/g, ' ');
                    currentProject.isDemo = false;

                    // Sync UI displays
                    projectTitleDisplay.textContent = currentProject.title;
                    projectFilenameDisplay.textContent = data.filename;

                    loadMusicXML(data.xml);
                    showLoadingOverlay(false);
                    switchToEditorScreen(true);
                } catch (e) {
                    console.error(e);
                    alert('Fehler beim XML-Rendering:\n' + e.message);
                    showLoadingOverlay(false);
                }
            }, 300);
        })
        .catch(err => {
            console.error(err);
            alert('Fehler beim Laden des Projekts: ' + err.message);
            showLoadingOverlay(false);
        });
}

// Delete project from library API
function deleteProject(filename) {
    authFetch(`/api/projects/${filename}`, {
        method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadLibrary();
            // If deleted the currently opened file, reset it
            if (currentProject.filename === filename) {
                btnBackToUpload.click();
            }
        } else {
            alert('Fehler beim Löschen: ' + data.error);
        }
    })
    .catch(err => {
        console.error(err);
        alert('Fehler beim Löschen des Projekts: ' + err.message);
    });
}

// Save/Rename current project XML with new filename
// Save/Rename current project XML with new filename
btnProjectSave.addEventListener('click', () => {
    const newTitle = inputProjectTitle.value.trim();
    const newComposer = inputProjectComposer.value.trim();
    const newFilenameInput = inputProjectFilename.value.trim();

    if (!newFilenameInput) {
        alert('Bitte gib einen gültigen Dateinamen ein.');
        return;
    }

    if (!musicXmlDoc) {
        alert('Kein aktives Dokument zum Speichern vorhanden.');
        return;
    }

    if (currentProject.isDemo) {
        alert('Die Demo-Datei kann nicht unter diesem Namen gespeichert werden. Lade bitte ein eigenes Notenblatt hoch.');
        return;
    }

    // Apply metadata to XML DOM before saving
    setXMLTitle(musicXmlDoc, newTitle);
    setXMLComposer(musicXmlDoc, newComposer);

    // Prepare modified XML string
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(musicXmlDoc);

    const safeBaseName = newFilenameInput.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const newFilename = safeBaseName.endsWith('.musicxml') || safeBaseName.endsWith('.xml') 
        ? safeBaseName 
        : `${safeBaseName}.musicxml`;

    authFetch('/api/projects/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filename: newFilename,
            xml: xmlString
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const oldFilename = currentProject.filename;
            currentProject.filename = data.filename;
            currentProject.title = newTitle || safeBaseName;
            
            projectTitleDisplay.textContent = currentProject.title;
            projectFilenameDisplay.textContent = data.filename;
            
            alert('Projekt erfolgreich gespeichert!');

            if (oldFilename !== data.filename && !oldFilename.startsWith('sample.musicxml')) {
                // Delete old file
                authFetch(`/api/projects/${oldFilename}`, { method: 'DELETE' }).then(() => loadLibrary());
            } else {
                loadLibrary();
            }
        } else {
            alert('Fehler beim Speichern: ' + data.error);
        }
    })
    .catch(err => {
        console.error(err);
        alert('Fehler beim Speichern des Projekts: ' + err.message);
    });
});

// Load Demo Mock Mode
btnLoadDemo.addEventListener('click', () => {
    showLoadingOverlay(true);
    updateLoadingStep('upload', 'completed');
    updateLoadingStep('omr', 'completed');
    updateLoadingStep('xml', 'active');
    updateLoadingProgress(60, 'Lade Demo-Noten...');

    fetch('sample.musicxml')
        .then(response => {
            if (!response.ok) throw new Error('Demo-Datei sample.musicxml nicht gefunden');
            return response.text();
        })
        .then(xmlText => {
            updateLoadingStep('xml', 'completed');
            updateLoadingStep('render', 'active');
            updateLoadingProgress(90, 'Noten werden gerendert...');

            setTimeout(() => {
                try {
                    // Set active project state
                    currentProject.filename = 'sample.musicxml';
                    currentProject.title = 'Demo-Lied (Schlaflied)';
                    currentProject.isDemo = true;

                    // Sync UI displays
                    projectTitleDisplay.textContent = currentProject.title;
                    projectFilenameDisplay.textContent = 'sample.musicxml';

                    loadMusicXML(xmlText);
                    showLoadingOverlay(false);
                    
                    // Transition screen
                    switchToEditorScreen(true);
                } catch (e) {
                    console.error("Demo Load Error:", e);
                    alert("Fehler beim Laden der Demo-Noten:\n" + e.message);
                    showLoadingOverlay(false);
                }
            }, 500);
        })
        .catch(err => {
            console.error(err);
            alert('Fehler beim Laden der Demo-Noten: ' + err.message);
            showLoadingOverlay(false);
        });
});

// Back to scanner screen
btnBackToUpload.addEventListener('click', () => {
    switchToEditorScreen(false);
    
    // Clear state
    musicXmlDoc = null;
    systemBreaks = [];
    pageBreaks = [];
    autoMeasuresSelect.value = 'custom';
    
    // Reset selectors
    selectPreviewMode.value = 'osmd';
    groupServerEngine.style.display = 'none';
    btnGenerateServerPreview.style.display = 'none';
    pdfPreviewFrame.style.display = 'none';
    pdfPreviewFrame.removeAttribute('src');
    scorePreviewPage.style.display = 'block';
    
    selectExportEngine.value = 'osmd';
    exportHelpText.textContent = "Wähle im Druckdialog deines Browsers 'Als PDF speichern'.";
    btnPrintPdf.innerHTML = '<i data-lucide="printer"></i> PDF exportieren';
    lucide.createIcons({ container: btnPrintPdf.parentElement });
});

// Print/PDF Export
btnPrintPdf.addEventListener('click', () => {
    const engine = selectExportEngine.value;
    if (engine === 'osmd') {
        window.print();
    } else {
        exportServerPDF(engine);
    }
});

// ==========================================================================
// MUSICXML DOM MANIPULATION & OSMD RENDER LOOP
// ==========================================================================

// Helper functions for XML Title and Composer manipulation
function getXMLTitle(xmlDoc) {
    let el = xmlDoc.getElementsByTagName('work-title')[0] || xmlDoc.getElementsByTagName('movement-title')[0];
    return el ? el.textContent.trim() : '';
}

function setXMLTitle(xmlDoc, newTitle) {
    let el = xmlDoc.getElementsByTagName('work-title')[0] || xmlDoc.getElementsByTagName('movement-title')[0];
    if (el) {
        el.textContent = newTitle;
    } else {
        const movementTitle = xmlDoc.createElement('movement-title');
        movementTitle.textContent = newTitle;
        xmlDoc.documentElement.appendChild(movementTitle);
    }
}

function getXMLComposer(xmlDoc) {
    const creators = xmlDoc.getElementsByTagName('creator');
    for (let i = 0; i < creators.length; i++) {
        if (creators[i].getAttribute('type') === 'composer') {
            return creators[i].textContent.trim();
        }
    }
    return '';
}

function setXMLComposer(xmlDoc, newComposer) {
    const creators = xmlDoc.getElementsByTagName('creator');
    let composerEl = null;
    for (let i = 0; i < creators.length; i++) {
        if (creators[i].getAttribute('type') === 'composer') {
            composerEl = creators[i];
            break;
        }
    }
    if (composerEl) {
        composerEl.textContent = newComposer;
    } else {
        let identEl = xmlDoc.getElementsByTagName('identification')[0];
        if (!identEl) {
            identEl = xmlDoc.createElement('identification');
            xmlDoc.documentElement.insertBefore(identEl, xmlDoc.documentElement.firstChild);
        }
        const creatorEl = xmlDoc.createElement('creator');
        creatorEl.setAttribute('type', 'composer');
        creatorEl.textContent = newComposer;
        identEl.appendChild(creatorEl);
    }
}

function loadMusicXML(xmlText) {
    const parser = new DOMParser();
    musicXmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Count measures in first part
    const parts = musicXmlDoc.getElementsByTagName('part');
    if (parts.length > 0) {
        const measures = parts[0].getElementsByTagName('measure');
        measuresCount = measures.length;
    } else {
        measuresCount = 0;
    }

    // Extract Title & Composer from XML to pre-fill inputs
    const xmlTitle = getXMLTitle(musicXmlDoc) || currentProject.title;
    const xmlComposer = getXMLComposer(musicXmlDoc);

    inputProjectTitle.value = xmlTitle;
    inputProjectComposer.value = xmlComposer;
    projectTitleDisplay.textContent = xmlTitle || 'Unbenanntes Lied';

    // Synchronize filename input (clean extension)
    let displayFilename = currentProject.filename;
    if (displayFilename.endsWith('.musicxml')) {
        displayFilename = displayFilename.slice(0, -9);
    } else if (displayFilename.endsWith('.xml')) {
        displayFilename = displayFilename.slice(0, -4);
    }
    inputProjectFilename.value = displayFilename;

    // Reset layout states
    systemBreaks = [];
    pageBreaks = [];
    autoMeasuresSelect.value = 'custom';
    SettingsManager.reset();

    // Reset PDF preview frame
    if (pdfPreviewFrame.src) {
        URL.revokeObjectURL(pdfPreviewFrame.src);
    }
    pdfPreviewFrame.removeAttribute('src');

    // Init display
    initOSMD();
    updateTaktGridUI();
    renderScore(true);
}

// Inject break instructions into the parsed XML DOM
function applyBreaksToXML(xmlDoc, sysBreaks, pgBreaks) {
    const parts = xmlDoc.getElementsByTagName('part');
    if (parts.length === 0) return;

    for (let p = 0; p < parts.length; p++) {
        const part = parts[p];
        const measures = part.getElementsByTagName('measure');

        // Remove all previous formatting layout break prints to prevent conflicts
        const prints = part.getElementsByTagName('print');
        Array.from(prints).forEach(pr => {
            pr.removeAttribute('new-system');
            pr.removeAttribute('new-page');
        });

        for (let i = 0; i < measures.length; i++) {
            const measure = measures[i];
            const measureSeq = i + 1; // 1-indexed

            // A break after measure N is applied to the <print> block of measure N+1
            const targetMeasureSeq = measureSeq - 1;

            const needPage = pgBreaks.includes(targetMeasureSeq);
            const needSystem = sysBreaks.includes(targetMeasureSeq);

            if (needPage || needSystem) {
                let printEl = measure.querySelector('print');
                if (!printEl) {
                    printEl = xmlDoc.createElement('print');
                    measure.insertBefore(printEl, measure.firstChild); // Insert as first child node
                }

                if (needPage) {
                    printEl.setAttribute('new-page', 'yes');
                } else if (needSystem) {
                    printEl.setAttribute('new-system', 'yes');
                }
            }
        }
    }
}

// Render score with OSMD
function renderScore(fullReload = true) {
    if (!osmdInstance || !musicXmlDoc) return;

    // Apply break settings to the XML DOM
    applyBreaksToXML(musicXmlDoc, systemBreaks, pageBreaks);

    const zoom = SettingsManager.values['zoom-scale'] / 100;
    const spacing = SettingsManager.values['system-spacing'] / 4;
    
    // Map selected format to OSMD standard format
    const formatVal = SettingsManager.values['page-format'];
    let osmdFormat = 'Endless';
    if (formatVal === 'a4') osmdFormat = 'A4_P';
    else if (formatVal === 'a4-landscape') osmdFormat = 'A4_L';
    else if (formatVal === 'letter') osmdFormat = 'Letter_P';
    else if (formatVal === 'tablet') osmdFormat = 'Letter_P'; // Fallback for tablet
    else if (formatVal === 'fluid') osmdFormat = 'Endless';

    const applyOptionsAndZoom = () => {
        osmdInstance.setOptions({
            newSystemFromXML: true,
            newPageFromXML: true,
            systemSpacing: spacing
        });

        if (formatVal === 'tablet') {
            osmdInstance.setCustomPageFormat(240, 320); // 4:3 aspect ratio
        } else {
            osmdInstance.setPageFormat(osmdFormat);
        }

        osmdInstance.Zoom = zoom;
    };

    if (fullReload) {
        // Serialize XML DOM to string to force OSMD to re-parse it and avoid caching issues
        const serializer = new XMLSerializer();
        const xmlString = serializer.serializeToString(musicXmlDoc);
        osmdInstance.load(xmlString)
            .then(() => {
                applyOptionsAndZoom();
                osmdInstance.render();
            })
            .catch(err => console.error('OSMD load/render error:', err));
    } else {
        applyOptionsAndZoom();
        osmdInstance.render();
    }
}

// ==========================================================================
// INTERACTIVE TAKT-MANAGER (BREAKS GRID)
// ==========================================================================

autoMeasuresSelect.addEventListener('change', () => {
    const val = autoMeasuresSelect.value;
    if (val === 'custom') return;

    const interval = parseInt(val, 10);
    systemBreaks = [];
    pageBreaks = [];

    for (let i = interval; i < measuresCount; i += interval) {
        systemBreaks.push(i);
    }

    updateTaktGridUI();
    renderScore(true);
});

function updateTaktGridUI() {
    taktGridContainer.innerHTML = '';

    if (measuresCount <= 1) {
        taktGridContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:10px 0;">Keine Takte zum Verwalten vorhanden.</div>';
        return;
    }

    // We can't break after the last measure (since song ends)
    for (let i = 1; i < measuresCount; i++) {
        const taktItem = document.createElement('div');
        taktItem.className = 'takt-item';

        const title = document.createElement('span');
        title.className = 'takt-title';
        title.textContent = `Takt ${i}`;
        taktItem.appendChild(title);

        const breaksGroup = document.createElement('div');
        breaksGroup.className = 'takt-breaks';

        // System break toggle
        const btnLine = document.createElement('button');
        btnLine.className = 'break-toggle';
        if (systemBreaks.includes(i)) btnLine.classList.add('active-line');
        btnLine.innerHTML = '<i data-lucide="corner-down-left" style="width: 11px; height:11px;"></i> Zeile';
        btnLine.addEventListener('click', () => toggleBreak(i, 'line'));

        // Page break toggle
        const btnPage = document.createElement('button');
        btnPage.className = 'break-toggle';
        if (pageBreaks.includes(i)) btnPage.classList.add('active-page');
        btnPage.innerHTML = '<i data-lucide="file" style="width: 11px; height:11px;"></i> Seite';
        btnPage.addEventListener('click', () => toggleBreak(i, 'page'));

        breaksGroup.appendChild(btnLine);
        breaksGroup.appendChild(btnPage);
        taktItem.appendChild(breaksGroup);
        taktGridContainer.appendChild(taktItem);
    }

    lucide.createIcons({ container: taktGridContainer });
}

function toggleBreak(measureSeq, type) {
    // Revert automatic break select back to manual custom setting
    autoMeasuresSelect.value = 'custom';

    if (type === 'line') {
        if (systemBreaks.includes(measureSeq)) {
            systemBreaks = systemBreaks.filter(x => x !== measureSeq);
        } else {
            systemBreaks.push(measureSeq);
            pageBreaks = pageBreaks.filter(x => x !== measureSeq); // Remove page breaks on conflict
        }
    } 
    else if (type === 'page') {
        if (pageBreaks.includes(measureSeq)) {
            pageBreaks = pageBreaks.filter(x => x !== measureSeq);
        } else {
            pageBreaks.push(measureSeq);
            systemBreaks = systemBreaks.filter(x => x !== measureSeq); // Remove system breaks on conflict
        }
    }

    updateTaktGridUI();
    renderScore(true);
}

// ==========================================================================
// VIEW ROUTER & LOADING INTERFACES HELPERS
// ==========================================================================

function switchToEditorScreen(inEditor) {
    if (inEditor) {
        screenUpload.classList.remove('active');
        screenEditor.classList.add('active');
        document.getElementById('step-1-indicator').classList.remove('active');
        document.getElementById('step-2-indicator').classList.add('active');
    } else {
        screenEditor.classList.remove('active');
        screenUpload.classList.add('active');
        document.getElementById('step-1-indicator').classList.add('active');
        document.getElementById('step-2-indicator').classList.remove('active');
    }
}

function showLoadingOverlay(show) {
    if (show) {
        loadingOverlay.classList.add('active');
    } else {
        loadingOverlay.classList.remove('active');
    }
}

function updateLoadingProgress(percent, text) {
    loadingProgress.style.width = percent + '%';
    if (text) loadingText.textContent = text;
}

function updateLoadingStep(stepId, state) {
    const stepEl = document.getElementById('load-step-' + stepId);
    if (!stepEl) return;

    stepEl.className = 'loading-step ' + state;
    const oldIcon = stepEl.querySelector('.step-check, .lucide, i');
    const newIcon = document.createElement('i');
    newIcon.className = 'step-check';

    if (state === 'completed') {
        newIcon.setAttribute('data-lucide', 'check-circle-2');
    } else if (state === 'active') {
        newIcon.setAttribute('data-lucide', 'loader-2');
        newIcon.classList.add('spinner-icon');
    } else {
        newIcon.setAttribute('data-lucide', 'circle');
    }
    
    if (oldIcon) {
        oldIcon.replaceWith(newIcon);
    } else {
        stepEl.insertBefore(newIcon, stepEl.firstChild);
    }
    
    lucide.createIcons({ container: stepEl });
}

// ==========================================================================
// MULTI-ENGINE INTEGRATION FUNCTIONS
// ==========================================================================

function checkEngineAvailability() {
    authFetch('/api/engines')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.engines) {
                availableEngines = data.engines;
                updateEngineSelectorsUI();
            }
        })
        .catch(err => {
            console.error('Error checking engine availability:', err);
        });
}

function updateEngineSelectorsUI() {
    const serverSelect = document.getElementById('select-server-engine');
    const exportSelect = document.getElementById('select-export-engine');
    if (!serverSelect || !exportSelect) return;
    
    // Server select options
    Array.from(serverSelect.options).forEach(opt => {
        const engine = opt.value;
        if (engine === 'lilypond' || engine === 'musescore') {
            if (!availableEngines[engine]) {
                opt.disabled = true;
                opt.textContent = opt.textContent.split(' (')[0] + ' (nicht installiert)';
            } else {
                opt.disabled = false;
                opt.textContent = opt.textContent.split(' (')[0] + (engine === 'lilypond' ? ' (Vektor-PDF)' : ' (CLI)');
            }
        }
    });

    // Export select options
    Array.from(exportSelect.options).forEach(opt => {
        const engine = opt.value;
        if (engine === 'lilypond' || engine === 'musescore') {
            if (!availableEngines[engine]) {
                opt.disabled = true;
                opt.textContent = opt.textContent.split(' (')[0] + ' (nicht installiert)';
            } else {
                opt.disabled = false;
                opt.textContent = opt.textContent.split(' (')[0] + ' (Server)';
            }
        }
    });
}

function showServerPreviewLoading(show, engineName = '') {
    if (show) {
        loadingTitle.textContent = `Vorschau wird generiert (${engineName})...`;
        loadingText.textContent = 'MusicXML wird übertragen und PDF kompiliert. Bitte warten...';
        loadingProgress.style.width = '50%';
        loadingOverlay.classList.add('active');
        
        // Hide OMR specific steps
        const stepsList = document.querySelector('.loading-steps-list');
        if (stepsList) stepsList.style.display = 'none';
        if (btnCancelScanning) btnCancelScanning.style.display = 'none';
    } else {
        loadingOverlay.classList.remove('active');
        
        // Restore defaults
        loadingTitle.textContent = 'Datei wird verarbeitet...';
        loadingText.textContent = 'Dies kann je nach Notenkomplexität 30-60 Sekunden dauern.';
        loadingProgress.style.width = '0%';
        
        const stepsList = document.querySelector('.loading-steps-list');
        if (stepsList) stepsList.style.display = 'block';
        if (btnCancelScanning) btnCancelScanning.style.display = 'inline-block';
    }
}

function generateServerPreview() {
    if (!musicXmlDoc) return;
    
    // Apply breaks to the XML
    applyBreaksToXML(musicXmlDoc, systemBreaks, pageBreaks);
    
    // Serialize XML
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(musicXmlDoc);
    
    const engine = selectServerEngine.value;
    const engineLabel = selectServerEngine.options[selectServerEngine.selectedIndex].textContent.split(' (')[0];
    
    showServerPreviewLoading(true, engineLabel);
    
    authFetch('/api/projects/export', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            xml: xmlString,
            engine: engine
        })
    })
    .then(async res => {
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Fehler bei der serverseitigen Generierung.');
        }
        return res.blob();
    })
    .then(blob => {
        // Clean old object url if exists
        if (pdfPreviewFrame.src) {
            URL.revokeObjectURL(pdfPreviewFrame.src);
        }
        const blobUrl = URL.createObjectURL(blob);
        pdfPreviewFrame.src = blobUrl;
        showServerPreviewLoading(false);
    })
    .catch(err => {
        console.error(err);
        alert('Server-Vorschau fehlgeschlagen:\n' + err.message);
        showServerPreviewLoading(false);
        // Fallback to OSMD
        selectPreviewMode.value = 'osmd';
        selectPreviewMode.dispatchEvent(new Event('change'));
    });
}

function exportServerPDF(engine) {
    if (!musicXmlDoc) return;
    
    // Apply breaks
    applyBreaksToXML(musicXmlDoc, systemBreaks, pageBreaks);
    
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(musicXmlDoc);
    
    const engineLabel = engine === 'lilypond' ? 'LilyPond' : 'MuseScore';
    
    // Reuse loading overlay
    showServerPreviewLoading(true, engineLabel);
    loadingTitle.textContent = `PDF wird kompiliert (${engineLabel})...`;
    
    authFetch('/api/projects/export', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            xml: xmlString,
            engine: engine
        })
    })
    .then(async res => {
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Fehler beim PDF-Export.');
        }
        return res.blob();
    })
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        let rawFilename = inputProjectFilename.value.trim() || 'notensatzergebnis';
        a.download = `${rawFilename}_${engine}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showServerPreviewLoading(false);
    })
    .catch(err => {
        console.error(err);
        alert('Export fehlgeschlagen:\n' + err.message);
        showServerPreviewLoading(false);
    });
}

// Check if user session token is still valid
function checkSession() {
    const token = getAuthToken();
    if (!token) {
        document.getElementById('auth-overlay').classList.add('active');
        return;
    }
    
    authFetch('/api/auth/status')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                document.getElementById('auth-overlay').classList.remove('active');
                setupSessionUI(data.username, data.role);
                loadLibrary();
                checkEngineAvailability();
            } else {
                sessionStorage.removeItem('auth_token');
                document.getElementById('auth-overlay').classList.add('active');
            }
        })
        .catch(() => {
            document.getElementById('auth-overlay').classList.add('active');
        });
}

// Update UI elements based on user role and username
function setupSessionUI(username, role) {
    document.getElementById('header-username').textContent = username;
    document.getElementById('user-profile-widget').style.display = 'flex';
    
    const btnDelReq = document.getElementById('btn-request-delete');
    if (role === 'admin') {
        btnDelReq.style.display = 'none';
        document.getElementById('admin-panel-card').style.display = 'block';
        loadAdminUsers();
    } else {
        btnDelReq.style.display = 'inline-block';
        document.getElementById('admin-panel-card').style.display = 'none';
    }
    
    lucide.createIcons({ container: document.getElementById('user-profile-widget') });
}

// Load users for administrator management panel
function loadAdminUsers() {
    authFetch('/api/admin/users')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.getElementById('admin-users-tbody');
                const selectReset = document.getElementById('admin-reset-username');
                
                tbody.innerHTML = '';
                selectReset.innerHTML = '<option value="">Wähle einen Benutzer...</option>';
                
                data.users.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.username;
                    opt.textContent = u.username;
                    selectReset.appendChild(opt);
                    
                    const tr = document.createElement('tr');
                    
                    const tdUser = document.createElement('td');
                    tdUser.textContent = u.username;
                    tr.appendChild(tdUser);
                    
                    const tdRole = document.createElement('td');
                    tdRole.textContent = u.role === 'admin' ? 'Administrator' : 'Standardbenutzer';
                    tr.appendChild(tdRole);
                    
                    const tdStatus = document.createElement('td');
                    const badge = document.createElement('span');
                    badge.className = 'badge';
                    if (u.status === 'approved') {
                        badge.classList.add('badge-approved');
                        badge.textContent = 'Freigegeben';
                    } else if (u.status === 'pending') {
                        badge.classList.add('badge-pending');
                        badge.textContent = 'Ausstehend';
                    } else if (u.status === 'delete_pending') {
                        badge.classList.add('badge-delete-pending');
                        badge.textContent = 'Löschwunsch';
                    }
                    tdStatus.appendChild(badge);
                    tr.appendChild(tdStatus);
                    
                    const tdActions = document.createElement('td');
                    const btnGroup = document.createElement('div');
                    btnGroup.className = 'admin-action-btn-group';
                    
                    if (u.status === 'pending') {
                        const btnApprove = document.createElement('button');
                        btnApprove.className = 'btn-primary btn-small';
                        btnApprove.innerHTML = '<i data-lucide="user-check" style="width:12px; height:12px;"></i> Freigeben';
                        btnApprove.addEventListener('click', () => approveUser(u.username));
                        btnGroup.appendChild(btnApprove);
                    }
                    
                    const currentLoggedUser = document.getElementById('header-username').textContent;
                    if (u.username !== currentLoggedUser) {
                        const btnDelete = document.createElement('button');
                        btnDelete.className = 'btn-secondary btn-small';
                        btnDelete.style.color = 'var(--error)';
                        btnDelete.style.borderColor = 'rgba(255, 69, 69, 0.3)';
                        btnDelete.innerHTML = '<i data-lucide="user-minus" style="width:12px; height:12px;"></i> Löschen';
                        btnDelete.addEventListener('click', () => deleteUser(u.username));
                        btnGroup.appendChild(btnDelete);
                    }
                    
                    tdActions.appendChild(btnGroup);
                    tr.appendChild(tdActions);
                    tbody.appendChild(tr);
                });
                
                lucide.createIcons({ container: tbody });
            }
        })
        .catch(err => console.error('Error loading admin users list:', err));
}

// Approve user account
function approveUser(username) {
    authFetch('/api/admin/users/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loadAdminUsers();
        } else {
            alert('Fehler bei Freigabe: ' + data.error);
        }
    })
    .catch(err => alert('Fehler bei Freigabe: ' + err.message));
}

// Confirm deletion of user account
function deleteUser(username) {
    const confirmMsg = `Möchtest du das Benutzerkonto "${username}" und alle zugehörigen verschlüsselten Notendateien wirklich unwiderruflich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`;
    if (confirm(confirmMsg)) {
        authFetch(`/api/admin/users/${username}`, {
            method: 'DELETE'
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(data.message);
                loadAdminUsers();
            } else {
                alert('Fehler beim Löschen: ' + data.error);
            }
        })
        .catch(err => alert('Fehler beim Löschen: ' + err.message));
    }
}

