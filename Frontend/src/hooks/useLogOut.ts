import { useMutation } from "@tanstack/react-query";
import { logOutService } from "../services/api.service";

export const useLogOut = () => {

    return useMutation({
        mutationFn: () => logOutService(),
    });
}