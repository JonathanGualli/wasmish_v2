import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import {
    previewCampaign, previewCampaignRecipients, createCampaign, listCampaigns, getCampaign, getCampaignFailures,
    listCampaignRecipients,
    pauseCampaign, resumeCampaign, cancelCampaign,
} from "../controllers/campaign.controller.js";
import { campaignAudienceSchema, campaignDraftSchema, createCampaignSchema } from "../schemas/campaign.schema.js";
import { requirePermission } from "../middlewares/require.permission.middleware.js";

const router = Router();

router.post('/campaigns/preview', authRequired, requirePermission('campaigns.manage'), validateSchema(campaignDraftSchema), previewCampaign);
router.post('/campaigns/preview/recipients', authRequired, requirePermission('campaigns.manage'), validateSchema(campaignAudienceSchema), previewCampaignRecipients);
router.post('/campaigns', authRequired, requirePermission('campaigns.manage'), validateSchema(createCampaignSchema), createCampaign);
router.get('/campaigns', authRequired, requirePermission('campaigns.manage'), listCampaigns);
router.get('/campaigns/:id', authRequired, requirePermission('campaigns.manage'), getCampaign);
router.get('/campaigns/:id/failures', authRequired, requirePermission('campaigns.manage'), getCampaignFailures);
router.get('/campaigns/:id/recipients', authRequired, requirePermission('campaigns.manage'), listCampaignRecipients);
router.post('/campaigns/:id/pause', authRequired, requirePermission('campaigns.manage'), pauseCampaign);
router.post('/campaigns/:id/resume', authRequired, requirePermission('campaigns.manage'), resumeCampaign);
router.post('/campaigns/:id/cancel', authRequired, requirePermission('campaigns.manage'), cancelCampaign);

export default router;
