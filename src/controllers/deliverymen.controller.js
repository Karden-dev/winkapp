// src/controllers/deliverymen.controller.js
const performanceModel = require('../models/performance.model');
const userModel = require('../models/user.model');
const scheduleModel = require('../models/schedule.model');
const moment = require('moment');

// --- Fonctions de Calcul de Rémunération (omises pour la concision) ---
const calculatePiedRemuneration = (stats) => {
    const ca = stats.ca_delivery_fees || 0;
    const expenses = stats.total_expenses || 0;
    const netBalance = ca - expenses;
    const expenseRatio = ca > 0 ? (expenses / ca) : 0;
    let rate = 0.45;
    let bonusApplied = false;
    if (ca > 0 && expenseRatio <= 0.35) {
        rate = 0.50;
        bonusApplied = true;
    }
    const finalPay = netBalance * rate;
    return { ca, expenses, netBalance, expenseRatio, rate, bonusApplied, totalPay: finalPay > 0 ? finalPay : 0 };
};

const calculateMotoRemuneration = (livreurDetails, stats, objectivesAdmin = null) => {
    const baseSalary = livreurDetails.base_salary || 0;
    const deliveredCount = stats.delivered || 0;
    let performanceBonus = 0;
    let bonusPerDelivery = 0;
    let percentageAchieved = 0;
    const target = objectivesAdmin?.target_deliveries_moto || 370;
    const bonusTiers = objectivesAdmin?.bonus_tiers_moto || [
        { min_percent: 65, bonus: 100 }, { min_percent: 75, bonus: 125 },
        { min_percent: 85, bonus: 150 }, { min_percent: 95, bonus: 175 }
    ];
    const eligibilityThreshold = target * (bonusTiers[0]?.min_percent / 100 || 0.65);

    if (target > 0 && deliveredCount >= eligibilityThreshold) {
        percentageAchieved = (deliveredCount / target) * 100;
        let applicableTier = null;
        for (let i = bonusTiers.length - 1; i >= 0; i--) {
            if (percentageAchieved >= bonusTiers[i].min_percent) {
                applicableTier = bonusTiers[i];
                break;
            }
        }
        if (applicableTier) {
            bonusPerDelivery = applicableTier.bonus;
            performanceBonus = deliveredCount * bonusPerDelivery;
        }
    }

    return {
        baseSalary: baseSalary,
        performanceBonus: performanceBonus,
        targetDeliveries: target,
        achievedDeliveries: deliveredCount,
        achievedPercentage: percentageAchieved / 100,
        bonusThreshold: eligibilityThreshold,
        bonusPerDelivery: bonusPerDelivery,
        totalPay: Number(baseSalary) + performanceBonus
    };
};


// --- Contrôleurs ---

const getDeliverymanPerformanceDetails = async (req, res) => {
    try {
        const { userId } = req.params;
        const period = req.query.period || 'current_month';

        let startDate, endDate;
        const today = moment();
        switch (period) {
            case 'last_month':
                const lastMonth = today.clone().subtract(1, 'month');
                startDate = lastMonth.startOf('month').format('YYYY-MM-DD');
                endDate = lastMonth.endOf('month').format('YYYY-MM-DD');
                break;
            case 'current_week':
                startDate = today.clone().startOf('isoWeek').format('YYYY-MM-DD');
                endDate = today.clone().endOf('isoWeek').format('YYYY-MM-DD');
                break;
             case 'today':
                 startDate = today.format('YYYY-MM-DD');
                 endDate = today.format('YYYY-MM-DD');
                 break;
            case 'current_month':
            default:
                startDate = today.clone().startOf('month').format('YYYY-MM-DD');
                endDate = today.clone().endOf('month').format('YYYY-MM-DD');
                break;
        }

        const rawData = await performanceModel.getPerformanceData(userId, startDate, endDate);
        const monthYearForObjective = moment(startDate).format('YYYY-MM');
        const objectivesAdminData = await scheduleModel.getOrInitializeObjective(monthYearForObjective);

        let remunerationDetails = {};
        if (rawData.details.vehicle_type === 'pied') {
            remunerationDetails = calculatePiedRemuneration(rawData.stats);
        } else if (rawData.details.vehicle_type === 'moto') {
            remunerationDetails = calculateMotoRemuneration(rawData.details, rawData.stats, objectivesAdminData);
        }

        const responseData = {
            queryPeriod: { code: period, startDate, endDate },
            riderType: rawData.details.vehicle_type,
            details: rawData.details,
            stats: rawData.stats,
            remuneration: remunerationDetails,
            objectivesAdmin: {
                 target: objectivesAdminData?.target_deliveries_moto ?? null,
                 achieved: remunerationDetails.achievedDeliveries,
                 percentage: remunerationDetails.achievedPercentage,
                 bonusPerDelivery: remunerationDetails.bonusPerDelivery,
                 bonusThreshold: remunerationDetails.bonusThreshold
            },
            chartData: rawData.chartData
        };

        res.json(responseData);

    } catch (error) {
        console.error(`Erreur getDeliverymanPerformanceDetails pour User ${req.params.userId}:`, error);
        res.status(500).json({ message: error.message || "Erreur serveur lors de la récupération des détails de performance." });
    }
};

