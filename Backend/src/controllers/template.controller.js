import fs from "node:fs";
import mongoose from "mongoose";
import Template from "../models/template.model.js";
import { decrypt } from "../utils/crypto.js";
import { getTemplates, sendTemplateMessage } from "../libs/whatsapp.js";
import { getSendingRecipient } from "./contact.controller.js";
import { MARKETING_OPT_OUT_ERROR } from "../utils/marketing.preference.js";
import TemplateMedia from "../models/template.media.model.js";
import { buildHeaderComponent, extractTemplateHeader, headerMediaFileIssue, headerMediaRule, templateHeaderIssue } from "../utils/template.header.js";
import {
    cleanFilename, ensureMetaMediaId, headerMediaFileExists, saveHeaderMedia, serializeHeaderMedia,
} from "../services/template.media.service.js";
import { MEDIA_DIR } from "../config.js";
import { mimeParaServir, rutaDeArchivo } from "../utils/media.storage.js";
import { findAccountWabas, findSendingLine, templateScopeFor } from "../services/line.service.js";
import { recordOutboundMessage } from "../services/outbound.message.service.js";
import Line from "../models/line.model.js";
import Waba from "../models/waba.model.js";
import { LINE_NOT_FOUND_MESSAGE } from "../utils/whatsapp.line.js";
import { resolveApiLine } from "../utils/line.js";
import { inLineScope, lineScope } from "../utils/permissions.js";
import { metaSendOutcome } from "../utils/outbound.send.js";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Trae las plantillas de un WABA y las upsertea en la BD, en su cuenta.
// La usan el sync manual (endpoint) y el sync just-in-time del envío.
// Devuelve cuántas plantillas se procesaron. Recibe un SendingLine
// (`findSendingLine`): de él salen la cuenta, el WABA y su token.
export const syncTemplatesForWaba = async ({ accountId, waBusinessId, tokenWhatsapp }) => {
    // Se comprueba ANTES de descifrar: decrypt(null) revienta y daba un 500.
    if (!tokenWhatsapp || !waBusinessId) {
        const error = new Error("Token or Business ID is required");
        error.statusCode = 400;
        throw error;
    }

    const token = decrypt(tokenWhatsapp);

    const dataMeta = await getTemplates({ token, waBusinessId });
    const templates = dataMeta?.data?.data;

    if (!templates) {
        const error = new Error("Templates could not be obtained");
        error.statusCode = 400;
        throw error;
    }

    const bulkOperations = templates.map(tpl => {
        // El BODY es lo que se renderiza en el chat; de la cabecera se guarda
        // el formato, para saber si al enviar hay que mandar un archivo.
        const bodyComponent = tpl.components?.find(c => c.type === 'BODY');
        const buttonsComponent = tpl.components?.find(c => c.type === 'BUTTONS');

        const text = bodyComponent ? bodyComponent.text : '';

        return {
            updateOne: {
                filter: { templateId: tpl.id },
                update: {
                    $set: {
                        userId: accountId,
                        // El WABA de la plantilla: desde la Fase 2b se busca por él.
                        waBusinessId,
                        name: tpl.name,
                        category: tpl.category,
                        status: tpl.status,
                        language: tpl.language,
                        bodyText: text,
                        buttons: buttonsComponent?.buttons ?? [],
                        parameterFormat: tpl.parameter_format,
                        header: extractTemplateHeader(tpl.components),
                    }
                },
                upsert: true,
            }
        };
    });

    if (bulkOperations.length > 0) await Template.bulkWrite(bulkOperations);

    return bulkOperations.length;
}

