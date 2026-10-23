// Las cuentas de demostración de `seed:demo`: una por nicho de la venta en frío
// (imprentas y capacitación). Todo es inventado: negocios, personas y
// teléfonos (59300077xxxx, que no existen). Cada conversación enseña algo de
// Wasmish en una demo: quien vuelve por una cotización y lo atiende otra
// persona, las notas firmadas, el PDF en el historial, lo respondido desde la
// app del celular, las respuestas automáticas y una campaña con estadísticas.
//
// Las horas: '45m', '2h', '12d' (hace tanto; las de hoy, de 2 h o menos, para
// que no caigan de madrugada si se rehace temprano) o '2d 21:34' (hace 2 días, a esa
// hora de Ecuador). Quién escribe: 'them' (el contacto), 'owner' y 'agent'
// (desde el chat de Wasmish, con su nombre), 'app' (desde la app de WhatsApp
// Business del celular) y 'bot' (las respuestas automáticas).

const imprenta = {
    key: 'imprenta',
    accountName: 'Gráfica Andina',
    owner: { name: 'Patricia Vera', email: 'demo.imprenta@wasmish.com' },
    agent: { name: 'Diego Andrade', email: 'asesor.imprenta@wasmish.com' },
    line: { phoneNumberId: '990000000000901', waBusinessId: '990000000000900', display: '+593 99 000 0901', verifiedName: 'Gráfica Andina', name: 'Ventas' },
    templates: [
        { key: 'calendarios', name: 'promo_calendarios', category: 'MARKETING',
            bodyText: 'Hola {{1}}, ya puede pedir sus calendarios 2027 con su logo: desde USD 2,50 la unidad hasta el 30 de noviembre. ¿Le enviamos una cotización?' },
        { key: 'pedidoListo', name: 'pedido_listo', category: 'UTILITY',
            bodyText: 'Hola {{1}}, su pedido {{2}} está listo. Puede retirarlo en nuestro local de lunes a viernes de 8:30 a 18:00.' },
        { key: 'seguimiento', name: 'seguimiento_cotizacion', category: 'MARKETING',
            bodyText: 'Hola {{1}}, le escribimos por la cotización {{2}} que le enviamos. ¿Tiene alguna duda o desea que la ajustemos?' },
    ],
    tags: ['Cotización enviada', 'Pedido en producción', 'Cliente frecuente', 'Tarjetas', 'Gran formato', 'Etiquetas'],
    contacts: [
        { key: 'maria', n: 1, name: 'María Fernanda Ríos', company: 'Café Ritual', tags: ['Cotización enviada', 'Tarjetas'] },
        { key: 'jorge', n: 2, name: 'Jorge Benítez', company: 'Constructora Benítez', tags: ['Cliente frecuente', 'Gran formato'] },
        { key: 'andrea', n: 3, name: null, profileName: 'Andrea 🌻', tags: [] },
        { key: 'luis', n: 4, name: 'Luis Pazmiño', company: 'Colegio San Gabriel', tags: ['Pedido en producción'] },
        { key: 'carolina', n: 5, name: 'Carolina Mejía', company: 'Boutique Alma', tags: ['Etiquetas', 'Cotización enviada'] },
        { key: 'roberto', n: 6, name: 'Roberto Salgado', company: 'Ferretería Salgado', tags: ['Cliente frecuente', 'Gran formato'] },
        { key: 'santiago', n: 7, name: 'Santiago Herrera', tags: [] },
        { key: 'veronica', n: 8, name: 'Verónica Cueva', company: 'Clínica Dental Sonríe', tags: ['Cliente frecuente', 'Tarjetas'] },
    ],
    // Los demás, para la campaña y los filtros de Contactos.
    bulk: {
        from: 20, count: 16,
        first: ['Ana', 'Marco', 'Daniela', 'Fernando', 'Gabriela', 'Pablo', 'Sofía', 'Esteban'],
        last: ['Proaño', 'Cárdenas', 'Villacís', 'Torres', 'Jaramillo', 'Espinosa', 'Ortiz', 'Montalvo'],
        companies: ['Restaurante El Fogón', 'Farmacia Cruz Azul', 'Inmobiliaria Norte', 'Pastelería Dulce Hogar', 'Consultorio Jurídico Mora', null],
        tags: [['Cliente frecuente'], ['Tarjetas'], [], ['Gran formato'], ['Cliente frecuente', 'Etiquetas']],
    },
    notes: [
        { contact: 'maria', by: 'agent', at: '12d', text: 'Quiere laminado mate. Cotización #1045 enviada: USD 45 por 1.000 tarjetas. Lo decide con su socio.' },
        { contact: 'jorge', by: 'owner', at: '40d', text: 'Paga a 30 días con factura a nombre de la constructora. Siempre pide instalación.' },
        { contact: 'luis', by: 'agent', at: '5d', text: 'Volantes A5 para la feria del colegio: 2.000 unidades. Pagó el 50 % de anticipo.' },
        { contact: 'carolina', by: 'owner', at: '1d 15:20', text: 'Etiquetas redondas de 5 cm para su ropa. Le debemos la cotización.' },
    ],
    conversations: [
        // Volvió por la cotización que le hizo Diego y hoy la atiende Patricia:
        // el historial, el PDF y la nota de Diego están ahí.
        { contact: 'maria', unread: 1, msgs: [
            { from: 'them', at: '12d 10:05', text: 'Hola, buenos días. Quisiera cotizar 1.000 tarjetas de presentación full color' },
            { from: 'agent', at: '12d 10:09', text: 'Buenos días, María Fernanda. Claro que sí. ¿Las prefiere con laminado mate o brillante?' },
            { from: 'them', at: '12d 10:15', text: 'Mate, por favor' },
            { from: 'agent', at: '12d 10:31', document: { file: 'demo-cotizacion.pdf', filename: 'Cotizacion-1045-Cafe-Ritual.pdf' } },
            { from: 'agent', at: '12d 10:31', text: 'Le envío la cotización: USD 45 con laminado mate, entrega en 3 días hábiles desde que aprueba el arte.' },
            { from: 'them', at: '12d 10:40', text: 'Gracias, lo reviso con mi socio y le confirmo 🙏' },
            { from: 'them', at: '2h', text: 'Hola, ya lo decidimos. ¿Sigue en pie el precio de las tarjetas?' },
        ] },
        // Lo respondió Patricia desde la app del celular, y está aquí igual.
        { contact: 'jorge', msgs: [
            { from: 'them', at: '1d 16:20', text: 'Patricia, ¿me ayudas con una lona de 3 x 2 m para la obra de Cumbayá? Con el mismo diseño de la anterior' },
            { from: 'app', at: '1d 16:48', text: 'Claro, Jorge. Mañana te la tenemos lista con instalación. Son USD 54 como la vez pasada.' },
            { from: 'them', at: '1d 16:50', text: 'Perfecto, dale nomás 👍' },
            { from: 'agent', at: '2h', text: 'Buenos días, Jorge. La lona ya está impresa; el equipo de instalación llega a la obra a las 15:00.' },
        ] },
        // Escribió de noche: el bot respondió con el horario, y Diego al abrir.
        { contact: 'andrea', msgs: [
            { from: 'them', at: '2d 21:34', text: 'Hola, ¿hacen stickers para emprendimientos?' },
            { from: 'bot', at: '2d 21:34', text: '¡Hola! Gracias por escribir a Gráfica Andina 😊 Atendemos de lunes a viernes de 8:30 a 18:00 y los sábados de 9:00 a 13:00. Le respondemos apenas abramos.' },
            { from: 'agent', at: '1d 08:42', text: 'Buenos días, Andrea. Sí, hacemos stickers en vinil, troquelados a la forma que necesite. ¿Qué medida y cuántos serían?' },
            { from: 'them', at: '1d 09:10', text: '200 de 5 x 5 cm con mi logo' },
            { from: 'agent', at: '1d 09:14', text: 'Serían USD 18. Si me envía el logo en buena calidad, se los entregamos en 2 días.' },
        ] },
        // Pregunta por la dirección: responde el bot con la palabra clave.
        { contact: 'santiago', unread: 2, msgs: [
            { from: 'them', at: '35m', text: 'Buenas tardes, ¿dónde están ubicados?' },
            { from: 'bot', at: '35m', text: 'Estamos en la Av. 6 de Diciembre N34-120 y Checoslovaquia, Quito 📍 Hay parqueadero para clientes.' },
            { from: 'them', at: '31m', text: 'Gracias. ¿Imprimen planos en A1?' },
        ] },
        { contact: 'luis', msgs: [
            { from: 'them', at: '5d 11:02', text: 'Buenos días, necesito 2.000 volantes A5 para la feria del colegio' },
            { from: 'agent', at: '5d 11:20', text: 'Buenos días, Luis. Son USD 95 en couché de 115 g a full color. Con el 50 % de anticipo empezamos hoy mismo.' },
            { from: 'them', at: '5d 12:45', text: 'Listo, ya hice la transferencia' },
            { from: 'agent', at: '5d 12:50', text: 'Recibido, gracias. Le aviso apenas estén listos.' },
            { from: 'them', at: '1h', text: '¿Ya estarán los volantes? La feria es el sábado' },
        ], unread: 1 },
        { contact: 'carolina', msgs: [
            { from: 'them', at: '1d 15:02', text: 'Hola, quiero etiquetas redondas de 5 cm para mi marca de ropa' },
            { from: 'owner', at: '1d 15:08', text: 'Hola, Carolina. ¿Cuántas necesita y en qué papel? Tenemos adhesivo blanco, kraft y transparente.' },
            { from: 'them', at: '1d 15:15', text: '500 en kraft 🤎' },
            { from: 'owner', at: '1d 15:18', text: 'Perfecto, le preparo la cotización y se la envío.' },
        ] },
        // Hace 20 días: la ventana de 24 h está cerrada; para escribirle, una plantilla.
        { contact: 'roberto', msgs: [
            { from: 'them', at: '22d 15:10', text: 'Necesito un rótulo de 4 x 1 m para la ferretería' },
            { from: 'owner', at: '22d 15:30', text: 'Claro, Roberto. Mañana pasamos a tomar medidas.' },
            { from: 'template', template: 'pedidoListo', values: ['Roberto', '#1032 (rótulo)'], at: '20d 10:00', status: 'read' },
            { from: 'them', at: '20d 10:12', text: 'Excelente, mañana lo retiro. Gracias!' },
        ] },
    ],
    campaign: {
        name: 'Calendarios 2027 · clientes frecuentes', template: 'calendarios', at: '3d 10:00',
        variables: [{ key: '1', source: 'firstName', fallback: 'cliente' }],
        values: (contact) => [contact.firstName],
        recipients: { tags: ['Cliente frecuente'] },
        failed: 1, delivered: 3,
        replies: [
            { contact: 'veronica', after: 25, text: 'Sí, por favor. Necesitamos 100 para nuestros pacientes 😊' },
            { bulk: 0, after: 90, text: '¿Cuál es el mínimo de unidades?' },
        ],
    },
    autoReplies: {
        welcome: '¡Hola! Gracias por escribir a Gráfica Andina 😊 Cuéntenos qué necesita imprimir y en un momento le atendemos.',
        outOfHours: '¡Hola! Gracias por escribir a Gráfica Andina 😊 Atendemos de lunes a viernes de 8:30 a 18:00 y los sábados de 9:00 a 13:00. Le respondemos apenas abramos.',
        hours: { weekdays: ['08:30', '18:00'], saturday: ['09:00', '13:00'] },
        keywordRules: [
            { keywords: ['dirección', 'ubicados', 'ubicación', 'dónde están'], text: 'Estamos en la Av. 6 de Diciembre N34-120 y Checoslovaquia, Quito 📍 Hay parqueadero para clientes.' },
            { keywords: ['horario', 'atienden', 'abren'], text: 'Atendemos de lunes a viernes de 8:30 a 18:00 y los sábados de 9:00 a 13:00.' },
            { keywords: ['transferencia', 'cuenta', 'pago'], text: 'Puede pagar por transferencia al Banco Pichincha, cuenta corriente 2100000000, a nombre de Gráfica Andina. Envíenos el comprobante por aquí.' },
        ],
        fallback: 'Gracias por su mensaje. En un momento una persona del equipo le responde.',
    },
};

