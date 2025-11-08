// src/models/shop.prospect.model.js

let db; // Variable locale pour stocker le pool de connexions injecté

const Prospect = {};

// Initialisation du modèle (appelée par app.js)
Prospect.init = (dbPool) => {
    if (!dbPool) {
        throw new Error("Pool de connexion DB non fourni au modèle Prospect.");
    }
    db = dbPool;
    console.log("[ShopProspectModel] Initialisé avec la connexion DB.");
};

/**
 * Retrouve un prospect par son numéro de téléphone.
 * (Utilisé par le whatsapp.controller.js pour l'identification)
 */
Prospect.findByPhoneNumber = async (phoneNumber) => {
    if (!db) throw new Error("ShopProspectModel non initialisé.");
    try {
        const [rows] = await db.execute(
            'SELECT * FROM shop_prospects WHERE phone_number = ?',
            [phoneNumber]
        );
        return rows[0]; // Retourne le prospect trouvé ou undefined
    } catch (error) {
        console.error("Erreur lors de la recherche du prospect par téléphone:", error);
        throw error;
    }
};

/**
 * Crée un nouveau prospect (ex: quand un numéro inconnu contacte l'IA).
 */
Prospect.create = async (prospectData) => {
    if (!db) throw new Error("ShopProspectModel non initialisé.");
    const { phone_number, contact_name = null, status = 'new', last_contact_date } = prospectData;
    try {
        const [result] = await db.execute(
            'INSERT INTO shop_prospects (phone_number, contact_name, status, last_contact_date) VALUES (?, ?, ?, ?)',
            [phone_number, contact_name, status, last_contact_date]
        );
        return result; // Retourne le résultat de l'insertion (ex: insertId)
    } catch (error) { // <-- CORRECTION DE LA SYNTAXE ICI
        console.error("Erreur lors de la création du prospect:", error);
        throw error;
    }
};

// ... (Ajouter d'autres fonctions ici si nécessaire : updateStatus, updateHistory, etc.)

module.exports = Prospect;