// Reconstruye el body de la plantilla con los parámetros sustituidos, para guardar
// el mensaje tal y como lo recibe el contacto. Soporta posicionales ({{1}}) y
// nombrados ({{first_name}}). Un placeholder sin parámetro se deja intacto: así
// se ve que faltó un dato en vez de quedar un hueco silencioso.
export const renderTemplateBody = (bodyText, parameters) => {
    if (!bodyText) return null;
    if (!parameters || parameters.length === 0) return bodyText;

    const isNamed = typeof parameters[0] === 'object' && parameters[0] !== null;

    if (isNamed) {
        const byName = new Map(parameters.map(p => [String(p.name), String(p.value)]));
        return bodyText.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
            (match, key) => byName.has(key) ? byName.get(key) : match);
    }

    return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index) => {
        const value = parameters[Number(index) - 1];
        return value === undefined ? match : String(value);
    });
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

// Meta pide un formato de parámetro distinto según el tipo de botón.
// Quien llama a la API manda valores simples; aquí los envolvemos.
const BUTTON_PARAM_BUILDERS = {
    url:         (value) => ({ type: 'text',        text: String(value) }),
    quick_reply: (value) => ({ type: 'payload',     payload: String(value) }),
    copy_code:   (value) => ({ type: 'coupon_code', coupon_code: String(value) }),
};

// Qué sub_type le corresponde a cada tipo de botón de la definición de la
// plantilla. Es la fuente de verdad: el mismo botón «Copiar código» es OTP en
// una plantilla de autenticación y COPY_CODE en una de cupón, y Meta espera un
// formato distinto en cada caso — por fuera se ven idénticos.
const SUBTYPE_BY_BUTTON_TYPE = {
    OTP:         'url',
    URL:         'url',
    COPY_CODE:   'copy_code',
    QUICK_REPLY: 'quick_reply',
};

// Con la definición sincronizada deducimos el sub_type; si la plantilla nunca se
// sincronizó, caemos al subType que mande el cliente (comportamiento anterior).
const resolveSubType = (definition, button, index) => {
    if (!definition) return String(button.subType ?? '').toLowerCase();

    // URL fija = sin variable = no admite parámetros. Meta responde 132018;
    // atajarlo aquí ahorra la llamada y da un mensaje que se entiende.
    if (definition.type === 'URL' && !definition.url?.includes('{{')) {
        const error = new Error(
            `El botón "${definition.text}" (índice ${index}) tiene una URL fija y no admite parámetros.`
        );
        error.statusCode = 400;
        throw error;
    }

    return SUBTYPE_BY_BUTTON_TYPE[definition.type];
};

// Traduce los botones del body de la request a componentes de Meta.
// El index es posicional si no lo mandan, y va como string porque así lo pide Meta.
export const buildButtonComponents = (buttons = [], templateButtons = []) => {
    return buttons.map((button, position) => {
        const index = button.index ?? position;
        const values = button.parameters ?? [];

        if (values.length === 0) {
            const error = new Error(`El botón en el índice ${index} no tiene parámetros`);
            error.statusCode = 400;
            throw error;
        }

        // Si conocemos la plantilla, un índice fuera de rango es un error del
        // cliente: Meta lo ignora en silencio y el mensaje sale sin el dato.
        if (templateButtons.length > 0 && !templateButtons[index]) {
            const error = new Error(
                `La plantilla no tiene un botón en el índice ${index} (tiene ${templateButtons.length}).`
            );
            error.statusCode = 400;
            throw error;
        }

        const subType = resolveSubType(templateButtons[index], button, index);
        const buildParam = BUTTON_PARAM_BUILDERS[subType];

        if (!buildParam) {
            const error = new Error(
                `No se pudo determinar el tipo del botón en el índice ${index}. ` +
                `Sincroniza la plantilla o envía "subType" (${Object.keys(BUTTON_PARAM_BUILDERS).join(', ')}).`
            );
            error.statusCode = 400;
            throw error;
        }

        return {
            type: 'button',
            sub_type: subType,
            index: String(index),
            parameters: values.map(buildParam),
        };
    });
};


// ---------------------------------------------------------------------------
// Modo de prueba de las campañas (CAMPAIGN_DRY_RUN)
// ---------------------------------------------------------------------------

