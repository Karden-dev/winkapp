// src/services/websocket.service.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const userModel = require('../models/user.model'); // Pour vérifier l'utilisateur

// Stockage en mémoire des connexions actives
// Clé: userId, Valeur: Set de connexions WebSocket pour cet utilisateur
const clients = new Map();
// Clé: orderId, Valeur: Set de userIds écoutant cette conversation
const conversations = new Map();

let wss; // Référence au serveur WebSocket

/**
 * Initialise le serveur WebSocket et le lie au serveur HTTP existant.
 * @param {http.Server} server - Le serveur HTTP créé par Express.
 */
const initWebSocketServer = (server) => {
    wss = new WebSocket.Server({ server }); // Attache WSS au serveur HTTP
    console.log('🔌 Serveur WebSocket initialisé et attaché au serveur HTTP.');

    wss.on('connection', async (ws, req) => {
        console.log('🔌 Nouvelle connexion WebSocket entrante...');

        // 1. Extraire le token de l'URL (ex: ws://localhost:3000?token=...)
        const parameters = url.parse(req.url, true).query;
        const token = parameters.token;

        if (!token) {
            console.warn('🔌 Connexion WebSocket refusée : Token manquant.');
            ws.close(1008, 'Token manquant'); // 1008 = Policy Violation
            return;
        }

        let decodedToken;
        try {
            // 2. Vérifier le token JWT
            decodedToken = jwt.verify(token, process.env.JWT_SECRET);
            ws.userId = decodedToken.id; // Attache l'ID utilisateur à la connexion WebSocket
            ws.userRole = decodedToken.role; // Attache le rôle utilisateur
            console.log(`🔌 Connexion WebSocket authentifiée pour l'utilisateur ID: ${ws.userId}, Rôle: ${ws.userRole}`);

            // 3. Stocker la connexion
            if (!clients.has(ws.userId)) {
                clients.set(ws.userId, new Set());
            }
            clients.get(ws.userId).add(ws);

            ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', message: 'Connecté au serveur WebSocket.' }));

        } catch (error) {
            console.error('🔌 Connexion WebSocket refusée : Token invalide.', error.message);
            ws.close(1008, 'Token invalide');
            return;
        }

        // 4. Gérer les messages reçus du client
        ws.on('message', (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                console.log(`🔌 Message reçu de l'utilisateur ${ws.userId}:`, parsedMessage);

                // Gérer différents types de messages (ex: rejoindre/quitter une conversation)
                switch (parsedMessage.type) {
                    case 'JOIN_CONVERSATION':
                        handleJoinConversation(ws, parsedMessage.payload.orderId);
                        break;
                    case 'LEAVE_CONVERSATION':
                        handleLeaveConversation(ws, parsedMessage.payload.orderId);
                        break;
                    // Ajouter d'autres types de messages si nécessaire (ex: typing indicator)
                    default:
                        console.warn(`🔌 Type de message inconnu reçu: ${parsedMessage.type}`);
                }
            } catch (error) {
                console.error(`🔌 Erreur traitement message WebSocket de ${ws.userId}:`, error);
                // Envoyer une erreur au client si possible
                if (ws.readyState === WebSocket.OPEN) {
                     ws.send(JSON.stringify({ type: 'ERROR', message: 'Format de message invalide ou erreur serveur.' }));
                }
            }
        });

        // 5. Gérer la déconnexion
        ws.on('close', (code, reason) => {
            console.log(`🔌 Connexion WebSocket fermée pour l'utilisateur ${ws.userId}. Code: ${code}, Raison: ${reason ? reason.toString() : 'N/A'}`);
            if (clients.has(ws.userId)) {
                clients.get(ws.userId).delete(ws);
                if (clients.get(ws.userId).size === 0) {
                    clients.delete(ws.userId);
                }
            }
            // Retirer l'utilisateur de toutes les conversations qu'il écoutait
            conversations.forEach((userIds, orderId) => {
                if (userIds.has(ws.userId)) {
                    userIds.delete(ws.userId);
                    // Optionnel : Nettoyer la conversation si plus personne n'écoute
                    // if (userIds.size === 0) {
                    //     conversations.delete(orderId);
                    // }
                }
            });
            console.log(`Utilisateur ${ws.userId} retiré des conversations.`);
        });

        ws.on('error', (error) => {
            console.error(`🔌 Erreur WebSocket pour l'utilisateur ${ws.userId}:`, error);
            // La connexion se fermera automatiquement après une erreur, l'événement 'close' sera déclenché.
        });
    });

    console.log('🔌 Serveur WebSocket prêt à accepter les connexions.');
};

