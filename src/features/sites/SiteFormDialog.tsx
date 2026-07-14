import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import { useDeleteSite, useSaveSite } from "@/lib/hooks";
import { SaveSiteError, type SiteFormValues } from "@/lib/api";
import type { Site } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

function toDefaults(site?: Site): SiteFormValues {
  return {
    name: site?.name ?? "",
    domain: site?.domain ?? "",
    website_url: site?.website_url ?? "",
    gsc_property: site?.gsc_property ?? "",
    ga4_property_id: site?.ga4_property_id ?? "",
    bing_site_url: site?.bing_site_url ?? "",
    is_active: site?.is_active ?? true,
  };
}

export function SiteFormDialog({
  mode,
  site,
  onClose,
  onDeleted,
}: {
  mode: "create" | "edit";
  site?: Site;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const mutation = useSaveSite();
  const deletion = useDeleteSite();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Guard against accidental dismissal: a click only counts as a backdrop
  // dismissal when the press *started* on the backdrop. Without this, selecting
  // text in a field and releasing the mouse outside the dialog (a drag) fires a
  // click on the backdrop and closes the form mid-edit.
  const pressStartedOnBackdrop = useRef(false);

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    pressStartedOnBackdrop.current = e.target === e.currentTarget;
  };
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && pressStartedOnBackdrop.current) {
      onClose();
    }
    pressStartedOnBackdrop.current = false;
  };

  const onDelete = () => {
    if (!site) return;
    setFormError(null);
    deletion.mutate(site.id, {
      onSuccess: () => (onDeleted ?? onClose)(),
      onError: (err) =>
        setFormError(
          err instanceof SaveSiteError
            ? err.message
            : "Could not delete the site.",
        ),
    });
  };
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SiteFormValues>({ defaultValues: toDefaults(site) });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(
      {
        action: mode === "create" ? "create" : "update",
        id: site?.id,
        values,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) =>
          setFormError(
            err instanceof SaveSiteError
              ? err.message
              : "Could not save the site. Please try again.",
          ),
      },
    );
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="mt-10 w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "Add site" : "Edit site"}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {mode === "create" ? "Add a site" : "Edit site"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <Field label="Name" error={errors.name?.message}>
            <Input
              {...register("name", { required: "Name is required" })}
              placeholder="Example Blog"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Domain" error={errors.domain?.message}>
              <Input
                {...register("domain", { required: "Domain is required" })}
                placeholder="example.com"
              />
            </Field>
            <Field label="Website URL" error={errors.website_url?.message}>
              <Input
                {...register("website_url", {
                  required: "Website URL is required",
                })}
                placeholder="https://example.com"
              />
            </Field>
          </div>

          <Field
            label="GSC property"
            hint="Domain property: sc-domain:example.com · URL-prefix: full URL"
          >
            <Input
              {...register("gsc_property")}
              placeholder="sc-domain:example.com"
            />
          </Field>

          <Field label="GA4 property ID" hint="Numeric ID, not the G-XXXX code">
            <Input {...register("ga4_property_id")} placeholder="483920114" />
          </Field>

          <Field label="Bing site URL" hint="Leave blank if not using Bing">
            <Input
              {...register("bing_site_url")}
              placeholder="https://example.com/"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("is_active")} />
            Active
          </label>

          <div className="flex items-center justify-between gap-2 pt-2">
            {mode === "edit" && site ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Delete site and all its data?
                  </span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    loading={deletion.isPending}
                    onClick={onDelete}
                  >
                    Delete
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-critical"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete site
                </Button>
              )
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                {mode === "create" ? "Add site" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          Integrations enable automatically for whichever provider ids you fill
          in.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