const capacitacion = {
    key: 'capacitacion',
    accountName: 'Academia Horizonte',
    owner: { name: 'Mónica Zambrano', email: 'demo.capacitacion@wasmish.com' },
    agent: { name: 'Gabriela León', email: 'asesora.capacitacion@wasmish.com' },
    line: { phoneNumberId: '990000000000911', waBusinessId: '990000000000910', display: '+593 99 000 0911', verifiedName: 'Academia Horizonte', name: 'Inscripciones' },
    templates: [
        { key: 'nuevoGrupo', name: 'nuevo_grupo', category: 'MARKETING',
            bodyText: 'Hola {{1}}, abrimos un nuevo grupo de {{2}} que empieza el {{3}}. Quedan pocos cupos: ¿le reservo uno?' },
        { key: 'recordatorio', name: 'recordatorio_clase', category: 'UTILITY',
            bodyText: 'Hola {{1}}, le recordamos que su clase de {{2}} es el {{3}}. ¡Le esperamos!' },
        { key: 'certificado', name: 'certificado_listo', category: 'UTILITY',
            bodyText: 'Hola {{1}}, su certificado del curso de {{2}} ya está listo. Puede retirarlo en secretaría o se lo enviamos por aquí.' },
    ],
    tags: ['Interesado', 'Inscrito', 'Excel', 'Marketing digital', 'Asistente contable', 'Empresa'],
    contacts: [
        { key: 'kevin', n: 1, name: 'Kevin Mora', company: 'Distribuidora del Pacífico', tags: ['Interesado', 'Excel', 'Empresa'] },
        { key: 'daniela', n: 2, name: 'Daniela Suárez', tags: ['Inscrito', 'Marketing digital'] },
        { key: 'jose', n: 3, name: null, profileName: 'José Luis', tags: [] },
        { key: 'paola', n: 4, name: 'Paola Cedeño', tags: ['Interesado', 'Asistente contable'] },
        { key: 'ricardo', n: 5, name: 'Ricardo Alvarado', tags: ['Inscrito', 'Excel'] },
        { key: 'tatiana', n: 6, name: 'Tatiana Vélez', tags: ['Interesado', 'Marketing digital'] },
        { key: 'fernanda', n: 7, name: 'Fernanda Aguirre', company: 'Seguros La Unión', tags: ['Empresa', 'Asistente contable'] },
    ],
    bulk: {
        from: 20, count: 18,
        first: ['Andrés', 'Karina', 'Javier', 'Lorena', 'Bryan', 'Michelle', 'Cristian', 'Nathaly', 'Diego'],
        last: ['Zambrano', 'Macías', 'Bajaña', 'Cevallos', 'Rodríguez', 'Peñafiel', 'Quiñónez', 'Loor', 'Franco'],
        companies: [null, null, 'Banco del Litoral', null, 'Comercial Torres', null],
        tags: [['Interesado', 'Marketing digital'], ['Inscrito', 'Excel'], ['Interesado', 'Marketing digital'], ['Interesado', 'Excel'], ['Interesado', 'Marketing digital', 'Empresa'], []],
    },
    notes: [
        { contact: 'kevin', by: 'agent', at: '10d', text: 'Le interesa Excel Avanzado, grupo de los sábados. Pidió la factura a nombre de su empresa. Quizá inscriba a 2 compañeros más.' },
        { contact: 'daniela', by: 'owner', at: '4d', text: 'Pagó por transferencia el 4 de este mes. Falta su copia de cédula para el certificado.' },
        { contact: 'paola', by: 'agent', at: '3d', text: 'Trabaja de lunes a viernes: solo puede los sábados. Avisarle cuando abra el grupo de Asistente Contable.' },
        { contact: 'fernanda', by: 'owner', at: '20d', text: 'Recursos Humanos de Seguros La Unión: capacitación para 8 personas. Quiere propuesta con descuento corporativo.' },
    ],
    conversations: [
        // Preguntó hace 10 días y lo atendió Gabriela; hoy vuelve y lo atiende
        // Mónica, que ve el historial, el PDF y la nota.
        { contact: 'kevin', unread: 1, msgs: [
            { from: 'them', at: '10d 18:20', text: 'Buenas tardes, ¿qué días es el curso de Excel avanzado?' },
            { from: 'agent', at: '10d 18:26', text: 'Buenas tardes, Kevin. Tenemos grupo los sábados de 9:00 a 13:00, cuatro semanas. Le envío la información completa.' },
            { from: 'agent', at: '10d 18:27', document: { file: 'demo-curso.pdf', filename: 'Excel-Avanzado-Academia-Horizonte.pdf' } },
            { from: 'them', at: '10d 18:40', text: 'Gracias. ¿Me pueden facturar a nombre de mi empresa?' },
            { from: 'agent', at: '10d 18:44', text: 'Claro que sí, solo necesitamos el RUC y la razón social al inscribirse.' },
            { from: 'them', at: '1h', text: 'Hola, ¿todavía hay cupo para el curso de Excel del sábado? Seríamos 3 personas' },
        ] },
        // Pidió los requisitos: los mandó el bot por la palabra clave.
        { contact: 'jose', unread: 2, msgs: [
            { from: 'them', at: '50m', text: 'Hola, ¿cuáles son los requisitos para inscribirme?' },
            { from: 'bot', at: '50m', text: 'Para inscribirse necesita: copia de cédula, el pago del curso (transferencia o tarjeta) y llenar la ficha que le enviamos por aquí. ¡Es muy fácil! 😊' },
            { from: 'them', at: '46m', text: '¿Y aceptan tarjeta de crédito?' },
        ] },
        // Lo respondió Mónica desde la app del celular, y está aquí igual.
        { contact: 'daniela', msgs: [
            { from: 'them', at: '4d 19:02', text: 'Buenas noches, ya hice la transferencia del curso de Marketing Digital' },
            { from: 'app', at: '4d 19:15', text: '¡Gracias, Daniela! Ya está inscrita. Solo nos falta la copia de su cédula para el certificado 🙌' },
            { from: 'them', at: '4d 19:16', text: 'Mañana se la envío' },
            { from: 'template', template: 'recordatorio', values: ['Daniela', 'Marketing Digital', 'sábado a las 9:00'], at: '1d 09:00', status: 'read' },
        ] },
        // Escribió de noche: el bot respondió con el horario, y Gabriela al abrir.
        { contact: 'paola', msgs: [
            { from: 'them', at: '3d 22:10', text: 'Hola, ¿tienen curso de asistente contable los sábados?' },
            { from: 'bot', at: '3d 22:10', text: '¡Hola! Gracias por escribir a Academia Horizonte 📚 Atendemos de lunes a viernes de 8:30 a 18:00 y los sábados de 8:00 a 12:00. Le respondemos apenas abramos.' },
            { from: 'agent', at: '2d 08:35', text: 'Buenos días, Paola. Por ahora el grupo de Asistente Contable es entre semana, pero en noviembre abrimos uno los sábados. ¿Le aviso cuando abra?' },
            { from: 'them', at: '2d 08:50', text: 'Sí, por favor 🙏' },
        ] },
        { contact: 'ricardo', msgs: [
            { from: 'them', at: '1d 09:30', text: 'Buenos días, mañana no podré ir a clase. ¿Me pueden enviar el material?' },
            { from: 'agent', at: '1d 09:41', text: 'Buenos días, Ricardo. Claro, el profesor sube el material al aula virtual el mismo día. Ahí lo encuentra.' },
            { from: 'them', at: '1d 09:45', text: 'Perfecto, muchas gracias' },
        ] },
        // Hace 20 días: la ventana de 24 h está cerrada; para escribirle, una plantilla.
        { contact: 'fernanda', msgs: [
            { from: 'them', at: '20d 10:00', text: 'Buenos días, necesitamos capacitar a 8 personas en atención al cliente. ¿Tienen cursos para empresas?' },
            { from: 'owner', at: '20d 10:25', text: 'Buenos días, Fernanda. Sí, armamos cursos a la medida para empresas. Le preparo una propuesta con descuento corporativo.' },
            { from: 'them', at: '20d 10:30', text: 'Perfecto, quedo atenta' },
        ] },
    ],
    // Volver a escribir a quienes preguntaron por Marketing Digital cuando abre el grupo.
    campaign: {
        name: 'Nuevo grupo de Marketing Digital · noviembre', template: 'nuevoGrupo', at: '2d 10:00',
        variables: [
            { key: '1', source: 'firstName', fallback: 'cliente' },
            { key: '2', source: 'fixed', value: 'Marketing Digital' },
            { key: '3', source: 'fixed', value: 'sábado 7 de noviembre' },
        ],
        values: (contact) => [contact.firstName, 'Marketing Digital', 'sábado 7 de noviembre'],
        recipients: { tags: ['Interesado', 'Marketing digital'], all: true },
        failed: 1, delivered: 2,
        replies: [
            { contact: 'tatiana', after: 15, text: 'Sí, resérveme uno por favor 🙋‍♀️' },
            { bulk: 0, after: 40, text: '¿Cuánto cuesta y es presencial?' },
            { bulk: 2, after: 120, text: 'Me interesa, pero solo puedo en la tarde' },
        ],
    },
    autoReplies: {
        welcome: '¡Hola! Bienvenido a Academia Horizonte 📚 Cuéntenos qué curso le interesa y una asesora le atiende enseguida.',
        outOfHours: '¡Hola! Gracias por escribir a Academia Horizonte 📚 Atendemos de lunes a viernes de 8:30 a 18:00 y los sábados de 8:00 a 12:00. Le respondemos apenas abramos.',
        hours: { weekdays: ['08:30', '18:00'], saturday: ['08:00', '12:00'] },
        keywordRules: [
            { keywords: ['requisitos', 'inscribirme', 'inscripción'], text: 'Para inscribirse necesita: copia de cédula, el pago del curso (transferencia o tarjeta) y llenar la ficha que le enviamos por aquí. ¡Es muy fácil! 😊' },
            { keywords: ['precio', 'costo', 'cuánto cuesta', 'valor'], text: 'Nuestros cursos cortos van desde USD 80 y los diplomados desde USD 250, con certificado incluido. ¿Qué curso le interesa para enviarle el detalle?' },
            { keywords: ['dirección', 'ubicados', 'dónde están'], text: 'Estamos en Kennedy Norte, Av. Miguel H. Alcívar y Eleodoro Arboleda, edificio Torres del Norte, piso 3, Guayaquil 📍' },
        ],
        fallback: 'Gracias por su mensaje. En un momento una asesora le responde.',
    },
};

export const DEMO_SCENARIOS = { imprenta, capacitacion };
