// src/scripts/dailyDebtProcessor.js
const axios = require('axios');
const moment = require('moment');

const API_BASE_URL = 'http://app.winkexpress.online';

const runDailyConsolidation = async () => {
    try {
        const manualDate = process.argv[2];
        let dateToConsolidate;

        if (manualDate) {
            if (!moment(manualDate, 'YYYY-MM-DD', true).isValid()) {
                console.error('[ERREUR] Le format de la date est invalide. Veuillez utiliser AAAA-MM-JJ.');
                process.exit(1);
            }
            dateToConsolidate = manualDate;
            console.log(`[JOB MANUEL] Démarrage de la consolidation pour la date spécifiée : ${dateToConsolidate}...`);
        } else {
            dateToConsolidate = moment().subtract(1, 'day').format('YYYY-MM-DD');
            console.log(`[JOB AUTOMATIQUE] Démarrage de la consolidation des soldes pour le ${dateToConsolidate}...`);
        }

        const response = await axios.post(`${API_BASE_URL}/reports/consolidate-balances`, {
            date: dateToConsolidate
        });

        console.log(`[SUCCÈS] ${response.data.message}`);
        process.exit(0);
    } catch (error) {
        let errorMessage = 'Une erreur inconnue est survenue.';
        if (error.response) {
            errorMessage = `Erreur de l'API (${error.response.status}): ${JSON.stringify(error.response.data)}`;
        } else if (error.request) {
            errorMessage = `Aucune réponse du serveur. Vérifiez que le serveur principal est bien lancé sur ${API_BASE_URL}.`;
        } else {
            errorMessage = error.message;
        }
        console.error('[ERREUR] Échec de la consolidation quotidienne:', errorMessage);
        process.exit(1);
    }
};

runDailyConsolidation();