const getDeliverymanSettings = async (req, res) => {
    try {
        const { userId } = req.params;

        // 1. Récupérer le statut utilisateur
        const user = await userModel.findById(userId);
        if (!user || user.role !== 'livreur') {
            return res.status(404).json({ message: "Livreur non trouvé." });
        }

        // 2. Récupérer les paramètres spécifiques (type, salaire, commission)
        const specificSettings = await performanceModel.findLivreurSettings(userId);

        // 3. Récupérer l'objectif admin pour le mois courant
        const currentMonth = moment().format('YYYY-MM');
        const objectiveAdmin = await scheduleModel.getOrInitializeObjective(currentMonth);

        const settings = {
            user_id: user.id,
            name: user.name,
            status: user.status,
            vehicle_type: specificSettings?.vehicle_type ?? null,
            base_salary: specificSettings?.base_salary ?? null,
            commission_rate: specificSettings?.commission_rate ?? null,
            monthly_objective: specificSettings?.monthly_objective ?? objectiveAdmin?.target_deliveries_moto ?? null
        };

        res.json(settings);

    } catch (error) {
        console.error(`Erreur getDeliverymanSettings pour User ${req.params.userId}:`, error);
        res.status(500).json({ message: error.message || "Erreur serveur lors de la récupération des paramètres." });
    }
};

const updateDeliverymanSettings = async (req, res) => {
    // CORRECTION MAJEURE: Obtention de la connexion transactionnelle à partir du Pool
    const dbPool = performanceModel.dbConnection; // Récupère l'objet Pool
    let connection;

    try {
        const { userId } = req.params;
        const { vehicle_type, base_salary, commission_rate, monthly_objective, status } = req.body;

        // Obtenir une connexion unique et commencer la transaction
        connection = await dbPool.getConnection(); // <-- OBTENTION DE LA CONNEXION UNIQUE
        await connection.beginTransaction(); // <-- DEBUT DE LA TRANSACTION (ROLLBACK possible)

        // --- Validation ---
        if (!vehicle_type || !['pied', 'moto'].includes(vehicle_type) || !status || !['actif', 'inactif'].includes(status)) {
            await connection.rollback();
            return res.status(400).json({ message: "Type de véhicule ou statut invalide." });
        }

        // 1. Mettre à jour la table 'livreurs'
        await performanceModel.upsertLivreurSettings(userId, { vehicle_type, base_salary, commission_rate, monthly_objective });

        // 2. Mettre à jour le statut dans la table 'users'
        await userModel.updateStatus(userId, status);

        // 3. Mettre à jour l'objectif admin (si fourni)
        if (monthly_objective !== undefined && vehicle_type === 'moto') {
             const currentMonth = moment().format('YYYY-MM');
             await scheduleModel.upsertObjective(currentMonth, monthly_objective, null);
        }

        // Valider toutes les opérations
        await connection.commit();
        res.json({ message: "Paramètres du livreur mis à jour avec succès." });

    } catch (error) {
        // Annuler les opérations en cas d'erreur
        if (connection) {
             await connection.rollback(); // <-- CORRECTION: utilise connection.rollback()
        }
        console.error(`Erreur updateDeliverymanSettings pour User ${req.params.userId}:`, error);
        res.status(500).json({ message: error.message || "Erreur serveur lors de la mise à jour des paramètres." });
    } finally {
        // Relâcher la connexion unique
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Route Placeholder pour la récupération du journal de performance (Journal Tab).
 * GET /api/deliverymen/:userId/performance-journal
 */
const getDeliverymanPerformanceJournal = async (req, res) => {
     try {
        const { userId } = req.params;
        const period = req.query.period || 'current_month';

        // NOTE: Le modèle devrait être adapté pour récupérer les données journalières agrégées (Recu, Livré, CA, Dépense, Résultat)
        // Pour l'instant, on renvoie une structure mock pour débloquer le frontend
        const mockJournal = [
            { date: moment().format('YYYY-MM-DD'), received: 15, delivered: 14, ca: 10500, expenses: 2000, net: 8500 },
            { date: moment().subtract(1, 'day').format('YYYY-MM-DD'), received: 18, delivered: 16, ca: 12000, expenses: 1500, net: 10500 },
            { date: moment().subtract(2, 'day').format('YYYY-MM-DD'), received: 12, delivered: 12, ca: 9000, expenses: 2500, net: 6500 },
        ];


        res.json(mockJournal);

     } catch (error) {
        console.error(`Erreur getDeliverymanPerformanceJournal:`, error);
        res.status(500).json({ message: "Erreur serveur lors de la récupération du journal." });
     }
};


module.exports = {
    getDeliverymanPerformanceDetails,
    getDeliverymanSettings,
    updateDeliverymanSettings,
    getDeliverymanPerformanceJournal
};