/**
 * Lo que respondería Meta, sin llamarla: en local, probar una campaña de
 * verdad mandaría WhatsApps reales a los contactos de la BD. Imita el único
 * rechazo que se puede prever, el de un contacto dado de baja que recibe
 * marketing (131050), para que ese camino también se pueda ver.
 */
export const fakeTemplateSend = ({ contact, template }) => {
    if (template?.category === 'MARKETING' && contact?.marketingOptOut) {
        const error = new Error('Simulado: el contacto pidió no recibir marketing');
        error.waErrorCode = MARKETING_OPT_OUT_ERROR;
        error.waErrorDetail = 'Simulado (CAMPAIGN_DRY_RUN): this recipient has chosen to stop receiving marketing messages.';
        throw error;
    }
    return { data: { messages: [{ id: `wamid.dryrun.${Date.now()}.${Math.random().toString(36).slice(2)}` }] } };
};

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

export const syncTemplatesController = async (req, res) => {
    try {
        // Las de cada WABA con alguna línea activa (Fase 2c) a su alcance (Fase 3).
        const wabas = await findAccountWabas(req.auth.accountId, { lineIds: lineScope(req.auth) });
        if (wabas.length === 0) return res.status(400).json([{ message: "Token or Business ID is required" }]);

        let total = 0;
        for (const waba of wabas) total += await syncTemplatesForWaba(waba);

        return res.status(200).json({
            success: true,
            message: 'Templates successfully synchronized',
            totalSincronizadas: total,
        });
    } catch (error) {
        // Sin este log, un 500 aquí es opaco: el motivo real (token de WhatsApp
        // caducado, WABA sin permisos) solo lo sabe Meta.
        console.error('Sync de plantillas falló:', error.message);

        // Que Meta rechace la llamada no es un fallo del servidor.
        const status = error.statusCode || (error.waErrorCode ? 502 : 500);
        return res.status(status).json([{
            message: error.message,
            errorCode: error.waErrorCode ?? null,
        }]);
    }
}

/** La plantilla para el frontend: el archivo de la cabecera, resumido. */
const serializeTemplate = (template) => ({
    ...template,
    headerMedia: serializeHeaderMedia(template.headerMedia),
});

// Las de la cuenta en estos WABA. Sin ninguno (sin WhatsApp conectado), todas
// las de la cuenta, como antes.
const findUserTemplates = (userId, wabas) =>
    Template.find({ userId, ...(wabas && { waBusinessId: { $in: wabas.map(waba => waba.waBusinessId) } }) })
        .populate('headerMedia', 'mimeType filename size').lean();

// Los WABA cuyas plantillas se listan: el de la línea `lineId` (404 si no es de
// la cuenta o no está a su alcance, Fase 3), o los de todas las líneas activas
// a su alcance (Fase 2c). null = ninguno.
const templateWabasFor = async (auth, lineId) => {
    const { accountId } = auth;
    if (lineId === undefined) {
        const scope = lineScope(auth);
        const wabas = await findAccountWabas(accountId, { lineIds: scope });
        if (wabas.length > 0) return wabas;
        // Sin ninguno: quien ve todas, todas las de la cuenta (como antes);
        // quien tiene líneas, ninguna (revisión de Codex del PR #34).
        return scope === null ? null : [];
    }
    const line = mongoose.isValidObjectId(lineId) && inLineScope(auth, lineId)
        ? await Line.findOne({ _id: lineId, accountId }).lean() : null;
    if (!line) {
        const error = new Error(LINE_NOT_FOUND_MESSAGE);
        error.statusCode = 404;
        throw error;
    }
    // Una línea sin WABA (la de un número anterior a las líneas) no tiene plantillas.
    const waba = line.wabaId ? await Waba.findOne({ _id: line.wabaId, accountId }).lean() : null;
    return waba ? [{ accountId, waBusinessId: waba.waBusinessId, tokenWhatsapp: waba.tokenWhatsapp }] : [];
};

