// src/scripts/aiAgentWatcher.js

// Importe les services (ils sont initialisés par app.js)
const AIService = require('../services/ai.service'); 
const WhatsAppService = require('../services/whatsapp.service');

// --- IMPORTATION DE TOUS LES MODÈLES DE DONNÉES (Expertise Totale) ---
const UserModel = require('../models/user.model');
const ShopModel = require('../models/shop.model');
const OrderModel = require('../models/order.model');
const DebtModel = require('../models/debt.model');
const RemittanceModel = require('../models/remittance.model');
const CashModel = require('../models/cash.model');
const CashStatModel = require('../models/cash.stat.model');
const RidersCashModel = require('../models/riderscash.model');
const DashboardModel = require('../models/dashboard.model');
const ReportModel = require('../models/report.model');
const PerformanceModel = require('../models/performance.model');
const RiderModel = require('../models/rider.model');
const ScheduleModel = require('../models/schedule.model');
const MessageModel = require('../models/message.model.js');

// Variable locale pour stocker la connexion DB qui sera injectée
let db;

// --- CONFIGURATION DU MOTEUR ---
const WATCH_INTERVAL_MS = 60000; 
const LAST_RUN_CACHE = {}; 
const GOOGLE_FORM_LINK = process.env.GOOGLE_FORM_LINK;
const FACEBOOK_REVIEW_LINK = process.env.FACEBOOK_REVIEW_LINK;

/**
 * Vérifie si le rapport de performance journalier doit être envoyé.
 */
const checkPerformanceReports = async () => {
    // ... (Logique inchangée pour déterminer si un rapport doit être envoyé) ...
    try {
        const lastRunTime = LAST_RUN_CACHE['report_check'] || 0;
        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        
        // On ne vérifie qu'une fois par heure pour ne pas surcharger la DB
        if (now - lastRunTime < 60 * 60 * 1000) { 
            return;
        }
        
        const today = new Date().toISOString().split('T')[0];
        const hasReportBeenSentToday = await ReportModel.hasReportBeenSent(db, today);

        if (hasReportBeenSentToday) {
            LAST_RUN_CACHE['report_check'] = now;
            return;
        }

        // Récupération des données pour le rapport
        const summaryData = await DashboardModel.getDailySummary(db); 
        const admins = await UserModel.getAllAdmins(db);

        if (summaryData.total_orders > 0 && admins.length > 0) {
            const prompt = `
                Tu es l'Agent SAM. Rédige un rapport de performance quotidien pour les administrateurs, basé sur les données ci-dessous.
                Le rapport doit être concis, positif et mettre en lumière les succès et les points d'amélioration. Utilise des emojis.
                
                Données du Jour (JSON) : 
                ${JSON.stringify(summaryData, null, 2)}
            `;
            
            // --- CORRECTION NOM MODÈLE : Utilisation de gemini-2.5-pro pour une meilleure analyse de rapport ---
            const aiReportText = await AIService.generateText(prompt, 'gemini-2.5-pro'); 

            for (const admin of admins) {
                // --- CORRECTION NOM MODÈLE : Préciser le modèle utilisé pour le log ---
                await WhatsAppService.sendText(admin.phone_number, aiReportText, 'gemini-2.5-pro'); 
            }
            
            // Marquer l'action dans la BD
            await ReportModel.recordReportSent(db, today);
            LAST_RUN_CACHE['report_check'] = now;
        }

    } catch (error) {
        console.error("[AI Watcher] Erreur lors de la vérification des rapports de performance:", error.message);
    }
};


/**
 * Vérifie les commandes livrées il y a 24h et envoie une demande d'avis.
 */
const checkDeliveredOrdersForReview = async () => {
    try {
        const orders = await OrderModel.getDeliveredOrdersPendingReview(db); // Récupère les commandes livrées il y a ~24h sans avis AI

        for (const order of orders) {
            // Vérification de la présence des liens
            if (!GOOGLE_FORM_LINK || !FACEBOOK_REVIEW_LINK) {
                console.warn("[AI Watcher] Liens de sondage/avis manquants dans .env. Opération ignorée.");
                return;
            }

            const prompt = `
                Tu es l'Agent SAM. Rédige un message de suivi poli pour un client nommé ${order.customer_name} (ou 'Cher client' si non spécifié) dont la commande n°${order.id} a été livrée hier.
                Le but est de s'assurer que la commande s'est bien passée et de demander poliment un avis sur Facebook et un feedback rapide via notre formulaire Google.
                
                Rappelle-lui l'importance de son avis pour améliorer notre service.
                
                Liens à inclure (formater comme des liens cliquables) :
                Lien Google Form: ${GOOGLE_FORM_LINK}
                Lien Facebook: ${FACEBOOK_REVIEW_LINK}
            `;
            
            // --- CORRECTION NOM MODÈLE : Utilisation de gemini-2.5-flash pour un message de routine rapide ---
            const aiMessage = await AIService.generateText(prompt, 'gemini-2.5-flash'); 

            // --- CORRECTION NOM MODÈLE : Préciser le modèle utilisé pour le log ---
            await WhatsAppService.sendText(order.customer_phone, aiMessage, 'gemini-2.5-flash'); 
            
            // Marquer l'action dans la BD
            await db.execute("UPDATE orders SET ai_review_sent = 1 WHERE id = ?", [order.id]);
        }
    } catch (error) {
        console.error("[AI Watcher] Erreur lors de la vérification des commandes livrées (Action requise: Ajouter colonne 'ai_review_sent'):", error.message);
    }
};


/**
 * Fonction principale du moteur qui tourne en boucle.
 */
const runAgentCycle = async () => {
    if (!db) {
        return;
    }
    
    await checkPerformanceReports();
    await checkDeliveredOrdersForReview();
};


/**
 * Initialise le service en injectant le pool de connexion DB et démarre le moteur.
 */
const init = (dbPool) => {
    console.log("[AIWatcher] Initialisé avec la connexion DB.");
    db = dbPool; 
    
    if (process.env.NODE_ENV !== 'test') {
        // Démarre la boucle du moteur
        console.log(`[AIWatcher] Démarrage du moteur proactif (Intervalle: ${WATCH_INTERVAL_MS / 1000}s).`);
        setInterval(runAgentCycle, WATCH_INTERVAL_MS);
    }
};


module.exports = {
    init
};