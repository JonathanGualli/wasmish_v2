import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getAdminClientsService, getAdminStatsService } from "../services/api.service";
import type { AdminClientsPage, AdminStats } from "../models/admin.model";

export const useAdminStats = () => {
    return useQuery<AdminStats>({
        queryKey: ['admin', 'stats'],
        queryFn: getAdminStatsService,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
}

export const useAdminClients = (pageIndex: number, pageSize: number) => {
    return useQuery<AdminClientsPage> ({
        // pageIndex es 0-based (react-table); la API es 1-based
        queryKey: ['admin', 'clients', pageIndex, pageSize],
        queryFn: () => getAdminClientsService (pageIndex + 1, pageSize),
        placeholderData: keepPreviousData, 
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });
}