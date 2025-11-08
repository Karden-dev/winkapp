// src/controllers/whatsapp.controller.js

const crypto = require('crypto');
const WhatsAppService = require('../services/whatsapp.service');
const AIService = require('../services/ai.service');
const UserModel = require('../models/user.model');
const ProspectModel = require('../models/shop.prospect.model');

// --- DÉBUT DU LOGGER PERSONNALISÉ ---
const fs = require('fs');
const path = require('path');
const logFilePath = path.join(__dirname, '..', 'whatsapp_debug.log');

/**
 * Écrit un message de log dans le fichier whatsapp_debug.log
 * @param {string} message Le message à enregistrer
 */
const logToFile = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${message}\n`;
    try {
        fs.appendFileSync(logFilePath, logMessage, 'utf8');
    } catch (err) {
        console.error(`Échec de l'écriture dans le fichier log: ${err.message}`);
    }
};
// --- FIN DU LOGGER PERSONNALISÉ ---


// --- CORRECTION ANTI-DOUBLON (SANS DÉPENDANCE EXTERNE) ---
// Remplacement de 'lru-cache' par un 'Map' natif de JavaScript.
const PROCESSED_MESSAGE_IDS = new Map();
const MESSAGE_CACHE_EXPIRATION_MS = 1000 * 60 * 5; // 5 minutes

// Nettoyeur périodique du cache
setInterval(() => {
    const now = Date.now();
    PROCESSED_MESSAGE_IDS.forEach((timestamp, id) => {
        if (now - timestamp > MESSAGE_CACHE_EXPIRATION_MS) {
            PROCESSED_MESSAGE_IDS.delete(id);
        }
    });
    // Log désactivé car trop fréquent, ou réduisez la fréquence.
}, MESSAGE_CACHE_EXPIRATION_MS * 2); // Nettoyage toutes les 10 minutes (2x l'expiration)
// --- FIN DE L'ANTI-DOUBLON ---


// --- SÉCURITÉ : Récupération des Clés ---
const WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET;
const DEBUG_MODE_SKIP_SECURITY = (!WEBHOOK_SECRET || WEBHOOK_SECRET === 'VOTRE_SECRET_FOURNI_PAR_WASENDER');

/**
 * Fonction de sécurité : Vérifie la signature de Wasender (SIMPLE COMPARAISON).
 * Rétablissement du comportement de Wasender : la signature est le secret lui-même.
 */
const verifyWasenderSignature = (signature, secret) => {
    if (DEBUG_MODE_SKIP_SECURITY) {
        logToFile("ATTENTION SÉCURITÉ: Contournement de la vérification de signature (DEBUG_MODE_SKIP_SECURITY=true).");
        return true;
    }
    if (!secret || !signature) {
        logToFile("[ERREUR SÉCURITÉ] Secret ou Signature manquant.");
        return false;
    }
    
    // --- CORRECTION : COMPARAISON SIMPLE DE CHAÎNE ---
    const isMatch = (signature === secret); 
    
    if (!isMatch) {
        // NOTE : On ne log pas le secret, seulement le résultat
        logToFile(`[SIG VERIFY] ÉCHEC. Signature reçue: ${signature.substring(0, 5)}...`);
    } else {
        logToFile("[SIG VERIFY] Signature vérifiée avec succès !");
    }
    return isMatch;
};


/**
 * Fonction utilitaire pour vérifier l'identité de l'expéditeur dans la BD.
 */
const identifyUser = async (phoneNumber) => {
    let userInfo = { phoneNumber: phoneNumber, role: 'prospect_b2b', id: null, name: 'Nouveau Prospect', shopId: null };
    try {
        const user = await UserModel.findByPhoneNumber(phoneNumber); 
        if (user) {
            userInfo.role = user.role;
            userInfo.id = user.id;
            userInfo.name = user.name;
            return userInfo;
        }
        let prospect = await ProspectModel.findByPhoneNumber(phoneNumber);
        if(!prospect) {
            prospect = await ProspectModel.create({ phone_number: phoneNumber, last_contact_date: new Date() });
        }
        userInfo.id = prospect.id;
        userInfo.name = prospect.contact_name || 'Prospect';
        return userInfo;
    } catch (error) {
        logToFile(`[ID] Erreur lors de la vérification DB de l'utilisateur: ${error.message}`);
        return userInfo; 
    }
};

