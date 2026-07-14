import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SiteFormDialog } from "@/features/sites/SiteFormDialog";

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

function renderDialog() {
  const onClose = vi.fn();
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <SiteFormDialog mode="create" onClose={onClose} />
    </QueryClientProvider>,
  );
  const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
  return { onClose, backdrop };
}

describe("SiteFormDialog backdrop dismissal", () => {
  it("closes when the press starts and ends on the backdrop", () => {
    const { onClose, backdrop } = renderDialog();
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when a drag starts inside a field and releases on the backdrop", () => {
    const { onClose, backdrop } = renderDialog();
    // Simulate selecting text in a field, then releasing the mouse outside the
    // dialog: the browser fires the click on the backdrop (common ancestor).
    fireEvent.mouseDown(screen.getByPlaceholderText("Example Blog"));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does NOT close when clicking inside the dialog", () => {
    const { onClose } = renderDialog();
    fireEvent.mouseDown(screen.getByPlaceholderText("Example Blog"));
    fireEvent.click(screen.getByPlaceholderText("Example Blog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes via the explicit Close button", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
