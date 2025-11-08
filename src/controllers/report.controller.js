// src/controllers/report.controller.js
const reportModel = require('../models/report.model');
const debtService = require('../services/debt.service');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// FONCTION DE FORMATAGE ROBUSTE:
// Assure la conversion en nombre avant d'appliquer le formatage, évitant les problèmes de locale.
const formatAmount = (amount) => {
    // S'assurer que c'est un nombre et arrondir pour éviter les décimales étranges
    const numericAmount = Math.round(parseFloat(amount || 0));
    // toLocaleString() ajoute le séparateur de milliers (espace ou non)
    return numericAmount.toLocaleString('fr-FR').replace(/,/g, ' '); // Remplacer les virgules par des espaces pour le cas où toLocaleString utilise la virgule comme séparateur de milliers.
};

// --- Fonctions d'Orchestration des Rapports (Règles de métier) ---

const getReports = async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ message: 'La date est requise.' });
        }
        const reports = await reportModel.findReportsByDate(date);
        res.status(200).json(reports);
    } catch (error) {
        console.error("Erreur (GET /reports):", error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
};

const getDetailedReport = async (req, res) => {
    try {
        const { date, shopId } = req.query;
        if (!date || !shopId) {
            return res.status(400).json({ message: 'La date et l\'ID du marchand sont requis.' });
        }
        const report = await reportModel.findDetailedReport(date, shopId);
        if (!report) {
            return res.status(404).json({ message: 'Rapport détaillé non trouvé.' });
        }
        res.status(200).json(report);
    } catch (error) {
        console.error("Erreur (GET /reports/detailed):", error);
        res.status(500).json({ message: 'Erreur lors de la récupération du rapport détaillé.' });
    }
};

const processStorage = async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) {
            return res.status(400).json({ message: 'La date est requise pour traiter les frais de stockage.' });
        }
        const result = await debtService.processStorageFees(date);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors du traitement des frais de stockage.' });
    }
};

const recalculateReport = async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) {
            return res.status(400).json({ message: 'La date est requise pour le recalcul.' });
        }
        await reportModel.findReportsByDate(date);
        res.status(200).json({ message: `Le rapport pour le ${date} a été recalculé (rafraîchi).` });
    } catch (error) {
        res.status(500).json({ message: 'Erreur lors du forçage du recalcul du rapport.' });
    }
};

// --- Fonction d'Exportation PDF (avec Arrière-plan Paysage) ---