// GET /templates[?lineId=] — las del WABA de esa línea o, sin ella, las de
// todos los WABA con línea activa. Cada una lleva su `waBusinessId`: la UI
// filtra por el de la línea elegida.
export const getTemplatesController = async (req, res) => {
    try {
        const userId = req.auth.accountId;
        const wabas = await templateWabasFor(req.auth, req.query.lineId);

        let templates = await findUserTemplates(userId, wabas);

        // Sincronizadas antes de guardar la cabecera o el WABA: se vuelven a
        // sincronizar una vez, para saber cuáles piden un archivo y de qué WABA
        // son. Si Meta falla, se devuelven como están: la lista no puede
        // depender de Meta.
        const syncable = (wabas ?? []).filter(waba => waba.tokenWhatsapp && waba.waBusinessId);
        const outdated = templates.some(t => t.header === undefined)
            || Boolean(syncable.length > 0 && await Template.exists({ userId, waBusinessId: null }));
        if (outdated && syncable.length > 0) {
            try {
                for (const waba of syncable) await syncTemplatesForWaba(waba);
                templates = await findUserTemplates(userId, wabas);
            } catch (syncError) {
                console.error('Sync de plantillas (cabeceras) falló:', syncError.message);
            }
        }

        return res.json(templates.map(serializeTemplate));
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json([{ message: error.message }]);
    }
}

/**
 * Valida y guarda el archivo de cabecera que llega en el cuerpo: el archivo tal
 * cual (Content-Type = su tipo) y el nombre original en `X-Filename`. Solo se
 * guarda: se sube a Meta al enviar la primera vez, así que funciona aunque el
 * token de WhatsApp esté caducado. `{ issue }` si no vale para la plantilla.
 */
const saveUploadedHeaderMedia = async (req, template) => {
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    const mimeType = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const issue = headerMediaFileIssue(template, { mimeType, size: buffer?.length ?? 0, buffer });
    if (issue) return { issue };

    const media = await saveHeaderMedia({
        userId: req.auth.accountId, buffer, mimeType, filename: cleanFilename(req.headers['x-filename']),
    });
    return { media };
};

/** PUT /templates/:templateId/header-media — el archivo de la cabecera de la plantilla. */
export const uploadHeaderMediaController = async (req, res) => {
    try {
        const template = await Template.findOne({ userId: req.auth.accountId, templateId: req.params.templateId, ...await templateScopeFor(req.auth) });
        if (!template) return res.status(404).json([{ message: 'La plantilla no existe en tu cuenta.' }]);

        const { issue, media } = await saveUploadedHeaderMedia(req, template);
        if (issue) return res.status(400).json([{ message: issue }]);

        template.headerMedia = media._id;
        await template.save();

        return res.json(serializeTemplate({ ...template.toObject(), headerMedia: media }));
    } catch (error) {
        console.error('Subida del archivo de cabecera falló:', error.message);
        return res.status(500).json([{ message: error.message }]);
    }
};

/**
 * POST /templates/:templateId/header-media/files — un archivo para la cabecera
 * de UN envío (una campaña), sin tocar el de la plantilla. Se valida contra
 * su formato igual que el de la plantilla y devuelve el archivo guardado: quien
 * envía lo pasa después como `headerMediaId`.
 */
export const uploadHeaderMediaFileController = async (req, res) => {
    try {
        const template = await Template.findOne({ userId: req.auth.accountId, templateId: req.params.templateId, ...await templateScopeFor(req.auth) }).lean();
        if (!template) return res.status(404).json([{ message: 'La plantilla no existe en tu cuenta.' }]);

        const { issue, media } = await saveUploadedHeaderMedia(req, template);
        if (issue) return res.status(400).json([{ message: issue }]);
        return res.status(201).json(serializeHeaderMedia(media));
    } catch (error) {
        console.error('Subida del archivo de cabecera falló:', error.message);
        return res.status(500).json([{ message: error.message }]);
    }
};

