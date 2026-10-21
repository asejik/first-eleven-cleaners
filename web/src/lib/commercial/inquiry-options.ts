/** The Commercial form's choices, shared by the page and the server check (lib/commercial/inquiry.ts) */
export const INDUSTRIES = {
  salon_spa: 'Salon / Spa / Wellness',
  gym_fitness: 'Gym / Fitness Club',
  hotel_hospitality: 'Hotel / Airbnb Operator',
  corporate_office: 'Corporate / Executive Office',
  sports_events: 'Sports Team / Event Producer',
  government_institutional: 'Government / Institutional',
  other: 'Other Commercial Need',
} as const;

export const VOLUMES = {
  under_50: 'Under 50 lbs / week',
  weekly_50_150: '50 - 150 lbs / week',
  weekly_150_500: '150 - 500 lbs / week',
  weekly_500_plus: '500+ lbs / week (High Volume)',
} as const;

export type Industry = keyof typeof INDUSTRIES;
export type Volume = keyof typeof VOLUMES;