/**
 * Associe une connexion WebSocket à une conversation spécifique (orderId).
 * @param {WebSocket} ws - La connexion WebSocket.
 * @param {number} orderId - L'ID de la commande/conversation.
 */
const handleJoinConversation = (ws, orderId) => {
    if (!orderId || isNaN(orderId)) {
        console.warn(`🔌 Tentative de rejoindre une conversation invalide par ${ws.userId}. OrderId: ${orderId}`);
        return;
    }
    orderId = Number(orderId); // Assurer que c'est un nombre

    if (!conversations.has(orderId)) {
        conversations.set(orderId, new Set());
    }
    conversations.get(orderId).add(ws.userId);
    ws.currentOrderId = orderId; // Stocker l'orderId actuel sur la connexion ws
    console.log(`🔌 Utilisateur ${ws.userId} a rejoint la conversation pour la commande ${orderId}`);
    // Optionnel: Confirmer au client qu'il a rejoint
    // ws.send(JSON.stringify({ type: 'JOINED_CONVERSATION', payload: { orderId } }));
};

/**
 * Dissocie une connexion WebSocket d'une conversation spécifique (orderId).
 * @param {WebSocket} ws - La connexion WebSocket.
 * @param {number} orderId - L'ID de la commande/conversation.
 */
const handleLeaveConversation = (ws, orderId) => {
     if (!orderId || isNaN(orderId)) return;
     orderId = Number(orderId);

     if (conversations.has(orderId)) {
        conversations.get(orderId).delete(ws.userId);
        console.log(`🔌 Utilisateur ${ws.userId} a quitté la conversation pour la commande ${orderId}`);
        // Optionnel : Nettoyer la conversation si plus personne n'écoute
        // if (conversations.get(orderId).size === 0) {
        //     conversations.delete(orderId);
        // }
     }
     if (ws.currentOrderId === orderId) {
         ws.currentOrderId = null; // Nettoyer l'orderId actuel sur ws
     }
};

/**
 * Envoie un message à tous les participants d'une conversation.
 * @param {number} orderId - L'ID de la commande/conversation.
 * @param {object} messageData - L'objet message complet (avec user_name, etc.).
 * @param {number} senderUserId - L'ID de l'expéditeur (pour ne pas lui renvoyer son propre message si non souhaité).
 */
const broadcastMessage = (orderId, messageData, senderUserId) => {
    if (!conversations.has(orderId)) {
        console.log(`📣 Pas d'auditeurs actifs pour la commande ${orderId}, message non diffusé en temps réel.`);
        return;
    }

    const listeners = conversations.get(orderId);
    if (!listeners || listeners.size === 0) return;

    const messageString = JSON.stringify({
        type: 'NEW_MESSAGE',
        payload: messageData
    });

    console.log(`📣 Diffusion du message pour la commande ${orderId} à ${listeners.size} auditeur(s).`);

    listeners.forEach(userId => {
        // Optionnel: ne pas envoyer à l'expéditeur
        // if (userId === senderUserId) return;

        if (clients.has(userId)) {
            clients.get(userId).forEach(clientWs => {
                // Vérifier si la connexion est ouverte avant d'envoyer
                if (clientWs.readyState === WebSocket.OPEN) {
                    // Vérifier si l'utilisateur écoute bien cette conversation (double check)
                    if (clientWs.currentOrderId === orderId || clientWs.userRole === 'admin') { // Admin reçoit toujours ? Ou seulement s'il a l'onglet ouvert ? À affiner.
                       console.log(`   -> Envoi à l'utilisateur ${userId}`);
                       clientWs.send(messageString);
                    } else {
                        console.log(`   -> Utilisateur ${userId} connecté mais n'écoute pas la CDE ${orderId}, message non envoyé.`);
                    }
                } else {
                    console.warn(`   -> Connexion non ouverte pour l'utilisateur ${userId}, message non envoyé.`);
                }
            });
        }
    });
};

/**
 * Envoie une notification de mise à jour (ex: compteur non lu, changement statut) à un utilisateur spécifique.
 * @param {number} userId - L'ID de l'utilisateur destinataire.
 * @param {string} type - Le type de notification (ex: 'UNREAD_COUNT_UPDATE', 'CONVERSATION_LIST_UPDATE').
 * @param {object} payload - Les données de la notification.
 */
const sendNotification = (userId, type, payload) => {
    if (!clients.has(userId)) return; // Utilisateur non connecté via WebSocket

    const messageString = JSON.stringify({ type, payload });
    let sent = false;

    clients.get(userId).forEach(clientWs => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(messageString);
            sent = true;
        }
    });
    if (sent) console.log(`📣 Notification [${type}] envoyée à l'utilisateur ${userId}`);
};

module.exports = {
    initWebSocketServer,
    broadcastMessage,
    sendNotification
};