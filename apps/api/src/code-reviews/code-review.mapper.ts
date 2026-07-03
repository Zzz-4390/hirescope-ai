type ReviewRow = { id: string; status: string; summary: string | null; score: number | null; model: string | null; failureCode: string | null; failureMessage: string | null; createdAt: Date; completedAt: Date | null };

export function mapCodeReview(review: ReviewRow) {
  const { failureCode, failureMessage, ...fields } = review;
  return { ...fields, failure: failureCode ? { code: failureCode, message: failureMessage } : null };
}
