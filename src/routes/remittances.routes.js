const express = require('express');
const router = express.Router();
const remittancesController = require('../controllers/remittances.controller');

router.get('/', remittancesController.getRemittances);
router.get('/details/:shopId', remittancesController.getRemittanceDetails);
router.post('/record', remittancesController.recordRemittance);
router.put('/shop-details/:shopId', remittancesController.updateShopPaymentDetails);
router.get('/export-pdf', remittancesController.exportPdf);

module.exports = router;