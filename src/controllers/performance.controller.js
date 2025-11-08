// src/controllers/performance.controller.js
const performanceModel = require('../models/performance.model');
const scheduleModel = require('../models/schedule.model'); // Import qui manquait précédemment
const moment = require('moment');

// --- Fonctions de Calcul de Rémunération ---

/**
 * Calcule la rémunération pour un livreur à pied.
 * @param {object} stats - L'objet stats retourné par performanceModel.getPerformanceData.
 * @returns {object} - Détails de la rémunération (CA, dépenses, taux, paie finale).
 */
const calculatePiedRemuneration = (stats) => {
    const ca = stats.ca_delivery_fees || 0;
    const expenses = stats.total_expenses || 0;
    const netBalance = ca - expenses;
    // Ratio des dépenses par rapport au CA
    const expenseRatio = ca > 0 ? (expenses / ca) : 0;

    let rate = 0.45; // Taux de base 45%
    let bonusApplied = false;
    // Appliquer le bonus si les dépenses sont inférieures ou égales à 35% du CA
    if (ca > 0 && expenseRatio <= 0.35) {
        rate = 0.50; // Taux majoré à 50%
        bonusApplied = true;
    }

    const finalPay = netBalance * rate;

    return {
        ca: ca,
        expenses: expenses,
        netBalance: netBalance,
        expenseRatio: expenseRatio, // Pour information
        rate: rate, // Taux effectivement appliqué
        bonusApplied: bonusApplied, // Indique si le bonus a été appliqué
        totalPay: finalPay > 0 ? finalPay : 0 // La rémunération ne peut être négative
    };
};

/**
 * Calcule la rémunération pour un livreur à moto.
 * @param {object} livreurDetails - Détails du livreur (contient base_salary).
 * @param {object} stats - Statistiques de performance (contient delivered).
 * @param {object|null} objectivesAdmin - Objectifs définis par l'admin (si implémenté).
 * @returns {object} - Détails de la rémunération (salaire base, prime, prime par course).
 */
const calculateMotoRemuneration = (livreurDetails, stats, objectivesAdmin = null) => {
    // CORRECTION: Assurer la conversion en nombre dès le début
    const baseSalary = Number(livreurDetails.base_salary || 0);
    const deliveredCount = stats.delivered || 0;
    let performanceBonus = 0;
    let bonusPerDelivery = 0;
    let percentageAchieved = 0; // Pourcentage de l'objectif atteint

    // Logique de prime basée sur les règles fournies
    const target = objectivesAdmin?.target_deliveries_moto || 370; // Objectif par défaut si non défini
    // Les paliers peuvent aussi venir de objectivesAdmin s'ils sont définis, sinon utiliser les valeurs par défaut
    const bonusTiers = objectivesAdmin?.bonus_tiers_moto || [
        { min_percent: 65, bonus: 100 }, { min_percent: 75, bonus: 125 },
        { min_percent: 85, bonus: 150 }, { min_percent: 95, bonus: 175 }
    ];
    // Le seuil d'éligibilité dépend du premier palier défini
    const eligibilityThresholdPercent = bonusTiers[0]?.min_percent || 65;
    const eligibilityThreshold = target * (eligibilityThresholdPercent / 100);

    if (target > 0 && deliveredCount >= eligibilityThreshold) {
        percentageAchieved = (deliveredCount / target) * 100; // Calcul du % atteint

        // Détermination de la prime par course selon les paliers (du plus haut au plus bas)
        let applicableTier = null;
        for (let i = bonusTiers.length - 1; i >= 0; i--) {
            if (percentageAchieved >= bonusTiers[i].min_percent) {
                applicableTier = bonusTiers[i];
                break; // On prend le palier le plus élevé atteint
            }
        }

        if (applicableTier) {
            bonusPerDelivery = applicableTier.bonus;
            performanceBonus = deliveredCount * bonusPerDelivery;
        }
    }

    return {
        baseSalary: baseSalary, // C'est maintenant un nombre
        performanceBonus: performanceBonus, // C'est un nombre
        // Informations supplémentaires pour l'affichage
        targetDeliveries: target, // L'objectif utilisé pour le calcul
        achievedDeliveries: deliveredCount, // Courses livrées comptant pour l'objectif (sur la période)
        achievedPercentage: percentageAchieved / 100, // Pourcentage atteint (0 à 1+)
        bonusThreshold: eligibilityThreshold, // Seuil pour obtenir une prime
        bonusPerDelivery: bonusPerDelivery, // La prime par course appliquée
        totalPay: baseSalary + performanceBonus // CORRECTION: C'est maintenant une addition de nombres
    };
};


// --- Contrôleurs ---

/**
 * Contrôleur principal pour récupérer les données de performance d'un livreur.
 * Gère la requête GET /api/performance.
 */
