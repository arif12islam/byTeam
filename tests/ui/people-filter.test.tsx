import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PeopleFilter } from "@/components/people-filter";

describe("PeopleFilter", () => {
  it("renders the search box and the children untouched on first render", () => {
    const html = renderToStaticMarkup(
      <PeopleFilter departments={["Sales", "Ops"]}>
        <p data-person="1" data-name="Rahim">
          Rahim
        </p>
      </PeopleFilter>,
    );
    expect(html).toContain('type="search"');
    expect(html).toContain("All departments");
    expect(html).toContain("Sales");
    expect(html).toContain("Rahim");
    expect(html).not.toContain(" hidden=");
    expect(html).not.toContain("Nobody matches");
  });

  it("leaves out the department list when there are none", () => {
    const html = renderToStaticMarkup(
      <PeopleFilter>
        <p>x</p>
      </PeopleFilter>,
    );
    expect(html).not.toContain("<select");
  });
});
