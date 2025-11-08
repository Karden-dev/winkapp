// src/services/whatsapp.service.js

// --- CORRECTION : Utilisation d'Axios au lieu du package 'wasenderapi' ---
const axios = require('axios');
// const { createWasender } = require('wasenderapi'); // Supprimé

// Variable locale pour stocker la connexion DB qui sera injectée
let db;

// --- INITIALISATION DE L'API WASENDER (URL et Clé) ---
const WASENDER_API_URL = "https://wasenderapi.com/api/send-message";
const WASENDER_API_KEY = process.env.WASENDER_API_KEY;

if (!WASENDER_API_KEY) {
    console.error("ERREUR FATALE: WASENDER_API_KEY n'est pas défini.");
}
// const wasender = createWasender(process.env.WASENDER_API_KEY); // Supprimé

/**
 * Nettoie et formate un numéro de téléphone pour l'API Wasender.
 * (Exemple : supprime '+', s'assure qu'il commence par le code pays comme 237...)
 * @param {string} phone - Le numéro de téléphone (ex: '+237690123456' ou '690123456')
 * @returns {string} - Le numéro formaté (ex: '237690123456')
 */
const formatPhoneNumber = (phone) => {
    // Supprime les espaces, '+', et autres caractères non numériques
    let cleaned = phone.replace(/\D/g, '');
    
    // (Logique spécifique à WINK EXPRESS - à adapter si nécessaire)
    // Si le numéro commence par '6' ou '2' et fait 9 chiffres (Cameroun), ajoutez le code pays
    if (cleaned.length === 9 && (cleaned.startsWith('6') || cleaned.startsWith('2'))) { 
        return '237' + cleaned;
    }
    // Si le numéro commence déjà par 237, c'est bon
    if (cleaned.length === 12 && cleaned.startsWith('237')) {
        return cleaned;
    }
    
    // Retourne le numéro nettoyé (cas par défaut)
    return cleaned;
};

/**
 * Loggue une conversation dans la base de données.
 */
const logConversation = async (phone_number, message_text, direction, sender_type = 'wink_agent_ai', ai_model = null, shop_id = null) => {
    if (!db) {
        console.error("Erreur: Le service WhatsApp n'est pas initialisé avec la DB.");
        return; 
    }
    try {
        const query = `
            INSERT INTO whatsapp_conversation_history 
            (recipient_phone, sender_type, message_direction, message_text, ai_model_used, shop_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await db.execute(query, [ 
            phone_number,
            sender_type,
            direction,
            message_text,
            ai_model,
            shop_id
        ]);
    } catch (error) {
        console.error("Erreur critique lors de l'enregistrement de l'historique de conversation:", error);
    }
};


/**
 * Envoie un message texte via Wasender en utilisant Axios (méthode curl).
 */
const sendText = async (recipient_phone, message_text, ai_model = 'gemini-2.5-flash') => {
    
    // --- CORRECTION 422 : Nettoyage du numéro de téléphone ---
    const formattedPhone = formatPhoneNumber(recipient_phone);
    
    const textPayload = {
        to: formattedPhone, // Utilisation du numéro nettoyé
        text: message_text,
    };
        
    const headers = {
        'Authorization': `Bearer ${WASENDER_API_KEY}`,
        'Content-Type': 'application/json'
    };

    try {
        console.log(`[WhatsAppService] Envoi (via Axios) à ${formattedPhone}...`);
        
        // --- CORRECTION : Remplacement de wasender.send par axios.post ---
        const result = await axios.post(WASENDER_API_URL, textPayload, { headers: headers }); 
        // --- FIN DE LA CORRECTION ---
        
        console.log(`[WhatsAppService] Envoi réussi à ${formattedPhone}. Status: ${result.status}`);
        
        await logConversation(recipient_phone, message_text, 'OUTGOING', 'wink_agent_ai', ai_model);

        return result.data;

    } catch (error) {
        // --- Capture de l'erreur d'envoi (Axios) ---
        if (error.response) {
            // L'API a répondu avec un code d'erreur (4xx, 5xx)
            console.error(`[ERREUR ENVOI] Échec d'envoi à ${formattedPhone} (Status: ${error.response.status}):`, error.response.data);
        } else if (error.request) {
            // La requête a été faite mais pas de réponse reçue
            console.error(`[ERREUR ENVOI] Pas de réponse de Wasender pour ${formattedPhone}:`, error.request);
        } else {
            // Erreur de configuration d'Axios
            console.error(`[ERREUR ENVOI] Erreur configuration Axios:`, error.message);
        }
        
        throw new Error(`Erreur d'envoi WhatsApp: ${error.message}`);
    }
};

/**
 * Initialise le service en injectant le pool de connexion DB.
 */
const init = (dbPool) => {
    console.log("[WhatsAppService] Initialisé avec la connexion DB.");
    db = dbPool; 
};

module.exports = {
    init, 
    sendText,
    logConversation,
};