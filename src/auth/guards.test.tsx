import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireDashboard } from "@/auth/guards";

// Control the auth status the guard sees.
const state = vi.hoisted(() => ({ status: "signed-out" as string }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ status: state.status }),
}));

function renderGuard() {
  return render(
    <MemoryRouter
      initialEntries={["/"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route element={<RequireDashboard />}>
          <Route path="/" element={<div>DASHBOARD</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/mfa/setup" element={<div>MFA SETUP</div>} />
        <Route path="/mfa/verify" element={<div>MFA VERIFY</div>} />
        <Route path="/not-authorized" element={<div>NOT AUTHORIZED</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireDashboard", () => {
  it("redirects signed-out users to login", () => {
    state.status = "signed-out";
    renderGuard();
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });

  it("sends users without a factor to MFA setup", () => {
    state.status = "needs-mfa-setup";
    renderGuard();
    expect(screen.getByText("MFA SETUP")).toBeInTheDocument();
  });

  it("sends aal1 users with a factor to MFA verify", () => {
    state.status = "needs-mfa-verify";
    renderGuard();
    expect(screen.getByText("MFA VERIFY")).toBeInTheDocument();
  });

  it("blocks non-admins even at aal2", () => {
    state.status = "not-admin";
    renderGuard();
    expect(screen.getByText("NOT AUTHORIZED")).toBeInTheDocument();
  });

  it("renders the dashboard for ready admins", () => {
    state.status = "ready";
    renderGuard();
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
  });
});
