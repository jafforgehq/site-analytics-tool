import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { AuthShell } from "@/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

interface EnrollData {
  factorId: string;
  qrCode: string; // SVG data URL
  secret: string;
}

export function MfaSetupPage() {
  const navigate = useNavigate();
  const { refresh, signOut } = useAuth();
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const started = useRef(false);

  // Enroll a fresh TOTP factor on mount, clearing any stale unverified ones so
  // repeated visits don't pile up orphan factors.
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const { data: list } = await supabase.auth.mfa.listFactors();
        const stale = (list?.all ?? []).filter(
          (f) => f.factor_type === "totp" && f.status === "unverified",
        );
        await Promise.all(
          stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })),
        );

        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Authenticator ${new Date().toISOString()}`,
        });
        if (error || !data) {
          setEnrollError("Could not start MFA setup. Please try again.");
          return;
        }
        setEnroll({
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
        });
      } catch {
        setEnrollError("Could not start MFA setup. Please try again.");
      }
    })();
  }, []);

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enroll) return;
    setVerifyError(null);

    if (!/^\d{6}$/.test(code)) {
      setVerifyError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setVerifying(true);
    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (challengeError || !challenge) {
        setVerifyError("Could not start verification. Please try again.");
        return;
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyErr) {
        setVerifyError("That code didn't match. Please try again.");
        return;
      }
      await refresh(); // session is now aal2
      navigate("/", { replace: true });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <AuthShell
      title="Set up two-factor authentication"
      subtitle="Scan the QR code with an authenticator app, then enter the 6-digit code"
    >
      {enrollError && <Alert tone="error">{enrollError}</Alert>}

      {!enroll && !enrollError && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Spinner /> Preparing your secret…
        </div>
      )}

      {enroll && (
        <form onSubmit={onVerify} className="space-y-4">
          <div className="flex justify-center">
            <img
              src={enroll.qrCode}
              alt="TOTP QR code"
              className="h-44 w-44 rounded-md border border-border bg-white p-2"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="secret">Can't scan? Enter this code manually</Label>
            <Input
              id="secret"
              readOnly
              value={enroll.secret}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              aria-invalid={!!verifyError}
            />
            {verifyError && (
              <p className="text-xs text-critical">{verifyError}</p>
            )}
          </div>

          <Button type="submit" className="w-full" loading={verifying}>
            Verify and continue
          </Button>
        </form>
      )}

      <div className="mt-4 text-center text-sm">
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}
