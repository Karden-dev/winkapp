// src/services/remittances.service.js
const remittanceModel = require('../models/remittance.model');

let dbConnection;

const init = (connection) => {
    dbConnection = connection;
    remittanceModel.init(connection);
};

const payRemittance = async (remittanceId, userId) => {
    // La logique transactionnelle est maintenant dans le modèle pour la cohérence
    return await remittanceModel.updateRemittanceStatus(remittanceId, 'paid', userId);
};

module.exports = {
    init,
    payRemittance
};