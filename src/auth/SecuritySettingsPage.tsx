import { useCallback, useEffect, useState } from "react";
import type { Factor } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export function SecuritySettingsPage() {
  const { user, currentLevel, signOut, refresh } = useAuth();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError("Could not load authenticators.");
      return;
    }
    setFactors(data?.all ?? []);
  }, []);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  const onRemove = async (factorId: string) => {
    setError(null);
    const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId });
    if (unErr) {
      setError("Could not remove that authenticator.");
      return;
    }
    setConfirmRemove(null);
    await loadFactors();
    await refresh();
  };

  const verifiedCount =
    factors?.filter((f) => f.status === "verified").length ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account and two-factor authentication.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Email" value={user?.email ?? "-"} />
          <Row
            label="Assurance level"
            value={
              currentLevel === "aal2"
                ? "aal2 - MFA verified"
                : (currentLevel ?? "-")
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authenticator apps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {factors === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading…
            </div>
          ) : factors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No authenticators enrolled.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {factors.map((factor) => (
                <li
                  key={factor.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {factor.friendly_name || "Authenticator"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {factor.factor_type.toUpperCase()} · {factor.status}
                    </p>
                  </div>
                  {confirmRemove === factor.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {verifiedCount <= 1
                          ? "This is your last factor - you'll need to re-enroll."
                          : "Remove?"}
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void onRemove(factor.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmRemove(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmRemove(factor.id)}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <AddAuthenticator onAdded={loadFactors} />
        </CardContent>
      </Card>

      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

interface Enroll {
  factorId: string;
  qrCode: string;
  secret: string;
}

function AddAuthenticator({ onAdded }: { onAdded: () => Promise<void> }) {
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString()}`,
      });
      if (enrollError || !data) {
        setError("Could not start enrollment.");
        return;
      }
      setEnroll({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enroll) return;
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (challengeError || !challenge) {
        setError("Could not start verification.");
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) {
        setError("That code didn't match. Try again.");
        return;
      }
      setEnroll(null);
      setCode("");
      await onAdded();
    } finally {
      setBusy(false);
    }
  };

  if (!enroll) {
    return (
      <Button size="sm" variant="secondary" loading={busy} onClick={start}>
        Add another authenticator
      </Button>
    );
  }

  return (
    <form
      onSubmit={verify}
      className="space-y-3 rounded-md border border-border p-3"
    >
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex justify-center">
        <img
          src={enroll.qrCode}
          alt="TOTP QR code"
          className="h-40 w-40 rounded-md border border-border bg-white p-2"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-secret">Manual code</Label>
        <Input
          id="add-secret"
          readOnly
          value={enroll.secret}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-code">6-digit code</Label>
        <Input
          id="add-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit" loading={busy}>
          Verify
        </Button>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => {
            setEnroll(null);
            setCode("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
