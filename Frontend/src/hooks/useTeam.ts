import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTeamService, inviteMemberService, revokeInvitationService, updateMemberService } from "../services/api.service";
import type { InvitationInput, MemberChange } from "../models/team.model";

export const TEAM_QUERY_KEY = ['team'];

/**
 * El equipo de la cuenta (Fase 3): las personas, las invitaciones pendientes y
 * las plazas, y lo que se hace con ellos. Solo owner y admin (`team.manage`).
 * Cada mutación vuelve a pedir el equipo al terminar, haya ido bien o no.
 */
export const useTeam = ({ enabled = true }: { enabled?: boolean } = {}) => {
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: TEAM_QUERY_KEY, queryFn: getTeamService, enabled });
    const refresh = () => queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });

    const invite = useMutation({ mutationFn: (input: InvitationInput) => inviteMemberService(input), onSettled: refresh });
    const revokeInvitation = useMutation({ mutationFn: (id: string) => revokeInvitationService(id), onSettled: refresh });
    const updateMember = useMutation({
        mutationFn: ({ id, change }: { id: string; change: MemberChange }) => updateMemberService(id, change),
        onSettled: refresh,
    });

    return {
        isLoading: query.isLoading,
        isError: query.isError,
        refresh,
        members: query.data?.members ?? [],
        invitations: query.data?.invitations ?? [],
        maxUsers: query.data?.maxUsers ?? 1,
        seatsUsed: query.data?.seatsUsed ?? 0,
        invite,
        revokeInvitation,
        updateMember,
    };
};