/**
 * Fonction de traitement asynchrone pour éviter le timeout du Webhook.
 */
const processIncomingMessage = async (fromPhone, messageText, messageId, messageData) => {
    try {
        // A. Identification de l'Expéditeur
        const userInfo = await identifyUser(fromPhone);
        logToFile(`[ASYNCH] Utilisateur DB trouvé/créé: ${userInfo.role}. Lancement de SAM...`);

        // B. Enregistrement (Log le message de l'utilisateur)
        await WhatsAppService.logConversation(fromPhone, messageText, 'INCOMING', userInfo.role, null, userInfo.shopId);
        
        // C. Lancement de l'IA (Utilise le nouveau modèle stable)
        // On passe toutes les infos nécessaires à AIService si besoin.
        const aiResult = await AIService.processRequest(userInfo, messageText); 

        logToFile(`[ASYNCH] Réponse de SAM générée (Modèle: ${aiResult.model}). Envoi Wasender...`);

        // D. Envoi de la Réponse
        await WhatsAppService.sendText(fromPhone, aiResult.text, aiResult.model);
        logToFile(`[ASYNCH] Réponse envoyée avec succès. Traitement terminé.`);
        
    } catch (error) {
        // Assurez-vous que l'ID n'est pas réintroduit dans le cache en cas d'erreur critique non liée au webhook
        if (messageId) {
             PROCESSED_MESSAGE_IDS.delete(messageId); 
        }
        
        logToFile(`[ERREUR DE FLUX CRITIQUE] Le code a échoué dans le TRY/CATCH: ${error.message}`);
        try {
            // Tente d'envoyer UNE SEULE fois le message d'erreur.
            await WhatsAppService.sendText(fromPhone, "Désolé, SAM rencontre une erreur interne. L'administrateur est notifié.");
        } catch (sendError) {
            logToFile(`[ERREUR CRITIQUE] Impossible même d'envoyer le message d'erreur: ${sendError.message}`);
        }
    }
};


/**
 * Gère le Webhook Wasender (réception de messages et d'événements).
 */
