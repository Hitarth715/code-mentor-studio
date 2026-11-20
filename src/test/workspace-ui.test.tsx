import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/index";

const Workspace = Route.options.component as () => ReactElement;

function editor() {
  return screen.getByLabelText("Source code", { selector: "textarea" }) as HTMLTextAreaElement;
}

function sidebar() {
  return within(screen.getByRole("navigation", { name: "Workspace navigation" }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe("sidebar", () => {
  it("opens Projects with all files and the right count", () => {
    render(<Workspace />);
    fireEvent.click(sidebar().getByRole("button", { name: /Projects/ }));

    expect(screen.getByRole("region", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open data_parser.py" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open api_routes.ts" })).toBeInTheDocument();
  });

  it("opens a file from Projects into the editor with its language", () => {
    render(<Workspace />);
    fireEvent.click(sidebar().getByRole("button", { name: /Projects/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open data_parser.py" }));

    expect(editor().value).toContain("def parse_scores");
    expect((screen.getByLabelText("Code language") as HTMLSelectElement).value).toBe("Python");
  });

  it("opens a recent file straight from the sidebar", () => {
    render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: /api_routes\.ts/ }));

    expect(editor().value).toContain("sk_live_51HxExample");
  });

  it("New review creates an empty untitled file and shows it in Projects", () => {
    render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: /New review/ }));

    expect(editor().value).toBe("");
    expect(screen.getAllByText("untitled-1.js").length).toBeGreaterThan(0);

    fireEvent.click(sidebar().getByRole("button", { name: /Projects/ }));
    expect(screen.getByRole("button", { name: "Open untitled-1.js" })).toBeInTheDocument();
  });

  it("changing the language renames the file extension", () => {
    render(<Workspace />);
    fireEvent.change(screen.getByLabelText("Code language"), { target: { value: "Python" } });

    expect(screen.getAllByText("user-auth.py").length).toBeGreaterThan(0);
  });

  it("records a review in Review history and can restore it", () => {
    render(<Workspace />);
    fireEvent.click(screen.getByRole("button", { name: /Review my code/ }));
    fireEvent.change(editor(), { target: { value: "const changed = 1;" } });

    fireEvent.click(sidebar().getByRole("button", { name: /Review history/ }));
    expect(screen.getByRole("region", { name: "Review history" })).toBeInTheDocument();
    expect(screen.getByText("Quick check")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    expect(editor().value).toContain("welcome123");
  });

  it("saves work to this browser", () => {
    render(<Workspace />);
    fireEvent.change(editor(), { target: { value: "let saved = true;" } });

    expect(window.localStorage.getItem("reviewlab:workspace:v1")).toContain("let saved = true;");
  });

  it("deletes a project after confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Workspace />);
    fireEvent.click(sidebar().getByRole("button", { name: /Projects/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete api_routes.ts" }));

    expect(screen.queryByRole("button", { name: "Open api_routes.ts" })).not.toBeInTheDocument();
  });
});