const exportPdf = async (req, res) => {
    const { date } = req.query;
    if (!date) {
        return res.status(400).json({ message: 'La date est requise pour l\'exportation PDF.' });
    }

    try {
        const reports = await reportModel.findReportsByDate(date);

        if (reports.length === 0) {
            return res.status(404).json({ message: 'Aucun rapport trouvé pour cette date.' });
        }
        
        // 1. Calcul des agrégats
        let totalEncaissements = 0, totalDeliveryFees = 0, totalExpeditionFees = 0;
        let totalRemit = 0, totalDebt = 0, totalPackaging = 0, totalStorage = 0, totalOrdersSent = 0, totalOrdersDelivered = 0;
        
        reports.forEach(report => {
            totalOrdersSent += report.total_orders_sent;
            totalOrdersDelivered += report.total_orders_delivered;
            totalEncaissements += parseFloat(report.total_revenue_articles || 0); 
            totalDeliveryFees += parseFloat(report.total_delivery_fees || 0);
            totalExpeditionFees += parseFloat(report.total_expedition_fees || 0);
            totalPackaging += parseFloat(report.total_packaging_fees || 0);
            totalStorage += parseFloat(report.total_storage_fees || 0);
            
            const amountToRemit = parseFloat(report.amount_to_remit || 0);
            if (amountToRemit > 0) {
                totalRemit += amountToRemit;
            } else if (amountToRemit < 0) {
                totalDebt += Math.abs(amountToRemit);
            }
        });
        
        // Chiffre d'Affaires (CA) de WINK = Frais Livraison + Frais Emballage + Frais Stockage
        const totalCA = totalDeliveryFees + totalPackaging + totalStorage; 
        
        // 2. Initialisation du document PDF avec marges spécifiques
        const marginLeftRight = 14.17; 
        const marginTop = 93.38;       
        const marginBottom = 60.99;    

        const doc = new PDFDocument({ 
            layout: 'landscape', 
            size: 'A4',
            margins: {
                top: marginTop,
                bottom: marginBottom,
                left: marginLeftRight, 
                right: marginLeftRight
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Rapport_Journalier_${date}.pdf"`);
        doc.pipe(res);
        
        // --- Variables de Style et Arrière-plan ---
        
        const tableHeaderHeight = 20; 
        const lineHeight = 15;        
        const headerImagePath = path.join(__dirname, '..', '..', 'public', 'paysage.png');
        const imageWidth = doc.page.width;
        const imageHeight = doc.page.height;

        // Fonction pour dessiner l'arrière-plan/En-tête sur chaque page
        const drawPageBackground = (doc) => {
            if (fs.existsSync(headerImagePath)) {
                // Insère l'image en arrière-plan, pleine page, sans marge
                doc.image(headerImagePath, 0, 0, { 
                     width: imageWidth,
                     height: imageHeight,
                     align: 'center',
                     valign: 'center'
                });
            }
            // Réinitialise la position Y au début du contenu après l'arrière-plan
            doc.y = marginTop;
        };
        
        // Applique l'arrière-plan sur la première page et les pages suivantes
        drawPageBackground(doc);
        doc.on('pageAdded', () => drawPageBackground(doc));
        
        // --- 1. TITRE PRINCIPAL ---
        
        doc.moveDown(1); 
        doc.fillColor('#2C3E50');
        doc.fontSize(14).font('Helvetica-Bold').text(`RAPPORT JOURNALIER : ${moment(date).format('DD/MM/YYYY')}`, { 
            align: 'center',
            underline: true 
        });
        doc.moveDown(1);
        
        let currentY = doc.y;

        // --- 2. TABLEAU: SOMMAIRE GLOBAL (Amélioré en mode tableau) ---
        
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#4A6491').text('2. SOMMAIRE GLOBAL', { underline: true });
        doc.moveDown(0.5);
        currentY = doc.y;

        const summaryData = [
            { label: 'Nombre de courses envoyées', value: totalOrdersSent, color: '#2C3E50' },
            { label: 'Frais de livraison (Totaux)', value: formatAmount(totalDeliveryFees) + ' FCFA', color: '#FF7F50' },
            { label: 'Nombre de courses livrées', value: totalOrdersDelivered, color: '#198754' },
            { label: 'Frais d\'emballages (Totaux)', value: formatAmount(totalPackaging) + ' FCFA', color: '#FF7F50' },
            { label: 'Montant encaissé (Articles + Ratés)', value: formatAmount(totalEncaissements) + ' FCFA', color: '#6c757d' },
            { label: 'Frais de stockage (Totaux)', value: formatAmount(totalStorage) + ' FCFA', color: '#FF7F50' },
            { label: 'Frais d\'expédition (Totaux)', value: formatAmount(totalExpeditionFees) + ' FCFA', color: '#FF7F50' },
            { label: 'Total Créances (Marchands)', value: formatAmount(totalDebt) + ' FCFA', color: '#dc3545' },
            { label: 'CH. D\'AFFAIRES WINK (Frais Liv.+Emb.+Stock)', value: formatAmount(totalCA) + ' FCFA', color: '#4A6491', isMain: true },
            { label: 'MONTANT NET À VERSER (TOTAL)', value: formatAmount(totalRemit) + ' FCFA', color: '#FF7F50', isMain: true },
        ];
        
        // Configuration du tableau de Sommaire
        const summaryColWidth = (imageWidth - (2 * marginLeftRight) - 30) / 2; // Largeur pour deux colonnes avec un écart
        const summaryTableX1 = doc.page.margins.left;
        const summaryTableX2 = doc.page.margins.left + summaryColWidth + 30; 
        const summaryInnerWidth = summaryColWidth;
        const summaryLabelWidth = summaryInnerWidth * 0.7; // 70% pour le label
        const summaryValueWidth = summaryInnerWidth * 0.3; // 30% pour la valeur
        
        let summaryY = currentY;

        // Fonction pour dessiner l'en-tête du tableau de sommaire (en deux blocs)
        const drawSummaryHeader = (y, startX, colWidth) => {
             doc.fontSize(9).font('Helvetica-Bold');
             doc.fillColor('#FFFFFF').rect(startX, y, colWidth, tableHeaderHeight).fill('#4A6491'); // En-tête bleu pour le Sommaire
             doc.fillColor('#FFFFFF').text('Description', startX + 5, y + 5, { width: summaryLabelWidth, align: 'left' });
             doc.fillColor('#FFFFFF').text('Montant', startX + summaryLabelWidth + 5, y + 5, { width: summaryValueWidth - 10, align: 'right' });
             return y + tableHeaderHeight;
        };

        // Dessine les deux blocs d'en-tête
        let col1Y = drawSummaryHeader(currentY, summaryTableX1, summaryInnerWidth);
        let col2Y = drawSummaryHeader(currentY, summaryTableX2, summaryInnerWidth);
        
        const half = Math.ceil(summaryData.length / 2);
        
        // Dessine les lignes du sommaire
        summaryData.forEach((item, index) => {
            let rowY, startX, colY;

            if (index < half) {
                // Colonne 1
                rowY = col1Y;
                startX = summaryTableX1;
                col1Y += lineHeight;
                colY = col1Y;
            } else {
                // Colonne 2
                rowY = col2Y;
                startX = summaryTableX2;
                col2Y += lineHeight;
                colY = col2Y;
            }
            
            // Fond des lignes alternées
            if (index % 2 !== 0) {
                 doc.fillColor('#f8f9fa').rect(startX, rowY, summaryInnerWidth, lineHeight).fill();
            }

            // Draw Label
            doc.font(item.isMain ? 'Helvetica-Bold' : 'Helvetica').fillColor(item.color).text(item.label, startX + 5, rowY + 3, { width: summaryLabelWidth, align: 'left' });
            
            // Draw Value
            doc.font(item.isMain ? 'Helvetica-Bold' : 'Helvetica').fillColor(item.color).text(item.value, startX + summaryLabelWidth + 5, rowY + 3, { width: summaryValueWidth - 10, align: 'right' });
        });
        
        // Reset Y cursor pour le prochain élément après les deux colonnes
        doc.y = Math.max(col1Y, col2Y) + 20; 
        
        
        // --- 3. TABLEAU: DÉTAIL PAR MARCHAND (Optimisé) ---
        
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#4A6491').text('3. DÉTAIL DES BILANS MARCHANDS', { underline: true });
        doc.moveDown(0.5);

        // Largeur totale disponible (ajustée aux marges)
        const adjustedWidth = imageWidth - (2 * marginLeftRight); 

        const tableHeaderDataDetail = [
            { label: '#', property: 'rank', width: adjustedWidth * 0.03, align: 'center' }, 
            { label: 'Marchand', property: 'shop_name', width: adjustedWidth * 0.15, align: 'left' }, 
            { label: 'Sent', property: 'total_orders_sent', width: adjustedWidth * 0.06, align: 'center' }, 
            { label: 'Livrée', property: 'total_orders_delivered', width: adjustedWidth * 0.06, align: 'center' }, 
            { label: 'Encaissement', property: 'total_revenue_articles', width: adjustedWidth * 0.12, align: 'right' }, 
            { label: 'Frais Liv.', property: 'total_delivery_fees', width: adjustedWidth * 0.1, align: 'right' }, 
            { label: 'Frais Exp.', property: 'total_expedition_fees', width: adjustedWidth * 0.1, align: 'right' }, 
            { label: 'Frais Emb.', property: 'total_packaging_fees', width: adjustedWidth * 0.1, align: 'right' }, 
            { label: 'Frais Stock.', property: 'total_storage_fees', width: adjustedWidth * 0.1, align: 'right' }, 
            { label: 'Montant à verser', property: 'amount_to_remit', width: adjustedWidth * 0.18, align: 'right' } 
        ];
        
        const tableDetail = {
            headers: tableHeaderDataDetail,
            rows: reports.map((report, index) => {
                const row = {
                    rank: index + 1,
                    shop_name: report.shop_name,
                    total_orders_sent: report.total_orders_sent || 0,
                    total_orders_delivered: report.total_orders_delivered || 0,
                    total_revenue_articles: formatAmount(report.total_revenue_articles),
                    total_delivery_fees: formatAmount(report.total_delivery_fees),
                    total_expedition_fees: formatAmount(report.total_expedition_fees),
                    total_packaging_fees: formatAmount(report.total_packaging_fees),
                    total_storage_fees: formatAmount(report.total_storage_fees),
                    amount_to_remit: formatAmount(report.amount_to_remit)
                };
                if (parseFloat(report.amount_to_remit) < 0) {
                    row._style = { amount_to_remit: { color: '#dc3545', bold: true } };
                } else if (parseFloat(report.amount_to_remit) > 0) {
                    row._style = { amount_to_remit: { color: '#198754', bold: true } };
                }
                return row;
            })
        };

        currentY = doc.y;

        // Fonction pour dessiner l'en-tête du tableau de détail
        const drawTableHeaderDetail = (y) => {
            doc.fontSize(8).font('Helvetica-Bold');
            doc.fillColor('#FFFFFF').rect(doc.page.margins.left, y, adjustedWidth, tableHeaderHeight).fill('#2C3E50');
            
            let currentX = doc.page.margins.left;
            tableDetail.headers.forEach(header => {
                doc.fillColor('#FFFFFF').text(header.label, currentX, y + 5, { width: header.width, align: header.align || 'left' });
                currentX += header.width;
            });
            return y + tableHeaderHeight;
        };

        currentY = drawTableHeaderDetail(currentY);
        
        // Dessin des lignes du tableau
        doc.font('Helvetica');
        tableDetail.rows.forEach((row, rowIndex) => {
            // Gestion du saut de page
            if (currentY + lineHeight > doc.page.height - doc.page.margins.bottom) {
                doc.addPage({ layout: 'landscape', size: 'A4', margins: { top: marginTop, bottom: marginBottom, left: marginLeftRight, right: marginLeftRight } });
                currentY = marginTop;
                drawPageBackground(doc);
                // Re-dessine le titre et l'en-tête du tableau
                doc.y = marginTop;
                doc.moveDown(1);
                doc.fillColor('#2C3E50').fontSize(14).font('Helvetica-Bold').text(`RAPPORT JOURNALIER : ${moment(date).format('DD/MM/YYYY')} (Suite)`, { 
                    align: 'center',
                    underline: true 
                });
                doc.moveDown(0.5);
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#4A6491').text('3. DÉTAIL DES BILANS MARCHANDS (Suite)', { underline: false });
                doc.moveDown(0.5);
                currentY = doc.y;
                currentY = drawTableHeaderDetail(currentY);
            }

            let currentX = doc.page.margins.left;
            
            // Fond des lignes alternées
            if (rowIndex % 2 !== 0) {
                doc.fillColor('#f8f9fa').rect(doc.page.margins.left, currentY, adjustedWidth, lineHeight).fill();
            }

            // Contenu des cellules
            tableDetail.headers.forEach(header => {
                const value = row[header.property];
                const style = row._style ? row._style[header.property] : null;

                doc.fillColor(style && style.color ? style.color : '#34495E');
                doc.font(style && style.bold ? 'Helvetica-Bold' : 'Helvetica');

                doc.text(value, currentX, currentY + 2, {
                    width: header.width, 
                    align: header.align || 'left',
                    lineBreak: false
                });
                currentX += header.width;
            });

            currentY += lineHeight;
        });


        doc.end();

    } catch (error) {
        console.error("Erreur lors de l'exportation PDF:", error);
        res.status(500).json({ message: 'Erreur serveur lors de la génération du PDF.' });
    }
};

module.exports = {
    getReports,
    getDetailedReport,
    processStorage,
    recalculateReport,
    exportPdf
};