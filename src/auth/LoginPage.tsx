import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { AuthShell } from "@/auth/AuthShell";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (raw) => {
    setFormError(null);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      // Generic message - never reveal whether the email exists.
      setFormError("Invalid email or password.");
      return;
    }
    // AuthProvider resolves the new session; guards route to MFA or dashboard.
    navigate("/", { replace: true });
  });

  return (
    <AuthShell
      title="Site Analytics"
      subtitle="Sign in to the website portfolio control center"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            aria-invalid={!!errors.email}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-critical">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-xs text-critical">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>

        <a
          href="/demo"
          className="flex h-10 w-full items-center justify-center rounded-md border border-border text-sm font-medium transition-colors hover:bg-muted"
        >
          View public demo
        </a>

        <div className="text-center text-sm">
          <Link
            to="/reset-password"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
