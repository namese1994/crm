import { workspaceRoleOf } from "@crm/auth/organization";
import type { Db } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import { InjectDatabase } from "../database/database.constants";
import type { BaseTrpcContext } from "../trpc/context.types";

@Injectable()
export class CareMembershipMiddleware implements TRPCMiddleware {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const user = (opts.ctx as BaseTrpcContext).session?.user;
		if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
		if (!(await workspaceRoleOf(user.id, this.db))) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Bạn không còn quyền truy cập workspace",
			});
		}
		return opts.next();
	}
}