const getRiderPerformance = async (req, res) => {
    try {
        const livreurUserId = req.user.id; // Récupéré depuis le token JWT vérifié par le middleware
        const period = req.query.period || 'current_month'; // Période demandée (ex: 'current_month', 'last_month', 'today'...)

        // --- 1. Déterminer les dates de début et de fin ---
        let startDate, endDate;
        const today = moment(); // Utilise Moment.js pour manipuler les dates

        switch (period) {
            case 'last_month':
                const lastMonth = today.clone().subtract(1, 'month');
                startDate = lastMonth.startOf('month').format('YYYY-MM-DD');
                endDate = lastMonth.endOf('month').format('YYYY-MM-DD');
                break;
            case 'current_week':
                startDate = today.clone().startOf('isoWeek').format('YYYY-MM-DD'); // Commence le Lundi
                endDate = today.clone().endOf('day').format('YYYY-MM-DD');   // Termine aujourd'hui
                break;
            case 'last_week': // Semaine ISO précédente
                 startDate = today.clone().subtract(1, 'week').startOf('isoWeek').format('YYYY-MM-DD');
                 endDate = today.clone().subtract(1, 'week').endOf('isoWeek').format('YYYY-MM-DD');
                 break;
            case 'today':
                 startDate = today.format('YYYY-MM-DD');
                 endDate = today.format('YYYY-MM-DD');
                 break;
             case 'yesterday':
                 startDate = today.clone().subtract(1, 'day').format('YYYY-MM-DD');
                 endDate = today.clone().subtract(1, 'day').format('YYYY-MM-DD');
                 break;
            case 'current_month':
            default: // Mois courant par défaut
                startDate = today.clone().startOf('month').format('YYYY-MM-DD');
                endDate = today.clone().endOf('day').format('YYYY-MM-DD'); // Termine aujourd'hui
                break;
        }

        // --- 2. Récupérer les données brutes depuis le modèle ---
        const rawData = await performanceModel.getPerformanceData(livreurUserId, startDate, endDate); //

        // --- 3. Calculer la rémunération spécifique ---
        let remunerationDetails = {};
        if (rawData.details.vehicle_type === 'pied') {
            remunerationDetails = calculatePiedRemuneration(rawData.stats); 
             // Rémunération totale pour livreur à pied
            // (totalPay est déjà dans l'objet retourné par calculatePiedRemuneration)
        } else if (rawData.details.vehicle_type === 'moto') {
             const monthForObjective = moment(startDate).format('YYYY-MM'); // Utilise la date de début de la période
             const objectivesAdminData = await scheduleModel.getOrInitializeObjective(monthForObjective);
            
            remunerationDetails = calculateMotoRemuneration(rawData.details, rawData.stats, objectivesAdminData); 
            // (totalPay est déjà dans l'objet retourné par calculateMotoRemuneration)
        }

        // --- 4. Préparer la réponse JSON structurée pour le frontend ---
        const responseData = {
            queryPeriod: { // Rappel de la période demandée
                code: period,
                startDate: startDate,
                endDate: endDate
            },
            riderType: rawData.details.vehicle_type, // Type de livreur ('pied' ou 'moto')
            details: { // Infos de base
                name: rawData.details.name,
                status: rawData.details.status
            },
            stats: rawData.stats, // Contient delivered, received, deliveredCurrentWeek, etc.
            remuneration: remunerationDetails, // Objet contenant les détails du calcul de paie (AVEC totalPay correct)
            objectivesAdmin: { // Détails sur l'objectif admin (pour motards)
                 target: remunerationDetails.targetDeliveries, // Objectif (peut être ajusté)
                 achieved: remunerationDetails.achievedDeliveries, // Courses livrées comptant pour l'objectif
                 percentage: remunerationDetails.achievedPercentage, // Pourcentage atteint
                 bonusPerDelivery: remunerationDetails.bonusPerDelivery, // Prime par course appliquée
                 bonusThreshold: remunerationDetails.bonusThreshold // Seuil pour obtenir la prime
            },
            personalGoals: rawData.personalGoals, // Objectifs personnels { daily, weekly, monthly }
            chartData: rawData.chartData // Données formatées { labels: [...], data: [...] } pour le graphique
        };

        res.json(responseData); // Envoyer la réponse au frontend

    } catch (error) {
        console.error("Erreur dans getRiderPerformance Controller:", error);
        // Envoyer une réponse d'erreur générique ou spécifique
        res.status(500).json({ message: error.message || "Erreur serveur lors de la récupération des performances." });
    }
};

/**
 * Contrôleur pour mettre à jour les objectifs personnels d'un livreur.
 * Gère la requête PUT /api/performance/personal-goals.
 */
const updatePersonalGoals = async (req, res) => {
     try {
        const livreurUserId = req.user.id; // ID du livreur connecté
        // Récupère les objectifs depuis le corps de la requête JSON
        const { daily, weekly, monthly } = req.body;

        // Validation simple: Vérifier si au moins un objectif est fourni (on pourrait être plus strict)
        if (daily === undefined && weekly === undefined && monthly === undefined) {
             return res.status(400).json({ message: "Au moins un objectif (daily, weekly, ou monthly) doit être fourni." });
        }

        // Préparer l'objet goals à envoyer au modèle (assure conversion en nombre ou null)
        const goals = {
             daily: (daily !== null && !isNaN(parseInt(daily)) && daily >= 0) ? parseInt(daily) : null,
             weekly: (weekly !== null && !isNaN(parseInt(weekly)) && weekly >= 0) ? parseInt(weekly) : null,
             monthly: (monthly !== null && !isNaN(parseInt(monthly)) && monthly >= 0) ? parseInt(monthly) : null
        };

        // Appeler la fonction du modèle pour mettre à jour la BDD
        const result = await performanceModel.updatePersonalGoals(livreurUserId, goals); //

        if (result.success) {
            // Succès : La mise à jour a affecté au moins une ligne
            res.json({ message: "Objectifs personnels mis à jour avec succès." });
        } else {
            // Échec : L'user_id n'a pas été trouvé dans la table 'livreurs' ou autre erreur
            res.status(404).json({ message: result.message || "Livreur non trouvé ou aucune modification nécessaire." });
        }
     } catch (error) {
         console.error("Erreur dans updatePersonalGoals Controller:", error);
         res.status(500).json({ message: error.message || "Erreur serveur lors de la mise à jour des objectifs." });
     }
};


module.exports = {
    getRiderPerformance,
    updatePersonalGoals
};