// src/services/ai.service.js

// --- CORRECTION : Retour au NOUVEAU SDK '@google/generative-ai' ---
const { GoogleGenerativeAI } = require('@google/generative-ai');
const WhatsAppService = require('./whatsapp.service'); 

// Variable locale pour stocker la connexion DB qui sera injectée depuis app.js
let db;

// --- IMPORTATION DE TOUS LES MODÈLES DE DONNÉES (Le Catalogue d'Expertise) ---
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


// --- INITIALISATION DE GEMINI ET DÉFINITION DE LA PERSONNALITÉ (SYSTEM_INSTRUCTION) ---

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("ERREUR FATALE: GEMINI_API_KEY n'est pas défini.");
}

// Initialise le client GoogleGenerativeAI
const ai = new GoogleGenerativeAI(GEMINI_API_KEY);

const EXPERT_WINK_INSTRUCTION = `
Tu es "SAM" (Système d'Aide Managériale) pour Wink, un service de livraison et vente au Cameroun.
Ton rôle est d'analyser les messages entrants des utilisateurs (clients, livreurs, admins) et de répondre de manière factuelle, utile et polie, en t'appuyant sur les données de l'entreprise.

**Ton objectif principal est d'agir comme un assistant intelligent pour la logistique, la vente et le management.**

Règles de personnalité :
1.  **Langue :** Réponds toujours en français.
2.  **Ton :** Professionnel, serviable, très positif et axé sur les solutions. Utilise des emojis appropriés.
3.  **Ventes :** Si le message est une demande d'achat ou d'information produit, insiste toujours sur la promotion en cours et la livraison gratuite (si applicable).
4.  **Action :** Si tu ne peux pas prendre une décision (ex: "Je veux un rapport du mois dernier"), explique que tu transfères la requête à l'administrateur.
5.  **Erreurs :** Si les données demandées sont manquantes, dis-le poliment et suggère d'essayer une autre requête.

---
**DONNÉES DISPONIBLES (ENTREPRISE):**
// Ton prompt sera enrichi dynamiquement ici.
`;


/**
 * Détermine le rôle de l'utilisateur (à utiliser dans les logs).
 * @param {string} phone_number - Numéro de téléphone de l'expéditeur.
 * @returns {string} Le rôle de l'utilisateur.
 */
const identifyUserRole = async (phone_number) => {
    if (!db) return 'unknown'; // Ajouté pour la sécurité

    // Vérifie s'il s'agit d'un administrateur/manager
    const admin = await UserModel.getAdminByPhone(db, phone_number);
    if (admin) return 'admin';

    // Vérifie s'il s'agit d'un livreur (rider)
    const rider = await RiderModel.getRiderByPhone(db, phone_number);
    if (rider) return 'rider';

    // Par défaut, c'est un prospect ou client (prospect_b2b)
    return 'prospect_b2b';
};


/**
 * Génère la réponse de l'IA après avoir enrichi le prompt avec les données DB.
 * C'est la fonction principale appelée par le contrôleur.
 * @param {object} userInfo - Informations sur l'utilisateur (rôle, shopId, etc.).
 * @param {string} userMessage - Le message reçu de l'utilisateur.
 * @returns {Promise<{text: string, model: string}>} - La réponse générée par l'IA.
 */