/**
 * DELETE /templates/:templateId/header-media — la plantilla se queda sin
 * archivo (y sin poder enviarse). El archivo no se borra: una campaña
 * creado antes puede estar usándolo.
 */
export const removeHeaderMediaController = async (req, res) => {
    try {
        const template = await Template.findOneAndUpdate(
            { userId: req.auth.accountId, templateId: req.params.templateId, ...await templateScopeFor(req.auth) },
            { $set: { headerMedia: null } },
            { new: true },
        ).lean();
        if (!template) return res.status(404).json([{ message: 'La plantilla no existe en tu cuenta.' }]);
        return res.json(serializeTemplate(template));
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};

/**
 * GET /templates/media/:id — el archivo de una cabecera, para verlo en
 * Plantillas y en las vistas previas. Uno ajeno da 404, como en /media.
 */
export const getHeaderMediaFileController = async (req, res) => {
    try {
        const media = mongoose.isValidObjectId(req.params.id)
            ? await TemplateMedia.findOne({ _id: req.params.id, userId: req.auth.accountId }).lean()
            : null;
        const ruta = media && rutaDeArchivo(MEDIA_DIR, media.file);
        if (!ruta || !fs.existsSync(ruta)) return res.status(404).json([{ message: 'Media not found' }]);

        res.setHeader('Content-Type', mimeParaServir(media.mimeType));
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('Content-Disposition', 'inline');
        return fs.createReadStream(ruta).pipe(res);
    } catch (error) {
        return res.status(500).json([{ message: error.message }]);
    }
};


/**
 * Envía una plantilla y persiste conversación + mensaje + SSE.
 * No sabe nada de HTTP: los errores de negocio salen como Error con
 * `statusCode`, y quien la llama decide cómo responder.
 *
 * El destinatario es `conversation` (se le escribe a su contacto), `contact`
 * (campaña: se usa o se crea su conversación) o, para iniciar una
 * conversación, `destinationNumber`. `contactName` y `source` solo se usan si
 * ese número todavía no es un contacto.
 *
 * Solo para campañas: `template` llega ya resuelta (la copia guardada en
 * la campaña; así no se busca ni se sincroniza en cada destinatario),
 * `campaignId` queda en el Message, y `dryRun` no llama a Meta (ver
 * `fakeTemplateSend`).
 *
 * `line` es la línea por la que sale (`findSendingLine` o `findConversationLine`,
 * Fase 2b de multi-línea): su número, su WABA (donde se busca la plantilla), el
 * token y la cuenta dueña de lo que se guarda. Ya comprobada: está conectada.
 */
export const processTemplateSending = async ({
    line,
    conversation = null,
    contact = null,
    destinationNumber,
    templateName,
    language,
    parameters = [],
    buttons = [],
    contactName,
    source = null,
    // Quién lo envía (`{ userId, name }`, desde el chat) y de dónde sale:
    // 'chat', 'campaign' o 'api' (Fase 3). Una campaña se reconoce por `campaignId`.
    sender = null,
    origin = null,
    template: resolvedTemplate = null,
    campaignId = null,
    dryRun = false,
}) => {
    const token = decrypt(line.tokenWhatsapp);
    const { accountId, phoneNumberId, waBusinessId } = line;
    const recipient = contact
        ? { phone: contact.phone, waUserId: contact.waUserId }
        : await getSendingRecipient(conversation, destinationNumber);

    // 1. Plantilla: la buscamos ANTES de enviar, para validar que existe
    //    y para saber en qué idioma está registrada.
    //    En el WABA de la línea: una sin WABA (sincronizada antes de la Fase
    //    2a) no se encuentra, y la sincronización de abajo se lo pone.
    const findTemplate = () => Template.findOne({ userId: accountId, waBusinessId, name: templateName });
    let template = resolvedTemplate ?? await findTemplate();
    let syncOk = true;

    // Re-sincronizamos también si el documento es anterior a que guardáramos
    // la definición de los botones o la cabecera: `parameterFormat` y `header`
    // solo existen desde entonces, así que su ausencia distingue «plantilla
    // vieja» de «plantilla sincronizada que legítimamente no tiene botones».
    if (!resolvedTemplate && (!template || template.parameterFormat === undefined || template.header === undefined)) {
        try {
            await syncTemplatesForWaba(line);
            template = await findTemplate();
        } catch (syncError) {
            // Si el sync falló no podemos afirmar que la plantilla no exista:
            // dejamos que Meta decida, en vez de bloquear un envío válido.
            syncOk = false;
            console.error("Sync JIT de plantillas falló:", syncError.message);
        }
    }

    if (!template && syncOk) {
        const error = new Error(`La plantilla "${templateName}" no existe en tu cuenta de WhatsApp o todavía no está aprobada.`);
        error.statusCode = 404;
        throw error;
    }

    // Meta no acepta el BSUID en las plantillas de autenticación (las de un
    // toque, sin toque y copiar código): solo el teléfono. Mejor decirlo aquí
    // que gastar la llamada y recibir un rechazo.
    if (template?.category === 'AUTHENTICATION' && !recipient.phone) {
        const error = new Error("Este contacto escribió con su nombre de usuario y WhatsApp no comparte su número: no se le pueden enviar plantillas de autenticación.");
        error.statusCode = 400;
        throw error;
    }

    // La cabecera: un archivo que falta o un formato que no sabemos enviar se
    // rechaza aquí. Meta respondería 132012 a cada destinatario.
    const headerIssue = templateHeaderIssue(template);
    if (headerIssue) {
        const error = new Error(headerIssue);
        error.statusCode = 400;
        error.pausesCampaign = true;
        throw error;
    }
    const headerMedia = headerMediaRule(template)
        ? await TemplateMedia.findOne({ _id: template.headerMedia, userId: accountId })
        : null;
    if (headerMediaRule(template) && !(headerMedia && await headerMediaFileExists(headerMedia))) {
        const error = new Error('El archivo de la cabecera de la plantilla ya no está en el servidor. Vuelve a subirlo en Plantillas.');
        error.statusCode = 400;
        error.pausesCampaign = true;
        throw error;
    }

    // 2. Idioma: el que tenga registrada la plantilla, salvo que lo fuercen.
    const templateLanguage = language ?? template?.language ?? 'es';

    // 3. Componentes: cabecera (más abajo, al enviar) + cuerpo + botones.
    //    Parámetros del cuerpo: posicionales ["Juan"] o nombrados [{name, value}]
    const components = [];
    let storedParamsString = "";

    if (parameters.length > 0) {
        const isNamed = typeof parameters[0] === 'object' && parameters[0] !== null;
        const bodyParams = isNamed
            ? parameters.map(p => ({ type: "text", parameter_name: p.name, text: String(p.value) }))
            : parameters.map(p => ({ type: "text", text: String(p) }));
        storedParamsString = isNamed
            ? parameters.map(p => `${p.name}: ${p.value}`).join(', ')
            : parameters.join(', ');
        components.push({ type: "body", parameters: bodyParams });
    }

    // Lanza 400 si el botón es inválido — antes de gastar la llamada a Meta.
    components.push(...buildButtonComponents(buttons, template?.buttons ?? []));

    // 4. Enviar a Meta (un rechazo no lanza: se guarda como 'failed')
    const outcome = await metaSendOutcome(async () => {
        // El archivo de la cabecera se sube a Meta la primera vez (y cuando su
        // id caduca); dentro del envío, para que un token caducado quede como
        // cualquier rechazo. En modo de prueba no se sube nada.
        if (headerMedia && !dryRun) {
            const mediaId = await ensureMetaMediaId(headerMedia, { token, phoneNumberId });
            components.unshift(buildHeaderComponent(template.header.format, { mediaId, filename: headerMedia.filename }));
        }
        return dryRun
            ? fakeTemplateSend({ contact, template })
            : sendTemplateMessage({ token, phoneNumberId, recipient, templateName, language: templateLanguage, components });
    });

    // 5. Texto real que recibe el contacto
    const storedText = renderTemplateBody(template?.bodyText, parameters)
        || `Plantilla: ${templateName}${storedParamsString ? ` | Datos: [${storedParamsString}]` : ''}`;

    // 6. Guardar conversación + mensaje y avisar por SSE. `campaignId` en el
    //    evento deja al frontend agrupar los cientos de una campaña.
    const { msg, conversation: targetConversation } = await recordOutboundMessage({
        line, conversation, contact, recipient, contactName, source,
        text: storedText,
        outcome,
        fields: {
            sentBy: sender?.userId ?? null,
            sentByName: sender?.name ?? null,
            origin: origin ?? (campaignId ? 'campaign' : null),
            templateName,
            templateParams: parameters.length > 0 ? parameters : undefined,
            campaignId: campaignId ?? undefined,
            // El archivo de la cabecera, para que el chat lo enseñe como lo vio
            // el contacto. Es el mismo archivo de la plantilla, no una copia.
            ...(headerMedia && {
                type: template.header.format.toLowerCase(),
                mediaFile: headerMedia.file,
                mimeType: headerMedia.mimeType,
                mediaFilename: headerMedia.filename,
                mediaSize: headerMedia.size,
            }),
        },
        eventExtra: campaignId ? { campaignId: String(campaignId) } : {},
    });

    return { msg, conversation: targetConversation, ...outcome };

};

export const sendTemplateController = async (req, res) => {
    try {
        const { destinationNumber, templateName, contactName } = req.body;

        // La línea de la cuenta de la API key (validateApiKey): la que pide con
        // `lineId` o `from`, o la por defecto. Sin ellos, todo como siempre.
        let lineId = null;
        if (req.body.lineId || req.body.from) {
            const lines = await Line.find({ accountId: req.auth.accountId }).select('_id displayPhoneNumber').lean();
            const chosen = resolveApiLine(lines, { lineId: req.body.lineId, from: req.body.from });
            if (chosen.statusCode) return res.status(chosen.statusCode).json([{ message: chosen.message }]);
            lineId = chosen.lineId;
        }
        const line = await findSendingLine(req.auth.accountId, { lineId });

        const { waMessageId, conversation, status, errorCode, errorDetail } =
            await processTemplateSending({
                line,
                destinationNumber,
                templateName,
                language: req.body.language,
                // El schema acepta null en estos campos (mandar null no debe
                // romper), pero de aquí en adelante trabajamos sobre arrays.
                parameters: req.body.parameters ?? [],
                buttons: req.body.buttons ?? [],
                contactName,
                source: 'api',
                origin: 'api',
            });

        if (status === 'failed') {
            return res.status(502).json([{ message: "Error enviando plantilla a WhatsApp", errorCode, errorDetail }]);
        }
        return res.status(200).json({ success: true, waMessageId, conversationId: String(conversation._id) });

    } catch (error) {
        const status = error.statusCode || (error.waErrorCode ? 502 : 500);

        // Los 4xx son errores de quien llama y ya viajan con su mensaje; en una
        // API pública loguearlos todos sería ruido. Solo dejamos rastro de lo
        // que es fallo nuestro o de Meta.
        if (status >= 500) console.error('Envío de plantilla falló:', error.message);

        return res.status(status).json([{
            message: error.message,
            errorCode: error.waErrorCode ?? null,
        }]);
    }
};
