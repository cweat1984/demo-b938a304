/** dive2 fix: typical validity per cert type (days) — the default suggestion when logging a renewal.
 *  The person logging it types the date printed on the card; this is only the starting value. */
export const CERT_VALID_DAYS: Record<string, number> = {
  'NCCCO Mobile Operator': 1825, 'NCCCO Crawler Operator': 1825, 'NCCCO Rigger II': 1825, 'NCCCO Signalperson': 1825,
  'DOT Medical Card': 730, // max 2 yr (§391.45); examiners often issue 1 yr or less
  'CDL Class A': 1825, 'TWIC': 1825,
  'H2S Awareness': 365, 'CPR / First Aid': 730, 'Tower Rescue': 730, 'Forklift': 1095, 'Smith Driving': 1095,
  'OSHA 10': 1825, 'OSHA 30': 1825,
}
export const certValidDays = (type: string) => CERT_VALID_DAYS[type] ?? 1095
/** Inspection intervals (days) after a Pass — ASME B30.5 frequent (documented monthly) / periodic & annual, B30.9 rigging periodic, NFPA 10 monthly extinguisher. */
export const INSPECTION_DAYS: Record<string, number> = { 'Crane Frequent': 30, 'Crane Annual': 365, 'Rigging': 365, 'Fire Extinguisher': 30, 'Trailer': 365, 'Manlift': 365, 'Forklift': 365 }
export const inspectionDays = (kind: string) => INSPECTION_DAYS[kind] ?? 90