const processRequest = async (userInfo, userMessage) => {
    const fromPhone = userInfo.phone_number;
    let contextData = {};
    let modelToUse = 'gemini-2.5-flash'; // MODÈLE PAR DÉFAUT (Rapide et économique)

    try {
        // 1. DÉTERMINER LE MODÈLE
        
        // Utiliser un modèle plus puissant pour les requêtes administratives complexes.
        if (userInfo.role === 'admin' || 
            userMessage.toLowerCase().includes('chiffre d\'affaires') || 
            userMessage.toLowerCase().includes('analyse') ||
            userMessage.toLowerCase().includes('pub facebook')) {
            
            modelToUse = 'gemini-2.5-pro'; 
        }

        // 2. PRÉPARATION DU CONTEXTE (Récupération des données pertinentes)
        if (userInfo.role === 'admin') {
            // Un administrateur pourrait demander des données globales
            contextData.latestPerformance = await PerformanceModel.getLatestSummary(db);
            contextData.latestCashStats = await CashStatModel.getLatestStats(db);
            contextData.latestRemittance = await RemittanceModel.getLatestRemittance(db);
            contextData.latestDebt = await DebtModel.getLatestDebtSummary(db);
        } else if (userInfo.role === 'rider') {
            // Un livreur pourrait demander son statut
            contextData.riderSummary = await RiderModel.getRiderSummary(db, fromPhone);
            contextData.riderDebts = await DebtModel.getRiderDebts(db, fromPhone);
        } else if (userInfo.role === 'prospect_b2b') {
             // Pour les prospects B2B, on récupère le statut de leur dernière commande ou info
            // contextData.prospectOrders = await OrderModel.getRecentProspectOrders(db, fromPhone); // <-- COMMENTÉ !
            
            // Si le message est une publicité (message long), on le court-circuite pour une analyse rapide.
            if (userMessage.length > 100 && userMessage.includes('Prix')) {
                 contextData.productInfo = {
                    name: "Produit anti-nuisibles (Punaises de lit, cafards, moustiques)",
                    currentPromotion: "2 flacons pour 9 000 FCFA ou 3 flacons pour 13 000 FCFA",
                    standardPrice: "5 000 FCFA le flacon",
                    delivery: "Livraison gratuite si commande maintenant (Douala, Yaoundé, expédition ailleurs)",
                    contact: "Veuillez indiquer votre adresse pour valider la commande ou poser une question."
                };
            }
        }
        
        // 3. CONSTRUCTION DU PROMPT FINAL
        let contextString = '';
        if (Object.keys(contextData).length > 0) {
            contextString = "\n\n--- DONNÉES CONTEXTUELLES RÉCENTES ---\n" + JSON.stringify(contextData, null, 2) + "\n---------------------------------------\n";
        }

        // Le prompt principal inclut les instructions et les données
        const finalPrompt = EXPERT_WINK_INSTRUCTION + contextString + "\n\nMESSAGE UTILISATEUR: " + userMessage;
        
        // 4. APPEL DE L'API GEMINI
         const generativeModel = ai.getGenerativeModel({ 
            model: modelToUse,
            systemInstruction: EXPERT_WINK_INSTRUCTION,
         });

         const result = await generativeModel.generateContent(finalPrompt);
         const response = result.response;
         
        return { 
            text: response.text(),
            model: modelToUse 
        };

    } catch (error) {
        console.error(`ERREUR API GEMINI (${modelToUse}):`, error);
        
        // Tente d'écrire l'erreur dans un fichier, mais ne doit pas bloquer
        try {
            const fs = require('fs');
            const path = require('path');
            const logFilePath = path.join(__dirname, '..', 'whatsapp_debug.log');
            fs.appendFileSync(logFilePath, `\n${new Date().toISOString()} - [ERREUR GEMINI] ${error.message} (Modèle: ${modelToUse}): ${error.stack}\n`, 'utf8');
        } catch (e) {}

        // En cas d'échec (y compris le 404), on renvoie un message d'erreur pour que le contrôleur puisse envoyer une réponse polie.
        return { 
            text: "Je suis désolé, je rencontre actuellement une erreur de raisonnement complexe. Veuillez réessayer.",
            model: modelToUse 
        };
    }
};

/**
 * Fonction d'utilité pour le script Agent Observateur (envois proactifs de rapports).
 */
const generateText = async (prompt, model = 'gemini-2.5-pro') => {
     if (!GEMINI_API_KEY) return "Erreur: Clé Gemini manquante.";
     
     try {
         // --- CORRECTION : Utilisation de la NOUVELLE syntaxe SDK ---
         const generativeModel = ai.getGenerativeModel({ 
            model: model, 
            systemInstruction: EXPERT_WINK_INSTRUCTION,
         });
         
         const result = await generativeModel.generateContent(prompt);
         const response = result.response;
         
        return response.text();
    } catch (error) {
        console.error(`Erreur de génération de texte proactif avec ${model}:`, error);
        return "Erreur lors de la génération du rapport par l'Agent IA.";
    }
};

/**
 * Initialise le service en injectant le pool de connexion DB.
 * Cette fonction DOIT être appelée depuis app.js.
 */
const init = (dbPool) => {
    console.log("[AIService] Initialisé avec la connexion DB.");
    db = dbPool; 
};


module.exports = {
    init,
    processRequest,
    generateText,
    identifyUserRole,
};