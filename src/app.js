// src/app.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const http = require('http'); // Module HTTP natif de Node.js

// --- Import des Routes Existantes ---
const userRoutes = require('./routes/users.routes');
const shopRoutes = require('./routes/shops.routes');
const orderRoutes = require('./routes/orders.routes');
const deliverymenRoutes = require('./routes/deliverymen.routes');
const reportsRoutes = require('./routes/reports.routes');
const authRoutes = require('./routes/auth.routes');
const remittanceRoutes = require('./routes/remittances.routes');
const debtRoutes = require('./routes/debt.routes');
const cashRoutes = require('./routes/cash.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const riderRoutes = require('./routes/rider.routes.js');
const performanceRoutes = require('./routes/performance.routes');
const scheduleRoutes = require('./routes/schedule.routes');
const suivisRoutes = require('./routes/suivis.routes.js');
const returnsRoutes = require('./routes/returns.routes');

// --- AJOUTÉ: Imports de l'Agent IA (Webhook et Services) ---
const whatsappRoutes = require('./routes/whatsapp.routes'); 
const WhatsAppService = require('./services/whatsapp.service');
const AIService = require('./services/ai.service');
const AIWatcher = require('./scripts/aiAgentWatcher');

// --- Import des Modèles et Services Existants (AVEC CORRECTIONS) ---
const userModel = require('./models/user.model');
const shopModel = require('./models/shop.model');
const orderModel = require('./models/order.model');
const reportModel = require('./models/report.model');
const remittanceModel = require('./models/remittance.model');
const debtModel = require('./models/debt.model');
// --- CORRIGÉ (Typo 1): Correction du chemin d'importation ---
const cashModel = require('./models/cash.model'); 
const dashboardModel = require('./models/dashboard.model');
const riderModel = require('./models/rider.model');
const ridersCashModel = require('./models/riderscash.model');
const performanceModel = require('./models/performance.model');
const scheduleModel = require('./models/schedule.model');
const messageModel = require('./models/message.model.js');
// --- CORRIGÉ (Typo 2): Correction du chemin d'importation ---
const cashStatModel = require('./models/cash.stat.model'); 
const cashClosingService = require('./services/cash.closing.service');

// --- AJOUTÉ: Import du Nouveau Modèle Prospect (pour corriger l'erreur du contrôleur) ---
const shopProspectModel = require('./models/shop.prospect.model');

// Services Existants
const remittanceService = require('./services/remittances.service.js');
const debtService = require('./services/debt.service.js');
const cashService = require('./services/cash.service.js');
const balanceService = require('./services/balance.service.js');
const webSocketService = require('./services/websocket.service.js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// --- MODIFIÉ: Configuration d'Express pour le Webhook Wasender ---

// 1. D'ABORD, nous gérons la route du Webhook SÉPARÉMENT
// Nous utilisons express.raw() pour capturer le corps brut (rawBody)
// AVANT tout autre parseur, et pour n'importe quel Content-Type.
// [ACTION REQUISE] : Placez ceci AVANT les app.use(express.json()) globaux
app.use('/api/whatsapp/webhook', express.raw({
    type: '*/*', // Accepte n'importe quel Content-Type (json, urlencoded, text...)
    limit: '5mb', // Augmentez si nécessaire
    verify: (req, res, buf) => {
        req.rawBody = buf; // Stocke toujours le buffer brut pour cette route
        // Log pour déboguer (vous le verrez dans les logs cPanel)
        console.log("[Webhook Middleware] Raw body capturé pour vérification.");
    }
}));

// 2. ENSUITE, nous appliquons les parseurs JSON et URLencoded pour TOUTES LES AUTRES routes
app.use(express.json()); // Remplace l'ancien app.use(express.json({ verify: ... }))
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, '..', 'public')));

// Configuration de la base de données
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
};

let dbPool; 

// Fonction pour établir la connexion à la base de données
async function connectToDatabase() {
    try {
        dbPool = mysql.createPool(dbConfig);
        console.log('Pool de connexions à la base de données créé avec succès !');
        const connection = await dbPool.getConnection();
        console.log('Connexion testée avec succès.');
        connection.release();
    } catch (error) {
        console.error('Erreur de création du pool ou de connexion test :', error);
        process.exit(1);
    }
}

// Fonction pour démarrer le serveur après la connexion à la BDD
async function startServer() {
    await connectToDatabase();

    // --- Initialisation des Services et Modèles (LOGIQUE EXISTANTE PRÉSERVÉE) ---
    cashStatModel.init(dbPool);
    cashClosingService.init(dbPool);
    cashService.init(dbPool);
    remittanceService.init(dbPool);
    debtService.init(dbPool);
    balanceService.init(dbPool);

    userModel.init(dbPool);
    shopModel.init(dbPool);
    remittanceModel.init(dbPool);
    cashModel.init(dbPool);
    dashboardModel.init(dbPool);
    reportModel.init(dbPool);
    debtModel.init(dbPool);
    riderModel.init(dbPool);
    ridersCashModel.init(dbPool);
    performanceModel.init(dbPool);
    scheduleModel.init(dbPool);
    messageModel.init(dbPool);
    orderModel.init(dbPool, messageModel);

    // --- AJOUTÉ: Initialisation des Nouveaux Modèles et Services de l'Agent IA ---
    // Nous injectons le dbPool dans les nouveaux fichiers pour respecter votre architecture.
    shopProspectModel.init(dbPool); // Initialise le nouveau modèle B2B
    WhatsAppService.init(dbPool); // Initialise la "Voix"
    AIService.init(dbPool);       // Initialise le "Cerveau"
//     AIWatcher.init(dbPool);     // Démarre le "Moteur Proactif"

    // --- Déclaration des Routes API (Existantes) ---
    app.use('/api', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/shops', shopRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/deliverymen', deliverymenRoutes);
    app.use('/api/reports', reportsRoutes);
    app.use('/api/remittances', remittanceRoutes);
    app.use('/api/debts', debtRoutes);
    app.use('/api/cash', cashRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/rider', riderRoutes);
    app.use('/api/performance', performanceRoutes);
    app.use('/api/schedule', scheduleRoutes);
    app.use('/api', suivisRoutes);
    app.use('/api/returns', returnsRoutes);

    // --- AJOUTÉ: Route de Webhook WhatsApp (Point d'entrée de l'Agent IA) ---
    // Note : la configuration express.raw() ci-dessus s'applique avant cette route.
    app.use('/api/whatsapp', whatsappRoutes);

    // --- Démarrage du serveur HTTP et WebSocket (Structure existante préservée) ---
    const server = http.createServer(app);

    webSocketService.initWebSocketServer(server);

    server.listen(port, () => {
        console.log(`📡 Le serveur WINK EXPRESS (HTTP & WebSocket) est en cours d'exécution sur le port ${port} 📡`);
    });
}

// Lancer le serveur
startServer();