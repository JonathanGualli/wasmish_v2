import { Router } from "express";
import { authRequired } from "../middlewares/validate.token.middleware.js";
import { validateSchema } from "../middlewares/validator.middleware.js";
import {
    previewCampaign, previewCampaignRecipients, createCampaign, listCampaigns, getCampaign, getCampaignFailures,
    listCampaignRecipients,
    pauseCampaign, resumeCampaign, cancelCampaign,
} from "../controllers/campaign.controller.js";
import { campaignAudienceSchema, campaignDraftSchema, createCampaignSchema } from "../schemas/campaign.schema.js";

const router = Router();

router.post('/campaigns/preview', authRequired, validateSchema(campaignDraftSchema), previewCampaign);
router.post('/campaigns/preview/recipients', authRequired, validateSchema(campaignAudienceSchema), previewCampaignRecipients);
router.post('/campaigns', authRequired, validateSchema(createCampaignSchema), createCampaign);
router.get('/campaigns', authRequired, listCampaigns);
router.get('/campaigns/:id', authRequired, getCampaign);
router.get('/campaigns/:id/failures', authRequired, getCampaignFailures);
router.get('/campaigns/:id/recipients', authRequired, listCampaignRecipients);
router.post('/campaigns/:id/pause', authRequired, pauseCampaign);
router.post('/campaigns/:id/resume', authRequired, resumeCampaign);
router.post('/campaigns/:id/cancel', authRequired, cancelCampaign);

export default router;
