export const departments = ["CSIS", "Statistics", "Mathematics"] as const;
export type Department = (typeof departments)[number];
