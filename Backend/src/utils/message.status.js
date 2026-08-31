// Transiciones de estado de un mensaje saliente.
//
// Meta no garantiza ni el orden ni la unicidad de los webhooks de estado: un
// 'delivered' puede llegar DESPUÉS de un 'read', y cualquiera puede repetirse.
// Por eso la transición es monótona: solo se aplica si sube de rango.
export const STATUS_RANK = { sent: 0, delivered: 1, read: 2, failed: 3 };

/**
 * Decide qué campos hay que actualizar cuando llega un webhook de estado.
 * Devuelve `null` si el estado no avanza (desconocido, repetido o hacia atrás),
 * en cuyo caso no hay que guardar nada ni emitir SSE.
 */
export const resolveStatusTransition = ({
    currentStatus,
    incomingStatus,
    timestamp,
    hasDeliveredAt,
}) => {
    const currentRank = STATUS_RANK[currentStatus] ?? 0;
    const nextRank = STATUS_RANK[incomingStatus];

    if (nextRank === undefined || nextRank <= currentRank) return null;

    const changes = { status: incomingStatus };

    if (incomingStatus === 'delivered') {
        changes.deliveredAt = timestamp;
    } else if (incomingStatus === 'read') {
        changes.readAt = timestamp;
        // Si el 'delivered' nunca llegó, lo inferimos: leído implica entregado.
        if (!hasDeliveredAt) changes.deliveredAt = timestamp;
    } else if (incomingStatus === 'failed') {
        changes.failedAt = timestamp;
    }

    return changes;
};
