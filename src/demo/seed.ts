import { db } from "../db/database";
import { blankApplication, type Status } from "../domain/model";

export async function seedDesignPreview() {
  const database = await db();
  // One transaction also prevents duplicate seeding when two previews open.
  const tx = database.transaction(["applications", "tombstones"], "readwrite");
  if (
    (await tx.objectStore("applications").count()) ||
    (await tx.objectStore("tombstones").count())
  ) {
    await tx.done;
    return;
  }
  const date = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const examples: [string, string, Status, string, string, number?][] = [
    [
      "Northstar",
      "Product Designer",
      "Interview",
      "San Francisco, CA · Hybrid",
      "Portfolio conversation",
      2,
    ],
    ["Forma", "Design Engineer", "OA", "Remote", "Complete the take-home", 4],
    [
      "Orbit",
      "Senior Product Designer",
      "Offer",
      "New York, NY",
      "Review the offer",
      6,
    ],
    [
      "Daybreak",
      "UX Designer",
      "Applied",
      "Remote",
      "Follow up with recruiting",
      3,
    ],
    [
      "Common Ground",
      "Product Designer",
      "Applied",
      "Seattle, WA · Hybrid",
      "Check in next week",
      7,
    ],
    [
      "Fieldwork",
      "Design Engineer",
      "Interested",
      "San Francisco, CA",
      "Tailor resume",
      1,
    ],
    [
      "Morrow",
      "Interaction Designer",
      "Interview",
      "Remote",
      "Meet the design team",
      5,
    ],
    [
      "Good Measure",
      "Product Designer",
      "Rejected",
      "Austin, TX",
      "Send a thank-you note",
    ],
    ["Parallel", "UX Engineer", "Applied", "Remote", "Awaiting an update"],
  ];
  for (const [
    i,
    [company, role, status, location, action, due],
  ] of examples.entries()) {
    const application = {
      ...blankApplication(),
      id: `design-demo-${i}`,
      company,
      role,
      status,
      location,
      action,
      actionDate: due === undefined ? "" : date(due),
      appliedDate: status === "Interested" ? "" : date(-12 + i),
      notes:
        "Fictional application for exploring the design. Try editing the next step or changing the stage.",
      revision: 1,
      history: [
        ...(status !== "Interested"
          ? [
              {
                id: `demo-applied-${i}`,
                status: "Applied" as const,
                at: new Date(date(-12 + i) + "T12:00:00").toISOString(),
                origin: "manual" as const,
              },
            ]
          : []),
        {
          id: `demo-current-${i}`,
          status,
          at: new Date().toISOString(),
          origin: "manual" as const,
        },
      ],
    };
    await tx.objectStore("applications").put(application);
  }
  await tx.done;
}