const handleWebhook = async (req, res) => {
    
    logToFile("-----------------------------------------");
    logToFile(`[FLUX] Appel Webhook reçu.`);

    // 1. VÉRIFICATION DE SÉCURITÉ
    // Wasender utilise 'x-webhook-signature' (ou 'x-wasender-signature' selon la configuration)
    // Rétablissement de l'en-tête original et du mode de vérification simple.
    const signature = req.header('x-webhook-signature'); 
    const rawBody = req.rawBody; // Nécessaire si on avait fait du hachage, mais gardé pour le log.

    if (!verifyWasenderSignature(signature, WEBHOOK_SECRET)) {
        logToFile(`[ERREUR SÉCURITÉ] Signature Invalide. Blocage du message.`);
        return res.status(401).send('Unauthorized');
    }
    
    // 2. PARSING DE L'ÉVÉNEMENT
    let event;
    try {
        if (!rawBody || rawBody.length === 0) {
            logToFile("[FLUX] Corps de requête vide reçu (peut-être un test ping ?).");
            return res.status(200).send('Empty body received.');
        }
        // Utilisation du rawBody pour parser le JSON (le plus sûr pour le format Wasender)
        event = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
        logToFile(`[ERREUR PARSING] Impossible de parser le JSON du rawBody: ${e.message}`);
        return res.status(400).send('Bad Request: Invalid JSON');
    }

    logToFile(`[FLUX] Événement Wasender reçu et validé.`);

    // 3. FILTRE ET TRAITEMENT DES MESSAGES ENTRANTS
    
    const isMessageEvent = (event.event === 'messages.received' || event.event === 'messages.upsert');
    const isTestWebhook = (event.event === 'webhook.test'); 

    if (isTestWebhook) {
        logToFile("[FLUX] Événement de TEST reçu et validé avec succès !");
        return res.status(200).send('Webhook test validé avec succès.');
    }

    // On vérifie si c'est un événement de message
    if (isMessageEvent) {
        
        const messageData = event.data?.messages;
        if (!messageData) {
            logToFile("[FLUX] Événement ignoré (data.messages est manquant).");
            return res.status(200).send('Event ignored, no message data.');
        }
        
        // --- BLOC ANTI-DOUBLON (ID DE MESSAGE) ---
        const messageId = messageData.key?.id;
        if (messageId) {
            // Vérifie si l'ID est dans le Map
            if (PROCESSED_MESSAGE_IDS.has(messageId)) {
                logToFile(`[FLUX] Message ignoré (ID déjà traité - doublon Wasender): ${messageId}`);
                return res.status(200).send('Event ignored, duplicate message ID.');
            }
            // Ajoute l'ID au Map (stocke l'horodatage pour le nettoyage)
            PROCESSED_MESSAGE_IDS.set(messageId, Date.now());
        }
        // --- FIN DU BLOC ANTI-DOUBLON ---


        const fromMe = messageData.key?.fromMe === true;
        if (fromMe) {
            logToFile("[FLUX] Événement ignoré (message 'fromMe').");
            return res.status(200).send('Event ignored, message from me.');
        }

        // --- BLOC STRICTE : VÉRIFICATION DE L'HORODATAGE (Règle des 2 minutes) ---
        const messageTimestamp = messageData.messageTimestamp; 
        const MAX_AGE_SECONDS = 120; // 2 minutes

        if (messageTimestamp) {
            const currentTimestampInSeconds = Math.floor(Date.now() / 1000);
            const messageAgeInSeconds = currentTimestampInSeconds - Number(messageTimestamp);

            if (messageAgeInSeconds > MAX_AGE_SECONDS) {
                logToFile(`[FLUX] Message ignoré car trop ancien. Âge: ${messageAgeInSeconds}s (Max: ${MAX_AGE_SECONDS}s).`);
                return res.status(200).send('Event ignored, message too old.');
            }
            logToFile(`[FLUX] Horodatage validé. Âge: ${messageAgeInSeconds}s.`);
        } else {
            logToFile("[FLUX] AVERTISSEMENT: 'messageTimestamp' est manquant. Impossible de valider l'âge du message.");
        }
        // --- FIN DU BLOC STRICTE ---


        // Extraire le numéro de l'expéditeur
        let fromPhone = messageData.key?.cleanedParticipantPn || 
                          messageData.key?.cleanedSenderPn ||   
                          messageData.remoteJid;                
        
        if (!fromPhone) {
            logToFile("[FLUX] Événement ignoré (impossible de trouver le numéro de l'expéditeur).");
            return res.status(200).send('Event ignored, unknown sender.');
        }
        if (fromPhone.includes('@')) {
            fromPhone = fromPhone.split('@')[0];
        }

        // Extraire le contenu texte
        let messageText = null;
        if (messageData.message?.conversation) {
            messageText = messageData.message.conversation;
        } else if (messageData.message?.extendedTextMessage?.text) {
            messageText = messageData.message.extendedTextMessage.text;
        } else if (messageData.message?.imageMessage?.caption) {
            messageText = messageData.message.imageMessage.caption;
        }
        
        // Vérifier si on a du texte à traiter
        if (!messageText || messageText.trim() === "") {
            const messageType = Object.keys(messageData.message || {})[0] || 'inconnu';
            logToFile(`[FLUX] Événement ignoré (pas de contenu texte). Type de message reçu: ${messageType} (ex: reactionMessage, audioMessage, etc.)`);
            return res.status(200).send('Event ignored, no text content.');
        }
        
        // SI ON ARRIVE ICI, C'EST UN SUCCÈS !
        logToFile(`[FLUX] Message texte à traiter de ${fromPhone}: "${messageText}"`);

        // --- NOUVELLE LOGIQUE : RÉPONSE IMMÉDIATE et TRAITEMENT ASYNCHRONE ---
        res.status(200).send('Message received, processing in background.');
        
        // On lance le traitement réel en arrière-plan (sans await)
        processIncomingMessage(fromPhone, messageText, messageId, messageData).catch(error => {
            logToFile(`[ERREUR ASYNC CRITIQUE] Le traitement en arrière-plan a échoué: ${error.message}`);
        });
        // --- FIN DE LA NOUVELLE LOGIQUE ---

        return; // Termine la fonction du webhook rapidement
    }
    
    // Si ce n'était ni un test, ni un message
    logToFile(`[FLUX] Événement non pertinent ignoré (Event: ${event.event}). Renvoi de 200 OK.`);
    return res.status(200).send('Webhook event received, no action taken');
};


module.exports = {
    handleWebhook
};