"use client";

import { signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { type FormEvent, useState } from "react";

export function PasswordSignIn() {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (pending) return;
		const form = event.currentTarget;
		const data = new FormData(form);
		setPending(true);
		setError(null);
		try {
			const result = await signIn.email({
				email: String(data.get("email") ?? "").trim(),
				password: String(data.get("password") ?? ""),
				callbackURL: `${window.location.origin}/`,
			});
			if (result.error) {
				setError("Không đăng nhập được. Kiểm tra email và mật khẩu được cấp.");
				return;
			}
			form.reset();
			window.location.assign("/");
		} catch {
			setError("Chưa kết nối được máy chủ. Thử lại sau ít phút.");
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={submit}>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="care-sign-in-email">Email</FieldLabel>
					<Input
						id="care-sign-in-email"
						name="email"
						type="email"
						autoComplete="username"
						required
						disabled={pending}
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="care-sign-in-password">Mật khẩu</FieldLabel>
					<Input
						id="care-sign-in-password"
						name="password"
						type="password"
						autoComplete="current-password"
						required
						disabled={pending}
					/>
				</Field>
				{error ? <p role="alert">{error}</p> : null}
				<Button type="submit" size="touch" disabled={pending}>
					{pending ? <Spinner data-icon="inline-start" /> : null}
					Đăng nhập
				</Button>
			</FieldGroup>
		</form>
	);
}
