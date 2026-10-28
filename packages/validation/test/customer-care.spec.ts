import { describe, expect, test } from "bun:test";
import {
	CARE,
	careBlock,
	careDueAt,
	careStep,
	careTemplateInput,
	renderCareTemplate,
} from "../src/customer-care";

describe("care rules", () => {
	test("template edits require the version that was opened", () => {
		const draft = {
			brand: "UMEHA",
			purpose: "CHECK_IN",
			name: "Mẫu",
			body: "Chào",
			requiredTags: [],
			excludedTags: [],
			validUntil: null,
		};
		expect(careTemplateInput.safeParse(draft).success).toBe(true);
		expect(
			careTemplateInput.safeParse({ ...draft, id: "template" }).success,
		).toBe(false);
		expect(
			careTemplateInput.safeParse({ ...draft, id: "template", version: 1 })
				.success,
		).toBe(true);
	});
	test("D+x uses Vietnam calendar day at 09:00", () => {
		expect(careDueAt(new Date("2026-10-26T18:00:00Z"), 1).toISOString()).toBe(
			"2026-10-28T02:00:00.000Z",
		);
	});
	test("late backfill chooses current milestone, never catch-up burst", () => {
		expect(
			careStep(
				new Date("2026-10-01T04:00:00Z"),
				new Date("2026-10-22T05:00:00Z"),
			)?.day,
		).toBe(12);
		expect(
			careStep(
				new Date("2026-01-01T04:00:00Z"),
				new Date("2026-10-22T05:00:00Z"),
			),
		).toBeUndefined();
	});
	test("templates reject unknown, malformed and empty variables", () => {
		expect(
			renderCareTemplate("Chị {{customer}}, {{product}} từ {{brand}}", {
				customer: "Khách mẫu",
				product: "Bộ V35",
				brand: "UMEHA",
			}),
		).toContain("Bộ V35");
		expect(() =>
			renderCareTemplate("{{discount}}", {
				customer: "a",
				product: "b",
				brand: "c",
			}),
		).toThrow();
		expect(() =>
			renderCareTemplate("{{customer-name}}", {
				customer: "a",
				product: "b",
				brand: "c",
			}),
		).toThrow();
		expect(() =>
			renderCareTemplate("{{product}}", {
				customer: "a",
				product: "",
				brand: "c",
			}),
		).toThrow();
	});
	test("safety rules block opted-out, stale, refused and unanswered contacts", () => {
		const now = new Date("2026-10-27T03:00:00Z");
		const valid = {
			enrolled: true,
			optedOut: false,
			openIssue: false,
			uncertain: false,
			pausedUntil: null,
			replyPending: false,
			lastTouchAt: null,
			unanswered: 0,
			syncedAt: now,
			conversationVerifiedAt: now,
			canSend: true,
			hasConversation: true,
		};
		expect(careBlock(valid, now)).toBeNull();
		expect(careBlock({ ...valid, canSend: false }, now)).toBeNull();
		for (const patch of [
			{ optedOut: true },
			{ openIssue: true },
			{ uncertain: true },
			{ replyPending: true },
			{ unanswered: 2 },
			{ hasConversation: false },
			{ syncedAt: new Date(now.getTime() - CARE.freshMs - 1) },
			{ lastTouchAt: now },
		])
			expect(careBlock({ ...valid, ...patch }, now)).not.toBeNull();
	});
});
