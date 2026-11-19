import { ForeignReporting, NotIndianListing, NothingFound } from "./yahoo-client";

/**
 * What to tell a person, and which HTTP status to use, when Yahoo could not give a company's figures. `permanent` is
 * true when asking again will not help (the company reports in dollars, is not Indian, or Yahoo has nothing), false
 * when Yahoo just did not respond.
 */
export function describeYahooError(e: unknown): { status: number; message: string; permanent: boolean } {
  if (e instanceof ForeignReporting) return { status: 422, message: "This company reports its accounts in a foreign currency, so its amounts cannot be shown in rupees yet.", permanent: true };
  if (e instanceof NotIndianListing) return { status: 422, message: "Only companies listed on NSE or BSE (priced in rupees) can be previewed.", permanent: true };
  if (e instanceof NothingFound) return { status: 404, message: "Yahoo Finance has no data for that ticker.", permanent: true };
  return { status: 502, message: "Yahoo Finance did not respond. Try again in a moment.", permanent: false };
}
