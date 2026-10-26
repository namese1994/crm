import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { CustomerCareRouter } from "./customer-care.router";
import { CustomerCareService } from "./customer-care.service";

@Module({
	imports: [TrpcModule],
	providers: [CustomerCareService, CustomerCareRouter],
})
export class CustomerCareModule {}
